"""
TraversalLogger — Agent-Comprehensible SubEntity Exploration Logging (v1.0)

Logs every SubEntity traversal step with full context, explanations, and
analysis to make exploration behavior comprehensible to AI agents.

DESIGN: docs/physics/DESIGN_Traversal_Logger.md
EXAMPLE: docs/physics/EXAMPLE_Traversal_Log.md

Features:
- Natural language explanations for decisions
- "Why not" reasoning for rejected options
- Counterfactual analysis
- Intention decomposition
- Progress narratives
- Anomaly detection and flags
- Causal chain tracking
- Decision confidence scores
- Exploration context summaries
- State machine diagrams
- Learning signals

Output:
- JSONL: machine-readable, one JSON per line
- TXT: human/agent-readable formatted output

IMPL: engine/physics/subentity.py
"""

from __future__ import annotations
import json
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from threading import Lock
from typing import List, Dict, Any, Optional, Tuple, Set

# Avoid circular import
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from runtime.physics.subentity import SubEntity, SubEntityState


class LogLevel(Enum):
    """Log verbosity levels."""
    TRACE = "trace"      # Everything including embeddings
    STEP = "step"        # Each step with decision details
    EVENT = "event"      # State changes, branches, crystallizations
    SUMMARY = "summary"  # Start/end only


class AnomalySeverity(Enum):
    """Severity of detected anomalies."""
    INFO = "info"
    WARN = "warn"
    ERROR = "error"


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class LinkCandidate:
    """A candidate link for traversal with full scoring breakdown."""
    link_id: str
    target_id: str
    target_type: str
    target_name: str = ""
    score: float = 0.0

    # Score components
    semantic: float = 0.0
    polarity: float = 0.0
    permanence_factor: float = 0.0  # 1 - permanence
    self_novelty: float = 0.0
    sibling_divergence: float = 0.0

    # Agent-comprehensible additions
    verdict: str = ""  # SELECTED, REJECTED, TIED
    why_not: Optional[str] = None  # Explanation if rejected
    semantic_interpretation: str = ""  # What the semantic score means

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None and v != ""}


@dataclass
class Anomaly:
    """An unusual situation detected during exploration."""
    anomaly_type: str
    severity: AnomalySeverity
    detail: str
    suggested_action: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.anomaly_type,
            "severity": self.severity.value,
            "detail": self.detail,
            "suggested_action": self.suggested_action,
        }


@dataclass
class CausalLink:
    """A cause-effect relationship in the exploration."""
    cause: str
    effect: str

    def to_dict(self) -> Dict[str, Any]:
        return {"cause": self.cause, "effect": self.effect}


@dataclass
class LearningSignal:
    """Something that can be learned from this step."""
    signal: str
    observation: str
    implication: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class IntentionConcept:
    """A concept extracted from the intention."""
    concept: str
    graph_matches: List[str] = field(default_factory=list)
    best_alignment: float = 0.0


@dataclass
class DecisionInfo:
    """Complete decision information for a step."""
    decision_type: str  # traverse, branch, resonate, reflect, crystallize, merge, dead_end
    candidates: List[LinkCandidate] = field(default_factory=list)
    selected_link_id: Optional[str] = None
    selection_reason: str = ""

    # Agent-comprehensible additions
    explanation: str = ""  # Natural language explanation
    confidence: float = 0.0
    confidence_factors: Dict[str, float] = field(default_factory=dict)
    confidence_interpretation: str = ""

    # For branching
    branch_info: Optional[Dict[str, Any]] = None

    # Counterfactual
    counterfactual: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "type": self.decision_type,
            "selected": {"link_id": self.selected_link_id, "reason": self.selection_reason} if self.selected_link_id else None,
            "explanation": self.explanation,
            "confidence": round(self.confidence, 3),
            "confidence_interpretation": self.confidence_interpretation,
        }
        if self.candidates:
            d["candidates"] = [c.to_dict() for c in self.candidates]
        if self.confidence_factors:
            d["confidence_factors"] = {k: round(v, 3) for k, v in self.confidence_factors.items()}
        if self.branch_info:
            d["branch_info"] = self.branch_info
        if self.counterfactual:
            d["counterfactual"] = self.counterfactual
        return d


@dataclass
class MovementInfo:
    """Movement from one node to another."""
    from_node_id: str
    from_node_type: str
    to_node_id: str
    to_node_type: str
    via_link_id: str
    polarity_used: float = 0.0
    permanence: float = 0.0
    energy_before: float = 0.0
    energy_after: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "from": {"node_id": self.from_node_id, "node_type": self.from_node_type},
            "to": {"node_id": self.to_node_id, "node_type": self.to_node_type},
            "via": {
                "link_id": self.via_link_id,
                "polarity": round(self.polarity_used, 3),
                "permanence": round(self.permanence, 3),
                "energy_before": round(self.energy_before, 3),
                "energy_after": round(self.energy_after, 3),
            }
        }


@dataclass
class ExplorationContext:
    """Context about the exploration so far."""
    steps_taken: int = 0
    nodes_visited: List[str] = field(default_factory=list)
    path_summary: str = ""
    findings_so_far: Dict[str, float] = field(default_factory=dict)
    unexplored_leads: List[Dict[str, str]] = field(default_factory=list)
    estimated_remaining: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "steps_taken": self.steps_taken,
            "nodes_visited": self.nodes_visited,
            "path_summary": self.path_summary,
            "findings_so_far": self.findings_so_far,
            "unexplored_leads": self.unexplored_leads,
            "estimated_remaining": self.estimated_remaining,
        }


@dataclass
class ExplorationStartContext:
    """
    Context captured at exploration start for diagnostic analysis.

    These fields are required for layer 4-5 diagnosis (Protocol/Skill layers).
    """
    query: str  # The actual search query
    intention: str  # Stated intention (free text)
    intention_type: str  # SUMMARIZE|VERIFY|EXPLORE|CONTRADICT
    origin_moment: str  # What moment triggered this
    actor_task: str  # What the actor was trying to do

    def to_dict(self) -> Dict[str, Any]:
        return {
            "query": self.query,
            "intention": self.intention,
            "intention_type": self.intention_type,
            "origin_moment": self.origin_moment,
            "actor_task": self.actor_task,
        }


@dataclass
class TerminationInfo:
    """
    Termination details for diagnostic analysis.

    Required for understanding why exploration ended.
    """
    reason: str  # satisfaction_reached|timeout|max_depth|no_links|error
    final_satisfaction: float = 0.0
    final_criticality: float = 0.0
    steps_taken: int = 0
    duration_ms: int = 0
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "reason": self.reason,
            "final_satisfaction": round(self.final_satisfaction, 3),
            "final_criticality": round(self.final_criticality, 3),
            "steps_taken": self.steps_taken,
            "duration_ms": self.duration_ms,
        }
        if self.error_message:
            d["error_message"] = self.error_message
        return d


@dataclass
class EnergyInjection:
    """Record of energy injected into a node during exploration."""
    target_node: str
    amount: float
    reason: str  # narrative_resonance|crystallization|traversal
    energy_before: float = 0.0
    energy_after: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "target_node": self.target_node,
            "amount": round(self.amount, 4),
            "reason": self.reason,
            "energy_before": round(self.energy_before, 4),
            "energy_after": round(self.energy_after, 4),
        }


@dataclass
class StepRecord:
    """Complete record of a single exploration step."""
    # Header
    timestamp: str
    exploration_id: str
    subentity_id: str
    actor_id: str
    tick: int
    step_number: int
    level: str = "STEP"

    # State
    state_before: str = ""
    state_after: str = ""
    transition_reason: Optional[str] = None
    position_node_id: str = ""
    position_node_type: str = ""
    position_node_name: str = ""
    depth: int = 0
    satisfaction: float = 0.0
    criticality: float = 0.0

    # Decision
    decision: Optional[DecisionInfo] = None

    # Movement
    movement: Optional[MovementInfo] = None

    # Findings
    found_narratives: Dict[str, float] = field(default_factory=dict)
    new_this_step: Optional[str] = None
    alignment_this_step: Optional[float] = None

    # Tree
    parent_id: Optional[str] = None
    sibling_ids: List[str] = field(default_factory=list)
    children_ids: List[str] = field(default_factory=list)
    active_siblings: int = 0

    # Agent-comprehensible additions
    progress_narrative: str = ""
    anomalies: List[Anomaly] = field(default_factory=list)
    causal_chain: List[CausalLink] = field(default_factory=list)
    learning_signals: List[LearningSignal] = field(default_factory=list)
    exploration_context: Optional[ExplorationContext] = None
    intention_analysis: Optional[Dict[str, Any]] = None
    state_diagram: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        d = {
            "header": {
                "timestamp": self.timestamp,
                "exploration_id": self.exploration_id,
                "subentity_id": self.subentity_id,
                "actor_id": self.actor_id,
                "tick": self.tick,
                "step_number": self.step_number,
                "level": self.level,
            },
            "state": {
                "before": self.state_before,
                "after": self.state_after,
                "transition_reason": self.transition_reason,
                "position": {
                    "node_id": self.position_node_id,
                    "node_type": self.position_node_type,
                    "node_name": self.position_node_name,
                },
                "depth": self.depth,
                "satisfaction": round(self.satisfaction, 3),
                "criticality": round(self.criticality, 3),
            },
            "progress_narrative": self.progress_narrative,
        }

        if self.decision:
            d["decision"] = self.decision.to_dict()

        if self.movement:
            d["movement"] = self.movement.to_dict()

        if self.found_narratives:
            d["findings"] = {
                "found_narratives": {k: round(v, 3) for k, v in self.found_narratives.items()},
                "found_count": len(self.found_narratives),
                "new_this_step": self.new_this_step,
                "alignment_this_step": round(self.alignment_this_step, 3) if self.alignment_this_step else None,
            }

        d["tree"] = {
            "parent_id": self.parent_id,
            "sibling_ids": self.sibling_ids,
            "children_ids": self.children_ids,
            "active_siblings": self.active_siblings,
        }

        if self.anomalies:
            d["anomalies"] = [a.to_dict() for a in self.anomalies]

        if self.causal_chain:
            d["causal_chain"] = [c.to_dict() for c in self.causal_chain]

        if self.learning_signals:
            d["learning_signals"] = [s.to_dict() for s in self.learning_signals]

        if self.exploration_context:
            d["exploration_context"] = self.exploration_context.to_dict()

        if self.intention_analysis:
            d["intention_analysis"] = self.intention_analysis

        if self.state_diagram:
            d["state_diagram"] = self.state_diagram

        return d


# =============================================================================
# STATE DIAGRAM GENERATOR
# =============================================================================

def generate_state_diagram(current_state: str, waiting_for: Optional[str] = None) -> str:
    """Generate ASCII state machine diagram with current state highlighted."""
    states = {
        "SEEKING": (0, 0),
        "BRANCHING": (0, 1),
        "RESONATING": (1, 0),
        "REFLECTING": (2, 0),
        "CRYSTALLIZING": (2, 1),
        "MERGING": (3, 0),
    }

    diagram = """
  SEEKING ────────────────────────────────────────┐
     │                                             │
     ├──▶ BRANCHING ──▶ (wait for children) ──────┤
     │                                             │
     └──▶ RESONATING ──▶ REFLECTING ──┬──▶ MERGING
                                      │
                                      └──▶ CRYSTALLIZING ──▶ MERGING
"""

    # Mark current state
    current_upper = current_state.upper()
    if current_upper in states:
        marker = f"[{current_upper}]"
        diagram = diagram.replace(current_upper, marker)

    if waiting_for:
        diagram += f"\n  Current: {marker} ← {waiting_for}"
    else:
        diagram += f"\n  Current: {marker}"

    return diagram.strip()


# =============================================================================
# EXPLANATION GENERATORS
# =============================================================================

class ExplanationGenerator:
    """Generates natural language explanations for decisions."""

    @staticmethod
    def explain_link_selection(
        selected: LinkCandidate,
        rejected: List[LinkCandidate],
        intention: str,
    ) -> str:
        """Explain why a link was selected over others."""
        parts = []

        # Why selected
        parts.append(f"Selected {selected.target_id} ({selected.target_type})")

        reasons = []
        if selected.semantic > 0.7:
            reasons.append(f"strong semantic alignment ({selected.semantic:.2f}) with intention")
        elif selected.semantic > 0.4:
            reasons.append(f"moderate semantic alignment ({selected.semantic:.2f})")

        if selected.polarity > 0.8:
            reasons.append("favorable link polarity")

        if selected.permanence_factor > 0.7:
            reasons.append("link is exploratory (low permanence)")

        if selected.self_novelty < 0.8:
            reasons.append(f"some path overlap (novelty={selected.self_novelty:.2f})")

        if reasons:
            parts.append(f"because of {', '.join(reasons)}.")

        # Why others rejected
        if rejected:
            best_rejected = max(rejected, key=lambda x: x.score)
            gap = selected.score - best_rejected.score
            if gap > 0.3:
                parts.append(f"Clear winner with {gap:.2f} score margin over {best_rejected.target_id}.")
            else:
                parts.append(f"Close decision - {best_rejected.target_id} scored {best_rejected.score:.2f}.")

        return " ".join(parts)

    @staticmethod
    def explain_branch(
        position: str,
        children_count: int,
        children_targets: List[str],
    ) -> str:
        """Explain why branching occurred."""
        return (
            f"Branching at {position} because it's a Moment with {children_count} "
            f"viable outgoing paths. Runing {children_count} children to explore "
            f"{', '.join(children_targets)} in parallel. This maximizes exploration "
            f"coverage while avoiding sequential bias."
        )

    @staticmethod
    def explain_dead_end(
        position: str,
        best_score: float,
        threshold: float,
    ) -> str:
        """Explain why exploration hit a dead end."""
        return (
            f"Dead end at {position}. Best available link scored {best_score:.2f}, "
            f"below threshold {threshold:.2f}. No semantically aligned paths remain. "
            f"Transitioning to REFLECTING to backpropagate findings."
        )

    @staticmethod
    def explain_resonance(
        narrative_id: str,
        alignment: float,
        satisfaction_before: float,
        satisfaction_after: float,
    ) -> str:
        """Explain narrative resonance."""
        satisfaction_gain = satisfaction_after - satisfaction_before

        if alignment > 0.8:
            quality = "strongly aligned"
        elif alignment > 0.5:
            quality = "moderately aligned"
        else:
            quality = "weakly aligned"

        return (
            f"Found {narrative_id} with {quality} content (alignment={alignment:.2f}). "
            f"Satisfaction increased from {satisfaction_before:.2f} to {satisfaction_after:.2f} "
            f"(+{satisfaction_gain:.2f}). "
            + ("Continuing exploration." if satisfaction_after < 0.8 else "Satisfaction threshold reached.")
        )

    @staticmethod
    def generate_why_not(
        candidate: LinkCandidate,
        selected_score: float,
    ) -> str:
        """Generate explanation for why a candidate was rejected."""
        issues = []

        if candidate.semantic < 0.3:
            issues.append(f"weak semantic match ({candidate.semantic:.2f})")
        elif candidate.semantic < 0.5:
            issues.append(f"moderate semantic match ({candidate.semantic:.2f})")

        if candidate.polarity < 0.5:
            issues.append(f"unfavorable polarity ({candidate.polarity:.2f})")

        if candidate.permanence_factor < 0.5:
            issues.append(f"highly permanent link ({1-candidate.permanence_factor:.2f})")

        if candidate.self_novelty < 0.5:
            issues.append(f"similar to visited path ({candidate.self_novelty:.2f})")

        if candidate.sibling_divergence < 0.5:
            issues.append(f"overlaps with sibling exploration ({candidate.sibling_divergence:.2f})")

        score_gap = selected_score - candidate.score
        if score_gap > 0.2:
            issues.append(f"score gap of {score_gap:.2f}")

        if issues:
            return f"Rejected: {'; '.join(issues)}"
        else:
            return f"Rejected: lower overall score ({candidate.score:.2f} vs {selected_score:.2f})"


class AnomalyDetector:
    """Detects anomalies in exploration behavior."""

    @staticmethod
    def detect_anomalies(
        step: StepRecord,
        history: List[StepRecord],
    ) -> List[Anomaly]:
        """Detect anomalies in the current step."""
        anomalies = []

        # Low sibling divergence
        if step.decision and step.decision.candidates:
            for c in step.decision.candidates:
                if c.sibling_divergence < 0.5 and c.verdict == "SELECTED":
                    anomalies.append(Anomaly(
                        anomaly_type="LOW_SIBLING_DIVERGENCE",
                        severity=AnomalySeverity.WARN,
                        detail=f"Selected link has low sibling divergence ({c.sibling_divergence:.2f}). May explore redundant paths.",
                        suggested_action="Consider increasing divergence weight in link scoring",
                    ))

        # Backtracking
        if step.movement:
            visited = [h.position_node_id for h in history]
            if step.movement.to_node_id in visited:
                anomalies.append(Anomaly(
                    anomaly_type="BACKTRACK",
                    severity=AnomalySeverity.INFO,
                    detail=f"Revisiting {step.movement.to_node_id} (previously visited).",
                    suggested_action=None,
                ))

        # Satisfaction plateau
        if len(history) >= 5:
            recent_satisfaction = [h.satisfaction for h in history[-5:]]
            if max(recent_satisfaction) - min(recent_satisfaction) < 0.05:
                anomalies.append(Anomaly(
                    anomaly_type="SATISFACTION_PLATEAU",
                    severity=AnomalySeverity.WARN,
                    detail="Satisfaction unchanged for 5 steps. May be stuck.",
                    suggested_action="Consider crystallizing or backtracking",
                ))

        # Deep exploration
        if step.depth > 8:
            anomalies.append(Anomaly(
                anomaly_type="DEEP_EXPLORATION",
                severity=AnomalySeverity.INFO,
                detail=f"Exploration at depth {step.depth}. May be inefficient.",
                suggested_action="Consider higher branching earlier",
            ))

        # High criticality without findings
        if step.criticality > 0.8 and not step.found_narratives:
            anomalies.append(Anomaly(
                anomaly_type="HIGH_CRITICALITY_NO_FINDINGS",
                severity=AnomalySeverity.WARN,
                detail=f"Criticality={step.criticality:.2f} but no narratives found. Exploration struggling.",
                suggested_action="May need to crystallize new narrative",
            ))

        return anomalies


class CausalChainBuilder:
    """Builds causal chain for a step."""

    @staticmethod
    def build_chain(
        step: StepRecord,
        prev_step: Optional[StepRecord],
    ) -> List[CausalLink]:
        """Build causal chain for the current step."""
        chain = []

        # State transition causes
        if step.state_before != step.state_after:
            if step.state_after == "RESONATING":
                chain.append(CausalLink(
                    cause=f"Arrived at narrative node ({step.position_node_id})",
                    effect="State transition SEEKING → RESONATING",
                ))
            elif step.state_after == "BRANCHING":
                chain.append(CausalLink(
                    cause=f"Moment with multiple outgoing links",
                    effect="State transition → BRANCHING",
                ))
            elif step.state_after == "REFLECTING":
                chain.append(CausalLink(
                    cause="No viable links remaining",
                    effect="State transition → REFLECTING",
                ))

        # Satisfaction change
        if prev_step and step.satisfaction > prev_step.satisfaction:
            gain = step.satisfaction - prev_step.satisfaction
            if step.alignment_this_step:
                chain.append(CausalLink(
                    cause=f"Narrative alignment = {step.alignment_this_step:.2f}",
                    effect=f"Satisfaction increased by {gain:.2f}",
                ))

        # Decision causes
        if step.decision and step.decision.candidates:
            selected = next((c for c in step.decision.candidates if c.verdict == "SELECTED"), None)
            if selected and selected.semantic > 0.7:
                chain.append(CausalLink(
                    cause=f"High semantic alignment ({selected.semantic:.2f})",
                    effect=f"Selected {selected.target_id} as best candidate",
                ))

        return chain


class LearningSignalExtractor:
    """Extracts learning signals from steps."""

    @staticmethod
    def extract_signals(
        step: StepRecord,
        history: List[StepRecord],
    ) -> List[LearningSignal]:
        """Extract learning signals from the current step."""
        signals = []

        # Semantic alignment predictive
        if step.new_this_step and step.decision:
            selected = next((c for c in step.decision.candidates if c.verdict == "SELECTED"), None)
            if selected and selected.semantic > 0.7:
                signals.append(LearningSignal(
                    signal="semantic_alignment_predictive",
                    observation=f"High semantic ({selected.semantic:.2f}) correctly predicted valuable narrative",
                    implication="Semantic score is reliable for narrative discovery",
                ))

        # Dead end pattern
        if step.decision and step.decision.decision_type == "dead_end":
            if step.position_node_type in ["space", "thing"]:
                signals.append(LearningSignal(
                    signal="container_nodes_indirect",
                    observation=f"{step.position_node_type} node led to dead end",
                    implication="Container/thing nodes rarely satisfy intentions directly",
                ))

        # Branching efficiency
        if step.decision and step.decision.decision_type == "branch":
            branch_info = step.decision.branch_info or {}
            children_count = branch_info.get("children_count", 0)
            if children_count > 0:
                signals.append(LearningSignal(
                    signal="branching_initiated",
                    observation=f"Runed {children_count} children at depth {step.depth}",
                    implication="Parallel exploration started",
                ))

        return signals


# =============================================================================
# MAIN LOGGER
# =============================================================================

class TraversalLogger:
    """
    Agent-comprehensible SubEntity exploration logger.

    Logs every step with full context, explanations, and analysis.

    Usage:
        logger = TraversalLogger()

        # Start exploration
        logger.exploration_start(
            exploration_id="exp_123",
            actor_id="actor_edmund",
            intention="find truth about betrayal",
            ...
        )

        # Log each step
        logger.log_step(exploration_id, subentity, decision, movement)

        # End exploration
        logger.exploration_end(exploration_id, ...)
    """

    def __init__(
        self,
        log_dir: Path = None,
        level: LogLevel = LogLevel.STEP,
        enable_human_readable: bool = True,
        enable_jsonl: bool = True,
    ):
        self.log_dir = log_dir or Path("engine/data/logs/traversal")
        self.log_dir.mkdir(parents=True, exist_ok=True)

        self.level = level
        self.enable_human_readable = enable_human_readable
        self.enable_jsonl = enable_jsonl

        self._lock = Lock()

        # Active explorations
        self._explorations: Dict[str, Dict[str, Any]] = {}
        self._history: Dict[str, List[StepRecord]] = {}

        # Generators
        self._explainer = ExplanationGenerator()
        self._anomaly_detector = AnomalyDetector()
        self._causal_builder = CausalChainBuilder()
        self._learning_extractor = LearningSignalExtractor()

    def _timestamp(self) -> str:
        """Get ISO timestamp."""
        return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    def _write_jsonl(self, exploration_id: str, data: Dict[str, Any]) -> None:
        """Write a line to JSONL file."""
        if not self.enable_jsonl:
            return
        path = self.log_dir / f"traversal_{exploration_id}.jsonl"
        with self._lock:
            with open(path, "a") as f:
                f.write(json.dumps(data, separators=(",", ":")) + "\n")

    def _write_human(self, exploration_id: str, text: str) -> None:
        """Write to human-readable file."""
        if not self.enable_human_readable:
            return
        path = self.log_dir / f"traversal_{exploration_id}.txt"
        with self._lock:
            with open(path, "a") as f:
                f.write(text + "\n")

    # =========================================================================
    # EXPLORATION LIFECYCLE
    # =========================================================================

    def exploration_start(
        self,
        exploration_id: str,
        actor_id: str,
        origin_moment: str,
        intention: str,
        intention_embedding: Optional[List[float]] = None,
        root_subentity_id: str = "",
        tick: int = 0,
        # New fields for diagnostic analysis
        query: str = "",
        intention_type: str = "EXPLORE",
        actor_task: str = "",
    ) -> None:
        """
        Log exploration start with full context for diagnostic analysis.

        Args:
            exploration_id: Unique exploration identifier
            actor_id: Actor performing exploration
            origin_moment: Moment that triggered exploration
            intention: Free-text intention statement
            intention_embedding: Embedding vector for intention
            root_subentity_id: Root SubEntity ID
            tick: Current tick number
            query: Actual search query (for Layer 4 diagnosis)
            intention_type: SUMMARIZE|VERIFY|EXPLORE|CONTRADICT (for Layer 4)
            actor_task: What the actor was trying to do (for Layer 5)
        """
        timestamp = self._timestamp()

        # Build exploration context for diagnostics
        start_context = ExplorationStartContext(
            query=query or intention,  # Fall back to intention if no query
            intention=intention,
            intention_type=intention_type,
            origin_moment=origin_moment,
            actor_task=actor_task or f"Exploration by {actor_id}",
        )

        self._explorations[exploration_id] = {
            "actor_id": actor_id,
            "origin_moment": origin_moment,
            "intention": intention,
            "root_subentity_id": root_subentity_id,
            "started_at": timestamp,
            "tick": tick,
            "start_context": start_context,
        }
        self._history[exploration_id] = []

        # JSONL - include full context for diagnostic analysis
        self._write_jsonl(exploration_id, {
            "event": "EXPLORATION_START",
            "exploration_id": exploration_id,
            "actor_id": actor_id,
            "timestamp": timestamp,
            "root_subentity_id": root_subentity_id,
            "intention_embedding_hash": hash(tuple(intention_embedding[:8])) if intention_embedding else None,
            # Diagnostic context
            "exploration_context": start_context.to_dict(),
        })

        # Human readable
        self._write_human(exploration_id, f"""
{'═' * 80}
 EXPLORATION {exploration_id}
{'═' * 80}
 Actor:          {actor_id}
 Query:          "{query or intention}"
 Intention:      "{intention}"
 Intention Type: {intention_type}
 Origin Moment:  {origin_moment}
 Actor Task:     {actor_task or "(not specified)"}
 Started:        {timestamp}
{'─' * 80}
""")

    def exploration_end(
        self,
        exploration_id: str,
        found_narratives: Dict[str, float],
        crystallized: Optional[str] = None,
        satisfaction: float = 0.0,
        # New fields for diagnostic analysis
        termination_reason: str = "unknown",
        criticality: float = 0.0,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Log exploration end with termination details for diagnostic analysis.

        Args:
            exploration_id: Exploration identifier
            found_narratives: Narratives found with alignment scores
            crystallized: ID of crystallized narrative if any
            satisfaction: Final satisfaction score
            termination_reason: Why exploration ended:
                - satisfaction_reached: Hit satisfaction threshold
                - timeout: Exceeded time limit
                - max_depth: Hit depth limit
                - no_links: No viable links remaining
                - error: Exception occurred
            criticality: Final criticality score
            error_message: Error details if termination_reason is "error"
        """
        timestamp = self._timestamp()

        exp = self._explorations.get(exploration_id, {})
        history = self._history.get(exploration_id, [])

        # Calculate stats
        total_steps = len(history)
        total_subentities = len(set(h.subentity_id for h in history))
        nodes_visited = list(set(h.position_node_id for h in history))

        start_time = exp.get("started_at", timestamp)
        # Parse timestamps to calculate duration
        try:
            start_dt = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            duration_ms = int((end_dt - start_dt).total_seconds() * 1000)
        except:
            duration_ms = 0

        # Build termination info for diagnostics
        termination = TerminationInfo(
            reason=termination_reason,
            final_satisfaction=satisfaction,
            final_criticality=criticality,
            steps_taken=total_steps,
            duration_ms=duration_ms,
            error_message=error_message,
        )

        # JSONL - include termination details for diagnostic analysis
        self._write_jsonl(exploration_id, {
            "event": "EXPLORATION_END",
            "exploration_id": exploration_id,
            "timestamp": timestamp,
            "total_subentities": total_subentities,
            "nodes_visited": nodes_visited,
            "found_narratives": {k: round(v, 3) for k, v in found_narratives.items()},
            "crystallized": crystallized,
            # Diagnostic termination info
            "termination": termination.to_dict(),
        })

        # Human readable
        reason_emoji = {
            "satisfaction_reached": "✓",
            "timeout": "⏱",
            "max_depth": "↓",
            "no_links": "⊘",
            "error": "✗",
        }.get(termination_reason, "?")

        self._write_human(exploration_id, f"""
{'═' * 80}
 END {exploration_id}
{'═' * 80}
 Termination:     {reason_emoji} {termination_reason}
 Duration:        {duration_ms}ms
 SubEntities:     {total_subentities}
 Total Steps:     {total_steps}
 Nodes Visited:   {len(nodes_visited)}
 Narratives Found: {len(found_narratives)}
 Crystallized:    {crystallized or 'None'}
 Final Satisfaction: {satisfaction:.2f}
 Final Criticality:  {criticality:.2f}
{' Error: ' + error_message if error_message else ''}
{'═' * 80}
""")

        # Cleanup
        self._explorations.pop(exploration_id, None)
        self._history.pop(exploration_id, None)

    # =========================================================================
    # STEP LOGGING
    # =========================================================================

    def log_step(
        self,
        exploration_id: str,
        subentity_id: str,
        actor_id: str,
        tick: int,
        step_number: int,
        state_before: str,
        state_after: str,
        transition_reason: Optional[str],
        position_node_id: str,
        position_node_type: str,
        position_node_name: str,
        depth: int,
        satisfaction: float,
        criticality: float,
        decision: Optional[DecisionInfo],
        movement: Optional[MovementInfo],
        found_narratives: Dict[str, float],
        new_this_step: Optional[str],
        alignment_this_step: Optional[float],
        parent_id: Optional[str],
        sibling_ids: List[str],
        children_ids: List[str],
        active_siblings: int,
        emotions: Dict[str, float],
        intention: str = "",
    ) -> StepRecord:
        """Log a complete step with all agent-comprehensible additions."""
        timestamp = self._timestamp()

        # Build step record
        step = StepRecord(
            timestamp=timestamp,
            exploration_id=exploration_id,
            subentity_id=subentity_id,
            actor_id=actor_id,
            tick=tick,
            step_number=step_number,
            state_before=state_before,
            state_after=state_after,
            transition_reason=transition_reason,
            position_node_id=position_node_id,
            position_node_type=position_node_type,
            position_node_name=position_node_name,
            depth=depth,
            satisfaction=satisfaction,
            criticality=criticality,
            decision=decision,
            movement=movement,
            found_narratives=found_narratives,
            new_this_step=new_this_step,
            alignment_this_step=alignment_this_step,
            parent_id=parent_id,
            sibling_ids=sibling_ids,
            children_ids=children_ids,
            active_siblings=active_siblings,
        )

        # Get history
        history = self._history.get(exploration_id, [])
        prev_step = history[-1] if history else None

        # Generate progress narrative
        step.progress_narrative = self._generate_progress_narrative(step, history, intention)

        # Detect anomalies
        step.anomalies = self._anomaly_detector.detect_anomalies(step, history)

        # Build causal chain
        step.causal_chain = self._causal_builder.build_chain(step, prev_step)

        # Extract learning signals
        step.learning_signals = self._learning_extractor.extract_signals(step, history)

        # Build exploration context
        step.exploration_context = self._build_exploration_context(step, history, intention)

        # Generate state diagram
        waiting = None
        if state_after == "BRANCHING":
            waiting = f"waiting for {len(children_ids)} children"
        step.state_diagram = generate_state_diagram(state_after, waiting)

        # Store in history
        history.append(step)
        self._history[exploration_id] = history

        # Write JSONL
        self._write_jsonl(exploration_id, step.to_dict())

        # Write human readable
        self._write_human(exploration_id, self._format_step_human(step))

        return step

    def _generate_progress_narrative(
        self,
        step: StepRecord,
        history: List[StepRecord],
        intention: str,
    ) -> str:
        """Generate progress narrative for the step."""
        parts = []

        # Step context
        parts.append(f"Step {step.step_number}:")

        # What happened
        if step.state_before != step.state_after:
            parts.append(f"Transitioned from {step.state_before} to {step.state_after}.")

        if step.new_this_step:
            parts.append(f"Found {step.new_this_step} (alignment={step.alignment_this_step:.2f}).")

        # Decision summary
        if step.decision:
            if step.decision.decision_type == "traverse":
                parts.append(f"Traversing to {step.movement.to_node_id if step.movement else 'next node'}.")
            elif step.decision.decision_type == "branch":
                children_count = step.decision.branch_info.get("children_count", 0) if step.decision.branch_info else 0
                parts.append(f"Branching into {children_count} parallel explorations.")
            elif step.decision.decision_type == "dead_end":
                parts.append("Hit dead end, reflecting.")

        # Progress assessment
        if step.satisfaction > 0.8:
            parts.append("Exploration nearing completion (high satisfaction).")
        elif step.satisfaction > 0.5:
            parts.append("Making progress.")
        elif step.criticality > 0.7:
            parts.append("Struggling to find aligned content.")

        return " ".join(parts)

    def _build_exploration_context(
        self,
        step: StepRecord,
        history: List[StepRecord],
        intention: str,
    ) -> ExplorationContext:
        """Build exploration context summary."""
        nodes_visited = list(set(h.position_node_id for h in history))

        # Path summary
        if len(nodes_visited) <= 3:
            path_summary = " → ".join(nodes_visited)
        else:
            path_summary = f"{nodes_visited[0]} → ... → {nodes_visited[-1]} ({len(nodes_visited)} nodes)"

        # Estimated remaining
        if step.satisfaction > 0.8:
            estimated = "Nearly complete"
        elif step.satisfaction > 0.5:
            estimated = "1-3 more steps expected"
        elif step.satisfaction > 0.2:
            estimated = "3-6 more steps expected"
        else:
            estimated = "Significant exploration remaining"

        return ExplorationContext(
            steps_taken=len(history),
            nodes_visited=nodes_visited,
            path_summary=path_summary,
            findings_so_far=step.found_narratives,
            estimated_remaining=estimated,
        )

    def _format_step_human(self, step: StepRecord) -> str:
        """Format step for human-readable output."""
        lines = []

        # Header
        indent = "    " * (step.depth)
        lines.append(f"{indent}[{step.subentity_id}] {step.state_after} @ {step.position_node_id}")

        # Progress narrative
        if step.progress_narrative:
            lines.append(f"{indent}    {step.progress_narrative}")

        # Decision details
        if step.decision:
            if step.decision.candidates:
                lines.append(f"{indent}    ├─ candidates:")
                for i, c in enumerate(step.decision.candidates):
                    prefix = "└─" if i == len(step.decision.candidates) - 1 else "├─"
                    verdict_mark = "✓" if c.verdict == "SELECTED" else "✗"
                    lines.append(
                        f"{indent}    │   {prefix} {c.link_id} → {c.target_id} ({c.target_type}) "
                        f"score={c.score:.2f} {verdict_mark}"
                    )
                    lines.append(
                        f"{indent}    │      sem={c.semantic:.2f} pol={c.polarity:.2f} "
                        f"perm={c.permanence_factor:.2f} nov={c.self_novelty:.2f} div={c.sibling_divergence:.2f}"
                    )
                    if c.why_not:
                        lines.append(f"{indent}    │      {c.why_not}")

            if step.decision.explanation:
                lines.append(f"{indent}    └─ {step.decision.explanation}")

        # Movement
        if step.movement:
            lines.append(
                f"{indent}    → {step.movement.from_node_id} → {step.movement.to_node_id} "
                f"via {step.movement.via_link_id}"
            )

        # Findings
        if step.new_this_step:
            lines.append(
                f"{indent}    ★ Found: {step.new_this_step} (alignment={step.alignment_this_step:.2f})"
            )

        # Anomalies
        for anomaly in step.anomalies:
            icon = "⚠" if anomaly.severity == AnomalySeverity.WARN else "ℹ"
            lines.append(f"{indent}    {icon} {anomaly.anomaly_type}: {anomaly.detail}")

        # Status
        lines.append(
            f"{indent}    satisfaction={step.satisfaction:.2f} criticality={step.criticality:.2f} depth={step.depth}"
        )

        return "\n".join(lines)

    # =========================================================================
    # EVENT LOGGING
    # =========================================================================

    def log_branch(
        self,
        exploration_id: str,
        parent_id: str,
        position: str,
        children: List[Dict[str, Any]],
        # New fields for diagnostic analysis
        trigger: str = "moment_reached",
        child_intents: Optional[List[str]] = None,
    ) -> None:
        """
        Log a branch event with diagnostic details.

        Args:
            exploration_id: Exploration identifier
            parent_id: Parent SubEntity ID
            position: Node ID where branching occurred
            children: List of child info dicts
            trigger: What caused branching (moment_reached, manual, etc.)
            child_intents: What each child is exploring (for diagnosis)
        """
        self._write_jsonl(exploration_id, {
            "event": "BRANCH",
            "exploration_id": exploration_id,
            "timestamp": self._timestamp(),
            # Diagnostic branching info
            "branching_event": {
                "trigger": trigger,
                "parent_id": parent_id,
                "position": position,
                "children_runed": len(children),
                "child_intents": child_intents or [c.get("intent", "explore") for c in children],
                "children": children,
            },
        })

        children_summary = ", ".join(c.get("id", "?") for c in children)
        intents_summary = ", ".join(child_intents or [])
        self._write_human(exploration_id, f"""    BRANCH @ {position}
        Trigger: {trigger}
        Children: [{children_summary}]
        Intents: [{intents_summary}]""")

    def log_merge(
        self,
        exploration_id: str,
        child_id: str,
        parent_id: str,
        contributed_narratives: Dict[str, float],
        satisfaction: float,
        crystallized: Optional[str],
        # New fields for diagnostic analysis
        parent_satisfaction_before: float = 0.0,
        parent_findings_before: int = 0,
    ) -> None:
        """
        Log a merge event with diagnostic details.

        Args:
            exploration_id: Exploration identifier
            child_id: Child SubEntity ID being merged
            parent_id: Parent SubEntity ID
            contributed_narratives: Narratives child found
            satisfaction: Child's final satisfaction
            crystallized: ID of crystallized narrative if any
            parent_satisfaction_before: Parent satisfaction before merge
            parent_findings_before: Parent finding count before merge
        """
        satisfaction_delta = satisfaction - parent_satisfaction_before
        parent_findings_after = parent_findings_before + len(contributed_narratives)

        self._write_jsonl(exploration_id, {
            "event": "MERGE",
            "exploration_id": exploration_id,
            "timestamp": self._timestamp(),
            # Diagnostic merge info
            "merge_event": {
                "child_id": child_id,
                "parent_id": parent_id,
                "findings_received": list(contributed_narratives.keys()),
                "findings_alignments": {k: round(v, 3) for k, v in contributed_narratives.items()},
                "child_satisfaction": round(satisfaction, 3),
                "parent_satisfaction_delta": round(satisfaction_delta, 3),
                "parent_findings_before": parent_findings_before,
                "parent_findings_after": parent_findings_after,
                "crystallized": crystallized,
            },
        })

        contrib = ", ".join(f"{k}:{v:.2f}" for k, v in contributed_narratives.items()) or "(none)"
        self._write_human(exploration_id, f"""    MERGE {child_id} → {parent_id}
        Contributed: [{contrib}]
        Parent Δsatisfaction: {satisfaction_delta:+.2f}
        Parent findings: {parent_findings_before} → {parent_findings_after}""")

    def log_crystallize(
        self,
        exploration_id: str,
        subentity_id: str,
        new_narrative_id: str,
        novelty_score: float,
        path_length: int,
    ) -> None:
        """Log a crystallization event."""
        self._write_jsonl(exploration_id, {
            "event": "CRYSTALLIZE",
            "exploration_id": exploration_id,
            "subentity_id": subentity_id,
            "new_narrative_id": new_narrative_id,
            "timestamp": self._timestamp(),
            "novelty_score": novelty_score,
            "path_length": path_length,
        })

        self._write_human(
            exploration_id,
            f"    ★★★ CRYSTALLIZE: {subentity_id} created {new_narrative_id} (novelty={novelty_score:.2f})"
        )

    def log_energy_injection(
        self,
        exploration_id: str,
        subentity_id: str,
        injection: EnergyInjection,
    ) -> None:
        """
        Log an energy injection event for diagnostic analysis.

        Args:
            exploration_id: Exploration identifier
            subentity_id: SubEntity performing injection
            injection: EnergyInjection details
        """
        self._write_jsonl(exploration_id, {
            "event": "ENERGY_INJECTION",
            "exploration_id": exploration_id,
            "subentity_id": subentity_id,
            "timestamp": self._timestamp(),
            "energy_injection": injection.to_dict(),
        })

        delta = injection.energy_after - injection.energy_before
        self._write_human(
            exploration_id,
            f"    ⚡ ENERGY: {injection.target_node} +{injection.amount:.3f} "
            f"({injection.energy_before:.3f} → {injection.energy_after:.3f}) [{injection.reason}]"
        )


# =============================================================================
# EXPLORATION ID GENERATOR
# =============================================================================

def generate_exploration_id(actor_id: str, intention: str) -> str:
    """
    Generate a descriptive exploration ID.

    Format: exp_{actor}_{query_slug}_{timestamp}

    Example: exp_edmund_find_truth_about_betrayal_20251226_143052

    Args:
        actor_id: Actor ID (e.g., "actor_edmund")
        intention: The exploration intention/query

    Returns:
        Descriptive exploration ID
    """
    import re

    # Extract actor name (remove "actor_" prefix if present)
    actor_name = actor_id.replace("actor_", "").replace("_", "")

    # Slugify intention: lowercase, replace spaces/special chars with underscores
    query_slug = intention.lower()
    query_slug = re.sub(r'[^a-z0-9\s]', '', query_slug)  # Remove special chars
    query_slug = re.sub(r'\s+', '_', query_slug.strip())  # Spaces to underscores
    query_slug = query_slug[:40]  # Limit length
    query_slug = query_slug.rstrip('_')  # Remove trailing underscores

    # Timestamp: YYYYMMDD_HHMMSS
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    return f"exp_{actor_name}_{query_slug}_{timestamp}"


# =============================================================================
# SINGLETON & FACTORY
# =============================================================================

_traversal_logger: Optional[TraversalLogger] = None


def get_traversal_logger() -> TraversalLogger:
    """Get the global traversal logger singleton."""
    global _traversal_logger
    if _traversal_logger is None:
        _traversal_logger = TraversalLogger()
    return _traversal_logger


def create_traversal_logger(
    log_dir: Optional[Path] = None,
    level: LogLevel = LogLevel.STEP,
    enable_human_readable: bool = True,
    enable_jsonl: bool = True,
) -> TraversalLogger:
    """Create a new traversal logger with custom settings."""
    return TraversalLogger(
        log_dir=log_dir,
        level=level,
        enable_human_readable=enable_human_readable,
        enable_jsonl=enable_jsonl,
    )
