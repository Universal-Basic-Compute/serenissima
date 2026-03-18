"""
Law 12 — Tick Loop (L1 Cognitive Engine Runner)

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md  section Law 12

Orchestrates all 21 physics laws in the correct order per tick.
Each tick: inject -> propagate -> decay -> select -> reinforce ->
inhibit -> consolidate -> forget -> limbic -> orient -> consume.

The tick runner works even when law implementations are missing.
Stub fallbacks absorb ImportError so other agents can develop laws
independently.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional

from .constants import (
    ACTION_THRESHOLD,
    ACTIVATION_THRESHOLD,
    ANXIETY_COUPLING_RATE,
    ANXIETY_FRUSTRATION_COUPLING,
    ANXIETY_FRUSTRATION_TRIGGER,
    ANXIETY_SELF_PRESERVATION_COUPLING,
    ANXIETY_TRUSTED_STABILITY_THRESHOLD,
    ANXIETY_TRUSTED_WEIGHT_THRESHOLD,
    BOREDOM_REPETITION_COEFF,
    BOREDOM_STAGNATION_COEFF,
    BOREDOM_NOVELTY_RELIEF,
    BOREDOM_PROGRESS_RELIEF,
    CONSOLIDATION_INTERVAL,
    DECAY_RATE,
    DESIRE_ACTIVATION_THRESHOLD,
    DESIRE_CONSUMPTION_RATE,
    DESIRE_IGNITION_BOOST,
    DRIVE_DECAY,
    DRIVE_MAX,
    FORGETTING_INTERVAL,
    FRUSTRATION_FAILURE_COEFF,
    FRUSTRATION_RESOLUTION_RELIEF,
    GENERAL_CONSUMPTION_RATE,
    IMPULSE_ACCUMULATION_RATE,
    IMPULSE_CONTEXT_THRESHOLD,
    IMPULSE_DECAY,
    IMPULSE_DRIVE_THRESHOLD,
    INHIBITION_STRENGTH,
    LEARNING_RATE,
    LINK_MIN_WEIGHT,
    LONG_TERM_DECAY,
    MIN_WEIGHT,
    ORIENTATION_STABILITY_TICKS,
    PROCESS_CONSUMPTION_RATE,
    SATISFACTION_BASELINE,
    SATISFACTION_DECAY_RATE,
    SOLITUDE_DECAY,
    SOLITUDE_RATE,
    SOLITUDE_SCALE,
    SOLITUDE_THRESHOLD,
    STAGNATION_WINDOW,
)
from .models import (
    CitizenCognitiveState,
    ConsciousnessLevel,
    DriveSnapshot,
    LinkType,
    Node,
    NodeType,
    TickResult,
)
from .trust import compute_limbic_delta


# =========================================================================
# Stimulus — lightweight carrier for external/internal input
# =========================================================================

@dataclass
class Stimulus:
    """An external or internal event that injects energy into the graph."""
    content: str
    energy_budget: float = 1.0
    embedding: list[float] = field(default_factory=list)
    target_node_ids: list[str] = field(default_factory=list)
    is_social: bool = False
    is_failure: bool = False
    is_novelty: bool = False
    is_progress: bool = False
    source: str = "external"  # "external" | "self" | "system"
    timestamp: float = field(default_factory=time.time)


# =========================================================================
# Try-import pattern: pull law functions from sibling modules.
# If a law module is not implemented yet, a stub fills in.
# =========================================================================

try:
    from .laws.law_02_propagation import propagate_energy
except ImportError:
    def propagate_energy(state):  # type: ignore[misc]
        _NullResult = type("R", (), {"energy_propagated": 0.0})
        return _NullResult()

try:
    from .laws.law_03_energy_decay import decay_energy
except ImportError:
    def decay_energy(state):  # type: ignore[misc]
        _NullResult = type("R", (), {"energy_decayed": 0.0})
        return _NullResult()

try:
    from .laws.law_04_attentional_competition import select_working_memory
except ImportError:
    def select_working_memory(state):  # type: ignore[misc]
        _NullResult = type("R", (), {
            "selected_ids": [],
            "wm_changed": False,
            "stability_ticks": 0,
        })
        return _NullResult()

try:
    from .laws.law_06_consolidation import consolidate
except ImportError:
    def consolidate(state, tick, **kw):  # type: ignore[misc]
        _NullResult = type("R", (), {
            "nodes_consolidated": [],
            "total_weight_added": 0.0,
        })
        return _NullResult()

# Laws that may or may not exist yet ------

try:
    from .laws.law_01_energy_injection import inject_energy  # type: ignore[import-not-found]
except ImportError:
    inject_energy = None  # handled inline

try:
    from .laws.law_05_coactivation import reinforce_coactivation  # type: ignore[import-not-found]
except ImportError:
    reinforce_coactivation = None

try:
    from .laws.law_07_forgetting import forget  # type: ignore[import-not-found]
except ImportError:
    forget = None

try:
    from .laws.law_08_compatibility import compatibility  # type: ignore[import-not-found]
except ImportError:
    compatibility = None

try:
    from .laws.law_09_inhibition import inhibit  # type: ignore[import-not-found]
except ImportError:
    inhibit = None

try:
    from .laws.law_10_crystallization import crystallize  # type: ignore[import-not-found]
except ImportError:
    crystallize = None


# =========================================================================
# Orientation (Law 11) — implemented directly in tick runner per task spec
# =========================================================================

# Possible qualitative orientations.
ORIENTATIONS = (
    "explore", "create", "care", "verify", "rest", "socialize", "act",
)

# Mapping from node types + drive affinities to orientation candidates.
_TYPE_ORIENTATION_MAP: dict[NodeType, str] = {
    NodeType.DESIRE: "act",
    NodeType.PROCESS: "act",
    NodeType.CONCEPT: "explore",
    NodeType.NARRATIVE: "create",
    NodeType.VALUE: "verify",
    NodeType.STATE: "rest",
    NodeType.MEMORY: "explore",
}

_DRIVE_ORIENTATION_MAP: dict[str, str] = {
    "curiosity": "explore",
    "care": "care",
    "achievement": "act",
    "novelty_hunger": "explore",
    "frustration": "verify",
    "affiliation": "socialize",
    "rest_regulation": "rest",
    "self_preservation": "verify",
}


def _compute_orientation(state: CitizenCognitiveState) -> Optional[str]:
    """Derive a qualitative orientation from WM contents + limbic state.

    The spec (Law 11) says:
        orientation = weighted_sum(desires, values, narratives, states in WM)
        Qualitative tendencies: explore, create, care, verify, rest, socialize, act

    Implementation: tally votes from WM node types and active drives,
    weighted by energy.  Highest-scoring tendency wins.
    """
    wm_nodes = state.get_wm_nodes()
    if not wm_nodes:
        return None

    scores: dict[str, float] = {o: 0.0 for o in ORIENTATIONS}

    # --- votes from WM node types (weighted by energy) ---
    for node in wm_nodes:
        orientation = _TYPE_ORIENTATION_MAP.get(node.node_type, "explore")
        scores[orientation] += node.energy * node.weight

        # Drive-affinity voting
        if node.care_affinity > 0.3:
            scores["care"] += node.energy * node.care_affinity
        if node.novelty_affinity > 0.3:
            scores["explore"] += node.energy * node.novelty_affinity
        if node.achievement_affinity > 0.3:
            scores["act"] += node.energy * node.achievement_affinity
        if node.goal_relevance > 0.3:
            scores["act"] += node.energy * node.goal_relevance

    # --- votes from limbic drives ---
    for drive_name, drive in state.limbic.drives.items():
        if drive.intensity < 0.1:
            continue
        orientation = _DRIVE_ORIENTATION_MAP.get(drive_name, "explore")
        scores[orientation] += drive.intensity * 0.5

    # --- emotion modulation ---
    boredom = state.limbic.emotions.get("boredom", 0.0)
    solitude = state.limbic.emotions.get("solitude", 0.0)
    satisfaction = state.limbic.emotions.get("satisfaction", 0.0)

    if boredom > 0.4:
        scores["explore"] += boredom * 0.8
    if solitude > 0.4:
        scores["socialize"] += solitude * 0.8
    if satisfaction > 0.6:
        scores["rest"] += satisfaction * 0.3

    # Winner takes all
    best = max(scores, key=lambda k: scores[k])
    if scores[best] < 0.01:
        return None
    return best


# =========================================================================
# Tick Runner
# =========================================================================

class L1CognitiveTickRunner:
    """Orchestrates all L1 physics laws per tick.

    Usage::

        runner = L1CognitiveTickRunner(citizen_state)
        result = runner.run_tick()                   # one tick, no stimulus
        result = runner.run_tick(stimulus=some_stim) # one tick with stimulus
        results = runner.run_ticks(100)              # 100 ticks
    """

    def __init__(self, state: CitizenCognitiveState) -> None:
        self.state = state
        self.tick_count: int = state.tick_count

        # Orientation stability tracking
        self._current_orientation: Optional[str] = None
        self._orientation_stable_ticks: int = 0

        # WM history for boredom / stagnation detection
        self._wm_history: list[set[str]] = []

        # Failure counter for frustration
        self._recent_failures: int = 0
        self._failure_tick_window: list[int] = []

        # DriveSnapshot tracking for limbic delta computation (Trust Phase T2).
        # _drives_after from the previous tick becomes _drives_before for the next.
        self._drives_before: Optional[DriveSnapshot] = None
        self._drives_after: Optional[DriveSnapshot] = None

    # ------------------------------------------------------------------
    # Step helpers (private)
    # ------------------------------------------------------------------

    def _step_inject(self, stimulus: Optional[Stimulus]) -> float:
        """Law 1: inject energy from stimulus into targeted nodes."""
        if stimulus is None:
            return 0.0

        # Track social stimuli for solitude
        if stimulus.is_social:
            self.state.limbic.ticks_since_social = 0

        # Track failures for frustration
        if stimulus.is_failure:
            self._recent_failures += 1
            self._failure_tick_window.append(self.tick_count)

        # If a full Law 1 implementation exists, delegate.
        if inject_energy is not None:
            try:
                result = inject_energy(self.state, stimulus, self.tick_count)
                return getattr(result, "energy_injected", stimulus.energy_budget)
            except Exception:
                pass

        # Minimal kernel fallback: distribute budget to targeted nodes.
        energy_injected = 0.0

        if stimulus.target_node_ids:
            targets = stimulus.target_node_ids
        else:
            # If no explicit targets, spread to all nodes (uniform).
            targets = list(self.state.nodes.keys())

        if not targets:
            return 0.0

        share = stimulus.energy_budget / len(targets)
        for nid in targets:
            node = self.state.get_node(nid)
            if node is None:
                continue
            node.energy += share
            node.activation_count += 1
            node.last_activated_at = time.time()
            energy_injected += share

        return energy_injected

    def _step_propagate(self) -> float:
        """Law 2: spread energy through links."""
        result = propagate_energy(self.state)
        return result.energy_propagated

    def _step_decay(self) -> float:
        """Law 3: energy decay per tick."""
        result = decay_energy(self.state)
        return result.energy_decayed

    def _step_select(self) -> list[str]:
        """Law 4 + Law 13: attentional competition with inertia moat."""
        result = select_working_memory(self.state)
        return result.selected_ids

    def _step_reinforce(self) -> None:
        """Law 5: co-activation link strengthening (Hebb's law).

        If the full law_05 module exists, delegate. Otherwise run
        inline minimal kernel: links between WM co-active nodes get
        a weight bump.
        """
        if reinforce_coactivation is not None:
            try:
                reinforce_coactivation(self.state)
                return
            except Exception:
                pass

        # Minimal inline Hebb: strengthen links between WM-active nodes.
        wm_set = set(self.state.wm.node_ids)
        if len(wm_set) < 2:
            return

        for link in self.state.links:
            if link.source_id in wm_set and link.target_id in wm_set:
                src = self.state.get_node(link.source_id)
                tgt = self.state.get_node(link.target_id)
                if src is None or tgt is None:
                    continue
                if src.energy < ACTIVATION_THRESHOLD or tgt.energy < ACTIVATION_THRESHOLD:
                    continue
                coact = min(src.energy, tgt.energy)
                link.weight += LEARNING_RATE * coact
                link.co_activation_count += 1
                link.last_co_activated_at = time.time()

    def _step_inhibit(self) -> None:
        """Law 9: conflict suppression between co-active contradictory nodes.

        If law_09 module exists, delegate. Otherwise inline minimal kernel.
        """
        if inhibit is not None:
            try:
                inhibit(self.state)
                return
            except Exception:
                pass

        # Minimal inline: reduce energy of the weaker side of conflicts_with links.
        wm_set = set(self.state.wm.node_ids)
        for link in self.state.links:
            if link.link_type != LinkType.CONFLICTS_WITH:
                continue
            src = self.state.get_node(link.source_id)
            tgt = self.state.get_node(link.target_id)
            if src is None or tgt is None:
                continue
            if src.energy < ACTIVATION_THRESHOLD or tgt.energy < ACTIVATION_THRESHOLD:
                continue
            # The weaker node gets inhibited.
            if src.energy <= tgt.energy:
                src.energy = max(0.0, src.energy - INHIBITION_STRENGTH * link.weight)
            else:
                tgt.energy = max(0.0, tgt.energy - INHIBITION_STRENGTH * link.weight)

    def _step_consolidate(self) -> None:
        """Law 6: utility-gated weight update (every CONSOLIDATION_INTERVAL ticks)."""
        consolidate(self.state, self.tick_count)

    def _step_forget(self) -> int:
        """Law 7: weight decay and link dissolution (every FORGETTING_INTERVAL ticks).

        Returns the number of links dissolved.
        """
        if self.tick_count % FORGETTING_INTERVAL != 0:
            return 0

        if forget is not None:
            try:
                result = forget(self.state, self.tick_count)
                return getattr(result, "links_dissolved", 0)
            except Exception:
                pass

        # Minimal inline forgetting kernel.
        links_dissolved = 0

        # Node weight decay (stability-modulated)
        for node in self.state.nodes.values():
            effective_decay = LONG_TERM_DECAY * (1.0 - node.stability * 0.9)
            # Identity nodes (value, core narrative) decay slower
            if node.node_type == NodeType.VALUE:
                effective_decay *= 0.25
            elif node.node_type == NodeType.NARRATIVE and node.self_relevance > 0.5:
                effective_decay *= 0.25

            node.weight *= (1.0 - effective_decay)

            # Clamp weight to non-negative
            if node.weight < 0.0:
                node.weight = 0.0

        # Link weight decay and dissolution
        surviving_links: list = []
        for link in self.state.links:
            link.weight *= (1.0 - LONG_TERM_DECAY)
            if link.weight < 0.0:
                link.weight = 0.0

            if link.weight < LINK_MIN_WEIGHT and not link.is_structural:
                links_dissolved += 1
            else:
                surviving_links.append(link)

        self.state.links = surviving_links
        return links_dissolved

    def _step_limbic(self, stimulus: Optional[Stimulus]) -> None:
        """Laws 13-18: drive/emotion updates, desire activation, impulse accumulation.

        This is the combined limbic update covering:
          - Drive decay toward baseline (all drives)
          - Boredom update (Law 15)
          - Frustration update (Law 16)
          - Anxiety coupling (Phase H calibration)
          - Satisfaction decay (Phase H calibration)
          - Solitude update (Law 15 companion)
          - Desire activation (Law 17)
          - Impulse accumulation (Law 17 extension)
        """
        limbic = self.state.limbic

        # --- Drive decay toward baseline ---
        for drive in limbic.drives.values():
            drive.toward_baseline(DRIVE_DECAY)
            drive.intensity = max(0.0, min(DRIVE_MAX, drive.intensity))

        # --- Boredom (Law 15) ---
        self._step_boredom(stimulus)

        # --- Frustration (Law 16) ---
        self._step_frustration(stimulus)

        # --- Anxiety coupling (Phase H) ---
        self._step_anxiety()

        # --- Satisfaction decay (Phase H) ---
        self._step_satisfaction_decay()

        # --- Solitude (Law 15 companion) ---
        self._step_solitude()

        # --- Desire activation (Law 17) ---
        self._step_desire_activation()

        # --- Impulse accumulation (Law 17 extension) ---
        self._step_impulse_accumulation()

        # --- Clamp all emotions ---
        for emotion_name in list(limbic.emotions.keys()):
            limbic.emotions[emotion_name] = max(
                0.0, min(1.0, limbic.emotions[emotion_name])
            )

    def _step_boredom(self, stimulus: Optional[Stimulus]) -> None:
        """Law 15: stagnation detection -> novelty push."""
        limbic = self.state.limbic
        boredom = limbic.emotions.get("boredom", 0.0)

        # Record WM state for stagnation detection
        current_wm = set(self.state.wm.node_ids)
        self._wm_history.append(current_wm)
        if len(self._wm_history) > STAGNATION_WINDOW:
            self._wm_history = self._wm_history[-STAGNATION_WINDOW:]

        # Repetition: Jaccard similarity of WM across recent ticks
        repetition_score = 0.0
        if len(self._wm_history) >= 2 and current_wm:
            similarities = []
            for prev_wm in self._wm_history[:-1]:
                if not prev_wm and not current_wm:
                    similarities.append(1.0)
                elif not prev_wm or not current_wm:
                    similarities.append(0.0)
                else:
                    intersection = len(current_wm & prev_wm)
                    union = len(current_wm | prev_wm)
                    similarities.append(intersection / union if union > 0 else 0.0)
            repetition_score = sum(similarities) / len(similarities) if similarities else 0.0

        # Stagnation: how long WM has been stable
        stagnation_score = min(1.0, self.state.wm.stability_ticks / STAGNATION_WINDOW)

        # Novelty: did we get a novel stimulus?
        novelty_score = 0.0
        if stimulus is not None and stimulus.is_novelty:
            novelty_score = 1.0

        # Progress: did we make progress?
        progress_score = 0.0
        if stimulus is not None and stimulus.is_progress:
            progress_score = 1.0

        # Update boredom
        delta = (
            BOREDOM_REPETITION_COEFF * repetition_score
            + BOREDOM_STAGNATION_COEFF * stagnation_score
            - BOREDOM_NOVELTY_RELIEF * novelty_score
            - BOREDOM_PROGRESS_RELIEF * progress_score
        )
        boredom += delta
        boredom = max(0.0, min(1.0, boredom))

        limbic.emotions["boredom"] = boredom

        # Boredom feeds curiosity and novelty_hunger
        if boredom > 0.4:
            curiosity = limbic.drives.get("curiosity")
            if curiosity is not None:
                curiosity.intensity = min(DRIVE_MAX, curiosity.intensity + 0.02 * boredom)
            novelty = limbic.drives.get("novelty_hunger")
            if novelty is not None:
                novelty.intensity = min(DRIVE_MAX, novelty.intensity + 0.02 * boredom)

    def _step_frustration(self, stimulus: Optional[Stimulus]) -> None:
        """Law 16: blockage detection -> escalation/avoidance."""
        limbic = self.state.limbic

        # Clean up old failures outside the window
        from .constants import FAILURE_WINDOW
        cutoff = self.tick_count - FAILURE_WINDOW
        self._failure_tick_window = [t for t in self._failure_tick_window if t > cutoff]

        failure_count = len(self._failure_tick_window)
        frustration = limbic.emotions.get("frustration", 0.0) if "frustration" in limbic.emotions else 0.0

        # Resolution relief if we got progress
        resolution = 0.0
        if stimulus is not None and stimulus.is_progress:
            resolution = 1.0

        delta = (
            FRUSTRATION_FAILURE_COEFF * failure_count
            - FRUSTRATION_RESOLUTION_RELIEF * resolution
        )
        frustration += delta
        frustration = max(0.0, min(1.0, frustration))

        limbic.emotions["frustration"] = frustration

        # Frustration feeds the frustration drive
        fru_drive = limbic.drives.get("frustration")
        if fru_drive is not None:
            fru_drive.intensity = max(fru_drive.intensity, frustration * 0.8)

    def _step_anxiety(self) -> None:
        """Phase H: anxiety coupling to absence of trusted node activation.

        Anxiety rises when:
        - Novelty is high (unfamiliar context)
        - Trusted nodes (weight > threshold, stability > threshold) are NOT in WM
        - Self-preservation drive is elevated
        - Sustained frustration feeds anxiety

        Spec: docs/l1_wiring/ALGORITHM_L1_Wiring.md Section 9.2
        """
        limbic = self.state.limbic
        anxiety = limbic.emotions.get("anxiety", 0.0)

        wm_nodes = self.state.get_wm_nodes()

        # Count trusted nodes in WM
        trusted_in_wm = sum(
            1 for n in wm_nodes
            if n.weight > ANXIETY_TRUSTED_WEIGHT_THRESHOLD
            and n.stability > ANXIETY_TRUSTED_STABILITY_THRESHOLD
        )
        trusted_ratio = trusted_in_wm / max(len(wm_nodes), 1)

        # Novelty factor: mean novelty_affinity of WM nodes
        novelty_factor = (
            sum(n.novelty_affinity for n in wm_nodes) / max(len(wm_nodes), 1)
            if wm_nodes else 0.0
        )

        # Self-preservation drive coupling
        sp_drive = limbic.drives.get("self_preservation")
        sp_intensity = sp_drive.intensity if sp_drive else 0.0

        # Frustration coupling
        frustration = limbic.emotions.get("frustration", 0.0)
        frustration_feed = (
            ANXIETY_FRUSTRATION_COUPLING
            if frustration > ANXIETY_FRUSTRATION_TRIGGER
            else 0.0
        )

        # Compute anxiety input
        anxiety_input = (
            novelty_factor * (1.0 - trusted_ratio)
            + sp_intensity * ANXIETY_SELF_PRESERVATION_COUPLING
            + frustration_feed
        )

        # Lerp toward anxiety_input (smooth coupling)
        anxiety = anxiety + (anxiety_input - anxiety) * ANXIETY_COUPLING_RATE
        anxiety = max(0.0, min(1.0, anxiety))

        limbic.emotions["anxiety"] = anxiety

    def _step_satisfaction_decay(self) -> None:
        """Phase H: satisfaction decays toward baseline unless reinforced.

        Satisfaction spikes come from task completion, positive feedback,
        or desire fulfillment (handled by feedback_injector).
        This step handles the per-tick decay back toward baseline.

        Spec: docs/l1_wiring/ALGORITHM_L1_Wiring.md Section 9.3
        """
        limbic = self.state.limbic
        satisfaction = limbic.emotions.get("satisfaction", 0.0)

        # Decay toward baseline
        satisfaction = satisfaction + (SATISFACTION_BASELINE - satisfaction) * SATISFACTION_DECAY_RATE

        limbic.emotions["satisfaction"] = max(0.0, min(1.0, satisfaction))

    def _step_solitude(self) -> None:
        """Law 15 companion: social stagnation -> affiliation push."""
        limbic = self.state.limbic
        limbic.ticks_since_social += 1

        solitude = limbic.emotions.get("solitude", 0.0)

        if limbic.ticks_since_social > SOLITUDE_THRESHOLD:
            excess = limbic.ticks_since_social - SOLITUDE_THRESHOLD
            solitude += SOLITUDE_RATE * excess / SOLITUDE_SCALE
        else:
            solitude *= SOLITUDE_DECAY

        solitude = max(0.0, min(1.0, solitude))
        limbic.emotions["solitude"] = solitude

        # Solitude feeds affiliation
        if solitude > 0.3:
            affiliation = limbic.drives.get("affiliation")
            if affiliation is not None:
                affiliation.intensity = min(
                    DRIVE_MAX,
                    affiliation.intensity + 0.1 * solitude,
                )

    def _step_desire_activation(self) -> None:
        """Law 17: latent desire activation when conditions align."""
        wm_node_count = len(self.state.wm.node_ids)
        cognitive_load = wm_node_count / 7.0  # normalized to WM capacity
        cognitive_load_inverse = max(0.0, 1.0 - cognitive_load)

        for node in self.state.nodes.values():
            if node.node_type != NodeType.DESIRE:
                continue
            if node.energy >= ACTIVATION_THRESHOLD:
                continue  # already active

            # Compute activation check (simplified Law 17)
            limbic_alignment = 0.0
            for drive_name, affinity_val in node.drive_affinity.items():
                drive = self.state.limbic.drives.get(drive_name)
                if drive is not None:
                    limbic_alignment += drive.intensity * affinity_val

            activation_check = (
                node.weight
                * max(0.1, limbic_alignment)
                * cognitive_load_inverse
            )

            if activation_check > DESIRE_ACTIVATION_THRESHOLD:
                node.energy += DESIRE_IGNITION_BOOST

    def _step_impulse_accumulation(self) -> None:
        """Law 17 extension: action nodes accumulate energy from drive pressure."""
        for node in self.state.nodes.values():
            if not node.is_action_node:
                continue

            # Drive pressure
            drive_pressure = 0.0
            for drive_name, affinity_val in node.drive_affinity.items():
                drive = self.state.limbic.drives.get(drive_name)
                if drive is not None:
                    drive_pressure += drive.intensity * affinity_val

            # Context match (simplified: use node's achievement_affinity as proxy)
            context_match = node.goal_relevance if node.goal_relevance > 0 else 0.5

            if (drive_pressure > IMPULSE_DRIVE_THRESHOLD
                    and context_match > IMPULSE_CONTEXT_THRESHOLD):
                node.energy += IMPULSE_ACCUMULATION_RATE * drive_pressure * context_match
            else:
                node.energy *= IMPULSE_DECAY

    def _step_trust_update(self, limbic_delta: Optional[float]) -> None:
        """Law 18: relational valence and trust update on co-active links.

        Phase T1/T2 integration: when limbic_delta is available (computed
        from DriveSnapshot comparison), it replaces the placeholder 0.1
        heuristic for trust/friction updates on co-active links.

        Delegates to the law_18_relational_valence module.
        """
        from .laws.law_18_relational_valence import update_relational_valence

        update_relational_valence(
            self.state,
            interaction_signals=None,
            limbic_delta=limbic_delta,
        )

    def _step_orient(self) -> Optional[str]:
        """Law 11: compute orientation from WM state.

        Orientation must be stable for ORIENTATION_STABILITY_TICKS before
        being emitted.
        """
        new_orientation = _compute_orientation(self.state)

        if new_orientation == self._current_orientation:
            self._orientation_stable_ticks += 1
        else:
            self._current_orientation = new_orientation
            self._orientation_stable_ticks = 1

        if self._orientation_stable_ticks >= ORIENTATION_STABILITY_TICKS:
            return self._current_orientation
        return None

    def _step_emit(self, orientation: Optional[str]) -> Optional[str]:
        """Check if an action node in WM should fire.

        Returns the action_command if an action node has energy > ACTION_THRESHOLD
        and orientation is stable, else None.
        """
        if orientation is None:
            return None

        for node in self.state.get_wm_nodes():
            if node.is_action_node and node.energy > ACTION_THRESHOLD:
                return node.action_command

        return None

    def _step_consume(self, action_emitted: Optional[str]) -> None:
        """Consume energy from nodes that drove the emitted action.

        Spec (Law 12 step 17):
          - desire nodes:  energy *= DESIRE_CONSUMPTION_RATE   (0.3)
          - process nodes: energy *= PROCESS_CONSUMPTION_RATE  (0.5)
          - other:         energy *= GENERAL_CONSUMPTION_RATE  (0.7)
        """
        if action_emitted is None:
            return

        for node in self.state.get_wm_nodes():
            if node.node_type == NodeType.DESIRE:
                node.energy *= DESIRE_CONSUMPTION_RATE
            elif node.node_type == NodeType.PROCESS:
                node.energy *= PROCESS_CONSUMPTION_RATE
            else:
                node.energy *= GENERAL_CONSUMPTION_RATE

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_tick(self, stimulus: Optional[Stimulus] = None) -> TickResult:
        """Execute one complete tick of the L1 cognitive engine.

        Tick order (from spec Law 12):
          1.  INJECT       — Law 1
          2.  PROPAGATE    — Law 2
          3.  DECAY        — Law 3
          4.  SELECT       — Law 4 + Law 13 (moat)
          5.  REINFORCE    — Law 5
          6.  INHIBIT      — Law 9
          7.  CONSOLIDATE  — Law 6  (every CONSOLIDATION_INTERVAL ticks)
          8.  FORGET       — Law 7  (every FORGETTING_INTERVAL ticks)
          9.  LIMBIC       — Laws 13-18
         10.  ORIENT       — Law 11
         11.  CONSUME      — energy consumed by acted-upon nodes
        """
        self.tick_count += 1
        self.state.tick_count = self.tick_count

        # --- DriveSnapshot BEFORE (Trust Phase T2) ---
        # Use _drives_after from the previous tick as this tick's "before".
        # On the very first tick, capture fresh.
        if self._drives_after is not None:
            self._drives_before = self._drives_after
        else:
            self._drives_before = DriveSnapshot.from_limbic_state(
                self.state.limbic, self.tick_count
            )

        # 1. INJECT
        energy_injected = self._step_inject(stimulus)

        # 2. PROPAGATE
        energy_propagated = self._step_propagate()

        # 3. DECAY
        energy_decayed = self._step_decay()

        # 4. SELECT (WM competition with moat)
        wm_state = self._step_select()

        # 5. REINFORCE (co-activation)
        self._step_reinforce()

        # 6. INHIBIT (conflict suppression)
        self._step_inhibit()

        # 7. CONSOLIDATE (every N ticks)
        self._step_consolidate()

        # 8. FORGET (every N ticks)
        links_dissolved = self._step_forget()

        # 9. LIMBIC (drives, boredom, frustration, desire, impulse — Laws 13-17)
        self._step_limbic(stimulus)

        # --- DriveSnapshot AFTER (Trust Phase T2) ---
        self._drives_after = DriveSnapshot.from_limbic_state(
            self.state.limbic, self.tick_count
        )

        # Compute limbic delta for this tick
        tick_limbic_delta: Optional[float] = None
        if self._drives_before is not None:
            tick_limbic_delta = compute_limbic_delta(
                self._drives_before, self._drives_after
            )

        # 9b. Law 18 — Relational valence + trust update on co-active links.
        # Uses the real limbic delta (Phase T1/T2) when available.
        self._step_trust_update(tick_limbic_delta)

        # 10. ORIENT
        orientation = self._step_orient()

        # 11. EMIT + CONSUME
        action_emitted = self._step_emit(orientation)
        self._step_consume(action_emitted)

        # Count dormant nodes
        nodes_dormant = sum(
            1 for n in self.state.nodes.values() if n.weight < MIN_WEIGHT
        )

        # Build limbic snapshot
        limbic_snapshot = {
            "drives": {
                name: drive.intensity
                for name, drive in self.state.limbic.drives.items()
            },
            "emotions": dict(self.state.limbic.emotions),
            "arousal": self.state.limbic.arousal,
            "arousal_regime": self.state.limbic.arousal_regime,
        }

        return TickResult(
            tick_number=self.tick_count,
            consciousness_level=self.state.consciousness_level,
            wm_state=list(wm_state),
            orientation=orientation,
            action_emitted=action_emitted,
            limbic_snapshot=limbic_snapshot,
            energy_injected=energy_injected,
            energy_decayed=energy_decayed,
            energy_propagated=energy_propagated,
            nodes_dormant=nodes_dormant,
            links_dissolved=links_dissolved,
        )

    def run_ticks(
        self,
        n: int,
        stimuli: Optional[dict[int, Stimulus]] = None,
    ) -> list[TickResult]:
        """Run *n* ticks, optionally injecting stimuli at specific tick offsets.

        Parameters
        ----------
        n : int
            Number of ticks to execute.
        stimuli : dict[int, Stimulus] | None
            Mapping of relative tick offset (1-based) to stimulus.
            E.g. ``{1: stim_a, 5: stim_b}`` injects *stim_a* at the 1st
            tick and *stim_b* at the 5th tick of this batch.

        Returns
        -------
        list[TickResult]
            One result per tick.
        """
        results: list[TickResult] = []
        for i in range(1, n + 1):
            stimulus = stimuli.get(i) if stimuli else None
            results.append(self.run_tick(stimulus=stimulus))
        return results
