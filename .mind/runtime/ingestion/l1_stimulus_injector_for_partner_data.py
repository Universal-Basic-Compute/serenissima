"""
L1 Stimulus Injector for Partner Data — wraps partner nodes as Stimulus objects.

Spec: docs/human_integration/IMPLEMENTATION_Human_Integration.md (Phase H2)
      docs/human_integration/ALGORITHM_Human_Integration.md (Law 1 injection)

Converts partner model nodes into Stimulus objects compatible with the
L1 cognitive tick loop. Each modality has a characteristic energy level
reflecting its attentional weight:

    garmin     = 0.2  (background, low attention)
    desktop    = 0.15 (ambient, lowest attention)
    voice      = 0.5  (high attention, intimate)
    blockchain = 0.3  (moderate attention)
    direct_chat = 0.4 (conversational attention)
    ai_messages = 0.3 (moderate attention)

Uses the existing runtime/cognition/stimulus_router.py interface
(StimulusRouter.route) for final injection into the tick loop.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("ingestion.stimulus_injector")

# Energy levels per modality — how much attentional energy partner data injects
# into the cognitive tick. Higher energy = more likely to enter working memory.
MODALITY_ENERGY: dict[str, float] = {
    "garmin": 0.2,
    "voice_message": 0.5,
    "voice_emotion": 0.5,
    "desktop_screenshot": 0.15,
    "blockchain": 0.3,
    "direct_chat": 0.4,
    "ai_messages": 0.3,
    "ai_conversation": 0.3,
}


@dataclass
class PartnerStimulus:
    """A stimulus produced from partner data, ready for L1 injection.

    This is a lightweight carrier that mirrors the structure of
    runtime.cognition.tick_runner_l1_cognitive_engine.Stimulus but is
    decoupled from the cognition module to avoid circular imports.

    The inject_partner_stimulus function returns this object. The caller
    (or an integration layer) converts it to a cognition.Stimulus for
    the actual tick injection.
    """
    content: str
    energy_budget: float = 0.3
    embedding: list[float] = field(default_factory=list)
    target_node_ids: list[str] = field(default_factory=list)
    is_social: bool = True  # partner data is inherently social
    is_failure: bool = False
    is_novelty: bool = True  # partner data is fresh external input
    is_progress: bool = False
    source: str = "partner"
    timestamp: float = field(default_factory=time.time)
    modality: str = ""
    partner_relevance: float = 0.0
    node_id: str = ""  # the partner node that spawned this stimulus


def inject_partner_stimulus(
    citizen_id: str,
    node: dict[str, Any],
    energy: Optional[float] = None,
) -> PartnerStimulus:
    """Wrap a partner model node as a PartnerStimulus for L1 injection.

    Determines energy level from the node's modality (source), with an
    optional override. The returned PartnerStimulus carries all metadata
    needed for the cognition layer to inject it into the tick loop.

    Spec: IMPLEMENTATION_Human_Integration.md, Phase H2

    Args:
        citizen_id: The AI citizen receiving the stimulus.
        node: A partner node dict as returned by create_partner_node().
        energy: Optional energy override. If None, uses modality default.

    Returns:
        PartnerStimulus ready for conversion to cognition.Stimulus.

    Raises:
        ValueError: If the node lacks required fields (synthesis, content).
    """
    synthesis = node.get("synthesis")
    if not synthesis:
        raise ValueError(
            "Partner node must have a synthesis field for stimulus injection. "
            f"Node: {node.get('id', 'unknown')}"
        )

    content = node.get("content")
    if content is None:
        raise ValueError(
            "Partner node must have a content field. "
            f"Node: {node.get('id', 'unknown')}"
        )

    modality = node.get("modality", "")
    source = ""
    if isinstance(content, dict):
        source = content.get("source", modality)
    else:
        source = modality

    # Determine energy from modality or use override
    if energy is not None:
        energy_budget = energy
    else:
        energy_budget = MODALITY_ENERGY.get(source, 0.3)

    node_id = node.get("id", "")
    partner_relevance = node.get("partner_relevance", 0.0)

    stimulus = PartnerStimulus(
        content=synthesis,
        energy_budget=energy_budget,
        target_node_ids=[node_id] if node_id else [],
        source="partner",
        modality=source,
        partner_relevance=partner_relevance,
        node_id=node_id,
    )

    logger.debug(
        "Partner stimulus created for citizen '%s': "
        "energy=%.2f, modality=%s, node=%s",
        citizen_id,
        energy_budget,
        source,
        node_id,
    )

    return stimulus
