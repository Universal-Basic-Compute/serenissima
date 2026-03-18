"""
Init command for mind CLI.

Initializes the mind in a project directory by:
- Copying protocol files to .mind/
- Creating/updating .mind/CLAUDE.md with inlined content (standalone)
- Creating/updating root CLAUDE.md with @ references (Claude expands these)
- Creating/updating root AGENTS.md with protocol bootstrap (inlined content)
- Ingesting repo files and capabilities into the graph
"""
# DOCS: docs/cli/core/PATTERNS_Why_CLI_Over_Copy.md

import shutil
import os
import re
import stat
import json
import yaml
import logging
from pathlib import Path
from typing import List, Dict, Any

from .core_utils import get_templates_path
from .repo_overview import generate_and_save

logger = logging.getLogger(__name__)


def _get_mind_root() -> Path:
    """Get the root directory of the mind installation.

    Returns the directory containing tools/mcp/membrane_server.py.
    """
    # In development: mind/mind/init_cmd.py -> mind/
    mind_root = Path(__file__).parent.parent
    if (mind_root / "tools" / "mcp" / "membrane_server.py").exists():
        return mind_root

    # Fallback: try to find via templates path
    try:
        templates = get_templates_path()
        # templates is mind/templates/, so parent is mind/
        if (templates.parent / "tools" / "mcp" / "membrane_server.py").exists():
            return templates.parent
    except FileNotFoundError:
        pass

    raise FileNotFoundError("Could not find mind installation with membrane_server.py")


def _configure_mcp_membrane(target_dir: Path) -> None:
    """Configure membrane MCP server using claude mcp commands."""
    try:
        mind_root = _get_mind_root()
    except FileNotFoundError as e:
        print(f"  ○ MCP config skipped: {e}")
        return

    membrane_script = mind_root / "tools" / "mcp" / "membrane_server.py"

    import subprocess

    # Remove existing membrane server (ignore errors if not found)
    try:
        subprocess.run(
            ["claude", "mcp", "remove", "membrane"],
            capture_output=True,
            cwd=target_dir,
            timeout=10
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass  # claude CLI not available or timed out

    # Add membrane server with correct path
    try:
        result = subprocess.run(
            ["claude", "mcp", "add", "membrane", "--", "python3", str(membrane_script)],
            capture_output=True,
            text=True,
            cwd=target_dir,
            timeout=10
        )
        if result.returncode == 0:
            print(f"✓ Configured MCP: membrane -> {membrane_script}")
        else:
            # Fallback to .mcp.json if claude CLI fails
            print(f"  ○ claude mcp add failed, using .mcp.json fallback")
            _generate_mcp_config_file(target_dir, mind_root)
    except FileNotFoundError:
        # claude CLI not installed, use .mcp.json fallback
        print(f"  ○ claude CLI not found, using .mcp.json fallback")
        _generate_mcp_config_file(target_dir, mind_root)
    except subprocess.TimeoutExpired:
        print(f"  ○ claude mcp timed out, using .mcp.json fallback")
        _generate_mcp_config_file(target_dir, mind_root)


def _generate_mcp_config_file(target_dir: Path, mind_root: Path) -> None:
    """Fallback: generate .mcp.json file directly."""
    mcp_json = target_dir / ".mcp.json"

    config = {
        "mcpServers": {
            "membrane": {
                "command": "python3",
                "args": [str(mind_root / "tools" / "mcp" / "membrane_server.py")],
            }
        }
    }

    # Merge with existing config if present
    if mcp_json.exists():
        try:
            existing = json.loads(mcp_json.read_text())
            if "mcpServers" not in existing:
                existing["mcpServers"] = {}
            existing["mcpServers"]["membrane"] = config["mcpServers"]["membrane"]
            config = existing
        except json.JSONDecodeError:
            pass  # Overwrite invalid JSON

    mcp_json.write_text(json.dumps(config, indent=2) + "\n")
    print(f"✓ Created: {mcp_json}")


def _escape_marker_tokens(content: str) -> str:
    """Escape special markers so generated prompts don't trigger scanners."""
    replacements = {
        "@mind:doctor:escalation": "@mind&#58;doctor&#58;escalation",
        "@mind:escalation": "@mind&#58;escalation",
        "@mind:doctor:proposition": "@mind&#58;doctor&#58;proposition",
        "@mind:proposition": "@mind&#58;proposition",
        "@mind:doctor:todo": "@mind&#58;doctor&#58;todo",
        "@mind:todo": "@mind&#58;todo",
    }
    for source, target in replacements.items():
        content = content.replace(source, target)
    return content


def _copy_skills(skills_src: Path, target_dir: Path) -> None:
    if not skills_src.exists():
        return
    target_dir.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copytree(skills_src, target_dir, dirs_exist_ok=True)
        print(f"✓ Updated: {target_dir}")
    except PermissionError:
        print(f"  ○ Skipped (permission): {target_dir}")


def _update_or_add_section(file_path: Path, section_content: str, section_marker: str = "# mind") -> None:
    """Update or add a section to a file.

    If file exists and has the section marker, replaces that section.
    If file exists but doesn't have the section, appends it.
    If file doesn't exist, creates it with the section.

    Args:
        file_path: Path to the file to update
        section_content: The content to add/replace
        section_marker: The heading that marks the start of our section (e.g., "# mind")
    """
    if file_path.exists():
        content = file_path.read_text()

        # Find and replace the section
        # Look for section marker and replace until next "# " heading or end
        pattern = rf'(^{re.escape(section_marker)}\n).*?(?=^# |\Z)'

        if re.search(pattern, content, re.MULTILINE | re.DOTALL):
            # Replace existing section
            new_content = re.sub(pattern, section_content + '\n', content, flags=re.MULTILINE | re.DOTALL)
            file_path.write_text(new_content)
            print(f"✓ Updated {section_marker} section in: {file_path}")
        else:
            # Append section
            new_content = content.rstrip() + '\n\n' + section_content
            file_path.write_text(new_content)
            print(f"✓ Added {section_marker} section to: {file_path}")
    else:
        # Create new file with section
        file_path.write_text(section_content)
        print(f"✓ Created: {file_path}")


def _update_root_claude_md(target_dir: Path) -> None:
    """Update or create root CLAUDE.md with mind section using @ references."""
    root_claude = target_dir / "CLAUDE.md"
    mind_section = _build_root_claude_section()
    _update_or_add_section(root_claude, mind_section, "# mind")


def _build_root_claude_section() -> str:
    """Build mind section for root CLAUDE.md using @ references.

    Root CLAUDE.md uses @ references which Claude expands automatically.
    This is preferred over inlined content for the root file.
    """
    return """# mind

@.mind/PRINCIPLES.md

---

@.mind/FRAMEWORK.md

---

## Before Any Task

Check project state:
```
.mind/state/SYNC_Project_State.md
```

What's happening? What changed recently? Any handoffs for you?

## Choose Your VIEW

Based on your task, load ONE view from `.mind/views/`:

| Task | VIEW |
|------|------|
| Processing raw data (chats, PDFs) | VIEW_Ingest_Process_Raw_Data_Sources.md |
| Getting oriented | VIEW_Onboard_Understand_Existing_Codebase.md |
| Analyzing structure | VIEW_Analyze_Structural_Analysis.md |
| Defining architecture | VIEW_Specify_Design_Vision_And_Architecture.md |
| Writing/modifying code | VIEW_Implement_Write_Or_Modify_Code.md |
| Adding features | VIEW_Extend_Add_Features_To_Existing.md |
| Pair programming | VIEW_Collaborate_Pair_Program_With_Human.md |
| Health checks | VIEW_Health_Define_Health_Checks_And_Verify.md |
| Debugging | VIEW_Debug_Investigate_And_Fix_Issues.md |
| Reviewing changes | VIEW_Review_Evaluate_Changes.md |
| Refactoring | VIEW_Refactor_Improve_Code_Structure.md |

## After Any Change

Update `.mind/state/SYNC_Project_State.md` with what you did.
If you changed a module, update its `docs/{area}/{module}/SYNC_*.md` too.
"""


def _build_system_prompt(templates_path: Path, model: str = "claude") -> str:
    """Build system prompt from SYSTEM.md + model-specific additions.

    Args:
        templates_path: Path to templates directory
        model: "claude", "gemini", or "codex"

    Returns:
        Combined system prompt content
    """
    # Base system prompt
    system_path = templates_path / "mcp" / "SYSTEM.md"
    system_content = system_path.read_text() if system_path.exists() else ""

    # Model-specific addition
    addition_map = {
        "claude": "CLAUDE_SYSTEM_ADDITION.md",
        "gemini": "GEMINI_SYSTEM_ADDITION.md",
        "codex": "CODEX_SYSTEM_ADDITION.md",
    }
    addition_file = addition_map.get(model, "")
    addition_path = templates_path / "mcp" / addition_file
    addition_content = addition_path.read_text() if addition_file and addition_path.exists() else ""

    # Combine
    if addition_content:
        combined = f"{system_content}\n\n---\n\n{addition_content}"
    else:
        combined = system_content

    return _escape_marker_tokens(combined)


def _build_claude_addition(templates_path: Path) -> str:
    """Build CLAUDE.md content from SYSTEM.md + Claude-specific additions."""
    return _build_system_prompt(templates_path, "claude")


def _build_gemini_addition(templates_path: Path) -> str:
    """Build GEMINI.md content from SYSTEM.md + Gemini-specific additions."""
    return _build_system_prompt(templates_path, "gemini")


def _build_agents_addition(templates_path: Path) -> str:
    """Build AGENTS.md content from SYSTEM.md + Codex-specific additions."""
    return _build_system_prompt(templates_path, "codex")


def _build_manager_agents_addition(templates_path: Path) -> str:
    """Build manager AGENTS.md content from manager CLAUDE.md plus Codex guidance."""
    manager_claude_path = templates_path / "agents" / "manager" / "CLAUDE.md"
    manager_content = manager_claude_path.read_text() if manager_claude_path.exists() else ""
    codex_addition_path = templates_path / "mcp" / "CODEX_SYSTEM_ADDITION.md"
    codex_addition = codex_addition_path.read_text() if codex_addition_path.exists() else ""
    if codex_addition:
        return f"{manager_content}\n\n{codex_addition}"
    return manager_content


def _remove_write_permissions(path: Path) -> None:
    """Strip write bits so files/directories become read-only."""
    if not path.exists():
        return
    try:
        current_mode = path.stat().st_mode
        readonly_mode = current_mode & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH)
        path.chmod(readonly_mode)
        print(f"  ✓ Read-only: {path}")
    except PermissionError:
        print(f"  ○ Skipped (permission): {path}")


def _enforce_readonly_for_views(views_root: Path) -> None:
    """Set view documents read-only unless they are learning artifacts."""
    if not views_root.exists():
        return
    for view_file in views_root.rglob("*.md"):
        if "LEARNING" in view_file.name.upper():
            continue
        _remove_write_permissions(view_file)


def _enforce_readonly_for_templates(templates_root: Path) -> None:
    """Set template tree to read-only so inlined source docs stay stable."""
    if not templates_root.exists():
        return
    for child in templates_root.rglob("*"):
        _remove_write_permissions(child)


# =============================================================================
# GRAPH INITIALIZATION
# =============================================================================

def _init_graph(target_dir: Path, clear: bool = False, behaviors: dict = None) -> bool:
    """
    Initialize graph named after repo and ingest content.

    Respects behavior flags from database_config.yaml:
    - doc_ingest: ingest docs/ files
    - mind_ingest: ingest .mind/ files

    Args:
        target_dir: Project directory
        clear: If True, delete all nodes/links before ingestion
        behaviors: Dict of behavior flags (default: all True)

    Returns:
        True if successful, False if graph connection failed
    """
    if behaviors is None:
        behaviors = {}

    repo_name = target_dir.name

    print()
    print(f"Initializing graph: {repo_name}")

    try:
        from runtime.physics.graph.graph_ops import GraphOps
    except ImportError as e:
        print(f"  ○ Graph init skipped (engine not available): {e}")
        return False

    try:
        graph_ops = GraphOps(graph_name=repo_name)
        print(f"  ✓ Connected to graph: {repo_name}")
    except Exception as e:
        print(f"  ○ Graph connection failed: {e}")
        print("    To enable graph features, start FalkorDB:")
        print("      docker run -p 6379:6379 falkordb/falkordb")
        return False

    # Clear graph if requested
    if clear:
        try:
            graph_ops._query("MATCH (n) DETACH DELETE n")
            print(f"  ✓ Cleared all nodes and links")
        except Exception as e:
            print(f"  ✗ Failed to clear graph: {e}")

    # Ingest docs/*.md files into graph
    if behaviors.get("doc_ingest", True):
        try:
            from .ingest.docs import ingest_docs_to_graph
            print("  Ingesting docs/*.md files...")
            doc_stats = ingest_docs_to_graph(target_dir, graph_ops)
            print(f"  ✓ Docs ingested: {doc_stats['docs_ingested']} docs, {doc_stats['spaces_created']} spaces")
        except Exception as e:
            print(f"  ○ Doc ingestion failed: {e}")
    else:
        print("  ○ Doc ingestion: disabled")

    # Ingest .mind/ files into graph (except runtime/)
    if behaviors.get("mind_ingest", True):
        try:
            from .ingest.docs import ingest_mind_to_graph
            print("  Ingesting .mind/ files...")
            mind_stats = ingest_mind_to_graph(target_dir, graph_ops)
            print(f"  ✓ Mind ingested: {mind_stats['files_ingested']} files, {mind_stats['spaces_created']} spaces")
        except Exception as e:
            print(f"  ○ Mind ingestion failed: {e}")
    else:
        print("  ○ Mind ingestion: disabled")

    return True


def init_protocol(target_dir: Path, force: bool = False, clear_graph: bool = False) -> bool:
    """
    Initialize the mind in a project directory.

    Copies protocol files and updates .mind/CLAUDE.md and root AGENTS.md with inlined content.

    Args:
        target_dir: The project directory to initialize
        force: If True, overwrite existing .mind/
        clear_graph: If True, clear existing graph data before injection
    Returns:
        True if successful, False otherwise
    """
    try:
        templates_path = get_templates_path()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return False

    # Source paths (templates/ is the root, no nested /mind/)
    protocol_source = templates_path
    modules_yaml_source = templates_path / "modules.yaml"
    ignore_source = templates_path / "mindignore"
    capabilities_source = templates_path.parent / "capabilities"  # mind-platform/capabilities/

    # Destination paths
    protocol_dest = target_dir / ".mind"
    modules_yaml_dest = target_dir / "modules.yaml"
    ignore_dest = target_dir / ".mindignore"
    capabilities_dest = protocol_dest / "capabilities"  # .mind/capabilities/

    claude_md = protocol_dest / "CLAUDE.md"
    agents_md = target_dir / "AGENTS.md"
    manager_agents_md = protocol_dest / "agents" / "manager" / "AGENTS.md"

    # Check if already initialized
    if protocol_dest.exists() and not force:
        print(f"Error: {protocol_dest} already exists.")
        print("Use --force to overwrite.")
        return False

    # Load behavior flags from database_config.yaml (all default to True)
    _behaviors = {
        "file_ingest": True,
        "doc_ingest": True,
        "mind_ingest": True,
        "overview": True,
        "embeddings": True,
        "health_checks": True,
        "capabilities_graph": True,
        "citizen_seed": True,
        "mcp_config": True,
    }
    db_config_path = protocol_dest / "database_config.yaml"
    if db_config_path.exists():
        try:
            import yaml
            with open(db_config_path) as f:
                _cfg = yaml.safe_load(f) or {}
            for k, v in _cfg.get("behaviors", {}).items():
                if k in _behaviors:
                    _behaviors[k] = bool(v)
            disabled = [k for k, v in _behaviors.items() if not v]
            if disabled:
                print(f"  Behaviors disabled: {', '.join(disabled)}")
        except Exception:
            pass

    # Note: VIEWs are deprecated - replaced by agents, skills, and protocols

    # Copy protocol files
    def copy_protocol_partial(src: Path, dst: Path) -> None:
        for root, dirs, files in os.walk(src):
            rel = Path(root).relative_to(src)
            target_root = dst / rel
            target_root.mkdir(parents=True, exist_ok=True)
            for dirname in dirs:
                (target_root / dirname).mkdir(parents=True, exist_ok=True)
            for filename in files:
                src_path = Path(root) / filename
                dst_path = target_root / filename
                try:
                    shutil.copy2(src_path, dst_path)
                except PermissionError:
                    print(f"  ○ Skipped (permission): {dst_path}")

    if protocol_dest.exists():
        try:
            shutil.rmtree(protocol_dest)
            shutil.copytree(protocol_source, protocol_dest)
            print(f"✓ Created: {protocol_dest}/")
        except PermissionError:
            print(f"  ○ Permission denied removing {protocol_dest}, attempting partial refresh")
            copy_protocol_partial(protocol_source, protocol_dest)
    else:
        shutil.copytree(protocol_source, protocol_dest)
        print(f"✓ Created: {protocol_dest}/")

    # Remove doctor-ignore after copy (we want a clean, read-only protocol install)
    doctor_ignore = protocol_dest / "doctor-ignore.yaml"
    if doctor_ignore.exists():
        try:
            doctor_ignore.unlink()
            print(f"○ Removed: {doctor_ignore}")
        except PermissionError:
            print(f"  ○ Skipped (permission): {doctor_ignore}")

    # Copy capabilities from mind-platform/capabilities/ to .mind/capabilities/
    if capabilities_source.exists():
        try:
            if capabilities_dest.exists():
                shutil.rmtree(capabilities_dest)
            shutil.copytree(capabilities_source, capabilities_dest)
            cap_count = len(list(capabilities_dest.iterdir()))
            print(f"✓ Created: {capabilities_dest}/ ({cap_count} capabilities)")
        except PermissionError:
            print(f"  ○ Skipped (permission): {capabilities_dest}")
    else:
        print(f"○ Capabilities not found: {capabilities_source}")

    # Schema comes from templates (protocol-level, FIXED).
    # The authoritative source is mind-mcp/docs/schema/schema.yaml,
    # distributed via templates/schema.yaml. Projects never override it.
    schema_dest = protocol_dest / "schema.yaml"
    if schema_dest.exists():
        print(f"✓ Schema: {schema_dest} (from templates)")
    else:
        print(f"○ Schema not found in templates")

    # Copy modules.yaml to project root (if not exists or force)
    if not modules_yaml_dest.exists() or force:
        if modules_yaml_source.exists():
            try:
                shutil.copy2(modules_yaml_source, modules_yaml_dest)
                print(f"✓ Created: {modules_yaml_dest}")
            except PermissionError:
                print(f"  ○ Skipped (permission): {modules_yaml_dest}")
    else:
        print(f"○ {modules_yaml_dest} already exists")

    # Copy .mindignore to project root (if not exists or force)
    if not ignore_dest.exists() or force:
        if ignore_source.exists():
            try:
                shutil.copy2(ignore_source, ignore_dest)
                print(f"✓ Created: {ignore_dest}")
            except PermissionError:
                print(f"  ○ Skipped (permission): {ignore_dest}")
    else:
        print(f"○ {ignore_dest} already exists")

    # Create docs/ directory structure with TAXONOMY.md and MAPPING.md
    docs_dir = target_dir / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    taxonomy_template = templates_path / "docs" / "TAXONOMY_TEMPLATE.md"
    mapping_template = templates_path / "docs" / "MAPPING_TEMPLATE.md"
    taxonomy_dest = docs_dir / "TAXONOMY.md"
    mapping_dest = docs_dir / "MAPPING.md"

    if not taxonomy_dest.exists() or force:
        if taxonomy_template.exists():
            try:
                shutil.copy2(taxonomy_template, taxonomy_dest)
                print(f"✓ Created: {taxonomy_dest}")
            except PermissionError:
                print(f"  ○ Skipped (permission): {taxonomy_dest}")
    else:
        print(f"○ {taxonomy_dest} already exists")

    if not mapping_dest.exists() or force:
        if mapping_template.exists():
            try:
                shutil.copy2(mapping_template, mapping_dest)
                print(f"✓ Created: {mapping_dest}")
            except PermissionError:
                print(f"  ○ Skipped (permission): {mapping_dest}")
    else:
        print(f"○ {mapping_dest} already exists")

    # Copy skills into .claude/skills and Codex skills directory
    skills_src = protocol_dest / "skills"
    claude_skills_dest = target_dir / ".claude" / "skills"
    codex_home = Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser()
    codex_skills_dest = codex_home / "skills"
    _copy_skills(skills_src, claude_skills_dest)
    _copy_skills(skills_src, codex_skills_dest)

    # Add agent working directories to .gitignore
    gitignore_path = target_dir / ".gitignore"
    mind_gitignore_entries = [
        "# mind agent working directories",
        ".mind/work/",
        ".mind/traces/",
        ".mcp.json",  # Machine-specific MCP config
    ]
    try:
        existing = gitignore_path.read_text() if gitignore_path.exists() else ""
        missing_entries = [e for e in mind_gitignore_entries if e not in existing]
        if missing_entries:
            with open(gitignore_path, "a") as f:
                f.write("\n" + "\n".join(missing_entries) + "\n")
            print(f"✓ Updated: {gitignore_path}")
    except PermissionError:
        print(f"  ○ Skipped (permission): {gitignore_path}")

    # Build system prompt content from SYSTEM.md + model-specific additions
    claude_content = _build_claude_addition(templates_path)
    gemini_content = _build_gemini_addition(templates_path)
    agents_content = _build_agents_addition(templates_path)
    manager_agents_content = _build_manager_agents_addition(templates_path)

    # Update .mind/CLAUDE.md (replace # mind section if exists, otherwise append)
    try:
        _update_or_add_section(claude_md, claude_content, "# mind")
    except PermissionError:
        print(f"  ○ Skipped (permission): {claude_md}")

    # Update root CLAUDE.md with mind section (using @ references)
    try:
        _update_root_claude_md(target_dir)
    except PermissionError:
        print(f"  ○ Skipped (permission): {target_dir / 'CLAUDE.md'}")

    # Update .mind/GEMINI.md
    gemini_md = protocol_dest / "GEMINI.md"
    try:
        _update_or_add_section(gemini_md, gemini_content, "# mind")
    except PermissionError:
        print(f"  ○ Skipped (permission): {gemini_md}")

    # Update root AGENTS.md (for Codex)
    try:
        _update_or_add_section(agents_md, agents_content, "# mind")
    except PermissionError:
        print(f"  ○ Skipped (permission): {agents_md}")

    # Update manager agent's AGENTS.md
    if manager_agents_content:
        try:
            manager_agents_md.parent.mkdir(parents=True, exist_ok=True)
            _update_or_add_section(manager_agents_md, manager_agents_content, "# mind")
        except PermissionError:
            print(f"  ○ Skipped (permission): {manager_agents_md}")

    # Generate repository map
    if _behaviors["overview"]:
        print()
        print("Generating repository map...")
        try:
            output_path = generate_and_save(target_dir, output_format="md")
            print(f"✓ Created: {output_path}")
        except Exception as e:
            print(f"○ Map generation skipped: {e}")
    else:
        print("○ Overview: disabled")

    # Enforce read-only permissions for core protocol artifacts
    read_only_targets = [
        protocol_dest / "GEMINI.md",
        protocol_dest / "PRINCIPLES.md",
        protocol_dest / "PROTOCOL.md",
        protocol_dest / "schema.yaml",
        protocol_dest / "nature.yaml",
        claude_md,
    ]
    for ro_path in read_only_targets:
        _remove_write_permissions(ro_path)
    _enforce_readonly_for_templates(protocol_dest / "templates")

    # Initialize graph and ingest content (respects doc_ingest + mind_ingest flags)
    if _behaviors["doc_ingest"] or _behaviors["mind_ingest"]:
        _init_graph(target_dir, clear=clear_graph, behaviors=_behaviors)
    else:
        print("○ Graph ingestion: disabled (doc_ingest + mind_ingest both off)")

    # Configure MCP membrane server
    if _behaviors["mcp_config"]:
        _configure_mcp_membrane(target_dir)
    else:
        print("○ MCP config: disabled")

    print()
    print("mind initialized!")
    print()
    print("Next steps:")
    print("  1. Read .mind/PROTOCOL.md")
    print("  2. Update .mind/state/SYNC_Project_State.md")
    print("  3. Choose an agent name and use protocols for your task")
    print()
    print("To bootstrap an LLM, run:")
    print(f"  mind prompt --dir {target_dir}")

    return True
