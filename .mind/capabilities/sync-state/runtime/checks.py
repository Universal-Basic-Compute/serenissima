# Sync State Health Checks
# DOCS: capabilities/sync-state/HEALTH.md

"""
Health checks for sync state capability.

Detects:
- H1: STALE_SYNC - SYNC files not updated in 14+ days
- H2: YAML_DRIFT - modules.yaml out of sync with file system
- H3: DOCS_NOT_INGESTED - Docs on disk but not in graph
- H4: MODULE_BLOCKED - Modules with STATUS: BLOCKED
"""

import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

# These would be imported from mind.capability in actual implementation
# from runtime.capability import check, Signal, triggers


class Signal:
    """Health signal results."""

    @staticmethod
    def healthy(**kwargs) -> dict:
        return {"status": "healthy", **kwargs}

    @staticmethod
    def degraded(**kwargs) -> dict:
        return {"status": "degraded", **kwargs}

    @staticmethod
    def critical(**kwargs) -> dict:
        return {"status": "critical", **kwargs}


def check(id: str, triggers: list, on_problem: str, task: str):
    """Decorator for health check functions."""

    def decorator(func):
        func.check_id = id
        func.triggers = triggers
        func.on_problem = on_problem
        func.task = task
        return func

    return decorator


class triggers:
    """Trigger definitions."""

    class cron:
        @staticmethod
        def daily():
            return {"type": "cron", "schedule": "daily"}

    class command:
        @staticmethod
        def on(cmd: str):
            return {"type": "command", "command": cmd}

    class file:
        @staticmethod
        def on_change(pattern: str):
            return {"type": "file", "pattern": pattern}


# =============================================================================
# H1: SYNC Freshness Check
# =============================================================================


@check(
    id="sync_freshness",
    triggers=[
        triggers.cron.daily(),
        triggers.command.on("mind doctor"),
    ],
    on_problem="STALE_SYNC",
    task="TASK_update_sync",
)
def sync_freshness(ctx: Any) -> dict:
    """
    H1: Check if SYNC files are fresh (updated within 14 days).

    Scans all SYNC files and checks LAST_UPDATED field.
    """
    project_root = Path(ctx.project_root) if hasattr(ctx, "project_root") else Path(".")
    threshold_days = 14
    threshold = datetime.now() - timedelta(days=threshold_days)

    stale_syncs = []

    # Find all SYNC files
    docs_path = project_root / "docs"
    if not docs_path.exists():
        return Signal.healthy(message="No docs directory")

    for sync_path in docs_path.glob("**/SYNC*.md"):
        try:
            content = sync_path.read_text()
        except Exception:
            continue

        # Extract LAST_UPDATED
        match = re.search(r"LAST_UPDATED:\s*(\d{4}-\d{2}-\d{2})", content)
        if not match:
            stale_syncs.append(
                {
                    "path": str(sync_path),
                    "last_updated": None,
                    "days_stale": "unknown",
                }
            )
            continue

        try:
            last_updated = datetime.strptime(match.group(1), "%Y-%m-%d")
            if last_updated < threshold:
                days_stale = (datetime.now() - last_updated).days
                stale_syncs.append(
                    {
                        "path": str(sync_path),
                        "last_updated": match.group(1),
                        "days_stale": days_stale,
                    }
                )
        except ValueError:
            stale_syncs.append(
                {
                    "path": str(sync_path),
                    "last_updated": match.group(1),
                    "days_stale": "parse_error",
                }
            )

    if not stale_syncs:
        return Signal.healthy(message="All SYNC files are fresh")

    if len(stale_syncs) >= 5:
        return Signal.critical(
            stale_count=len(stale_syncs),
            stale_files=[s["path"] for s in stale_syncs],
            details=stale_syncs,
        )

    return Signal.degraded(
        stale_count=len(stale_syncs),
        stale_files=[s["path"] for s in stale_syncs],
        details=stale_syncs,
    )


# =============================================================================
# H2: YAML Drift Check
# =============================================================================


@check(
    id="yaml_drift",
    triggers=[
        triggers.cron.daily(),
        triggers.file.on_change("docs/**"),
    ],
    on_problem="YAML_DRIFT",
    task="TASK_regenerate_yaml",
)
def yaml_drift(ctx: Any) -> dict:
    """
    H2: Check if modules.yaml matches file system reality.

    Compares modules listed in YAML to actual directories in docs/.
    """
    import yaml

    project_root = Path(ctx.project_root) if hasattr(ctx, "project_root") else Path(".")

    # Load modules.yaml
    yaml_path = project_root / ".mind" / "modules.yaml"
    if not yaml_path.exists():
        return Signal.degraded(
            drifted=True,
            error="modules.yaml not found",
            missing_from_yaml=[],
            extra_in_yaml=[],
        )

    try:
        with open(yaml_path) as f:
            yaml_content = yaml.safe_load(f) or {}
    except Exception as e:
        return Signal.degraded(
            drifted=True,
            error=f"Failed to parse modules.yaml: {e}",
            missing_from_yaml=[],
            extra_in_yaml=[],
        )

    # Get modules from YAML
    yaml_modules = set()
    modules = yaml_content.get("modules", [])
    if isinstance(modules, list):
        for m in modules:
            if isinstance(m, dict):
                yaml_modules.add(m.get("name", ""))
            elif isinstance(m, str):
                yaml_modules.add(m)

    # Get modules from file system
    docs_path = project_root / "docs"
    fs_modules = set()

    if docs_path.exists():
        for item in docs_path.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                # Check if it's a module (has SYNC or PATTERNS)
                has_sync = (item / "SYNC.md").exists()
                has_patterns = (item / "PATTERNS.md").exists()
                if has_sync or has_patterns:
                    fs_modules.add(item.name)

    # Compare
    missing_from_yaml = list(fs_modules - yaml_modules)
    extra_in_yaml = list(yaml_modules - fs_modules)

    if not missing_from_yaml and not extra_in_yaml:
        return Signal.healthy(
            drifted=False,
            modules_count=len(fs_modules),
        )

    return Signal.degraded(
        drifted=True,
        missing_from_yaml=missing_from_yaml,
        extra_in_yaml=extra_in_yaml,
    )


# =============================================================================
# H3: Ingestion Coverage Check
# =============================================================================


@check(
    id="ingestion_coverage",
    triggers=[
        triggers.command.on("mind doctor"),
        triggers.command.on("mind sync"),
    ],
    on_problem="DOCS_NOT_INGESTED",
    task="TASK_ingest_docs",
)
def ingestion_coverage(ctx: Any) -> dict:
    """
    H3: Check if all docs on disk exist in graph.

    Compares docs/**/*.md to doc nodes in graph.
    """
    project_root = Path(ctx.project_root) if hasattr(ctx, "project_root") else Path(".")

    # Get docs on disk
    docs_path = project_root / "docs"
    docs_on_disk = set()

    if docs_path.exists():
        for doc_path in docs_path.glob("**/*.md"):
            rel_path = str(doc_path.relative_to(project_root))
            docs_on_disk.add(rel_path)

    if not docs_on_disk:
        return Signal.healthy(
            on_disk=0,
            in_graph=0,
            message="No docs on disk",
        )

    # Get docs in graph (if graph available)
    docs_in_graph = set()
    if hasattr(ctx, "graph") and ctx.graph:
        try:
            # Query graph for doc nodes
            result = ctx.graph.query(
                """
                MATCH (n)
                WHERE n.type STARTS WITH 'doc' AND n.path IS NOT NULL
                RETURN n.path AS path
                """
            )
            for row in result:
                if row.get("path"):
                    docs_in_graph.add(row["path"])
        except Exception:
            # Graph not available or query failed
            pass

    # If no graph connection, skip this check
    if not docs_in_graph and len(docs_on_disk) > 0:
        # Can't verify - assume needs ingestion
        return Signal.degraded(
            on_disk=len(docs_on_disk),
            in_graph=0,
            not_ingested=list(docs_on_disk)[:10],
            not_ingested_count=len(docs_on_disk),
            message="Graph not available for verification",
        )

    # Compare
    not_ingested = list(docs_on_disk - docs_in_graph)

    if not not_ingested:
        return Signal.healthy(
            on_disk=len(docs_on_disk),
            in_graph=len(docs_in_graph),
        )

    if len(not_ingested) >= 10:
        return Signal.critical(
            on_disk=len(docs_on_disk),
            in_graph=len(docs_in_graph),
            not_ingested=not_ingested[:10],
            not_ingested_count=len(not_ingested),
        )

    return Signal.degraded(
        on_disk=len(docs_on_disk),
        in_graph=len(docs_in_graph),
        not_ingested=not_ingested,
        not_ingested_count=len(not_ingested),
    )


# =============================================================================
# H4: Blocked Modules Check
# =============================================================================


@check(
    id="blocked_modules",
    triggers=[
        triggers.cron.daily(),
        triggers.command.on("mind status"),
    ],
    on_problem="MODULE_BLOCKED",
    task="TASK_unblock_module",
)
def blocked_modules(ctx: Any) -> dict:
    """
    H4: Check for modules with STATUS: BLOCKED.

    Scans SYNC files for BLOCKED status and tracks duration.
    """
    project_root = Path(ctx.project_root) if hasattr(ctx, "project_root") else Path(".")

    blocked = []
    docs_path = project_root / "docs"

    if not docs_path.exists():
        return Signal.healthy(message="No docs directory")

    for sync_path in docs_path.glob("**/SYNC*.md"):
        try:
            content = sync_path.read_text()
        except Exception:
            continue

        # Check for BLOCKED status
        if not re.search(r"STATUS:\s*BLOCKED", content, re.IGNORECASE):
            continue

        # Extract module name from path
        module = sync_path.parent.name

        # Try to find blocker reason
        blocker_match = re.search(
            r"(?:BLOCKED|Blocker|Blocking)[:\s]+([^\n]+)", content, re.IGNORECASE
        )
        blocker_reason = blocker_match.group(1).strip() if blocker_match else "Unknown"

        # Check how long blocked
        updated_match = re.search(r"LAST_UPDATED:\s*(\d{4}-\d{2}-\d{2})", content)
        days_blocked = None
        since_date = None

        if updated_match:
            try:
                since_date = updated_match.group(1)
                blocked_since = datetime.strptime(since_date, "%Y-%m-%d")
                days_blocked = (datetime.now() - blocked_since).days
            except ValueError:
                pass

        blocked.append(
            {
                "module": module,
                "path": str(sync_path),
                "reason": blocker_reason,
                "since": since_date,
                "days_blocked": days_blocked,
            }
        )

    if not blocked:
        return Signal.healthy(message="No blocked modules")

    # Check for long-blocked modules (> 7 days)
    long_blocked = [b for b in blocked if (b.get("days_blocked") or 0) > 7]

    if long_blocked:
        return Signal.critical(
            blocked_count=len(blocked),
            blocked=blocked,
            long_blocked=long_blocked,
            long_blocked_count=len(long_blocked),
        )

    return Signal.degraded(
        blocked_count=len(blocked),
        blocked=blocked,
    )
