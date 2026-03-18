# DOCS: docs/cli/core/PATTERNS_Why_CLI_Over_Copy.md
"""
Repository Overview Generator.

Generates a comprehensive map of the repository including:
- File hierarchy tree (respecting .gitignore and .mindignore)
- Section titles (# and ##) for markdown files
- Function/class definitions for code files
- Dependency map from modules.yaml

Output formats: markdown, yaml, json
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from .file_utils import (
    load_ignore_patterns,
    should_ignore_path,
    is_binary_file,
)
from .project_map import analyze_modules, load_modules_yaml
from .context import parse_imports
from .core_utils import IGNORED_EXTENSIONS
from .repo_overview_formatters import (
    format_markdown,
    format_yaml,
    format_json,
    file_info_to_dict,
    overview_to_dict,
)


@dataclass
class FileInfo:
    """Information about a single file."""
    path: str
    type: str  # 'file' or 'dir'
    language: str = ""
    chars: int = 0  # characters in this file (for files)
    total_chars: int = 0  # total chars including all children (for dirs)
    docs_ref: str = ""  # DOCS: reference path (code → docs link)
    code_refs: List[str] = field(default_factory=list)  # Code file references (docs → code link)
    doc_refs: List[str] = field(default_factory=list)  # Doc file references (docs → docs link)
    imports: List[str] = field(default_factory=list)  # import/dependency paths
    sections: List[str] = field(default_factory=list)  # # and ## headers for md
    functions: List[str] = field(default_factory=list)  # function/class names
    children: List["FileInfo"] = field(default_factory=list)
    hidden_count: int = 0  # files hidden by min_size or top_files filters


@dataclass
class DependencyInfo:
    """Module dependency information."""
    name: str
    code_pattern: str
    docs_path: str
    depends_on: List[str]
    lines: int
    files: int


@dataclass
class RepoOverview:
    """Complete repository overview."""
    project_name: str
    generated_at: str
    file_tree: FileInfo
    dependencies: List[DependencyInfo]
    stats: Dict[str, Any]


def get_language(file_path: Path) -> str:
    """Determine language from file extension."""
    ext_map = {
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'tsx',
        '.jsx': 'jsx',
        '.go': 'go',
        '.rs': 'rust',
        '.java': 'java',
        '.rb': 'ruby',
        '.php': 'php',
        '.c': 'c',
        '.cpp': 'cpp',
        '.h': 'c-header',
        '.md': 'markdown',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.json': 'json',
        '.toml': 'toml',
        '.sh': 'shell',
        '.bash': 'shell',
        '.css': 'css',
        '.scss': 'scss',
        '.html': 'html',
    }
    return ext_map.get(file_path.suffix.lower(), '')


def extract_docs_ref(file_path: Path, search_chars: int) -> str:
    """Extract DOCS: reference from file header (bidirectional link).

    Looks for patterns like:
    - Python: # DOCS: docs/path/to/PATTERNS_*.md
    - JS/TS: // DOCS: docs/path/to/PATTERNS_*.md
    - C-style: /* DOCS: docs/path/to/PATTERNS_*.md */
    - In docstrings: DOCS: docs/path/to/PATTERNS_*.md
    """
    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return ""

    # Only search in the configured header slice
    header = content[:max(0, search_chars)]

    # Pattern to match DOCS: references in various comment styles
    patterns = [
        r'#\s*DOCS:\s*([^\n]+)',      # Python style
        r'//\s*DOCS:\s*([^\n]+)',     # JS/C++ style
        r'/\*\s*DOCS:\s*([^\n*]+)',   # C-style block comment
        r'^\s*DOCS:\s*([^\n]+)',      # In docstrings (no comment marker)
    ]

    for pattern in patterns:
        match = re.search(pattern, header, re.MULTILINE)
        if match:
            return match.group(1).strip()

    return ""


def extract_markdown_sections(file_path: Path) -> List[str]:
    """Extract # and ## section titles from markdown file."""
    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return []

    sections = []
    for line in content.split('\n'):
        # Match # and ## headers (not ### or deeper)
        match = re.match(r'^(#{1,2})\s+(.+)$', line.strip())
        if match:
            level = len(match.group(1))
            title = match.group(2).strip()
            prefix = '#' * level
            sections.append(f"{prefix} {title}")

    return sections


def extract_markdown_code_refs(file_path: Path) -> List[str]:
    """Extract code file references from markdown files (docs → code direction)."""
    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return []

    refs = set()

    # Pattern 1: Backtick code references like `mind/cli.py` or `cli.py`
    backtick_refs = re.findall(r'`((?:src/)?[a-zA-Z_][\w/]*\.(?:py|js|ts|tsx|jsx|go|rs|java))`', content)
    refs.update(backtick_refs)

    # Pattern 2: Markdown links to code files [text](path/to/file.py)
    link_refs = re.findall(r'\]\(([^)]*\.(?:py|js|ts|tsx|jsx|go|rs|java))\)', content)
    refs.update(link_refs)

    # Pattern 3: Explicit CODE: or IMPL: markers
    code_markers = re.findall(r'(?:CODE|IMPL):\s*`?([^\s`\n]+\.(?:py|js|ts|tsx|jsx|go|rs|java))`?', content)
    refs.update(code_markers)

    # Pattern 4: Table cells with src/ paths like | `mind/cli.py` | or | mind/cli.py |
    table_refs = re.findall(r'\|\s*`?(src/[a-zA-Z_][\w/]*\.(?:py|js|ts|tsx|jsx|go|rs|java))`?\s*\|', content)
    refs.update(table_refs)

    # Clean up paths (remove ../ prefixes, normalize)
    cleaned = []
    for ref in refs:
        # Remove leading ../ or ./
        ref = re.sub(r'^(?:\.\./)+', '', ref)
        ref = re.sub(r'^\./', '', ref)
        if ref:
            cleaned.append(ref)

    return sorted(set(cleaned))


def extract_markdown_doc_refs(file_path: Path) -> List[str]:
    """Extract doc file references from markdown files (docs → docs cross-links).

    Only includes cross-folder references - skips same-folder siblings (chain links).
    """
    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return []

    refs = set()

    # Pattern 1: Markdown links to other docs [text](path/to/DOC.md) - only with path
    link_refs = re.findall(r'\]\(([^)]+/[^)]*\.md)\)', content)
    refs.update(link_refs)

    # Pattern 2: Backtick doc references with paths like `docs/cli/SYNC.md`
    backtick_refs = re.findall(r'`([a-z][a-z0-9_/]*[A-Z][A-Z_]*[^`]*\.md)`', content)
    refs.update(backtick_refs)

    # Clean up paths (remove ../ prefixes, normalize)
    cleaned = []
    for ref in refs:
        # Remove leading ../ or ./
        ref = re.sub(r'^(?:\.\./)+', '', ref)
        ref = re.sub(r'^\./', '', ref)
        # Skip self-references, anchors, and same-folder refs (no / means same folder)
        if ref and not ref.startswith('#') and '/' in ref and ref != file_path.name:
            cleaned.append(ref)

    return sorted(set(cleaned))


def extract_code_definitions(file_path: Path) -> List[str]:
    """Extract function and class definitions from code files."""
    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return []

    definitions = []
    suffix = file_path.suffix.lower()

    if suffix == '.py':
        # Python: def, class, async def
        pattern = re.compile(r'^(?:async\s+)?(?:def|class)\s+(\w+)')
        for line in content.split('\n'):
            line = line.strip()
            match = pattern.match(line)
            if match:
                name = match.group(1)
                if line.startswith('class'):
                    definitions.append(f"class {name}")
                elif 'async def' in line:
                    definitions.append(f"async def {name}()")
                else:
                    definitions.append(f"def {name}()")

    elif suffix in ['.js', '.ts', '.jsx', '.tsx']:
        # JavaScript/TypeScript
        patterns = [
            (re.compile(r'^(?:export\s+)?(?:async\s+)?function\s+(\w+)'), 'function'),
            (re.compile(r'^(?:export\s+)?class\s+(\w+)'), 'class'),
            (re.compile(r'^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\('), 'const'),
            (re.compile(r'^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function'), 'const'),
        ]
        for line in content.split('\n'):
            line = line.strip()
            for pattern, kind in patterns:
                match = pattern.match(line)
                if match:
                    name = match.group(1)
                    if kind == 'class':
                        definitions.append(f"class {name}")
                    else:
                        definitions.append(f"{name}()")
                    break

    elif suffix == '.go':
        # Go: func, type
        func_pattern = re.compile(r'^func\s+(?:\([^)]+\)\s+)?(\w+)')
        type_pattern = re.compile(r'^type\s+(\w+)\s+(?:struct|interface)')
        for line in content.split('\n'):
            line = line.strip()
            match = func_pattern.match(line)
            if match:
                definitions.append(f"func {match.group(1)}()")
                continue
            match = type_pattern.match(line)
            if match:
                definitions.append(f"type {match.group(1)}")

    elif suffix == '.rs':
        # Rust: fn, struct, impl, enum
        patterns = [
            (re.compile(r'^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)'), 'fn'),
            (re.compile(r'^(?:pub\s+)?struct\s+(\w+)'), 'struct'),
            (re.compile(r'^(?:pub\s+)?enum\s+(\w+)'), 'enum'),
            (re.compile(r'^impl(?:<[^>]+>)?\s+(\w+)'), 'impl'),
        ]
        for line in content.split('\n'):
            line = line.strip()
            for pattern, kind in patterns:
                match = pattern.match(line)
                if match:
                    name = match.group(1)
                    if kind == 'fn':
                        definitions.append(f"fn {name}()")
                    else:
                        definitions.append(f"{kind} {name}")
                    break

    elif suffix in ['.java', '.kt']:
        # Java/Kotlin: class, interface, method
        class_pattern = re.compile(r'^(?:public\s+)?(?:abstract\s+)?(?:class|interface)\s+(\w+)')
        method_pattern = re.compile(r'^(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(')
        for line in content.split('\n'):
            line = line.strip()
            match = class_pattern.match(line)
            if match:
                definitions.append(f"class {match.group(1)}")
                continue
            match = method_pattern.match(line)
            if match and match.group(1) not in ['if', 'for', 'while', 'switch']:
                definitions.append(f"{match.group(1)}()")

    return definitions


def count_chars(file_path: Path) -> int:
    """Count characters in a file."""
    try:
        return file_path.stat().st_size
    except Exception:
        return 0


# Python stdlib modules (partial list of common ones)
_STDLIB_MODULES = {
    'abc', 'asyncio', 'argparse', 'ast', 'base64', 'bisect', 'builtins',
    'calendar', 'cgi', 'cgitb', 'chunk', 'cmath', 'cmd', 'code', 'codecs',
    'codeop', 'collections', 'colorsys', 'compileall', 'concurrent',
    'configparser', 'contextlib', 'contextvars', 'copy', 'copyreg', 'cProfile',
    'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm',
    'decimal', 'difflib', 'dis', 'distutils', 'doctest', 'email', 'encodings',
    'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch',
    'fractions', 'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext',
    'glob', 'grp', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http',
    'imaplib', 'imghdr', 'imp', 'importlib', 'inspect', 'io', 'ipaddress',
    'itertools', 'json', 'keyword', 'lib2to3', 'linecache', 'locale', 'logging',
    'lzma', 'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes', 'mmap',
    'modulefinder', 'multiprocessing', 'netrc', 'nis', 'nntplib', 'numbers',
    'operator', 'optparse', 'os', 'ossaudiodev', 'pathlib', 'pdb', 'pickle',
    'pickletools', 'pipes', 'pkgutil', 'platform', 'plistlib', 'poplib',
    'posix', 'posixpath', 'pprint', 'profile', 'pstats', 'pty', 'pwd', 'py_compile',
    'pyclbr', 'pydoc', 'queue', 'quopri', 'random', 're', 'readline', 'reprlib',
    'resource', 'rlcompleter', 'runpy', 'sched', 'secrets', 'select', 'selectors',
    'shelve', 'shlex', 'shutil', 'signal', 'site', 'smtpd', 'smtplib', 'sndhdr',
    'socket', 'socketserver', 'spwd', 'sqlite3', 'ssl', 'stat', 'statistics',
    'string', 'stringprep', 'struct', 'subprocess', 'sunau', 'symtable', 'sys',
    'sysconfig', 'syslog', 'tabnanny', 'tarfile', 'telnetlib', 'tempfile',
    'termios', 'test', 'textwrap', 'threading', 'time', 'timeit', 'tkinter',
    'token', 'tokenize', 'trace', 'traceback', 'tracemalloc', 'tty', 'turtle',
    'turtledemo', 'types', 'typing', 'unicodedata', 'unittest', 'urllib', 'uu',
    'uuid', 'venv', 'warnings', 'wave', 'weakref', 'webbrowser', 'winreg',
    'winsound', 'wsgiref', 'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile',
    'zipimport', 'zlib', '_thread',
}

# Node.js built-ins and common npm packages to exclude
_NODE_MODULES = {
    # Node.js built-ins
    'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
    'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
    'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
    'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'timers',
    'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
    # Next.js / React
    'next', 'react', 'react-dom', 'next/router', 'next/link', 'next/image',
    'next/head', 'next/script', 'next/navigation', 'next/headers',
    '@next/font', '@next/mdx',
    # Common npm packages
    'axios', 'lodash', 'moment', 'dayjs', 'date-fns', 'uuid', 'nanoid',
    'express', 'fastify', 'koa', 'hapi',
    'prisma', '@prisma/client', 'mongoose', 'sequelize', 'typeorm', 'knex',
    'zod', 'yup', 'joi', 'ajv',
    'tailwindcss', 'styled-components', '@emotion/react', '@emotion/styled',
    'clsx', 'classnames', 'class-variance-authority',
    'zustand', 'jotai', 'recoil', 'redux', '@reduxjs/toolkit', 'mobx',
    'swr', '@tanstack/react-query', 'react-query',
    'framer-motion', 'react-spring', '@react-spring/web',
    '@radix-ui', '@headlessui/react', '@chakra-ui/react', '@mui/material',
    'lucide-react', 'react-icons', '@heroicons/react',
    'typescript', 'tslib', '@types',
    'eslint', 'prettier', 'jest', 'vitest', '@testing-library',
    'webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'turbopack',
}


def _filter_local_imports(imports: List[str], target_dir: Path) -> List[str]:
    """Filter imports to only keep local/custom ones (not stdlib or third-party)."""
    result = []
    # Get project package name from src/ or project root
    src_dir = target_dir / "src"
    project_packages = set()
    if src_dir.exists():
        for item in src_dir.iterdir():
            if item.is_dir() and not item.name.startswith('_'):
                project_packages.add(item.name)

    for imp in imports:
        # Get root module name (first part before /)
        root = imp.split('/')[0]

        # Skip Python stdlib
        if root in _STDLIB_MODULES:
            continue

        # Skip Node.js/npm packages (check both root and full path for scoped packages)
        if root in _NODE_MODULES or imp in _NODE_MODULES:
            continue
        # Skip @scoped packages
        if root.startswith('@'):
            continue

        # Include if it matches project package or starts with . (relative)
        if root in project_packages or imp.startswith('.'):
            result.append(imp)

    return result


def build_file_tree(
    target_dir: Path,
    ignore_patterns: set,
    current_path: Optional[Path] = None,
    depth: int = 0,
    max_depth: int = 10,
    min_size: int = 0,
    top_files: int = 0,
) -> Optional[FileInfo]:
    """Build file tree recursively.

    Args:
        target_dir: Root directory of the project
        ignore_patterns: Set of glob patterns to ignore
        current_path: Current path being processed
        depth: Current recursion depth
        max_depth: Maximum recursion depth
        min_size: Minimum file size in chars to include (0 = include all)
        top_files: Maximum files per directory, sorted by size (0 = include all)
    """
    if current_path is None:
        current_path = target_dir

    if depth > max_depth:
        return None

    # Skip ignored paths
    if should_ignore_path(current_path, ignore_patterns, target_dir):
        return None

    # Get relative path
    try:
        rel_path = str(current_path.relative_to(target_dir))
    except ValueError:
        rel_path = str(current_path)

    if rel_path == '.':
        rel_path = current_path.name

    if current_path.is_file():
        # Skip binary and ignored extensions
        if current_path.suffix.lower() in IGNORED_EXTENSIONS:
            return None
        if is_binary_file(current_path):
            return None

        language = get_language(current_path)
        chars = count_chars(current_path)

        # Extract docs_ref and imports for code files
        docs_ref = ""
        imports = []
        sections = []
        functions = []

        code_refs = []
        doc_refs = []
        if language == 'markdown':
            sections = extract_markdown_sections(current_path)
            code_refs = extract_markdown_code_refs(current_path)
            doc_refs = extract_markdown_doc_refs(current_path)
        elif language in ['python', 'javascript', 'typescript', 'tsx', 'jsx', 'go', 'rust', 'java']:
            functions = extract_code_definitions(current_path)
            docs_ref = extract_docs_ref(current_path, 500)  # Search first 500 chars for DOCS: ref
            raw_imports = parse_imports(current_path)
            # Filter to only local imports (not stdlib/third-party)
            imports = _filter_local_imports(raw_imports, target_dir)

        return FileInfo(
            path=rel_path,
            type='file',
            language=language,
            chars=chars,
            docs_ref=docs_ref,
            code_refs=code_refs,
            doc_refs=doc_refs,
            imports=imports,
            sections=sections,
            functions=functions,
        )

    elif current_path.is_dir():
        # Skip hidden directories and common non-code directories
        if current_path.name.startswith('.') and current_path != target_dir:
            return None

        skip_dirs = {'__pycache__', 'node_modules', '.venv', 'venv', 'dist', 'build', '.git'}
        if current_path.name in skip_dirs:
            return None

        # Collect all children first
        all_children = []
        for child in sorted(current_path.iterdir()):
            child_info = build_file_tree(
                target_dir, ignore_patterns, child, depth + 1, max_depth,
                min_size=min_size, top_files=top_files
            )
            if child_info:
                all_children.append(child_info)

        # Separate directories and files
        dirs = [c for c in all_children if c.type == 'dir']
        files = [c for c in all_children if c.type == 'file']

        # Apply min_size filter to files
        hidden_by_size = 0
        if min_size > 0:
            filtered_files = []
            for f in files:
                if f.chars >= min_size:
                    filtered_files.append(f)
                else:
                    hidden_by_size += 1
            files = filtered_files

        # Apply top_files filter (keep largest files)
        hidden_by_top = 0
        if top_files > 0 and len(files) > top_files:
            # Sort by size descending, take top N
            files_sorted = sorted(files, key=lambda f: f.chars, reverse=True)
            hidden_by_top = len(files) - top_files
            files = files_sorted[:top_files]
            # Re-sort alphabetically for display
            files = sorted(files, key=lambda f: f.path)

        # Combine: directories first, then files
        children = dirs + files
        hidden_count = hidden_by_size + hidden_by_top

        # Don't include empty directories (unless they have hidden files)
        if not children and hidden_count == 0 and current_path != target_dir:
            return None

        # Calculate total chars for directory (sum of all children, including hidden)
        total_chars = 0
        for child in all_children:
            if child.type == 'file':
                total_chars += child.chars
            else:
                total_chars += child.total_chars

        return FileInfo(
            path=rel_path,
            type='dir',
            total_chars=total_chars,
            children=children,
            hidden_count=hidden_count,
        )

    return None


def get_dependency_info(target_dir: Path) -> List[DependencyInfo]:
    """Get dependency information from modules.yaml."""
    modules = analyze_modules(target_dir)

    deps = []
    for m in modules:
        deps.append(DependencyInfo(
            name=m.name,
            code_pattern=m.code_pattern,
            docs_path=m.docs_path,
            depends_on=m.depends_on,
            lines=m.total_lines,
            files=len(m.code_files),
        ))

    return deps


def count_tree_stats(tree: FileInfo) -> Dict[str, Any]:
    """Count statistics from file tree."""
    stats = {
        'total_files': 0,
        'total_dirs': 0,
        'total_chars': 0,
        'doc_files': 0,
        'code_files': 0,
        'link_count': 0,
        'by_language': {},
    }

    def traverse(node: FileInfo):
        if node.type == 'file':
            stats['total_files'] += 1
            stats['total_chars'] += node.chars
            if node.language:
                stats['by_language'][node.language] = stats['by_language'].get(node.language, 0) + 1
                if node.language == 'markdown':
                    stats['doc_files'] += 1
                else:
                    stats['code_files'] += 1
                    # Count files with DOCS: references
                    if node.docs_ref:
                        stats['link_count'] += 1
        elif node.type == 'dir':
            stats['total_dirs'] += 1
            for child in node.children:
                traverse(child)

    traverse(tree)

    # Calculate average links per code file
    if stats['code_files'] > 0:
        stats['avg_links_per_file'] = round(stats['link_count'] / stats['code_files'], 2)
    else:
        stats['avg_links_per_file'] = 0

    return stats


def count_docs_structure(target_dir: Path) -> Dict[str, int]:
    """Count areas and modules from docs/ folder structure.

    Areas = direct subfolders of docs/ (excluding concepts, map files)
    Modules = subfolders within areas
    """
    docs_dir = target_dir / "docs"
    if not docs_dir.exists():
        return {'areas': 0, 'modules': 0}

    areas = 0
    modules = 0

    for item in docs_dir.iterdir():
        if not item.is_dir():
            continue
        if item.name in ('concepts', '__pycache__'):
            continue

        # This is an area
        areas += 1

        # Count modules (subfolders within area)
        for subitem in item.iterdir():
            if subitem.is_dir() and not subitem.name.startswith('.'):
                modules += 1

    return {'areas': areas, 'modules': modules}


def generate_repo_overview(
    target_dir: Path,
    subfolder: Optional[str] = None,
    min_size: int = 500,
    top_files: int = 10,
) -> RepoOverview:
    """Generate complete repository overview.

    Args:
        target_dir: Root directory of the project
        subfolder: Optional subfolder to map only (relative to target_dir)
        min_size: Minimum file size in chars to include (default 500)
        top_files: Maximum files per directory (default 10, 0 = unlimited)
    """
    from datetime import datetime

    ignore_patterns = load_ignore_patterns(target_dir)

    start_path = target_dir
    if subfolder:
        start_path = target_dir / subfolder
        if not start_path.exists():
            raise FileNotFoundError(f"Folder not found: {subfolder}")

    # Build file tree with filtering
    file_tree = build_file_tree(
        target_dir, ignore_patterns,
        current_path=start_path,
        min_size=min_size,
        top_files=top_files,
    )
    if not file_tree:
        file_tree = FileInfo(path=start_path.name, type='dir')

    # Get dependencies
    dependencies = get_dependency_info(target_dir)

    # Calculate stats
    stats = count_tree_stats(file_tree)

    # Count areas and modules from docs/ structure
    docs_stats = count_docs_structure(target_dir)
    stats['areas'] = docs_stats['areas']
    stats['modules'] = docs_stats['modules']

    return RepoOverview(
        project_name=target_dir.name if not subfolder else f"{target_dir.name}/{subfolder}",
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
        file_tree=file_tree,
        dependencies=dependencies,
        stats=stats,
    )


def _save_single_map(
    target_dir: Path,
    output_dir: Path,
    output_format: str,
    subfolder: Optional[str],
    min_size: int,
    top_files: int,
) -> Path:
    """Internal helper to generate and save a single map file."""
    overview = generate_repo_overview(
        target_dir,
        subfolder=subfolder,
        min_size=min_size,
        top_files=top_files
    )

    # Generate filename (map_subfolder if provided)
    ext = output_format if output_format in ["yaml", "json"] else "md"
    output_name = "map"
    if subfolder:
        # Sanitize subfolder name for filename
        safe_folder = re.sub(r'[^a-zA-Z0-9_-]', '_', subfolder.strip('/'))
        output_name = f"map_{safe_folder}"

    output_path = output_dir / f"{output_name}.{ext}"

    if output_format == "yaml":
        content = format_yaml(overview)
    elif output_format == "json":
        content = format_json(overview)
    else:
        content = format_markdown(overview)

    output_path.write_text(content, encoding='utf-8')
    return output_path


def generate_and_save(
    target_dir: Path,
    output_format: str = "md",
    subfolder: Optional[str] = None,
    min_size: int = 500,
    top_files: int = 10,
) -> Path:
    """Generate overview and save to project root.

    Default behavior (no subfolder):
    - Saves map.{ext} to root
    - Saves map.{ext} to docs/ (if exists)
    - Saves map_{folder}.{ext} for key folders (src, app, backend, frontend, etc)

    Args:
        target_dir: Root directory of the project
        output_format: Output format (md, yaml, json)
        subfolder: Optional subfolder to map only
        min_size: Minimum file size in chars to include
        top_files: Maximum files per directory
    """
    if subfolder:
        # Explicit subfolder requested - save only to root
        return _save_single_map(target_dir, target_dir, output_format, subfolder, min_size, top_files)

    # Default logic: Multi-generation
    # 1. Main map in root
    main_map = _save_single_map(target_dir, target_dir, output_format, None, min_size, top_files)

    # 2. Main map in docs/ (if exists)
    docs_dir = target_dir / "docs"
    if docs_dir.exists() and docs_dir.is_dir():
        _save_single_map(target_dir, docs_dir, output_format, None, min_size, top_files)

    # 3. Auto-folder maps (in root)
    auto_folders = ['src', 'app', 'backend', 'frontend', 'website', 'api']
    for folder in auto_folders:
        folder_path = target_dir / folder
        if folder_path.exists() and folder_path.is_dir():
            try:
                _save_single_map(target_dir, target_dir, output_format, folder, min_size, top_files)
            except Exception:
                continue

    return main_map


if __name__ == "__main__":
    import sys
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    fmt = sys.argv[2] if len(sys.argv) > 2 else "md"
    output = generate_and_save(target, fmt)
    print(f"Generated: {output}")
