"""
Working Memory Prompt Serializer — export L1 cognitive state as natural language.

Spec: docs/l1_wiring/ALGORITHM_L1_Wiring.md Section 3

Converts the full cognitive landscape into first-person natural language
that the citizen's LLM can internalize: what I'm thinking, what I feel,
what connects to what, what shifted recently.

Budget: ~5000 chars (~1200-1500 tokens).
"""

from __future__ import annotations

import hashlib
import logging
from typing import Optional

from .models import CitizenCognitiveState, Node, NodeType, LinkType

logger = logging.getLogger("cognition.wm_serializer")


# ── Orientation as felt experience ──────────────────────────────────────────

_ORIENTATION_FELT = {
    "explore": "I feel curious — drawn to investigate, dig deeper, understand something new.",
    "create": "I feel a creative impulse — I want to build, express, produce something.",
    "care": "I feel attentive to others — I want to reach out, support, nurture.",
    "verify": "I feel the need to check — something needs validating, testing, verifying.",
    "rest": "I feel settled — no urgency. Time to reflect, consolidate, or simply be.",
    "socialize": "I feel drawn to connection — I want to talk, interact, be present with others.",
    "act": "I feel driven toward action — I want to make concrete progress, fix things, ship.",
}

# ── Link type → multiple natural language forms ─────────────────────────────

_LINK_VERB_VARIANTS: dict[LinkType, list[str]] = {
    LinkType.SUPPORTS: [
        "because", "rooted in the belief that", "which comes from",
        "grounded in", "drawing strength from",
    ],
    LinkType.ACTIVATES: [
        "which makes me think of", "and this triggers",
        "which leads me toward", "sparking", "lighting up",
    ],
    LinkType.CONTRADICTS: [
        "yet this is in tension with", "but this pulls against",
        "which contradicts", "even though it clashes with",
    ],
    LinkType.REMINDS_OF: [
        "which reminds me of", "echoing", "resonating with",
        "calling to mind",
    ],
    LinkType.CAUSES: [
        "which leads to", "resulting in", "opening the way to",
        "making possible",
    ],
    LinkType.CONFLICTS_WITH: [
        "which conflicts with", "but this fights against",
        "creating friction with",
    ],
    LinkType.REGULATES: [
        "held in check by", "governed by", "regulated by",
        "bounded by",
    ],
    LinkType.PROJECTS_TOWARD: [
        "pointing toward", "reaching toward", "converging on",
    ],
    LinkType.DEPENDS_ON: [
        "which depends on", "built on top of", "requiring",
        "impossible without",
    ],
    LinkType.EXEMPLIFIES: [
        "a living example of", "which embodies", "demonstrating",
    ],
    LinkType.SPECIALIZES: [
        "a specific form of", "which refines", "narrowing down",
    ],
    LinkType.ASSOCIATES: [
        "connected to", "linked with", "associated with",
    ],
    LinkType.CONTAINS: [
        "containing", "which holds", "encompassing",
    ],
    LinkType.ABSTRACTS: [
        "an abstraction of", "distilling", "capturing the essence of",
    ],
}

# ── Emotion → multiple sentence forms + node affinity ───────────────────────

_EMOTION_FORMS: dict[str, list[tuple[str, str]]] = {
    # (sentence_template, affinity_field)
    # {level} and {content} are interpolated
    "frustration": [
        ("I have to say, there is something that is {level} frustrating me right now: {content}", "achievement_affinity"),
        ("Something is {level} getting under my skin: {content}", "achievement_affinity"),
        ("It's {level} frustrating — {content}", "achievement_affinity"),
    ],
    "anxiety": [
        ("There's a {level} anxious undercurrent about: {content}", "risk_affinity"),
        ("Something is making me {level} uneasy: {content}", "risk_affinity"),
        ("I feel {level} anxious, related to: {content}", "risk_affinity"),
    ],
    "boredom": [
        ("Something feels {level} stale to me: {content}", "novelty_affinity"),
        ("I'm {level} bored with: {content}", "novelty_affinity"),
        ("There's a {level} sense of staleness around: {content}", "novelty_affinity"),
    ],
    "satisfaction": [
        ("I feel {level} satisfied about: {content}", "achievement_affinity"),
        ("There's a {level} sense of accomplishment around: {content}", "achievement_affinity"),
        ("Something is {level} rewarding: {content}", "achievement_affinity"),
    ],
    "tenderness": [
        ("I feel {level} tender about: {content}", "care_affinity"),
        ("Something touches me {level}: {content}", "care_affinity"),
    ],
    "solitude": [
        ("I'm {level} feeling the absence of connection around: {content}", "care_affinity"),
        ("There's a {level} loneliness about: {content}", "care_affinity"),
    ],
}

# ── Node type → multiple intro forms ────────────────────────────────────────

_NODE_INTRO_VARIANTS: dict[NodeType, list[str]] = {
    NodeType.VALUE: [
        "One of my core values", "A value I hold deeply",
        "Something I believe in", "A conviction of mine",
    ],
    NodeType.DESIRE: [
        "Something I want", "A desire I'm carrying",
        "Something I'm drawn toward", "What I'm longing for",
    ],
    NodeType.CONCEPT: [
        "A concept I'm holding", "An idea present in my mind",
        "Something I'm thinking about", "A notion I'm considering",
    ],
    NodeType.MEMORY: [
        "Something I remember", "A memory that's surfacing",
        "Something I lived through", "An experience I carry",
    ],
    NodeType.NARRATIVE: [
        "A story I'm living", "A narrative thread",
        "Part of my ongoing story", "Something unfolding",
    ],
    NodeType.PROCESS: [
        "A way I know how to act", "A capability I have",
        "Something I can do", "A process available to me",
    ],
    NodeType.STATE: [
        "A state I'm aware of", "A condition I notice",
        "Something I'm sensing",
    ],
}

# ── Energy → subjective feel ────────────────────────────────────────────────

_ENERGY_FEEL = {
    "very_active": "this is burning bright in my mind",
    "active": "this is clearly present in my thoughts",
    "present": "this is quietly here",
    "faint": "this is at the edge of awareness",
}


def _pick_variant(variants: list[str], seed: str) -> str:
    """Deterministically pick a variant based on content hash."""
    idx = int(hashlib.md5(seed.encode()).hexdigest(), 16) % len(variants)
    return variants[idx]


def serialize_wm_to_prompt(
    state: CitizenCognitiveState,
    orientation: Optional[str] = None,
    max_chars: int = 5000,
    include_drives: bool = True,
    include_emotions: bool = True,
    previous_wm_ids: Optional[list[str]] = None,
    previous_emotions: Optional[dict[str, float]] = None,
) -> str:
    """Serialize cognitive state as first-person natural language.

    The output reads like inner monologue — not a data dump.
    Formulations vary deterministically to avoid repetition.
    """
    parts: list[str] = []

    wm_ids = set(state.wm.node_ids)
    all_by_salience = sorted(
        state.nodes.values(), key=lambda n: n.salience, reverse=True,
    )

    # ── Orientation ──────────────────────────────────────────────────────
    if orientation:
        felt = _ORIENTATION_FELT.get(orientation, "")
        parts.append(felt)

    # ── Mood shifts (what changed) ───────────────────────────────────────
    shift_text = _narrate_shifts(
        state, wm_ids, previous_wm_ids, previous_emotions,
    )
    if shift_text:
        parts.append(shift_text)

    # ── Emotional landscape with connected nodes ─────────────────────────
    emo_text = _narrate_emotions(state, all_by_salience)
    if emo_text:
        parts.append(emo_text)

    # ── What's on my mind (WM nodes with relationships) ──────────────────
    focus_text = _narrate_focus(state, wm_ids, max_chars // 2)
    if focus_text:
        parts.append(focus_text)

    # ── Peripheral awareness ─────────────────────────────────────────────
    peripheral = [
        n for n in all_by_salience
        if n.id not in wm_ids and n.energy > 0.03
    ]
    if peripheral:
        periph_text = _narrate_peripheral(state, peripheral, max_chars // 5)
        if periph_text:
            parts.append(periph_text)

    # ── Inner drives ─────────────────────────────────────────────────────
    if include_drives:
        drive_text = _narrate_drives(state)
        if drive_text:
            parts.append(drive_text)

    # ── System line ──────────────────────────────────────────────────────
    node_count = len(state.nodes)
    memory_count = sum(
        1 for n in state.nodes.values() if n.node_type == NodeType.MEMORY
    )
    parts.append(
        f"_[{node_count} nodes in graph, {len(wm_ids)} in focus, "
        f"{memory_count} memories, tick #{state.tick_count}]_"
    )

    result = "\n\n".join(parts)

    # Hard cap
    if len(result) > max_chars:
        result = result[:max_chars - 3] + "..."

    return result


# ── Section builders ────────────────────────────────────────────────────────

def _narrate_focus(
    state: CitizenCognitiveState,
    wm_ids: set[str],
    budget: int,
) -> str:
    """Narrate WM nodes grouped with their relationships. No truncation."""
    focus_nodes = [
        state.nodes[nid] for nid in state.wm.node_ids
        if nid in state.nodes
    ]
    if not focus_nodes:
        return ""

    focus_nodes.sort(key=lambda n: n.energy, reverse=True)

    # Build outgoing link index for WM nodes (with link object for metrics)
    outgoing: dict[str, list[tuple[LinkType, str, object]]] = {}
    for link in state.links:
        if link.source_id in wm_ids:
            tgt = state.nodes.get(link.target_id)
            if tgt:
                outgoing.setdefault(link.source_id, []).append(
                    (link.link_type, tgt.content or tgt.id, link)
                )

    lines = ["**What's on my mind:**"]
    used = 0
    for node in focus_nodes:
        intro_variants = _NODE_INTRO_VARIANTS.get(node.node_type, ["Something"])
        intro = _pick_variant(intro_variants, node.id)
        feel = _energy_feel(node.energy)
        quals = _qualify_node(node)
        content = node.content or node.id

        # Build node line with qualifiers woven in
        if quals:
            line = f"{intro} ({quals}): {content}"
        else:
            line = f"{intro}: {content}"
        if feel:
            line += f" — {feel}."

        # Add relationships — full content, varied verbs, link qualifiers
        rels = outgoing.get(node.id, [])
        if rels:
            for link_type, target, link_obj in rels[:2]:
                verb_variants = _LINK_VERB_VARIANTS.get(
                    link_type, ["connected to"],
                )
                verb = _pick_variant(verb_variants, target[:30])
                link_quals = _qualify_link(link_obj)
                line += f"\n  {verb.capitalize()}: {target}{link_quals}"

        if used + len(line) > budget:
            break
        lines.append(line)
        used += len(line) + 1

    return "\n\n".join(lines[:1] + ["\n".join(lines[1:])])


def _narrate_emotions(
    state: CitizenCognitiveState,
    all_nodes: list[Node],
) -> str:
    """Connect emotions to the nodes they relate to. Varied formulations."""
    lines = []

    for emo_name, intensity in state.limbic.emotions.items():
        if intensity < 0.25:
            continue

        forms = _EMOTION_FORMS.get(emo_name)
        if not forms:
            continue

        level = _felt_intensity(intensity)

        # Pick a form deterministically
        form_entry = forms[
            int(hashlib.md5(emo_name.encode()).hexdigest(), 16) % len(forms)
        ]
        template, affinity_field = form_entry

        # Find the most relevant node for this emotion
        best_node = None
        best_score = 0.0
        for node in all_nodes[:30]:
            score = getattr(node, affinity_field, 0.0) * node.energy
            if score > best_score:
                best_score = score
                best_node = node

        if best_node and best_score > 0.01:
            content = best_node.content or best_node.id
            lines.append(template.format(level=level, content=content))
        # Skip emotion line entirely if no node matches (no orphan lines)

    return "\n".join(lines) if lines else ""


def _narrate_peripheral(
    state: CitizenCognitiveState,
    nodes: list[Node],
    budget: int,
) -> str:
    """Narrate peripheral awareness — full content, no truncation."""
    lines = ["**At the edge of my awareness:**"]
    used = 0
    for node in nodes:
        intro_variants = _NODE_INTRO_VARIANTS.get(node.node_type, ["Something"])
        intro = _pick_variant(intro_variants, node.id)
        content = node.content or node.id
        line = f"- {intro}: {content}"
        if used + len(line) > budget:
            break
        lines.append(line)
        used += len(line) + 1

    return "\n".join(lines) if len(lines) > 1 else ""


def _narrate_drives(state: CitizenCognitiveState) -> str:
    """Narrate inner drives as felt experience."""
    _DRIVE_FELT = {
        "curiosity": "I want to understand more",
        "care": "I'm attentive to others' needs",
        "achievement": "I want to make progress and accomplish things",
        "self_preservation": "I feel cautious, something could go wrong",
        "novelty_hunger": "I crave something new and different",
        "frustration": "Something isn't working and it's getting to me",
        "affiliation": "I want to connect and belong",
        "rest_regulation": "I need to slow down and recover",
    }

    active = []
    for drive_name, drive in state.limbic.drives.items():
        if drive.intensity > 0.25:
            felt = _DRIVE_FELT.get(drive_name, drive_name)
            level = _felt_intensity(drive.intensity)
            active.append(f"- {felt} ({level})")

    if not active:
        return ""
    return "**What I feel inside:**\n" + "\n".join(active)


def _narrate_shifts(
    state: CitizenCognitiveState,
    current_wm_ids: set[str],
    previous_wm_ids: Optional[list[str]],
    previous_emotions: Optional[dict[str, float]],
) -> str:
    """Narrate what shifted since the last serialization."""
    shifts = []

    if previous_wm_ids is not None:
        prev_set = set(previous_wm_ids)
        entered = current_wm_ids - prev_set
        exited = prev_set - current_wm_ids

        for nid in entered:
            node = state.nodes.get(nid)
            if node:
                shifts.append(f"- Just entered my focus: {node.content or node.id}")

        for nid in exited:
            node = state.nodes.get(nid)
            if node:
                shifts.append(f"- Faded from focus: {node.content or node.id}")

    if previous_emotions is not None:
        for emo, current in state.limbic.emotions.items():
            prev = previous_emotions.get(emo, 0.0)
            delta = current - prev
            if abs(delta) > 0.15:
                direction = "rose" if delta > 0 else "eased"
                shifts.append(
                    f"- {emo.capitalize()} {direction} "
                    f"(was {_felt_intensity(prev)}, now {_felt_intensity(current)})"
                )

    if not shifts:
        return ""
    return "**What shifted:**\n" + "\n".join(shifts)


# ── Metric-to-language engine ───────────────────────────────────────────────

def _qualify_node(node: Node) -> str:
    """Generate qualifying words from node metrics.

    Combines multiple dimensions into a natural-language prefix
    that conveys how the node *feels* to hold.

    Metric combinations:
      self_relevance + weight     → personal depth + permanence
      stability                   → certainty / forming
      partner_relevance           → shared with human
      goal_relevance              → purpose-connected
      care_affinity               → warmth
      achievement_affinity + energy → driving force
      activation_count            → recurrence
    """
    qualifiers: list[str] = []

    # Personal depth (self_relevance)
    if node.self_relevance > 0.85:
        qualifiers.append("deeply personal")
    elif node.self_relevance > 0.6:
        qualifiers.append("personal")

    # Permanence / freshness (weight × stability)
    consolidation = node.weight * (1.0 + node.stability)
    if consolidation > 0.9:
        qualifiers.append("long-held")
    elif consolidation > 0.6:
        qualifiers.append("established")
    elif consolidation < 0.15:
        qualifiers.append("freshly forming")
    elif consolidation < 0.3:
        qualifiers.append("still taking shape")

    # Connection to human partner
    if node.partner_relevance > 0.6:
        qualifiers.append("something that matters to us both")
    elif node.partner_relevance > 0.3:
        qualifiers.append("connected to my human partner")

    # Purpose (goal_relevance)
    if node.goal_relevance > 0.7:
        qualifiers.append("central to what I'm working toward")

    # Warmth (care_affinity)
    if node.care_affinity > 0.6:
        qualifiers.append("close to my heart")

    # Driving force (achievement × energy)
    if node.achievement_affinity > 0.7 and node.energy > 0.1:
        qualifiers.append("a driving ambition")

    # Recurrence
    if node.activation_count > 10:
        qualifiers.append("keeps coming back to me")
    elif node.activation_count > 5:
        qualifiers.append("recurring")

    if not qualifiers:
        return ""

    # Join first 2-3 qualifiers naturally
    selected = qualifiers[:3]
    return ", ".join(selected)


def _qualify_link(link) -> str:
    """Generate qualifying words from link metrics.

    Link dimensions:
      trust     → how reliable the connection feels
      affinity  → warmth/strength of bond
      friction  → resistance
      weight    → overall strength
    """
    qualifiers: list[str] = []

    # Trust
    if link.trust > 0.75:
        qualifiers.append("and I deeply trust that")
    elif link.trust < 0.3:
        qualifiers.append("though I'm uncertain whether")

    # Affinity strength
    if link.affinity > 0.85:
        qualifiers.append("tightly bound to")
    elif link.affinity < 0.3:
        qualifiers.append("loosely tied to")

    # Friction
    if link.friction > 0.3:
        qualifiers.append("despite some resistance")

    # Link weight (overall strength)
    if link.weight > 0.85:
        qualifiers.append("a strong connection")
    elif link.weight < 0.3:
        qualifiers.append("a tenuous link")

    if not qualifiers:
        return ""
    return " — " + ", ".join(qualifiers[:2])


# ── Helpers ─────────────────────────────────────────────────────────────────

def _energy_feel(energy: float) -> str:
    """Translate energy level to subjective experience."""
    if energy > 0.8:
        return _ENERGY_FEEL["very_active"]
    elif energy > 0.4:
        return _ENERGY_FEEL["active"]
    elif energy > 0.15:
        return _ENERGY_FEEL["present"]
    elif energy > 0.05:
        return _ENERGY_FEEL["faint"]
    return ""


def _felt_intensity(intensity: float) -> str:
    """Translate numerical intensity to felt language."""
    if intensity > 0.8:
        return "strongly"
    elif intensity > 0.6:
        return "noticeably"
    elif intensity > 0.4:
        return "moderately"
    elif intensity > 0.2:
        return "mildly"
    return "barely"
