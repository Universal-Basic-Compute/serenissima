"""
File and path utilities.

Contains:
- parse_gitignore: Parse .gitignore patterns
- should_ignore_path: Check if path matches ignore patterns
- is_binary_file: Check if file is binary
"""

import fnmatch
from pathlib import Path
from typing import List, Set

from .core_utils import IGNORED_EXTENSIONS


def parse_gitignore(gitignore_path: Path) -> List[str]:
    """Parse .gitignore file and return list of patterns."""
    patterns = []
    if not gitignore_path.exists():
        return patterns

    try:
        with open(gitignore_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if line.endswith('/'):
                    patterns.append(line.rstrip('/') + "/**")
                else:
                    patterns.append(line)
    except Exception:
        pass

    return patterns


def load_ignore_patterns(target_dir: Path) -> Set[str]:
    """Load ignore patterns from .gitignore and .mindignore."""
    patterns = {
        "node_modules/**",
        ".next/**",
        "dist/**",
        "build/**",
        "vendor/**",
        "__pycache__/**",
        ".git/**",
        "*.min.js",
        "*.bundle.js",
        ".venv/**",
        "venv/**",
    }

    patterns.update(parse_gitignore(target_dir / ".gitignore"))
    patterns.update(parse_gitignore(target_dir / ".mindignore"))

    return patterns


def should_ignore_path(path: Path, ignore_patterns: Set[str], target_dir: Path) -> bool:
    """Check if a path should be ignored based on patterns."""
    try:
        rel_path = path.relative_to(target_dir)
    except ValueError:
        rel_path = path

    rel_str = str(rel_path)

    for pattern in ignore_patterns:
        if fnmatch.fnmatch(rel_str, pattern):
            return True
        if fnmatch.fnmatch(str(rel_path.name), pattern):
            return True
        # Check directory patterns
        if "**" in pattern:
            base = pattern.replace("/**", "")
            if rel_str.startswith(base + "/") or rel_str == base:
                return True

    return False


def is_binary_file(path: Path) -> bool:
    """Check if a file is binary (not text)."""
    if path.suffix.lower() in IGNORED_EXTENSIONS:
        return True

    try:
        with open(path, 'rb') as f:
            chunk = f.read(1024)
            if b'\x00' in chunk:
                return True
    except Exception:
        return True

    return False
