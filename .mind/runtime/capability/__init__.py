"""
Capability Runtime Infrastructure.

Provides the core primitives for health checks:
- @check decorator for defining health checks
- Signal class for returning health status
- triggers object for defining when checks run
- TriggerRegistry for managing check registration
- Task lifecycle functions
"""

import time
import hashlib
import logging
import importlib.util
from enum import Enum
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set

log = logging.getLogger("mind.capability")


# =============================================================================
# SIGNAL - Health check return values
# =============================================================================

class SignalLevel(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"


@dataclass
class Signal:
    """Health check signal with level and data."""
    level: SignalLevel
    data: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def healthy(cls, **data) -> "Signal":
        return cls(level=SignalLevel.HEALTHY, data=data)

    @classmethod
    def degraded(cls, **data) -> "Signal":
        return cls(level=SignalLevel.DEGRADED, data=data)

    @classmethod
    def critical(cls, **data) -> "Signal":
        return cls(level=SignalLevel.CRITICAL, data=data)

    def is_problem(self) -> bool:
        return self.level in (SignalLevel.DEGRADED, SignalLevel.CRITICAL)


# =============================================================================
# TRIGGERS - When checks should run
# =============================================================================

@dataclass
class Trigger:
    """A trigger definition."""
    type: str  # e.g., "file.on_create", "init.startup", "cron.daily"
    pattern: Optional[str] = None  # For file triggers


class FileTriggers:
    """File-based triggers."""
    def on_create(self, pattern: str) -> Trigger:
        return Trigger(type="file.on_create", pattern=pattern)

    def on_modify(self, pattern: str) -> Trigger:
        return Trigger(type="file.on_modify", pattern=pattern)

    def on_delete(self, pattern: str) -> Trigger:
        return Trigger(type="file.on_delete", pattern=pattern)

    def on_move(self, pattern: str) -> Trigger:
        return Trigger(type="file.on_move", pattern=pattern)


class InitTriggers:
    """Initialization triggers."""
    def startup(self) -> Trigger:
        return Trigger(type="init.startup")

    def after_scan(self) -> Trigger:
        return Trigger(type="init.after_scan")


class CronTriggers:
    """Scheduled triggers."""
    def daily(self) -> Trigger:
        return Trigger(type="cron.daily")

    def hourly(self) -> Trigger:
        return Trigger(type="cron.hourly")

    def weekly(self) -> Trigger:
        return Trigger(type="cron.weekly")

    def every(self, interval: str = "", **kwargs) -> Trigger:
        # Accept both every("5m") and every(minutes=5)
        if kwargs:
            parts = [f"{k}={v}" for k, v in kwargs.items()]
            interval = ",".join(parts)
        return Trigger(type="cron.every", pattern=interval)


class CITriggers:
    """CI/CD triggers."""
    def on_push(self) -> Trigger:
        return Trigger(type="ci.on_push")

    def on_pr(self) -> Trigger:
        return Trigger(type="ci.on_pr")

    def pull_request(self) -> Trigger:
        return Trigger(type="ci.pull_request")


class HookTriggers:
    """Git hook triggers."""
    def pre_commit(self) -> Trigger:
        return Trigger(type="hook.pre_commit")

    def post_commit(self) -> Trigger:
        return Trigger(type="hook.post_commit")


class StreamTriggers:
    """Streaming/event triggers."""
    def on_event(self, event_type: str) -> Trigger:
        return Trigger(type="stream.on_event", pattern=event_type)

    def on_error(self, pattern: str = "") -> Trigger:
        return Trigger(type="stream.on_error", pattern=pattern)


class EventTriggers:
    """Generic event triggers."""
    def on(self, event_type: str) -> Trigger:
        return Trigger(type="event.on", pattern=event_type)

    def after_ingest(self) -> Trigger:
        return Trigger(type="event.after_ingest")


class GitTriggers:
    """Git operation triggers."""
    def on_commit(self) -> Trigger:
        return Trigger(type="git.on_commit")

    def post_commit(self) -> Trigger:
        return Trigger(type="git.post_commit")

    def on_push(self) -> Trigger:
        return Trigger(type="git.on_push")

    def on_pull(self) -> Trigger:
        return Trigger(type="git.on_pull")


class Triggers:
    """Container for all trigger types."""
    file = FileTriggers()
    init = InitTriggers()
    cron = CronTriggers()
    ci = CITriggers()
    hook = HookTriggers()
    stream = StreamTriggers()
    event = EventTriggers()
    git = GitTriggers()


# Global triggers instance
triggers = Triggers()


# =============================================================================
# CHECK DECORATOR
# =============================================================================

@dataclass
class CheckDefinition:
    """Metadata for a health check."""
    id: str
    fn: Callable
    triggers: List[Trigger]
    on_problem: str
    task: str
    capability: str = ""


def check(
    id: str,
    triggers: List[Trigger],
    on_problem: str,
    task: str,
):
    """
    Decorator to define a health check.

    Usage:
        @check(
            id="test_coverage",
            triggers=[triggers.file.on_create("src/**/*.py")],
            on_problem="MISSING_TESTS",
            task="TASK_add_tests",
        )
        def test_coverage(ctx) -> Signal:
            ...
    """
    def decorator(fn: Callable) -> CheckDefinition:
        return CheckDefinition(
            id=id,
            fn=fn,
            triggers=triggers,
            on_problem=on_problem,
            task=task,
        )
    return decorator


# =============================================================================
# CHECK CONTEXT
# =============================================================================

@dataclass
class CheckContext:
    """Context passed to health checks."""
    module_id: Optional[str] = None
    project_root: Optional[str] = None
    file_path: Optional[str] = None
    trigger_type: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)
    # File trigger context
    modified_files: List[str] = field(default_factory=list)
    created_files: List[str] = field(default_factory=list)
    deleted_files: List[str] = field(default_factory=list)
    # Additional context
    modules: List[str] = field(default_factory=list)
    capabilities: List[str] = field(default_factory=list)


# =============================================================================
# TRIGGER REGISTRY
# =============================================================================

class TriggerRegistry:
    """Registry of health checks by trigger type."""

    def __init__(self):
        self._checks: Dict[str, List[CheckDefinition]] = {}
        self._all_checks: List[CheckDefinition] = []

    def register_check(self, check_def: CheckDefinition, capability: str):
        """Register a check definition."""
        check_def.capability = capability
        self._all_checks.append(check_def)

        for trigger in check_def.triggers:
            if trigger.type not in self._checks:
                self._checks[trigger.type] = []
            self._checks[trigger.type].append(check_def)

    def get_checks_for_trigger(self, trigger_type: str) -> List[CheckDefinition]:
        """Get all checks that should run for a trigger type."""
        return self._checks.get(trigger_type, [])

    def get_all_checks(self) -> List[CheckDefinition]:
        """Get all registered checks."""
        return self._all_checks

    def get_stats(self) -> Dict[str, int]:
        """Get registry statistics."""
        return {
            "total_checks": len(self._all_checks),
            "triggers": {k: len(v) for k, v in self._checks.items()},
        }


# =============================================================================
# CAPABILITY DISCOVERY
# =============================================================================

def discover_capabilities(caps_dir: Path) -> List[tuple]:
    """
    Discover capabilities and their checks.

    Returns list of (capability_name, capability_path, [CheckDefinition])
    """
    capabilities = []

    if not caps_dir.exists():
        return capabilities

    for cap_path in caps_dir.iterdir():
        if not cap_path.is_dir():
            continue
        if cap_path.name.startswith("."):
            continue

        checks_file = cap_path / "runtime" / "checks.py"
        if not checks_file.exists():
            continue

        cap_name = cap_path.name
        check_defs = load_checks(checks_file, cap_name)
        capabilities.append((cap_name, cap_path, check_defs))

    return capabilities


def load_checks(checks_file: Path, capability_name: str) -> List[CheckDefinition]:
    """Load check definitions from a checks.py file."""
    try:
        spec = importlib.util.spec_from_file_location(
            f"capability_{capability_name}_checks",
            checks_file,
        )
        if not spec or not spec.loader:
            return []

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        # Find all CheckDefinition objects in the module
        checks = []
        for name in dir(module):
            obj = getattr(module, name)
            if isinstance(obj, CheckDefinition):
                obj.capability = capability_name
                checks.append(obj)

        return checks

    except Exception as e:
        log.warning(f"Failed to load checks from {checks_file}: {e}")
        return []


# =============================================================================
# CHECK EXECUTION
# =============================================================================

def dispatch_trigger(
    trigger_type: str,
    payload: Dict[str, Any],
    registry: TriggerRegistry,
) -> List[tuple]:
    """
    Dispatch a trigger to all matching checks.

    Returns list of (check_def, signal) tuples.
    """
    results = []
    checks = registry.get_checks_for_trigger(trigger_type)

    for check_def in checks:
        ctx = CheckContext(
            module_id=payload.get("module_id"),
            project_root=payload.get("project_root", str(Path.cwd())),
            file_path=payload.get("file_path"),
            trigger_type=trigger_type,
            payload=payload,
            modified_files=payload.get("modified_files", []),
            created_files=payload.get("created_files", []),
            deleted_files=payload.get("deleted_files", []),
            modules=payload.get("modules", []),
            capabilities=payload.get("capabilities", []),
        )

        try:
            signal = check_def.fn(ctx)
            results.append((check_def, signal))
        except Exception as e:
            log.error(f"Check {check_def.id} failed: {e}")
            results.append((check_def, Signal.critical(error=str(e))))

    return results


def run_checks(
    trigger_type: str,
    payload: Dict[str, Any],
    registry: TriggerRegistry,
    target_dir: Path,
    graph: Any = None,
    create_tasks: bool = True,
) -> Dict[str, Any]:
    """
    Run checks for a trigger and optionally create task_runs.

    Returns summary of execution.
    """
    payload["project_root"] = str(target_dir)
    results = dispatch_trigger(trigger_type, payload, registry)

    summary = {
        "trigger": trigger_type,
        "checks_run": len(results),
        "signals": {"healthy": 0, "degraded": 0, "critical": 0},
        "tasks_created": 0,
    }

    tasks_to_create = []

    for check_def, signal in results:
        summary["signals"][signal.level.value] += 1

        if signal.is_problem() and create_tasks:
            tasks_to_create.append((check_def, signal))

    if graph and tasks_to_create:
        created = create_task_runs(tasks_to_create, graph, target_dir)
        summary["tasks_created"] = created

    return summary


# =============================================================================
# TASK CREATION
# =============================================================================

def create_task_runs(
    problems: List[tuple],
    graph: Any,
    target_dir: Path,
) -> int:
    """
    Create task_run nodes for problems detected using the inject system.

    Returns number of tasks created.
    """
    from runtime.inject import inject, set_actor

    created = 0
    timestamp = int(time.time())

    # Set actor to capability system
    set_actor("ACTOR_Capability")

    for check_def, signal in problems:
        # Generate unique task ID
        task_hash = hashlib.md5(
            f"{check_def.id}:{signal.data.get('module_id', '')}:{timestamp}".encode()
        ).hexdigest()[:8]

        task_id = f"narrative:task_run:{task_hash}"

        # Build task content
        content = f"""# Problem: {check_def.on_problem}

**Signal:** {signal.level.value}
**Capability:** {check_def.capability}
**Check:** {check_def.id}
**Data:** {signal.data}
"""

        synthesis = f"task_run: fix {check_def.on_problem} ({signal.level.value})"

        try:
            # Get underlying adapter from graph
            adapter = graph._graph._adapter if hasattr(graph, '_graph') else graph

            # Inject task_run node
            inject(adapter, {
                "id": task_id,
                "label": "Narrative",
                "type": "task_run",
                "status": "pending",
                "synthesis": synthesis,
                "content": content,
                "on_problem": check_def.on_problem,
                "signal": signal.level.value,
                "capability": check_def.capability,
            }, with_context=False)  # Skip context (no moment needed for task creation)

            # Link to task template if it exists
            if check_def.task:
                template_id = f"narrative:task:{check_def.task}"
                inject(adapter, {
                    "from": task_id,
                    "to": template_id,
                    "nature": "serves",
                })

            # Link to target module if specified
            module_id = signal.data.get("module_id")
            if module_id:
                # Nature based on signal level
                nature = "urgently concerns" if signal.level == SignalLevel.CRITICAL else "concerns"
                inject(adapter, {
                    "from": task_id,
                    "to": module_id,
                    "nature": nature,
                })

            created += 1
            log.info(f"Created task_run: {task_id} for {check_def.on_problem}")

        except Exception as e:
            log.error(f"Failed to create task_run: {e}")

    return created


# =============================================================================
# TASK LIFECYCLE
# =============================================================================

def claim_task(task_id: str, agent_id: str, graph: Any) -> bool:
    """Agent claims a task."""
    try:
        graph.execute("""
            MATCH (t:Narrative {id: $task_id})
            MATCH (a:Actor {id: $agent_id})
            SET t.status = 'claimed'
            MERGE (t)-[:LINK {verb: 'claimed_by'}]->(a)
        """, {"task_id": task_id, "agent_id": agent_id})
        return True
    except Exception as e:
        log.error(f"Failed to claim task: {e}")
        return False


def complete_task(task_id: str, graph: Any, result: Optional[Dict] = None) -> bool:
    """Mark task as completed."""
    try:
        graph.execute("""
            MATCH (t:Narrative {id: $task_id})
            SET t.status = 'completed',
                t.completed_at_s = $ts
        """, {"task_id": task_id, "ts": int(time.time())})
        return True
    except Exception as e:
        log.error(f"Failed to complete task: {e}")
        return False


def fail_task(task_id: str, graph: Any, error: str = "") -> bool:
    """Mark task as failed."""
    try:
        graph.execute("""
            MATCH (t:Narrative {id: $task_id})
            SET t.status = 'failed',
                t.error = $error,
                t.failed_at_s = $ts
        """, {"task_id": task_id, "error": error, "ts": int(time.time())})
        return True
    except Exception as e:
        log.error(f"Failed to fail task: {e}")
        return False


def release_task(task_id: str, graph: Any) -> bool:
    """Release a claimed task back to pending."""
    try:
        graph.execute("""
            MATCH (t:Narrative {id: $task_id})
            SET t.status = 'pending'
        """, {"task_id": task_id})
        graph.execute("""
            MATCH (t:Narrative {id: $task_id})-[r:LINK {verb: 'claimed_by'}]->()
            DELETE r
        """, {"task_id": task_id})
        return True
    except Exception as e:
        log.error(f"Failed to release task: {e}")
        return False


# =============================================================================
# AGENT STATE
# =============================================================================

def update_actor_heartbeat(actor_id: str, graph: Any) -> bool:
    """Update actor's last heartbeat."""
    try:
        graph.execute("""
            MATCH (a:Actor {id: $id})
            SET a.last_heartbeat_s = $ts
        """, {"id": actor_id, "ts": int(time.time())})
        return True
    except Exception:
        return False


def set_actor_working(actor_id: str, graph: Any) -> bool:
    """Set actor status to working."""
    try:
        graph.execute("""
            MATCH (a:Actor {id: $id})
            SET a.status = 'working'
        """, {"id": actor_id})
        return True
    except Exception:
        return False


def set_actor_idle(actor_id: str, graph: Any) -> bool:
    """Set actor status to idle."""
    try:
        graph.execute("""
            MATCH (a:Actor {id: $id})
            SET a.status = 'idle'
        """, {"id": actor_id})
        return True
    except Exception:
        return False


# =============================================================================
# THROTTLING
# =============================================================================

class Throttler:
    """Prevents task spam by throttling creation."""

    def __init__(self):
        self._created: Dict[str, float] = {}  # key -> timestamp
        self.cooldown_s = 86400  # 24 hours
        self.max_per_module = 1

    def should_create(self, problem: str, module_id: str) -> bool:
        """Check if task should be created."""
        key = f"{problem}:{module_id}"
        last = self._created.get(key, 0)
        now = time.time()

        if now - last < self.cooldown_s:
            return False

        self._created[key] = now
        return True

    def reset(self):
        """Reset throttler state."""
        self._created.clear()


_throttler = Throttler()


def get_throttler() -> Throttler:
    return _throttler


def reset_throttler():
    _throttler.reset()


# =============================================================================
# AGENT REGISTRY
# =============================================================================

class AgentMode(Enum):
    IDLE = "idle"
    WORKING = "working"
    PAUSED = "paused"


class AgentRegistry:
    """Tracks agent state."""

    def __init__(self):
        self._agents: Dict[str, AgentMode] = {}

    def set_mode(self, agent_id: str, mode: AgentMode):
        self._agents[agent_id] = mode

    def get_mode(self, agent_id: str) -> AgentMode:
        return self._agents.get(agent_id, AgentMode.IDLE)

    def reset(self):
        self._agents.clear()


_registry = AgentRegistry()


def get_registry() -> AgentRegistry:
    return _registry


def reset_agents():
    _registry.reset()


# =============================================================================
# CONTROLLER
# =============================================================================

class Controller:
    """Controls capability system execution."""

    def __init__(self):
        self.enabled = True
        self.paused = False

    def pause(self):
        self.paused = True

    def resume(self):
        self.paused = False


_controller = Controller()


def get_controller() -> Controller:
    return _controller
