"""
Energy Flow — Unified Traversal and Helpers

Schema v1.2 core physics primitives:
- energy_flows_through(): unified traversal function
- get_hot_links(): top-N link filter
- target_weight_factor(): sqrt(target.weight) reception

EVERY energy transfer must use energy_flows_through() to ensure:
1. Link energy is updated (attention)
2. Link weight grows (accumulated depth)

DOCS: docs/physics/algorithms/ALGORITHM_Physics_Schema_v1.2_Energy_Physics.md
"""

from typing import List, Dict, Any, Optional, Tuple
from math import sqrt

from runtime.physics.constants import (
    COLD_THRESHOLD,
    TOP_N_LINKS,
)


def target_weight_factor(weight: float) -> float:
    """
    Calculate reception factor based on target weight.

    v1.2: Important targets receive more (diminishing returns).

    Args:
        weight: Target node weight (unbounded)

    Returns:
        sqrt(weight) — reception factor
    """
    if weight <= 0:
        return 0.0
    return sqrt(weight)


def energy_flows_through(
    link: Dict[str, Any],
    amount: float,
    flow_axes: Optional[Dict[str, float]] = None,
    origin_weight: float = 1.0,
    target_weight: float = 1.0,
) -> Dict[str, Any]:
    """
    Unified traversal function — MUST be called on EVERY energy transfer.

    Updates link state:
    1. energy: link.energy += amount × link.weight (attention)
    2. weight: grows based on formula (accumulated depth)

    Args:
        link: Link dict with energy, weight fields
        amount: Energy amount flowing through
        flow_axes: Deprecated, ignored
        origin_weight: Weight of the origin node
        target_weight: Weight of the target node

    Returns:
        Updated link dict (also modifies in place)

    Formula:
        link.energy += amount × link.weight
        growth = (amount × origin_weight) / ((1 + link.weight) × target_weight)
        link.weight += growth
    """
    if amount <= 0:
        return link

    link_weight = link.get('weight', 1.0)
    current_energy = link.get('energy', 0.0)

    # 1. Energy transfer (attention)
    link['energy'] = current_energy + amount * link_weight

    # 2. Weight growth (accumulated depth)
    if target_weight <= 0:
        target_weight = 1.0

    growth = (amount * origin_weight) / ((1 + link_weight) * target_weight)
    link['weight'] = link_weight + growth

    return link


def get_hot_links(
    links: List[Dict[str, Any]],
    n: int = TOP_N_LINKS,
    threshold: float = COLD_THRESHOLD,
) -> List[Dict[str, Any]]:
    """
    Get top-N hot links by energy × weight.

    v1.2: Physics processes only hot links. Cold links stay in graph
    for paths/queries but are excluded from tick computation.

    Args:
        links: List of link dicts with energy and weight fields
        n: Maximum links to return (default TOP_N_LINKS=20)
        threshold: Minimum heat score (default COLD_THRESHOLD=0.01)

    Returns:
        Top N links with heat_score > threshold, sorted by heat_score descending
    """
    # Calculate heat scores
    scored = []
    for link in links:
        energy = link.get('energy', 0.0)
        weight = link.get('weight', 1.0)
        heat_score = energy * weight

        if heat_score > threshold:
            scored.append((link, heat_score))

    # Sort by heat score descending
    scored.sort(key=lambda x: x[1], reverse=True)

    # Return top N
    return [link for link, score in scored[:n]]


def calculate_flow(
    source_energy: float,
    rate: float,
    link_weight: float,
    emotion_factor: float,
) -> float:
    """
    Calculate energy flow amount using unified formula.

    v1.2 unified formula:
        flow = source.energy × rate × weight × emotion_factor

    Args:
        source_energy: Energy of the source node
        rate: Base rate (GENERATION_RATE, DRAW_RATE, BACKFLOW_RATE)
        link_weight: Link weight (unbounded, controls flow rate)
        emotion_factor: Emotion proximity factor

    Returns:
        Flow amount
    """
    return source_energy * rate * link_weight * emotion_factor


def calculate_received(flow: float, target_weight: float) -> float:
    """
    Calculate energy received by target.

    v1.2: received = flow × sqrt(target.weight)
    Important targets receive more (diminishing returns).

    Args:
        flow: Energy flow amount
        target_weight: Weight of the target node

    Returns:
        Energy received by target
    """
    return flow * target_weight_factor(target_weight)


def cool_link(
    link: Dict[str, Any],
    node_a: Dict[str, Any],
    node_b: Dict[str, Any],
    drain_rate: float = 0.3,
    weight_rate: float = 0.1,
) -> Tuple[Dict[str, Any], float, float]:
    """
    Cool a link by draining energy to nodes and growing weight.

    v1.2 link cooling (no arbitrary decay):
    1. Drain 30% of energy to connected nodes (50/50 split)
    2. Convert 10% of energy to permanent weight growth
    3. Total energy reduction = drain + weight conversion

    Args:
        link: Link dict to cool
        node_a: First connected node (modified in place)
        node_b: Second connected node (modified in place)
        drain_rate: Percentage to drain to nodes (default 0.3)
        weight_rate: Percentage to convert to weight (default 0.1)

    Returns:
        (updated_link, energy_to_a, energy_to_b)
    """
    current_energy = link.get('energy', 0.0)
    link_weight = link.get('weight', 1.0)

    if current_energy <= 0:
        return link, 0.0, 0.0

    # Calculate drain
    drain = current_energy * drain_rate

    # Split to nodes
    energy_to_a = drain * 0.5
    energy_to_b = drain * 0.5

    # Update node energies
    node_a['energy'] = node_a.get('energy', 0.0) + energy_to_a
    node_b['energy'] = node_b.get('energy', 0.0) + energy_to_b

    # Convert to weight growth
    node_a_weight = node_a.get('weight', 1.0)
    node_b_weight = node_b.get('weight', 1.0)

    if node_b_weight <= 0:
        node_b_weight = 1.0

    weight_energy = current_energy * weight_rate
    growth = (weight_energy * node_a_weight) / ((1 + link_weight) * node_b_weight)
    link['weight'] = link_weight + growth

    # Reduce energy
    link['energy'] = current_energy - drain - weight_energy

    return link, energy_to_a, energy_to_b


# =============================================================================
# EMBEDDING COLORING (v1.6.1)
# =============================================================================

def blend_embeddings(
    base_embedding: Optional[List[float]],
    incoming_embedding: Optional[List[float]],
    blend_weight: float,
) -> Optional[List[float]]:
    """
    Blend two embeddings with given weight.

    Formula: result = base × (1 - blend_weight) + incoming × blend_weight

    Args:
        base_embedding: Current embedding (or None)
        incoming_embedding: Incoming embedding to blend (or None)
        blend_weight: Weight for incoming [0, 1]

    Returns:
        Blended embedding, or whichever is non-None, or None if both None
    """
    if incoming_embedding is None:
        return base_embedding
    if base_embedding is None:
        return incoming_embedding

    if len(base_embedding) != len(incoming_embedding):
        return base_embedding  # Can't blend different dimensions

    # Clamp blend_weight to [0, 1]
    blend_weight = max(0.0, min(1.0, blend_weight))
    base_weight = 1.0 - blend_weight

    return [
        base_weight * b + blend_weight * i
        for b, i in zip(base_embedding, incoming_embedding)
    ]


def calculate_color_weight(permanence: float) -> float:
    """
    Calculate coloring weight from permanence.

    v1.6.1: color_weight = 1 - permanence
    - Low permanence (new links) → high color weight → easily colored
    - High permanence (old links) → low color weight → resistant to coloring

    Args:
        permanence: Link permanence in [0, 1)

    Returns:
        Color weight in (0, 1]
    """
    return 1.0 - permanence


def forward_color_link(
    link: Dict[str, Any],
    traverser_embedding: Optional[List[float]],
    energy_flow: float,
    inject_to_weight: bool = False,
) -> Tuple[Dict[str, Any], float]:
    """
    Apply forward coloring to a link during traversal.

    v1.6.1 Forward Coloring:
    1. color_weight = 1 - permanence (newer links more easily colored)
    2. blend_weight = flow / (flow + link.energy + 1) (energy-modulated)
    3. effective_blend = color_weight × blend_weight
    4. link.embedding = blend(link.embedding, traverser.embedding, effective_blend)
    5. link.energy += energy_flow (accumulation)

    v1.9 Addition:
    6. If inject_to_weight=True, permanence converts energy to weight
       weight_gain = energy_flow × permanence

    Args:
        link: Link dict to color (modified in place)
        traverser_embedding: Embedding of traversing SubEntity/intention
        energy_flow: Amount of energy flowing through
        inject_to_weight: If True, convert portion to weight via permanence (v1.9)

    Returns:
        Tuple of (updated link dict, weight_gained)
    """
    weight_gained = 0.0

    if traverser_embedding is None:
        # Still update energy even without embedding
        link['energy'] = link.get('energy', 0.0) + energy_flow
        return link, weight_gained

    # Get current state
    link_embedding = link.get('embedding')
    link_energy = link.get('energy', 0.0)
    link_weight = link.get('weight', 1.0)

    # 1. Calculate permanence and color weight
    permanence = link_weight / (link_weight + 1.0)
    color_weight = calculate_color_weight(permanence)

    # 2. Calculate energy-modulated blend weight
    blend_weight = energy_flow / (energy_flow + link_energy + 1.0)

    # 3. Effective blend = color_weight × blend_weight
    effective_blend = color_weight * blend_weight

    # 4. Blend embedding
    link['embedding'] = blend_embeddings(link_embedding, traverser_embedding, effective_blend)

    # 5. Accumulate energy
    link['energy'] = link_energy + energy_flow

    # 6. v1.9: Convert energy to weight via permanence (no decay)
    if inject_to_weight:
        weight_gained = energy_flow * permanence
        link['weight'] = link_weight + weight_gained

    return link, weight_gained


def compute_link_flow(
    link: Dict[str, Any],
    source_energy: float,
    source_id: str,
    alignment: float = 0.0,
    going_inward: bool = False,
) -> float:
    """
    Compute energy flow through a link during traversal (v1.9).

    Formula:
        if source == node_a:
            flow = source.energy × polarity[0] × link.weight
        else:
            flow = source.energy × polarity[1] × link.weight

        flow *= (1 + alignment)  # intention alignment boost

        if hierarchy < 0 and going_inward:
            flow *= (1 + abs(hierarchy))  # containers amplify inward

    Args:
        link: Link dict with polarity, weight, hierarchy
        source_energy: Energy of source node
        source_id: ID of source node
        alignment: Alignment with intention [0, 1]
        going_inward: True if traversing into a container

    Returns:
        Energy flow amount
    """
    node_a = link.get('node_a', '')
    polarity = link.get('polarity', [1.0, 1.0])
    link_weight = link.get('weight', 1.0)
    hierarchy = link.get('hierarchy', 0.0)

    # Direction-based polarity
    if source_id == node_a:
        flow = source_energy * polarity[0] * link_weight
    else:
        flow = source_energy * polarity[1] * link_weight

    # Alignment boost
    flow *= (1 + alignment)

    # Hierarchy amplification for inward traversal
    if hierarchy < 0 and going_inward:
        flow *= (1 + abs(hierarchy))

    return flow


def apply_link_traversal(
    link: Dict[str, Any],
    flow: float,
) -> Tuple[float, float]:
    """
    Apply traversal effects to a link (v1.9).

    Weight Gain (solidification):
        link.weight += flow × permanence
        High permanence = solidifies fast

    Energy Storage:
        link.energy += flow × (1 - permanence)
        High permanence = little energy stored (stable)
        Low permanence = lots of energy stored (volatile)

    Args:
        link: Link dict (modified in place)
        flow: Energy flow through the link

    Returns:
        Tuple of (weight_gained, energy_stored)
    """
    if flow <= 0:
        return (0.0, 0.0)

    link_weight = link.get('weight', 1.0)
    link_energy = link.get('energy', 0.0)
    permanence = link.get('permanence', link_weight / (link_weight + 1.0))

    # Weight gain: flow × permanence
    weight_gain = flow * permanence
    link['weight'] = link_weight + weight_gain

    # Energy storage: flow × (1 - permanence)
    energy_stored = flow * (1 - permanence)
    link['energy'] = link_energy + energy_stored

    return (weight_gain, energy_stored)


def inject_node_energy(
    node: Dict[str, Any],
    criticality: float,
    state_multiplier: float,
) -> float:
    """
    Inject SubEntity energy into a node (v1.9).

    Energy scales with node weight — heavier nodes get more energy.

    Formula:
        base = criticality × state_multiplier
        injection = base × node.weight
        node.energy += injection

    Args:
        node: Node dict to inject into (modified in place)
        criticality: SubEntity criticality (1 - satisfaction) × depth_factor
        state_multiplier: STATE_MULTIPLIER[state]

    Returns:
        Energy injected
    """
    base = criticality * state_multiplier
    if base <= 0:
        return 0.0

    node_weight = node.get('weight', 1.0)
    injection = base * node_weight

    node_energy = node.get('energy', 0.0)
    node['energy'] = node_energy + injection

    return injection


def add_node_weight_on_resonating(
    node: Dict[str, Any],
    criticality: float,
    resonating_multiplier: float = 2.0,
) -> float:
    """
    Add weight to node when SubEntity resonates (v1.9).

    Only called at RESONATING state. No permanence, no convergence bonus.
    Weight accumulates naturally if node resonates often.

    Formula:
        gain = criticality × STATE_MULTIPLIER[RESONATING]
        node.weight += gain

    Args:
        node: Node dict to modify (in place)
        criticality: SubEntity criticality
        resonating_multiplier: STATE_MULTIPLIER[RESONATING] (default 2.0)

    Returns:
        Weight gained
    """
    gain = criticality * resonating_multiplier
    if gain <= 0:
        return 0.0

    node_weight = node.get('weight', 1.0)
    node['weight'] = node_weight + gain

    return gain


def backward_color_path(
    path_links: List[Dict[str, Any]],
    final_embedding: Optional[List[float]],
    attenuation_rate: float = 0.7,
    permanence_boost: float = 0.1,
    inject_energy: float = 0.0,
) -> Tuple[List[Dict[str, Any]], float]:
    """
    Apply backward coloring along a traversal path.

    v1.6.1 Backward Coloring:
    1. Walk path in reverse
    2. Attenuate embedding by polarity[reverse] at each step
    3. Blend attenuated embedding into link
    4. Boost link permanence (weight grows)

    v1.9 Addition:
    5. If inject_energy > 0, inject same energy to each link, convert to weight via permanence
       (No attenuation — same mechanics as forward injection)

    This creates "memory traces" — links remember what found valuable paths through them.

    Args:
        path_links: Links in traversal order (first = earliest traversed)
        final_embedding: Embedding to propagate back (e.g., crystallization embedding)
        attenuation_rate: How much embedding decays per hop (default 0.7 = 30% loss)
        permanence_boost: How much to increase weight (default 0.1)
        inject_energy: v1.9 - Energy to inject per link (same amount each, no decay)

    Returns:
        Tuple of (updated path links, total weight gained)
    """
    total_weight_gained = 0.0

    if not path_links:
        return path_links, total_weight_gained

    # Start with the final embedding
    current_embedding = final_embedding[:] if final_embedding else None

    # Walk path in reverse
    for link in reversed(path_links):
        link_embedding = link.get('embedding')
        link_weight = link.get('weight', 1.0)
        link_energy = link.get('energy', 0.0)

        # Calculate permanence and color weight
        permanence = link_weight / (link_weight + 1.0)
        color_weight = calculate_color_weight(permanence)

        # Get reverse polarity (use stored or default to attenuation_rate)
        reverse_polarity = link.get('polarity_ba', attenuation_rate)
        if reverse_polarity < 0:
            reverse_polarity = abs(reverse_polarity) * attenuation_rate

        # Attenuate embedding (embedding attenuates, energy doesn't)
        if current_embedding:
            attenuation = reverse_polarity * attenuation_rate
            current_embedding = [v * attenuation for v in current_embedding]

            # Blend into link (smaller blend for backward)
            backward_blend = color_weight * 0.3  # 30% of forward blend strength
            link['embedding'] = blend_embeddings(link_embedding, current_embedding, backward_blend)

        # Boost permanence (weight grows)
        link['weight'] = link_weight + permanence_boost

        # v1.9: Inject energy and convert to weight via permanence
        # No attenuation — same amount injected to each link
        if inject_energy > 0:
            link['energy'] = link_energy + inject_energy
            weight_gain = inject_energy * permanence
            link['weight'] = link['weight'] + weight_gain
            total_weight_gained += weight_gain

    return path_links, total_weight_gained


def color_link_from_node(
    link: Dict[str, Any],
    node_embedding: Optional[List[float]],
    node_weight: float,
    blend_factor: float = 0.1,
) -> Dict[str, Any]:
    """
    Color a link with a node's embedding.

    Used when:
    - SubEntity passes through a node
    - Crystallization colors links to new narrative

    Args:
        link: Link dict to color
        node_embedding: Node's embedding
        node_weight: Node's weight (affects blend strength)
        blend_factor: Base blend factor (default 0.1)

    Returns:
        Updated link dict
    """
    if node_embedding is None:
        return link

    link_embedding = link.get('embedding')
    link_weight = link.get('weight', 1.0)

    # Permanence-modulated blend
    permanence = link_weight / (link_weight + 1.0)
    color_weight = calculate_color_weight(permanence)

    # Node weight affects influence
    node_influence = sqrt(node_weight) if node_weight > 0 else 0.5
    effective_blend = color_weight * blend_factor * node_influence

    link['embedding'] = blend_embeddings(link_embedding, node_embedding, effective_blend)

    return link


def accumulate_path_energy(
    path_links: List[Dict[str, Any]],
    energy_amount: float,
    decay_per_hop: float = 0.8,
) -> List[Dict[str, Any]]:
    """
    Accumulate energy along a traversal path with decay.

    Energy decreases as it propagates backward through the path.

    Args:
        path_links: Links in traversal order
        energy_amount: Starting energy amount
        decay_per_hop: Decay factor per hop (default 0.8 = 20% loss)

    Returns:
        Updated path links (also modified in place)
    """
    current_energy = energy_amount

    # Walk path in reverse (energy propagates back)
    for link in reversed(path_links):
        link['energy'] = link.get('energy', 0.0) + current_energy
        current_energy *= decay_per_hop

    return path_links


# =============================================================================
# SYNTHESIS REGENERATION (v1.9)
# =============================================================================
# Schema: synthesis regenerates on drift during SubEntity traversal
# drift_threshold = 1 - permanence
# Ticks deprecated - regeneration happens during traversal, not ticks

# Synthesis vocabulary (bilingual)
SYNTHESIS_VOCAB = {
    'en': {
        'fundamental': 'fundamental',
        'central': 'central',
        'important': 'important',
        'minor': 'minor',
        'intensely': 'intensely',
        'strongly': 'strongly',
        'weakly': 'weakly',
        'charged': 'charged',
    },
    'fr': {
        'fundamental': 'fondamental',
        'central': 'central',
        'important': 'important',
        'minor': 'mineur',
        'intensely': 'intensément',
        'strongly': 'fortement',
        'weakly': 'faiblement',
        'charged': 'chargé',
    }
}

DEFAULT_SYNTHESIS_LANG = 'en'


def check_synthesis_drift(
    link: Dict[str, Any],
    new_embedding: Optional[List[float]],
) -> bool:
    """
    Check if link synthesis needs regeneration based on embedding drift.

    v1.9: Called during SubEntity traversal (ticks deprecated).

    Formula:
        drift_threshold = 1 - permanence
        drift = 1 - cosine(old_embedding, new_embedding)
        needs_regen = drift > drift_threshold

    Low permanence (new links) → low threshold → regenerates easily
    High permanence (old links) → high threshold → resists regeneration

    Args:
        link: Link dict with 'embedding', 'weight' fields
        new_embedding: New embedding after coloring

    Returns:
        True if synthesis should be regenerated
    """
    if new_embedding is None:
        return False

    old_embedding = link.get('embedding')
    if old_embedding is None:
        # No previous embedding, definitely regenerate
        return True

    # Calculate permanence from weight
    weight = link.get('weight', 1.0)
    permanence = weight / (weight + 1.0)

    # drift_threshold = 1 - permanence
    # High permanence → high threshold → less likely to regenerate
    drift_threshold = 1.0 - permanence

    # Calculate drift as 1 - cosine_similarity
    from runtime.physics.link_scoring import cosine_similarity
    similarity = cosine_similarity(old_embedding, new_embedding)
    drift = 1.0 - similarity

    return drift > drift_threshold


def generate_link_synthesis(
    link: Dict[str, Any],
    source_name: str = "",
    target_name: str = "",
    lang: str = DEFAULT_SYNTHESIS_LANG,
) -> str:
    """
    Generate synthesis text for a link based on its properties.

    v1.9: Called during SubEntity traversal when drift exceeds threshold.

    Pattern: "[source] [intensity_mod] [nature] [target] ([importance])"
    Example: "Edmund intensely believes in the Oath (central)"

    Args:
        link: Link dict with nature, weight, energy fields
        source_name: Name of source node (optional)
        target_name: Name of target node (optional)
        lang: Language code ('en' or 'fr')

    Returns:
        Synthesis string
    """
    vocab = SYNTHESIS_VOCAB.get(lang, SYNTHESIS_VOCAB['en'])

    # Get link properties
    nature = link.get('nature', 'is linked to')
    weight = link.get('weight', 1.0)
    energy = link.get('energy', 0.0)

    # Determine importance modifier based on weight
    if weight >= 5.0:
        importance = vocab['fundamental']
    elif weight >= 3.0:
        importance = vocab['central']
    elif weight >= 1.5:
        importance = vocab['important']
    elif weight >= 0.5:
        importance = ""
    else:
        importance = vocab['minor']

    # Determine intensity modifier based on energy
    if energy >= 8.0:
        intensity = vocab['intensely']
    elif energy >= 5.0:
        intensity = vocab['strongly']
    elif energy >= 2.0:
        intensity = ""
    elif energy >= 0.5:
        intensity = vocab['weakly']
    else:
        intensity = ""

    # Build synthesis
    parts = []

    if source_name:
        parts.append(source_name)

    if intensity:
        parts.append(intensity)

    parts.append(nature)

    if target_name:
        parts.append(target_name)

    synthesis = " ".join(parts)

    if importance:
        synthesis = f"{synthesis} ({importance})"

    return synthesis


def regenerate_link_synthesis_if_drifted(
    link: Dict[str, Any],
    new_embedding: Optional[List[float]],
    source_name: str = "",
    target_name: str = "",
    lang: str = DEFAULT_SYNTHESIS_LANG,
) -> Tuple[bool, Optional[str]]:
    """
    Check drift and regenerate link synthesis if needed.

    v1.9: Called during SubEntity traversal after forward_color_link().
    Ticks are deprecated - this is the new mechanism for synthesis updates.

    Args:
        link: Link dict (modified in place if synthesis regenerated)
        new_embedding: New embedding after coloring
        source_name: Name of source node
        target_name: Name of target node
        lang: Language code

    Returns:
        Tuple of (was_regenerated, new_synthesis or None)
    """
    if not check_synthesis_drift(link, new_embedding):
        return (False, None)

    # Regenerate synthesis
    new_synthesis = generate_link_synthesis(link, source_name, target_name, lang)
    link['synthesis'] = new_synthesis

    return (True, new_synthesis)


def generate_node_synthesis(
    node_type: str,
    props: Dict[str, Any],
    lang: str = DEFAULT_SYNTHESIS_LANG,
) -> str:
    """
    Generate synthesis text for a node based on its type and properties.

    v1.9: Called during SubEntity traversal when energy injection causes drift.

    Pattern: "[name], [modifiers] ([importance])"
    Examples:
    - Actor: "Edmund, intensely present (central)"
    - Space: "the Great Hall, charged"
    - Thing: "an ancient sword, significant (important)"

    Args:
        node_type: Node type (Actor, Space, Thing, Narrative, Moment)
        props: Node properties dict
        lang: Language code ('en' or 'fr')

    Returns:
        Synthesis string
    """
    vocab = SYNTHESIS_VOCAB.get(lang, SYNTHESIS_VOCAB['en'])
    name = props.get("name", props.get("id", "unknown"))
    weight = props.get("weight", 1.0)
    energy = props.get("energy", 0.0)

    # Determine importance modifier based on weight
    if weight >= 5.0:
        importance = vocab['fundamental']
    elif weight >= 3.0:
        importance = vocab['central']
    elif weight >= 1.5:
        importance = vocab['important']
    elif weight >= 0.5:
        importance = ""
    else:
        importance = vocab['minor']

    # Determine energy modifier
    if energy >= 8.0:
        energy_mod = vocab['intensely']
    elif energy >= 5.0:
        energy_mod = vocab['strongly']
    elif energy >= 2.0:
        energy_mod = ""
    elif energy >= 0.5:
        energy_mod = vocab['weakly']
    else:
        energy_mod = ""

    # Build synthesis based on node type
    if node_type == "Actor":
        status = "present" if props.get("alive", True) else "dead"
        parts = [name]
        if energy_mod:
            parts.append(f"{energy_mod} {status}")
        else:
            parts.append(status)
        if importance:
            return f"{', '.join(parts)} ({importance})"
        return ", ".join(parts)

    elif node_type == "Space":
        atmosphere = props.get("atmosphere", {})
        mood = atmosphere.get("mood", "") if isinstance(atmosphere, dict) else ""
        parts = [name]
        if mood:
            parts.append(mood)
        elif energy_mod:
            parts.append(f"{energy_mod} {vocab['charged']}")
        if importance:
            return f"{', '.join(parts)} ({importance})"
        return ", ".join(parts)

    elif node_type == "Thing":
        significance = props.get("significance", "mundane")
        parts = [name]
        if significance and significance != "mundane":
            parts.append(significance)
        if importance:
            return f"{', '.join(parts)} ({importance})"
        return ", ".join(parts)

    elif node_type == "Narrative":
        narr_type = props.get("type", "")
        parts = [name]
        if narr_type:
            parts.append(narr_type)
        if importance:
            return f"{', '.join(parts)} ({importance})"
        return ", ".join(parts)

    elif node_type == "Moment":
        status = props.get("status", "possible")
        return f"{name} ({status})"

    # Default
    return name


def regenerate_node_synthesis_if_drifted(
    node: Dict[str, Any],
    node_type: str,
    new_embedding: Optional[List[float]],
    lang: str = DEFAULT_SYNTHESIS_LANG,
) -> Tuple[bool, Optional[str]]:
    """
    Check drift and regenerate node synthesis if needed.

    v1.9: Called during SubEntity traversal after inject_node_energy().
    Uses same drift formula as links: drift_threshold = 1 - permanence

    Args:
        node: Node dict (modified in place if synthesis regenerated)
        node_type: Node type string
        new_embedding: New embedding after energy injection
        lang: Language code

    Returns:
        Tuple of (was_regenerated, new_synthesis or None)
    """
    if new_embedding is None:
        return (False, None)

    old_embedding = node.get('embedding')
    if old_embedding is None:
        # No previous embedding, regenerate
        new_synthesis = generate_node_synthesis(node_type, node, lang)
        node['synthesis'] = new_synthesis
        return (True, new_synthesis)

    # Calculate permanence from weight
    weight = node.get('weight', 1.0)
    permanence = node.get('permanence', weight / (weight + 1.0))

    # drift_threshold = 1 - permanence
    drift_threshold = 1.0 - permanence

    # Calculate drift
    from runtime.physics.link_scoring import cosine_similarity
    similarity = cosine_similarity(old_embedding, new_embedding)
    drift = 1.0 - similarity

    if drift <= drift_threshold:
        return (False, None)

    # Regenerate synthesis
    new_synthesis = generate_node_synthesis(node_type, node, lang)
    node['synthesis'] = new_synthesis

    return (True, new_synthesis)
