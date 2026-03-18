"""
Doc ingestion for the mind graph.

Scans modules and ingests doc chain files as Narrative nodes.
Creates tasks for missing or malformed docs.

Doc chain order:
  OBJECTIVES → PATTERNS → BEHAVIORS → VOCABULARY → ALGORITHM → VALIDATION → IMPLEMENTATION → HEALTH

Logic per doc:
- Doc exists + respects template → Create narrative:{subtype} with content
- Doc exists + doesn't respect template → Create narrative:{subtype} + task:fix_template
- Doc missing → Create stub narrative:{subtype} + task:create_doc

DOCS: docs/ingest/PATTERNS_Doc_Ingestion.md
"""

import logging
import re
from pathlib import Path
from typing import Dict, Any, Set, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Doc chain order (canonical sequence)
DOC_CHAIN_ORDER = [
    "OBJECTIVES",
    "PATTERNS",
    "BEHAVIORS",
    "VOCABULARY",
    "ALGORITHM",
    "VALIDATION",
    "IMPLEMENTATION",
    "HEALTH",
]

# Prefix to subtype mapping
PREFIX_TO_SUBTYPE = {
    "OBJECTIVES": "objective",
    "PATTERNS": "pattern",
    "BEHAVIORS": "behavior",
    "VOCABULARY": "vocabulary",
    "ALGORITHM": "algorithm",
    "VALIDATION": "validation",
    "IMPLEMENTATION": "implementation",
    "HEALTH": "health",
    "SYNC": "sync",
    "TAXONOMY": "taxonomy",
    "MAPPING": "mapping",
    "CONCEPT": "concept",
    "TOUCHES": "touches",
}

# Cache for dynamically loaded required sections
_REQUIRED_SECTIONS_CACHE: Dict[str, List[str]] = {}


def _load_required_sections(target_dir: Path) -> Dict[str, List[str]]:
    """
    Dynamically load required sections from templates.

    Reads .mind/templates/{PREFIX}_TEMPLATE.md files and extracts ## headings.
    """
    global _REQUIRED_SECTIONS_CACHE

    if _REQUIRED_SECTIONS_CACHE:
        return _REQUIRED_SECTIONS_CACHE

    templates_dir = target_dir / ".mind" / "templates"
    if not templates_dir.exists():
        templates_dir = target_dir / ".mind" / "docs"

    if not templates_dir.exists():
        raise FileNotFoundError(
            f"Templates directory not found at {target_dir / '.mind' / 'templates'} "
            f"or {target_dir / '.mind' / 'docs'}. Cannot validate docs without templates."
        )

    for doc_type in DOC_CHAIN_ORDER:
        template_file = templates_dir / f"{doc_type}_TEMPLATE.md"
        if not template_file.exists():
            continue

        try:
            content = template_file.read_text(encoding='utf-8', errors='ignore')
            # Extract all ## headings
            sections = re.findall(r'^(## [A-Z][A-Z0-9 _/]+)', content, re.MULTILINE)
            if sections:
                _REQUIRED_SECTIONS_CACHE[doc_type] = sections
        except Exception as e:
            logger.warning(f"Error reading template {template_file}: {e}")

    return _REQUIRED_SECTIONS_CACHE


def _validate_doc_template(content: str, doc_type: str, target_dir: Path) -> Tuple[bool, List[str]]:
    """
    Check if doc content respects the template for its type.

    Args:
        content: Doc content to validate
        doc_type: Doc type (OBJECTIVES, PATTERNS, etc.)
        target_dir: Project root (for loading templates)

    Returns:
        (is_valid, missing_sections)
    """
    required_sections = _load_required_sections(target_dir)
    required = required_sections.get(doc_type, [])

    if not required:
        return True, []

    missing = []
    for section in required:
        if section not in content:
            missing.append(section)

    return len(missing) == 0, missing


def _find_modules(docs_dir: Path) -> List[Tuple[str, Path, Optional[str]]]:
    """
    Find all modules in docs directory.

    Returns list of (module_name, module_path, area_name or None)
    """
    modules = []

    for item in docs_dir.iterdir():
        if not item.is_dir():
            continue
        if item.name.startswith('.'):
            continue

        # Check if it's a module (has doc chain files) or an area (has subdirs)
        has_doc_chain = any(
            (item / f"{prefix}_{item.name}.md").exists() or
            (item / f"{prefix}.md").exists()
            for prefix in DOC_CHAIN_ORDER[:3]  # Check first 3
        )

        if has_doc_chain:
            # Direct module under docs/
            modules.append((item.name, item, None))
        else:
            # Could be an area with modules inside
            for subitem in item.iterdir():
                if subitem.is_dir() and not subitem.name.startswith('.'):
                    modules.append((subitem.name, subitem, item.name))

    return modules


def _escape_content(content: str) -> str:
    """Escape content for Cypher query."""
    return content.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


def _get_synthesis(content: str, filename: str) -> str:
    """Extract synthesis from content (title or first heading)."""
    lines = content.split('\n')
    for line in lines[:5]:
        if line.startswith('# '):
            return line[2:].strip()[:500]
    return filename


def _parse_impl_references(content: str) -> List[str]:
    """
    Parse IMPL: references from doc content.

    IMPL: path/to/file.py means the code file implements this doc.
    Link direction: Code --[implements]--> Doc

    Returns:
        List of code file paths
    """
    refs = []
    impl_pattern = re.compile(r'IMPL:\s*([^\s\n]+)')

    for match in impl_pattern.finditer(content):
        path = match.group(1).strip()
        if path and not path.startswith('('):
            refs.append(path)

    return refs


def _parse_doc_references(content: str) -> List[str]:
    """
    Parse markdown links to other docs.

    [text](path/to/doc.md) or [text](../OTHER_Doc.md)
    Link direction: Doc --[references]--> Doc

    Returns:
        List of doc file paths (only .md files)
    """
    refs = []
    # Match markdown links: [text](path)
    link_pattern = re.compile(r'\[([^\]]+)\]\(([^)]+\.md)\)')

    for match in link_pattern.finditer(content):
        path = match.group(2).strip()
        # Skip external URLs
        if path.startswith('http://') or path.startswith('https://'):
            continue
        # Skip anchors only
        if path.startswith('#'):
            continue
        # Remove anchor from path
        if '#' in path:
            path = path.split('#')[0]
        if path:
            refs.append(path)

    return refs


def ingest_docs_to_graph(target_dir: Path, graph_ops) -> Dict[str, int]:
    """
    Ingest docs into graph with doc chain validation.

    For each module:
    1. Check for each doc in chain (OBJECTIVES → ... → HEALTH)
    2. If doc exists + valid → Create narrative:{subtype}
    3. If doc exists + invalid → Create narrative:{subtype} + task:fix_template
    4. If doc missing → Create stub narrative:{subtype} + task:create_doc

    Args:
        target_dir: Project directory
        graph_ops: GraphOps instance

    Returns:
        Stats dict
    """
    docs_dir = target_dir / "docs"
    if not docs_dir.exists():
        return {"docs_ingested": 0, "tasks_created": 0, "errors": 0}

    stats = {
        "docs_ingested": 0,
        "tasks_created": 0,
        "spaces_created": 0,
        "links_created": 0,
        "errors": 0,
    }
    created_spaces: Set[str] = set()

    def ensure_space(space_id: str, name: str, space_type: str, parent_id: str = None):
        """Create space if not exists and link to parent."""
        if space_id in created_spaces:
            return
        created_spaces.add(space_id)

        graph_ops._query(
            """
            MERGE (s:Space {id: $id})
            SET s.node_type = 'space',
                s.type = $type,
                s.name = $name,
                s.synthesis = $synthesis
            """,
            {
                "id": space_id,
                "type": space_type,
                "name": name,
                "synthesis": f"{space_type}: {name}",
            }
        )
        stats["spaces_created"] += 1

        if parent_id:
            graph_ops._query(
                """
                MATCH (p:Space {id: $parent_id})
                MATCH (c:Space {id: $child_id})
                MERGE (p)-[r:LINK]->(c)
                SET r.verb = 'contains', r.hierarchy = -0.7
                """,
                {"parent_id": parent_id, "child_id": space_id}
            )
            stats["links_created"] += 1

    def create_task(task_type: str, doc_id: str, module_name: str, doc_type: str, details: str = ""):
        """Create a task node linked to the doc."""
        task_id = f"task:{task_type}:{doc_id}"
        synthesis = f"{task_type}: {doc_type} for {module_name}"
        if details:
            synthesis += f" ({details})"

        graph_ops._query(
            """
            MERGE (t:Narrative {id: $id})
            SET t.node_type = 'narrative',
                t.type = 'task',
                t.task_type = $task_type,
                t.synthesis = $synthesis,
                t.status = 'pending'
            """,
            {"id": task_id, "task_type": task_type, "synthesis": synthesis}
        )

        # Link task to doc
        graph_ops._query(
            """
            MATCH (t:Narrative {id: $task_id})
            MATCH (d:Narrative {id: $doc_id})
            MERGE (t)-[r:LINK]->(d)
            SET r.verb = 'targets', r.hierarchy = 0
            """,
            {"task_id": task_id, "doc_id": doc_id}
        )
        stats["tasks_created"] += 1

    def create_doc_node(doc_id: str, subtype: str, name: str,
                        content: str):
        """Create narrative node for doc."""
        synthesis = _get_synthesis(content, name) if content else name
        escaped = _escape_content(content) if content else ""

        graph_ops._query(
            """
            MERGE (n:Narrative {id: $id})
            SET n.node_type = 'narrative',
                n.type = $subtype,
                n.name = $name,
                n.synthesis = $synthesis,
                n.content = $content,
                n.granularity = 1
            """,
            {
                "id": doc_id,
                "subtype": subtype,
                "name": name,
                "synthesis": synthesis,
                "content": escaped,
            }
        )

        stats["docs_ingested"] += 1

    def create_impl_links(doc_id: str, content: str, doc_path: Path):
        """Create IMPLEMENTS links from code files to this doc."""
        impl_paths = _parse_impl_references(content)
        doc_dir = doc_path.parent if doc_path.exists() else target_dir

        for ref_path in impl_paths:
            # Resolve relative paths
            if ref_path.startswith('./') or ref_path.startswith('../'):
                resolved = (doc_dir / ref_path).resolve()
                try:
                    ref_path = str(resolved.relative_to(target_dir))
                except ValueError:
                    continue  # Outside project

            # Code file implements doc: Thing --[implements]--> Narrative
            code_id = f"thing:{ref_path}"

            try:
                graph_ops._query(
                    """
                    MERGE (code:Thing {id: $code_id})
                    ON CREATE SET code.node_type = 'thing', code.name = $code_name
                    WITH code
                    MATCH (doc:Narrative {id: $doc_id})
                    MERGE (code)-[r:LINK]->(doc)
                    SET r.verb = 'implements', r.hierarchy = 0.6, r.polarity = [0.85, 0.15], r.permanence = 0.9
                    """,
                    {"code_id": code_id, "code_name": Path(ref_path).name, "doc_id": doc_id}
                )
                stats["links_created"] += 1
            except Exception:
                pass  # Skip on error

    def create_doc_reference_links(doc_id: str, content: str, doc_path: Path):
        """Create REFERENCES links to other docs this doc links to."""
        ref_paths = _parse_doc_references(content)
        doc_dir = doc_path.parent if doc_path.exists() else target_dir

        for ref_path in ref_paths:
            # Resolve relative paths
            if ref_path.startswith('./') or ref_path.startswith('../'):
                resolved = (doc_dir / ref_path).resolve()
                try:
                    ref_path = str(resolved.relative_to(target_dir))
                except ValueError:
                    continue  # Outside project
            elif not ref_path.startswith('docs/'):
                # Assume relative to doc_dir if not absolute
                resolved = (doc_dir / ref_path).resolve()
                try:
                    ref_path = str(resolved.relative_to(target_dir))
                except ValueError:
                    continue

            # Doc references another doc: Narrative --[references]--> Narrative
            target_doc_id = f"narrative:{ref_path}"

            try:
                graph_ops._query(
                    """
                    MATCH (src:Narrative {id: $src_id})
                    MERGE (target:Narrative {id: $target_id})
                    ON CREATE SET target.node_type = 'narrative', target.name = $target_name
                    MERGE (src)-[r:LINK]->(target)
                    SET r.verb = 'references', r.hierarchy = 0.0, r.polarity = [0.7, 0.3], r.permanence = 0.8
                    """,
                    {"src_id": doc_id, "target_id": target_doc_id, "target_name": Path(ref_path).stem}
                )
                stats["links_created"] += 1
            except Exception:
                pass  # Skip on error

    # Create root docs space
    ensure_space("space:docs", "docs", "root")

    # Find all modules
    modules = _find_modules(docs_dir)

    for module_name, module_path, area_name in modules:
        try:
            # Create space hierarchy
            if area_name:
                area_space_id = f"space:docs/{area_name}"
                module_space_id = f"space:docs/{area_name}/{module_name}"
                ensure_space(area_space_id, area_name, "area", "space:docs")
                ensure_space(module_space_id, module_name, "module", area_space_id)
            else:
                module_space_id = f"space:docs/{module_name}"
                ensure_space(module_space_id, module_name, "module", "space:docs")

            # Process each doc in chain, tracking IDs for IMPLEMENTS links
            chain_doc_ids: List[str] = []

            for doc_type in DOC_CHAIN_ORDER:
                subtype = PREFIX_TO_SUBTYPE[doc_type]

                # Try both naming conventions: PREFIX_Module.md and PREFIX.md
                doc_file = module_path / f"{doc_type}_{module_name}.md"
                if not doc_file.exists():
                    doc_file = module_path / f"{doc_type}.md"

                rel_path = doc_file.relative_to(target_dir) if doc_file.exists() else \
                           module_path.relative_to(target_dir) / f"{doc_type}_{module_name}.md"
                doc_id = f"doc:{rel_path}"
                chain_doc_ids.append(doc_id)

                if doc_file.exists():
                    # Doc exists - read and validate
                    content = doc_file.read_text(encoding='utf-8', errors='ignore')
                    is_valid, missing = _validate_doc_template(content, doc_type, target_dir)

                    # Create doc node
                    create_doc_node(doc_id, subtype, doc_file.stem, content)

                    # Create IMPLEMENTS links for IMPL: references (Code --> Doc)
                    create_impl_links(doc_id, content, doc_file)

                    # Create REFERENCES links for markdown links to other docs
                    create_doc_reference_links(doc_id, content, doc_file)

                    # Link to module space
                    graph_ops._query(
                        """
                        MATCH (s:Space {id: $space_id})
                        MATCH (d:Narrative {id: $doc_id})
                        MERGE (s)-[r:LINK]->(d)
                        SET r.verb = 'contains', r.hierarchy = -0.7
                        """,
                        {"space_id": module_space_id, "doc_id": doc_id}
                    )
                    stats["links_created"] += 1

                    if not is_valid:
                        # Create fix_template task
                        create_task("fix_template", doc_id, module_name, doc_type,
                                   f"missing: {', '.join(missing)}")

                else:
                    # Doc missing - create placeholder and task
                    create_doc_node(doc_id, subtype, f"{doc_type}_{module_name}", "")

                    # Link placeholder to module space
                    graph_ops._query(
                        """
                        MATCH (s:Space {id: $space_id})
                        MATCH (d:Narrative {id: $doc_id})
                        MERGE (s)-[r:LINK]->(d)
                        SET r.verb = 'contains', r.hierarchy = -0.7
                        """,
                        {"space_id": module_space_id, "doc_id": doc_id}
                    )
                    stats["links_created"] += 1

                    # Create create_doc task
                    create_task("create_doc", doc_id, module_name, doc_type)

            # Create IMPLEMENTS links between consecutive docs in chain
            # Direction: lower layer implements higher layer (PATTERNS implements OBJECTIVES)
            for i in range(1, len(chain_doc_ids)):
                impl_id = chain_doc_ids[i]      # e.g., PATTERNS
                target_id = chain_doc_ids[i-1]  # e.g., OBJECTIVES
                graph_ops._query(
                    """
                    MATCH (impl:Narrative {id: $impl_id})
                    MATCH (target:Narrative {id: $target_id})
                    MERGE (impl)-[r:LINK]->(target)
                    SET r.verb = 'implements', r.hierarchy = 0.6, r.polarity = [0.85, 0.15], r.permanence = 0.9
                    """,
                    {"impl_id": impl_id, "target_id": target_id}
                )
                stats["links_created"] += 1

        except Exception as e:
            logger.warning(f"Error processing module {module_name}: {e}")
            stats["errors"] += 1

    # Also ingest root-level docs (TAXONOMY, MAPPING, etc.)
    for md_file in docs_dir.glob("*.md"):
        try:
            rel_path = md_file.relative_to(target_dir)
            doc_id = f"doc:{rel_path}"
            filename = md_file.stem
            subtype = "doc"

            for prefix, st in PREFIX_TO_SUBTYPE.items():
                if filename.startswith(prefix):
                    subtype = st
                    break

            content = md_file.read_text(encoding='utf-8', errors='ignore')
            create_doc_node(doc_id, subtype, filename, content)

            # Link to root docs space
            graph_ops._query(
                """
                MATCH (s:Space {id: $space_id})
                MATCH (d:Narrative {id: $doc_id})
                MERGE (s)-[r:LINK]->(d)
                SET r.verb = 'contains', r.hierarchy = -0.7
                """,
                {"space_id": "space:docs", "doc_id": doc_id}
            )
            stats["links_created"] += 1

        except Exception as e:
            logger.warning(f"Error ingesting root doc {md_file}: {e}")
            stats["errors"] += 1

    return stats


def ingest_mind_to_graph(target_dir: Path, graph_ops) -> Dict[str, int]:
    """
    Ingest .mind/ files into graph (except runtime/).

    Structure:
        space:mind (root)
        └── space:mind/{area}  (actors, procedures, skills, state, templates, docs)
            └── space:mind/actors/{actor_name}  (for actors)
                └── actor --[instance_of]--> narrative:actor (template)

    Args:
        target_dir: Project directory
        graph_ops: GraphOps instance

    Returns:
        Stats dict
    """
    mind_dir = target_dir / ".mind"
    if not mind_dir.exists():
        return {"files_ingested": 0, "spaces_created": 0, "links_created": 0, "errors": 0}

    stats = {
        "files_ingested": 0,
        "spaces_created": 0,
        "links_created": 0,
        "errors": 0,
    }
    created_spaces: set = set()

    # Skip these directories
    SKIP_DIRS = {"runtime", "__pycache__", ".git"}

    def ensure_space(space_id: str, name: str, space_type: str, parent_id: str = None):
        """Create space if not exists and link to parent."""
        if space_id in created_spaces:
            return
        created_spaces.add(space_id)

        graph_ops._query(
            """
            MERGE (s:Space {id: $id})
            SET s.node_type = 'space',
                s.type = $type,
                s.name = $name,
                s.synthesis = $synthesis
            """,
            {
                "id": space_id,
                "type": space_type,
                "name": name,
                "synthesis": f"{space_type}: {name}",
            }
        )
        stats["spaces_created"] += 1

        if parent_id:
            graph_ops._query(
                """
                MATCH (p:Space {id: $parent_id})
                MATCH (c:Space {id: $child_id})
                MERGE (p)-[r:LINK]->(c)
                SET r.verb = 'contains', r.hierarchy = -0.7
                """,
                {"parent_id": parent_id, "child_id": space_id}
            )
            stats["links_created"] += 1

    def get_subtype(filename: str, area: str) -> str:
        """Determine subtype from filename and area."""
        if area == "actors":
            return "actor"
        elif area == "procedures":
            return "procedure"
        elif area == "skills":
            return "skill"
        elif area == "state":
            return "sync"
        elif area in ("templates", "docs"):
            return "template"
        elif filename in ("FRAMEWORK", "PRINCIPLES", "SYSTEM"):
            return "framework"
        elif filename.endswith(".yaml"):
            return "config"
        return "doc"

    def ingest_file(file_path: Path, space_id: str):
        """Ingest a single file as narrative node."""
        try:
            rel_path = file_path.relative_to(target_dir)
            doc_id = f"mind:{rel_path}"
            filename = file_path.stem
            ext = file_path.suffix

            # Determine area from path
            parts = rel_path.parts
            area = parts[1] if len(parts) > 1 else "root"

            subtype = get_subtype(filename, area)
            content = file_path.read_text(encoding='utf-8', errors='ignore')

            # Get synthesis from first heading or filename
            synthesis = filename
            for line in content.split('\n')[:5]:
                if line.startswith('# '):
                    synthesis = line[2:].strip()[:500]
                    break

            escaped_content = content.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')

            graph_ops._query(
                """
                MERGE (n:Narrative {id: $id})
                SET n.node_type = 'narrative',
                    n.type = $subtype,
                    n.name = $name,
                    n.synthesis = $synthesis,
                    n.content = $content,
                    n.granularity = 1
                """,
                {
                    "id": doc_id,
                    "subtype": subtype,
                    "name": filename,
                    "synthesis": synthesis,
                    "content": escaped_content,
                }
            )
            stats["files_ingested"] += 1

            # Link to parent space
            graph_ops._query(
                """
                MATCH (s:Space {id: $space_id})
                MATCH (d:Narrative {id: $doc_id})
                MERGE (s)-[r:LINK]->(d)
                SET r.verb = 'contains', r.hierarchy = -0.7
                """,
                {"space_id": space_id, "doc_id": doc_id}
            )
            stats["links_created"] += 1

        except Exception as e:
            logger.warning(f"Error ingesting mind file {file_path}: {e}")
            stats["errors"] += 1

    # Create root mind space
    ensure_space("space:mind", "mind", "root")

    # Ingest root-level files (.mind/*.md, .mind/*.yaml)
    for file_path in mind_dir.iterdir():
        if file_path.is_file() and file_path.suffix in (".md", ".yaml"):
            ingest_file(file_path, "space:mind")

    # Ingest area directories
    for area_dir in mind_dir.iterdir():
        if not area_dir.is_dir():
            continue
        if area_dir.name in SKIP_DIRS:
            continue

        area_name = area_dir.name
        area_space_id = f"space:mind/{area_name}"
        ensure_space(area_space_id, area_name, "area", "space:mind")

        # Special handling for actors (folder structure: actors/{name}/CLAUDE.md)
        if area_name == "actors":
            for actor_dir in area_dir.iterdir():
                if not actor_dir.is_dir():
                    continue

                actor_name = actor_dir.name.lower()
                actor_id = f"AGENT_{actor_name.capitalize()}"

                # Find the prompt file (prefer CLAUDE.md, fallback to AGENTS.md)
                prompt_file = actor_dir / "CLAUDE.md"
                if not prompt_file.exists():
                    prompt_file = actor_dir / "AGENTS.md"
                if not prompt_file.exists():
                    continue

                try:
                    rel_path = prompt_file.relative_to(target_dir)
                    template_id = f"narrative:{rel_path}"
                    content = prompt_file.read_text(encoding='utf-8', errors='ignore')

                    # Extract synthesis from first # heading
                    synthesis = actor_name
                    for line in content.split('\n')[:10]:
                        if line.startswith('# '):
                            synthesis = line[2:].strip()[:500]
                            break

                    escaped_content = content.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')

                    # Create narrative:actor template node
                    graph_ops._query(
                        """
                        MERGE (n:Narrative {id: $id})
                        SET n.node_type = 'narrative',
                            n.type = 'actor',
                            n.name = $name,
                            n.synthesis = $synthesis,
                            n.content = $content,
                            n.granularity = 1
                        """,
                        {
                            "id": template_id,
                            "name": actor_name,
                            "synthesis": synthesis,
                            "content": escaped_content,
                        }
                    )
                    stats["files_ingested"] += 1

                    # Link template to actors space
                    graph_ops._query(
                        """
                        MATCH (s:Space {id: $space_id})
                        MATCH (n:Narrative {id: $template_id})
                        MERGE (s)-[r:LINK]->(n)
                        SET r.verb = 'contains', r.hierarchy = -0.7
                        """,
                        {"space_id": area_space_id, "template_id": template_id}
                    )
                    stats["links_created"] += 1

                    # Create Actor node (instance)
                    graph_ops._query(
                        """
                        MERGE (a:Actor {id: $id})
                        SET a.node_type = 'actor',
                            a.type = 'agent',
                            a.name = $name,
                            a.synthesis = $synthesis
                        """,
                        {
                            "id": actor_id,
                            "name": actor_name,
                            "synthesis": f"agent: {actor_name}",
                        }
                    )
                    stats["files_ingested"] += 1

                    # Link Actor --[instance_of]--> narrative:actor (template)
                    graph_ops._query(
                        """
                        MATCH (a:Actor {id: $actor_id})
                        MATCH (t:Narrative {id: $template_id})
                        MERGE (a)-[r:LINK]->(t)
                        SET r.verb = 'instance_of', r.hierarchy = 1.0, r.polarity = [0.0, 1.0], r.permanence = 1.0, r.energy = 1.0
                        """,
                        {"actor_id": actor_id, "template_id": template_id}
                    )
                    stats["links_created"] += 1

                    # Link actor to actors space
                    graph_ops._query(
                        """
                        MATCH (s:Space {id: $space_id})
                        MATCH (a:Actor {id: $actor_id})
                        MERGE (s)-[r:LINK]->(a)
                        SET r.verb = 'contains', r.hierarchy = -0.7
                        """,
                        {"space_id": area_space_id, "actor_id": actor_id}
                    )
                    stats["links_created"] += 1

                except Exception as e:
                    logger.warning(f"Error ingesting actor {actor_dir}: {e}")
                    stats["errors"] += 1

        # Special handling for capabilities (full doc chain + tasks/skills/procedures)
        elif area_name == "capabilities":
            for cap_dir in area_dir.iterdir():
                if not cap_dir.is_dir():
                    continue

                cap_name = cap_dir.name
                cap_space_id = f"space:capability:{cap_name}"

                # Create capability space
                ensure_space(cap_space_id, cap_name, "capability", area_space_id)

                try:
                    # Ingest doc chain files (*.md at root of capability)
                    for doc_file in cap_dir.iterdir():
                        if not doc_file.is_file() or doc_file.suffix != ".md":
                            continue

                        rel_path = doc_file.relative_to(target_dir)
                        doc_id = f"narrative:capability:{cap_name}:{doc_file.stem.lower()}"
                        content = doc_file.read_text(encoding='utf-8', errors='ignore')

                        # Determine subtype from filename
                        doc_type = doc_file.stem.upper()
                        if doc_type in PREFIX_TO_SUBTYPE:
                            subtype = PREFIX_TO_SUBTYPE[doc_type]
                        else:
                            subtype = doc_file.stem.lower()

                        # Extract synthesis from first heading
                        synthesis = f"{cap_name} {subtype}"
                        for line in content.split('\n')[:10]:
                            if line.startswith('# '):
                                synthesis = line[2:].strip()[:500]
                                break

                        escaped_content = content.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')

                        graph_ops._query(
                            """
                            MERGE (n:Narrative {id: $id})
                            SET n.node_type = 'narrative',
                                n.type = $subtype,
                                n.name = $name,
                                n.synthesis = $synthesis,
                                n.content = $content,
                                n.capability = $capability,
                                n.granularity = 1
                            """,
                            {
                                "id": doc_id,
                                "subtype": subtype,
                                "name": doc_file.stem,
                                "synthesis": synthesis,
                                "content": escaped_content,
                                "capability": cap_name,
                            }
                        )
                        stats["files_ingested"] += 1

                        # Link doc to capability space
                        graph_ops._query(
                            """
                            MATCH (s:Space {id: $space_id})
                            MATCH (n:Narrative {id: $doc_id})
                            MERGE (s)-[r:LINK]->(n)
                            SET r.verb = 'contains', r.hierarchy = -0.7
                            """,
                            {"space_id": cap_space_id, "doc_id": doc_id}
                        )
                        stats["links_created"] += 1

                    # Ingest subdirectories (tasks/, skills/, procedures/)
                    for subdir_name in ("tasks", "skills", "procedures"):
                        subdir = cap_dir / subdir_name
                        if not subdir.exists():
                            continue

                        for file_path in subdir.iterdir():
                            if not file_path.is_file():
                                continue
                            if file_path.suffix not in (".md", ".yaml"):
                                continue

                            rel_path = file_path.relative_to(target_dir)
                            item_id = f"narrative:capability:{cap_name}:{subdir_name}:{file_path.stem.lower()}"

                            # Determine subtype from directory
                            if subdir_name == "tasks":
                                subtype = "task"
                            elif subdir_name == "skills":
                                subtype = "skill"
                            else:
                                subtype = "procedure"

                            content = file_path.read_text(encoding='utf-8', errors='ignore')

                            # Extract synthesis
                            synthesis = file_path.stem
                            for line in content.split('\n')[:10]:
                                if line.startswith('# '):
                                    synthesis = line[2:].strip()[:500]
                                    break

                            escaped_content = content.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')

                            graph_ops._query(
                                """
                                MERGE (n:Narrative {id: $id})
                                SET n.node_type = 'narrative',
                                    n.type = $subtype,
                                    n.name = $name,
                                    n.synthesis = $synthesis,
                                    n.content = $content,
                                    n.capability = $capability,
                                    n.granularity = 1
                                """,
                                {
                                    "id": item_id,
                                    "subtype": subtype,
                                    "name": file_path.stem,
                                    "synthesis": synthesis,
                                    "content": escaped_content,
                                    "capability": cap_name,
                                }
                            )
                            stats["files_ingested"] += 1

                            # Link to capability space
                            graph_ops._query(
                                """
                                MATCH (s:Space {id: $space_id})
                                MATCH (n:Narrative {id: $item_id})
                                MERGE (s)-[r:LINK]->(n)
                                SET r.verb = 'contains', r.hierarchy = -0.7
                                """,
                                {"space_id": cap_space_id, "item_id": item_id}
                            )
                            stats["links_created"] += 1

                except Exception as e:
                    logger.warning(f"Error ingesting capability {cap_name}: {e}")
                    stats["errors"] += 1

        else:
            # Regular area - ingest all files directly
            for file_path in area_dir.rglob("*"):
                if file_path.is_file() and file_path.suffix in (".md", ".yaml"):
                    # Skip if in a skip directory
                    if any(skip in file_path.parts for skip in SKIP_DIRS):
                        continue
                    ingest_file(file_path, area_space_id)

    return stats
