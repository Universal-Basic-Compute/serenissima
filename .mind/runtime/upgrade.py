"""Auto-upgrade runtime when mind-mcp repo has new commits."""

import subprocess
import shutil
import sys
import logging
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger("mind.upgrade")

SKIP_PATTERNS = {"__pycache__", ".pyc", ".pyo", ".git"}


def get_installed_version(target_dir: Path) -> Tuple[Optional[str], Optional[str]]:
    """Read installed commit hash and remote URL from .mind/version.txt.

    Returns: (commit_hash, remote_url) or (None, None) if not found.
    """
    version_file = target_dir / ".mind" / "version.txt"
    if not version_file.exists():
        return None, None

    try:
        lines = version_file.read_text().strip().split("\n")
        commit_hash = lines[0] if len(lines) > 0 else None
        remote_url = lines[1] if len(lines) > 1 else None
        return commit_hash, remote_url
    except Exception:
        return None, None


def fetch_latest_commit(remote_url: str) -> Optional[str]:
    """Fetch latest commit hash from remote without cloning.

    Uses git ls-remote to check HEAD of remote.
    """
    if not remote_url:
        return None

    try:
        result = subprocess.run(
            ["git", "ls-remote", remote_url, "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0 and result.stdout:
            # Format: "<hash>\tHEAD"
            return result.stdout.split()[0]
    except Exception as e:
        logger.debug(f"Failed to fetch remote: {e}")

    return None


def find_local_repo(remote_url: str) -> Optional[Path]:
    """Find local clone of mind-mcp repo.

    Checks common locations and MIND_MCP_PATH env var.
    """
    import os

    # Check env var first
    env_path = os.environ.get("MIND_MCP_PATH")
    if env_path:
        path = Path(env_path)
        if path.exists() and (path / "runtime").exists():
            return path

    # Check common locations
    home = Path.home()
    candidates = [
        home / "mind-mcp",
        home / "code" / "mind-mcp",
        home / "projects" / "mind-mcp",
        home / "dev" / "mind-mcp",
        Path("/home/mind-protocol/mind-mcp"),
    ]

    for path in candidates:
        if path.exists() and (path / "runtime").exists():
            # Verify it's the right repo
            try:
                result = subprocess.run(
                    ["git", "remote", "get-url", "origin"],
                    cwd=path,
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    local_remote = result.stdout.strip()
                    # Normalize URLs for comparison
                    if _normalize_url(local_remote) == _normalize_url(remote_url):
                        return path
            except Exception:
                continue

    return None


def _normalize_url(url: str) -> str:
    """Normalize git URL for comparison."""
    # Remove .git suffix and protocol differences
    url = url.rstrip("/")
    if url.endswith(".git"):
        url = url[:-4]
    # Convert SSH to HTTPS format for comparison
    if url.startswith("git@"):
        url = url.replace(":", "/").replace("git@", "https://")
    return url.lower()


def pull_latest(repo_path: Path) -> bool:
    """Pull latest changes in local repo."""
    try:
        result = subprocess.run(
            ["git", "pull", "--ff-only"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0
    except Exception as e:
        logger.error(f"Failed to pull: {e}")
        return False


def copy_runtime(src: Path, dst: Path) -> int:
    """Copy runtime files from src to dst. Returns count of updated files."""
    def should_skip(p: Path) -> bool:
        return any(x in SKIP_PATTERNS or x.endswith((".pyc", ".pyo")) for x in p.parts)

    updated = 0
    for f in src.rglob("*"):
        if f.is_dir() or should_skip(f):
            continue
        rel = f.relative_to(src)
        df = dst / rel
        df.parent.mkdir(parents=True, exist_ok=True)

        if not df.exists() or f.read_bytes() != df.read_bytes():
            shutil.copy2(f, df)
            updated += 1

    return updated


def update_version_file(target_dir: Path, commit_hash: str, remote_url: str) -> None:
    """Update .mind/version.txt with new hash."""
    version_file = target_dir / ".mind" / "version.txt"
    version_file.write_text(f"{commit_hash}\n{remote_url}\n")


def check_and_upgrade(target_dir: Path) -> bool:
    """Check for updates and auto-upgrade if needed.

    Returns True if upgrade was performed.
    """
    installed_hash, remote_url = get_installed_version(target_dir)

    if not installed_hash or not remote_url:
        logger.debug("No version info found, skipping upgrade check")
        return False

    if installed_hash == "unknown":
        logger.debug("Unknown version, skipping upgrade check")
        return False

    # Check remote for latest
    latest_hash = fetch_latest_commit(remote_url)

    if not latest_hash:
        logger.debug("Could not fetch remote, skipping upgrade check")
        return False

    if latest_hash == installed_hash:
        logger.debug(f"Already at latest: {installed_hash[:8]}")
        return False

    # Need to upgrade
    logger.info(f"Update available: {installed_hash[:8]} → {latest_hash[:8]}")

    # Find local repo
    repo_path = find_local_repo(remote_url)
    if not repo_path:
        logger.warning("Cannot find local mind-mcp repo for upgrade. Set MIND_MCP_PATH env var.")
        return False

    # Pull latest
    logger.info(f"Pulling latest from {repo_path}")
    if not pull_latest(repo_path):
        logger.error("Failed to pull latest changes")
        return False

    # Copy runtime
    runtime_src = repo_path / "runtime"
    runtime_dst = target_dir / ".mind" / "runtime"

    if not runtime_dst.exists():
        logger.warning("No .mind/runtime/ found, skipping copy")
        return False

    updated = copy_runtime(runtime_src, runtime_dst)
    logger.info(f"Updated {updated} runtime files")

    # Update version file
    update_version_file(target_dir, latest_hash, remote_url)
    logger.info(f"Upgraded to {latest_hash[:8]}")

    return True
