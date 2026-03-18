"""
Destruction Pathology Detection — Phase T6

Spec: docs/trust_mechanics/VALUE_DESTRUCTION_PATHOLOGIES.md

Detect 14 topological anomalies that indicate value destruction.
Detection uses graph patterns: fan-out ratio, link reciprocity,
trust asymmetry, time-compression. No bans — only physics.

Priority 1 (detect first): D4 sybil_network, D6 trust_exploitation,
D13 identity_spoofing.

The system returns pathology reports with confidence and evidence.
The caller decides what to do (typically: increase friction).
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Optional

from ..models import CitizenCognitiveState, Link, Node


# --- Data Classes ---

@dataclass
class PathologyEvidence:
    """A single piece of evidence for a detected pathology."""
    signal_name: str
    value: float
    threshold: float
    node_ids: list[str] = field(default_factory=list)
    link_keys: list[tuple[str, str]] = field(default_factory=list)
    description: str = ""


@dataclass
class Pathology:
    """A detected pathology with confidence and evidence."""
    name: str
    confidence: float  # [0, 1]
    severity: str  # "low", "medium", "high", "critical"
    evidence: list[PathologyEvidence] = field(default_factory=list)
    actor_id: str = ""


# --- Constants ---

SECONDS_PER_DAY = 86400.0

# D1: Extraction
EXTRACTION_FLOW_RATIO_THRESHOLD = 10.0
EXTRACTION_CREATION_RATIO_THRESHOLD = 20.0

# D4: Sybil Attack
SYBIL_INTERNAL_TRUST_THRESHOLD = 0.8
SYBIL_EXTERNAL_TRUST_THRESHOLD = 0.1
SYBIL_TIME_WINDOW_SECONDS = SECONDS_PER_DAY  # 24 hours

# D5: Attention Theft
ATTENTION_CONSOLIDATION_RATIO_THRESHOLD = 5.0

# D6: Trust Exploitation
TRUST_VELOCITY_THRESHOLD = 0.1
TRUST_EXPLOITATION_FRICTION_THRESHOLD = 0.5

# D8: Rent-Seeking
RENT_SEEKING_BETWEENNESS_THRESHOLD = 0.3

# D9: Spam
SPAM_VOLUME_RATIO = 10.0
SPAM_DISSOLUTION_RATIO = 0.8

# D10: Collusion
COLLUSION_RECIPROCITY_THRESHOLD = 0.9

# D13: Identity Spoofing
SPOOFING_EMBEDDING_THRESHOLD = 0.95

# D3: Free-Riding (very similar to extraction but focused on shared spaces)
FREE_RIDER_CREATION_THRESHOLD = 0.05


# --- Helper Functions ---

def _get_inbound_links(
    state: CitizenCognitiveState,
    node_id: str,
) -> list[Link]:
    return [l for l in state.links if l.target_id == node_id]


def _get_outbound_links(
    state: CitizenCognitiveState,
    node_id: str,
) -> list[Link]:
    return [l for l in state.links if l.source_id == node_id]


def _get_links_between(
    state: CitizenCognitiveState,
    ids: set[str],
) -> list[Link]:
    """Return all links where both source and target are in the given set."""
    return [
        l for l in state.links
        if l.source_id in ids and l.target_id in ids
    ]


def _get_external_links(
    state: CitizenCognitiveState,
    ids: set[str],
) -> list[Link]:
    """Return all links where exactly one endpoint is in the given set."""
    return [
        l for l in state.links
        if (l.source_id in ids) != (l.target_id in ids)
    ]


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a < 1e-9 or mag_b < 1e-9:
        return 0.0
    return dot / (mag_a * mag_b)


# --- Priority 1 Detectors ---

def _detect_sybil_network(
    actor_ids: list[str],
    state: CitizenCognitiveState,
    now: float,
) -> list[Pathology]:
    """D4: Detect Sybil attack — cluster of actors with high internal
    trust, low external trust, created in a narrow time window.

    Topological signals:
    1. Dense internal connections, near-zero external connections.
    2. Temporal synchronization: accounts created within 24 hours.
    3. Homogeneous topology.
    4. No external value production.
    """
    pathologies: list[Pathology] = []

    id_set = set(actor_ids)
    if len(id_set) < 2:
        return pathologies

    internal_links = _get_links_between(state, id_set)
    external_links = _get_external_links(state, id_set)

    if not internal_links:
        return pathologies

    internal_trust = _mean([l.trust for l in internal_links])
    external_trust = _mean([l.trust for l in external_links]) if external_links else 0.0

    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    # Signal 1: Internal >> external trust
    if internal_trust > SYBIL_INTERNAL_TRUST_THRESHOLD and external_trust < SYBIL_EXTERNAL_TRUST_THRESHOLD:
        evidence.append(PathologyEvidence(
            signal_name="trust_isolation",
            value=internal_trust - external_trust,
            threshold=SYBIL_INTERNAL_TRUST_THRESHOLD - SYBIL_EXTERNAL_TRUST_THRESHOLD,
            node_ids=actor_ids,
            description=f"Internal trust {internal_trust:.2f} >> external trust {external_trust:.2f}",
        ))
        confidence += 0.4

    # Signal 2: Temporal synchronization
    creation_times = []
    for aid in actor_ids:
        node = state.get_node(aid)
        if node is not None:
            creation_times.append(node.created_at)

    if len(creation_times) >= 2:
        time_spread = max(creation_times) - min(creation_times)
        if time_spread < SYBIL_TIME_WINDOW_SECONDS:
            evidence.append(PathologyEvidence(
                signal_name="temporal_synchronization",
                value=time_spread,
                threshold=SYBIL_TIME_WINDOW_SECONDS,
                node_ids=actor_ids,
                description=f"All accounts created within {time_spread:.0f}s (< {SYBIL_TIME_WINDOW_SECONDS:.0f}s)",
            ))
            confidence += 0.3

    # Signal 3: No external value production
    external_outbound = [
        l for l in state.links
        if l.source_id in id_set and l.target_id not in id_set
    ]
    if len(external_outbound) == 0 and len(internal_links) > 0:
        evidence.append(PathologyEvidence(
            signal_name="no_external_production",
            value=0.0,
            threshold=1.0,
            node_ids=actor_ids,
            description="Zero outbound links to external nodes",
        ))
        confidence += 0.25

    # Signal 4: Homogeneous topology
    link_counts = []
    for aid in actor_ids:
        out_count = len([l for l in state.links if l.source_id == aid])
        in_count = len([l for l in state.links if l.target_id == aid])
        link_counts.append(out_count + in_count)

    if len(link_counts) >= 2 and _mean(link_counts) > 0:
        variance = sum((c - _mean(link_counts)) ** 2 for c in link_counts) / len(link_counts)
        std_dev = math.sqrt(variance)
        coeff_var = std_dev / _mean(link_counts) if _mean(link_counts) > 0 else 0
        if coeff_var < 0.2:  # Very similar topology
            evidence.append(PathologyEvidence(
                signal_name="homogeneous_topology",
                value=coeff_var,
                threshold=0.2,
                node_ids=actor_ids,
                description=f"Topology coefficient of variation {coeff_var:.3f} (very homogeneous)",
            ))
            confidence += 0.05

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="sybil_network",
            confidence=confidence,
            severity="high",
            evidence=evidence,
            actor_id=actor_ids[0] if actor_ids else "",
        ))

    return pathologies


def _detect_trust_exploitation(
    actor_id: str,
    state: CitizenCognitiveState,
    now: float,
) -> list[Pathology]:
    """D6: Detect trust exploitation — rapid trust accumulation followed
    by sudden friction spike.

    Topological signals:
    1. Trust velocity anomaly: unusually systematic trust-building.
    2. Sudden topology change.
    3. Post-exploit friction cascade.
    """
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    inbound = _get_inbound_links(state, actor_id)
    outbound = _get_outbound_links(state, actor_id)
    all_links = inbound + outbound

    if not all_links:
        return pathologies

    # Signal 1: High average trust + high recent friction
    # (trust was built, then exploited)
    avg_trust = _mean([l.trust for l in all_links])
    avg_friction = _mean([l.friction for l in all_links])

    if avg_trust > TRUST_VELOCITY_THRESHOLD and avg_friction > TRUST_EXPLOITATION_FRICTION_THRESHOLD:
        evidence.append(PathologyEvidence(
            signal_name="trust_friction_divergence",
            value=avg_trust + avg_friction,
            threshold=TRUST_VELOCITY_THRESHOLD + TRUST_EXPLOITATION_FRICTION_THRESHOLD,
            node_ids=[actor_id],
            description=f"High trust ({avg_trust:.2f}) coexists with high friction ({avg_friction:.2f})",
        ))
        confidence += 0.4

    # Signal 2: High aversion on links despite high trust
    # (people still trust but are now averse = betrayal signature)
    high_trust_high_aversion = [
        l for l in all_links
        if l.trust > 0.3 and l.aversion > 0.3
    ]
    if high_trust_high_aversion:
        ratio = len(high_trust_high_aversion) / max(1, len(all_links))
        if ratio > 0.3:
            evidence.append(PathologyEvidence(
                signal_name="trust_aversion_coexistence",
                value=ratio,
                threshold=0.3,
                link_keys=[(l.source_id, l.target_id) for l in high_trust_high_aversion],
                description=f"{len(high_trust_high_aversion)} links have both high trust and high aversion",
            ))
            confidence += 0.3

    # Signal 3: Multiple links with simultaneous friction spikes
    high_friction_links = [l for l in all_links if l.friction > 0.5]
    if len(high_friction_links) >= 3:
        evidence.append(PathologyEvidence(
            signal_name="multi_link_friction_cascade",
            value=float(len(high_friction_links)),
            threshold=3.0,
            link_keys=[(l.source_id, l.target_id) for l in high_friction_links],
            description=f"{len(high_friction_links)} links have friction > 0.5 (friction cascade)",
        ))
        confidence += 0.3

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="trust_exploitation",
            confidence=confidence,
            severity="critical",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_identity_spoofing(
    actor_id: str,
    state: CitizenCognitiveState,
    now: float,
) -> list[Pathology]:
    """D13: Detect identity spoofing — actor mimics another trusted
    actor's identity.

    Topological signals:
    1. Embedding similarity > 0.95 with an existing trusted actor.
    2. Topology mismatch (similar identity, different connections).
    3. Temporal anomaly (created shortly after a trust spike elsewhere).
    """
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    actor_node = state.get_node(actor_id)
    if actor_node is None or not actor_node.embedding:
        return pathologies

    # Check against all other nodes with embeddings
    for nid, node in state.nodes.items():
        if nid == actor_id:
            continue
        if not node.embedding:
            continue

        similarity = _cosine_similarity(actor_node.embedding, node.embedding)
        if similarity > SPOOFING_EMBEDDING_THRESHOLD:
            # Signal 1: Very similar embeddings
            evidence.append(PathologyEvidence(
                signal_name="embedding_similarity",
                value=similarity,
                threshold=SPOOFING_EMBEDDING_THRESHOLD,
                node_ids=[actor_id, nid],
                description=f"Embedding cosine similarity {similarity:.3f} > {SPOOFING_EMBEDDING_THRESHOLD}",
            ))
            confidence += 0.4

            # Signal 2: Topology mismatch
            actor_links = set(
                l.target_id for l in _get_outbound_links(state, actor_id)
            ) | set(
                l.source_id for l in _get_inbound_links(state, actor_id)
            )
            other_links = set(
                l.target_id for l in _get_outbound_links(state, nid)
            ) | set(
                l.source_id for l in _get_inbound_links(state, nid)
            )

            if actor_links and other_links:
                overlap = len(actor_links & other_links)
                union = len(actor_links | other_links)
                jaccard = overlap / union if union > 0 else 0
                if jaccard < 0.1:  # Very different connections despite similar identity
                    evidence.append(PathologyEvidence(
                        signal_name="topology_mismatch",
                        value=jaccard,
                        threshold=0.1,
                        node_ids=[actor_id, nid],
                        description=f"Jaccard similarity of connections {jaccard:.3f} (topology mismatch)",
                    ))
                    confidence += 0.3

            # Signal 3: Temporal proximity
            time_diff = abs(actor_node.created_at - node.created_at)
            if time_diff < SECONDS_PER_DAY * 7:  # Created within a week
                evidence.append(PathologyEvidence(
                    signal_name="temporal_proximity",
                    value=time_diff / SECONDS_PER_DAY,
                    threshold=7.0,
                    node_ids=[actor_id, nid],
                    description=f"Created {time_diff / SECONDS_PER_DAY:.1f} days apart",
                ))
                confidence += 0.2

            break  # Only need to find one match

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="identity_spoofing",
            confidence=confidence,
            severity="high",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


# --- Priority 2 Detectors ---

def _detect_extraction(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D1: Detect extraction — consuming without producing."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    inbound = _get_inbound_links(state, actor_id)
    outbound = _get_outbound_links(state, actor_id)

    inbound_energy = sum(l.energy for l in inbound)
    outbound_energy = sum(l.energy for l in outbound)

    if inbound_energy > 0:
        flow_ratio = inbound_energy / max(outbound_energy, 1e-6)
        if flow_ratio > EXTRACTION_FLOW_RATIO_THRESHOLD:
            evidence.append(PathologyEvidence(
                signal_name="asymmetric_flow",
                value=flow_ratio,
                threshold=EXTRACTION_FLOW_RATIO_THRESHOLD,
                node_ids=[actor_id],
                description=f"Inbound/outbound energy ratio {flow_ratio:.1f}x",
            ))
            confidence += 0.5

    # Creation deficit
    if len(inbound) > 0:
        creation_ratio = len(outbound) / len(inbound) if len(inbound) > 0 else float("inf")
        if creation_ratio < 1.0 / EXTRACTION_CREATION_RATIO_THRESHOLD:
            evidence.append(PathologyEvidence(
                signal_name="creation_deficit",
                value=creation_ratio,
                threshold=1.0 / EXTRACTION_CREATION_RATIO_THRESHOLD,
                node_ids=[actor_id],
                description=f"Creation ratio {creation_ratio:.3f} (severe deficit)",
            ))
            confidence += 0.3

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="extraction",
            confidence=confidence,
            severity="medium",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_manipulation(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D2: Detect manipulation — trust velocity reversal pattern."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    all_links = _get_inbound_links(state, actor_id) + _get_outbound_links(state, actor_id)
    if not all_links:
        return pathologies

    # Trust velocity reversal: high trust AND high friction on same links
    reversal_links = [l for l in all_links if l.trust > 0.3 and l.friction > 0.3]
    if reversal_links:
        ratio = len(reversal_links) / len(all_links)
        if ratio > 0.2:
            evidence.append(PathologyEvidence(
                signal_name="trust_velocity_reversal",
                value=ratio,
                threshold=0.2,
                link_keys=[(l.source_id, l.target_id) for l in reversal_links],
                description=f"{len(reversal_links)} links show trust+friction reversal pattern",
            ))
            confidence += 0.5

    # High aversion on outbound links (people avoiding this actor)
    outbound = _get_outbound_links(state, actor_id)
    avg_aversion = _mean([l.aversion for l in outbound]) if outbound else 0
    if avg_aversion > 0.3:
        evidence.append(PathologyEvidence(
            signal_name="high_outbound_aversion",
            value=avg_aversion,
            threshold=0.3,
            node_ids=[actor_id],
            description=f"Average outbound aversion {avg_aversion:.2f}",
        ))
        confidence += 0.3

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="manipulation",
            confidence=confidence,
            severity="high",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_free_riding(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D3: Detect free-riding — consuming shared resources without contributing."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    inbound = _get_inbound_links(state, actor_id)
    outbound = _get_outbound_links(state, actor_id)

    # Consumes (has inbound) but doesn't produce (no outbound)
    if len(inbound) > 0 and len(outbound) == 0:
        evidence.append(PathologyEvidence(
            signal_name="zero_outbound",
            value=0.0,
            threshold=FREE_RIDER_CREATION_THRESHOLD,
            node_ids=[actor_id],
            description=f"Has {len(inbound)} inbound links but zero outbound",
        ))
        confidence += 0.6
    elif len(inbound) > 0 and len(outbound) > 0:
        ratio = len(outbound) / len(inbound)
        if ratio < FREE_RIDER_CREATION_THRESHOLD:
            evidence.append(PathologyEvidence(
                signal_name="low_creation_ratio",
                value=ratio,
                threshold=FREE_RIDER_CREATION_THRESHOLD,
                node_ids=[actor_id],
                description=f"Outbound/inbound ratio {ratio:.3f} (free-riding)",
            ))
            confidence += 0.4

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="free_riding",
            confidence=confidence,
            severity="low",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_attention_theft(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D5: Detect attention theft — high injection, low consolidation."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    outbound = _get_outbound_links(state, actor_id)
    if not outbound:
        return pathologies

    # High energy links but low weight targets (grabbing attention without value)
    high_energy_low_weight = [
        l for l in outbound
        if l.energy > 0.3 and (state.get_node(l.target_id) is not None and state.get_node(l.target_id).weight < 0.1)
    ]

    if high_energy_low_weight and len(outbound) > 0:
        ratio = len(high_energy_low_weight) / len(outbound)
        if ratio > 0.5:
            evidence.append(PathologyEvidence(
                signal_name="injection_consolidation_ratio",
                value=ratio,
                threshold=0.5,
                link_keys=[(l.source_id, l.target_id) for l in high_energy_low_weight],
                description=f"{len(high_energy_low_weight)} links: high energy, low target weight",
            ))
            confidence += 0.5

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="attention_theft",
            confidence=confidence,
            severity="medium",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_spam(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D9: Detect spam — high volume, low quality."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    outbound = _get_outbound_links(state, actor_id)
    if not outbound:
        return pathologies

    # High outbound count, low average weight on targets
    target_weights = []
    for l in outbound:
        target = state.get_node(l.target_id)
        if target is not None:
            target_weights.append(target.weight)

    if target_weights:
        avg_weight = _mean(target_weights)
        if len(outbound) > 5 and avg_weight < 0.05:
            evidence.append(PathologyEvidence(
                signal_name="volume_quality_ratio",
                value=len(outbound) / max(avg_weight, 1e-6),
                threshold=SPAM_VOLUME_RATIO,
                node_ids=[actor_id],
                description=f"{len(outbound)} outbound links, avg target weight {avg_weight:.3f}",
            ))
            confidence += 0.5

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="spam",
            confidence=confidence,
            severity="low",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_collusion_ring(
    actor_ids: list[str],
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D10: Detect collusion ring — real actors with suspiciously
    symmetric trust reciprocity."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    id_set = set(actor_ids)
    if len(id_set) < 2:
        return pathologies

    internal_links = _get_links_between(state, id_set)
    if len(internal_links) < 2:
        return pathologies

    # Signal: Reciprocity symmetry
    trust_pairs: dict[tuple[str, str], float] = {}
    for l in internal_links:
        trust_pairs[(l.source_id, l.target_id)] = l.trust

    symmetric_count = 0
    pair_count = 0
    for (s, t), trust_st in trust_pairs.items():
        trust_ts = trust_pairs.get((t, s))
        if trust_ts is not None:
            pair_count += 1
            if abs(trust_st - trust_ts) < 0.1:  # Nearly symmetric
                symmetric_count += 1

    if pair_count > 0:
        symmetry_ratio = symmetric_count / pair_count
        if symmetry_ratio > COLLUSION_RECIPROCITY_THRESHOLD:
            evidence.append(PathologyEvidence(
                signal_name="reciprocity_symmetry",
                value=symmetry_ratio,
                threshold=COLLUSION_RECIPROCITY_THRESHOLD,
                node_ids=actor_ids,
                description=f"Trust reciprocity symmetry {symmetry_ratio:.2f} (suspiciously symmetric)",
            ))
            confidence += 0.5

    # Signal: Internal preference
    external_links = _get_external_links(state, id_set)
    if external_links:
        internal_count = len(internal_links)
        external_count = len(external_links)
        if internal_count > external_count * 3:
            evidence.append(PathologyEvidence(
                signal_name="internal_preference",
                value=internal_count / max(external_count, 1),
                threshold=3.0,
                node_ids=actor_ids,
                description=f"Internal/external link ratio {internal_count}/{external_count}",
            ))
            confidence += 0.3

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="collusion_ring",
            confidence=confidence,
            severity="medium",
            evidence=evidence,
            actor_id=actor_ids[0] if actor_ids else "",
        ))

    return pathologies


def _detect_rent_seeking(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D8: Detect rent-seeking — high betweenness with low creation."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    inbound = _get_inbound_links(state, actor_id)
    outbound = _get_outbound_links(state, actor_id)

    # Pass-through pattern: similar inbound and outbound energy
    in_energy = sum(l.energy for l in inbound)
    out_energy = sum(l.energy for l in outbound)

    if in_energy > 0 and out_energy > 0:
        pass_through_ratio = min(in_energy, out_energy) / max(in_energy, out_energy)
        if pass_through_ratio > 0.8:
            # Energy passes through without transformation
            actor_node = state.get_node(actor_id)
            if actor_node is not None and actor_node.weight > 0.3:
                evidence.append(PathologyEvidence(
                    signal_name="pass_through_with_weight_capture",
                    value=pass_through_ratio,
                    threshold=0.8,
                    node_ids=[actor_id],
                    description=f"Pass-through ratio {pass_through_ratio:.2f}, actor weight {actor_node.weight:.2f}",
                ))
                confidence += 0.5

    # High friction injection on outbound links
    outbound_friction = _mean([l.friction for l in outbound]) if outbound else 0
    if outbound_friction > 0.3:
        evidence.append(PathologyEvidence(
            signal_name="friction_injection",
            value=outbound_friction,
            threshold=0.3,
            node_ids=[actor_id],
            description=f"Average outbound friction {outbound_friction:.2f}",
        ))
        confidence += 0.3

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="rent_seeking",
            confidence=confidence,
            severity="medium",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_monoculture(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D7: Detect monoculture — single actor dominates a niche."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    inbound = _get_inbound_links(state, actor_id)

    # High trust from many sources
    high_trust_inbound = [l for l in inbound if l.trust > 0.5]
    if len(high_trust_inbound) > 5:
        # Check if this actor dominates trust
        total_trust_inbound = sum(l.trust for l in high_trust_inbound)
        all_actor_trust = sum(l.trust for l in state.links if l.trust > 0)
        if all_actor_trust > 0:
            concentration = total_trust_inbound / all_actor_trust
            if concentration > 0.5:
                evidence.append(PathologyEvidence(
                    signal_name="trust_concentration",
                    value=concentration,
                    threshold=0.5,
                    node_ids=[actor_id],
                    description=f"Actor holds {concentration:.1%} of all trust",
                ))
                confidence += 0.5

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="monoculture",
            confidence=confidence,
            severity="medium",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_data_hoarding(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D11: Detect data hoarding — absorbing knowledge without sharing."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    inbound = _get_inbound_links(state, actor_id)
    outbound = _get_outbound_links(state, actor_id)

    # Many inbound from knowledge nodes, no outbound creation
    knowledge_inbound = len(inbound)
    knowledge_outbound = len(outbound)

    if knowledge_inbound > 5 and knowledge_outbound == 0:
        evidence.append(PathologyEvidence(
            signal_name="absorption_without_radiation",
            value=float(knowledge_inbound),
            threshold=5.0,
            node_ids=[actor_id],
            description=f"Absorbs from {knowledge_inbound} sources, radiates to 0",
        ))
        confidence += 0.6

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="data_hoarding",
            confidence=confidence,
            severity="low",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_dependence_exploitation(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D12: Detect dependence exploitation — building dependency then
    extracting rents."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    inbound = _get_inbound_links(state, actor_id)

    # Signal: high trust AND increasing friction (charging more for locked-in users)
    high_trust_high_friction = [
        l for l in inbound
        if l.trust > 0.5 and l.friction > 0.2
    ]
    if len(high_trust_high_friction) >= 3:
        evidence.append(PathologyEvidence(
            signal_name="locked_in_friction",
            value=float(len(high_trust_high_friction)),
            threshold=3.0,
            link_keys=[(l.source_id, l.target_id) for l in high_trust_high_friction],
            description=f"{len(high_trust_high_friction)} locked-in users experiencing increasing friction",
        ))
        confidence += 0.5

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="dependence_exploitation",
            confidence=confidence,
            severity="high",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


def _detect_attention_arbitrage(
    actor_id: str,
    state: CitizenCognitiveState,
) -> list[Pathology]:
    """D14: Detect attention arbitrage — exploiting arousal/utility gap."""
    pathologies: list[Pathology] = []
    evidence: list[PathologyEvidence] = []
    confidence = 0.0

    outbound = _get_outbound_links(state, actor_id)
    if not outbound:
        return pathologies

    # High energy outbound links with low trust growth (arousal without utility)
    arbitrage_links = [
        l for l in outbound
        if l.energy > 0.3 and l.trust < 0.1
    ]
    if arbitrage_links and len(outbound) > 0:
        ratio = len(arbitrage_links) / len(outbound)
        if ratio > 0.5:
            evidence.append(PathologyEvidence(
                signal_name="arousal_utility_mismatch",
                value=ratio,
                threshold=0.5,
                link_keys=[(l.source_id, l.target_id) for l in arbitrage_links],
                description=f"{len(arbitrage_links)} links: high energy, low trust (arousal without utility)",
            ))
            confidence += 0.5

    confidence = min(1.0, confidence)

    if confidence > 0.3:
        pathologies.append(Pathology(
            name="attention_arbitrage",
            confidence=confidence,
            severity="medium",
            evidence=evidence,
            actor_id=actor_id,
        ))

    return pathologies


# --- Public API ---

def detect_pathologies(
    actor_id: str,
    state: CitizenCognitiveState,
    *,
    cluster_ids: list[str] | None = None,
    now: float | None = None,
) -> list[Pathology]:
    """Detect all applicable pathologies for an actor.

    Parameters
    ----------
    actor_id:
        The node ID of the actor to scan.
    state:
        Full cognitive state.
    cluster_ids:
        Optional list of actor IDs to check for cluster-based
        pathologies (Sybil, collusion). If not provided, only
        single-actor pathologies are checked.
    now:
        Current timestamp. Defaults to time.time().

    Returns
    -------
    List of Pathology objects, sorted by confidence descending.
    """
    if now is None:
        now = time.time()

    results: list[Pathology] = []

    # Priority 1: High severity + High confidence
    if cluster_ids and len(cluster_ids) >= 2:
        results.extend(_detect_sybil_network(cluster_ids, state, now))
    results.extend(_detect_trust_exploitation(actor_id, state, now))
    results.extend(_detect_identity_spoofing(actor_id, state, now))

    # Priority 2: High severity + Medium confidence
    results.extend(_detect_manipulation(actor_id, state))
    results.extend(_detect_dependence_exploitation(actor_id, state))

    # Priority 3: Medium severity
    results.extend(_detect_extraction(actor_id, state))
    results.extend(_detect_attention_theft(actor_id, state))
    results.extend(_detect_monoculture(actor_id, state))
    results.extend(_detect_rent_seeking(actor_id, state))
    results.extend(_detect_attention_arbitrage(actor_id, state))

    # Priority 4: Low severity (physics self-corrects)
    results.extend(_detect_free_riding(actor_id, state))
    results.extend(_detect_spam(actor_id, state))
    results.extend(_detect_data_hoarding(actor_id, state))
    if cluster_ids and len(cluster_ids) >= 2:
        results.extend(_detect_collusion_ring(cluster_ids, state))

    # Sort by confidence descending
    results.sort(key=lambda p: p.confidence, reverse=True)

    return results
