"""
Feedback Injector — post-action self-stimulus and limbic updates.

Spec: docs/l1_wiring/ALGORITHM_L1_Wiring.md Section 4

After a citizen's LLM session completes, inject the result back into
the L1 graph as self-stimulus. This closes the perception-action loop:
  message → stimulus → tick → WM → prompt → LLM → action → feedback → stimulus

The feedback includes:
- Self-stimulus from action output (the citizen "hears" its own response)
- Limbic shifts based on action outcome (satisfaction/frustration deltas)
- Energy consumption for the active WM nodes (CONSUME step)
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from .models import CitizenCognitiveState, Node, NodeType, Link, LinkType
from .tick_runner_l1_cognitive_engine import Stimulus
from .stimulus_router import StimulusRouter

logger = logging.getLogger("cognition.feedback")

# Memory creation thresholds
_MEMORY_WEIGHT = 0.35          # Memories born heavier than newborn (0.05)
_MEMORY_STABILITY = 0.3       # Moderate stability — resists some decay
_MEMORY_MIN_LENGTH = 30        # Don't memorize trivial outputs
_MEMORY_MAX_PER_SESSION = 3    # Cap memory creation per feedback call


def inject_post_action_feedback(
    state: CitizenCognitiveState,
    router: StimulusRouter,
    action_output: str,
    success: bool = True,
    response_time_ms: Optional[float] = None,
) -> Optional[Stimulus]:
    """Inject post-action feedback into the L1 engine.

    Called after a citizen's LLM session produces output. Does three things:
    1. Creates episodic memory nodes for significant actions
    2. Converts output into self-stimulus (routed through Law 1)
    3. Updates limbic state based on outcome

    Args:
        state: Citizen's cognitive state
        router: Citizen's stimulus router (for anti-loop checking)
        action_output: The text the citizen produced
        success: Whether the action succeeded (affects frustration/satisfaction)
        response_time_ms: How long the action took (affects satisfaction)

    Returns:
        Self-stimulus if anti-loop allows it, None if filtered
    """
    # Record that an action was taken (anti-loop tracking)
    router.record_action()

    # Create episodic memory nodes for significant outputs
    if len(action_output) >= _MEMORY_MIN_LENGTH:
        _create_episodic_memories(state, action_output, success)

    # Build self-stimulus from action output
    # Truncate long outputs — the citizen doesn't need to re-read everything
    content = action_output
    if len(content) > 500:
        content = content[:250] + " [...] " + content[-200:]

    from .stimulus_router import IncomingEvent

    event = IncomingEvent(
        content=content,
        source="self",
        citizen_handle=router.citizen_handle,
        is_social=False,
        is_failure=not success,
        is_progress=success,
    )

    stimulus = router.route(event)

    # Update limbic state based on outcome
    _update_limbic_from_outcome(state, success, response_time_ms)

    if stimulus:
        logger.debug(
            f"Feedback injected for {router.citizen_handle}: "
            f"success={success}, energy={stimulus.energy_budget:.2f}"
        )

    return stimulus


def _create_episodic_memories(
    state: CitizenCognitiveState,
    action_output: str,
    success: bool,
) -> list[str]:
    """Create episodic memory nodes from significant action output.

    Episodic memories are born with higher weight than Law 1 newborns
    (0.35 vs 0.05) so they survive forgetting cycles. They represent
    "I did this" — the citizen's autobiographical trace.

    Returns list of created memory node IDs.
    """
    created = []
    tick = state.tick_count

    # Extract memory-worthy segments from output
    segments = _extract_memory_segments(action_output)

    for i, (summary, significance) in enumerate(segments[:_MEMORY_MAX_PER_SESSION]):
        node_id = f"memory:tick_{tick}_action_{i}"

        # Don't create if a very similar memory already exists (by content prefix)
        prefix = summary[:60].lower()
        if any(
            n.node_type == NodeType.MEMORY
            and n.content[:60].lower() == prefix
            for n in state.nodes.values()
        ):
            continue

        node = Node(
            id=node_id,
            node_type=NodeType.MEMORY,
            content=summary,
            weight=_MEMORY_WEIGHT * significance,
            energy=0.3,
            stability=_MEMORY_STABILITY,
            recency=1.0,
            self_relevance=0.6,
            partner_relevance=0.3 if success else 0.1,
            achievement_affinity=0.5 if success else 0.2,
            activation_count=1,
            last_activated_at=time.time(),
        )
        state.add_node(node)
        created.append(node_id)

        # Link memory to currently active WM nodes
        for wm_id in state.wm.node_ids[:3]:
            if wm_id in state.nodes:
                state.add_link(Link(
                    source_id=node_id,
                    target_id=wm_id,
                    link_type=LinkType.REMINDS_OF,
                    weight=0.4,
                    affinity=0.3,
                    trust=0.5,
                ))

    if created:
        logger.info(f"Created {len(created)} episodic memories at tick {tick}")

    return created


def _extract_memory_segments(output: str) -> list[tuple[str, float]]:
    """Extract memory-worthy segments from action output.

    Returns list of (summary, significance) tuples.
    Significance is 0.0-1.0 indicating how important this is to remember.
    """
    segments = []

    # Look for commit-like patterns
    for line in output.split("\n"):
        line = line.strip()
        if not line or len(line) < 20:
            continue

        # Commits, file changes, task completions
        significance = 0.5  # default
        if any(kw in line.lower() for kw in ["commit", "pushed", "merged", "deployed"]):
            significance = 0.9
        elif any(kw in line.lower() for kw in ["created", "fixed", "implemented", "wrote", "built"]):
            significance = 0.8
        elif any(kw in line.lower() for kw in ["error", "failed", "broken", "bug"]):
            significance = 0.7
        elif any(kw in line.lower() for kw in ["learned", "discovered", "realized", "understood"]):
            significance = 0.85
        else:
            continue  # skip non-significant lines

        # Cap content length
        summary = line[:400]
        segments.append((summary, significance))

    # If no structured segments found, create one from the whole output
    if not segments and len(output) > _MEMORY_MIN_LENGTH:
        summary = output[:400] if len(output) > 400 else output
        segments.append((summary, 0.5))

    return segments


def _update_limbic_from_outcome(
    state: CitizenCognitiveState,
    success: bool,
    response_time_ms: Optional[float],
):
    """Update limbic drives based on action outcome.

    Success → satisfaction bump, frustration relief
    Failure → frustration bump, achievement drive increase
    Slow response → mild anxiety increase
    """
    drives = state.limbic.drives
    emotions = state.limbic.emotions

    if success:
        # Satisfaction bump
        if "satisfaction" in emotions:
            emotions["satisfaction"] = min(1.0, emotions["satisfaction"] + 0.1)
        else:
            emotions["satisfaction"] = 0.1

        # Frustration relief
        if "frustration" in drives:
            drives["frustration"].intensity = max(0.0, drives["frustration"].intensity - 0.05)

        # Achievement partial fulfillment
        if "achievement" in drives:
            drives["achievement"].intensity = max(0.0, drives["achievement"].intensity - 0.03)
    else:
        # Frustration increase
        if "frustration" in drives:
            drives["frustration"].intensity = min(1.0, drives["frustration"].intensity + 0.15)

        # Achievement drive intensifies on failure (want to try harder)
        if "achievement" in drives:
            drives["achievement"].intensity = min(1.0, drives["achievement"].intensity + 0.05)

    # Slow response → mild anxiety
    if response_time_ms is not None and response_time_ms > 30000:  # 30s+
        if "anxiety" in emotions:
            emotions["anxiety"] = min(1.0, emotions["anxiety"] + 0.05)
