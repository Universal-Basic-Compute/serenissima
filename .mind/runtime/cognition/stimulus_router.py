"""
Stimulus Router — convert incoming events into L1 Stimulus objects.

Spec: docs/l1_wiring/ALGORITHM_L1_Wiring.md Section 2.1

Takes raw events (messages, bridge signals, system events) and produces
Stimulus objects for injection into the L1 cognitive engine.

Pipeline: classify → segment → embed → dedup → build Stimulus
"""

from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from .tick_runner_l1_cognitive_engine import Stimulus

logger = logging.getLogger("cognition.stimulus_router")


# ── Event types ─────────────────────────────────────────────────────────────

@dataclass
class IncomingEvent:
    """Raw event from any source (bridge, MCP, system)."""
    content: str
    source: str  # "telegram", "whatsapp", "mcp", "system", "self"
    citizen_handle: str
    is_social: bool = False
    is_failure: bool = False
    is_progress: bool = False
    metadata: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)


# ── Anti-loop protection ────────────────────────────────────────────────────

class AntiLoopGate:
    """Prevents self-stimulus feedback loops.

    Three layers:
    1. Refractory period: ignore self-stimuli within N seconds of last action
    2. Diminishing returns: repeated self-stimuli get reduced energy
    3. Novelty gate: reject self-stimuli too similar to recent ones
    """

    def __init__(
        self,
        refractory_seconds: float = 5.0,
        diminishing_half_life: int = 3,
        novelty_threshold: float = 0.85,
        history_size: int = 20,
    ):
        self.refractory_seconds = refractory_seconds
        self.diminishing_half_life = diminishing_half_life
        self.novelty_threshold = novelty_threshold
        self.history_size = history_size

        self._last_action_time: float = 0.0
        self._self_stimulus_count: int = 0
        self._recent_hashes: list[str] = []

    def record_action(self):
        """Called when the citizen takes an action (emits output)."""
        self._last_action_time = time.time()

    def check(self, event: IncomingEvent) -> tuple[bool, float]:
        """Check if event passes anti-loop gates.

        Returns:
            (allowed, energy_multiplier): whether to allow and energy scaling
        """
        if event.source != "self":
            # External events always pass
            self._self_stimulus_count = 0
            return True, 1.0

        # Layer 1: refractory period
        elapsed = time.time() - self._last_action_time
        if elapsed < self.refractory_seconds:
            logger.debug(f"Anti-loop: refractory ({elapsed:.1f}s < {self.refractory_seconds}s)")
            return False, 0.0

        # Layer 2: diminishing returns
        self._self_stimulus_count += 1
        energy_mult = 0.5 ** (self._self_stimulus_count / self.diminishing_half_life)

        # Layer 3: novelty gate (hash-based dedup)
        content_hash = hashlib.md5(event.content.encode()).hexdigest()[:8]
        if content_hash in self._recent_hashes:
            logger.debug("Anti-loop: duplicate self-stimulus rejected")
            return False, 0.0

        self._recent_hashes.append(content_hash)
        if len(self._recent_hashes) > self.history_size:
            self._recent_hashes.pop(0)

        return True, energy_mult


# ── Concept extraction ──────────────────────────────────────────────────────

def extract_concepts(text: str) -> list[str]:
    """Extract key concepts from text for node targeting.

    Simple keyword-based extraction. When embeddings are available,
    this will be replaced with semantic similarity matching.
    """
    # Split into sentences
    sentences = []
    for sep in ['. ', '! ', '? ', '\n']:
        if sep in text:
            parts = text.split(sep)
            sentences.extend(p.strip() for p in parts if p.strip())
            break
    if not sentences:
        sentences = [text.strip()]

    # Extract noun-like tokens (words > 3 chars, not common stop words)
    stop_words = {
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
        'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been',
        'this', 'that', 'with', 'they', 'from', 'what', 'which', 'when',
        'will', 'each', 'make', 'like', 'just', 'into', 'than', 'them',
        'some', 'could', 'would', 'there', 'their', 'about', 'other',
        'dans', 'pour', 'avec', 'plus', 'mais', 'comme', 'tout', 'fait',
        'être', 'avoir', 'faire', 'dire', 'aller', 'voir', 'aussi',
    }

    concepts = []
    for sentence in sentences[:5]:  # max 5 sentences
        words = sentence.lower().split()
        for word in words:
            clean = word.strip('.,!?;:\'"()[]{}')
            if len(clean) > 3 and clean not in stop_words:
                concepts.append(clean)

    # Deduplicate preserving order
    seen = set()
    unique = []
    for c in concepts:
        if c not in seen:
            seen.add(c)
            unique.append(c)

    return unique[:15]  # max 15 concepts


# ── Stimulus Router ─────────────────────────────────────────────────────────

class StimulusRouter:
    """Converts IncomingEvents into Stimulus objects for the L1 engine.

    One router per citizen. Maintains anti-loop state and dedup history.
    """

    def __init__(
        self,
        citizen_handle: str,
        embed_fn: Optional[callable] = None,
    ):
        self.citizen_handle = citizen_handle
        self.embed_fn = embed_fn  # async fn(text) -> list[float]
        self.anti_loop = AntiLoopGate()

        # Dedup: recent stimulus hashes
        self._recent_stimulus_hashes: list[str] = []
        self._dedup_window = 50

    def route(self, event: IncomingEvent) -> Optional[Stimulus]:
        """Convert an incoming event to a Stimulus, or None if filtered.

        Pipeline: anti-loop → classify → build stimulus
        """
        # Anti-loop check
        allowed, energy_mult = self.anti_loop.check(event)
        if not allowed:
            return None

        # Dedup check (content-based)
        content_hash = hashlib.md5(event.content.encode()).hexdigest()[:12]
        if content_hash in self._recent_stimulus_hashes:
            logger.debug(f"Stimulus dedup: rejected duplicate for {self.citizen_handle}")
            return None
        self._recent_stimulus_hashes.append(content_hash)
        if len(self._recent_stimulus_hashes) > self._dedup_window:
            self._recent_stimulus_hashes.pop(0)

        # Classify event
        is_social = event.is_social or event.source in ("telegram", "whatsapp", "discord")
        is_novelty = self._check_novelty(event.content)

        # Extract concepts for node targeting
        concepts = extract_concepts(event.content)

        # Build energy budget
        base_energy = 1.0
        if is_social:
            base_energy = 1.2  # Social stimuli get slight boost
        if event.is_failure:
            base_energy = 0.8  # Failures are lower energy, higher signal
        energy = base_energy * energy_mult

        # Build stimulus
        stimulus = Stimulus(
            content=event.content,
            energy_budget=energy,
            embedding=[],  # Will be filled by embed_fn when available
            target_node_ids=[],  # Will be filled by node matching
            is_social=is_social,
            is_failure=event.is_failure,
            is_novelty=is_novelty,
            is_progress=event.is_progress,
            source=event.source,
            timestamp=event.timestamp,
        )

        # Store concepts in metadata for node matching
        stimulus._concepts = concepts  # type: ignore[attr-defined]

        logger.debug(
            f"Stimulus routed for {self.citizen_handle}: "
            f"energy={energy:.2f}, social={is_social}, "
            f"concepts={len(concepts)}, source={event.source}"
        )

        return stimulus

    def record_action(self):
        """Record that the citizen took an action (for anti-loop)."""
        self.anti_loop.record_action()

    def _check_novelty(self, content: str) -> bool:
        """Check if content is novel relative to recent stimuli."""
        content_words = set(content.lower().split())
        if not self._recent_stimulus_hashes:
            return True
        # Simple heuristic: if content hash is new, it's novel enough
        content_hash = hashlib.md5(content.encode()).hexdigest()[:12]
        return content_hash not in self._recent_stimulus_hashes
