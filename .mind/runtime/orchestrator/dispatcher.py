"""Main dispatch loop — budget-driven tick engine.

Watches the message queue, dispatches requests to Claude Code subprocesses
via the thread pool, routes responses back to bridge callbacks.

Tick interval is controlled by ComputeBudget, not a fixed sleep.
Higher trust citizens get proportionally more ticks.
"""

import os
import time
import uuid
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, Future
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable

from runtime.orchestrator.account_balancer import init as init_accounts, status_line as accounts_status
from runtime.orchestrator.claude_invoker import invoke_claude, invoke_degraded
from runtime.orchestrator.compute_budget import ComputeBudget
from runtime.orchestrator.message_queue import pop_queue_item, enqueue, queue_size
from runtime.orchestrator.session_tracker import (
    write_neuron_profile,
    update_neuron_status,
    get_active_neurons,
    cleanup_old_neurons,
    relaunch_stale_neurons,
    enforce_neuron_cap,
)
from runtime.orchestrator import degradation

# L1 Cognitive Engine integration
try:
    from runtime.cognition.models import CitizenCognitiveState
    from runtime.cognition.tick_runner_l1_cognitive_engine import L1CognitiveTickRunner, Stimulus
    from runtime.cognition.stimulus_router import StimulusRouter, IncomingEvent
    from runtime.cognition.wm_prompt_serializer import serialize_wm_to_prompt
    from runtime.cognition.feedback_injector import inject_post_action_feedback
    L1_AVAILABLE = True
except ImportError:
    L1_AVAILABLE = False

logger = logging.getLogger("orchestrator.dispatcher")

# ── Constants ───────────────────────────────────────────────────────────────

NEURON_CLEANUP_INTERVAL = 60  # seconds between neuron cleanups
NEURON_RELAUNCH_INTERVAL = 30  # seconds between relaunch checks
HEALTH_CHECK_INTERVAL = 10  # seconds between degradation checks
PHYSICS_TICK_INTERVAL = 60  # seconds — adaptive per citizen arousal state (see ALGORITHM_L1_Wiring)

# Suppress infrastructure errors from reaching users
SUPPRESS_PATTERNS = [
    "credits balance is too low",
    "rate limit",
    "overloaded_error",
    "529 overloaded",
    "could not connect to the api",
]


def generate_session_id() -> str:
    """Generate a short, human-readable session ID."""
    return uuid.uuid4().hex[:12]


class Dispatcher:
    """Budget-driven orchestrator dispatch loop."""

    def __init__(
        self,
        budget: Optional[ComputeBudget] = None,
        response_callback: Optional[Callable] = None,
        notify_callback: Optional[Callable] = None,
    ):
        """
        Args:
            budget: ComputeBudget instance (defaults to subscription mode)
            response_callback: fn(request, response, voice_response) called when a session completes
            notify_callback: fn(message) for sending notifications (e.g., Telegram)
        """
        self.budget = budget or ComputeBudget(
            mode="subscription",
            monthly_budget_usd=300,
        )
        self.response_callback = response_callback
        self.notify_callback = notify_callback

        max_parallel = int(os.environ.get("MAX_PARALLEL", "15"))
        self.executor = ThreadPoolExecutor(max_workers=max_parallel)
        self.active_futures: dict[Future, tuple[str, dict]] = {}  # future → (session_id, request)

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_cleanup = 0.0
        self._last_relaunch = 0.0
        self._last_health_check = 0.0
        self._last_physics_tick = 0.0
        self._last_first_boot_check = 0.0

        # L1 Cognitive Engine per-citizen instances
        self._citizen_engines: dict[str, L1CognitiveTickRunner] = {} if L1_AVAILABLE else {}
        self._citizen_states: dict[str, CitizenCognitiveState] = {} if L1_AVAILABLE else {}
        self._citizen_routers: dict[str, StimulusRouter] = {} if L1_AVAILABLE else {}

    def start(self):
        """Start the dispatch loop in a background thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="orchestrator")
        self._thread.start()
        logger.info("Orchestrator dispatcher started")

    def stop(self):
        """Stop the dispatch loop."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=10)
        self.executor.shutdown(wait=False)
        logger.info("Orchestrator dispatcher stopped")

    def _run_loop(self):
        """Main loop — runs in background thread."""
        # Initialize accounts
        accounts = init_accounts()
        logger.info(f"Accounts: {len(accounts)} ({accounts_status()})")

        orchestrator_id = generate_session_id()
        write_neuron_profile(
            session_id=orchestrator_id,
            name="orchestrator",
            purpose="Central dispatcher — routes requests via priority queue",
            status="active",
        )

        logger.info(f"Orchestrator ID: {orchestrator_id}, tick mode: {self.budget.mode}")

        while self._running:
            try:
                self._tick()
            except Exception as e:
                logger.exception(f"Tick error: {e}")

            # Sleep for budget-driven interval
            interval = self.budget.get_tick_interval_seconds()
            # But check for completed futures more frequently
            _slept = 0.0
            while _slept < interval and self._running:
                self._collect_completed_futures()
                time.sleep(min(1.0, interval - _slept))
                _slept += 1.0

    def _tick(self):
        """Single dispatch tick."""
        now = time.time()

        # Periodic maintenance
        if now - self._last_cleanup > NEURON_CLEANUP_INTERVAL:
            cleanup_old_neurons()
            enforce_neuron_cap()
            self._last_cleanup = now

        if now - self._last_relaunch > NEURON_RELAUNCH_INTERVAL:
            active_ids = {sid for _, (sid, _) in self.active_futures.items() if not _.done() for _ in [_]}
            # Simplified: just get session_ids from active futures
            active_session_ids = set()
            for f, (sid, _req) in self.active_futures.items():
                if not f.done():
                    active_session_ids.add(sid)
            relaunch_stale_neurons(active_session_ids, enqueue_fn=enqueue)
            self._last_relaunch = now

        if now - self._last_health_check > HEALTH_CHECK_INTERVAL:
            degradation.check_deadlock(notify_fn=self.notify_callback)
            self._last_health_check = now

        # First-boot registration for newly spawned citizens (every 30s)
        if now - self._last_first_boot_check > 30.0:
            try:
                from runtime.orchestrator.first_boot_registrar import check_and_register_new_citizens
                graph_ops = getattr(self, '_graph_ops', None)
                registered = check_and_register_new_citizens(graph_ops)
                if registered:
                    logger.info(f"First-boot registered: {registered}")
            except Exception as e:
                logger.debug(f"First-boot check: {e}")
            self._last_first_boot_check = now

        # L1 physics ticks (background processing for all citizens)
        if now - self._last_physics_tick > PHYSICS_TICK_INTERVAL:
            self._run_physics_ticks()
            self._last_physics_tick = now

        # Collect completed futures
        self._collect_completed_futures()

        # Check capacity
        max_parallel = degradation.get_effective_max_parallel()
        active_count = sum(1 for f in self.active_futures if not f.done())
        if active_count >= max_parallel:
            return  # At capacity

        # Check backoff
        if degradation.is_in_backoff():
            return

        # Pop next item from queue
        item = pop_queue_item()
        if not item:
            return  # Queue empty

        # Budget check for citizen sessions
        citizen_handle = (item.get("metadata") or {}).get("citizen_handle", "_system")
        trust_score = (item.get("metadata") or {}).get("trust_score", 50.0)
        if not self.budget.should_tick(citizen_handle, trust_score):
            # Put it back — this citizen is over their share
            enqueue(item)
            return

        # Dispatch
        session_id = generate_session_id()
        mode = item.get("mode", "partner")
        source = item.get("source", "unknown")
        voice_text = item.get("voice_text", "")[:80]

        write_neuron_profile(
            session_id=session_id,
            name=f"{mode}_{source}",
            purpose=voice_text or f"{mode} request from {source}",
            status="spawning",
            metadata={
                "source": source,
                "citizen_handle": citizen_handle,
                "sender_id": item.get("sender_id", ""),
            },
        )

        # Inject L1 cognitive context into citizen requests
        if L1_AVAILABLE and citizen_handle and citizen_handle != "_system":
            wm_context = self.get_citizen_wm_context(citizen_handle)
            if wm_context:
                if "metadata" not in item:
                    item["metadata"] = {}
                item["metadata"]["cognitive_context"] = wm_context

        # Choose invocation path
        if degradation.is_degraded():
            invoke_fn = invoke_degraded
        else:
            invoke_fn = invoke_claude

        future = self.executor.submit(invoke_fn, item, session_id)
        self.active_futures[future] = (session_id, item)

        update_neuron_status(session_id, "busy")
        logger.debug(f"Dispatched {session_id} ({mode}/{source}): {voice_text}")

        # Record tick
        self.budget.record_tick(citizen_handle)

    def _collect_completed_futures(self):
        """Process results from completed futures."""
        done_futures = [f for f in self.active_futures if f.done()]
        for future in done_futures:
            session_id, request = self.active_futures.pop(future)
            try:
                result = future.result()
                if isinstance(result, tuple):
                    response, voice_response = result
                else:
                    response, voice_response = result, None

                # Suppress infrastructure errors
                if response and any(p.lower() in response.lower() for p in SUPPRESS_PATTERNS):
                    logger.warning(f"Suppressed infra error in {session_id}: {response[:80]}")
                    response = None

                # Route response
                if response and self.response_callback:
                    try:
                        self.response_callback(request, response, voice_response)
                    except Exception as e:
                        logger.exception(f"Response callback error for {session_id}: {e}")

                # L1 feedback injection: citizen "hears" its own response
                citizen_handle = (request.get("metadata") or {}).get("citizen_handle", "")
                if L1_AVAILABLE and citizen_handle and response:
                    router = self._citizen_routers.get(citizen_handle)
                    state = self._citizen_states.get(citizen_handle)
                    if router and state:
                        try:
                            inject_post_action_feedback(
                                state, router, response,
                                success=True,
                            )
                        except Exception as e:
                            logger.debug(f"Feedback injection error for {citizen_handle}: {e}")

                update_neuron_status(session_id, "idle",
                                     sender_id=str(request.get("sender_id", "")))

            except Exception as e:
                logger.exception(f"Future {session_id} raised: {e}")
                update_neuron_status(session_id, "error")

    # ── L1 Cognitive Engine Integration ────────────────────────────────────

    def _ensure_citizen_engine(self, citizen_handle: str) -> Optional[L1CognitiveTickRunner]:
        """Get or create an L1 engine instance for a citizen."""
        if not L1_AVAILABLE:
            return None

        if citizen_handle not in self._citizen_engines:
            state = CitizenCognitiveState(citizen_id=citizen_handle)
            runner = L1CognitiveTickRunner(state)
            router = StimulusRouter(citizen_handle)

            self._citizen_states[citizen_handle] = state
            self._citizen_engines[citizen_handle] = runner
            self._citizen_routers[citizen_handle] = router

            logger.info(f"L1 engine initialized for {citizen_handle}")

        return self._citizen_engines[citizen_handle]

    def inject_stimulus(self, citizen_handle: str, content: str,
                        source: str = "external", is_social: bool = False,
                        is_failure: bool = False, is_progress: bool = False):
        """Inject a stimulus into a citizen's L1 engine.

        Called by bridges when messages arrive for a citizen.
        """
        if not L1_AVAILABLE:
            return

        self._ensure_citizen_engine(citizen_handle)
        router = self._citizen_routers.get(citizen_handle)
        if not router:
            return

        event = IncomingEvent(
            content=content,
            source=source,
            citizen_handle=citizen_handle,
            is_social=is_social,
            is_failure=is_failure,
            is_progress=is_progress,
        )

        stimulus = router.route(event)
        if stimulus:
            runner = self._citizen_engines[citizen_handle]

            # Debug trace: stimulus injection
            from runtime.debug.tracer import trace_step, is_debugging
            if is_debugging(citizen_handle):
                trace_step(citizen_handle, "stimulus_router.route",
                           f"event: {event.content[:200]}", f"stimulus energy={stimulus.energy_budget:.2f}")

            result = runner.run_tick(stimulus=stimulus)

            if is_debugging(citizen_handle):
                trace_step(citizen_handle, "tick_runner.run_tick",
                           f"stimulus energy={stimulus.energy_budget:.2f}",
                           f"wm={result.wm_state}, orientation={result.orientation}")

            logger.debug(f"Stimulus injected + tick for {citizen_handle}")

    def get_citizen_wm_context(self, citizen_handle: str) -> str:
        """Get WM prompt context for a citizen's next LLM session.

        Returns markdown string to inject into the system prompt.
        """
        if not L1_AVAILABLE:
            return ""

        runner = self._ensure_citizen_engine(citizen_handle)
        if not runner:
            return ""

        state = self._citizen_states[citizen_handle]
        orientation = runner._current_orientation  # type: ignore[union-attr]
        wm_text = serialize_wm_to_prompt(state, orientation)

        from runtime.debug.tracer import trace_step, is_debugging
        if is_debugging(citizen_handle):
            trace_step(citizen_handle, "wm_prompt_serializer",
                       f"orientation={orientation}, nodes={len(state.nodes)}",
                       f"{len(wm_text)} chars")

        return wm_text

    def _run_physics_ticks(self):
        """Run background physics ticks for all active citizen engines.

        Called periodically from the main loop. Runs one tick per citizen
        with no stimulus (background processing: decay, boredom, etc.)
        """
        if not L1_AVAILABLE or not self._citizen_engines:
            return

        from runtime.debug.tracer import trace_step, is_debugging

        for handle, runner in self._citizen_engines.items():
            try:
                result = runner.run_tick()  # No stimulus — background tick
                if is_debugging(handle):
                    trace_step(handle, "tick_runner.background_tick",
                               "no stimulus",
                               f"wm={result.wm_state}, orientation={result.orientation}")
            except Exception as e:
                if is_debugging(handle):
                    import traceback
                    trace_step(handle, "tick_runner.background_tick",
                               "no stimulus", error=traceback.format_exc())
                logger.exception(f"Physics tick error for {handle}: {e}")

    # ── Public API ──────────────────────────────────────────────────────────

    def submit_request(self, request: dict):
        """Submit a request to the message queue for processing."""
        if "timestamp" not in request:
            request["timestamp"] = datetime.now().isoformat()
        enqueue(request)

    def get_status(self) -> dict:
        """Return orchestrator status for the /health endpoint."""
        active_count = sum(1 for f in self.active_futures if not f.done())
        return {
            "running": self._running,
            "active_sessions": active_count,
            "queue_size": queue_size(),
            "degradation": degradation.get_status(),
            "budget": self.budget.get_budget_status(),
            "accounts": accounts_status(),
        }
