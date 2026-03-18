# DOCS: docs/cli/core/PATTERNS_Why_CLI_Over_Copy.md
"""
Project Map - Visual representation of module structure and health.

Core analysis functions for visualizing:
- Modules organized by area/feature (from modules.yaml)
- Dependencies between modules (arrows)
- Documentation coverage per module ([P][B][A][V][T][S])
- Health warnings (monoliths)
- Line counts per module

HTML generation has been extracted to project_map_html.py
"""

import re
from pathlib import Path
from typing import Dict, List, Any
from dataclasses import dataclass, field

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


@dataclass
class ModuleInfo:
    """Information about a single module."""
    name: str
    code_pattern: str
    docs_path: str
    maturity: str = "UNKNOWN"
    depends_on: List[str] = field(default_factory=list)

    # Computed
    code_files: List[Path] = field(default_factory=list)
    total_lines: int = 0
    doc_coverage: Dict[str, bool] = field(default_factory=dict)
    is_monolith: bool = False


def load_modules_yaml(project_dir: Path) -> Dict[str, Any]:
    """Load modules.yaml configuration."""
    if not HAS_YAML:
        return {}

    config_path = project_dir / "modules.yaml"
    if not config_path.exists():
        return {}

    try:
        with open(config_path) as f:
            data = yaml.safe_load(f)
            return data.get("modules", {}) if data else {}
    except Exception:
        return {}


def count_file_lines(file_path: Path) -> int:
    """Count non-empty lines in a file."""
    try:
        return sum(1 for line in file_path.read_text().splitlines() if line.strip())
    except Exception:
        return 0


def glob_to_regex(pattern: str) -> str:
    """Convert a glob pattern to regex."""
    # Escape special chars except * and **
    result = re.escape(pattern)
    # ** matches any path
    result = result.replace(r'\*\*', '.*')
    # * matches within path segment
    result = result.replace(r'\*', '[^/]*')
    return f"^{result}$"


def find_code_files(project_dir: Path, pattern: str) -> List[Path]:
    """Find all code files matching a pattern."""
    files = []

    # Handle glob-style patterns
    if '**' in pattern:
        base = pattern.split('**')[0].rstrip('/')
        base_path = project_dir / base if base else project_dir
        if base_path.exists():
            for f in base_path.rglob('*'):
                if f.is_file() and f.suffix in ['.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs']:
                    files.append(f)
    elif '*' in pattern:
        base = pattern.split('*')[0].rstrip('/')
        base_path = project_dir / base if base else project_dir
        if base_path.exists():
            for f in base_path.glob('*'):
                if f.is_file() and f.suffix in ['.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs']:
                    files.append(f)
    else:
        # Exact path
        path = project_dir / pattern
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            for f in path.rglob('*'):
                if f.is_file() and f.suffix in ['.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs']:
                    files.append(f)

    return files


def check_doc_coverage(project_dir: Path, docs_path: str) -> Dict[str, bool]:
    """Check which doc types exist for a module."""
    doc_types = {
        'P': 'PATTERNS',
        'B': 'BEHAVIORS',
        'A': 'ALGORITHM',
        'V': 'VALIDATION',
        'T': 'TEST',
        'S': 'SYNC'
    }

    coverage = {k: False for k in doc_types.keys()}

    docs_dir = project_dir / docs_path
    if not docs_dir.exists():
        return coverage

    # Check for doc files in the docs path and its subdirectories
    for md_file in docs_dir.rglob('*.md'):
        for short, prefix in doc_types.items():
            if md_file.name.startswith(prefix + '_'):
                coverage[short] = True

    return coverage


def analyze_modules(project_dir: Path, monolith_threshold: int = 500) -> List[ModuleInfo]:
    """Analyze all modules defined in modules.yaml."""
    modules_config = load_modules_yaml(project_dir)

    if not modules_config:
        return []

    modules = []

    for name, config in modules_config.items():
        if not isinstance(config, dict):
            continue

        module = ModuleInfo(
            name=name,
            code_pattern=config.get('code', ''),
            docs_path=config.get('docs', ''),
            maturity=config.get('maturity', 'UNKNOWN'),
            depends_on=config.get('depends_on', []) or []
        )

        # Find code files
        if module.code_pattern:
            module.code_files = find_code_files(project_dir, module.code_pattern)
            module.total_lines = sum(count_file_lines(f) for f in module.code_files)
            module.is_monolith = module.total_lines > monolith_threshold * 2  # Aggregate threshold

        # Check doc coverage
        if module.docs_path:
            module.doc_coverage = check_doc_coverage(project_dir, module.docs_path)

        modules.append(module)

    return modules


def format_doc_coverage(coverage: Dict[str, bool]) -> str:
    """Format doc coverage as [P][B][A][V][T][S] with filled/empty indicators."""
    result = []
    for key in ['P', 'B', 'A', 'V', 'T', 'S']:
        if coverage.get(key, False):
            result.append(f"[{key}]")
        else:
            result.append(f"[·]")
    return ''.join(result)


def format_doc_coverage_short(coverage: Dict[str, bool]) -> str:
    """Format doc coverage as compact string like 'PBS' for present docs."""
    return ''.join(k for k, v in coverage.items() if v) or '?'


def draw_box(name: str, lines: int, coverage: Dict[str, bool], is_monolith: bool, width: int = 15) -> List[str]:
    """Draw a single module box."""
    warning = " ⚠" if is_monolith else ""
    line_str = f"{lines}L{warning}"
    cov_str = format_doc_coverage(coverage)

    # Calculate content width
    content_width = max(len(name), len(line_str), len(cov_str))
    box_width = max(width, content_width + 4)
    inner = box_width - 2

    lines_out = []
    lines_out.append("┌" + "─" * inner + "┐")
    lines_out.append("│" + name.center(inner) + "│")
    lines_out.append("│" + line_str.center(inner) + "│")
    lines_out.append("│" + cov_str.center(inner) + "│")
    lines_out.append("└" + "─" * inner + "┘")

    return lines_out


def topological_layers(modules: List[ModuleInfo]) -> List[List[ModuleInfo]]:
    """Group modules into layers based on dependencies."""
    module_map = {m.name: m for m in modules}
    layers = []
    assigned = set()

    while len(assigned) < len(modules):
        # Find modules whose dependencies are all assigned
        layer = []
        for m in modules:
            if m.name in assigned:
                continue
            # All deps must be already assigned (or not in our module set)
            deps_satisfied = all(
                d in assigned or d not in module_map
                for d in m.depends_on
            )
            if deps_satisfied:
                layer.append(m)

        if not layer:
            # Circular dependency - add remaining
            layer = [m for m in modules if m.name not in assigned]

        for m in layer:
            assigned.add(m.name)
        layers.append(layer)

    return layers


def generate_project_map(project_dir: Path) -> str:
    """Generate ASCII project map visualization."""
    modules = analyze_modules(project_dir)

    if not modules:
        return "No modules found in modules.yaml"

    output = []
    output.append("┌" + "─" * 70 + "┐")
    output.append("│" + "PROJECT MAP".center(70) + "│")
    output.append("│" + f"{project_dir.name}".center(70) + "│")
    output.append("└" + "─" * 70 + "┘")
    output.append("")

    # Group into topological layers
    layers = topological_layers(modules)

    BOX_WIDTH = 18
    BOX_SPACING = 2

    def draw_layer(layer: List[ModuleInfo]) -> List[str]:
        """Draw a layer of module boxes."""
        if not layer:
            return []

        boxes = [draw_box(m.name, m.total_lines, m.doc_coverage, m.is_monolith, BOX_WIDTH) for m in layer]
        max_lines = max(len(b) for b in boxes)

        row_lines = []
        for line_idx in range(max_lines):
            row = ""
            for j, box in enumerate(boxes):
                if line_idx < len(box):
                    row += box[line_idx]
                else:
                    row += " " * BOX_WIDTH
                if j < len(boxes) - 1:
                    row += " " * BOX_SPACING
            row_lines.append(row)

        return row_lines

    # Draw each layer with arrows between
    for i, layer in enumerate(layers):
        if i == 0:
            output.append("─── FOUNDATION (no dependencies) " + "─" * 37)
        else:
            output.append(f"─── LAYER {i} " + "─" * 58)
        output.append("")

        output.extend(draw_layer(layer))
        output.append("")

        # Draw dependency arrows to next layer
        if i < len(layers) - 1:
            next_layer = layers[i + 1]
            arrow_lines = []
            for nm in next_layer:
                deps_in_current = [d for d in nm.depends_on if any(m.name == d for m in layer)]
                if deps_in_current:
                    arrow_lines.append(f"        ↑ {nm.name} uses [{', '.join(deps_in_current)}]")

            if arrow_lines:
                output.append("        │")
                for al in arrow_lines:
                    output.append(al)
                output.append("")

    # Legend
    output.append("─── LEGEND " + "─" * 59)
    output.append("")
    output.append("[P]ATTERNS [B]EHAVIORS [A]LGORITHM [V]ALIDATION [T]EST [S]YNC")
    output.append("[·] = missing    ⚠ = monolith (>1000L)")
    output.append("")

    # Summary stats
    total_lines = sum(m.total_lines for m in modules)
    total_files = sum(len(m.code_files) for m in modules)
    monoliths = sum(1 for m in modules if m.is_monolith)

    coverage_totals = {k: sum(1 for m in modules if m.doc_coverage.get(k, False)) for k in ['P', 'B', 'A', 'V', 'T', 'S']}

    output.append("─── SUMMARY " + "─" * 58)
    output.append("")
    output.append(f"Modules: {len(modules)}    Files: {total_files}    Lines: {total_lines}")
    if monoliths:
        output.append(f"⚠ Monoliths: {monoliths}")

    cov_summary = " ".join(f"{k}:{v}/{len(modules)}" for k, v in coverage_totals.items())
    output.append(f"Doc coverage: {cov_summary}")
    output.append("")

    return "\n".join(output)


# Re-export HTML functions for backwards compatibility
from .project_map_html import generate_html_map, print_project_map

__all__ = [
    'ModuleInfo',
    'load_modules_yaml',
    'count_file_lines',
    'glob_to_regex',
    'find_code_files',
    'check_doc_coverage',
    'analyze_modules',
    'format_doc_coverage',
    'format_doc_coverage_short',
    'draw_box',
    'topological_layers',
    'generate_project_map',
    'generate_html_map',
    'print_project_map',
]


if __name__ == "__main__":
    import sys
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    print_project_map(target)
