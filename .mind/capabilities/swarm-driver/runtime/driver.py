"""
Swarm Driver — Log-driven task generation.

Reads .mind/swarm/logs/ every 2 minutes (only if new content).
Creates at most ONE task per cycle (singleton pattern).
Reactivates if issue recurs after task completion.

Run: python -m capabilities.swarm-driver.runtime.driver
"""

import json
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger(__name__)


@dataclass
class Signal:
    type: str
    target: str
    priority: int
    nature: str = "concerns"  # verb + modifiers from nature.yaml
    context: list[str] = field(default_factory=list)


@dataclass
class DriverState:
    positions: dict[str, int] = field(default_factory=dict)
    last_task_id: Optional[str] = None
    last_task_hash: Optional[str] = None
    last_run: Optional[str] = None


class SwarmDriver:
    """
    Singleton driver that reads swarm logs and creates tasks.
    """

    def __init__(self, target_dir: Path = None):
        self.target_dir = target_dir or Path(".")
        self.logs_dir = self.target_dir / ".mind" / "swarm" / "logs"
        self.state_file = self.target_dir / ".mind" / "swarm" / "driver_state.json"
        self.sync_file = self.target_dir / ".mind" / "state" / "SYNC_Project_State.md"

        # Ensure directories exist
        self.logs_dir.mkdir(parents=True, exist_ok=True)

        # Graph connection (lazy)
        self._graph = None

    @property
    def graph(self):
        if self._graph is None:
            from runtime.infrastructure.database import get_database_adapter
            self._graph = get_database_adapter()
        return self._graph

    def load_state(self) -> DriverState:
        """Load driver state from JSON file."""
        if self.state_file.exists():
            data = json.loads(self.state_file.read_text())
            return DriverState(**data)
        return DriverState()

    def save_state(self, state: DriverState):
        """Save driver state to JSON file."""
        state.last_run = datetime.now().isoformat()
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps({
            "positions": state.positions,
            "last_task_id": state.last_task_id,
            "last_task_hash": state.last_task_hash,
            "last_run": state.last_run,
        }, indent=2))

    def collect_new_lines(self, positions: dict) -> dict[str, list[str]]:
        """Read only new lines from each log file."""
        new_lines = {}

        if not self.logs_dir.exists():
            return new_lines

        for log_file in self.logs_dir.glob("*.log"):
            name = log_file.name
            pos = positions.get(name, 0)

            try:
                size = log_file.stat().st_size
                if size <= pos:
                    continue  # No new content

                with open(log_file) as f:
                    f.seek(pos)
                    lines = f.readlines()
                    if lines:
                        new_lines[name] = lines
                        positions[name] = f.tell()
            except Exception as e:
                log.warning(f"Error reading {log_file}: {e}")

        return new_lines

    def analyze_logs(self, new_lines: dict) -> list[Signal]:
        """Detect patterns in new log lines."""
        signals = []

        for source, lines in new_lines.items():
            text = "".join(lines)
            text_lower = text.lower()

            # Error detection (highest priority)
            # Nature: "critically concerns" or "urgently concerns"
            if "error" in text_lower or "failed" in text_lower or "exception" in text_lower:
                error_lines = [l for l in lines if "error" in l.lower() or "failed" in l.lower()]
                is_critical = "critical" in text_lower or "fatal" in text_lower
                signals.append(Signal(
                    type="ERROR_DETECTED",
                    target=self._extract_target(text, source),
                    priority=10 if is_critical else 8,
                    nature="critically concerns" if is_critical else "urgently concerns",
                    context=error_lines[-3:] if error_lines else lines[-3:],
                ))

            # Stuck/retry detection
            # Nature: "frustratingly blocks" (agent is blocked)
            if "retry" in text_lower or "timeout" in text_lower or "stuck" in text_lower:
                signals.append(Signal(
                    type="AGENT_STUCK",
                    target=source.replace(".log", ""),
                    priority=8,
                    nature="frustratingly blocks",
                    context=lines[-5:],
                ))

            # Completion → SYNC update needed
            # Nature: "importantly concerns" (keep state fresh)
            if "completed" in text_lower or "✓" in text or "done" in text_lower:
                completions = [l for l in lines if "completed" in l.lower() or "✓" in l]
                if completions:
                    signals.append(Signal(
                        type="SYNC_UPDATE_NEEDED",
                        target="SYNC_Project_State",
                        priority=5,
                        nature="importantly concerns",
                        context=completions[-3:],
                    ))

            # No tasks available (from tasks.log)
            # Nature: "urgently concerns" (agents idle = wasted capacity)
            if source == "tasks.log":
                if "no pending tasks" in text_lower or "queue empty" in text_lower:
                    signals.append(Signal(
                        type="NO_TASKS_AVAILABLE",
                        target="task_scan",
                        priority=7,
                        nature="urgently concerns",
                        context=["Swarm needs more work"],
                    ))

        return sorted(signals, key=lambda s: -s.priority)

    def _extract_target(self, text: str, source: str) -> str:
        """Extract target from log content."""
        # Look for file paths
        import re
        paths = re.findall(r'[\w/]+\.\w+', text)
        if paths:
            return paths[0]

        # Look for task IDs
        tasks = re.findall(r'TASK_\w+', text)
        if tasks:
            return tasks[0]

        return source.replace(".log", "")

    def is_task_active(self, task_id: str) -> bool:
        """Check if task is still pending/claimed."""
        if not task_id:
            return False

        try:
            result = self.graph.query(
                "MATCH (t {id: $id}) RETURN t.status",
                {"id": task_id}
            )
            if result and result[0]:
                status = result[0][0]
                return status in ("pending", "claimed", "running")
        except Exception as e:
            log.warning(f"Error checking task status: {e}")

        return False

    def create_task(self, signal: Signal) -> str:
        """Create exactly ONE task_run from signal."""
        # Generate unique ID
        signal_hash = hashlib.sha256(
            f"{signal.type}:{signal.target}".encode()
        ).hexdigest()[:8]
        task_id = f"TASK_RUN_driver_{signal.type}_{signal_hash}"

        # Map signal to template and agent
        SIGNAL_MAP = {
            "ERROR_DETECTED": ("TASK_investigate_error", "AGENT_Fixer"),
            "AGENT_STUCK": ("TASK_unblock", "AGENT_Weaver"),
            "SYNC_UPDATE_NEEDED": ("TASK_update_sync", "AGENT_Witness"),
            "NO_TASKS_AVAILABLE": ("TASK_scan_for_work", "AGENT_Scout"),
        }

        template, agent = SIGNAL_MAP.get(signal.type, ("TASK_investigate", "AGENT_Fixer"))

        # Create task in graph with nature field
        synthesis = f"[driver] {signal.nature}: {signal.target} ({signal.type})"
        context_text = "\n".join(signal.context) if signal.context else ""

        try:
            self.graph.query("""
                CREATE (t:Narrative {
                    id: $id,
                    node_type: 'narrative',
                    type: 'task_run',
                    status: 'pending',
                    source: 'swarm-driver',
                    nature: $nature,
                    problem: $problem,
                    target: $target,
                    synthesis: $synthesis,
                    content: $context,
                    priority: $priority,
                    created_at: datetime()
                })
            """, {
                "id": task_id,
                "nature": signal.nature,
                "problem": signal.type,
                "target": signal.target,
                "synthesis": synthesis,
                "context": context_text,
                "priority": signal.priority,
            })

            # Link to template (serves)
            self.graph.query("""
                MATCH (t:Narrative {id: $task_id})
                OPTIONAL MATCH (template:Narrative {name: $template})
                FOREACH (_ IN CASE WHEN template IS NOT NULL THEN [1] ELSE [] END |
                    MERGE (t)-[:LINK {nature: 'serves'}]->(template)
                )
            """, {"task_id": task_id, "template": template})

            # Link to target with signal's nature
            self.graph.query("""
                MATCH (t:Narrative {id: $task_id})
                OPTIONAL MATCH (target {id: $target})
                FOREACH (_ IN CASE WHEN target IS NOT NULL THEN [1] ELSE [] END |
                    MERGE (t)-[:LINK {nature: $nature}]->(target)
                )
            """, {"task_id": task_id, "target": signal.target, "nature": signal.nature})

            # Assign to agent (claims)
            self.graph.query("""
                MATCH (t:Narrative {id: $task_id})
                MATCH (a:Actor {id: $agent})
                MERGE (a)-[:LINK {nature: 'claims'}]->(t)
                SET t.status = 'claimed'
            """, {"task_id": task_id, "agent": agent})

            log.info(f"Created task: {task_id} → {agent}")

        except Exception as e:
            log.error(f"Failed to create task: {e}")
            return None

        return task_id

    def update_sync(self, task_id: str, signal: Signal):
        """Append driver action to SYNC file."""
        if not self.sync_file.exists():
            return

        entry = f"""
---

## Driver: {datetime.now().strftime('%Y-%m-%d %H:%M')}

| Field | Value |
|-------|-------|
| Signal | {signal.type} |
| Target | {signal.target} |
| Task | {task_id} |
| Priority | {signal.priority} |
"""

        with open(self.sync_file, "a") as f:
            f.write(entry)

    def run_cycle(self) -> Optional[str]:
        """
        Run one driver cycle.
        Returns task_id if created, None otherwise.
        """
        state = self.load_state()

        # 1. Check for new content
        new_lines = self.collect_new_lines(state.positions)
        if not new_lines:
            self.save_state(state)  # Update timestamp
            return None

        log.info(f"Processing {sum(len(l) for l in new_lines.values())} new lines from {len(new_lines)} files")

        # 2. Analyze logs
        signals = self.analyze_logs(new_lines)
        if not signals:
            self.save_state(state)
            return None

        log.info(f"Detected {len(signals)} signals, highest: {signals[0].type}")

        # 3. Singleton: only one driver task active at a time
        if state.last_task_id and self.is_task_active(state.last_task_id):
            log.info(f"Previous task {state.last_task_id} still active, waiting")
            self.save_state(state)
            return None

        # 4. Pick highest priority signal
        best = signals[0]

        # 5. Create ONE task
        task_id = self.create_task(best)
        if not task_id:
            self.save_state(state)
            return None

        # 6. Update SYNC
        self.update_sync(task_id, best)

        # 7. Save state
        state.last_task_id = task_id
        state.last_task_hash = hashlib.sha256(
            f"{best.type}:{best.target}".encode()
        ).hexdigest()
        self.save_state(state)

        return task_id

    def run_forever(self, interval_seconds: int = 120):
        """Run infinite loop, checking every interval."""
        import time

        log.info(f"Starting swarm driver (interval: {interval_seconds}s)")

        while True:
            try:
                task_id = self.run_cycle()
                if task_id:
                    log.info(f"Created: {task_id}")
                else:
                    log.debug("No action needed")

            except KeyboardInterrupt:
                log.info("Driver stopped")
                break
            except Exception as e:
                log.error(f"Cycle failed: {e}")

            time.sleep(interval_seconds)


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Swarm driver daemon")
    parser.add_argument("--interval", type=int, default=120, help="Check interval (seconds)")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [driver] %(message)s",
        datefmt="%H:%M:%S",
    )

    driver = SwarmDriver()

    if args.once:
        task_id = driver.run_cycle()
        if task_id:
            print(f"Created: {task_id}")
        else:
            print("No action needed")
    else:
        driver.run_forever(interval_seconds=args.interval)


if __name__ == "__main__":
    main()
