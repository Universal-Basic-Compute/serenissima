"""
Partner Node Factory & Relevance Scorer — creates nodes tagged for partner model.

Spec: docs/human_integration/ALGORITHM_Human_Integration.md (score_partner_relevance)
      docs/human_integration/VALIDATION_Human_Integration.md (V1, V3)

Every node entering the partner_model sub-graph must:
1. Have partner_relevance >= 0.7 (V1)
2. Have self_relevance <= 0.3 (partner data is not self-data)
3. Originate from a recognized human data source (V3)

The relevance scorer uses source-based baseline scores with content modifiers
(emotional content, self-reference, decision language, distress markers).
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from typing import Any, Optional

logger = logging.getLogger("ingestion.partner_node_factory")

# Minimum partner_relevance for any node entering the partner model (V1)
MIN_PARTNER_RELEVANCE = 0.7

# Maximum self_relevance for partner nodes — partner data is about the human,
# not the AI's own identity
MAX_SELF_RELEVANCE = 0.3

# Base relevance scores by data source modality
# Spec: ALGORITHM_Human_Integration.md, ALGORITHM: score_partner_relevance
BASE_SCORES: dict[str, float] = {
    "voice_message": 0.85,
    "direct_chat": 0.80,
    "ai_conversation": 0.82,
    "garmin": 0.85,
    "desktop_screenshot": 0.72,
    "blockchain": 0.80,
    "voice_emotion": 0.90,
}

# Valid node_type values from the Mind universal schema
VALID_NODE_TYPES = {"actor", "moment", "narrative", "space", "thing"}

# Recognized human data sources (V3)
APPROVED_HUMAN_SOURCES = frozenset({
    "voice_message",
    "voice_emotion",
    "direct_chat",
    "ai_conversation",
    "garmin",
    "desktop_screenshot",
    "blockchain",
})

# Patterns for content modifier detection
_SELF_REFERENCE_PATTERNS = re.compile(
    r"\b(I feel|I want|I think|I need|I believe|I am|I was|"
    r"je pense|je veux|je crois|je suis|j'ai)\b",
    re.IGNORECASE,
)

_DECISION_LANGUAGE_PATTERNS = re.compile(
    r"\b(I decided|I prefer|I believe|I chose|I will|I won't|"
    r"j'ai décidé|je préfère|j'ai choisi)\b",
    re.IGNORECASE,
)

_DISTRESS_MARKERS = re.compile(
    r"\b(help|scared|worried|anxious|panic|can't cope|overwhelmed|"
    r"au secours|peur|angoisse|panique|détresse)\b",
    re.IGNORECASE,
)


def score_relevance(
    modality: str,
    content_signals: Optional[dict[str, Any]] = None,
) -> float:
    """Score the partner_relevance of a piece of human data.

    Uses source-based baseline scores modified by content signals
    (emotional intensity, self-reference, decision language, distress).

    Spec: ALGORITHM_Human_Integration.md, ALGORITHM: score_partner_relevance

    Args:
        modality: The data source identifier (e.g., "voice_message", "garmin").
        content_signals: Optional dict with keys:
            - text: str — content text for modifier analysis
            - emotion_scores: dict[str, float] — emotion name to intensity

    Returns:
        Float in [0.7, 1.0] representing partner_relevance.
    """
    score = BASE_SCORES.get(modality, MIN_PARTNER_RELEVANCE)

    if content_signals is None:
        return _clamp(score)

    # Emotional content modifier
    emotion_scores = content_signals.get("emotion_scores")
    if emotion_scores and isinstance(emotion_scores, dict):
        max_emotion = max(emotion_scores.values()) if emotion_scores else 0.0
        if max_emotion > 0.8:
            score += 0.10
        elif max_emotion > 0.5:
            score += 0.05

    # Text-based modifiers
    text = content_signals.get("text", "")
    if text:
        if _SELF_REFERENCE_PATTERNS.search(text):
            score += 0.05
        if _DECISION_LANGUAGE_PATTERNS.search(text):
            score += 0.08
        if _DISTRESS_MARKERS.search(text):
            score += 0.07

    return _clamp(score)


def create_partner_node(
    citizen_id: str,
    node_type: str,
    type_label: str,
    content: dict[str, Any],
    modality: str,
    partner_relevance: Optional[float] = None,
    self_relevance: float = 0.0,
    weight: float = 1.0,
    energy: float = 0.0,
    stability: float = 0.0,
    care_affinity: float = 0.0,
    synthesis: Optional[str] = None,
) -> dict[str, Any]:
    """Create a node dict for the partner_model sub-graph.

    Enforces V1 (partner_relevance >= 0.7) and the complementary constraint
    that self_relevance <= 0.3 for partner-originated data.

    Does NOT write to the graph — returns a dict ready for graph.create_node().
    The caller is responsible for persisting the node.

    Spec: ALGORITHM_Human_Integration.md, Data Structures
          VALIDATION_Human_Integration.md, V1, V3

    Args:
        citizen_id: The AI citizen who owns this node.
        node_type: One of the Mind universal schema node types.
        type_label: Subtype label (e.g., "partner_memory", "partner_state").
        content: Dict of content fields specific to the node type.
        modality: Data source identifier used for relevance scoring.
        partner_relevance: Override for partner_relevance. If None, scored
            automatically from modality and content.
        self_relevance: Self-relevance score (clamped to MAX_SELF_RELEVANCE).
        weight: Initial weight.
        energy: Initial energy.
        stability: Initial stability.
        care_affinity: Care affinity dimension.
        synthesis: Human-readable synthesis string. Auto-generated if None.

    Returns:
        Dict with all node fields populated, ready for graph insertion.

    Raises:
        ValueError: If node_type is not valid, source is not approved,
            or partner_relevance would be below minimum.
    """
    if node_type not in VALID_NODE_TYPES:
        raise ValueError(
            f"Invalid node_type '{node_type}'. "
            f"Valid types: {sorted(VALID_NODE_TYPES)}"
        )

    source = content.get("source", modality)
    if source not in APPROVED_HUMAN_SOURCES:
        raise ValueError(
            f"Source '{source}' is not an approved human data source (V3). "
            f"Approved: {sorted(APPROVED_HUMAN_SOURCES)}"
        )

    # Score relevance if not explicitly provided
    if partner_relevance is None:
        content_signals = {
            "text": content.get("raw_transcript", "")
            or content.get("extracted_text", ""),
            "emotion_scores": content.get("emotion_detected"),
        }
        partner_relevance = score_relevance(modality, content_signals)

    # Enforce V1: partner_relevance must be >= 0.7
    if partner_relevance < MIN_PARTNER_RELEVANCE:
        raise ValueError(
            f"partner_relevance {partner_relevance:.2f} is below minimum "
            f"{MIN_PARTNER_RELEVANCE} (V1 violation). "
            f"Partner model nodes must have partner_relevance >= {MIN_PARTNER_RELEVANCE}."
        )

    # Enforce self_relevance ceiling for partner data
    clamped_self_relevance = min(self_relevance, MAX_SELF_RELEVANCE)

    if synthesis is None:
        synthesis = _auto_synthesis(type_label, content)

    node_id = f"{type_label}_{uuid.uuid4().hex[:12]}"

    return {
        "id": node_id,
        "node_type": node_type,
        "type": type_label,
        "citizen_id": citizen_id,
        "content": content,
        "modality": modality,
        "partner_relevance": partner_relevance,
        "self_relevance": clamped_self_relevance,
        "weight": weight,
        "energy": energy,
        "stability": stability,
        "care_affinity": care_affinity,
        "synthesis": synthesis,
        "created_at": time.time(),
    }


def _clamp(value: float, low: float = 0.7, high: float = 1.0) -> float:
    """Clamp value to [low, high] range."""
    return max(low, min(high, value))


def _auto_synthesis(type_label: str, content: dict[str, Any]) -> str:
    """Generate a synthesis string from type label and content."""
    source = content.get("source", "unknown")

    if type_label == "partner_memory":
        transcript = content.get("raw_transcript", "")
        preview = transcript[:200] if transcript else "(no transcript)"
        return f"Partner said: {preview}"

    if type_label == "partner_state":
        metric = content.get("metric", "unknown")
        value = content.get("value", "?")
        return f"Partner's {metric}: {value}"

    if type_label == "partner_concept":
        context = content.get("context", content.get("extracted_text", "")[:100])
        app = content.get("application", "unknown")
        return f"Partner working on: {context} in {app}"

    if type_label == "partner_transaction":
        direction = content.get("direction", "?")
        amount = content.get("amount", "?")
        token = content.get("token", "?")
        return f"Partner {direction} {amount} {token}"

    return f"Partner data from {source}"
