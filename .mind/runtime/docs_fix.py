from __future__ import annotations

# DOCS: docs/cli/core/ALGORITHM_CLI_Command_Execution_Logic/ALGORITHM_Overview.md

import os
import re
from dataclasses import dataclass
from pathlib import Path

from .core_utils import find_module_directories


CHAIN_PATTERN = re.compile(
    r"^\s*(PATTERNS|BEHAVIORS|ALGORITHM|VALIDATION|IMPLEMENTATION|HEALTH|SYNC|THIS):\s*(.+\.md)\s*$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class FixResult:
    files_updated: int
    links_updated: int
    files_created: int


def _relative_link(from_dir: Path, to_path: Path) -> str:
    rel = os.path.relpath(to_path, start=from_dir)
    rel_posix = Path(rel).as_posix()
    if not rel_posix.startswith("."):
        rel_posix = f"./{rel_posix}"
    return rel_posix


def _find_module_root(md_file: Path, module_dirs: list[Path]) -> Path | None:
    for module_dir in sorted(module_dirs, key=lambda p: len(p.parts), reverse=True):
        try:
            md_file.relative_to(module_dir)
        except ValueError:
            continue
        return module_dir
    return None


def _find_unique_doc_by_name(root: Path, filename: str) -> Path | None:
    matches = list(root.rglob(filename))
    if len(matches) == 1:
        return matches[0]
    return None


def _maybe_fix_chain_links(target_dir: Path, dry_run: bool) -> FixResult:
    docs_dir = target_dir / "docs"
    module_dirs = find_module_directories(docs_dir)
    files_updated = 0
    links_updated = 0

    for md_file in docs_dir.rglob("*.md"):
        content = md_file.read_text()
        if "## CHAIN" not in content:
            continue

        lines = content.splitlines()
        changed = False
        for index, line in enumerate(lines):
            match = CHAIN_PATTERN.match(line)
            if not match:
                continue
            link_type = match.group(1)
            link_path = match.group(2).strip()
            if link_type == "THIS":
                continue

            resolved = md_file.parent / link_path.lstrip("./")
            if link_path.startswith("./"):
                resolved = md_file.parent / link_path[2:]
            elif link_path.startswith("../"):
                resolved = md_file.parent / link_path

            if resolved.exists():
                continue

            new_link = None

            if link_path.startswith("docs/"):
                absolute_target = target_dir / link_path
                if absolute_target.exists():
                    new_link = _relative_link(md_file.parent, absolute_target)

            if not new_link:
                basename_target = md_file.parent / Path(link_path).name
                if basename_target.exists():
                    new_link = f"./{basename_target.name}"

            if not new_link:
                module_root = _find_module_root(md_file, module_dirs)
                if module_root:
                    found = _find_unique_doc_by_name(module_root, Path(link_path).name)
                    if found:
                        new_link = _relative_link(md_file.parent, found)

            if not new_link and md_file.match("docs/mcp-design/HEALTH_Protocol_Verification.md"):
                if link_path == "./ALGORITHM_Overview.md":
                    candidate = md_file.parent / "ALGORITHM_Protocol_Core_Mechanics.md"
                    if candidate.exists():
                        new_link = "./ALGORITHM_Protocol_Core_Mechanics.md"
                elif link_path == "./IMPLEMENTATION_Overview.md":
                    candidate = md_file.parent / "IMPLEMENTATION_Protocol_System_Architecture.md"
                    if candidate.exists():
                        new_link = "./IMPLEMENTATION_Protocol_System_Architecture.md"

            if not new_link:
                docs_match = _find_unique_doc_by_name(docs_dir, Path(link_path).name)
                if docs_match:
                    new_link = _relative_link(md_file.parent, docs_match)

            if new_link and new_link != link_path:
                lines[index] = line.replace(link_path, new_link)
                changed = True
                links_updated += 1

        if changed:
            files_updated += 1
            if not dry_run:
                md_file.write_text("\n".join(lines).rstrip() + "\n")

    return FixResult(files_updated=files_updated, links_updated=links_updated, files_created=0)


def _maybe_write_file(path: Path, content: str, dry_run: bool) -> bool:
    if path.exists():
        return False
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content.rstrip() + "\n")
    return True


def _rewrite_impl_references(docs_dir: Path, dry_run: bool) -> FixResult:
    replacements = [
        ("`IMPLEMENTATION.Runtime_And_Dependencies.md`",
         "`docs/cli/core/IMPLEMENTATION_CLI_Code_Architecture/IMPLEMENTATION_Runtime_And_Dependencies.md`"),
        ("`SYNC_Project_Health.md`", "`.mind/state/SYNC_Project_Health.md`"),
        ("`SYNC_Prompt_Command_State.md`", "`.mind/state/SYNC_Prompt_Command_State.md`"),
        ("`views.py`", "views.py (planned)"),
    ]

    files_updated = 0
    links_updated = 0

    for md_file in docs_dir.rglob("IMPLEMENTATION_*.md"):
        content = md_file.read_text()
        updated = content
        for old, new in replacements:
            if old in updated:
                updated = updated.replace(old, new)
        if updated != content:
            files_updated += 1
            links_updated += sum(content.count(old) for old, _ in replacements)
            if not dry_run:
                md_file.write_text(updated.rstrip() + "\n")

    return FixResult(files_updated=files_updated, links_updated=links_updated, files_created=0)


def _ensure_prompt_state_sync(docs_dir: Path, dry_run: bool) -> int:
    path = docs_dir.parent / ".mind" / "state" / "SYNC_Prompt_Command_State.md"
    return 1 if _maybe_write_file(path, _PROMPT_SYNC_STATE, dry_run) else 0


def _ensure_mind_config(docs_dir: Path, dry_run: bool) -> int:
    path = docs_dir.parent / ".mind" / "config.yaml"
    return 1 if _maybe_write_file(path, _MIND_CONFIG, dry_run) else 0


def _ensure_work_report(docs_dir: Path, dry_run: bool) -> int:
    path = docs_dir.parent / ".mind" / "state" / "WORK_REPORT.md"
    return 1 if _maybe_write_file(path, _WORK_REPORT, dry_run) else 0


def _ensure_cli_module_docs(docs_dir: Path, dry_run: bool) -> int:
    created = 0
    base = docs_dir / "cli"
    docs = {
        base / "PATTERNS_CLI_Module_Overview_And_Scope.md": _CLI_PATTERNS,
        base / "BEHAVIORS_CLI_Module_Command_Surface_Effects.md": _CLI_BEHAVIORS,
        base / "VALIDATION_CLI_Module_Invariants.md": _CLI_VALIDATION,
        base / "HEALTH_CLI_Module_Verification.md": _CLI_HEALTH,
        base / "SYNC_CLI_Module_Current_State.md": _CLI_SYNC,
    }
    for path, content in docs.items():
        if _maybe_write_file(path, content, dry_run):
            created += 1
    return created


def _ensure_schema_module_docs(docs_dir: Path, dry_run: bool) -> int:
    created = 0
    base = docs_dir / "schema"
    docs = {
        base / "PATTERNS_Schema_Module_Overview_And_Ownership.md": _SCHEMA_PATTERNS,
        base / "BEHAVIORS_Schema_Module_Observable_Schema_Effects.md": _SCHEMA_BEHAVIORS,
        base / "ALGORITHM_Schema_Module_Doc_Routing.md": _SCHEMA_ALGORITHM,
        base / "IMPLEMENTATION_Schema_Module_Doc_Structure.md": _SCHEMA_IMPLEMENTATION,
        base / "HEALTH_Schema_Module_Verification.md": _SCHEMA_HEALTH,
        base / "SYNC_Schema_Module_Current_State.md": _SCHEMA_SYNC,
    }
    for path, content in docs.items():
        if _maybe_write_file(path, content, dry_run):
            created += 1
    return created


def _ensure_world_runner_health(docs_dir: Path, dry_run: bool) -> int:
    path = docs_dir / "agents" / "world-runner" / "HEALTH_World_Runner.md"
    return 1 if _maybe_write_file(path, _WORLD_RUNNER_HEALTH, dry_run) else 0


def _ensure_scene_memory_health(docs_dir: Path, dry_run: bool) -> int:
    path = docs_dir / "infrastructure" / "scene-memory" / "HEALTH_Scene_Memory.md"
    return 1 if _maybe_write_file(path, _SCENE_MEMORY_HEALTH, dry_run) else 0


def docs_fix_command(target_dir: Path, dry_run: bool = False) -> int:
    docs_dir = target_dir / "docs"
    if not docs_dir.exists():
        print(f"No docs directory found at {docs_dir}")
        return 1

    created = 0
    created += _ensure_cli_module_docs(docs_dir, dry_run)
    created += _ensure_schema_module_docs(docs_dir, dry_run)
    created += _ensure_world_runner_health(docs_dir, dry_run)
    created += _ensure_scene_memory_health(docs_dir, dry_run)
    created += _ensure_prompt_state_sync(docs_dir, dry_run)
    created += _ensure_mind_config(docs_dir, dry_run)
    created += _ensure_work_report(docs_dir, dry_run)

    link_results = _maybe_fix_chain_links(target_dir, dry_run)
    rewrite_results = _rewrite_impl_references(docs_dir, dry_run)
    total_created = created + link_results.files_created

    print(
        "docs-fix summary:\n"
        f"- files created: {total_created}\n"
        f"- files updated: {link_results.files_updated + rewrite_results.files_updated}\n"
        f"- links updated: {link_results.links_updated + rewrite_results.links_updated}\n"
        f"- mode: {'dry-run' if dry_run else 'apply'}"
    )
    return 0


_CLI_PATTERNS = """# mind Framework CLI — Patterns: Command Surface Overview and Scope

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_CLI_Module_Overview_And_Scope.md
BEHAVIORS:       ./BEHAVIORS_CLI_Module_Command_Surface_Effects.md
ALGORITHM:       ./ALGORITHM_CLI_Command_Execution_Logic.md
VALIDATION:      ./VALIDATION_CLI_Module_Invariants.md
IMPLEMENTATION:  ./IMPLEMENTATION_CLI_Code_Architecture.md
HEALTH:          ./HEALTH_CLI_Module_Verification.md
SYNC:            ./SYNC_CLI_Module_Current_State.md
```

---

## PURPOSE

The CLI is the operational entrypoint for the protocol. It owns argument parsing,
command routing, and consistent output for health and work workflows.

## SCOPE

In scope:
- Argument parsing and command routing for `mind` commands.
- Coordination of protocol health, work, and prompt generation flows.
- Dispatch to command modules with traceable exits.

Out of scope:
- Deep health logic (owned by doctor checks).
- Refactor mechanics (owned by `mind refactor` internals).
"""


_CLI_BEHAVIORS = """# mind Framework CLI — Behaviors: Command Surface Effects

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_CLI_Module_Overview_And_Scope.md
BEHAVIORS:       ./BEHAVIORS_CLI_Module_Command_Surface_Effects.md
ALGORITHM:       ./ALGORITHM_CLI_Command_Execution_Logic.md
VALIDATION:      ./VALIDATION_CLI_Module_Invariants.md
IMPLEMENTATION:  ./IMPLEMENTATION_CLI_Code_Architecture.md
HEALTH:          ./HEALTH_CLI_Module_Verification.md
SYNC:            ./SYNC_CLI_Module_Current_State.md
```

---

## BEHAVIORS

- Each command returns a deterministic exit code (0 success, 1 failure).
- Output is structured to be readable by humans and parsable by agents.
- Health-related commands surface issues without hiding failures.
"""


_CLI_VALIDATION = """# mind Framework CLI — Validation: Command Invariants

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_CLI_Module_Overview_And_Scope.md
BEHAVIORS:       ./BEHAVIORS_CLI_Module_Command_Surface_Effects.md
ALGORITHM:       ./ALGORITHM_CLI_Command_Execution_Logic.md
VALIDATION:      ./VALIDATION_CLI_Module_Invariants.md
IMPLEMENTATION:  ./IMPLEMENTATION_CLI_Code_Architecture.md
HEALTH:          ./HEALTH_CLI_Module_Verification.md
SYNC:            ./SYNC_CLI_Module_Current_State.md
```

---

## INVARIANTS

- Commands must fail loudly on invalid arguments.
- Health checks must never be skipped when explicitly requested.
- Doc chain references must remain valid for CLI-owned docs.
"""


_CLI_HEALTH = """# mind Framework CLI — Health: Verification Checklist

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_CLI_Module_Overview_And_Scope.md
BEHAVIORS:       ./BEHAVIORS_CLI_Module_Command_Surface_Effects.md
ALGORITHM:       ./ALGORITHM_CLI_Command_Execution_Logic.md
VALIDATION:      ./VALIDATION_CLI_Module_Invariants.md
IMPLEMENTATION:  ./IMPLEMENTATION_CLI_Code_Architecture.md
HEALTH:          ./HEALTH_CLI_Module_Verification.md
SYNC:            ./SYNC_CLI_Module_Current_State.md
```

---

## CHECKS

```
mind validate
mind doctor --format json
```
"""


_CLI_SYNC = """# mind Framework CLI — Sync: Current State

```
LAST_UPDATED: 2025-12-20
UPDATED_BY: docs-fix
STATUS: DESIGNING
```

---

## CURRENT STATE

CLI module root docs created to complete the chain and align with core CLI docs.
"""


_SCHEMA_PATTERNS = """# Schema — Patterns: Module Overview and Ownership

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_Schema_Module_Overview_And_Ownership.md
BEHAVIORS:       ./BEHAVIORS_Schema_Module_Observable_Schema_Effects.md
ALGORITHM:       ./ALGORITHM_Schema_Module_Doc_Routing.md
VALIDATION:      ./VALIDATION_Graph.md
IMPLEMENTATION:  ./IMPLEMENTATION_Schema_Module_Doc_Structure.md
HEALTH:          ./HEALTH_Schema_Module_Verification.md
SYNC:            ./SYNC_Schema_Module_Current_State.md
```

---

## PURPOSE

The schema module documents the canonical data definitions and validation
interfaces shared by the engine and physics layers.
"""


_SCHEMA_BEHAVIORS = """# Schema — Behaviors: Observable Schema Effects

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_Schema_Module_Overview_And_Ownership.md
BEHAVIORS:       ./BEHAVIORS_Schema_Module_Observable_Schema_Effects.md
ALGORITHM:       ./ALGORITHM_Schema_Module_Doc_Routing.md
VALIDATION:      ./VALIDATION_Graph.md
IMPLEMENTATION:  ./IMPLEMENTATION_Schema_Module_Doc_Structure.md
HEALTH:          ./HEALTH_Schema_Module_Verification.md
SYNC:            ./SYNC_Schema_Module_Current_State.md
```

---

## BEHAVIORS

- Schema documents define the allowed structures for graph data.
- Validation references remain aligned with physics graph invariants.
"""


_SCHEMA_ALGORITHM = """# Schema — Algorithm: Documentation Routing

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_Schema_Module_Overview_And_Ownership.md
BEHAVIORS:       ./BEHAVIORS_Schema_Module_Observable_Schema_Effects.md
ALGORITHM:       ./ALGORITHM_Schema_Module_Doc_Routing.md
VALIDATION:      ./VALIDATION_Graph.md
IMPLEMENTATION:  ./IMPLEMENTATION_Schema_Module_Doc_Structure.md
HEALTH:          ./HEALTH_Schema_Module_Verification.md
SYNC:            ./SYNC_Schema_Module_Current_State.md
```

---

## FLOW

1. Route schema validation to the living graph validation spec.
2. Keep schema docs aligned with engine and physics implementations.
"""


_SCHEMA_IMPLEMENTATION = """# Schema — Implementation: Documentation Structure

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_Schema_Module_Overview_And_Ownership.md
BEHAVIORS:       ./BEHAVIORS_Schema_Module_Observable_Schema_Effects.md
ALGORITHM:       ./ALGORITHM_Schema_Module_Doc_Routing.md
VALIDATION:      ./VALIDATION_Graph.md
IMPLEMENTATION:  ./IMPLEMENTATION_Schema_Module_Doc_Structure.md
HEALTH:          ./HEALTH_Schema_Module_Verification.md
SYNC:            ./SYNC_Schema_Module_Current_State.md
```

---

## STRUCTURE

Docs live under `docs/schema/` with cross-references to physics graph validation.
"""


_SCHEMA_HEALTH = """# Schema — Health: Verification Checklist

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_Schema_Module_Overview_And_Ownership.md
BEHAVIORS:       ./BEHAVIORS_Schema_Module_Observable_Schema_Effects.md
ALGORITHM:       ./ALGORITHM_Schema_Module_Doc_Routing.md
VALIDATION:      ./VALIDATION_Graph.md
IMPLEMENTATION:  ./IMPLEMENTATION_Schema_Module_Doc_Structure.md
HEALTH:          ./HEALTH_Schema_Module_Verification.md
SYNC:            ./SYNC_Schema_Module_Current_State.md
```

---

## CHECKS

```
python -m pytest engine/graph/health/test_schema.py
```
"""


_SCHEMA_SYNC = """# Schema — Sync: Current State

```
LAST_UPDATED: 2025-12-20
UPDATED_BY: docs-fix
STATUS: DESIGNING
```

---

## CURRENT STATE

Schema module docs created to complete the chain and align validation references.
"""


_WORLD_RUNNER_HEALTH = """# World Runner — Health: Verification Checklist

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_World_Runner.md
BEHAVIORS:       ./BEHAVIORS_World_Runner.md
ALGORITHM:       ./ALGORITHM_World_Runner.md
VALIDATION:      ./VALIDATION_World_Runner_Invariants.md
IMPLEMENTATION:  ./IMPLEMENTATION_World_Runner_Service_Architecture.md
HEALTH:          ./HEALTH_World_Runner.md
SYNC:            ./SYNC_World_Runner.md
```

---

## CHECKS

- Run the world runner health checks when available.
- Verify service orchestration invariants before deployments.
"""


_SCENE_MEMORY_HEALTH = """# Scene Memory — Health: Verification Checklist

```
STATUS: DESIGNING
CREATED: 2025-12-20
```

---

## CHAIN

```
PATTERNS:        ./PATTERNS_Scene_Memory.md
BEHAVIORS:       ./BEHAVIORS_Scene_Memory.md
ALGORITHM:       ./ALGORITHM_Scene_Memory.md
VALIDATION:      ./VALIDATION_Scene_Memory.md
IMPLEMENTATION:  ./IMPLEMENTATION_Scene_Memory.md
HEALTH:          ./HEALTH_Scene_Memory.md
SYNC:            ./SYNC_Scene_Memory.md
```

---

## CHECKS

- Run scene-memory validations after schema or persistence changes.
"""


_PROMPT_SYNC_STATE = """# Prompt Command — Sync: Current State

```
LAST_UPDATED: 2025-12-20
UPDATED_BY: docs-fix
STATUS: DESIGNING
```

---

## CURRENT STATE

Prompt command state tracking file created to satisfy implementation references.
"""


_MIND_CONFIG = """doctor:
  monolith_lines: 800
  stale_sync_days: 14
  docs_ref_search_chars: 2000
  hook_check_chars: 1000
  ignore: []
  disabled_checks: []
  gemini_model_fallback_status: {}
"""


_WORK_REPORT = """# Work Report

```
LAST_UPDATED: 2025-12-20
UPDATED_BY: docs-fix
STATUS: PLACEHOLDER
```

---

This report is generated by `mind work`. It is created or overwritten per run.
"""
