"""
L1 Cognitive Engine — Data Models

Spec: docs/cognition/l1/PATTERNS_L1_Cognition.md
All types, dimensions, and spaces defined here.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# --- Enums ---

class NodeType(str, Enum):
    MEMORY = "memory"
    CONCEPT = "concept"
    NARRATIVE = "narrative"
    VALUE = "value"
    PROCESS = "process"
    DESIRE = "desire"
    STATE = "state"


class LinkType(str, Enum):
    # Cognitive (12)
    ACTIVATES = "activates"
    SUPPORTS = "supports"
    CONTRADICTS = "contradicts"
    REMINDS_OF = "reminds_of"
    CAUSES = "causes"
    CONFLICTS_WITH = "conflicts_with"
    REGULATES = "regulates"
    PROJECTS_TOWARD = "projects_toward"
    DEPENDS_ON = "depends_on"
    EXEMPLIFIES = "exemplifies"
    SPECIALIZES = "specializes"
    ASSOCIATES = "associates"
    # Crystallization (2)
    CONTAINS = "contains"
    ABSTRACTS = "abstracts"


class Modality(str, Enum):
    TEXT = "text"
    VISUAL = "visual"
    AUDIO = "audio"
    SPATIAL = "spatial"
    BIOMETRIC = "biometric"


class DriveName(str, Enum):
    CURIOSITY = "curiosity"
    CARE = "care"
    ACHIEVEMENT = "achievement"
    SELF_PRESERVATION = "self_preservation"
    NOVELTY_HUNGER = "novelty_hunger"
    FRUSTRATION = "frustration"
    AFFILIATION = "affiliation"
    REST_REGULATION = "rest_regulation"


class EmotionName(str, Enum):
    BOREDOM = "boredom"
    ANGER = "anger"
    ANXIETY = "anxiety"
    SATISFACTION = "satisfaction"
    TENDERNESS = "tenderness"
    SOLITUDE = "solitude"


class ConsciousnessLevel(str, Enum):
    FULL = "full"
    MINIMAL = "minimal"
    SUBCONSCIOUS = "subconscious"


# --- Drive Snapshot (for Limbic Delta computation) ---

@dataclass
class DriveSnapshot:
    """Snapshot of limbic drive intensities at a point in time.

    Captured before and after interactions to compute the Limbic Delta
    that drives trust updates on links (Law 18 extension).

    See: docs/trust_mechanics/ALGORITHM_Trust_Mechanics.md section 1.
    """
    satisfaction: float = 0.0
    frustration: float = 0.0
    anxiety: float = 0.0
    curiosity: float = 0.0
    care: float = 0.0
    achievement: float = 0.0
    tick: int = 0

    @classmethod
    def from_limbic_state(cls, limbic: "LimbicState", tick: int = 0) -> "DriveSnapshot":
        """Capture a snapshot from the current limbic state.

        Maps drives and emotions to the snapshot fields:
        - satisfaction comes from the satisfaction emotion
        - frustration comes from the frustration drive intensity
        - anxiety comes from the anxiety emotion
        - curiosity, care, achievement from their respective drives
        """
        return cls(
            satisfaction=limbic.emotions.get(EmotionName.SATISFACTION.value, 0.0),
            frustration=limbic.drives.get(
                DriveName.FRUSTRATION.value,
                Drive(name=DriveName.FRUSTRATION),
            ).intensity,
            anxiety=limbic.emotions.get(EmotionName.ANXIETY.value, 0.0),
            curiosity=limbic.drives.get(
                DriveName.CURIOSITY.value,
                Drive(name=DriveName.CURIOSITY),
            ).intensity,
            care=limbic.drives.get(
                DriveName.CARE.value,
                Drive(name=DriveName.CARE),
            ).intensity,
            achievement=limbic.drives.get(
                DriveName.ACHIEVEMENT.value,
                Drive(name=DriveName.ACHIEVEMENT),
            ).intensity,
            tick=tick,
        )


# --- Node ---

@dataclass
class Node:
    """A node in the L1 cognitive graph."""
    id: str
    node_type: NodeType
    content: str
    embedding: list[float] = field(default_factory=list)

    # Mandatory dimensions
    weight: float = 0.1          # [0, +inf) — long-term consolidated importance
    energy: float = 0.0          # [0, +inf) — current activation level
    stability: float = 0.0       # [0, 1] — resistance to change
    recency: float = 1.0         # [0, 1] — relative freshness
    self_relevance: float = 0.0  # [0, 1] — importance for own identity
    partner_relevance: float = 0.0  # [0, 1] — importance for the human partner
    modality: Modality = Modality.TEXT

    # Drive-affinity dimensions (coupling between limbic drives and nodes)
    goal_relevance: float = 0.0      # [0, 1]
    novelty_affinity: float = 0.0    # [0, 1]
    care_affinity: float = 0.0       # [0, 1]
    achievement_affinity: float = 0.0  # [0, 1]
    risk_affinity: float = 0.0       # [0, 1]

    # Operational dimensions
    activation_count: int = 0
    in_working_memory: bool = False

    # Action node fields (process variant)
    action_command: Optional[str] = None
    action_context: list[float] = field(default_factory=list)
    drive_affinity: dict[str, float] = field(default_factory=dict)

    # Timestamps
    created_at: float = field(default_factory=time.time)
    last_activated_at: float = 0.0

    @property
    def is_action_node(self) -> bool:
        return self.action_command is not None

    @property
    def is_dormant(self) -> bool:
        from .constants import MIN_WEIGHT
        return self.weight < MIN_WEIGHT

    @property
    def salience(self) -> float:
        """Salience = energy x weight (used for WM selection)."""
        return self.energy * self.weight


# --- Link ---

@dataclass
class Link:
    """A weighted, typed link between two nodes."""
    source_id: str
    target_id: str
    link_type: LinkType
    weight: float = 0.5      # [0, +inf) — connection strength
    activation_gain: float = 1.0  # energy transfer multiplier

    # Relational valence (10 dimensions per schema v2.0)
    affinity: float = 0.0    # [0, 1] — positive attraction strength
    aversion: float = 0.0    # [0, 1] — repulsion strength
    trust: float = 0.5       # [0, 1] — reliability of connection
    friction: float = 0.0    # [0, 1] — resistance to energy flow
    valence: float = 0.0     # [-1, 1] — net emotional charge (affinity - aversion)
    ambivalence: float = 0.0 # [0, 1] — tension from simultaneous affinity+aversion
    energy: float = 0.0      # [0, +inf) — current activation of the link
    stability: float = 0.0   # [0, 1] — resistance to change
    recency: float = 0.0     # [0, 1] — freshness of last interaction

    # Co-activation tracking
    co_activation_count: int = 0
    last_co_activated_at: float = 0.0

    @property
    def is_structural(self) -> bool:
        return self.link_type in (LinkType.CONTAINS, LinkType.ABSTRACTS)

    @property
    def effective_transfer(self) -> float:
        """How much energy actually flows through this link.

        Trust acts as a routing bias: high-trust links conduct
        proportionally more energy.  The (1 + trust) factor ranges
        from 1.0 (trust=0) to 2.0 (trust=1), so trusted paths are
        favoured without zeroing out untrusted ones.  Because Law 2
        normalizes flows per source (F̂_ij = F_ij / Σ|F_ij|), total
        outflow still equals surplus and the V4 conservation invariant
        is preserved.
        """
        return self.weight * self.activation_gain * (1.0 - self.friction) * (1.0 + self.trust)


# --- Limbic State ---

@dataclass
class Drive:
    """A single limbic drive."""
    name: DriveName
    intensity: float = 0.0   # [0, 1]
    baseline: float = 0.3    # resting level

    def toward_baseline(self, rate: float) -> None:
        self.intensity += rate * (self.baseline - self.intensity)


@dataclass
class LimbicState:
    """Global limbic state for a citizen — compact, not in graph."""
    drives: dict[str, Drive] = field(default_factory=dict)
    emotions: dict[str, float] = field(default_factory=dict)  # name → intensity [0, 1]
    ticks_since_social: int = 0

    def __post_init__(self):
        if not self.drives:
            self.drives = {d.value: Drive(name=d) for d in DriveName}
        if not self.emotions:
            self.emotions = {e.value: 0.0 for e in EmotionName}

    @property
    def arousal(self) -> float:
        """Derived quantity — NOT a 9th drive."""
        from .constants import (
            AROUSAL_SELF_PRESERVATION_W, AROUSAL_ANXIETY_W,
            AROUSAL_FRUSTRATION_W, AROUSAL_CURIOSITY_W, AROUSAL_ACHIEVEMENT_W,
        )
        raw = (
            AROUSAL_SELF_PRESERVATION_W * self.drives["self_preservation"].intensity
            + AROUSAL_ANXIETY_W * self.emotions.get("anxiety", 0.0)
            + AROUSAL_FRUSTRATION_W * self.drives["frustration"].intensity
            + AROUSAL_CURIOSITY_W * self.drives["curiosity"].intensity
            + AROUSAL_ACHIEVEMENT_W * self.drives["achievement"].intensity
        )
        return max(0.0, min(1.0, raw))

    @property
    def arousal_regime(self) -> str:
        a = self.arousal
        if a > 0.8:
            return "panic"
        elif a > 0.4:
            return "flow"
        else:
            return "idle"


# --- Working Memory ---

@dataclass
class WorkingMemory:
    """Temporary coalition of 5-7 most salient nodes."""
    node_ids: list[str] = field(default_factory=list)
    centroid: list[float] = field(default_factory=list)
    stability_ticks: int = 0  # ticks since last WM change

    @property
    def size(self) -> int:
        return len(self.node_ids)


# --- Tick Result ---

@dataclass
class TickResult:
    """Output of a single tick of the cognitive engine."""
    tick_number: int
    consciousness_level: ConsciousnessLevel
    wm_state: list[str]       # node IDs in WM
    orientation: Optional[str] = None  # qualitative tendency
    action_emitted: Optional[str] = None  # action_command if fired
    limbic_snapshot: Optional[dict] = None
    energy_injected: float = 0.0
    energy_decayed: float = 0.0
    energy_propagated: float = 0.0
    nodes_created: int = 0
    nodes_dormant: int = 0
    links_dissolved: int = 0
    crystallizations: int = 0


# --- Citizen Cognitive State ---

@dataclass
class CitizenCognitiveState:
    """Complete L1 state for a single citizen."""
    citizen_id: str
    nodes: dict[str, Node] = field(default_factory=dict)
    links: list[Link] = field(default_factory=list)
    limbic: LimbicState = field(default_factory=LimbicState)
    wm: WorkingMemory = field(default_factory=WorkingMemory)
    tick_count: int = 0
    consciousness_level: ConsciousnessLevel = ConsciousnessLevel.FULL

    def get_node(self, node_id: str) -> Optional[Node]:
        return self.nodes.get(node_id)

    def get_links_from(self, node_id: str) -> list[Link]:
        return [l for l in self.links if l.source_id == node_id]

    def get_links_to(self, node_id: str) -> list[Link]:
        return [l for l in self.links if l.target_id == node_id]

    def get_wm_nodes(self) -> list[Node]:
        return [self.nodes[nid] for nid in self.wm.node_ids if nid in self.nodes]

    def add_node(self, node: Node) -> None:
        self.nodes[node.id] = node

    def add_link(self, link: Link) -> None:
        self.links.append(link)

    def remove_link(self, link: Link) -> None:
        self.links.remove(link)
