"""
Markdown Sync: Graph → Markdown

Syncs Narrative nodes to markdown documentation files.

When a Narrative node is created/updated, this module:
1. Finds or creates the target markdown file
2. Upserts the section content (using node ID as anchor)
3. Creates/updates links:
   - contains: Space (module) → Narrative
   - sequence: Narrative → Narrative (prev/next ordering)
   - relates: Narrative → Thing (file pointer)
   - relates: Actor → Narrative (creator, role: originator)

Section ordering is defined by DOC_TYPE_ORDER for each doc type.
"""

import re
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

# =============================================================================
# DOC TYPE ORDERING
# =============================================================================
# Defines section order within each doc type.
# Each entry is a section ID that maps to a Narrative node.

DOC_TYPE_ORDER = {
    "patterns": [
        "overview",
        "problem",
        "pattern",
        "behaviors_supported",
        "behaviors_prevented",
        "principles",
        "data",
        "dependencies",
        "inspirations",
        "scope",
        "markers",
    ],
    "behaviors": [
        "overview",
        "behaviors",
        "markers",
    ],
    "objectives": [
        "overview",
        "objectives",
        "tradeoffs",
        "markers",
    ],
    "algorithm": [
        "overview",
        "inputs",
        "outputs",
        "steps",
        "edge_cases",
        "complexity",
        "markers",
    ],
    "validation": [
        "overview",
        "invariants",
        "tests",
        "markers",
    ],
    "implementation": [
        "overview",
        "architecture",
        "files",
        "data_flow",
        "dependencies",
        "markers",
    ],
    "health": [
        "overview",
        "checks",
        "thresholds",
        "alerts",
        "markers",
    ],
    "sync": [
        "status",
        "recent_changes",
        "handoff",
        "markers",
    ],
}

# Map doc_type to filename prefix
DOC_TYPE_PREFIX = {
    "patterns": "PATTERNS",
    "behaviors": "BEHAVIORS",
    "objectives": "OBJECTIVES",
    "algorithm": "ALGORITHM",
    "validation": "VALIDATION",
    "implementation": "IMPLEMENTATION",
    "health": "HEALTH",
    "sync": "SYNC",
}


# =============================================================================
# MARKDOWN SECTION HANDLING
# =============================================================================

def _node_anchor(node_id: str) -> str:
    """Generate HTML anchor comment for a node."""
    return f"<!-- mind:node:{node_id} -->"


def _parse_sections(content: str) -> List[Tuple[str, Optional[str], str]]:
    """
    Parse markdown into sections.

    Returns list of (header, node_id, body) tuples.
    node_id is extracted from <!-- mind:node:xxx --> if present.
    """
    sections = []
    current_header = None
    current_node_id = None
    current_body = []

    lines = content.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]

        # Check for header
        if line.startswith('## '):
            # Save previous section
            if current_header is not None:
                sections.append((current_header, current_node_id, '\n'.join(current_body).strip()))

            current_header = line[3:].strip()
            current_node_id = None
            current_body = []

            # Check next line for node anchor
            if i + 1 < len(lines):
                next_line = lines[i + 1]
                match = re.search(r'<!-- mind:node:([^\s]+) -->', next_line)
                if match:
                    current_node_id = match.group(1)
                    i += 1  # Skip anchor line
        elif current_header is not None:
            current_body.append(line)

        i += 1

    # Save last section
    if current_header is not None:
        sections.append((current_header, current_node_id, '\n'.join(current_body).strip()))

    return sections


def _rebuild_markdown(
    preamble: str,
    sections: List[Tuple[str, Optional[str], str]]
) -> str:
    """Rebuild markdown from preamble and sections."""
    parts = [preamble.rstrip()]

    for header, node_id, body in sections:
        parts.append(f"\n\n## {header}")
        if node_id:
            parts.append(f"\n{_node_anchor(node_id)}")
        if body:
            parts.append(f"\n\n{body}")

    return '\n'.join(parts) + '\n'


def _extract_preamble(content: str) -> str:
    """Extract content before first ## section."""
    match = re.search(r'^## ', content, re.MULTILINE)
    if match:
        return content[:match.start()]
    return content


def _section_title_from_id(section_id: str) -> str:
    """Convert section_id to display title."""
    return section_id.replace('_', ' ').title()


# =============================================================================
# SYNC FUNCTIONS
# =============================================================================

def sync_narrative_to_markdown(
    node: Dict[str, Any],
    docs_dir: Path,
    graph_ops: Any = None
) -> Optional[Path]:
    """
    Sync a Narrative node to its markdown file.

    Args:
        node: The Narrative node dict with id, name, type, content, etc.
        docs_dir: Path to docs/ directory
        graph_ops: Optional GraphOps for creating links

    Returns:
        Path to the updated markdown file, or None if not synced.
    """
    node_id = node.get('id')
    node_type = node.get('type', '').lower()  # e.g., 'pattern', 'behavior'
    content = node.get('content', '')
    name = node.get('name', node_id)
    module = node.get('module', '')
    section_id = node.get('section_id', 'content')
    actor_id = node.get('created_by')

    if not node_id or not node_type:
        logger.warning(f"Cannot sync node without id or type: {node}")
        return None

    # Determine doc type from node type
    doc_type = node_type.rstrip('s')  # patterns -> pattern
    if doc_type not in DOC_TYPE_PREFIX and f"{doc_type}s" in DOC_TYPE_PREFIX:
        doc_type = f"{doc_type}s"  # pattern -> patterns

    prefix = DOC_TYPE_PREFIX.get(doc_type)
    if not prefix:
        logger.debug(f"No doc type mapping for {doc_type}")
        return None

    # Find or create markdown file
    md_file = _find_or_create_doc_file(docs_dir, module, prefix, name)
    if not md_file:
        return None

    # Read existing content
    if md_file.exists():
        existing = md_file.read_text()
    else:
        existing = _create_doc_template(prefix, module, name)
        md_file.parent.mkdir(parents=True, exist_ok=True)

    # Parse and upsert section
    preamble = _extract_preamble(existing)
    sections = _parse_sections(existing)

    # Find section by node_id or section_id
    section_found = False
    new_sections = []
    for header, existing_node_id, body in sections:
        if existing_node_id == node_id:
            # Update existing section
            new_sections.append((name, node_id, content))
            section_found = True
        else:
            new_sections.append((header, existing_node_id, body))

    if not section_found:
        # Insert new section at correct position based on ordering
        order = DOC_TYPE_ORDER.get(doc_type, [])
        insert_idx = _find_insert_position(new_sections, section_id, order)
        new_sections.insert(insert_idx, (name, node_id, content))

    # Rebuild and write
    new_content = _rebuild_markdown(preamble, new_sections)
    md_file.write_text(new_content)
    logger.info(f"Synced {node_id} to {md_file}")

    # Create graph links if graph_ops provided
    if graph_ops:
        _create_sync_links(graph_ops, node, md_file, module, actor_id, new_sections, section_id)

    return md_file


def _find_or_create_doc_file(
    docs_dir: Path,
    module: str,
    prefix: str,
    name: str
) -> Optional[Path]:
    """Find existing doc file or determine path for new one."""
    if not module:
        # No module specified, can't determine path
        logger.warning(f"Cannot sync without module")
        return None

    module_dir = docs_dir / module

    # Look for existing file with this prefix
    if module_dir.exists():
        for f in module_dir.glob(f"{prefix}_*.md"):
            return f

    # Create new file path
    safe_name = re.sub(r'[^\w\s-]', '', name).replace(' ', '_')
    return module_dir / f"{prefix}_{safe_name}.md"


def _create_doc_template(prefix: str, module: str, name: str) -> str:
    """Create initial doc template."""
    now = datetime.now().strftime("%Y-%m-%d")
    return f"""# {module.title()} — {prefix.title()}: {name}

```
STATUS: DRAFT
CREATED: {now}
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES_*.md
BEHAVIORS:       ./BEHAVIORS_*.md
PATTERNS:        ./PATTERNS_*.md
ALGORITHM:       ./ALGORITHM_*.md
VALIDATION:      ./VALIDATION_*.md
IMPLEMENTATION:  ./IMPLEMENTATION_*.md
HEALTH:          ./HEALTH_*.md
SYNC:            ./SYNC_*.md
```

---

"""


def _find_insert_position(
    sections: List[Tuple[str, Optional[str], str]],
    section_id: str,
    order: List[str]
) -> int:
    """Find correct insert position based on ordering."""
    if not order or section_id not in order:
        return len(sections)  # Append at end

    target_idx = order.index(section_id)

    # Find first section that should come after this one
    for i, (header, node_id, body) in enumerate(sections):
        # Try to match section header to order
        header_lower = header.lower().replace(' ', '_')
        if header_lower in order:
            existing_idx = order.index(header_lower)
            if existing_idx > target_idx:
                return i

    return len(sections)


def _create_sync_links(
    graph_ops: Any,
    node: Dict[str, Any],
    md_file: Path,
    module: str,
    actor_id: Optional[str],
    sections: List[Tuple[str, Optional[str], str]],
    section_id: str
) -> None:
    """Create graph links for the synced node."""
    import time
    node_id = node.get('id')
    now = int(time.time())

    # 1. Create Thing node for the file
    file_thing_id = f"thing_file_{md_file.stem}"
    graph_ops.upsert_node({
        'id': file_thing_id,
        'name': md_file.name,
        'node_type': 'thing',
        'type': 'file',
        'uri': str(md_file),
        'created_at_s': now,
        'updated_at_s': now,
    })

    # 2. Link Narrative → Thing (materializes)
    graph_ops.upsert_link({
        'id': f"link_{node_id}_materializes_{file_thing_id}",
        'node_a': node_id,
        'node_b': file_thing_id,
        'type': 'relates',
        'name': 'materializes',
        'created_at_s': now,
    })

    # 3. Link Space (module) → Narrative (contains)
    if module:
        space_id = f"space_module_{module}"
        # Ensure space exists
        graph_ops.upsert_node({
            'id': space_id,
            'name': module,
            'node_type': 'space',
            'type': 'module',
            'created_at_s': now,
            'updated_at_s': now,
        })
        graph_ops.upsert_link({
            'id': f"link_{space_id}_contains_{node_id}",
            'node_a': space_id,
            'node_b': node_id,
            'type': 'contains',
            'created_at_s': now,
        })

    # 4. Link Actor → Narrative (created by, role: originator)
    if actor_id:
        graph_ops.upsert_link({
            'id': f"link_{actor_id}_created_{node_id}",
            'node_a': actor_id,
            'node_b': node_id,
            'type': 'relates',
            'name': 'created',
            'role': 'originator',
            'created_at_s': now,
        })

    # 5. Create sequence links (prev/next) based on section order
    _create_sequence_links(graph_ops, node_id, sections, section_id, now)


def _create_sequence_links(
    graph_ops: Any,
    node_id: str,
    sections: List[Tuple[str, Optional[str], str]],
    section_id: str,
    now: int
) -> None:
    """Create sequence links between narrative nodes."""
    # Find our position and neighbors
    our_idx = None
    for i, (header, existing_node_id, body) in enumerate(sections):
        if existing_node_id == node_id:
            our_idx = i
            break

    if our_idx is None:
        return

    # Link to previous section
    if our_idx > 0:
        prev_header, prev_node_id, _ = sections[our_idx - 1]
        if prev_node_id:
            graph_ops.upsert_link({
                'id': f"link_seq_{prev_node_id}_to_{node_id}",
                'node_a': prev_node_id,
                'node_b': node_id,
                'type': 'sequence',
                'tick': now,
                'created_at_s': now,
            })

    # Link to next section
    if our_idx < len(sections) - 1:
        next_header, next_node_id, _ = sections[our_idx + 1]
        if next_node_id:
            graph_ops.upsert_link({
                'id': f"link_seq_{node_id}_to_{next_node_id}",
                'node_a': node_id,
                'node_b': next_node_id,
                'type': 'sequence',
                'tick': now,
                'created_at_s': now,
            })


# =============================================================================
# BATCH SYNC
# =============================================================================

def sync_all_narratives_to_markdown(
    graph_ops: Any,
    docs_dir: Path,
    doc_types: Optional[List[str]] = None
) -> int:
    """
    Sync all Narrative nodes to markdown.

    Args:
        graph_ops: GraphOps instance
        docs_dir: Path to docs/ directory
        doc_types: Optional list of doc types to sync (e.g., ['patterns', 'behaviors'])

    Returns:
        Number of nodes synced
    """
    # Query all narrative nodes
    query = "MATCH (n:Narrative) RETURN n"
    results = graph_ops._query(query)

    count = 0
    for record in results:
        node = dict(record[0])
        node_type = node.get('type', '').lower()

        if doc_types and node_type not in doc_types:
            continue

        result = sync_narrative_to_markdown(node, docs_dir, graph_ops)
        if result:
            count += 1

    return count
