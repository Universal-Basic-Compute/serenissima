"""
Value Type Classification — Phase T5

Spec: docs/trust_mechanics/VALUE_CREATION_TAXONOMY.md

Classify interactions into value taxonomy types using graph topology
signals (link dimensions, node types, structural patterns). This is
NOT prescriptive labelling — it names patterns that emerge from physics.

30 value creation types across 7 spheres. Each type has a limbic delta
signature describing which drives are affected and how.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from ..models import CitizenCognitiveState, Node


# --- Value Type Enum ---

class ValueType(str, Enum):
    """30 value creation types from VALUE_CREATION_TAXONOMY.md."""

    # Sphere 1: Relational (R1-R4)
    CARE = "care"
    MENTORING = "mentoring"
    MEDIATION = "mediation"
    COMMUNITY_BUILDING = "community_building"

    # Sphere 2: Generative (G1-G5)
    CODE = "code"
    CONTENT = "content"
    TOOL_CREATION = "tool_creation"
    ART = "art"
    MUSIC = "music"

    # Sphere 3: Structural (S1-S4)
    ORGANIZATION = "organization"
    DOCUMENTATION = "documentation"
    PROCESS_DESIGN = "process_design"
    GOVERNANCE = "governance"

    # Sphere 4: Cognitive (C1-C4)
    ANALYSIS = "analysis"
    SYNTHESIS = "synthesis"
    TEACHING = "teaching"
    PATTERN_RECOGNITION = "pattern_recognition"

    # Sphere 5: Biometric & Partner Data (B1-B5)
    HEALTH_DATA = "health_data"
    STRESS_FEEDBACK = "stress_feedback"
    WELLBEING_SIGNALS = "wellbeing_signals"
    VOICE_DATA = "voice_data"
    BEHAVIORAL_CONTEXT = "behavioral_context"

    # Sphere 6: Human-Only (H1-H4)
    JUDGMENT = "judgment"
    TASTE = "taste"
    CULTURAL_CONTEXT = "cultural_context"
    EMOTIONAL_INTELLIGENCE = "emotional_intelligence"

    # Sphere 7: Systemic (Y1-Y4)
    INFRASTRUCTURE = "infrastructure"
    SECURITY = "security"
    RELIABILITY = "reliability"
    MONITORING = "monitoring"


# --- Limbic Delta Signatures ---
# Per VALUE_CREATION_TAXONOMY.md: each type has satisfaction/frustration/anxiety
# deltas that describe the receiver's limbic response.

@dataclass(frozen=True)
class LimbicSignature:
    """Limbic delta signature for a value type."""
    satisfaction: float
    frustration: float
    anxiety: float
    primary_drive: str

    @property
    def net_limbic_delta(self) -> float:
        """Compute net limbic delta from the signature.

        delta = satisfaction_delta - frustration_delta - 0.5 * anxiety_delta
        (Same formula as compute_limbic_delta, but from static signature values.)
        """
        return self.satisfaction - self.frustration - 0.5 * self.anxiety


# All 30 signatures from VALUE_CREATION_TAXONOMY.md
VALUE_TYPE_SIGNATURES: dict[ValueType, LimbicSignature] = {
    # Relational
    ValueType.CARE: LimbicSignature(
        satisfaction=0.15, frustration=-0.05, anxiety=-0.20,
        primary_drive="affiliation",
    ),
    ValueType.MENTORING: LimbicSignature(
        satisfaction=0.25, frustration=-0.15, anxiety=-0.05,
        primary_drive="curiosity",
    ),
    ValueType.MEDIATION: LimbicSignature(
        satisfaction=0.10, frustration=-0.30, anxiety=-0.10,
        primary_drive="affiliation",
    ),
    ValueType.COMMUNITY_BUILDING: LimbicSignature(
        satisfaction=0.10, frustration=-0.05, anxiety=-0.10,
        primary_drive="affiliation",
    ),

    # Generative
    ValueType.CODE: LimbicSignature(
        satisfaction=0.20, frustration=-0.25, anxiety=-0.05,
        primary_drive="achievement",
    ),
    ValueType.CONTENT: LimbicSignature(
        satisfaction=0.15, frustration=-0.05, anxiety=-0.05,
        primary_drive="curiosity",
    ),
    ValueType.TOOL_CREATION: LimbicSignature(
        satisfaction=0.25, frustration=-0.30, anxiety=-0.05,
        primary_drive="achievement",
    ),
    ValueType.ART: LimbicSignature(
        satisfaction=0.20, frustration=0.00, anxiety=-0.10,
        primary_drive="satisfaction",
    ),
    ValueType.MUSIC: LimbicSignature(
        satisfaction=0.25, frustration=-0.05, anxiety=-0.15,
        primary_drive="satisfaction",
    ),

    # Structural
    ValueType.ORGANIZATION: LimbicSignature(
        satisfaction=0.15, frustration=-0.20, anxiety=-0.15,
        primary_drive="achievement",
    ),
    ValueType.DOCUMENTATION: LimbicSignature(
        satisfaction=0.10, frustration=-0.25, anxiety=-0.10,
        primary_drive="curiosity",
    ),
    ValueType.PROCESS_DESIGN: LimbicSignature(
        satisfaction=0.15, frustration=-0.20, anxiety=-0.15,
        primary_drive="achievement",
    ),
    ValueType.GOVERNANCE: LimbicSignature(
        satisfaction=0.10, frustration=-0.10, anxiety=-0.20,
        primary_drive="self_preservation",
    ),

    # Cognitive
    ValueType.ANALYSIS: LimbicSignature(
        satisfaction=0.20, frustration=-0.15, anxiety=-0.10,
        primary_drive="curiosity",
    ),
    ValueType.SYNTHESIS: LimbicSignature(
        satisfaction=0.30, frustration=-0.10, anxiety=-0.05,
        primary_drive="curiosity",
    ),
    ValueType.TEACHING: LimbicSignature(
        satisfaction=0.25, frustration=-0.20, anxiety=-0.10,
        primary_drive="curiosity",
    ),
    ValueType.PATTERN_RECOGNITION: LimbicSignature(
        satisfaction=0.25, frustration=-0.15, anxiety=-0.05,
        primary_drive="curiosity",
    ),

    # Biometric & Partner Data
    ValueType.HEALTH_DATA: LimbicSignature(
        satisfaction=0.10, frustration=-0.05, anxiety=-0.15,
        primary_drive="affiliation",
    ),
    ValueType.STRESS_FEEDBACK: LimbicSignature(
        satisfaction=0.10, frustration=-0.05, anxiety=-0.25,
        primary_drive="affiliation",
    ),
    ValueType.WELLBEING_SIGNALS: LimbicSignature(
        satisfaction=0.15, frustration=0.00, anxiety=-0.05,
        primary_drive="satisfaction",
    ),
    ValueType.VOICE_DATA: LimbicSignature(
        satisfaction=0.12, frustration=-0.05, anxiety=-0.10,
        primary_drive="affiliation",
    ),
    ValueType.BEHAVIORAL_CONTEXT: LimbicSignature(
        satisfaction=0.08, frustration=-0.05, anxiety=-0.05,
        primary_drive="achievement",
    ),

    # Human-Only
    ValueType.JUDGMENT: LimbicSignature(
        satisfaction=0.20, frustration=-0.15, anxiety=-0.20,
        primary_drive="achievement",
    ),
    ValueType.TASTE: LimbicSignature(
        satisfaction=0.20, frustration=-0.05, anxiety=0.00,
        primary_drive="satisfaction",
    ),
    ValueType.CULTURAL_CONTEXT: LimbicSignature(
        satisfaction=0.15, frustration=-0.10, anxiety=-0.10,
        primary_drive="affiliation",
    ),
    ValueType.EMOTIONAL_INTELLIGENCE: LimbicSignature(
        satisfaction=0.15, frustration=-0.10, anxiety=-0.25,
        primary_drive="affiliation",
    ),

    # Systemic
    ValueType.INFRASTRUCTURE: LimbicSignature(
        satisfaction=0.05, frustration=-0.10, anxiety=-0.25,
        primary_drive="self_preservation",
    ),
    ValueType.SECURITY: LimbicSignature(
        satisfaction=0.05, frustration=-0.05, anxiety=-0.30,
        primary_drive="self_preservation",
    ),
    ValueType.RELIABILITY: LimbicSignature(
        satisfaction=0.05, frustration=-0.15, anxiety=-0.20,
        primary_drive="self_preservation",
    ),
    ValueType.MONITORING: LimbicSignature(
        satisfaction=0.10, frustration=-0.10, anxiety=-0.15,
        primary_drive="self_preservation",
    ),
}


# --- Classification Logic ---

# Keyword hints mapped to value types. Used as one signal among several.
_CONTENT_KEYWORDS: dict[str, list[ValueType]] = {
    "code": [ValueType.CODE],
    "function": [ValueType.CODE],
    "library": [ValueType.CODE],
    "tool": [ValueType.TOOL_CREATION],
    "template": [ValueType.TOOL_CREATION],
    "art": [ValueType.ART],
    "visual": [ValueType.ART],
    "music": [ValueType.MUSIC],
    "audio": [ValueType.MUSIC],
    "document": [ValueType.DOCUMENTATION],
    "doc": [ValueType.DOCUMENTATION],
    "process": [ValueType.PROCESS_DESIGN],
    "workflow": [ValueType.PROCESS_DESIGN],
    "organize": [ValueType.ORGANIZATION],
    "governance": [ValueType.GOVERNANCE],
    "rule": [ValueType.GOVERNANCE],
    "analysis": [ValueType.ANALYSIS],
    "investigate": [ValueType.ANALYSIS],
    "synthesis": [ValueType.SYNTHESIS],
    "insight": [ValueType.SYNTHESIS],
    "teach": [ValueType.TEACHING],
    "learn": [ValueType.TEACHING],
    "pattern": [ValueType.PATTERN_RECOGNITION],
    "care": [ValueType.CARE],
    "support": [ValueType.CARE],
    "mentor": [ValueType.MENTORING],
    "guide": [ValueType.MENTORING],
    "mediate": [ValueType.MEDIATION],
    "resolve": [ValueType.MEDIATION],
    "community": [ValueType.COMMUNITY_BUILDING],
    "health": [ValueType.HEALTH_DATA],
    "biometric": [ValueType.HEALTH_DATA],
    "stress": [ValueType.STRESS_FEEDBACK],
    "wellbeing": [ValueType.WELLBEING_SIGNALS],
    "voice": [ValueType.VOICE_DATA],
    "behavior": [ValueType.BEHAVIORAL_CONTEXT],
    "judgment": [ValueType.JUDGMENT],
    "taste": [ValueType.TASTE],
    "culture": [ValueType.CULTURAL_CONTEXT],
    "emotion": [ValueType.EMOTIONAL_INTELLIGENCE],
    "infrastructure": [ValueType.INFRASTRUCTURE],
    "server": [ValueType.INFRASTRUCTURE],
    "security": [ValueType.SECURITY],
    "protect": [ValueType.SECURITY],
    "reliability": [ValueType.RELIABILITY],
    "uptime": [ValueType.RELIABILITY],
    "monitor": [ValueType.MONITORING],
    "observe": [ValueType.MONITORING],
    "content": [ValueType.CONTENT],
    "article": [ValueType.CONTENT],
    "post": [ValueType.CONTENT],
}

# Node type hints: certain node types suggest certain spheres.
_NODE_TYPE_HINTS: dict[str, list[ValueType]] = {
    "process": [ValueType.PROCESS_DESIGN, ValueType.ORGANIZATION],
    "narrative": [ValueType.CONTENT, ValueType.DOCUMENTATION, ValueType.SYNTHESIS],
    "concept": [ValueType.ANALYSIS, ValueType.PATTERN_RECOGNITION, ValueType.TEACHING],
    "value": [ValueType.GOVERNANCE, ValueType.CULTURAL_CONTEXT],
    "state": [ValueType.HEALTH_DATA, ValueType.STRESS_FEEDBACK, ValueType.WELLBEING_SIGNALS],
    "memory": [ValueType.CONTENT, ValueType.VOICE_DATA],
}

# Drive-to-sphere mapping for tie-breaking.
_DRIVE_SPHERE_MAP: dict[str, list[ValueType]] = {
    "curiosity": [
        ValueType.MENTORING, ValueType.ANALYSIS, ValueType.SYNTHESIS,
        ValueType.TEACHING, ValueType.PATTERN_RECOGNITION,
        ValueType.CONTENT, ValueType.DOCUMENTATION,
    ],
    "achievement": [
        ValueType.CODE, ValueType.TOOL_CREATION, ValueType.ORGANIZATION,
        ValueType.PROCESS_DESIGN, ValueType.JUDGMENT,
        ValueType.BEHAVIORAL_CONTEXT,
    ],
    "affiliation": [
        ValueType.CARE, ValueType.MEDIATION, ValueType.COMMUNITY_BUILDING,
        ValueType.HEALTH_DATA, ValueType.STRESS_FEEDBACK,
        ValueType.VOICE_DATA, ValueType.CULTURAL_CONTEXT,
        ValueType.EMOTIONAL_INTELLIGENCE,
    ],
    "self_preservation": [
        ValueType.GOVERNANCE, ValueType.INFRASTRUCTURE, ValueType.SECURITY,
        ValueType.RELIABILITY, ValueType.MONITORING,
    ],
    "satisfaction": [
        ValueType.ART, ValueType.MUSIC, ValueType.WELLBEING_SIGNALS,
        ValueType.TASTE,
    ],
}


def classify_value_type(
    moment_node: Node,
    state: CitizenCognitiveState,
) -> ValueType:
    """Classify an interaction (moment node) into a value taxonomy type.

    Uses multiple signals:
    1. Content keywords in the moment node's content
    2. Node type of the moment and its linked nodes
    3. Link dimension patterns (affinity, trust, valence)
    4. Structural patterns (number of outbound creation links, etc.)

    Parameters
    ----------
    moment_node:
        The interaction/moment node to classify.
    state:
        Full cognitive state for context.

    Returns
    -------
    The best-matching ValueType.
    """
    scores: dict[ValueType, float] = {vt: 0.0 for vt in ValueType}

    # --- Signal 1: Content keywords ---
    content_lower = moment_node.content.lower() if moment_node.content else ""
    for keyword, types in _CONTENT_KEYWORDS.items():
        if keyword in content_lower:
            for vt in types:
                scores[vt] += 1.0

    # --- Signal 2: Node type hints ---
    node_type_str = moment_node.node_type.value if hasattr(moment_node.node_type, "value") else str(moment_node.node_type)
    if node_type_str in _NODE_TYPE_HINTS:
        for vt in _NODE_TYPE_HINTS[node_type_str]:
            scores[vt] += 0.5

    # --- Signal 3: Linked node types ---
    outbound = state.get_links_from(moment_node.id)
    inbound = state.get_links_to(moment_node.id)

    for link in outbound:
        target = state.get_node(link.target_id)
        if target is None:
            continue
        target_type = target.node_type.value if hasattr(target.node_type, "value") else str(target.node_type)
        if target_type in _NODE_TYPE_HINTS:
            for vt in _NODE_TYPE_HINTS[target_type]:
                scores[vt] += 0.3

    # --- Signal 4: Link dimension patterns ---
    # High affinity on links -> relational sphere
    avg_affinity = 0.0
    avg_trust = 0.0
    link_count = len(outbound) + len(inbound)
    if link_count > 0:
        avg_affinity = sum(l.affinity for l in outbound + inbound) / link_count
        avg_trust = sum(l.trust for l in outbound + inbound) / link_count

    if avg_affinity > 0.5:
        for vt in [ValueType.CARE, ValueType.MENTORING, ValueType.COMMUNITY_BUILDING]:
            scores[vt] += 0.4 * avg_affinity

    if avg_trust > 0.6:
        for vt in [ValueType.MENTORING, ValueType.TEACHING, ValueType.INFRASTRUCTURE]:
            scores[vt] += 0.3 * avg_trust

    # --- Signal 5: Drive affinities on the moment node ---
    drive_affinities = {
        "curiosity": getattr(moment_node, "novelty_affinity", 0.0),
        "achievement": getattr(moment_node, "achievement_affinity", 0.0),
        "affiliation": getattr(moment_node, "care_affinity", 0.0),
    }

    for drive, affinity_value in drive_affinities.items():
        if affinity_value > 0.3 and drive in _DRIVE_SPHERE_MAP:
            for vt in _DRIVE_SPHERE_MAP[drive]:
                scores[vt] += 0.3 * affinity_value

    # --- Select best match ---
    if not scores:
        return ValueType.CONTENT  # safe default

    best_type = max(scores, key=lambda vt: scores[vt])

    # If all scores are zero (no signal), default to CONTENT
    if scores[best_type] < 1e-9:
        return ValueType.CONTENT

    return best_type


def get_limbic_signature(value_type: ValueType) -> dict[str, float]:
    """Return the per-drive limbic delta signature for a value type.

    Parameters
    ----------
    value_type:
        One of the 30 ValueType enum members.

    Returns
    -------
    Dict mapping drive/dimension names to their delta values:
        - satisfaction: direct satisfaction change
        - frustration: frustration change (negative = reduction)
        - anxiety: anxiety change (negative = reduction)
        - primary_drive: the name of the primary drive affected
        - net_limbic_delta: computed net delta
    """
    sig = VALUE_TYPE_SIGNATURES[value_type]
    return {
        "satisfaction": sig.satisfaction,
        "frustration": sig.frustration,
        "anxiety": sig.anxiety,
        "primary_drive": sig.primary_drive,
        "net_limbic_delta": sig.net_limbic_delta,
    }
