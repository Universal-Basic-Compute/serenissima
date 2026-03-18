# DOCS: docs/cli/core/IMPLEMENTATION_CLI_Code_Architecture/overview/IMPLEMENTATION_Overview.md
"""
Repository Overview Formatting Functions.

Extracted from repo_overview.py to manage file size.
Provides markdown, YAML, and JSON output formatters.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, TYPE_CHECKING
from dataclasses import asdict

if TYPE_CHECKING:
    from .repo_overview import FileInfo, RepoOverview

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


def _format_size(chars: int) -> str:
    """Format character count with K/M suffix."""
    if chars >= 1_000_000:
        return f"{chars / 1_000_000:.1f}M"
    elif chars >= 1_000:
        return f"{chars / 1_000:.1f}K"
    else:
        return str(chars)


def _strip_section_titles(content: str) -> str:
    """Remove ## section titles and ### subtitles to reduce size."""
    lines = content.split('\n')
    result = []
    skip_next_empty = False
    for line in lines:
        # Skip ## and ### headers
        if line.startswith('## ') or line.startswith('### '):
            skip_next_empty = True
            continue
        # Skip empty line after header
        if skip_next_empty and line == '':
            skip_next_empty = False
            continue
        skip_next_empty = False
        result.append(line)
    return '\n'.join(result)


def file_info_to_dict(info: "FileInfo") -> Dict[str, Any]:
    """Convert FileInfo to dict, handling nested structures."""
    result = {
        'path': info.path,
        'type': info.type,
    }
    if info.language:
        result['language'] = info.language
    if info.chars:
        result['chars'] = info.chars
    if info.total_chars:
        result['total_chars'] = info.total_chars
    if info.docs_ref:
        result['docs_ref'] = info.docs_ref
    if info.code_refs:
        result['code_refs'] = info.code_refs
    if info.doc_refs:
        result['doc_refs'] = info.doc_refs
    if info.imports:
        result['imports'] = info.imports
    if info.sections:
        result['sections'] = info.sections
    if info.functions:
        result['functions'] = info.functions
    if info.children:
        result['children'] = [file_info_to_dict(c) for c in info.children]
    return result


def overview_to_dict(overview: "RepoOverview") -> Dict[str, Any]:
    """Convert RepoOverview to dict."""
    return {
        'project_name': overview.project_name,
        'generated_at': overview.generated_at,
        'stats': overview.stats,
        'dependencies': [asdict(d) for d in overview.dependencies],
        'file_tree': file_info_to_dict(overview.file_tree),
    }


def format_markdown(overview: "RepoOverview", max_size: int = 40000) -> str:
    """Format overview as markdown.

    Args:
        overview: The repository overview data
        max_size: If output exceeds this size, strip ## titles (default 40K)
    """
    # Import here to avoid circular import
    from .repo_overview import FileInfo

    lines = []
    lines.append(f"# Repository Map: {overview.project_name}")
    lines.append("")
    lines.append(f"*Generated: {overview.generated_at}*")
    lines.append("")

    # Stats
    lines.append("## Statistics")
    lines.append("")
    lines.append(f"- **Files:** {overview.stats['total_files']}")
    lines.append(f"- **Directories:** {overview.stats['total_dirs']}")
    lines.append(f"- **Total Size:** {_format_size(overview.stats['total_chars'])}")
    lines.append(f"- **Doc Files:** {overview.stats.get('doc_files', 0)}")
    lines.append(f"- **Code Files:** {overview.stats.get('code_files', 0)}")
    lines.append(f"- **Areas:** {overview.stats.get('areas', 0)} (docs/ subfolders)")
    lines.append(f"- **Modules:** {overview.stats.get('modules', 0)} (subfolders in areas)")
    lines.append(f"- **DOCS Links:** {overview.stats.get('link_count', 0)} ({overview.stats.get('avg_links_per_file', 0)} avg per code file)")
    lines.append("")

    if overview.stats.get('by_language'):
        lines.append("### By Language")
        lines.append("")
        for lang, count in sorted(overview.stats['by_language'].items(), key=lambda x: -x[1]):
            lines.append(f"- {lang}: {count}")
        lines.append("")

    # Dependencies
    if overview.dependencies:
        lines.append("## Module Dependencies")
        lines.append("")
        lines.append("```mermaid")
        lines.append("graph TD")
        for dep in overview.dependencies:
            node_id = dep.name.replace('-', '_').replace('.', '_')
            lines.append(f"    {node_id}[{dep.name}]")
            for d in dep.depends_on:
                dep_id = d.replace('-', '_').replace('.', '_')
                lines.append(f"    {node_id} --> {dep_id}")
        lines.append("```")
        lines.append("")

        lines.append("### Module Details")
        lines.append("")
        lines.append("| Module | Code | Docs | Lines | Files | Dependencies |")
        lines.append("|--------|------|------|-------|-------|--------------|")
        for dep in overview.dependencies:
            deps_str = ', '.join(dep.depends_on) if dep.depends_on else '-'
            lines.append(f"| {dep.name} | `{dep.code_pattern}` | `{dep.docs_path}` | {dep.lines} | {dep.files} | {deps_str} |")
        lines.append("")

    # File tree
    lines.append("## File Tree")
    lines.append("")
    lines.append("```")

    def render_tree(node: FileInfo, prefix: str = "", is_last: bool = True):
        connector = "└── " if is_last else "├── "
        # Only show the basename, not full path
        name = Path(node.path).name
        if node.type == 'dir':
            # Show directory with total chars
            dir_info = f"{name}/"
            if node.total_chars:
                dir_info += f" ({_format_size(node.total_chars)})"
            lines.append(f"{prefix}{connector}{dir_info}")
            new_prefix = prefix + ("    " if is_last else "│   ")

            # Render children
            total_items = len(node.children) + (1 if node.hidden_count > 0 else 0)
            for i, child in enumerate(node.children):
                is_child_last = (i == len(node.children) - 1) and node.hidden_count == 0
                render_tree(child, new_prefix, is_child_last)

            # Show hidden files indicator
            if node.hidden_count > 0:
                hidden_connector = "└── "
                lines.append(f"{new_prefix}{hidden_connector}(..{node.hidden_count} more files)")
        else:
            info = name
            if node.chars:
                info += f" ({_format_size(node.chars)})"
            if node.docs_ref:
                info += " →"  # Arrow indicates has docs link
            lines.append(f"{prefix}{connector}{info}")

    # Start with root's children (not root itself)
    for i, child in enumerate(overview.file_tree.children):
        render_tree(child, "", i == len(overview.file_tree.children) - 1)

    lines.append("```")
    lines.append("")

    # File details with sections/functions
    lines.append("## File Details")
    lines.append("")

    def render_details(node: FileInfo, path_parts: List[str] = None):
        if path_parts is None:
            path_parts = []

        name = Path(node.path).name
        current_parts = path_parts + [name]

        if node.type == 'file':
            if node.sections or node.functions or node.docs_ref or node.code_refs or node.doc_refs or node.imports:
                full_path = "/".join(current_parts)
                lines.append(f"### `{full_path}`")
                lines.append("")
                if node.docs_ref:
                    lines.append(f"**Docs:** `{node.docs_ref}`")
                    lines.append("")
                if node.code_refs:
                    lines.append("**Code refs:**")
                    for ref in node.code_refs:
                        lines.append(f"- `{ref}`")
                    lines.append("")
                if node.doc_refs:
                    lines.append("**Doc refs:**")
                    for ref in node.doc_refs:
                        lines.append(f"- `{ref}`")
                    lines.append("")
                if node.imports:
                    lines.append("**Imports:**")
                    for imp in node.imports:
                        lines.append(f"- `{imp}`")
                    lines.append("")
                if node.sections:
                    lines.append("**Sections:**")
                    for s in node.sections:
                        lines.append(f"- {s}")
                    lines.append("")
                if node.functions:
                    lines.append("**Definitions:**")
                    for f in node.functions:
                        lines.append(f"- `{f}`")
                    lines.append("")
        elif node.type == 'dir':
            for child in node.children:
                render_details(child, current_parts)

    for child in overview.file_tree.children:
        render_details(child, [])

    result = "\n".join(lines)

    # Strip ## titles if output is too large
    if max_size > 0 and len(result) > max_size:
        result = _strip_section_titles(result)

    return result


def format_yaml(overview: "RepoOverview") -> str:
    """Format overview as YAML."""
    if not HAS_YAML:
        return "# YAML not available - install pyyaml"
    return yaml.dump(overview_to_dict(overview), default_flow_style=False, sort_keys=False)


def format_json(overview: "RepoOverview") -> str:
    """Format overview as JSON."""
    return json.dumps(overview_to_dict(overview), indent=2)
