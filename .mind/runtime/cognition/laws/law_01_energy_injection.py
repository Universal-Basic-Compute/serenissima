"""
Law 1 — Energy Injection (Dual-Channel)

Spec: docs/cognition/l1/ALGORITHM_L1_Physics.md (Law 1)

When a stimulus arrives (external message, self-output, directory listing,
temporal trigger), its energy budget B is distributed across targeted nodes
via two complementary channels:

  - Floor channel:     Wakes cold nodes by filling the gap to threshold.
  - Amplifier channel: Boosts the most semantically relevant nodes.

The split between channels (lambda) adapts to graph coldness and stimulus
concentration, so a cold graph gets more floor energy while a focused
stimulus concentrates amplifier energy.

Step 0: Pre-processing — segment stimulus, deduplicate against existing nodes.
Steps 1-5: Threshold oracle, budget split, floor, amplifier, application.
Plus: self-stimulus anti-loop, directory ambient, temporal triggers.
"""

from __future__ import annotations

import math
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from ..constants import (
    # Injection constants
    THETA_BASE_MEMORY,
    THETA_BASE_CONCEPT,
    THETA_BASE_VALUE,
    THETA_MIN,
    THETA_MAX,
    FLOOR_SIGMOID_K,
    AMPLIFIER_GAMMA,
    LAMBDA_DEFAULT,
    LAMBDA_MIN,
    LAMBDA_MAX,
    COLDNESS_THRESHOLD,
    CONCENTRATION_THRESHOLD,
    MAX_SHARE_MIN,
    MAX_SHARE_MAX,
    DEDUP_THRESHOLD,
    NEWBORN_WEIGHT,
    BULK_THRESHOLD,
    MAX_BULK_CHUNKS,
    TEMPORAL_TRIGGER_BOOST,
    COLOCATION_BOOST,
    REFRACTORY_TICKS,
    SELF_STIMULUS_RATIO,
    DIRECTORY_AMBIENT_BOOST,
    DIRECTORY_REFRESH_INTERVAL,
    # Decay (used for ramp counteract)
    DECAY_RATE,
)
from ..models import (
    CitizenCognitiveState,
    Link,
    LinkType,
    Node,
    NodeType,
)


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class Stimulus:
    """An incoming stimulus to be injected into the cognitive graph."""
    content: str
    embedding: list[float]
    source: str  # "external", "self", "directory", "temporal", "feed"
    budget: float = 1.0
    segments: list[dict] = field(default_factory=list)
    # segments: list of {"content": str, "embedding": list[float],
    #                     "node_type": str (optional)}


@dataclass
class TemporalTrigger:
    """A time-delayed energy boost for prospective memory."""
    target_node_id: str
    fire_at: float          # unix timestamp
    created_at: float       # unix timestamp
    peak_boost: float = TEMPORAL_TRIGGER_BOOST


@dataclass
class InjectionResult:
    """Output of a single injection pass."""
    total_energy_injected: float = 0.0
    nodes_created: int = 0
    nodes_merged: int = 0
    nodes_targeted: int = 0
    floor_energy: float = 0.0
    amplifier_energy: float = 0.0
    lambda_used: float = LAMBDA_DEFAULT
    temporal_triggers_created: list[TemporalTrigger] = field(default_factory=list)
    suppressed: bool = False          # True if self-stimulus was gate-blocked
    per_node_deltas: dict[str, float] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors using numpy.

    Returns 0.0 if either vector is zero-length or all-zeros.
    """
    va = np.asarray(a, dtype=np.float64)
    vb = np.asarray(b, dtype=np.float64)
    if va.size == 0 or vb.size == 0:
        return 0.0
    norm_a = np.linalg.norm(va)
    norm_b = np.linalg.norm(vb)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _theta_base_for_type(node_type: NodeType) -> float:
    """Type-dependent activation threshold base.

    memory=25, concept=30, value=35, desire=35, others=30.
    """
    if node_type == NodeType.MEMORY:
        return THETA_BASE_MEMORY
    elif node_type == NodeType.CONCEPT:
        return THETA_BASE_CONCEPT
    elif node_type == NodeType.VALUE:
        return THETA_BASE_VALUE
    elif node_type == NodeType.DESIRE:
        return THETA_BASE_VALUE  # same as value per spec
    else:
        return THETA_BASE_CONCEPT  # default


def _compute_threshold(node: Node) -> float:
    """Step 1 — Dynamic Threshold (Threshold Oracle).

    theta_i = clamp(
        theta_base
        - 5 * recency_i
        + 4 * (1 - stability_i)     # "quality" mapped to stability
        - 2 * clip(self_relevance_i - 0.5, -2, 2)  # "affinity" mapped to self_relevance centered
        , THETA_MIN, THETA_MAX
    )

    Design note: the spec uses generic "quality_i" and "affinity_i". We map
    quality to stability (well-consolidated nodes are higher quality) and
    affinity to self_relevance centered at 0.5 (identity-relevant nodes have
    positive affinity).
    """
    base = _theta_base_for_type(node.node_type)
    quality = node.stability  # [0,1] — high stability = high quality
    affinity = (node.self_relevance - 0.5) * 4.0  # map [0,1] → [-2,2]
    affinity = _clamp(affinity, -2.0, 2.0)

    theta = (
        base
        - 5.0 * node.recency
        + 4.0 * (1.0 - quality)
        - 2.0 * affinity
    )
    return _clamp(theta, THETA_MIN, THETA_MAX)


def _sigmoid(x: float, k: float) -> float:
    """Standard sigmoid: 1 / (1 + exp(-x/k))."""
    # Clamp exponent to prevent overflow
    exponent = -x / k
    exponent = _clamp(exponent, -500.0, 500.0)
    return 1.0 / (1.0 + math.exp(exponent))


def _find_nearest_node(
    embedding: list[float],
    nodes: dict[str, Node],
) -> tuple[Optional[Node], float]:
    """Find the node with highest cosine similarity to the given embedding.

    Returns (best_node, best_similarity). Returns (None, 0.0) if no nodes
    have embeddings.
    """
    best_node: Optional[Node] = None
    best_sim = -1.0
    for node in nodes.values():
        if not node.embedding:
            continue
        sim = cosine_similarity(embedding, node.embedding)
        if sim > best_sim:
            best_sim = sim
            best_node = node
    if best_sim < 0.0:
        return None, 0.0
    return best_node, best_sim


def _generate_node_id(node_type: str, content: str) -> str:
    """Generate a deterministic-ish node ID from type and content."""
    short = content[:40].replace(" ", "_").lower()
    # Strip non-alphanum except underscores
    short = "".join(c for c in short if c.isalnum() or c == "_")
    return f"{node_type}:{short}_{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Step 0: Stimulus Pre-Processing
# ---------------------------------------------------------------------------

def _preprocess_stimulus(
    state: CitizenCognitiveState,
    stimulus: Stimulus,
    budget_per_segment: float,
) -> tuple[list[str], int, int]:
    """Segment the stimulus, deduplicate, and create/merge nodes.

    Returns:
        target_ids: list of node IDs that will receive energy
        created: number of new nodes created
        merged: number of existing nodes that absorbed a segment
    """
    target_ids: list[str] = []
    created = 0
    merged = 0

    segments = stimulus.segments
    if not segments:
        # No pre-segmented content — treat the whole stimulus as one segment
        segments = [{
            "content": stimulus.content,
            "embedding": stimulus.embedding,
        }]

    for seg in segments:
        seg_embedding = seg.get("embedding", stimulus.embedding)
        seg_content = seg.get("content", stimulus.content)
        seg_type_str = seg.get("node_type", "concept")

        if not seg_embedding:
            continue

        # Deduplication gate
        nearest, sim = _find_nearest_node(seg_embedding, state.nodes)

        if nearest is not None and sim > DEDUP_THRESHOLD:
            # Merge into existing node
            nearest.activation_count += 1
            nearest.recency = 1.0
            nearest.last_activated_at = time.time()
            target_ids.append(nearest.id)
            merged += 1
        else:
            # Create new node with birth properties
            try:
                ntype = NodeType(seg_type_str)
            except ValueError:
                ntype = NodeType.CONCEPT

            node_id = _generate_node_id(ntype.value, seg_content)
            new_node = Node(
                id=node_id,
                node_type=ntype,
                content=seg_content,
                embedding=seg_embedding,
                weight=NEWBORN_WEIGHT,
                energy=budget_per_segment,  # high energy — enters the game
                stability=0.0,              # zero — vulnerable to Law 7
                recency=1.0,                # fresh
                novelty_affinity=1.0,       # max — curiosity amplifies
                self_relevance=0.0,
                activation_count=1,
                last_activated_at=time.time(),
            )
            state.add_node(new_node)
            target_ids.append(node_id)
            created += 1

    return target_ids, created, merged


# ---------------------------------------------------------------------------
# Bulk stimulus handling
# ---------------------------------------------------------------------------

def _chunk_text(text: str, chunk_size: int = 500) -> list[str]:
    """Split text into roughly equal semantic chunks by paragraph/sentence.

    Falls back to character-level splitting if no natural breaks exist.
    """
    # Split on double newline (paragraphs) first
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 <= chunk_size:
            current = (current + "\n\n" + para).strip() if current else para
        else:
            if current:
                chunks.append(current)
            # If a single paragraph exceeds chunk_size, split it further
            if len(para) > chunk_size:
                for i in range(0, len(para), chunk_size):
                    chunks.append(para[i:i + chunk_size])
            else:
                current = para
                continue
            current = ""
    if current:
        chunks.append(current)

    if not chunks:
        # Fallback: character split
        for i in range(0, len(text), chunk_size):
            chunks.append(text[i:i + chunk_size])

    return chunks


def _handle_bulk_stimulus(
    state: CitizenCognitiveState,
    stimulus: Stimulus,
) -> tuple[list[dict], Optional[dict]]:
    """Handle stimuli exceeding BULK_THRESHOLD characters.

    Chunks the content, scores each chunk against WM centroid, and returns
    only the top-k segments plus a summary segment for the remainder.

    Returns:
        selected_segments: list of segment dicts to inject
        summary_segment: optional summary segment for unchosen chunks (or None)
    """
    chunks = _chunk_text(stimulus.content)
    if not chunks:
        return [], None

    # Compute WM centroid for relevance scoring
    wm_nodes = state.get_wm_nodes()
    if wm_nodes:
        embeddings = [n.embedding for n in wm_nodes if n.embedding]
        if embeddings:
            centroid = np.mean(embeddings, axis=0).tolist()
        else:
            centroid = stimulus.embedding
    else:
        centroid = stimulus.embedding

    # Score each chunk against centroid
    # Since we don't have per-chunk embeddings without LLM, approximate
    # relevance using the stimulus embedding (the caller should provide
    # per-segment embeddings when available)
    scored: list[tuple[int, float, str]] = []
    for i, chunk in enumerate(chunks):
        # Use stimulus embedding as proxy — all chunks share it
        # In production, each chunk would have its own embedding
        score = cosine_similarity(stimulus.embedding, centroid) if centroid else 0.5
        # Add positional diversity: first and last chunks get a slight boost
        if i == 0 or i == len(chunks) - 1:
            score += 0.05
        scored.append((i, score, chunk))

    scored.sort(key=lambda x: x[1], reverse=True)

    k = min(MAX_BULK_CHUNKS, len(scored))
    selected = scored[:k]
    remainder = scored[k:]

    selected_segments = [
        {
            "content": chunk,
            "embedding": stimulus.embedding,  # shared embedding as proxy
            "node_type": "memory",
        }
        for _, _, chunk in selected
    ]

    summary_segment = None
    if remainder:
        summary_content = (
            f"[Summary pointer: {len(remainder)} unchosen chunks from "
            f"'{stimulus.content[:80]}...']"
        )
        summary_segment = {
            "content": summary_content,
            "embedding": stimulus.embedding,
            "node_type": "memory",
        }

    return selected_segments, summary_segment


# ---------------------------------------------------------------------------
# Self-stimulus gating
# ---------------------------------------------------------------------------

# Module-level state for self-stimulus anti-loop tracking.
# Keyed by citizen_id → tracking data.
_self_stimulus_state: dict[str, dict] = {}


def _get_self_state(citizen_id: str) -> dict:
    """Get or create self-stimulus tracking state for a citizen."""
    if citizen_id not in _self_stimulus_state:
        _self_stimulus_state[citizen_id] = {
            "loop_count": 0,
            "last_self_embedding": None,
            "refractory_nodes": {},  # node_id → tick_until_ready
        }
    return _self_stimulus_state[citizen_id]


def _gate_self_stimulus(
    state: CitizenCognitiveState,
    stimulus: Stimulus,
    tick: int,
) -> tuple[float, bool]:
    """Apply self-stimulus anti-loop protections.

    Returns:
        effective_budget: the budget after diminishing returns
        suppressed: True if the stimulus should be entirely suppressed
    """
    ss = _get_self_state(state.citizen_id)

    # Gate 3: Novelty gate — suppress if repeating previous self-output
    if ss["last_self_embedding"] is not None:
        coherence = cosine_similarity(
            stimulus.embedding, ss["last_self_embedding"]
        )
        if coherence > 0.8:
            # Repeating itself — suppress entirely
            return 0.0, True

    # Gate 2: Diminishing returns
    loop_count = ss["loop_count"]
    diminish = 0.5 ** loop_count
    effective_budget = stimulus.budget * SELF_STIMULUS_RATIO * diminish

    # Update tracking
    ss["loop_count"] += 1
    ss["last_self_embedding"] = list(stimulus.embedding)

    return effective_budget, False


def _is_node_refractory(citizen_id: str, node_id: str, tick: int) -> bool:
    """Check if a node is in refractory period for self-stimulus."""
    ss = _get_self_state(citizen_id)
    ready_at = ss["refractory_nodes"].get(node_id, -1)
    return tick < ready_at


def _mark_refractory(citizen_id: str, node_id: str, tick: int) -> None:
    """Mark a node as refractory after self-stimulus activation."""
    ss = _get_self_state(citizen_id)
    ss["refractory_nodes"][node_id] = tick + REFRACTORY_TICKS


def reset_self_stimulus_state(citizen_id: str) -> None:
    """Reset self-stimulus anti-loop state.

    Call this when an external stimulus arrives to reset the diminishing
    returns counter.
    """
    if citizen_id in _self_stimulus_state:
        _self_stimulus_state[citizen_id]["loop_count"] = 0


def cleanup_refractory(citizen_id: str, tick: int) -> None:
    """Remove expired refractory entries to prevent unbounded growth."""
    ss = _get_self_state(citizen_id)
    expired = [
        nid for nid, ready_at in ss["refractory_nodes"].items()
        if tick >= ready_at
    ]
    for nid in expired:
        del ss["refractory_nodes"][nid]


# ---------------------------------------------------------------------------
# Directory ambient stimulus
# ---------------------------------------------------------------------------

def inject_directory_ambient(
    state: CitizenCognitiveState,
    file_names: list[str],
) -> float:
    """Inject low-energy warmth from directory listing into matching nodes.

    Called on cwd change or every DIRECTORY_REFRESH_INTERVAL ticks.

    Returns total energy injected.
    """
    total = 0.0
    for name in file_names:
        name_lower = name.lower().replace("_", " ").replace("-", " ")
        for node in state.nodes.values():
            # Lexical match: check if file name tokens appear in node content
            content_lower = node.content.lower()
            name_tokens = name_lower.split()
            # Match if any substantial token (>2 chars) appears in content
            matched = any(
                token in content_lower
                for token in name_tokens
                if len(token) > 2
            )
            if matched:
                boost = DIRECTORY_AMBIENT_BOOST * DECAY_RATE
                node.energy += boost
                total += boost
    return total


# ---------------------------------------------------------------------------
# Temporal triggers
# ---------------------------------------------------------------------------

def process_temporal_triggers(
    state: CitizenCognitiveState,
    triggers: list[TemporalTrigger],
    now: float,
) -> tuple[list[TemporalTrigger], float]:
    """Apply temporal trigger ramp-ups and fire expired triggers.

    Returns:
        remaining: triggers that have not yet fired
        total_energy: total energy injected by temporal ramps/fires
    """
    remaining: list[TemporalTrigger] = []
    total_energy = 0.0

    for trigger in triggers:
        node = state.get_node(trigger.target_node_id)
        if node is None:
            # Target node was pruned — drop trigger
            continue

        time_remaining = trigger.fire_at - now
        total_duration = trigger.fire_at - trigger.created_at

        if time_remaining <= 0:
            # Deadline hit — full spike
            node.energy += trigger.peak_boost
            total_energy += trigger.peak_boost
            # Trigger consumed — do not add to remaining
        else:
            # Cubic ramp: slow start, sharp end
            if total_duration > 0:
                progress = 1.0 - (time_remaining / total_duration)
                progress = _clamp(progress, 0.0, 1.0)
                ramp = trigger.peak_boost * (progress ** 3)
                boost = ramp * DECAY_RATE  # counteract decay, not pile on
                node.energy += boost
                total_energy += boost
            remaining.append(trigger)

    return remaining, total_energy


# ---------------------------------------------------------------------------
# Main injection function
# ---------------------------------------------------------------------------

def inject_energy(
    state: CitizenCognitiveState,
    stimulus: Stimulus,
    tick: int,
) -> InjectionResult:
    """Law 1 — Inject energy from a stimulus into the cognitive graph.

    Implements the full dual-channel injection pipeline:
      Step 0: Pre-processing (segmentation, deduplication, node creation)
      Step 1: Dynamic threshold computation
      Step 2: Graph state analysis (coldness, concentration, adaptive lambda)
      Step 3: Floor channel (wake cold nodes)
      Step 4: Amplifier channel (boost relevant nodes)
      Step 5: Application with safety caps and budget conservation

    Args:
        state: The citizen's complete cognitive state (mutated in place).
        stimulus: The incoming stimulus with content, embedding, source, budget.
        tick: Current tick number (for refractory tracking).

    Returns:
        InjectionResult with detailed accounting of what happened.
    """
    result = InjectionResult()

    # ---------------------------------------------------------------
    # Self-stimulus gating
    # ---------------------------------------------------------------
    is_self = stimulus.source == "self"
    effective_budget = stimulus.budget

    if is_self:
        effective_budget, suppressed = _gate_self_stimulus(state, stimulus, tick)
        if suppressed:
            result.suppressed = True
            return result
    else:
        # External stimulus resets self-stimulus diminishing returns
        reset_self_stimulus_state(state.citizen_id)

    if effective_budget <= 0.0:
        result.suppressed = True
        return result

    # ---------------------------------------------------------------
    # Directory ambient: special lightweight path
    # ---------------------------------------------------------------
    if stimulus.source == "directory":
        # Directory listing is handled by inject_directory_ambient
        # which uses lexical matching, not the full dual-channel pipeline.
        # Extract file names from segments or content lines.
        file_names = []
        if stimulus.segments:
            file_names = [seg.get("content", "") for seg in stimulus.segments]
        else:
            file_names = [
                line.strip()
                for line in stimulus.content.split("\n")
                if line.strip()
            ]
        total = inject_directory_ambient(state, file_names)
        result.total_energy_injected = total
        return result

    # ---------------------------------------------------------------
    # Step 0: Bulk handling
    # ---------------------------------------------------------------
    if len(stimulus.content) > BULK_THRESHOLD and not stimulus.segments:
        selected_segments, summary_segment = _handle_bulk_stimulus(
            state, stimulus
        )
        stimulus.segments = selected_segments
        if summary_segment:
            stimulus.segments.append(summary_segment)

    # ---------------------------------------------------------------
    # Step 0: Pre-processing — segment, deduplicate, create nodes
    # ---------------------------------------------------------------
    n_segments = max(len(stimulus.segments), 1)
    budget_per_new_node = effective_budget / n_segments

    target_ids, created, merged = _preprocess_stimulus(
        state, stimulus, budget_per_new_node
    )
    result.nodes_created = created
    result.nodes_merged = merged

    if not target_ids:
        return result

    # Also find all existing nodes with non-trivial similarity to inject into
    # (the dual-channel targets the broader graph, not just exact matches)
    all_target_ids: list[str] = list(target_ids)
    for node in state.nodes.values():
        if node.id in all_target_ids:
            continue
        if not node.embedding or not stimulus.embedding:
            continue
        sim = cosine_similarity(stimulus.embedding, node.embedding)
        if sim > 0.05:  # minimal relevance floor
            all_target_ids.append(node.id)

    # Filter refractory nodes for self-stimulus
    if is_self:
        all_target_ids = [
            nid for nid in all_target_ids
            if not _is_node_refractory(state.citizen_id, nid, tick)
        ]

    if not all_target_ids:
        return result

    # ---------------------------------------------------------------
    # Step 1: Compute dynamic thresholds for all targets
    # ---------------------------------------------------------------
    thresholds: dict[str, float] = {}
    for nid in all_target_ids:
        node = state.get_node(nid)
        if node is None:
            continue
        thresholds[nid] = _compute_threshold(node)

    # Compute per-node similarity to stimulus
    similarities: dict[str, float] = {}
    for nid in all_target_ids:
        node = state.get_node(nid)
        if node is None:
            continue
        if node.embedding and stimulus.embedding:
            similarities[nid] = max(0.0, cosine_similarity(
                stimulus.embedding, node.embedding
            ))
        else:
            similarities[nid] = 0.0

    # Remove nodes with zero similarity (except newly created ones which
    # already received birth energy)
    active_targets = [
        nid for nid in all_target_ids
        if similarities.get(nid, 0.0) > 0.0 or nid in target_ids
    ]

    if not active_targets:
        return result

    N = len(active_targets)
    result.nodes_targeted = N
    B = effective_budget

    # ---------------------------------------------------------------
    # Step 2: Graph state analysis — coldness and concentration
    # ---------------------------------------------------------------

    # Coldness: average energy deficit below threshold
    coldness_sum = 0.0
    for nid in active_targets:
        node = state.get_node(nid)
        if node is None:
            continue
        theta = thresholds.get(nid, THETA_BASE_CONCEPT)
        coldness_sum += max(0.0, theta - node.energy)
    coldness = coldness_sum / N if N > 0 else 0.0

    # Concentration: Herfindahl index of similarity distribution
    sim_values = [similarities.get(nid, 0.0) for nid in active_targets]
    sim_total = sum(sim_values)
    if sim_total > 0.0:
        normalized_sims = [s / sim_total for s in sim_values]
        herfindahl = sum(s_hat ** 2 for s_hat in normalized_sims)
    else:
        herfindahl = 1.0 / N if N > 0 else 1.0

    # Adaptive lambda
    lam = LAMBDA_DEFAULT
    if coldness > COLDNESS_THRESHOLD:
        lam += 0.2
    if herfindahl > CONCENTRATION_THRESHOLD:
        lam -= 0.2
    lam = _clamp(lam, LAMBDA_MIN, LAMBDA_MAX)
    result.lambda_used = lam

    floor_budget = lam * B
    amp_budget = (1.0 - lam) * B

    # ---------------------------------------------------------------
    # Step 3: Floor channel — wake cold nodes
    # ---------------------------------------------------------------
    floor_weights: dict[str, float] = {}
    gaps: dict[str, float] = {}

    for nid in active_targets:
        node = state.get_node(nid)
        if node is None:
            continue
        theta = thresholds.get(nid, THETA_BASE_CONCEPT)
        gap = max(0.0, theta - node.energy)
        gaps[nid] = gap
        # Sigmoid: prioritize nodes just below threshold
        # w = 1 / (1 + exp(-(theta - energy) / k))
        floor_weights[nid] = _sigmoid(theta - node.energy, FLOOR_SIGMOID_K)

    floor_weight_total = sum(floor_weights.values())

    floor_deltas: dict[str, float] = {}
    for nid in active_targets:
        if floor_weight_total > 0.0:
            w_norm = floor_weights.get(nid, 0.0) / floor_weight_total
        else:
            w_norm = 0.0
        gap = gaps.get(nid, 0.0)
        # Never inject more than the gap
        delta = min(gap, w_norm * floor_budget)
        floor_deltas[nid] = delta

    # ---------------------------------------------------------------
    # Step 4: Amplifier channel — boost by relevance
    # ---------------------------------------------------------------
    amp_weights: dict[str, float] = {}

    for nid in active_targets:
        sim = similarities.get(nid, 0.0)
        # Contrast exponent: rewards high-similarity nodes
        amp_weights[nid] = sim ** AMPLIFIER_GAMMA if sim > 0.0 else 0.0

    amp_weight_total = sum(amp_weights.values())

    amp_deltas: dict[str, float] = {}
    for nid in active_targets:
        if amp_weight_total > 0.0:
            w_norm = amp_weights.get(nid, 0.0) / amp_weight_total
        else:
            w_norm = 1.0 / N if N > 0 else 0.0
        amp_deltas[nid] = w_norm * amp_budget

    # ---------------------------------------------------------------
    # Step 5: Application & safety
    # ---------------------------------------------------------------

    # Anti-black-hole: max_share adapts to graph topology
    max_share = _clamp(1.0 / math.sqrt(N), MAX_SHARE_MIN, MAX_SHARE_MAX)

    demands: dict[str, float] = {}
    for nid in active_targets:
        raw = floor_deltas.get(nid, 0.0) + amp_deltas.get(nid, 0.0)
        # Cap per node
        raw = min(raw, max_share * B)
        demands[nid] = raw

    # Budget conservation: normalize if total exceeds B
    total_demand = sum(demands.values())
    if total_demand > B and total_demand > 0.0:
        scale = B / total_demand
        demands = {nid: d * scale for nid, d in demands.items()}
        total_demand = B

    # Apply energy deltas
    total_floor = 0.0
    total_amp = 0.0
    for nid in active_targets:
        node = state.get_node(nid)
        if node is None:
            continue
        delta = demands.get(nid, 0.0)
        if delta <= 0.0:
            continue

        node.energy += delta
        node.activation_count += 1
        node.last_activated_at = time.time()
        node.recency = 1.0
        result.per_node_deltas[nid] = delta

        # Track floor vs amplifier for reporting
        total_floor += floor_deltas.get(nid, 0.0)
        total_amp += amp_deltas.get(nid, 0.0)

        # Mark refractory if self-stimulus
        if is_self:
            _mark_refractory(state.citizen_id, nid, tick)

    result.total_energy_injected = sum(demands.values())
    result.floor_energy = total_floor
    result.amplifier_energy = total_amp

    return result
