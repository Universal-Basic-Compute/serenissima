"""
Data Models

Complete Pydantic models for the schema.
Based on schema.yaml v1.1

DOCS: docs/schema/PATTERNS_Schema.md

v1.2 CHANGES:
- MomentStatus: POSSIBLE, ACTIVE, COMPLETED, REJECTED, INTERRUPTED, OVERRIDDEN
- LinkBase: unified link with node_a, node_b, weight, energy, strength, emotions (no conductivity)
- LinkType: contains, leads_to, expresses, sequence, primes, can_become, relates
- All nodes: energy/weight unbounded (cooling handles lifecycle)

Nodes (5 types):
- Actor: A person who can act, speak, remember, die
- Space: A location with atmosphere and geography
- Thing: An object that can be owned, given, stolen, fought over
- Narrative: A story that actors believe
- Moment: A unit of narrated content

Links:
- LinkBase: Unified v1.2 link (node_a, node_b, type, weight, energy, strength, emotions)
- Legacy typed links still available for domain-specific fields
"""

# Nodes
from .nodes import Actor, Space, Thing, Narrative, Moment

# Links (v1.8.1 - no LinkType, all semantics in properties)
from .links import (
    # v1.8.1 unified link
    LinkBase,
    # Legacy typed links (for domain-specific fields)
    ActorNarrative,
    NarrativeNarrative,
    ActorSpace,
    ActorThing,
    ThingSpace,
    SpaceSpace
)

# Base types and enums
from .base import (
    # Actor enums
    ActorType, Face, SkillLevel, VoiceTone, VoiceStyle,
    Approach, Value, Flaw,
    # Space enums
    SpaceType, Weather, Mood,
    # Thing enums
    ThingType, Significance,
    # Narrative enums
    NarrativeType, NarrativeTone, NarrativeVoiceStyle,
    # Link enums
    BeliefSource, PathDifficulty,
    # Moment enums
    MomentType, MomentStatus, MomentTrigger,
    # Modifier enums
    ModifierType, ModifierSeverity,
    # Shared models
    Modifier, ActorVoice, Personality, Backstory,
    Atmosphere, NarrativeAbout, NarrativeVoice
)

__all__ = [
    # Nodes
    'Actor', 'Space', 'Thing', 'Narrative', 'Moment',
    # Links (v1.8.1)
    'LinkBase',
    # Legacy typed links
    'ActorNarrative', 'NarrativeNarrative',
    'ActorSpace', 'ActorThing', 'ThingSpace', 'SpaceSpace',
    # Enums
    'ActorType', 'Face', 'SkillLevel', 'VoiceTone', 'VoiceStyle',
    'Approach', 'Value', 'Flaw',
    'SpaceType', 'Weather', 'Mood',
    'ThingType', 'Significance',
    'NarrativeType', 'NarrativeTone', 'NarrativeVoiceStyle',
    'BeliefSource', 'PathDifficulty',
    'MomentType', 'MomentStatus', 'MomentTrigger',
    'ModifierType', 'ModifierSeverity',
    # Shared models
    'Modifier', 'ActorVoice', 'Personality', 'Backstory',
    'Atmosphere', 'NarrativeAbout', 'NarrativeVoice'
]
