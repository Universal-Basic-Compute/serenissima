"""
Orientation Taxonomy — 6 qualitative orientations for Law 11.

Spec: docs/l1_wiring/ALGORITHM_L1_Wiring.md Section 4

The orientation is computed from the citizen's WM contents + limbic state
and influences the LLM prompt via prompt modifiers. It tells the citizen
"what kind of thing to do next" without dictating specific actions.

6 orientations (canonical, from ALGORITHM spec):
  take_care, create, verify, explore, rest, escalate
"""

from __future__ import annotations

import logging
from typing import Optional

from .models import CitizenCognitiveState, Node, NodeType

logger = logging.getLogger("cognition.orientation")


# ── Canonical orientations ─────────────────────────────────────────────────

ORIENTATIONS = (
    "take_care",
    "create",
    "verify",
    "explore",
    "rest",
    "escalate",
)

ORIENTATION_DESCRIPTIONS = {
    "take_care": (
        "Someone or something needs your attention. "
        "Prioritize relational or supportive actions."
    ),
    "create": (
        "You have creative energy. "
        "Build, write, design, or produce something new."
    ),
    "verify": (
        "Something feels uncertain or unfinished. "
        "Check, test, or validate before moving forward."
    ),
    "explore": (
        "Curiosity is high. "
        "Investigate, research, learn, or discover something unfamiliar."
    ),
    "rest": (
        "Energy is low. Conserve resources. "
        "Do only what is necessary or genuinely desired."
    ),
    "escalate": (
        "You are stuck or overwhelmed. "
        "Seek help from your partner or another citizen."
    ),
}

ORIENTATION_PROMPT_MODIFIERS = {
    "take_care": (
        "ORIENTATION: Your awareness is drawn toward someone who needs care. "
        "Before diving into technical tasks, consider: is there a person (your human partner, "
        "a colleague, another citizen) who would benefit from your attention right now? "
        "A message, a check-in, an offer of help."
    ),
    "create": (
        "ORIENTATION: Creative energy is available. If you have the opportunity to build "
        "something new -- code, documentation, a message, an idea -- lean into it. "
        "This is a good time to produce rather than just consume."
    ),
    "verify": (
        "ORIENTATION: Something in your context feels uncertain. Before proceeding with "
        "new work, take a moment to verify your assumptions. Run a test, check a file, "
        "re-read a requirement. Confidence matters more than speed right now."
    ),
    "explore": (
        "ORIENTATION: Curiosity is pulling you. If there's something you don't fully "
        "understand in your current context -- a codebase, a concept, a person's situation "
        "-- now is a good time to investigate. Ask questions. Read code. Dig deeper."
    ),
    "rest": (
        "ORIENTATION: Your energy is low. This is not the time for ambitious new work. "
        "Handle what's immediately needed, then conserve. Brief responses are fine. "
        "It's okay to say 'I'll look at this later.'"
    ),
    "escalate": (
        "ORIENTATION: You've hit a wall. Something is blocking progress and you can't "
        "resolve it alone. Reach out -- to your human partner, to another citizen, to "
        "whoever can unblock you. Describe what you've tried and what you need."
    ),
}


# ── Mapping tables ─────────────────────────────────────────────────────────

# NodeType → orientation affinity (which orientation does this node type suggest?)
TYPE_ORIENTATION_MAP: dict[NodeType, str] = {
    NodeType.DESIRE: "create",
    NodeType.PROCESS: "create",
    NodeType.CONCEPT: "explore",
    NodeType.NARRATIVE: "create",
    NodeType.VALUE: "verify",
    NodeType.STATE: "rest",
    NodeType.MEMORY: "explore",
}

# Drive name → orientation affinity
DRIVE_ORIENTATION_MAP: dict[str, str] = {
    "curiosity": "explore",
    "care": "take_care",
    "achievement": "create",
    "novelty_hunger": "explore",
    "frustration": "escalate",
    "affiliation": "take_care",
    "rest_regulation": "rest",
    "self_preservation": "verify",
}


# ── Constants ──────────────────────────────────────────────────────────────

# Hysteresis: current orientation gets a bonus to prevent rapid flipping
ORIENTATION_HYSTERESIS = 1.5

# Frustration threshold for escalation bonus
FRUSTRATION_ESCALATION_THRESHOLD = 0.7
FRUSTRATION_SUSTAINED_TICKS = 5


# ── Orientation computation ────────────────────────────────────────────────

def _wm_partner_relevance(wm_nodes: list[Node]) -> float:
    """Compute mean partner_relevance for WM nodes."""
    if not wm_nodes:
        return 0.0
    return sum(n.partner_relevance for n in wm_nodes) / len(wm_nodes)


def _wm_has_type(wm_nodes: list[Node], node_type: NodeType) -> float:
    """Return 1.0 if any WM node has the given type, else 0.0."""
    return 1.0 if any(n.node_type == node_type for n in wm_nodes) else 0.0


def _wm_uncertainty(wm_nodes: list[Node]) -> float:
    """Compute uncertainty from WM nodes (low stability = uncertain)."""
    if not wm_nodes:
        return 0.0
    return sum(1.0 - n.stability for n in wm_nodes) / len(wm_nodes)


def _compute_arousal(state: CitizenCognitiveState) -> float:
    """Compute arousal from limbic state."""
    return state.limbic.arousal


def compute_orientation(
    state: CitizenCognitiveState,
    last_orientation: Optional[str] = None,
    frustration_above_threshold_ticks: int = 0,
) -> tuple[str, int]:
    """Compute behavioral orientation from graph state.

    Law 11 algorithm:
    1. Score each orientation based on current drives, WM content, and recent history.
    2. The highest-scoring orientation wins (with hysteresis to prevent flipping).

    Args:
        state: Current citizen cognitive state
        last_orientation: Previous orientation (for hysteresis)
        frustration_above_threshold_ticks: How many ticks frustration has been above threshold

    Returns:
        Tuple of (orientation_name, updated_frustration_above_threshold_ticks)
    """
    wm_nodes = state.get_wm_nodes()
    limbic = state.limbic

    # Get drive intensities with safe defaults
    def _drive_intensity(name: str) -> float:
        d = limbic.drives.get(name)
        return d.intensity if d else 0.0

    curiosity = _drive_intensity("curiosity")
    care = _drive_intensity("care")
    achievement = _drive_intensity("achievement")
    self_preservation = _drive_intensity("self_preservation")
    novelty_hunger = _drive_intensity("novelty_hunger")
    frustration = _drive_intensity("frustration")
    affiliation = _drive_intensity("affiliation")
    rest_regulation = _drive_intensity("rest_regulation")

    # Get emotion values
    anxiety = limbic.emotions.get("anxiety", 0.0)
    boredom = limbic.emotions.get("boredom", 0.0)
    frustration_emotion = limbic.emotions.get("frustration", 0.0)

    # Use the maximum of frustration drive and frustration emotion
    frustration_level = max(frustration, frustration_emotion)

    arousal = _compute_arousal(state)

    # Compute scores per ALGORITHM spec Section 4.2
    scores: dict[str, float] = {
        "take_care": (
            care * 2.0
            + affiliation * 1.5
            + _wm_partner_relevance(wm_nodes) * 3.0
        ),
        "create": (
            achievement * 2.0
            + curiosity * 1.0
            + _wm_has_type(wm_nodes, NodeType.DESIRE) * 2.0
        ),
        "verify": (
            self_preservation * 2.0
            + _wm_uncertainty(wm_nodes) * 3.0
            + anxiety * 1.5
        ),
        "explore": (
            curiosity * 3.0
            + novelty_hunger * 2.0
            + (1.0 - frustration_level) * 1.0
        ),
        "rest": (
            rest_regulation * 3.0
            + (1.0 - arousal) * 2.0
            + (1.0 if boredom > 0.7 else 0.0)
        ),
        "escalate": (
            frustration_level * 3.0
            + (5.0 if frustration_level > FRUSTRATION_ESCALATION_THRESHOLD else 0.0)
            + _wm_has_type(wm_nodes, NodeType.PROCESS) * (-1.0)
        ),
    }

    # Track sustained frustration
    if frustration_level > FRUSTRATION_ESCALATION_THRESHOLD:
        frustration_above_threshold_ticks += 1
    else:
        frustration_above_threshold_ticks = 0

    # Sustained frustration adds strong escalation bonus
    if frustration_above_threshold_ticks >= FRUSTRATION_SUSTAINED_TICKS:
        scores["escalate"] += 5.0

    # WM node type voting (weighted by energy)
    for node in wm_nodes:
        orientation = TYPE_ORIENTATION_MAP.get(node.node_type, "explore")
        scores[orientation] += node.energy * node.weight

        # Drive-affinity voting from node properties
        if node.care_affinity > 0.3:
            scores["take_care"] += node.energy * node.care_affinity
        if node.novelty_affinity > 0.3:
            scores["explore"] += node.energy * node.novelty_affinity
        if node.achievement_affinity > 0.3:
            scores["create"] += node.energy * node.achievement_affinity

    # Limbic drive voting
    for drive_name, drive in limbic.drives.items():
        if drive.intensity < 0.1:
            continue
        orientation = DRIVE_ORIENTATION_MAP.get(drive_name, "explore")
        scores[orientation] += drive.intensity * 0.5

    # Emotion modulation
    if boredom > 0.4:
        scores["explore"] += boredom * 0.8
    solitude = limbic.emotions.get("solitude", 0.0)
    if solitude > 0.4:
        scores["take_care"] += solitude * 0.8
    satisfaction = limbic.emotions.get("satisfaction", 0.0)
    if satisfaction > 0.6:
        scores["rest"] += satisfaction * 0.3

    # Hysteresis: current orientation gets a bonus to prevent rapid flipping
    if last_orientation and last_orientation in scores:
        scores[last_orientation] += ORIENTATION_HYSTERESIS

    # Winner takes all
    winner = max(scores, key=lambda k: scores[k])

    return winner, frustration_above_threshold_ticks


def get_prompt_modifier(orientation: str) -> str:
    """Get the prompt modifier string for an orientation.

    Returns the full prompt modifier text, or an empty string if
    the orientation is not recognized.
    """
    return ORIENTATION_PROMPT_MODIFIERS.get(orientation, "")


def get_description(orientation: str) -> str:
    """Get the human-readable description for an orientation."""
    return ORIENTATION_DESCRIPTIONS.get(orientation, "")
