"""
Laws 13-18 — Limbic Engine (Drive Modulation, Boredom, Frustration, Desire, Valence)

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md § Laws 13-18

The limbic engine runs every tick and updates the global limbic state
(drives, emotions) based on graph activity. It couples the emotional
substrate to the cognitive graph — without this layer, the agent is
intelligent but not alive.

Law 13 — Attentional Inertia: Drive baselines decay toward resting levels.
         The moat formula lives in Law 4 (selection); here we maintain the
         drive intensities that feed it.

Law 14 — Global Limbic Modulation: Drives modulate node energy. Curiosity
         responds to prediction error with competence gating.

Law 15 — Boredom by Stagnation: WM repetition/stagnation increases boredom;
         novelty and progress relieve it.

Law 15b — Solitude: Social absence increases solitude, which boosts the
          affiliation drive.

Law 16 — Frustration by Blockage: Repeated failures increase frustration;
         resolution relieves it.

Law 17 — Latent Desire Activation + Impulse Accumulation: Dormant desires
         ignite when context aligns. Action nodes accumulate energy under
         sustained drive pressure.

Law 18 — Relational Valence Update: Co-active link valence evolves based
         on experience signals.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from ..constants import (
    AFFINITY_LEARNING_RATE,
    BOREDOM_NOVELTY_RELIEF,
    BOREDOM_PROGRESS_RELIEF,
    BOREDOM_REPETITION_COEFF,
    BOREDOM_STAGNATION_COEFF,
    DESIRE_ACTIVATION_THRESHOLD,
    DESIRE_IGNITION_BOOST,
    DRIVE_DECAY,
    DRIVE_MAX,
    FAILURE_WINDOW,
    FRUSTRATION_FAILURE_COEFF,
    FRUSTRATION_RESOLUTION_RELIEF,
    IMPULSE_ACCUMULATION_RATE,
    IMPULSE_CONTEXT_THRESHOLD,
    IMPULSE_DECAY,
    IMPULSE_DRIVE_THRESHOLD,
    SOLITUDE_DECAY,
    SOLITUDE_RATE,
    SOLITUDE_SCALE,
    SOLITUDE_THRESHOLD,
    STAGNATION_WINDOW,
)
from ..models import (
    CitizenCognitiveState,
    DriveName,
    EmotionName,
    Link,
    Node,
    NodeType,
)


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class LimbicUpdateResult:
    """Output of a single limbic engine tick."""

    drives_updated: dict[str, float] = field(default_factory=dict)
    emotions_updated: dict[str, float] = field(default_factory=dict)
    desires_ignited: int = 0
    action_impulses_accumulated: int = 0


# ---------------------------------------------------------------------------
# WM history tracker (module-level, keyed by citizen_id)
# ---------------------------------------------------------------------------

# Maps citizen_id -> deque of recent WM node-id frozensets.
# Retained across ticks so the stagnation window has memory.
_wm_history: dict[str, deque[frozenset[str]]] = {}

# Maps citizen_id -> deque of recent tick numbers where a failure occurred.
_failure_history: dict[str, deque[int]] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors. Returns 0.0 on degenerate input."""
    if not a or not b or len(a) != len(b):
        return 0.0
    a_arr = np.asarray(a, dtype=np.float64)
    b_arr = np.asarray(b, dtype=np.float64)
    norm_a = np.linalg.norm(a_arr)
    norm_b = np.linalg.norm(b_arr)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))


def _get_drive_affinity_for_node(drive_name: str, node: Node) -> float:
    """Read the drive-affinity score for *drive_name* from *node*.

    Nodes carry drive affinity in two places:
      1. Named per-drive fields (novelty_affinity, care_affinity, etc.)
      2. The generic ``drive_affinity`` dict (used by action nodes)

    We check the dict first (most specific), then fall back to the named
    fields.
    """
    # Generic dict takes precedence.
    if node.drive_affinity and drive_name in node.drive_affinity:
        return node.drive_affinity[drive_name]

    _field_map: dict[str, str] = {
        DriveName.CURIOSITY.value: "novelty_affinity",
        DriveName.NOVELTY_HUNGER.value: "novelty_affinity",
        DriveName.CARE.value: "care_affinity",
        DriveName.ACHIEVEMENT.value: "achievement_affinity",
        DriveName.SELF_PRESERVATION.value: "risk_affinity",
    }
    attr = _field_map.get(drive_name)
    if attr is not None:
        return getattr(node, attr, 0.0)
    return 0.0


def _wm_jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    """Jaccard similarity between two sets of node IDs."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _detect_novel_node_entered_wm(
    current_wm: frozenset[str],
    history: deque[frozenset[str]],
) -> bool:
    """Return True if *current_wm* contains at least one node not seen in any
    previous snapshot in *history*.
    """
    if not history:
        # First tick — everything is novel.
        return bool(current_wm)
    all_previous = frozenset().union(*history)
    return bool(current_wm - all_previous)


# ---------------------------------------------------------------------------
# Individual law implementations
# ---------------------------------------------------------------------------


def _law_13_drive_inertia(state: CitizenCognitiveState) -> dict[str, float]:
    """Law 13 — All drives decay toward their baseline. Cap at DRIVE_MAX.

    Returns a dict mapping drive name -> new intensity (for reporting).
    """
    changes: dict[str, float] = {}
    for drive in state.limbic.drives.values():
        old = drive.intensity
        drive.toward_baseline(DRIVE_DECAY)
        drive.intensity = max(0.0, min(DRIVE_MAX, drive.intensity))
        changes[drive.name.value] = drive.intensity - old
    return changes


def _law_14_drive_modulation(
    state: CitizenCognitiveState,
    tick: int,
) -> dict[str, float]:
    """Law 14 — Drives modulate WM node energy. Curiosity uses prediction error.

    Returns cumulative drive-intensity deltas applied during this step.
    """
    drive_deltas: dict[str, float] = {}
    wm_nodes = state.get_wm_nodes()
    if not wm_nodes:
        return drive_deltas

    # --- Limbic modulation of WM node energy ---
    for node in wm_nodes:
        modulation = 0.0
        for drive in state.limbic.drives.values():
            affinity = _get_drive_affinity_for_node(drive.name.value, node)
            modulation += drive.intensity * affinity
        # Subtle boost — spec says *0.1 so it doesn't overwhelm.
        node.energy += modulation * 0.1

    # --- Curiosity update from prediction error ---
    # Prediction error = 1 - Coh(WM_centroid, recent_stimulus).
    # We approximate "recent stimulus" as nodes in WM with highest recency.
    centroid = state.wm.centroid
    if centroid:
        # Find most recent WM node as proxy for recent stimulus.
        recent_nodes = sorted(wm_nodes, key=lambda n: n.recency, reverse=True)
        stimulus_embedding = recent_nodes[0].embedding if recent_nodes else []
        prediction_error = 1.0 - cosine_similarity(centroid, stimulus_embedding)
    else:
        prediction_error = 0.5  # no centroid yet — moderate uncertainty

    # Novelty score: mean(1 - weight) for low-weight WM nodes.
    if wm_nodes:
        novelty_score = sum(1.0 - n.weight for n in wm_nodes) / len(wm_nodes)
    else:
        novelty_score = 0.0

    # Operational void: fraction of active nodes with 0 outgoing process links.
    active_nodes = [n for n in state.nodes.values() if n.energy > 0]
    if active_nodes:
        process_link_targets = {
            link.source_id
            for link in state.links
            if link.link_type.value in ("causes", "activates", "regulates")
        }
        void_count = sum(
            1 for n in active_nodes if n.id not in process_link_targets
        )
        operational_void = void_count / len(active_nodes)
    else:
        operational_void = 0.0

    uncertainty = prediction_error + novelty_score + operational_void
    # Normalize to keep uncertainty in a tractable range (spec sums 4 sources).
    uncertainty = min(uncertainty, 4.0)

    curiosity_drive = state.limbic.drives.get(DriveName.CURIOSITY.value)
    anxiety_emotion = state.limbic.emotions.get(EmotionName.ANXIETY.value, 0.0)

    if curiosity_drive is not None:
        # Competence gating: approximate competence as mean weight of active
        # nodes (high weight = consolidated knowledge = competence).
        if active_nodes:
            competence = sum(n.weight for n in active_nodes) / len(active_nodes)
        else:
            competence = 0.5
        competence = max(0.0, min(1.0, competence))

        # Coefficients for the curiosity update (spec: a*uncertainty - b*matches - c*anxiety).
        a_coeff = 0.05
        b_coeff = 0.03
        c_coeff = 0.04

        # successful_matches: how many WM nodes have high coherence with centroid.
        if centroid:
            successful_matches = sum(
                1 for n in wm_nodes
                if cosine_similarity(centroid, n.embedding) > 0.8
            ) / max(len(wm_nodes), 1)
        else:
            successful_matches = 0.0

        delta_curiosity = (
            a_coeff * uncertainty
            - b_coeff * successful_matches
            - c_coeff * anxiety_emotion
        )
        old_curiosity = curiosity_drive.intensity
        curiosity_drive.intensity = max(
            0.0, min(DRIVE_MAX, curiosity_drive.intensity + delta_curiosity)
        )
        drive_deltas[DriveName.CURIOSITY.value] = (
            curiosity_drive.intensity - old_curiosity
        )

        # Competence gating: low competence + high prediction error -> anxiety.
        if competence < 0.3 and prediction_error > 0.7:
            anxiety_increase = 0.05 * (1.0 - competence) * prediction_error
            state.limbic.emotions[EmotionName.ANXIETY.value] = min(
                1.0,
                state.limbic.emotions.get(EmotionName.ANXIETY.value, 0.0)
                + anxiety_increase,
            )

    return drive_deltas


def _law_15_boredom(
    state: CitizenCognitiveState,
    tick: int,
    task_completed: bool,
) -> float:
    """Law 15 — Boredom by stagnation.

    Tracks WM similarity over STAGNATION_WINDOW ticks.
    Returns the delta applied to the boredom emotion.
    """
    cid = state.citizen_id

    # Maintain per-citizen WM history.
    if cid not in _wm_history:
        _wm_history[cid] = deque(maxlen=STAGNATION_WINDOW)

    history = _wm_history[cid]
    current_wm = frozenset(state.wm.node_ids)

    # --- Similarity over window ---
    if len(history) >= 2:
        similarities = [
            _wm_jaccard(current_wm, prev) for prev in history
        ]
        wm_similarity_over_window = sum(similarities) / len(similarities)
    else:
        wm_similarity_over_window = 0.0

    # --- Repetition detection ---
    # Repetition = at least 2 of the last STAGNATION_WINDOW snapshots identical
    # to current.
    wm_repetition_detected = sum(
        1 for prev in history if prev == current_wm
    ) >= 2

    # --- Novel node detection ---
    novel_node_entered_wm = _detect_novel_node_entered_wm(current_wm, history)

    # --- Boredom update ---
    boredom = state.limbic.emotions.get(EmotionName.BOREDOM.value, 0.0)

    if wm_similarity_over_window > 0.8:
        boredom += BOREDOM_STAGNATION_COEFF

    if wm_repetition_detected:
        boredom += BOREDOM_REPETITION_COEFF

    if novel_node_entered_wm:
        boredom -= BOREDOM_NOVELTY_RELIEF

    if task_completed:
        boredom -= BOREDOM_PROGRESS_RELIEF

    old_boredom = state.limbic.emotions.get(EmotionName.BOREDOM.value, 0.0)
    boredom = max(0.0, min(1.0, boredom))
    state.limbic.emotions[EmotionName.BOREDOM.value] = boredom

    # Record snapshot for future ticks.
    history.append(current_wm)

    return boredom - old_boredom


def _law_15b_solitude(state: CitizenCognitiveState) -> float:
    """Law 15 companion — Solitude.

    Solitude rises when ticks_since_social exceeds SOLITUDE_THRESHOLD.
    Otherwise it decays.  Solitude boosts the affiliation drive.

    Returns the delta applied to the solitude emotion.
    """
    solitude = state.limbic.emotions.get(EmotionName.SOLITUDE.value, 0.0)
    old_solitude = solitude

    if state.limbic.ticks_since_social > SOLITUDE_THRESHOLD:
        excess = state.limbic.ticks_since_social - SOLITUDE_THRESHOLD
        solitude += SOLITUDE_RATE * excess / SOLITUDE_SCALE
    else:
        solitude *= SOLITUDE_DECAY

    solitude = max(0.0, min(1.0, solitude))
    state.limbic.emotions[EmotionName.SOLITUDE.value] = solitude

    # Solitude boosts affiliation drive (spec: affiliation += 0.1 * solitude).
    affiliation = state.limbic.drives.get(DriveName.AFFILIATION.value)
    if affiliation is not None:
        affiliation.intensity = min(
            DRIVE_MAX, affiliation.intensity + 0.1 * solitude
        )

    return solitude - old_solitude


def _law_16_frustration(
    state: CitizenCognitiveState,
    tick: int,
    recent_failures: int,
    resolution_detected: bool,
) -> float:
    """Law 16 — Frustration by blockage.

    Tracks failures within FAILURE_WINDOW ticks.
    Returns the delta applied to the frustration drive intensity.
    """
    cid = state.citizen_id

    # Maintain per-citizen failure history.
    if cid not in _failure_history:
        _failure_history[cid] = deque(maxlen=200)

    fh = _failure_history[cid]

    # Record new failures at current tick.
    for _ in range(recent_failures):
        fh.append(tick)

    # Count failures within the window.
    window_start = tick - FAILURE_WINDOW
    recent_failure_count = sum(1 for t in fh if t > window_start)

    frustration_drive = state.limbic.drives.get(DriveName.FRUSTRATION.value)
    if frustration_drive is None:
        return 0.0

    old_intensity = frustration_drive.intensity

    frustration_drive.intensity += (
        FRUSTRATION_FAILURE_COEFF * recent_failure_count
    )
    if resolution_detected:
        frustration_drive.intensity -= FRUSTRATION_RESOLUTION_RELIEF

    frustration_drive.intensity = max(
        0.0, min(DRIVE_MAX, frustration_drive.intensity)
    )

    return frustration_drive.intensity - old_intensity


def _law_17_desire_activation(
    state: CitizenCognitiveState,
) -> tuple[int, int]:
    """Law 17 — Latent desire activation + impulse accumulation.

    Scans desire nodes: if alignment with current WM exceeds
    DESIRE_ACTIVATION_THRESHOLD and the desire is dormant (low energy),
    ignite it.

    Scans action nodes: accumulate energy under sustained drive pressure
    and context match.

    Returns (desires_ignited, action_impulses_accumulated).
    """
    centroid = state.wm.centroid
    desires_ignited = 0
    impulses_accumulated = 0

    # --- Desire ignition ---
    for node in state.nodes.values():
        if node.node_type != NodeType.DESIRE:
            continue

        # Only ignite dormant desires (low energy).
        if node.energy > DESIRE_IGNITION_BOOST * 0.5:
            continue

        # Alignment with WM centroid.
        if not centroid or not node.embedding:
            continue
        alignment = cosine_similarity(centroid, node.embedding)

        # Limbic alignment: how well do current drives favor this desire?
        limbic_alignment = 0.0
        for drive in state.limbic.drives.values():
            affinity = _get_drive_affinity_for_node(drive.name.value, node)
            limbic_alignment += drive.intensity * affinity

        # Cognitive load inverse: room in WM → more likely to ignite.
        from ..constants import WM_SIZE_MAX
        cognitive_load_inverse = max(
            0.0, 1.0 - state.wm.size / max(WM_SIZE_MAX, 1)
        )

        activation_check = (
            node.weight
            * alignment
            * (1.0 + limbic_alignment)
            * cognitive_load_inverse
        )

        if activation_check > DESIRE_ACTIVATION_THRESHOLD:
            node.energy += DESIRE_IGNITION_BOOST
            desires_ignited += 1

    # --- Impulse accumulation for action nodes ---
    for node in state.nodes.values():
        if not node.is_action_node:
            continue

        # Drive pressure: sum of (drive.intensity * affinity) for matching drives.
        drive_pressure = 0.0
        for drive in state.limbic.drives.values():
            aff = node.drive_affinity.get(drive.name.value, 0.0)
            drive_pressure += drive.intensity * aff

        # Context match: cosine(WM_centroid, action_node.action_context).
        if centroid and node.action_context:
            context_match = cosine_similarity(centroid, node.action_context)
        else:
            context_match = 0.0

        if (
            drive_pressure > IMPULSE_DRIVE_THRESHOLD
            and context_match > IMPULSE_CONTEXT_THRESHOLD
        ):
            node.energy += (
                IMPULSE_ACCUMULATION_RATE * drive_pressure * context_match
            )
            impulses_accumulated += 1
        else:
            node.energy *= IMPULSE_DECAY

    return desires_ignited, impulses_accumulated


def _law_18_relational_valence(
    state: CitizenCognitiveState,
    valence_signals: Optional[dict[tuple[str, str], float]] = None,
    *,
    limbic_delta: Optional[float] = None,
) -> int:
    """Law 18 — Relational valence update for co-active links.

    Delegates to the standalone law_18_relational_valence module which
    implements the full spec: asymptotic tempering, limbic-delta-driven
    updates to trust, affinity, aversion, friction, valence, ambivalence,
    and recency.

    *valence_signals* maps (source_id, target_id) -> signed valence float.
    When not provided, a default signal is derived from co-activation
    pattern: co-active nodes in WM produce a small positive signal.

    *limbic_delta* is the global limbic delta from DriveSnapshot comparison
    (Phase T2). When provided, it drives trust/friction updates on all
    co-active links instead of the placeholder 0.1 heuristic.

    Returns the number of links updated.
    """
    from .law_18_relational_valence import update_relational_valence

    result = update_relational_valence(
        state, valence_signals, limbic_delta=limbic_delta
    )
    return result.links_updated


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def update_limbic(
    state: CitizenCognitiveState,
    tick: int,
    *,
    task_completed: bool = False,
    recent_failures: int = 0,
    resolution_detected: bool = False,
    valence_signals: Optional[dict[tuple[str, str], float]] = None,
    limbic_delta: Optional[float] = None,
) -> LimbicUpdateResult:
    """Execute one tick of the limbic engine (Laws 13-18).

    Parameters
    ----------
    state:
        The full citizen cognitive state. Modified in-place.
    tick:
        Current tick number.
    task_completed:
        Whether a goal/task was completed this tick (feeds boredom relief).
    recent_failures:
        Number of failures detected this tick (feeds frustration).
    resolution_detected:
        Whether a blocked situation was resolved (feeds frustration relief).
    valence_signals:
        Optional explicit valence signals for relational links.
        Maps ``(source_id, target_id) -> float`` in ``[-1, 1]``.
    limbic_delta:
        Global limbic delta from DriveSnapshot comparison (Phase T2).
        When provided, drives trust/friction updates on co-active links
        via the trust module instead of the placeholder 0.1 heuristic.

    Returns
    -------
    LimbicUpdateResult with deltas and counts for each sub-system.
    """
    result = LimbicUpdateResult()

    # Law 13 — Drive inertia (decay toward baseline).
    drive_deltas_inertia = _law_13_drive_inertia(state)

    # Law 14 — Limbic modulation of WM + curiosity update.
    drive_deltas_modulation = _law_14_drive_modulation(state, tick)

    # Law 15 — Boredom by stagnation.
    boredom_delta = _law_15_boredom(state, tick, task_completed)

    # Law 15b — Solitude.
    solitude_delta = _law_15b_solitude(state)

    # Law 16 — Frustration by blockage.
    frustration_delta = _law_16_frustration(
        state, tick, recent_failures, resolution_detected
    )

    # Law 17 — Desire activation + impulse accumulation.
    desires_ignited, impulses_accumulated = _law_17_desire_activation(state)

    # Law 18 — Relational valence update (with limbic delta from trust mechanics).
    _law_18_relational_valence(state, valence_signals, limbic_delta=limbic_delta)

    # Increment social isolation counter.
    # (The caller is responsible for resetting ticks_since_social to 0
    #  when a person-sourced stimulus arrives.)
    state.limbic.ticks_since_social += 1

    # --- Assemble result ---

    # Merge drive deltas from inertia (Law 13) and modulation (Law 14).
    all_drive_deltas: dict[str, float] = {}
    for name in state.limbic.drives:
        d = drive_deltas_inertia.get(name, 0.0)
        d += drive_deltas_modulation.get(name, 0.0)
        # Include frustration delta from Law 16 in the frustration drive.
        if name == DriveName.FRUSTRATION.value:
            d += frustration_delta
        all_drive_deltas[name] = d

    result.drives_updated = all_drive_deltas
    result.emotions_updated = {
        EmotionName.BOREDOM.value: boredom_delta,
        EmotionName.SOLITUDE.value: solitude_delta,
    }
    result.desires_ignited = desires_ignited
    result.action_impulses_accumulated = impulses_accumulated

    return result
