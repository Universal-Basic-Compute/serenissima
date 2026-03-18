"""
Context and dependency analysis for mind CLI.

Provides:
- Import parsing for Python and TypeScript/JavaScript files
- Module documentation discovery
- Dependency mapping
- Trace logging for access patterns

DOCS: docs/cli/core/PATTERNS_Why_CLI_Over_Copy.md
"""

import json
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any


# =============================================================================
# TRACE LOGGING
# =============================================================================

def get_traces_dir(target_dir: Path) -> Path:
    """Get the traces directory, creating if needed."""
    traces_dir = target_dir / ".mind" / "traces"
    traces_dir.mkdir(parents=True, exist_ok=True)
    return traces_dir


def log_trace(target_dir: Path, action: str, file_path: str, via: str = "direct", session: Optional[str] = None):
    """
    Log a trace entry.

    Args:
        target_dir: Project root
        action: What happened (read, context, view-load)
        file_path: File that was accessed (relative to project root)
        via: How it was accessed (context-cmd, direct, validate)
        session: Optional session identifier
    """
    traces_dir = get_traces_dir(target_dir)
    today = datetime.now().strftime("%Y-%m-%d")
    trace_file = traces_dir / f"{today}.jsonl"

    entry = {
        "ts": datetime.now().isoformat(),
        "action": action,
        "file": file_path,
        "via": via,
    }
    if session:
        entry["session"] = session

    with open(trace_file, "a") as f:
        f.write(json.dumps(entry) + "\n")


def read_traces(target_dir: Path, days: int = 7) -> List[Dict[str, Any]]:
    """Read trace entries from the last N days."""
    traces_dir = target_dir / ".mind" / "traces"
    if not traces_dir.exists():
        return []

    traces = []
    cutoff = datetime.now() - timedelta(days=days)

    for trace_file in sorted(traces_dir.glob("*.jsonl")):
        # Parse date from filename
        try:
            file_date = datetime.strptime(trace_file.stem, "%Y-%m-%d")
            if file_date < cutoff:
                continue
        except ValueError:
            continue

        with open(trace_file) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        traces.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

    return traces


def analyze_traces(traces: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze trace data and return summary statistics."""
    if not traces:
        return {"total": 0, "sessions": 0, "by_file": {}, "by_action": {}}

    # Count by file
    file_counts = Counter(t.get("file", "unknown") for t in traces)

    # Count by action
    action_counts = Counter(t.get("action", "unknown") for t in traces)

    # Count unique sessions
    sessions = set(t.get("session", None) for t in traces if t.get("session"))

    # Group by day
    by_day = {}
    for t in traces:
        ts = t.get("ts", "")
        if ts:
            day = ts[:10]  # YYYY-MM-DD
            by_day[day] = by_day.get(day, 0) + 1

    return {
        "total": len(traces),
        "sessions": len(sessions),
        "by_file": dict(file_counts.most_common(20)),
        "by_action": dict(action_counts),
        "by_day": by_day,
    }


def print_trace_summary(target_dir: Path, days: int = 7):
    """Print a summary of recent file access patterns."""
    traces = read_traces(target_dir, days)
    analysis = analyze_traces(traces)

    print(f"## Context Access Patterns (last {days} days)")
    print()
    print(f"**Total accesses:** {analysis['total']}")
    print(f"**Sessions:** {analysis['sessions']}")
    print()

    if analysis['by_action']:
        print("### By Action")
        print()
        for action, count in sorted(analysis['by_action'].items(), key=lambda x: -x[1]):
            print(f"- {action}: {count}")
        print()

    if analysis['by_file']:
        print("### Most Accessed Files")
        print()
        print("| File | Count |")
        print("|------|-------|")
        for filepath, count in list(analysis['by_file'].items())[:15]:
            print(f"| `{filepath}` | {count} |")
        print()

    if analysis['by_day']:
        print("### Activity by Day")
        print()
        for day in sorted(analysis['by_day'].keys()):
            count = analysis['by_day'][day]
            bar = "█" * min(count, 50)
            print(f"{day}: {bar} ({count})")
        print()


def clear_traces(target_dir: Path, before_days: int = 30):
    """Clear trace files older than N days."""
    traces_dir = target_dir / ".mind" / "traces"
    if not traces_dir.exists():
        return 0

    cutoff = datetime.now() - timedelta(days=before_days)
    deleted = 0

    for trace_file in traces_dir.glob("*.jsonl"):
        try:
            file_date = datetime.strptime(trace_file.stem, "%Y-%m-%d")
            if file_date < cutoff:
                trace_file.unlink()
                deleted += 1
        except (ValueError, OSError):
            continue

    return deleted


# =============================================================================
# IMPORT PARSING
# =============================================================================

def parse_imports(file_path: Path) -> List[str]:
    """
    Parse imports from a Python or TypeScript/JavaScript file.
    Returns list of imported module paths (relative).
    """
    if not file_path.exists():
        return []

    imports = []
    content = file_path.read_text()
    suffix = file_path.suffix

    if suffix == '.py':
        # Python imports
        # import foo, from foo import bar, from foo.bar import baz
        import_pattern = re.compile(r'^(?:from\s+([\w.]+)|import\s+([\w.]+))', re.MULTILINE)
        for match in import_pattern.finditer(content):
            module = match.group(1) or match.group(2)
            if module and not module.startswith('_'):
                imports.append(module.replace('.', '/'))

    elif suffix in ['.ts', '.tsx', '.js', '.jsx']:
        # TypeScript/JavaScript imports
        # import x from 'y', import { x } from 'y', require('y')
        import_pattern = re.compile(r'''(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))''')
        for match in import_pattern.finditer(content):
            module = match.group(1) or match.group(2)
            if module and not module.startswith('.'):
                # External package, skip
                continue
            if module:
                # Normalize relative imports
                imports.append(module.lstrip('./').replace('/', '/'))

    return imports


def find_file_from_import(target_dir: Path, importing_file: Path, import_path: str) -> Optional[Path]:
    """
    Resolve an import path to an actual file.
    """
    # Try relative to importing file
    base_dir = importing_file.parent

    # Common extensions to try
    extensions = ['', '.py', '.ts', '.tsx', '.js', '.jsx']
    prefixes = ['', 'src/', 'lib/', 'app/']

    for prefix in prefixes:
        for ext in extensions:
            # Try relative path
            candidate = base_dir / (import_path + ext)
            if candidate.exists() and candidate.is_file():
                return candidate

            # Try from project root
            candidate = target_dir / prefix / (import_path + ext)
            if candidate.exists() and candidate.is_file():
                return candidate

            # Try as directory with index
            candidate = target_dir / prefix / import_path / f"index{ext}"
            if candidate.exists() and candidate.is_file():
                return candidate

    return None


# =============================================================================
# MODULE DOCUMENTATION DISCOVERY
# =============================================================================

def find_module_docs(target_dir: Path, file_path: Path) -> Optional[Path]:
    """
    Find the docs folder for a given file.

    Looks for docs/{area}/{module}/ that corresponds to the file.
    Uses DOCS: references in file headers if present.
    """
    docs_dir = target_dir / "docs"

    if not docs_dir.exists():
        return None

    # First, check if the file has a DOCS: reference in its header
    if file_path.exists() and file_path.suffix in ['.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java']:
        try:
            content = file_path.read_text()
            # Look for DOCS: reference in first 50 lines
            for line in content.split('\n')[:50]:
                if 'DOCS:' in line:
                    # Extract the path after DOCS:
                    docs_ref = line.split('DOCS:')[1].strip().strip('"\'')
                    # Handle relative paths
                    if docs_ref.startswith('./') or docs_ref.startswith('../'):
                        resolved = (file_path.parent / docs_ref).resolve()
                    else:
                        resolved = (target_dir / docs_ref).resolve()
                    if resolved.exists():
                        return resolved
        except Exception:
            pass

    # Fallback: try to match file path to docs structure
    # e.g., mind/cli.py -> docs/mind/cli/
    try:
        rel_path = file_path.relative_to(target_dir)
    except ValueError:
        rel_path = file_path

    # Try various mappings
    parts = list(rel_path.parts)

    # Remove common prefixes like 'src', 'lib', 'app'
    if parts and parts[0] in ['src', 'lib', 'app', 'pkg']:
        parts = parts[1:]

    # Remove file extension for the module name
    if parts:
        parts[-1] = Path(parts[-1]).stem

    # Try to find matching docs folder
    for i in range(len(parts)):
        # Try area/module pattern
        if len(parts) >= 2:
            potential = docs_dir / parts[0] / '/'.join(parts[1:])
            if potential.exists():
                return potential

        # Try just the path as-is
        potential = docs_dir / '/'.join(parts)
        if potential.exists():
            return potential

    return None


def get_module_context(target_dir: Path, file_path: Path, visited: Optional[set] = None) -> dict:
    """
    Get all documentation context for a file/module.

    Returns dict with:
    - file: the file path
    - module_docs: path to docs folder
    - docs: dict of doc type -> content
    - chain: list of linked doc files
    - imports: list of import paths
    - import_files: list of resolved import file paths
    - import_docs: dict of import path -> docs folder
    - siblings: list of files in same directory
    """
    if visited is None:
        visited = set()

    result = {
        'file': str(file_path),
        'module_docs': None,
        'docs': {},
        'chain': [],
        'imports': [],
        'import_files': [],
        'import_docs': {},
        'siblings': [],
    }

    # Avoid cycles
    file_key = str(file_path.resolve()) if file_path.exists() else str(file_path)
    if file_key in visited:
        return result
    visited.add(file_key)

    # Find the docs folder for this file
    docs_folder = find_module_docs(target_dir, file_path)

    if docs_folder:
        result['module_docs'] = str(docs_folder)

        # Collect all doc files
        doc_types = ['PATTERNS', 'BEHAVIORS', 'ALGORITHM', 'VALIDATION', 'TEST', 'SYNC']

        for doc_type in doc_types:
            matching = list(docs_folder.glob(f'{doc_type}_*.md'))
            if matching:
                for doc_file in matching:
                    result['docs'][doc_file.name] = doc_file.read_text()
                    result['chain'].append(str(doc_file))

    # Parse imports from the file
    if file_path.exists():
        imports = parse_imports(file_path)
        result['imports'] = imports

        # Resolve imports to actual files and find their docs
        for imp in imports:
            resolved = find_file_from_import(target_dir, file_path, imp)
            if resolved:
                result['import_files'].append(str(resolved))
                # Find docs for the imported module
                imp_docs = find_module_docs(target_dir, resolved)
                if imp_docs:
                    result['import_docs'][imp] = str(imp_docs)

        # Find sibling files (same directory, same extension)
        suffix = file_path.suffix
        if suffix and file_path.parent.exists():
            for sibling in file_path.parent.glob(f'*{suffix}'):
                if sibling.resolve() != file_path.resolve() and sibling.is_file():
                    result['siblings'].append(str(sibling.resolve()))

    return result


def build_dependency_map(target_dir: Path, file_path: Path, depth: int = 2) -> dict:
    """
    Build a dependency map for a file, following imports up to `depth` levels.

    Returns a map structure with the file at center and its relationships.
    """
    visited = set()
    map_data = {
        'root': str(file_path),
        'nodes': {},  # file_path -> context summary
        'edges': [],  # (from, to, type)
    }

    def add_node(fp: Path, current_depth: int):
        if current_depth > depth:
            return

        fp_str = str(fp.resolve()) if fp.exists() else str(fp)
        if fp_str in visited:
            return
        visited.add(fp_str)

        # Don't pass visited to get_module_context - it's only for map recursion
        ctx = get_module_context(target_dir, fp)

        # Add node
        map_data['nodes'][fp_str] = {
            'file': ctx['file'],
            'has_docs': ctx['module_docs'] is not None,
            'docs_folder': ctx['module_docs'],
            'doc_count': len(ctx['docs']),
        }

        # Add edges for imports
        for imp_file in ctx['import_files']:
            map_data['edges'].append((fp_str, imp_file, 'imports'))
            # Recurse
            imp_path = Path(imp_file)
            if imp_path.exists():
                add_node(imp_path, current_depth + 1)

        # Add edges for siblings (weaker relationship)
        for sib in ctx['siblings'][:5]:  # Limit siblings
            map_data['edges'].append((fp_str, sib, 'sibling'))

    add_node(file_path, 0)
    return map_data


def print_module_context(target_dir: Path, file_path: Path):
    """Print the full documentation context for a file, including dependency map."""
    # Resolve the file path
    if not file_path.is_absolute():
        file_path = (target_dir / file_path).resolve()

    # Get context for the main file
    context = get_module_context(target_dir, file_path)

    # Log trace for the context request
    try:
        rel_path = str(file_path.relative_to(target_dir))
    except ValueError:
        rel_path = str(file_path)
    log_trace(target_dir, "context", rel_path, via="context-cmd")

    # Log each doc in the chain
    for chain_file in context.get('chain', []):
        try:
            chain_rel = str(Path(chain_file).relative_to(target_dir))
        except ValueError:
            chain_rel = chain_file
        log_trace(target_dir, "read", chain_rel, via="context-cmd")

    # Build dependency map
    dep_map = build_dependency_map(target_dir, file_path)

    print(f"## Context for: {context['file']}")
    print()

    # Print dependency map first
    print("### Dependency Map")
    print()
    print("```")
    print(f"{file_path.name}")

    # Group edges by type
    imports = [(e[0], e[1]) for e in dep_map['edges'] if e[2] == 'imports' and e[0] == str(file_path.resolve())]
    siblings = [(e[0], e[1]) for e in dep_map['edges'] if e[2] == 'sibling' and e[0] == str(file_path.resolve())]

    if imports:
        print("├── imports:")
        for i, (_, to) in enumerate(imports):
            prefix = "│   └──" if i == len(imports) - 1 else "│   ├──"
            to_name = Path(to).name
            has_docs = dep_map['nodes'].get(to, {}).get('has_docs', False)
            docs_marker = " [docs]" if has_docs else ""
            print(f"{prefix} {to_name}{docs_marker}")

    if siblings:
        print("├── siblings:")
        for i, (_, to) in enumerate(siblings[:3]):  # Show max 3
            prefix = "│   └──" if i == min(len(siblings), 3) - 1 else "│   ├──"
            print(f"{prefix} {Path(to).name}")
        if len(siblings) > 3:
            print(f"│   └── ... and {len(siblings) - 3} more")

    if context['module_docs']:
        print(f"└── docs: {context['module_docs']}")
    else:
        print("└── docs: (none)")

    print("```")
    print()

    # Print main file docs
    if not context['module_docs']:
        print("**No linked documentation found for this file.**")
        print()
        print("To link docs, add a DOCS: reference in the file header:")
        print('```python')
        print('"""')
        print('Module description')
        print('')
        print('DOCS: docs/{area}/{module}/')
        print('"""')
        print('```')
        print()
    else:
        print(f"### Main File Docs: {context['module_docs']}")
        print()
        print(f"**Chain:** {len(context['chain'])} file(s)")
        for chain_file in context['chain']:
            print(f"  - {Path(chain_file).name}")
        print()

    # Print import docs summary
    if context['import_docs']:
        print("### Import Docs")
        print()
        print("| Import | Docs |")
        print("|--------|------|")
        for imp, docs_path in context['import_docs'].items():
            print(f"| `{imp}` | `{docs_path}` |")
        print()

    # Print full docs
    if context['docs']:
        print("---")
        print()
        print("## Full Documentation")
        print()

        for filename, content in context['docs'].items():
            print(f"### {filename}")
            print()
            print(content)
            print()
            print("---")
            print()

    return bool(context['module_docs'] or context['import_docs'])
