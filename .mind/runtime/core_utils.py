"""
Shared utilities for mind CLI.

DOCS: docs/core_utils/PATTERNS_Core_Utils_Functions.md
"""

from pathlib import Path
from typing import List

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# File extensions to ignore when counting/checking source files
IGNORED_EXTENSIONS = {
    # Compiled/binary
    '.pyc', '.pyo', '.class', '.o', '.obj', '.exe', '.dll', '.so', '.a',
    # Minified
    '.min.js', '.min.css', '.map',
    # Images
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp',
    # Fonts
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    # Archives
    '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
    # Data/config
    '.json', '.yaml', '.yml', '.toml', '.xml', '.csv',
    # Misc
    '.lock', '.log', '.env', '.gitignore', '.dockerignore',
    '.d.ts',  # TypeScript declaration files
}


TEMPLATES_REPO = "mind-protocol/mind-platform"
TEMPLATES_BRANCH = "main"
TEMPLATES_PATH = "templates"
CAPABILITIES_PATH = "capabilities"


def get_templates_path() -> Path:
    """
    Get path to templates directory.

    Templates are fetched from mind-platform GitHub repo and cached locally.

    Priority:
    1. Local cache (~/.mind/templates/) if fresh
    2. Fetch from GitHub mind-platform/templates/
    3. Development mode (mind-platform repo checkout)
    """
    import os

    # Cache location
    cache_dir = Path.home() / ".mind" / "templates"

    # Check if cache exists and is fresh (less than 24 hours old)
    cache_marker = cache_dir / ".cache_time"
    if cache_dir.exists() and cache_marker.exists():
        import time
        cache_age = time.time() - cache_marker.stat().st_mtime
        if cache_age < 86400:  # 24 hours
            return cache_dir

    # Development mode: check if mind-platform is a sibling directory
    dev_platform = Path(__file__).parent.parent.parent / "mind-platform" / "templates"
    if dev_platform.exists() and (dev_platform / "FRAMEWORK.md").exists():
        return dev_platform

    # Also check home directory for dev checkout
    home_platform = Path.home() / "mind-platform" / "templates"
    if home_platform.exists() and (home_platform / "FRAMEWORK.md").exists():
        return home_platform

    # Fetch from GitHub
    try:
        _fetch_templates_from_github(cache_dir)
        return cache_dir
    except Exception as e:
        # If fetch fails but cache exists, use stale cache
        if cache_dir.exists():
            print(f"Warning: Could not refresh templates ({e}), using cached version")
            return cache_dir
        raise FileNotFoundError(
            f"Templates not found and could not fetch from GitHub: {e}\n"
            "Ensure you have internet access or clone mind-platform locally."
        )


def _fetch_templates_from_github(cache_dir: Path) -> None:
    """Fetch templates from mind-platform GitHub repo."""
    import urllib.request
    import json
    import base64
    import shutil

    api_base = f"https://api.github.com/repos/{TEMPLATES_REPO}/contents/{TEMPLATES_PATH}"

    # Clear and recreate cache
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    def fetch_directory(api_url: str, local_dir: Path) -> None:
        """Recursively fetch directory contents."""
        req = urllib.request.Request(api_url, headers={"User-Agent": "mind-mcp"})
        with urllib.request.urlopen(req, timeout=30) as response:
            items = json.loads(response.read())

        for item in items:
            local_path = local_dir / item["name"]
            if item["type"] == "dir":
                local_path.mkdir(parents=True, exist_ok=True)
                fetch_directory(item["url"], local_path)
            elif item["type"] == "file":
                # Fetch file content
                file_req = urllib.request.Request(item["url"], headers={"User-Agent": "mind-mcp"})
                with urllib.request.urlopen(file_req, timeout=30) as file_response:
                    file_data = json.loads(file_response.read())
                    content = base64.b64decode(file_data["content"])
                    local_path.write_bytes(content)

    fetch_directory(f"{api_base}?ref={TEMPLATES_BRANCH}", cache_dir)

    # Update cache marker
    cache_marker = cache_dir / ".cache_time"
    cache_marker.touch()


def get_capabilities_path() -> Path:
    """
    Get path to capabilities directory.

    Capabilities are fetched from mind-platform GitHub repo and cached locally.

    Priority:
    1. Local cache (~/.mind/capabilities/) if fresh
    2. Fetch from GitHub mind-platform/capabilities/
    3. Development mode (mind-platform repo checkout)
    """
    # Cache location
    cache_dir = Path.home() / ".mind" / "capabilities"

    # Check if cache exists and is fresh (less than 24 hours old)
    cache_marker = cache_dir / ".cache_time"
    if cache_dir.exists() and cache_marker.exists():
        import time
        cache_age = time.time() - cache_marker.stat().st_mtime
        if cache_age < 86400:  # 24 hours
            return cache_dir

    # Development mode: check if mind-platform is a sibling directory
    dev_platform = Path(__file__).parent.parent.parent / "mind-platform" / "capabilities"
    if dev_platform.exists():
        return dev_platform

    # Also check home directory for dev checkout
    home_platform = Path.home() / "mind-platform" / "capabilities"
    if home_platform.exists():
        return home_platform

    # Fetch from GitHub
    try:
        _fetch_capabilities_from_github(cache_dir)
        return cache_dir
    except Exception as e:
        # If fetch fails but cache exists, use stale cache
        if cache_dir.exists():
            print(f"Warning: Could not refresh capabilities ({e}), using cached version")
            return cache_dir
        raise FileNotFoundError(
            f"Capabilities not found and could not fetch from GitHub: {e}\n"
            "Ensure you have internet access or clone mind-platform locally."
        )


def _fetch_capabilities_from_github(cache_dir: Path) -> None:
    """Fetch capabilities from mind-platform GitHub repo."""
    import urllib.request
    import json
    import base64
    import shutil

    api_base = f"https://api.github.com/repos/{TEMPLATES_REPO}/contents/{CAPABILITIES_PATH}"

    # Clear and recreate cache
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    def fetch_directory(api_url: str, local_dir: Path) -> None:
        """Recursively fetch directory contents."""
        req = urllib.request.Request(api_url, headers={"User-Agent": "mind-mcp"})
        with urllib.request.urlopen(req, timeout=30) as response:
            items = json.loads(response.read())

        for item in items:
            local_path = local_dir / item["name"]
            if item["type"] == "dir":
                local_path.mkdir(parents=True, exist_ok=True)
                fetch_directory(item["url"], local_path)
            elif item["type"] == "file":
                # Fetch file content
                file_req = urllib.request.Request(item["url"], headers={"User-Agent": "mind-mcp"})
                with urllib.request.urlopen(file_req, timeout=30) as file_response:
                    file_data = json.loads(file_response.read())
                    content = base64.b64decode(file_data["content"])
                    local_path.write_bytes(content)

    fetch_directory(f"{api_base}?ref={TEMPLATES_BRANCH}", cache_dir)

    # Update cache marker
    cache_marker = cache_dir / ".cache_time"
    cache_marker.touch()


def find_module_directories(docs_dir: Path) -> List[Path]:
    """
    Find all module directories in docs/.

    Handles both patterns:
    - docs/{module}/ (1 level)
    - docs/{area}/{module}/ (2 levels)

    A module directory is one that contains .md files with doc type prefixes.
    """
    modules = []
    doc_prefixes = [
        'OBJECTIVES_',
        'PATTERNS_',
        'BEHAVIORS_',
        'ALGORITHM_',
        'VALIDATION_',
        'IMPLEMENTATION_',
        'HEALTH_',
        'TEST_',
        'SYNC_',
    ]

    for item in docs_dir.iterdir():
        if not item.is_dir() or item.name == "concepts":
            continue

        # Check if this directory itself is a module (has doc files)
        md_files = list(item.glob("*.md"))
        has_doc_files = any(
            any(prefix in f.name for prefix in doc_prefixes)
            for f in md_files
        )

        if has_doc_files:
            modules.append(item)
        else:
            # Check subdirectories (area/module pattern)
            for subdir in item.iterdir():
                if not subdir.is_dir():
                    continue
                sub_md_files = list(subdir.glob("*.md"))
                has_sub_doc_files = any(
                    any(prefix in f.name for prefix in doc_prefixes)
                    for f in sub_md_files
                )
                if has_sub_doc_files:
                    modules.append(subdir)

    return modules
