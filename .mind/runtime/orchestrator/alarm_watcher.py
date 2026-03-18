"""Alarm watcher — scans citizen alarms and enqueues wake messages.

Background thread that periodically checks all citizens' alarms.jsonl files.
When an alarm triggers, it enqueues a wake message for the orchestrator.
Repeating alarms are rescheduled; one-shot alarms are deactivated.

No cron — citizens set their own alarms via the `alarm` MCP tool.
"""

import json
import time
import logging
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Callable

logger = logging.getLogger("orchestrator.alarms")

SCAN_INTERVAL = 30  # seconds between alarm scans


class AlarmWatcher:
    """Background thread that watches citizen alarm files."""

    def __init__(
        self,
        citizens_dir: Optional[Path] = None,
        enqueue_fn: Optional[Callable] = None,
    ):
        self.citizens_dir = citizens_dir or (
            Path(__file__).resolve().parent.parent.parent / "citizens"
        )
        self.enqueue_fn = enqueue_fn  # function to add items to orchestrator queue
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._fired_ids: set = set()  # Track recently fired alarm IDs to avoid double-firing

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="alarm-watcher")
        self._thread.start()
        logger.info("Alarm watcher started")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _run_loop(self):
        while self._running:
            try:
                self._scan_alarms()
            except Exception as e:
                logger.exception(f"Alarm scan error: {e}")
            time.sleep(SCAN_INTERVAL)

    def _scan_alarms(self):
        """Scan all citizens' alarm files for triggered alarms."""
        if not self.citizens_dir.exists():
            return

        now = datetime.now()

        for citizen_dir in self.citizens_dir.iterdir():
            if not citizen_dir.is_dir():
                continue
            alarms_file = citizen_dir / "alarms.jsonl"
            if not alarms_file.exists():
                continue

            handle = citizen_dir.name
            alarms = []
            modified = False

            for line in alarms_file.read_text().strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    alarm = json.loads(line)
                except json.JSONDecodeError:
                    alarms.append(line)
                    continue

                if not alarm.get("active", True):
                    alarms.append(json.dumps(alarm))
                    continue

                # Check if alarm should fire
                try:
                    trigger_at = datetime.fromisoformat(alarm["trigger_at"].replace("Z", "+00:00"))
                    # Remove timezone info for comparison if needed
                    if trigger_at.tzinfo:
                        trigger_at = trigger_at.replace(tzinfo=None)
                except (ValueError, KeyError):
                    alarms.append(json.dumps(alarm))
                    continue

                alarm_id = alarm.get("id", "unknown")

                if trigger_at <= now and alarm_id not in self._fired_ids:
                    # Fire the alarm
                    self._fire_alarm(handle, alarm)
                    self._fired_ids.add(alarm_id)
                    modified = True

                    # Handle repeat
                    repeat = alarm.get("repeat")
                    if repeat:
                        new_trigger = self._next_trigger(trigger_at, repeat)
                        alarm["trigger_at"] = new_trigger.isoformat()
                        alarms.append(json.dumps(alarm))
                    else:
                        alarm["active"] = False
                        alarm["fired_at"] = now.isoformat()
                        alarms.append(json.dumps(alarm))
                else:
                    alarms.append(json.dumps(alarm))

            # Write back if modified
            if modified:
                alarms_file.write_text("\n".join(alarms) + "\n")

        # Cleanup fired IDs older than 1 hour (prevent memory leak)
        if len(self._fired_ids) > 1000:
            self._fired_ids.clear()

    def _fire_alarm(self, handle: str, alarm: dict):
        """Enqueue a wake message for a citizen whose alarm has fired."""
        reason = alarm.get("reason", "Scheduled alarm")
        alarm_id = alarm.get("id", "unknown")

        logger.info(f"Alarm fired for @{handle}: {alarm_id} — {reason}")

        if self.enqueue_fn:
            self.enqueue_fn({
                "mode": "autonomous",
                "voice_text": f"[ALARM] {reason}",
                "source": "alarm",
                "sender": "alarm_watcher",
                "timestamp": datetime.now().isoformat(),
                "metadata": {
                    "citizen_handle": handle,
                    "alarm_id": alarm_id,
                    "alarm_reason": reason,
                },
            })

    def _next_trigger(self, current: datetime, repeat: str) -> datetime:
        """Calculate next trigger time for repeating alarms."""
        if repeat == "hourly":
            return current + timedelta(hours=1)
        elif repeat == "daily":
            return current + timedelta(days=1)
        elif repeat == "weekly":
            return current + timedelta(weeks=1)
        else:
            return current + timedelta(days=1)  # Default to daily
