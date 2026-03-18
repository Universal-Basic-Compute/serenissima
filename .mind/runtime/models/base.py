"""
Base Types and Enums — Generic Schema

Common types, enums, EntityBase, and modifiers shared across all models.

TESTS:
    engine/tests/test_models.py::TestModifier
    engine/tests/test_models.py::TestGameTimestamp
    engine/tests/test_models.py::TestEntityBase
    engine/tests/test_spec_consistency.py::TestEnumConsistency

VALIDATES:
    V2: Node enums (ActorType, SpaceType, ThingType, NarrativeType, MomentType)
    V3: Link enums (BeliefSource, PathDifficulty)

SEE ALSO:
    docs/schema/SCHEMA/SCHEMA_EntityBase.md
    docs/schema/SCHEMA/SCHEMA_Nodes.md
"""

from enum import Enum
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


# =============================================================================
# ACTOR ENUMS
# =============================================================================

class ActorType(str, Enum):
    PLAYER = "player"
    COMPANION = "companion"
    MAJOR = "major"
    MINOR = "minor"
    BACKGROUND = "background"


class Face(str, Enum):
    YOUNG = "young"
    SCARRED = "scarred"
    WEATHERED = "weathered"
    GAUNT = "gaunt"
    HARD = "hard"
    NOBLE = "noble"


class SkillLevel(str, Enum):
    UNTRAINED = "untrained"
    CAPABLE = "capable"
    SKILLED = "skilled"
    MASTER = "master"


class VoiceTone(str, Enum):
    QUIET = "quiet"
    SHARP = "sharp"
    WARM = "warm"
    BITTER = "bitter"
    MEASURED = "measured"
    FIERCE = "fierce"


class VoiceStyle(str, Enum):
    DIRECT = "direct"
    QUESTIONING = "questioning"
    SARDONIC = "sardonic"
    GENTLE = "gentle"
    BLUNT = "blunt"


class Approach(str, Enum):
    DIRECT = "direct"
    CUNNING = "cunning"
    CAUTIOUS = "cautious"
    IMPULSIVE = "impulsive"
    DELIBERATE = "deliberate"


class Value(str, Enum):
    LOYALTY = "loyalty"
    SURVIVAL = "survival"
    HONOR = "honor"
    AMBITION = "ambition"
    FAITH = "faith"
    FAMILY = "family"
    JUSTICE = "justice"
    FREEDOM = "freedom"
    WEALTH = "wealth"
    KNOWLEDGE = "knowledge"
    POWER = "power"
    PEACE = "peace"


class Flaw(str, Enum):
    PRIDE = "pride"
    FEAR = "fear"
    GREED = "greed"
    WRATH = "wrath"
    DOUBT = "doubt"
    RIGIDITY = "rigidity"
    SOFTNESS = "softness"
    ENVY = "envy"
    SLOTH = "sloth"


# =============================================================================
# SPACE ENUMS
# =============================================================================

class SpaceType(str, Enum):
    REGION = "region"
    CITY = "city"
    HOLD = "hold"
    VILLAGE = "village"
    MONASTERY = "monastery"
    CAMP = "camp"
    ROAD = "road"
    ROOM = "room"
    WILDERNESS = "wilderness"
    RUIN = "ruin"


class Weather(str, Enum):
    RAIN = "rain"
    SNOW = "snow"
    FOG = "fog"
    CLEAR = "clear"
    OVERCAST = "overcast"
    STORM = "storm"
    WIND = "wind"
    COLD = "cold"
    HOT = "hot"


class Mood(str, Enum):
    WELCOMING = "welcoming"
    HOSTILE = "hostile"
    INDIFFERENT = "indifferent"
    FEARFUL = "fearful"
    WATCHFUL = "watchful"
    DESPERATE = "desperate"
    PEACEFUL = "peaceful"
    TENSE = "tense"


# =============================================================================
# THING ENUMS
# =============================================================================

class ThingType(str, Enum):
    WEAPON = "weapon"
    ARMOR = "armor"
    DOCUMENT = "document"
    LETTER = "letter"
    RELIC = "relic"
    TREASURE = "treasure"
    TITLE = "title"
    LAND = "land"
    TOKEN = "token"
    PROVISIONS = "provisions"
    COIN_PURSE = "coin_purse"
    HORSE = "horse"
    SHIP = "ship"
    TOOL = "tool"


class Significance(str, Enum):
    MUNDANE = "mundane"
    PERSONAL = "personal"
    POLITICAL = "political"
    SACRED = "sacred"
    LEGENDARY = "legendary"


# =============================================================================
# NARRATIVE ENUMS
# =============================================================================

class NarrativeType(str, Enum):
    # About events
    MEMORY = "memory"
    ACCOUNT = "account"
    RUMOR = "rumor"
    # About characters
    REPUTATION = "reputation"
    IDENTITY = "identity"
    # About relationships
    BOND = "bond"
    OATH = "oath"
    DEBT = "debt"
    BLOOD = "blood"
    ENMITY = "enmity"
    LOVE = "love"
    SERVICE = "service"
    # About things
    OWNERSHIP = "ownership"
    CLAIM = "claim"
    # About places
    CONTROL = "control"
    ORIGIN = "origin"
    # Meta
    BELIEF = "belief"
    PROPHECY = "prophecy"
    LIE = "lie"
    SECRET = "secret"


class NarrativeTone(str, Enum):
    BITTER = "bitter"
    PROUD = "proud"
    SHAMEFUL = "shameful"
    DEFIANT = "defiant"
    MOURNFUL = "mournful"
    COLD = "cold"
    RIGHTEOUS = "righteous"
    HOPEFUL = "hopeful"
    FEARFUL = "fearful"
    WARM = "warm"
    DARK = "dark"
    SACRED = "sacred"


class NarrativeVoiceStyle(str, Enum):
    WHISPER = "whisper"
    DEMAND = "demand"
    REMIND = "remind"
    ACCUSE = "accuse"
    PLEAD = "plead"
    WARN = "warn"
    INSPIRE = "inspire"
    MOCK = "mock"
    QUESTION = "question"


# =============================================================================
# LINK ENUMS
# =============================================================================

class BeliefSource(str, Enum):
    NONE = "none"
    WITNESSED = "witnessed"
    TOLD = "told"
    INFERRED = "inferred"
    ASSUMED = "assumed"
    TAUGHT = "taught"


class PathDifficulty(str, Enum):
    EASY = "easy"
    MODERATE = "moderate"
    HARD = "hard"
    DANGEROUS = "dangerous"
    IMPASSABLE = "impassable"


# =============================================================================
# MOMENT ENUMS
# =============================================================================

class MomentType(str, Enum):
    """Type of narrated moment."""
    NARRATION = "narration"           # Narrator description
    DIALOGUE = "dialogue"             # Character speaks
    ACTION = "action"                 # Physical action
    THOUGHT = "thought"               # Internal thought
    HINT = "hint"                     # Clickable hint / voice
    PLAYER_CLICK = "player_click"     # Player clicked a word
    PLAYER_FREEFORM = "player_freeform"  # Player typed text
    PLAYER_CHOICE = "player_choice"   # Player selected an option


class MomentStatus(str, Enum):
    """Lifecycle status of a Moment in the moment graph (v1.2).

    Transitions:
        possible → active:      Energy threshold reached
        active → completed:     Canon holder records to canon
        active → failed:        Handler error or validation failure
        possible → decayed:     Energy depleted before activation
    """
    POSSIBLE = "possible"        # Exists but not yet activated
    ACTIVE = "active"            # Currently being processed
    COMPLETED = "completed"      # Canon recorded, immutable
    FAILED = "failed"            # Handler error, returns energy
    DECAYED = "decayed"          # Lost relevance, energy depleted


class MomentTrigger(str, Enum):
    """How a CAN_LEAD_TO link can be traversed."""
    CLICK = "click"          # Player clicks a word
    WAIT = "wait"            # Time passes without player input
    AUTO = "auto"            # Automatic when conditions met
    SEMANTIC = "semantic"    # Freeform input matches embedding


# =============================================================================
# MODIFIER ENUMS
# =============================================================================

class ModifierType(str, Enum):
    # Character modifiers
    WOUNDED = "wounded"
    SICK = "sick"
    HUNGRY = "hungry"
    EXHAUSTED = "exhausted"
    DRUNK = "drunk"
    GRIEVING = "grieving"
    INSPIRED = "inspired"
    AFRAID = "afraid"
    ANGRY = "angry"
    HOPEFUL = "hopeful"
    SUSPICIOUS = "suspicious"
    # Place modifiers
    BURNING = "burning"
    FLOODED = "flooded"
    BESIEGED = "besieged"
    ABANDONED = "abandoned"
    CELEBRATING = "celebrating"
    HAUNTED = "haunted"
    WATCHED = "watched"
    SAFE = "safe"
    # Thing modifiers
    DAMAGED = "damaged"
    HIDDEN = "hidden"
    CONTESTED = "contested"
    BLESSED = "blessed"
    CURSED = "cursed"
    STOLEN = "stolen"


class ModifierSeverity(str, Enum):
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


# =============================================================================
# SHARED MODELS
# =============================================================================

class Modifier(BaseModel):
    """Temporary state affecting any node."""
    type: ModifierType
    severity: ModifierSeverity = ModifierSeverity.MODERATE
    duration: str = Field(default="", description="How long: 'until healed', '3 days', 'permanent'")
    source: str = Field(default="", description="What caused this")


class Skills(BaseModel):
    """Character skills."""
    fighting: SkillLevel = SkillLevel.UNTRAINED
    tracking: SkillLevel = SkillLevel.UNTRAINED
    healing: SkillLevel = SkillLevel.UNTRAINED
    persuading: SkillLevel = SkillLevel.UNTRAINED
    sneaking: SkillLevel = SkillLevel.UNTRAINED
    riding: SkillLevel = SkillLevel.UNTRAINED
    reading: SkillLevel = SkillLevel.UNTRAINED
    leading: SkillLevel = SkillLevel.UNTRAINED


class ActorVoice(BaseModel):
    """How an actor speaks."""
    tone: VoiceTone = VoiceTone.MEASURED
    style: VoiceStyle = VoiceStyle.DIRECT


class Personality(BaseModel):
    """How a character thinks and acts."""
    approach: Approach = Approach.DIRECT
    values: List[Value] = Field(default_factory=list)
    flaw: Optional[Flaw] = None


class Backstory(BaseModel):
    """Deep character knowledge."""
    family: str = ""
    childhood: str = ""
    wound: str = ""
    why_here: str = ""


class Atmosphere(BaseModel):
    """Current feel of a place."""
    weather: List[Weather] = Field(default_factory=list)
    mood: Mood = Mood.INDIFFERENT
    details: List[str] = Field(default_factory=list)


class NarrativeAbout(BaseModel):
    """What a narrative concerns."""
    actors: List[str] = Field(default_factory=list)
    relationship: List[str] = Field(default_factory=list, description="Pair of actor IDs")
    spaces: List[str] = Field(default_factory=list)
    things: List[str] = Field(default_factory=list)


class NarrativeVoice(BaseModel):
    """How a narrative speaks as a Voice."""
    style: NarrativeVoiceStyle = NarrativeVoiceStyle.REMIND
    phrases: List[str] = Field(default_factory=list)


# =============================================================================
# HISTORY MODELS
# =============================================================================

class TimeOfDay(str, Enum):
    """Valid times of day for the game world."""
    DAWN = "dawn"
    MORNING = "morning"
    MIDDAY = "midday"
    AFTERNOON = "afternoon"
    DUSK = "dusk"
    EVENING = "evening"
    NIGHT = "night"
    MIDNIGHT = "midnight"


class NarrativeSource(BaseModel):
    """
    Reference to a conversation section for player-experienced history.
    The conversation thread is the primary record; narratives index it.
    """
    file: str = Field(description="Path to conversation file, e.g., 'conversations/char_aldric.md'")
    section: str = Field(description="Section header, e.g., 'Day 4, Night — The Camp'")


class GameTimestamp(BaseModel):
    """
    Structured game world timestamp.
    Format: 'Day N, time_of_day'
    """
    day: int = Field(ge=1, description="Day number (1-based)")
    time: TimeOfDay = Field(description="Time of day")

    def __str__(self) -> str:
        return f"Day {self.day}, {self.time.value}"

    @classmethod
    def parse(cls, s: str) -> "GameTimestamp":
        """Parse 'Day N, time' string into GameTimestamp."""
        import re
        match = re.match(r"Day\s+(\d+),?\s*(\w+)", s, re.IGNORECASE)
        if not match:
            raise ValueError(f"Invalid timestamp format: {s}")
        day = int(match.group(1))
        time_str = match.group(2).lower()
        return cls(day=day, time=TimeOfDay(time_str))

    def __lt__(self, other: "GameTimestamp") -> bool:
        if self.day != other.day:
            return self.day < other.day
        time_order = list(TimeOfDay)
        return time_order.index(self.time) < time_order.index(other.time)

    def __le__(self, other: "GameTimestamp") -> bool:
        return self == other or self < other

    def __gt__(self, other: "GameTimestamp") -> bool:
        return not self <= other

    def __ge__(self, other: "GameTimestamp") -> bool:
        return not self < other
