"""
Synthesis Unfolding (v1.9)

Converts compact synthesis strings to readable prose.

Stored (compact):
  Node: "surprenant fiable la Révélation du Servant, incandescente (en cours)"
  Link: "soudain définitivement établit, avec admiration"

Presented (prose):
  Node: "La narrative **Révélation du Servant**, surprenamment fiable, est incandescente et en cours."
  Link: "Elle a soudain, définitivement, établi, avec admiration, la **Vérité Cachée**."

Patterns: docs/physics/cluster-presentation/PATTERNS_Cluster_Presentation.md
Algorithm: docs/physics/cluster-presentation/ALGORITHM_Cluster_Presentation.md
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, List, Tuple
import re


# =============================================================================
# PARSED STRUCTURES
# =============================================================================

@dataclass
class ParsedNodeSynthesis:
    """Parsed components of a node synthesis."""
    prefixes: List[str]      # Emotion prefixes: ["surprising", "reliable"]
    name: str                # Core name: "the Revelation"
    energy: str              # Energy level: "incandescent"
    status: Optional[str]    # Status: "ongoing" or None


@dataclass
class ParsedLinkSynthesis:
    """Parsed components of a link synthesis."""
    pre_modifiers: List[str]   # Before verb: ["suddenly", "definitively"]
    verb: str                  # Base verb: "establishes"
    post_modifiers: List[str]  # After verb: ["with admiration"]


# =============================================================================
# ADJECTIVE TO ADVERB CONVERSION
# =============================================================================

# French adjective → adverb mappings (common cases)
FRENCH_ADVERB_MAP = {
    # Emotion adjectives
    'surprenant': 'surprenamment',
    'fiable': 'fiablement',
    'confiant': 'avec confiance',
    'méfiant': 'avec méfiance',
    'admiratif': 'avec admiration',
    'dégoûté': 'avec dégoût',
    'craintif': 'craintivement',
    'désireux': 'désireusement',
    'joyeux': 'joyeusement',
    'triste': 'tristement',
    'rageur': 'rageusement',
    'serein': 'sereinement',
    'tendu': 'avec tension',
    'excité': 'avec excitation',
    # Certainty adjectives
    'définitif': 'définitivement',
    'probable': 'probablement',
    'possible': 'possiblement',
    'certain': 'certainement',
    'clair': 'clairement',
    'évident': 'évidemment',
    'soudain': 'soudainement',
    'inattendu': 'de manière inattendue',
    'inévitable': 'inévitablement',
}

# English adjective → adverb mappings
ENGLISH_ADVERB_MAP = {
    'surprising': 'surprisingly',
    'reliable': 'reliably',
    'confident': 'confidently',
    'suspicious': 'suspiciously',
    'admiring': 'admiringly',
    'disgusted': 'with disgust',
    'fearful': 'fearfully',
    'eager': 'eagerly',
    'joyful': 'joyfully',
    'sad': 'sadly',
    'angry': 'angrily',
    'serene': 'serenely',
    'tense': 'tensely',
    'excited': 'excitedly',
    'definitive': 'definitively',
    'probable': 'probably',
    'possible': 'possibly',
    'certain': 'certainly',
    'clear': 'clearly',
    'obvious': 'obviously',
    'sudden': 'suddenly',
    'unexpected': 'unexpectedly',
    'inevitable': 'inevitably',
}


def to_adverb(adjective: str, lang: str = 'fr') -> str:
    """
    Convert adjective to adverb.

    Uses lookup table first, then applies grammatical rules.
    """
    adj_lower = adjective.lower().strip()

    # Check lookup table
    if lang == 'fr':
        if adj_lower in FRENCH_ADVERB_MAP:
            return FRENCH_ADVERB_MAP[adj_lower]

        # French rules: add -ment to feminine form
        if adj_lower.endswith('eux'):
            return adj_lower[:-1] + 'sement'
        if adj_lower.endswith('f'):
            return adj_lower[:-1] + 'vement'
        if adj_lower.endswith('e'):
            return adj_lower + 'ment'
        return adj_lower + 'ement'

    else:  # English
        if adj_lower in ENGLISH_ADVERB_MAP:
            return ENGLISH_ADVERB_MAP[adj_lower]

        # English rules
        if adj_lower.endswith('y'):
            return adj_lower[:-1] + 'ily'
        if adj_lower.endswith('le'):
            return adj_lower[:-2] + 'ly'
        if adj_lower.endswith('ic'):
            return adj_lower + 'ally'
        return adj_lower + 'ly'


# =============================================================================
# VERB TO PARTICIPLE CONVERSION
# =============================================================================

# French verb → participle mappings
FRENCH_PARTICIPLE_MAP = {
    'établit': 'établi',
    'déclenche': 'déclenché',
    'précède': 'précédé',
    'mène': 'mené',
    'contient': 'contenu',
    'crée': 'créé',
    'détruit': 'détruit',
    'modifie': 'modifié',
    'interpelle': 'interpellé',
    'bloque': 'bloqué',
    'dépend': 'dépendu',
}

# English verb → participle mappings
ENGLISH_PARTICIPLE_MAP = {
    'establishes': 'established',
    'triggers': 'triggered',
    'precedes': 'preceded',
    'leads': 'led',
    'contains': 'contained',
    'creates': 'created',
    'destroys': 'destroyed',
    'modifies': 'modified',
    'challenges': 'challenged',
    'blocks': 'blocked',
    'depends': 'depended',
}


def to_participle(verb: str, lang: str = 'fr') -> str:
    """
    Convert verb to past participle.

    Uses lookup table first, then applies grammatical rules.
    """
    verb_lower = verb.lower().strip()

    if lang == 'fr':
        if verb_lower in FRENCH_PARTICIPLE_MAP:
            return FRENCH_PARTICIPLE_MAP[verb_lower]

        # French rules
        if verb_lower.endswith('er'):
            return verb_lower[:-2] + 'é'
        if verb_lower.endswith('ir'):
            return verb_lower[:-2] + 'i'
        if verb_lower.endswith('re'):
            return verb_lower[:-2] + 'u'
        return verb_lower

    else:  # English
        if verb_lower in ENGLISH_PARTICIPLE_MAP:
            return ENGLISH_PARTICIPLE_MAP[verb_lower]

        # English rules
        if verb_lower.endswith('e'):
            return verb_lower + 'd'
        if verb_lower.endswith('y') and len(verb_lower) > 2 and verb_lower[-2] not in 'aeiou':
            return verb_lower[:-1] + 'ied'
        # Check for consonant doubling
        if len(verb_lower) > 2 and verb_lower[-1] in 'bdgmnpt' and verb_lower[-2] in 'aeiou':
            return verb_lower + verb_lower[-1] + 'ed'
        return verb_lower + 'ed'


# =============================================================================
# NODE SYNTHESIS PARSING
# =============================================================================

# Patterns for node synthesis
# Format: "{prefixes} {name}, {energy} ({status})"
# Example: "surprenant fiable la Révélation du Servant, incandescente (en cours)"

ENERGY_WORDS = {
    # French
    'incandescente', 'incandescent', 'brûlante', 'brûlant',
    'chaude', 'chaud', 'tiède', 'froide', 'froid', 'glaciale', 'glacial',
    # English
    'incandescent', 'burning', 'hot', 'warm', 'lukewarm', 'cool', 'cold', 'freezing',
    # Intensifiers
    'intensément', 'faiblement', 'modérément',
    'intensely', 'weakly', 'moderately',
}

STATUS_WORDS = {
    # French
    'en cours', 'accompli', 'possible', 'central', 'actif', 'urgent', 'bloqué',
    # English
    'ongoing', 'completed', 'possible', 'central', 'active', 'urgent', 'blocked',
}


def parse_node_synthesis(synthesis: str) -> ParsedNodeSynthesis:
    """
    Parse a compact node synthesis into components.

    Input: "surprenant fiable la Révélation du Servant, incandescente (en cours)"
    Output: ParsedNodeSynthesis(
        prefixes=["surprenant", "fiable"],
        name="la Révélation du Servant",
        energy="incandescente",
        status="en cours"
    )
    """
    text = synthesis.strip()

    # Extract status if present (in parentheses)
    status = None
    status_match = re.search(r'\(([^)]+)\)$', text)
    if status_match:
        status = status_match.group(1)
        text = text[:status_match.start()].strip()

    # Split by comma to separate name from energy
    parts = text.rsplit(',', 1)
    energy = ''
    name_part = text

    if len(parts) == 2:
        name_part = parts[0].strip()
        energy = parts[1].strip()

    # Extract prefixes (words before the name)
    # The name typically starts with an article (le, la, the, a, an) or a capital
    prefixes = []
    words = name_part.split()

    # Find where the name starts
    name_start = 0
    for i, word in enumerate(words):
        word_lower = word.lower()
        # Check if this is an article or the start of the actual name
        if word_lower in ('le', 'la', 'les', 'l', "l'", 'the', 'a', 'an') or word[0].isupper():
            name_start = i
            break
        prefixes.append(word)

    name = ' '.join(words[name_start:])

    return ParsedNodeSynthesis(
        prefixes=prefixes,
        name=name,
        energy=energy,
        status=status,
    )


# =============================================================================
# LINK SYNTHESIS PARSING
# =============================================================================

# Patterns for link synthesis
# Format: "{pre_modifiers} {verb}, {post_modifiers}"
# Example: "soudain définitivement établit, avec admiration"


def parse_link_synthesis(synthesis: str) -> ParsedLinkSynthesis:
    """
    Parse a compact link synthesis into components.

    Input: "soudain définitivement établit, avec admiration"
    Output: ParsedLinkSynthesis(
        pre_modifiers=["soudain", "définitivement"],
        verb="établit",
        post_modifiers=["avec admiration"]
    )
    """
    text = synthesis.strip()

    # Split by comma to separate verb from post-modifiers
    parts = text.split(',', 1)
    verb_part = parts[0].strip()
    post_modifiers = []

    if len(parts) == 2:
        post = parts[1].strip()
        if post:
            post_modifiers = [post]

    # The verb is typically the last word before the comma
    words = verb_part.split()
    if not words:
        return ParsedLinkSynthesis(
            pre_modifiers=[],
            verb='',
            post_modifiers=post_modifiers,
        )

    verb = words[-1]
    pre_modifiers = words[:-1]

    return ParsedLinkSynthesis(
        pre_modifiers=pre_modifiers,
        verb=verb,
        post_modifiers=post_modifiers,
    )


# =============================================================================
# UNFOLDING TO PROSE
# =============================================================================

def unfold_node(
    synthesis: str,
    node_type: str = 'narrative',
    lang: str = 'fr',
) -> str:
    """
    Unfold a node synthesis to prose.

    Template (FR): {Le/La} {node_type} **{name}**, {préfixes en adverbes}, est {énergie} {et status}.
    Template (EN): The {node_type} **{name}**, {prefixes as adverbs}, is {energy} {and status}.

    Input: "surprenant fiable la Révélation du Servant, incandescente (en cours)"
    Output: "La narrative **Révélation du Servant**, surprenamment et fiablement, est incandescente et en cours."
    """
    parsed = parse_node_synthesis(synthesis)

    # Convert prefixes to adverbs
    adverbs = [to_adverb(p, lang) for p in parsed.prefixes]
    adverb_str = ' et '.join(adverbs) if lang == 'fr' else ' and '.join(adverbs)

    # Build prose
    if lang == 'fr':
        article = 'La' if node_type in ('narrative', 'chose', 'tension') else 'Le'
        result = f"{article} {node_type} **{parsed.name}**"
        if adverbs:
            result += f", {adverb_str}"
        if parsed.energy:
            result += f", est {parsed.energy}"
        if parsed.status:
            result += f" et {parsed.status}"
        result += "."
    else:
        result = f"The {node_type} **{parsed.name}**"
        if adverbs:
            result += f", {adverb_str}"
        if parsed.energy:
            result += f", is {parsed.energy}"
        if parsed.status:
            result += f" and {parsed.status}"
        result += "."

    return result


def unfold_link(
    synthesis: str,
    target_name: str,
    lang: str = 'fr',
) -> str:
    """
    Unfold a link synthesis to prose.

    Template (FR): {Pronom} a {pré-modifieurs} {verbe participe}, {post-modifieurs}, {le/la} **{target.name}**.
    Template (EN): It {pre-modifiers}, {verb participle}, {post-modifiers}, the **{target.name}**.

    Input: "soudain définitivement établit, avec admiration"
    Output: "Elle a soudainement, définitivement, établi, avec admiration, la **Vérité Cachée**."
    """
    parsed = parse_link_synthesis(synthesis)

    # Convert pre-modifiers to adverbs
    pre_adverbs = [to_adverb(m, lang) for m in parsed.pre_modifiers]
    pre_str = ', '.join(pre_adverbs)

    # Convert verb to participle
    participle = to_participle(parsed.verb, lang)

    # Post-modifiers stay as-is
    post_str = ', '.join(parsed.post_modifiers)

    # Build prose
    if lang == 'fr':
        result = "Elle a"
        if pre_str:
            result += f" {pre_str},"
        result += f" {participle}"
        if post_str:
            result += f", {post_str}"
        result += f", **{target_name}**."
    else:
        result = "It"
        if pre_str:
            result += f" {pre_str},"
        result += f" {participle}"
        if post_str:
            result += f", {post_str}"
        result += f", **{target_name}**."

    return result


def unfold_node_link_node(
    source_name: str,
    link_synthesis: str,
    target_name: str,
    lang: str = 'fr',
) -> str:
    """
    Create prose for a traversal step: source → link → target.

    Input: ("La Révélation", "soudain définitivement établit, avec admiration", "La Vérité")
    Output: "La Révélation soudain définitivement établit la Vérité, avec admiration."
    """
    parsed = parse_link_synthesis(link_synthesis)

    # Pre-modifiers as adverbs
    pre_adverbs = ' '.join(to_adverb(m, lang) for m in parsed.pre_modifiers)

    # Post-modifiers
    post_str = ', '.join(parsed.post_modifiers)

    # Build prose
    result = source_name
    if pre_adverbs:
        result += f" {pre_adverbs}"
    result += f" {parsed.verb}"
    result += f" {target_name}"
    if post_str:
        result += f", {post_str}"
    result += "."

    return result


# =============================================================================
# COMPACT FORMAT (for storage)
# =============================================================================

def compact_node(
    name: str,
    prefixes: List[str],
    energy: str,
    status: Optional[str] = None,
) -> str:
    """
    Create compact node synthesis for storage.

    Output: "surprenant fiable la Révélation, incandescente (en cours)"
    """
    parts = []
    if prefixes:
        parts.extend(prefixes)
    parts.append(name)

    result = ' '.join(parts)
    if energy:
        result += f", {energy}"
    if status:
        result += f" ({status})"

    return result


def compact_link(
    verb: str,
    pre_modifiers: List[str],
    post_modifiers: List[str],
) -> str:
    """
    Create compact link synthesis for storage.

    Output: "soudain définitivement établit, avec admiration"
    """
    parts = pre_modifiers + [verb]
    result = ' '.join(parts)

    if post_modifiers:
        result += ', ' + ', '.join(post_modifiers)

    return result
