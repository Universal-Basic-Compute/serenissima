"""
Capability runtime integration for MCP server.

This module wraps the capability runtime from mind-platform,
handling import path resolution and providing a clean interface
for the MCP server.
"""

import asyncio
import importlib.util
import logging
import sys
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Optional

log = logging.getLogger(__name__)


def _load_capability_module():
    """
    Load capability runtime from local runtime/capability module.
    """
    try:
        from runtime import capability
        return capability
    except ImportError:
        pass

    # Fallback: try explicit path
    this_file = Path(__file__).resolve()
    capability_init = this_file.parent / "capability" / "__init__.py"

    if not capability_init.exists():
        return None

    # Platform path is the runtime directory containing the capability module
    platform_path = capability_init.parent.parent  # runtime/

    # Load using importlib from explicit path
    spec = importlib.util.spec_from_file_location(
        "runtime_capability",
        capability_init,
        submodule_search_locations=[str(capability_init.parent)]
    )

    if spec is None or spec.loader is None:
        return None

    # Add platform path permanently - needed for checks.py imports
    if str(platform_path) not in sys.path:
        sys.path.insert(0, str(platform_path))

    try:
        module = importlib.util.module_from_spec(spec)
        sys.modules["mind_platform_capability"] = module
        spec.loader.exec_module(module)
        log.info(f"Loaded capability runtime from {platform_path}")

        # Also register as runtime.capability so checks.py can import it
        # This works around the namespace conflict with mind-mcp's runtime
        sys.modules["runtime.capability"] = module
        log.debug("Registered runtime.capability alias for mind-platform module")

        return module
    except Exception as e:
        log.warning(f"Failed to load capability runtime: {e}")
        return None


# Try to load capability runtime
_capability_module = _load_capability_module()

if _capability_module:
    CAPABILITY_RUNTIME_AVAILABLE = True
    discover_capabilities = _capability_module.discover_capabilities
    load_checks = _capability_module.load_checks
    TriggerRegistry = _capability_module.TriggerRegistry
    dispatch_trigger = _capability_module.dispatch_trigger
    create_task_runs = _capability_module.create_task_runs
    run_checks = _capability_module.run_checks
    Signal = _capability_module.Signal
    get_throttler = _capability_module.get_throttler
    reset_throttler = _capability_module.reset_throttler
    get_controller = _capability_module.get_controller
    get_agent_registry = _capability_module.get_registry
    reset_agents = _capability_module.reset_agents
    AgentMode = _capability_module.AgentMode
    # Graph ops for task lifecycle
    claim_task = _capability_module.claim_task
    complete_task = _capability_module.complete_task
    fail_task = _capability_module.fail_task
    release_task = _capability_module.release_task
    update_actor_heartbeat = _capability_module.update_actor_heartbeat
    set_actor_working = _capability_module.set_actor_working
    set_actor_idle = _capability_module.set_actor_idle
else:
    CAPABILITY_RUNTIME_AVAILABLE = False

    # Provide stubs
    class TriggerRegistry:
        def __init__(self): pass
        def register_check(self, fn, cap): pass
        def get_stats(self): return {}
        def get_all_triggers(self): return []

    class Signal:
        HEALTHY = "healthy"
        DEGRADED = "degraded"
        CRITICAL = "critical"

    def discover_capabilities(path): return []
    def run_checks(*args, **kwargs): return {}
    def get_throttler(): return None
    def get_controller(): return None


class CapabilityManager:
    """
    Manages capability lifecycle for MCP server.

    - Loads capabilities from .mind/capabilities/ on startup
    - Registers checks in TriggerRegistry
    - Dispatches triggers
    - Manages cron scheduler for periodic triggers
    - Manages file watcher for filesystem events
    - Manages git hooks for commit events
    """

    def __init__(self, target_dir: Path, graph: Any = None):
        self.target_dir = target_dir
        # Wrap graph in capability adapter for proper embeddings/physics
        if graph is not None:
            from runtime.capability_graph_adapter import CapabilityGraphAdapter
            self.graph = CapabilityGraphAdapter(graph)
        else:
            self.graph = None
        self.registry = TriggerRegistry()
        self.capabilities: list[tuple[str, Path, list[Callable]]] = []
        self.cron_scheduler: Optional[CronScheduler] = None
        self.file_watcher = None  # FileWatcher instance
        self.git_hooks = None  # GitHooks instance
        self._initialized = False

    def initialize(self) -> dict:
        """
        Load capabilities and register checks.

        Returns summary of what was loaded.
        """
        if not CAPABILITY_RUNTIME_AVAILABLE:
            return {"error": "Capability runtime not available"}

        caps_dir = self.target_dir / ".mind" / "capabilities"

        if not caps_dir.exists():
            return {"capabilities": 0, "checks": 0, "error": "No capabilities directory"}

        # Discover capabilities
        self.capabilities = discover_capabilities(caps_dir)

        # Register all checks
        total_checks = 0
        for cap_name, cap_path, checks in self.capabilities:
            for check_fn in checks:
                self.registry.register_check(check_fn, cap_name)
                total_checks += 1

        self._initialized = True

        summary = {
            "capabilities": len(self.capabilities),
            "checks": total_checks,
            "triggers": self.registry.get_stats(),
        }

        log.info(f"Initialized {len(self.capabilities)} capabilities with {total_checks} checks")
        return summary

    def fire_trigger(
        self,
        trigger_type: str,
        payload: Optional[dict] = None,
        create_tasks: bool = True,
    ) -> dict:
        """
        Fire a trigger and optionally create task_runs.

        Args:
            trigger_type: Type of trigger (e.g., "init.startup", "file.on_modify")
            payload: Trigger payload (e.g., {"file_path": "docs/auth/PATTERNS.md"})
            create_tasks: Whether to create task_run nodes

        Returns:
            Summary with checks run, signals, and created tasks
        """
        if not self._initialized:
            return {"error": "CapabilityManager not initialized"}

        payload = payload or {}

        return run_checks(
            trigger_type=trigger_type,
            payload=payload,
            registry=self.registry,
            target_dir=self.target_dir,
            graph=self.graph,
            create_tasks=create_tasks,
        )

    def start_cron_scheduler(self) -> None:
        """Start the cron scheduler for periodic triggers."""
        if self.cron_scheduler:
            return

        self.cron_scheduler = CronScheduler(self)
        self.cron_scheduler.start()
        log.info("Cron scheduler started")

    def stop_cron_scheduler(self) -> None:
        """Stop the cron scheduler."""
        if self.cron_scheduler:
            self.cron_scheduler.stop()
            self.cron_scheduler = None
            log.info("Cron scheduler stopped")

    def start_file_watcher(self, watch_paths: list[str] = None) -> None:
        """Start the file watcher for filesystem events."""
        if self.file_watcher:
            return

        try:
            from runtime.triggers import FileWatcher
            self.file_watcher = FileWatcher(
                target_dir=self.target_dir,
                fire_trigger=self.fire_trigger,
                watch_paths=watch_paths,
            )
            self.file_watcher.start()
            log.info("File watcher started")
        except ImportError as e:
            log.warning(f"FileWatcher not available: {e}")
        except Exception as e:
            log.error(f"Failed to start file watcher: {e}")

    def stop_file_watcher(self) -> None:
        """Stop the file watcher."""
        if self.file_watcher:
            self.file_watcher.stop()
            self.file_watcher = None
            log.info("File watcher stopped")

    def get_git_hooks(self):
        """Get GitHooks instance for manual trigger firing."""
        if not self.git_hooks:
            try:
                from runtime.triggers import GitHooks
                self.git_hooks = GitHooks(
                    target_dir=self.target_dir,
                    fire_trigger=self.fire_trigger,
                )
            except ImportError as e:
                log.warning(f"GitHooks not available: {e}")
                return None
        return self.git_hooks

    def get_status(self) -> dict:
        """Get capability system status."""
        throttler = get_throttler() if CAPABILITY_RUNTIME_AVAILABLE else None
        controller = get_controller() if CAPABILITY_RUNTIME_AVAILABLE else None

        status = {
            "initialized": self._initialized,
            "capabilities": len(self.capabilities),
            "registry": self.registry.get_stats() if self._initialized else {},
            "cron_running": self.cron_scheduler is not None and self.cron_scheduler.running,
            "file_watcher_running": self.file_watcher is not None and self.file_watcher.running,
        }

        if throttler:
            # Throttler tracks cooldowns, not active tasks
            status["throttler"] = {
                "cooldown_s": throttler.cooldown_s,
                "max_per_module": throttler.max_per_module,
                "tracked_keys": len(throttler._created),
            }

        if controller:
            status["controller"] = {
                "enabled": controller.enabled,
                "paused": controller.paused,
            }

        return status

    def list_capabilities(self) -> list[dict]:
        """List all loaded capabilities with their checks."""
        result = []
        for cap_name, cap_path, checks in self.capabilities:
            cap_info = {
                "name": cap_name,
                "path": str(cap_path),
                "checks": [],
            }
            for check_def in checks:
                cap_info["checks"].append({
                    "id": check_def.id,
                    "triggers": [t.type for t in check_def.triggers],
                    "on_problem": check_def.on_problem,
                    "task": check_def.task,
                })
            result.append(cap_info)
        return result


class CronScheduler:
    """
    Simple cron scheduler for periodic triggers.

    Runs in a background thread and fires triggers at specified intervals.
    """

    def __init__(self, manager: CapabilityManager):
        self.manager = manager
        self.running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Track last fire times
        self._last_fire: dict[str, datetime] = {}

    def start(self) -> None:
        """Start the scheduler in a background thread."""
        if self.running:
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        self.running = True

    def stop(self) -> None:
        """Stop the scheduler."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        self.running = False

    def _run_loop(self) -> None:
        """Main scheduler loop."""
        while not self._stop_event.is_set():
            now = datetime.now()

            # Check each cron trigger type
            triggers = self.manager.registry.get_all_triggers()

            for trigger_type in triggers:
                if not trigger_type.startswith("cron."):
                    continue

                should_fire = self._should_fire(trigger_type, now)
                if should_fire:
                    try:
                        result = self.manager.fire_trigger(trigger_type, {})
                        log.debug(f"Cron {trigger_type}: {result}")
                        self._last_fire[trigger_type] = now
                    except Exception as e:
                        log.error(f"Cron {trigger_type} failed: {e}")

            # Sleep for 1 minute
            self._stop_event.wait(60)

    def _should_fire(self, trigger_type: str, now: datetime) -> bool:
        """Check if a cron trigger should fire."""
        last = self._last_fire.get(trigger_type)

        if trigger_type == "cron.hourly":
            if last is None or (now - last) >= timedelta(hours=1):
                return now.minute == 0
        elif trigger_type == "cron.daily":
            if last is None or (now - last) >= timedelta(days=1):
                return now.hour == 0 and now.minute == 0
        elif trigger_type == "cron.weekly":
            if last is None or (now - last) >= timedelta(weeks=1):
                return now.weekday() == 0 and now.hour == 0 and now.minute == 0
        elif trigger_type.startswith("cron.every_"):
            # Parse "cron.every_5m" -> 5 minutes
            try:
                minutes = int(trigger_type.split("_")[1].rstrip("m"))
                if last is None or (now - last) >= timedelta(minutes=minutes):
                    return True
            except (ValueError, IndexError):
                pass

        return False


# Singleton for global access
_capability_manager: Optional[CapabilityManager] = None


def get_capability_manager() -> Optional[CapabilityManager]:
    """Get the global capability manager."""
    return _capability_manager


def init_capability_manager(target_dir: Path, graph: Any = None) -> CapabilityManager:
    """Initialize the global capability manager."""
    global _capability_manager
    _capability_manager = CapabilityManager(target_dir, graph)
    return _capability_manager
