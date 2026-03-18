"""
Project Map HTML Generation - Interactive HTML visualization of module structure.

This module handles HTML generation for project maps, extracted from project_map.py
to reduce file size and improve maintainability.

DOCS: docs/mind-cli/project-map/
"""

import json
import os
from pathlib import Path
from typing import Optional

from .project_map import analyze_modules, topological_layers
from .core_utils import HAS_YAML

if HAS_YAML:
    import yaml


def load_project_map_config(project_dir: Path) -> dict:
    """Load project map HTML configuration from .mind/config.yaml."""
    config_path = project_dir / ".mind" / "config.yaml"
    if not HAS_YAML or not config_path.exists():
        return {}

    try:
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}
        return data.get("project_map_html", {}) or {}
    except Exception:
        return {}


def generate_html_map(project_dir: Path) -> str:
    """Generate an interactive HTML project map visualization."""
    modules = analyze_modules(project_dir)
    layers = topological_layers(modules)

    module_map = {m.name: m for m in modules}

    # Calculate positions
    positions = {}
    y_offset = 100
    layer_height = 180

    for layer_idx, layer in enumerate(layers):
        x_spacing = 200
        start_x = 50
        for mod_idx, mod in enumerate(layer):
            positions[mod.name] = {
                'x': start_x + mod_idx * x_spacing,
                'y': y_offset + layer_idx * layer_height
            }

    # Build edges
    edges = []
    for m in modules:
        for dep in m.depends_on:
            if dep in positions:
                edges.append((m.name, dep))

    # Get project name
    project_name = project_dir.resolve().name

    project_map_config = load_project_map_config(project_dir)
    svg_namespace = os.getenv("MIND_SVG_NAMESPACE") or project_map_config.get("svg_namespace", "")

    # Generate HTML
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Map - {project_name}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #eee;
            min-height: 100vh;
            padding: 20px;
        }}
        h1 {{
            text-align: center;
            margin-bottom: 20px;
            color: #fff;
        }}
        .map-container {{
            position: relative;
            width: 100%;
            min-height: 800px;
        }}
        svg {{
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: visible;
        }}
        .module-box {{
            position: absolute;
            z-index: 10;
            width: 160px;
            background: #16213e;
            border: 2px solid #0f3460;
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }}
        .module-box:hover {{
            border-color: #e94560;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(233, 69, 96, 0.3);
        }}
        .module-box.monolith {{
            border-color: #ff6b6b;
        }}
        .module-box.full-docs {{
            border-color: #4ecdc4;
        }}
        .module-name {{
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 6px;
            color: #fff;
        }}
        .module-lines {{
            font-size: 12px;
            color: #888;
            margin-bottom: 8px;
        }}
        .module-lines.warning {{
            color: #ff6b6b;
        }}
        .doc-coverage {{
            display: flex;
            gap: 2px;
            flex-wrap: wrap;
        }}
        .doc-badge {{
            font-size: 10px;
            padding: 2px 4px;
            border-radius: 3px;
            background: #0f3460;
            color: #666;
        }}
        .doc-badge.present {{
            background: #4ecdc4;
            color: #000;
        }}
        .doc-badge.missing {{
            background: #333;
            color: #555;
        }}
        .legend {{
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #16213e;
            padding: 16px;
            border-radius: 8px;
            font-size: 12px;
        }}
        .legend h3 {{
            margin-bottom: 8px;
        }}
        .legend-item {{
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 4px 0;
        }}
        .legend-color {{
            width: 20px;
            height: 12px;
            border-radius: 2px;
        }}
        .summary {{
            position: fixed;
            top: 20px;
            right: 20px;
            background: #16213e;
            padding: 16px;
            border-radius: 8px;
            font-size: 13px;
        }}
        .layer-label {{
            position: absolute;
            left: 10px;
            font-size: 11px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }}
    </style>
</head>
<body>
    <h1>Project Map: {project_name}</h1>

    <div class="map-container">
        <svg id="arrows" style="height: {y_offset + len(layers) * layer_height + 100}px;"></svg>
'''

    # Add layer labels
    for layer_idx, layer in enumerate(layers):
        if layer:
            y = y_offset + layer_idx * layer_height - 30
            label = "Foundation" if layer_idx == 0 else f"Layer {layer_idx}"
            html += f'        <div class="layer-label" style="top: {y}px">{label}</div>\n'

    # Add module boxes
    for m in modules:
        pos = positions[m.name]
        classes = ["module-box"]
        if m.is_monolith:
            classes.append("monolith")
        if all(m.doc_coverage.get(k, False) for k in ['P', 'B', 'A', 'V', 'T', 'S']):
            classes.append("full-docs")

        line_class = "warning" if m.is_monolith else ""

        doc_badges = ""
        for k in ['P', 'B', 'A', 'V', 'T', 'S']:
            present = m.doc_coverage.get(k, False)
            badge_class = "present" if present else "missing"
            doc_badges += f'<span class="doc-badge {badge_class}">{k}</span>'

        html += f'''
        <div class="{' '.join(classes)}" style="left: {pos['x']}px; top: {pos['y']}px" data-module="{m.name}">
            <div class="module-name">{m.name}</div>
            <div class="module-lines {line_class}">{m.total_lines} lines{' ⚠' if m.is_monolith else ''}</div>
            <div class="doc-coverage">{doc_badges}</div>
        </div>
'''

    # Summary stats
    total_lines = sum(m.total_lines for m in modules)
    total_files = sum(len(m.code_files) for m in modules)
    monoliths = sum(1 for m in modules if m.is_monolith)

    html += f'''
    </div>

    <div class="summary">
        <strong>Summary</strong><br>
        Modules: {len(modules)}<br>
        Files: {total_files}<br>
        Lines: {total_lines}<br>
        {'⚠ Monoliths: ' + str(monoliths) + '<br>' if monoliths else ''}
    </div>

    <div class="legend">
        <h3>Legend</h3>
        <div class="legend-item">
            <div class="legend-color" style="background: #4ecdc4"></div>
            <span>Full documentation</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #ff6b6b"></div>
            <span>Monolith (>1000L)</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: #0f3460"></div>
            <span>Normal module</span>
        </div>
    </div>

    <script>
        // Draw arrows
        const edges = {json.dumps([[e[0], e[1]] for e in edges])};
        const positions = {json.dumps(positions)};

        const svg = document.getElementById('arrows');
        const ns = {json.dumps(svg_namespace)} || svg.namespaceURI;

        // Add arrow marker
        const defs = document.createElementNS(ns, 'defs');
        defs.innerHTML = `
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#4a5568" />
            </marker>
        `;
        svg.appendChild(defs);

        edges.forEach(([from, to]) => {{
            const fromPos = positions[from];
            const toPos = positions[to];
            if (!fromPos || !toPos) return;

            // Draw curved path from bottom of 'from' box to top of 'to' box
            const x1 = fromPos.x + 80;
            const y1 = fromPos.y + 90;  // bottom of from box
            const x2 = toPos.x + 80;
            const y2 = toPos.y;  // top of to box

            const path = document.createElementNS(ns, 'path');
            const midY = (y1 + y2) / 2;
            const d = `M ${{x1}} ${{y1}} C ${{x1}} ${{midY}}, ${{x2}} ${{midY}}, ${{x2}} ${{y2}}`;
            path.setAttribute('d', d);
            path.setAttribute('stroke', '#4a5568');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            svg.appendChild(path);
        }});
    </script>
</body>
</html>
'''
    return html


def print_project_map(project_dir: Path, output_html: Optional[Path] = None):
    """Generate and optionally save the project map."""
    if output_html:
        html = generate_html_map(project_dir)
        output_html.write_text(html)
        print(f"Project map saved to: {output_html}")
    else:
        # Default: generate HTML and open in browser
        import tempfile
        import webbrowser

        html = generate_html_map(project_dir)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False) as f:
            f.write(html)
            temp_path = f.name

        print(f"Opening project map in browser...")
        print(f"File: {temp_path}")
        webbrowser.open(f'file://{temp_path}')
