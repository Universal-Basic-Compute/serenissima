"""
Law 4 — Attentional Competition (Salience + Moat)
Unified with Law 13 (Attentional Inertia)

Function: SELECT

Active nodes compete for entry into working memory. Only the top-K survive.
The selection moat (Θ_sel) favors incumbents — this is where Law 13 physically acts.

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md § Law 4, § Law 13
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..constants import (
    ACTIVATION_THRESHOLD,
    AROUSAL_MOAT_COEFF,
    BOREDOM_MOAT_COEFF,
    COHERENCE_BONUS,
    FRUSTRATION_MOAT_COEFF,
    THETA_BASE_WM,
    WM_SIZE_MAX,
    WM_SIZE_MIN,
)
from ..models import CitizenCognitiveState, Node


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class SelectionResult:
    """Stats returned by a single WM selection pass."""
    selected_ids: list[str] = field(default_factory=list)
    evicted_ids: list[str] = field(default_factory=list)
    admitted_ids: list[str] = field(default_factory=list)
    moat_theta: float = 0.0
    wm_changed: bool = False
    stability_ticks: int = 0
    centroid: list[float] = field(default_factory=list)
    candidate_count: int = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compute_moat(arousal: float, boredom: float, frustration: float) -> float:
    """
    Selection moat Θ_sel — recalculated each tick.

    Θ_sel = Θ_BASE_WM * (1 + AROUSAL_MOAT_COEFF * arousal
                          - BOREDOM_MOAT_COEFF * boredom
                          - FRUSTRATION_MOAT_COEFF * frustration)

    High boredom   → moat drops (even negative = system *wants* to change)
    High arousal   → moat rises (deep focus resists interruption)
    High frustration → moat drops (blockage erodes commitment)
    """
    return THETA_BASE_WM * (
        1.0
        + AROUSAL_MOAT_COEFF * arousal
        - BOREDOM_MOAT_COEFF * boredom
        - FRUSTRATION_MOAT_COEFF * frustration
    )


def _is_connected_to_wm(
    node_id: str,
    wm_ids: set[str],
    adjacency: dict[str, set[str]],
) -> bool:
    """Check whether *node_id* shares a link with any current WM member."""
    neighbors = adjacency.get(node_id, set())
    return bool(neighbors & wm_ids)


def _build_adjacency(state: CitizenCognitiveState) -> dict[str, set[str]]:
    """Build a bidirectional adjacency index from all links."""
    adj: dict[str, set[str]] = {}
    for link in state.links:
        adj.setdefault(link.source_id, set()).add(link.target_id)
        adj.setdefault(link.target_id, set()).add(link.source_id)
    return adj


def _compute_centroid(nodes: list[Node]) -> list[float]:
    """Mean embedding of given nodes. Returns empty list if no embeddings."""
    embeddings = [n.embedding for n in nodes if n.embedding]
    if not embeddings:
        return []
    return np.mean(np.array(embeddings, dtype=np.float64), axis=0).tolist()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def select_working_memory(state: CitizenCognitiveState) -> SelectionResult:
    """
    Run attentional competition to select the working-memory coalition.

    Steps (from spec):
    1. Compute selection moat Θ_sel from limbic state.
    2. Score every node above ACTIVATION_THRESHOLD with base salience:
         R = goal_relevance + partner_relevance + novelty_affinity
         S_base = (energy * weight) * (1 + R) * coherence_bonus
    3. Add Θ_sel to incumbents (Law 13 inertia).
    4. Sort by final salience, select top WM_SIZE_MIN..WM_SIZE_MAX.
    5. Update node.in_working_memory flags, WM state, stability tracking.
    """

    limbic = state.limbic
    arousal = limbic.arousal
    boredom = limbic.emotions.get("boredom", 0.0)
    frustration_emotion = limbic.emotions.get("frustration", 0.0)
    # Also consider the frustration drive intensity (spec uses "frustration")
    frustration_drive = limbic.drives.get("frustration")
    frustration = max(
        frustration_emotion,
        frustration_drive.intensity if frustration_drive else 0.0,
    )

    moat = _compute_moat(arousal, boredom, frustration)
    previous_wm_ids = set(state.wm.node_ids)

    # Build adjacency for coherence bonus lookup
    adjacency = _build_adjacency(state)

    # --- Step 2: base salience for all nodes above threshold ---
    scored: list[tuple[str, float]] = []
    for node in state.nodes.values():
        if node.energy < ACTIVATION_THRESHOLD:
            continue

        # Drive-relevance composite
        r = node.goal_relevance + node.partner_relevance + node.novelty_affinity

        # Coherence bonus: nodes connected to current WM get a multiplier
        coh = COHERENCE_BONUS if _is_connected_to_wm(node.id, previous_wm_ids, adjacency) else 1.0

        s_base = (node.energy * node.weight) * (1.0 + r) * coh

        # --- Step 3: inertia moat for incumbents ---
        if node.in_working_memory:
            s_final = s_base + moat
        else:
            s_final = s_base

        scored.append((node.id, s_final))

    # --- Step 4: selection ---
    scored.sort(key=lambda x: x[1], reverse=True)

    # Determine WM size: take up to WM_SIZE_MAX but at least WM_SIZE_MIN
    # if enough candidates exist
    wm_capacity = min(WM_SIZE_MAX, max(WM_SIZE_MIN, len(scored)))
    new_wm_ids_ordered = [nid for nid, _ in scored[:wm_capacity]]
    new_wm_set = set(new_wm_ids_ordered)

    # --- Step 5: update flags ---
    evicted: list[str] = []
    admitted: list[str] = []

    for node in state.nodes.values():
        was_in = node.in_working_memory
        now_in = node.id in new_wm_set
        node.in_working_memory = now_in

        if was_in and not now_in:
            evicted.append(node.id)
        elif not was_in and now_in:
            admitted.append(node.id)

    wm_changed = bool(evicted or admitted)

    # Update WorkingMemory struct
    state.wm.node_ids = new_wm_ids_ordered

    # Stability tracking: consecutive ticks without WM change
    if wm_changed:
        state.wm.stability_ticks = 0
    else:
        state.wm.stability_ticks += 1

    # Compute WM centroid (mean embedding)
    wm_nodes = [state.nodes[nid] for nid in new_wm_ids_ordered if nid in state.nodes]
    centroid = _compute_centroid(wm_nodes)
    state.wm.centroid = centroid

    return SelectionResult(
        selected_ids=new_wm_ids_ordered,
        evicted_ids=evicted,
        admitted_ids=admitted,
        moat_theta=moat,
        wm_changed=wm_changed,
        stability_ticks=state.wm.stability_ticks,
        centroid=centroid,
        candidate_count=len(scored),
    )
