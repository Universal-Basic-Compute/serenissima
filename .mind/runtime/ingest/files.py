"""
File ingestion for the mind graph.

Scans repository files and creates Thing nodes in the graph.
Computes physics properties during ingestion (line_count, size_class, has_stub, has_secret).

DOCS: docs/ingest/PATTERNS_File_Ingestion.md
SYSTEM: templates/SYSTEM.md (Physics layer)
"""

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Set

logger = logging.getLogger(__name__)

# Secret detection patterns (common sensitive patterns)
SECRET_PATTERNS = [
    re.compile(r'(?i)(api[_-]?key|apikey)\s*[=:]\s*["\']?[a-zA-Z0-9_-]{20,}'),
    re.compile(r'(?i)(secret|password|passwd|pwd)\s*[=:]\s*["\'][^"\']{8,}'),
    re.compile(r'(?i)(aws_access_key_id|aws_secret_access_key)\s*[=:]\s*["\']?[A-Z0-9]{16,}'),
    re.compile(r'(?i)bearer\s+[a-zA-Z0-9_-]{20,}'),
    re.compile(r'-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----'),
    re.compile(r'ghp_[a-zA-Z0-9]{36}'),  # GitHub personal access token
    re.compile(r'sk-[a-zA-Z0-9]{48}'),   # OpenAI API key
]

# Stub detection patterns
STUB_PATTERNS = [
    re.compile(r'^\s*pass\s*$', re.MULTILINE),
    re.compile(r'raise\s+NotImplementedError'),
    re.compile(r'\.\.\.\s*$', re.MULTILINE),  # Python ellipsis
]

# Skip directories that should never be scanned
SKIP_DIRS = {
    '.git', '.mind', '__pycache__', '.venv', 'venv',
    'node_modules', '.next', 'dist', 'build', '.cache',
    '.pytest_cache', '.mypy_cache', 'coverage', '.tox',
    '.idea', '.vscode', 'egg-info',
}

# File extensions to include
INCLUDE_EXTENSIONS = {
    # Code
    '.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs', '.java', '.kt', '.rb',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.scala', '.clj',
    # Config
    '.yaml', '.yml', '.json', '.toml', '.ini', '.cfg',
    # Docs
    '.md', '.rst', '.txt',
    # Web
    '.html', '.css', '.scss', '.less',
    # Data
    '.sql', '.graphql',
}


def _parse_code_imports(content: str, file_ext: str) -> List[str]:
    """
    Parse import statements from code content.

    Supports:
    - Python: import x, from x import y
    - JS/TS: import ... from 'x', require('x')

    Returns:
        List of relative module/file paths imported
    """
    imports = []

    if file_ext == '.py':
        # Python imports
        # from foo.bar import baz
        from_pattern = re.compile(r'^from\s+([\w.]+)\s+import', re.MULTILINE)
        # import foo.bar
        import_pattern = re.compile(r'^import\s+([\w.]+)', re.MULTILINE)

        for match in from_pattern.finditer(content):
            imports.append(match.group(1))
        for match in import_pattern.finditer(content):
            imports.append(match.group(1))

    elif file_ext in ('.js', '.ts', '.jsx', '.tsx'):
        # JS/TS imports
        # import ... from 'module'
        from_pattern = re.compile(r"from\s+['\"]([^'\"]+)['\"]")
        # require('module')
        require_pattern = re.compile(r"require\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")

        for match in from_pattern.finditer(content):
            imports.append(match.group(1))
        for match in require_pattern.finditer(content):
            imports.append(match.group(1))

    # Filter: keep only relative imports (start with . or contain /)
    local_imports = [i for i in imports if i.startswith('.') or '/' in i]
    return local_imports


def scan_and_ingest_files(
    target_dir: Path,
    graph_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Scan repository and ingest files as Thing nodes.

    Creates:
    - Space nodes for directories (AREA, MODULE)
    - Thing nodes for files
    - LINK edges: Space --contains--> Thing
    - Embeddings for all nodes with synthesis

    Args:
        target_dir: Repository root
        graph_name: Graph to ingest into (default: from config)

    Returns:
        Stats dict: {files_scanned, things_created, spaces_created, ...}
    """
    from ..infrastructure.database import get_database_adapter
    from ..file_utils import should_ignore_path, is_binary_file, load_ignore_patterns

    # Load ignore patterns
    ignore_patterns = load_ignore_patterns(target_dir)

    # Get database adapter
    adapter = get_database_adapter(graph_name=graph_name)

    stats = {
        "files_scanned": 0,
        "things_created": 0,
        "things_updated": 0,
        "spaces_created": 0,
        "links_created": 0,
        "areas": set(),
        "modules": set(),
        "errors": [],
        # Physics stats
        "monoliths": 0,
        "stubs": 0,
        "secrets": 0,
    }

    # Track created spaces to avoid duplicates
    created_spaces: Set[str] = set()

    def _ensure_space(space_id: str, name: str, space_type: str, location: str = None) -> None:
        """Create Space node if not exists.

        Space types (uppercase):
        - ROOT: Repository root
        - AREA: Top-level code grouping (first directory level)
        - MODULE: Sub-area grouping (second directory level)

        Args:
            space_id: Unique ID for the space
            name: Display name
            space_type: Type (ROOT, AREA, MODULE)
            location: Physical path for folder containers (relative to repo root)
        """
        if space_id in created_spaces:
            return

        # Check if exists in DB
        result = adapter.query(
            "MATCH (s:Space {id: $id}) RETURN s.id",
            {"id": space_id}
        )
        if result:
            created_spaces.add(space_id)
            return

        # Normalize type to uppercase
        type_upper = space_type.upper()

        # Build properties
        props = {
            "id": space_id,
            "name": name,
            "type": type_upper,
            "synthesis": f"{type_upper}: {name}",
        }
        if location:
            props["location"] = location

        # Create Space node
        if location:
            adapter.execute(
                """
                CREATE (s:Space {
                    id: $id,
                    name: $name,
                    node_type: 'space',
                    type: $type,
                    synthesis: $synthesis,
                    location: $location
                })
                """,
                props
            )
        else:
            adapter.execute(
                """
                CREATE (s:Space {
                    id: $id,
                    name: $name,
                    node_type: 'space',
                    type: $type,
                    synthesis: $synthesis
                })
                """,
                props
            )
        created_spaces.add(space_id)
        stats["spaces_created"] += 1
        if type_upper == "AREA":
            stats["areas"].add(name)
        else:
            stats["modules"].add(name)

    def _create_thing(rel_path: str, parent_space_id: str) -> None:
        """
        Create Thing node and link to parent Space.

        Computes and stores physics properties:
        - line_count, size_class, has_stub, has_secret, updated_at
        """
        thing_id = f"thing:{rel_path}"
        file_path = target_dir / rel_path
        filename = Path(rel_path).name
        file_ext = Path(rel_path).suffix.lower()

        # Determine file type
        if file_ext in {'.py', '.js', '.ts', '.go', '.rs', '.java'}:
            file_type = "code"
        elif file_ext in {'.md', '.rst', '.txt'}:
            file_type = "doc"
        elif file_ext in {'.yaml', '.yml', '.json', '.toml'}:
            file_type = "config"
        else:
            file_type = "file"

        # Read full content for physics computation
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            content = ""

        # Compute physics properties
        physics = _compute_physics_properties(file_path, content)

        # Track physics stats
        if physics["size_class"] == "monolith":
            stats["monoliths"] += 1
        if physics["has_stub"]:
            stats["stubs"] += 1
        if physics["has_secret"]:
            stats["secrets"] += 1

        # Generate synthesis from file content
        synthesis = _generate_synthesis(file_path, filename)

        # Upsert Thing node
        result = adapter.query(
            "MATCH (t:Thing {id: $id}) RETURN t.id",
            {"id": thing_id}
        )

        if result:
            # Update existing with physics properties (refresh energy on update)
            adapter.execute(
                """
                MATCH (t:Thing {id: $id})
                SET t.synthesis = $synthesis,
                    t.file_type = $file_type,
                    t.line_count = $line_count,
                    t.size_class = $size_class,
                    t.has_stub = $has_stub,
                    t.has_secret = $has_secret,
                    t.updated_at = $updated_at,
                    t.energy = $energy
                """,
                {
                    "id": thing_id,
                    "synthesis": synthesis,
                    "file_type": file_type,
                    **physics,
                }
            )
            stats["things_updated"] += 1
        else:
            # Create new with physics properties
            adapter.execute(
                """
                CREATE (t:Thing {
                    id: $id,
                    name: $name,
                    node_type: 'thing',
                    path: $path,
                    file_type: $file_type,
                    synthesis: $synthesis,
                    line_count: $line_count,
                    size_class: $size_class,
                    has_stub: $has_stub,
                    has_secret: $has_secret,
                    updated_at: $updated_at,
                    energy: $energy
                })
                """,
                {
                    "id": thing_id,
                    "name": filename,
                    "path": rel_path,
                    "file_type": file_type,
                    "synthesis": synthesis,
                    **physics,
                }
            )
            stats["things_created"] += 1

        # Create contains link
        adapter.execute(
            """
            MATCH (s:Space {id: $space_id})
            MATCH (t:Thing {id: $thing_id})
            MERGE (s)-[r:LINK {type: 'contains'}]->(t)
            ON CREATE SET r.hierarchy = -0.7, r.synthesis = 'contains'
            """,
            {"space_id": parent_space_id, "thing_id": thing_id}
        )
        stats["links_created"] += 1

        # Create import links for code files
        if file_type == "code" and content:
            imports = _parse_code_imports(content, file_ext)
            file_dir = file_path.parent

            for imp in imports:
                # Resolve relative import to file path
                if imp.startswith('.'):
                    # Python relative import: .foo -> ./foo.py, ..bar -> ../bar.py
                    imp_path = imp.replace('.', '/', 1) + '.py' if file_ext == '.py' else imp
                    resolved = (file_dir / imp_path).resolve()
                else:
                    # Already a path
                    resolved = (file_dir / imp).resolve()

                try:
                    target_path = str(resolved.relative_to(target_dir))
                    target_id = f"thing:{target_path}"

                    # Create imports link (target may not exist yet)
                    adapter.execute(
                        """
                        MATCH (src:Thing {id: $src_id})
                        MERGE (tgt:Thing {id: $tgt_id})
                        ON CREATE SET tgt.node_type = 'thing', tgt.name = $tgt_name
                        MERGE (src)-[r:LINK]->(tgt)
                        ON CREATE SET r.verb = 'imports', r.hierarchy = 0.3, r.polarity = [0.8, 0.2], r.permanence = 0.9
                        """,
                        {
                            "src_id": thing_id,
                            "tgt_id": target_id,
                            "tgt_name": resolved.name,
                        }
                    )
                    stats["links_created"] += 1
                except ValueError:
                    pass  # Outside project directory

    def _compute_physics_properties(file_path: Path, content: str) -> Dict[str, Any]:
        """
        Compute physics properties for a file.

        Properties computed:
        - line_count: Number of lines in file
        - size_class: "monolith" if >500 lines, "large" if >200, else "normal"
        - has_stub: True if file contains stub patterns (pass, NotImplementedError)
        - has_secret: True if file contains potential secrets
        - updated_at: File modification time (ISO format)

        SYSTEM: templates/SYSTEM.md (Physics layer - Property-Based rules)
        """
        props = {
            "line_count": 0,
            "size_class": "normal",
            "has_stub": False,
            "has_secret": False,
            "updated_at": None,
            "energy": 1.0,  # Initial energy, decays over time via physics tick
        }

        # Line count and size class
        lines = content.split('\n')
        props["line_count"] = len(lines)

        if props["line_count"] > 500:
            props["size_class"] = "monolith"
        elif props["line_count"] > 200:
            props["size_class"] = "large"
        else:
            props["size_class"] = "normal"

        # Stub detection (only for code files)
        if file_path.suffix in {'.py', '.js', '.ts', '.go', '.rs', '.java'}:
            for pattern in STUB_PATTERNS:
                if pattern.search(content):
                    props["has_stub"] = True
                    break

        # Secret detection
        for pattern in SECRET_PATTERNS:
            if pattern.search(content):
                props["has_secret"] = True
                break

        # Updated timestamp
        try:
            mtime = file_path.stat().st_mtime
            props["updated_at"] = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        except Exception:
            props["updated_at"] = datetime.now(timezone.utc).isoformat()

        return props

    def _generate_synthesis(file_path: Path, filename: str) -> str:
        """Generate synthesis text from file content."""
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')[:2000]

            # Extract docstring/first comment
            if file_path.suffix == '.py':
                # Python docstring
                if content.startswith('"""') or content.startswith("'''"):
                    end_quote = '"""' if content.startswith('"""') else "'''"
                    end_idx = content.find(end_quote, 3)
                    if end_idx > 0:
                        return content[3:end_idx].strip()[:200]
                # Python comment
                lines = content.split('\n')
                for line in lines[:10]:
                    if line.strip().startswith('#') and not line.strip().startswith('#!'):
                        return line.strip()[1:].strip()[:200]

            elif file_path.suffix == '.md':
                # Markdown: first heading or first paragraph
                lines = content.split('\n')
                for line in lines[:5]:
                    if line.strip() and not line.startswith('#'):
                        return line.strip()[:200]
                    if line.startswith('# '):
                        return line[2:].strip()[:200]

            # Fallback: filename
            return filename

        except Exception:
            return filename

    def _scan_dir(directory: Path, depth: int = 0) -> None:
        """Recursively scan directory."""
        if depth > 10:
            return

        try:
            items = sorted(directory.iterdir())
        except PermissionError:
            return

        for item in items:
            # Skip hidden
            if item.name.startswith('.'):
                continue

            # Skip known dirs
            if item.is_dir() and item.name in SKIP_DIRS:
                continue

            # Check ignore patterns
            if should_ignore_path(item, ignore_patterns, target_dir):
                continue

            if item.is_dir():
                _scan_dir(item, depth + 1)

            elif item.is_file():
                # Skip binary
                if is_binary_file(item):
                    continue

                # Check extension
                if item.suffix.lower() not in INCLUDE_EXTENSIONS:
                    continue

                stats["files_scanned"] += 1

                try:
                    rel_path = item.relative_to(target_dir)
                    rel_path_str = str(rel_path)

                    # Determine space hierarchy
                    parts = rel_path.parts[:-1]

                    if not parts:
                        # Root level file
                        parent_id = "space:root"
                        _ensure_space(parent_id, "root", "ROOT", location=".")
                    elif len(parts) == 1:
                        # Area level (e.g., engine/file.py)
                        area_id = f"space:area:{parts[0]}"
                        _ensure_space(area_id, parts[0], "AREA", location=parts[0])
                        parent_id = area_id
                    else:
                        # Module level (e.g., engine/physics/file.py)
                        area_id = f"space:area:{parts[0]}"
                        module_name = f"{parts[0]}/{parts[1]}"
                        module_id = f"space:module:{module_name}"

                        _ensure_space(area_id, parts[0], "AREA", location=parts[0])
                        _ensure_space(module_id, module_name, "MODULE", location=module_name)

                        # Link area -> module
                        adapter.execute(
                            """
                            MATCH (a:Space {id: $area_id})
                            MATCH (m:Space {id: $module_id})
                            MERGE (a)-[r:LINK {type: 'contains'}]->(m)
                            ON CREATE SET r.hierarchy = -0.7
                            """,
                            {"area_id": area_id, "module_id": module_id}
                        )

                        parent_id = module_id

                    _create_thing(rel_path_str, parent_id)

                except Exception as e:
                    stats["errors"].append(f"{item}: {e}")
                    logger.warning(f"Error ingesting {item}: {e}")

    # Run scan
    _scan_dir(target_dir)

    # Convert sets to counts
    stats["areas_count"] = len(stats["areas"])
    stats["modules_count"] = len(stats["modules"])
    del stats["areas"]
    del stats["modules"]

    return stats


def _embed_all_nodes(adapter) -> int:
    """Embed all nodes that have synthesis but no embedding."""
    try:
        from ..infrastructure.embeddings.service import EmbeddingService

        embed_service = EmbeddingService()

        # Find all nodes without embeddings (Things, Spaces, Actors, etc.)
        result = adapter.query(
            """
            MATCH (n)
            WHERE n.embedding IS NULL AND (n.synthesis IS NOT NULL OR n.description IS NOT NULL)
            RETURN n.id, COALESCE(n.synthesis, n.description) as text
            """
        )

        if not result:
            return 0

        count = 0
        for row in result:
            node_id = row[0]
            text = row[1]

            if not text:
                continue

            embedding = embed_service.embed(text)
            if embedding:
                adapter.execute(
                    "MATCH (n {id: $id}) SET n.embedding = $embedding",
                    {"id": node_id, "embedding": embedding}
                )
                count += 1

        # Flush disk cache
        embed_service.flush_cache()

        return count

    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        return 0
