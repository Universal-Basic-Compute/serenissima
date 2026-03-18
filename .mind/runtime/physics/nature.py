"""
Nature — Semantic to Physics Conversion

Universal vocabulary for nodes AND links.
Same nature string → same physics floats, regardless of entity type.

Flow: nature string -> physics floats -> apply to node or link

Structure: [pre_modifiers] + verb + [, post_modifiers]
Example: "suddenly proves, with admiration"

Usage:
    from runtime.physics.nature import nature_to_floats, get_nature_reference

    # Works for links
    link_floats = nature_to_floats("suddenly proves, with admiration")

    # Same function for nodes
    node_floats = nature_to_floats("urgent, with confidence")

    # Both return: {permanence, energy, ...}
    # Entity interprets floats in its context
"""

from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import yaml


# =============================================================================
# LOAD NATURE DEFINITIONS FROM YAML
# =============================================================================

_NATURE_PATH = Path(__file__).parent / "nature_physics.yaml"
_nature_cache: Optional[Dict] = None


def _load_nature() -> Dict:
    """Load nature definitions from YAML file (cached)."""
    global _nature_cache
    if _nature_cache is None:
        with open(_NATURE_PATH, 'r', encoding='utf-8') as f:
            _nature_cache = yaml.safe_load(f)
    return _nature_cache


def _get_all_verbs() -> Dict[str, Dict]:
    """Combine all verb categories into single dict."""
    nature = _load_nature()
    all_verbs = {}
    verb_categories = [
        'core_verbs', 'evidential_verbs', 'structural_verbs',
        'actor_verbs', 'temporal_verbs', 'spatial_verbs'
    ]
    for category in verb_categories:
        if category in nature:
            all_verbs.update(nature[category])
    return all_verbs


# =============================================================================
# ACCESSORS
# =============================================================================

def get_defaults() -> Dict[str, Any]:
    """Return default physics floats."""
    return dict(_load_nature().get('defaults', {
        'hierarchy': 0.0,
        'polarity': [0.5, 0.5],
        'permanence': 0.5,
        'energy': None,
        'trust': 0.0,
        'surprise': 0.0,
        'weight': None,
    }))


def get_pre_modifiers() -> Dict[str, Dict]:
    """Get pre-modifiers."""
    return _load_nature().get('pre_modifiers', {})


def get_post_modifiers() -> Dict[str, Dict]:
    """Get post-modifiers."""
    return _load_nature().get('post_modifiers', {})


def get_weight_annotations() -> Dict[str, Dict]:
    """Get weight annotations."""
    return _load_nature().get('weight_annotations', {})


def get_intensifiers() -> Dict[str, List[str]]:
    """Get intensifiers (attenuated/intensified verb forms)."""
    return _load_nature().get('intensifiers', {})


def get_translations(lang: str = 'en') -> Dict[str, str]:
    """Get translations for specified language."""
    translations = _load_nature().get('translations', {})
    return translations.get(lang, translations.get('en', {}))


def get_synonyms() -> Dict[str, List[str]]:
    """Get synonym mappings (canonical → [synonyms])."""
    return _load_nature().get('synonyms', {})


def _build_reverse_synonyms() -> Dict[str, str]:
    """Build reverse mapping: synonym → canonical."""
    synonyms = get_synonyms()
    reverse = {}
    for canonical, syns in synonyms.items():
        for syn in syns:
            reverse[syn.lower()] = canonical
    return reverse


_reverse_synonyms_cache: Optional[Dict[str, str]] = None


def resolve_synonym(term: str) -> str:
    """Resolve a term to its canonical form if it's a synonym."""
    global _reverse_synonyms_cache
    if _reverse_synonyms_cache is None:
        _reverse_synonyms_cache = _build_reverse_synonyms()

    term_lower = term.lower().strip()
    return _reverse_synonyms_cache.get(term_lower, term)


# =============================================================================
# PARSING
# =============================================================================

def _resolve_nature_string(nature: str) -> str:
    """
    Resolve synonyms in a nature string.

    Tries to find and replace synonym phrases with canonical forms.
    Uses word-boundary matching to avoid substring replacements.
    """
    import re
    global _reverse_synonyms_cache
    if _reverse_synonyms_cache is None:
        _reverse_synonyms_cache = _build_reverse_synonyms()

    nature_lower = nature.lower().strip()

    # Try to match synonyms, longest first for multi-word matches
    # Use word boundaries to avoid substring matches (e.g., "solves" in "resolves")
    for syn in sorted(_reverse_synonyms_cache.keys(), key=len, reverse=True):
        # Build regex with word boundaries
        pattern = r'\b' + re.escape(syn) + r'\b'
        if re.search(pattern, nature_lower):
            canonical = _reverse_synonyms_cache[syn]
            nature_lower = re.sub(pattern, canonical, nature_lower, count=1)

    return nature_lower


def parse_nature(nature: str) -> Tuple[List[str], str, List[str]]:
    """
    Parse a nature string into components.

    Format: [pre_modifiers] + verb + [, post_modifiers]

    Returns: (pre_modifiers, verb, post_modifiers)

    Synonyms are automatically resolved to canonical forms.
    """
    all_verbs = _get_all_verbs()
    pre_modifiers = get_pre_modifiers()
    post_modifiers = get_post_modifiers()

    # Resolve synonyms first
    nature = _resolve_nature_string(nature)

    # Split on comma for post-modifiers
    if ',' in nature:
        main_part, post_part = nature.split(',', 1)
        post_mods_raw = [post_part.strip()]
    else:
        main_part = nature
        post_mods_raw = []

    # Resolve post-modifiers to canonical forms
    post_mods = []
    for mod in post_mods_raw:
        resolved = resolve_synonym(mod)
        if resolved in post_modifiers:
            post_mods.append(resolved)
        elif mod in post_modifiers:
            post_mods.append(mod)
        else:
            post_mods.append(mod)  # Keep as-is if not found

    # Find the verb (longest match from all verbs)
    found_verb = None
    found_pos = -1

    for verb in sorted(all_verbs.keys(), key=len, reverse=True):
        pos = main_part.find(verb)
        if pos != -1:
            found_verb = verb
            found_pos = pos
            break

    if found_verb is None:
        return [], main_part.strip(), post_mods

    # Extract pre-modifiers
    pre_part = main_part[:found_pos].strip()
    pre_mods = []

    if pre_part:
        for mod in sorted(pre_modifiers.keys(), key=len, reverse=True):
            if mod in pre_part:
                pre_mods.append(mod)
                pre_part = pre_part.replace(mod, '').strip()

    return pre_mods, found_verb, post_mods


def nature_to_floats(nature: str) -> Dict[str, Any]:
    """
    Convert a nature string to physics floats.

    Args:
        nature: Nature string like "suddenly proves, with admiration"

    Returns:
        Dict with physics floats
    """
    floats, _ = parse_with_conflicts(nature)
    return floats


def parse_with_conflicts(nature: str) -> Tuple[Dict[str, Any], List[Dict]]:
    """
    Parse nature string and detect conflicts.

    Returns:
        (floats, conflicts) where conflicts lists overwritten values
    """
    all_verbs = _get_all_verbs()
    pre_modifiers = get_pre_modifiers()
    post_modifiers = get_post_modifiers()
    weight_annotations = get_weight_annotations()

    pre_mods, verb, post_mods = parse_nature(nature)
    defaults = get_defaults()
    floats = get_defaults()
    conflicts = []

    def apply_values(values: Dict, source: str):
        for key, value in values.items():
            if key in ['type_a', 'type_b']:
                continue
            if key in floats and floats[key] != defaults[key]:
                conflicts.append({
                    'key': key,
                    'previous': floats[key],
                    'new': value,
                    'from': source
                })
            floats[key] = value

    # Apply verb first
    if verb in all_verbs:
        apply_values(all_verbs[verb], verb)

    # Apply pre-modifiers
    for mod in pre_mods:
        if mod in pre_modifiers:
            apply_values(pre_modifiers[mod], mod)

    # Apply post-modifiers
    for mod in post_mods:
        if mod in post_modifiers:
            apply_values(post_modifiers[mod], mod)

    # Check for weight annotations
    nature_lower = nature.lower()
    for ann, props in weight_annotations.items():
        if ann in nature_lower:
            apply_values(props, ann)

    return floats, conflicts


# =============================================================================
# INTENSIFIERS
# =============================================================================

def get_intensified_verb(base_verb: str, intensity: float) -> str:
    """
    Get verb form based on intensity.

    intensity: -1 to +1
        -1 = attenuated, 0 = base, +1 = intensified
    """
    intensifiers = get_intensifiers()

    if base_verb not in intensifiers:
        return base_verb

    forms = intensifiers[base_verb]
    if len(forms) != 2:
        return base_verb

    attenuated, intensified = forms

    if intensity < -0.3:
        return attenuated
    elif intensity > 0.3:
        return intensified
    else:
        return base_verb


def select_verb_form(base_verb: str, permanence: float, energy: float = 0.0) -> str:
    """Select verb intensity based on link properties."""
    energy_norm = min(energy, 10) / 10 if energy else 0.5
    intensity = (permanence - 0.5) + (energy_norm - 0.5)
    return get_intensified_verb(base_verb, intensity)


# =============================================================================
# TRANSLATION
# =============================================================================

def translate(key: str, lang: str = 'en') -> str:
    """Translate a term to the specified language."""
    translations = get_translations(lang)
    return translations.get(key, key)


# =============================================================================
# HELPERS
# =============================================================================

def get_verb_for_nature(nature: str) -> Optional[str]:
    """Extract the base verb from a nature string."""
    all_verbs = _get_all_verbs()
    _, verb, _ = parse_nature(nature)
    return verb if verb in all_verbs else None


def get_nature_reference() -> str:
    """Get formatted nature reference for agents."""
    nature = _load_nature()

    lines = [
        "# Nature Reference",
        "",
        "Universal vocabulary for nodes AND links.",
        "",
        "Format: `[pre_modifier] verb [, post_modifier]`",
        "Example: `suddenly proves, with admiration`",
        "",
        "---",
        "",
        "## Verbs",
        "",
    ]

    verb_categories = [
        ("Core", nature.get('core_verbs', {})),
        ("Evidential", nature.get('evidential_verbs', {})),
        ("Structural", nature.get('structural_verbs', {})),
        ("Actor", nature.get('actor_verbs', {})),
        ("Temporal", nature.get('temporal_verbs', {})),
        ("Spatial", nature.get('spatial_verbs', {})),
    ]

    for name, verbs in verb_categories:
        if verbs:
            lines.append(f"**{name}:** {', '.join(verbs.keys())}")
            lines.append("")

    pre_mods = get_pre_modifiers()
    post_mods = get_post_modifiers()

    lines.extend([
        "---",
        "",
        "## Pre-Modifiers",
        "",
        f"**Certainty:** {', '.join(k for k in pre_mods if 'permanence' in pre_mods[k])}",
        f"**Intensity:** {', '.join(k for k in pre_mods if 'energy' in pre_mods[k])}",
        "",
        "---",
        "",
        "## Post-Modifiers",
        "",
        f"{', '.join(post_mods.keys()) if post_mods else '(none)'}",
    ])

    return '\n'.join(lines)


def get_nature_compact() -> Dict[str, List[str]]:
    """Get compact nature definitions for programmatic use."""
    nature = _load_nature()
    return {
        'core_verbs': list(nature.get('core_verbs', {}).keys()),
        'evidential_verbs': list(nature.get('evidential_verbs', {}).keys()),
        'structural_verbs': list(nature.get('structural_verbs', {}).keys()),
        'actor_verbs': list(nature.get('actor_verbs', {}).keys()),
        'temporal_verbs': list(nature.get('temporal_verbs', {}).keys()),
        'spatial_verbs': list(nature.get('spatial_verbs', {}).keys()),
        'pre_modifiers': list(get_pre_modifiers().keys()),
        'post_modifiers': list(get_post_modifiers().keys()),
        'weight_annotations': list(get_weight_annotations().keys()),
    }


def reload_nature():
    """Force reload of nature definitions from YAML."""
    global _nature_cache, _reverse_synonyms_cache
    _nature_cache = None
    _reverse_synonyms_cache = None
    _load_nature()


# =============================================================================
# BACKWARDS COMPATIBILITY
# =============================================================================

# Old names still work
get_vocab_reference = get_nature_reference
get_vocab_compact = get_nature_compact
reload_vocab = reload_nature
