# DOCS: docs/cli/core/PATTERNS_Why_CLI_Over_Copy.md
"""
Sync management for mind CLI.

Provides:
- sync-status: Overview of all SYNC files with dates and staleness
- sync-archive: Auto-archive old content when SYNC files get too long
"""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Tuple

from .core_utils import HAS_YAML

if HAS_YAML:
    import yaml


@dataclass
class SyncFileInfo:
    """Information about a SYNC file."""
    path: Path
    relative_path: str
    last_updated: Optional[datetime]
    updated_by: Optional[str]
    status: Optional[str]
    line_count: int
    is_stale: bool
    days_old: Optional[int]
    scope: str  # "project", "module", "health"


def parse_sync_header(content: str) -> Dict[str, Optional[str]]:
    """Parse SYNC file header metadata."""
    result = {
        "last_updated": None,
        "updated_by": None,
        "status": None,
    }

    # Look for metadata in code block at start
    lines = content.split('\n')
    in_header = False

    for line in lines[:30]:  # Check first 30 lines
        if line.strip() == '```':
            in_header = not in_header
            continue

        if in_header or ':' in line:
            if 'LAST_UPDATED:' in line:
                result["last_updated"] = line.split('LAST_UPDATED:')[1].strip()
            elif 'UPDATED_BY:' in line:
                result["updated_by"] = line.split('UPDATED_BY:')[1].strip()
            elif 'STATUS:' in line:
                result["status"] = line.split('STATUS:')[1].strip()

    return result


def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse a date string into datetime."""
    if not date_str:
        return None

    # Try common formats
    for fmt in ["%Y-%m-%d", "%Y-%m-%d %H:%M", "%Y/%m/%d"]:
        try:
            return datetime.strptime(date_str[:len("2024-12-18")], "%Y-%m-%d")
        except ValueError:
            continue
    return None


def find_all_sync_files(target_dir: Path) -> List[SyncFileInfo]:
    """Find and analyze all SYNC files in the project."""
    sync_files = []
    now = datetime.now()
    stale_threshold = timedelta(days=14)

    # Search locations
    search_paths = [
        (target_dir / ".mind" / "state", "project"),
        (target_dir / "docs", "module"),
    ]

    for search_dir, default_scope in search_paths:
        if not search_dir.exists():
            continue

        for sync_file in search_dir.rglob("SYNC_*.md"):
            # Skip archive files - they should not be processed
            if "_archive_" in sync_file.name:
                continue
            try:
                content = sync_file.read_text()
                line_count = len(content.split('\n'))

                # Parse header
                header = parse_sync_header(content)
                last_updated = parse_date(header["last_updated"])

                # Determine staleness
                is_stale = False
                days_old = None
                if last_updated:
                    days_old = (now - last_updated).days
                    is_stale = days_old > stale_threshold.days

                # Determine scope
                scope = default_scope
                if "Health" in sync_file.name:
                    scope = "health"
                elif "Project" in sync_file.name:
                    scope = "project"

                try:
                    rel_path = str(sync_file.relative_to(target_dir))
                except ValueError:
                    rel_path = str(sync_file)

                sync_files.append(SyncFileInfo(
                    path=sync_file,
                    relative_path=rel_path,
                    last_updated=last_updated,
                    updated_by=header["updated_by"],
                    status=header["status"],
                    line_count=line_count,
                    is_stale=is_stale,
                    days_old=days_old,
                    scope=scope,
                ))
            except Exception:
                continue

    # Sort by scope (project first), then by date
    scope_order = {"project": 0, "health": 1, "module": 2}
    sync_files.sort(key=lambda x: (scope_order.get(x.scope, 9), x.relative_path))

    return sync_files


def archive_sync_file(sync_path: Path, max_lines: int = 200) -> Optional[Path]:
    """
    Archive old content from a SYNC file if it exceeds max_lines.

    Returns the archive path if archiving occurred, None otherwise.
    """
    # Never archive an archive file
    if "_archive_" in sync_path.name:
        return None

    content = sync_path.read_text()
    lines = content.split('\n')

    if len(lines) <= max_lines:
        return None

    # Find section boundaries (## headers)
    sections = []
    current_section_start = 0
    current_section_name = "header"

    for i, line in enumerate(lines):
        if line.startswith('## '):
            if current_section_start < i:
                sections.append({
                    "name": current_section_name,
                    "start": current_section_start,
                    "end": i,
                    "lines": lines[current_section_start:i]
                })
            current_section_name = line[3:].strip()
            current_section_start = i

    # Add last section
    sections.append({
        "name": current_section_name,
        "start": current_section_start,
        "end": len(lines),
        "lines": lines[current_section_start:]
    })

    # Identify sections to keep vs archive
    # Keep: header, CURRENT STATE, KNOWN ISSUES, TODO (recent), HANDOFF
    # Archive: older TODO items, old KNOWN ISSUES, historical notes
    keep_sections = ["header", "CURRENT STATE", "KNOWN ISSUES", "HANDOFF", "FOR AGENTS"]
    archive_sections = []
    kept_lines = []

    for section in sections:
        section_name_upper = section["name"].upper()
        should_keep = any(k.upper() in section_name_upper for k in keep_sections)

        if should_keep or len(section["lines"]) < 20:
            kept_lines.extend(section["lines"])
        else:
            archive_sections.append(section)

    # If nothing to archive, return
    if not archive_sections:
        return None

    # Create archive file
    date_str = datetime.now().strftime("%Y-%m")
    archive_name = sync_path.stem + f"_archive_{date_str}.md"
    archive_path = sync_path.parent / archive_name

    # Build archive content
    archive_lines = [
        f"# Archived: {sync_path.name}",
        "",
        f"Archived on: {datetime.now().strftime('%Y-%m-%d')}",
        f"Original file: {sync_path.name}",
        "",
        "---",
        "",
    ]

    for section in archive_sections:
        archive_lines.extend(section["lines"])
        archive_lines.append("")

    # Append to existing archive or create new
    if archive_path.exists():
        existing = archive_path.read_text()
        archive_content = existing + "\n\n---\n\n" + "\n".join(archive_lines)
    else:
        archive_content = "\n".join(archive_lines)

    archive_path.write_text(archive_content)

    # Add archive reference to kept content
    kept_lines.append("")
    kept_lines.append("---")
    kept_lines.append("")
    kept_lines.append("## ARCHIVE")
    kept_lines.append("")
    kept_lines.append(f"Older content archived to: `{archive_name}`")
    kept_lines.append("")

    # Write updated SYNC file
    sync_path.write_text("\n".join(kept_lines))

    return archive_path


def archive_all_syncs(target_dir: Path, max_lines: int = 200) -> List[Tuple[Path, Path]]:
    """
    Archive old content from all SYNC files that exceed max_lines.

    Returns list of (sync_path, archive_path) tuples.
    """
    archived = []
    sync_files = find_all_sync_files(target_dir)

    for sync_info in sync_files:
        if sync_info.line_count > max_lines:
            archive_path = archive_sync_file(sync_info.path, max_lines)
            if archive_path:
                archived.append((sync_info.path, archive_path))

    return archived


def print_sync_status(target_dir: Path, archived_files: List[Tuple[Path, Path]] = None):
    """Print status of all SYNC files."""
    sync_files = find_all_sync_files(target_dir)

    if not sync_files:
        print("No SYNC files found.")
        return

    print("SYNC Status Report")
    print("=" * 60)
    print()

    # Show archived files first if any
    if archived_files:
        print(f"Auto-archived {len(archived_files)} large file(s):")
        for sync_path, archive_path in archived_files:
            try:
                rel_archive = archive_path.relative_to(target_dir)
            except ValueError:
                rel_archive = archive_path
            print(f"  -> {rel_archive}")
        print()

    # Summary
    total = len(sync_files)
    stale = sum(1 for s in sync_files if s.is_stale)
    large = sum(1 for s in sync_files if s.line_count > 200)

    print(f"Total: {total} | Stale: {stale} | Large (>200 lines): {large}")
    print()

    # Group by scope
    current_scope = None

    for sync in sync_files:
        if sync.scope != current_scope:
            current_scope = sync.scope
            print(f"## {current_scope.upper()}")
            print()

        # Status indicators
        indicators = []
        if sync.is_stale:
            indicators.append("STALE")
        if sync.line_count > 200:
            indicators.append("LARGE")
        if sync.status:
            indicators.append(sync.status)

        indicator_str = f" [{', '.join(indicators)}]" if indicators else ""

        # Date info
        if sync.days_old is not None:
            if sync.days_old == 0:
                date_str = "today"
            elif sync.days_old == 1:
                date_str = "yesterday"
            else:
                date_str = f"{sync.days_old}d ago"
        else:
            date_str = "unknown"

        print(f"  {sync.relative_path}")
        print(f"    Updated: {date_str} | Lines: {sync.line_count}{indicator_str}")
        if sync.updated_by:
            print(f"    By: {sync.updated_by}")
        print()

    # Recommendations
    if stale:
        print("-" * 60)
        print("Recommendations:")
        print()
        print(f"  - {stale} stale SYNC file(s) need review")
        print("    Update LAST_UPDATED dates after reviewing content")
        print()


def sync_command(target_dir: Path, max_lines: int = 200) -> int:
    """Run the sync command - auto-archives, re-ingests docs, then shows status."""
    # Auto-archive large files first
    archived = archive_all_syncs(target_dir, max_lines)

    # Re-ingest docs and mind files to graph (if graph available)
    try:
        from .physics.graph.graph_ops import GraphOps
        from .ingest.docs import ingest_docs_to_graph, ingest_mind_to_graph

        repo_name = target_dir.name
        graph_ops = GraphOps(graph_name=repo_name)

        print("Syncing to graph...")
        doc_stats = ingest_docs_to_graph(target_dir, graph_ops)
        print(f"  ✓ docs: {doc_stats['docs_ingested']} ingested, {doc_stats['stubs_created']} stubs, {doc_stats['tasks_created']} tasks")

        mind_stats = ingest_mind_to_graph(target_dir, graph_ops)
        print(f"  ✓ mind: {mind_stats['files_ingested']} files, {mind_stats['spaces_created']} spaces")
    except ImportError:
        pass  # Graph engine not available
    except Exception as e:
        print(f"  ○ Sync skipped: {e}")

    # Show status (including what was archived)
    print_sync_status(target_dir, archived)
    return 0
