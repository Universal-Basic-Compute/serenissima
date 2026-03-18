"""
Trigger sources for capability system.

Provides:
- FileWatcher: Monitors filesystem for file events
- GitHooks: Fires triggers on git operations

DOCS: docs/mcp-tools/PATTERNS_MCP_Tools.md
"""

import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable, Optional, Set

from watchdog.observers import Observer
from watchdog.events import (
    FileSystemEventHandler,
    FileCreatedEvent,
    FileModifiedEvent,
    FileDeletedEvent,
    FileMovedEvent,
)

logger = logging.getLogger(__name__)


class MindFileHandler(FileSystemEventHandler):
    """
    Handles file system events and fires capability triggers.

    Maps watchdog events to trigger types:
    - FileCreatedEvent  → file.on_create
    - FileModifiedEvent → file.on_modify
    - FileDeletedEvent  → file.on_delete
    - FileMovedEvent    → file.on_move
    """

    def __init__(
        self,
        fire_trigger: Callable[[str, dict], Any],
        target_dir: Path,
        ignore_patterns: Optional[Set[str]] = None,
    ):
        super().__init__()
        self.fire_trigger = fire_trigger
        self.target_dir = target_dir
        self.ignore_patterns = ignore_patterns or {
            ".git",
            "__pycache__",
            ".pyc",
            "node_modules",
            ".mind/logs",
            ".mind/cache",
        }
        self._debounce_lock = threading.Lock()
        self._debounce_events: dict[str, float] = {}
        self._debounce_seconds = 1.0  # Ignore duplicate events within 1s

    def _should_ignore(self, path: str) -> bool:
        """Check if path should be ignored."""
        for pattern in self.ignore_patterns:
            if pattern in path:
                return True
        return False

    def _debounce(self, event_key: str) -> bool:
        """Return True if event should be processed (not debounced)."""
        import time
        now = time.time()

        with self._debounce_lock:
            last_time = self._debounce_events.get(event_key, 0)
            if now - last_time < self._debounce_seconds:
                return False  # Debounce - skip this event
            self._debounce_events[event_key] = now
            return True

    def _get_relative_path(self, path: str) -> str:
        """Get path relative to target_dir."""
        try:
            return str(Path(path).relative_to(self.target_dir))
        except ValueError:
            return path

    def on_created(self, event: FileCreatedEvent):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return

        rel_path = self._get_relative_path(event.src_path)
        event_key = f"create:{rel_path}"

        if not self._debounce(event_key):
            return

        logger.info(f"[FILE] created: {rel_path}")
        try:
            self.fire_trigger("file.on_create", {"file_path": rel_path})
        except Exception as e:
            logger.error(f"Trigger failed for file.on_create: {e}")

    def on_modified(self, event: FileModifiedEvent):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return

        rel_path = self._get_relative_path(event.src_path)
        event_key = f"modify:{rel_path}"

        if not self._debounce(event_key):
            return

        logger.info(f"[FILE] modified: {rel_path}")
        try:
            self.fire_trigger("file.on_modify", {"file_path": rel_path})
        except Exception as e:
            logger.error(f"Trigger failed for file.on_modify: {e}")

    def on_deleted(self, event: FileDeletedEvent):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path):
            return

        rel_path = self._get_relative_path(event.src_path)
        event_key = f"delete:{rel_path}"

        if not self._debounce(event_key):
            return

        logger.info(f"[FILE] deleted: {rel_path}")
        try:
            self.fire_trigger("file.on_delete", {"file_path": rel_path})
        except Exception as e:
            logger.error(f"Trigger failed for file.on_delete: {e}")

    def on_moved(self, event: FileMovedEvent):
        if event.is_directory:
            return
        if self._should_ignore(event.src_path) and self._should_ignore(event.dest_path):
            return

        src_rel = self._get_relative_path(event.src_path)
        dest_rel = self._get_relative_path(event.dest_path)
        event_key = f"move:{src_rel}:{dest_rel}"

        if not self._debounce(event_key):
            return

        logger.info(f"[FILE] moved: {src_rel} → {dest_rel}")
        try:
            self.fire_trigger("file.on_move", {
                "file_path": dest_rel,
                "old_path": src_rel,
            })
        except Exception as e:
            logger.error(f"Trigger failed for file.on_move: {e}")


class FileWatcher:
    """
    Watches filesystem for changes and fires capability triggers.

    Usage:
        watcher = FileWatcher(target_dir, fire_trigger_fn)
        watcher.start()
        # ... later
        watcher.stop()
    """

    def __init__(
        self,
        target_dir: Path,
        fire_trigger: Callable[[str, dict], Any],
        watch_paths: Optional[list[str]] = None,
    ):
        self.target_dir = Path(target_dir)
        self.fire_trigger = fire_trigger
        self.watch_paths = watch_paths or ["docs", "runtime", "mcp", "cli", ".mind"]

        self._observer: Optional[Observer] = None
        self._handler: Optional[MindFileHandler] = None
        self.running = False

    def start(self) -> None:
        """Start watching for file changes."""
        if self.running:
            return

        self._handler = MindFileHandler(
            fire_trigger=self.fire_trigger,
            target_dir=self.target_dir,
        )
        self._observer = Observer()

        # Watch each configured path
        watched = 0
        for rel_path in self.watch_paths:
            full_path = self.target_dir / rel_path
            if full_path.exists():
                self._observer.schedule(
                    self._handler,
                    str(full_path),
                    recursive=True,
                )
                watched += 1
                logger.debug(f"Watching: {rel_path}")

        if watched == 0:
            logger.warning("No paths to watch")
            return

        self._observer.start()
        self.running = True
        logger.info(f"FileWatcher started ({watched} paths)")

    def stop(self) -> None:
        """Stop watching for file changes."""
        if not self.running:
            return

        if self._observer:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None

        self.running = False
        logger.info("FileWatcher stopped")


class GitHooks:
    """
    Fires triggers based on git operations.

    Provides:
    - fire_post_commit(): Call after a commit
    - fire_pre_commit(): Call before a commit (for validation)
    - install_hooks(): Install git hooks in .git/hooks/

    Note: This doesn't automatically intercept git commands.
    Either call methods manually or install hooks via install_hooks().
    """

    def __init__(
        self,
        target_dir: Path,
        fire_trigger: Callable[[str, dict], Any],
    ):
        self.target_dir = Path(target_dir)
        self.fire_trigger = fire_trigger

    def _get_last_commit_info(self) -> dict:
        """Get info about the last commit."""
        try:
            result = subprocess.run(
                ["git", "log", "-1", "--format=%H|%s|%an|%ae"],
                cwd=self.target_dir,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                parts = result.stdout.strip().split("|")
                if len(parts) >= 4:
                    return {
                        "commit_hash": parts[0],
                        "message": parts[1],
                        "author_name": parts[2],
                        "author_email": parts[3],
                    }
        except Exception as e:
            logger.warning(f"Failed to get commit info: {e}")
        return {}

    def _get_changed_files(self, commit: str = "HEAD") -> list[str]:
        """Get list of files changed in a commit."""
        try:
            result = subprocess.run(
                ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", commit],
                cwd=self.target_dir,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                return [f for f in result.stdout.strip().split("\n") if f]
        except Exception as e:
            logger.warning(f"Failed to get changed files: {e}")
        return []

    def fire_post_commit(self) -> dict:
        """
        Fire git.post_commit trigger.

        Call this after a commit is made.
        Returns the trigger result.
        """
        commit_info = self._get_last_commit_info()
        changed_files = self._get_changed_files()

        payload = {
            **commit_info,
            "changed_files": changed_files,
            "files_count": len(changed_files),
        }

        logger.info(f"[GIT] post_commit: {commit_info.get('message', 'unknown')[:50]}")

        try:
            return self.fire_trigger("git.post_commit", payload)
        except Exception as e:
            logger.error(f"Trigger failed for git.post_commit: {e}")
            return {"error": str(e)}

    def fire_pre_commit(self, staged_files: Optional[list[str]] = None) -> dict:
        """
        Fire git.pre_commit trigger.

        Call this before a commit for validation.
        Returns the trigger result (check for errors to block commit).
        """
        if staged_files is None:
            # Get staged files
            try:
                result = subprocess.run(
                    ["git", "diff", "--cached", "--name-only"],
                    cwd=self.target_dir,
                    capture_output=True,
                    text=True,
                )
                if result.returncode == 0:
                    staged_files = [f for f in result.stdout.strip().split("\n") if f]
                else:
                    staged_files = []
            except Exception as e:
                logger.warning(f"Failed to get staged files: {e}")
                staged_files = []

        payload = {
            "staged_files": staged_files,
            "files_count": len(staged_files),
        }

        logger.info(f"[GIT] pre_commit: {len(staged_files)} staged files")

        try:
            return self.fire_trigger("git.pre_commit", payload)
        except Exception as e:
            logger.error(f"Trigger failed for git.pre_commit: {e}")
            return {"error": str(e)}

    def install_hooks(self) -> bool:
        """
        Install git hooks that call mind triggers.

        Creates:
        - .git/hooks/post-commit
        - .git/hooks/pre-commit

        Returns True if successful.
        """
        hooks_dir = self.target_dir / ".git" / "hooks"
        if not hooks_dir.exists():
            logger.error("Not a git repository or .git/hooks not found")
            return False

        # Post-commit hook
        post_commit = hooks_dir / "post-commit"
        post_commit_content = '''#!/bin/bash
# Mind Protocol: Fire post-commit trigger
# Installed by: mind triggers install

cd "$(git rev-parse --show-toplevel)"

# Fire trigger via mind CLI (if available)
if command -v mind &> /dev/null; then
    mind trigger git.post_commit 2>/dev/null &
fi

# Or via Python directly
python3 -c "
from pathlib import Path
from runtime.capability_integration import get_capability_manager
mgr = get_capability_manager()
if mgr:
    mgr.fire_trigger('git.post_commit', {})
" 2>/dev/null &

exit 0
'''

        # Pre-commit hook
        pre_commit = hooks_dir / "pre-commit"
        pre_commit_content = '''#!/bin/bash
# Mind Protocol: Fire pre-commit trigger
# Installed by: mind triggers install

cd "$(git rev-parse --show-toplevel)"

# Fire trigger via Python
python3 -c "
from pathlib import Path
from runtime.capability_integration import get_capability_manager
mgr = get_capability_manager()
if mgr:
    result = mgr.fire_trigger('git.pre_commit', {})
    # Check for critical issues that should block commit
    if result.get('critical', 0) > 0:
        print('Pre-commit checks found critical issues')
        exit(1)
" 2>/dev/null

exit 0
'''

        try:
            # Write hooks
            post_commit.write_text(post_commit_content)
            pre_commit.write_text(pre_commit_content)

            # Make executable
            os.chmod(post_commit, 0o755)
            os.chmod(pre_commit, 0o755)

            logger.info("Git hooks installed")
            return True

        except Exception as e:
            logger.error(f"Failed to install hooks: {e}")
            return False

    def uninstall_hooks(self) -> bool:
        """Remove installed git hooks."""
        hooks_dir = self.target_dir / ".git" / "hooks"

        removed = 0
        for hook_name in ["post-commit", "pre-commit"]:
            hook_path = hooks_dir / hook_name
            if hook_path.exists():
                try:
                    content = hook_path.read_text()
                    if "Mind Protocol" in content:
                        hook_path.unlink()
                        removed += 1
                        logger.info(f"Removed {hook_name} hook")
                except Exception as e:
                    logger.warning(f"Failed to remove {hook_name}: {e}")

        return removed > 0
