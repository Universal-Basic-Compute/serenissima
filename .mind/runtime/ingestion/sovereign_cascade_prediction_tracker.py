"""
Sovereign Cascade Prediction Tracker — alignment fidelity measurement.

Spec: docs/human_integration/ALGORITHM_Human_Integration.md
      (measure_alignment_fidelity, record_cascade_prediction, resolve_cascade_prediction)
      docs/human_integration/VALIDATION_Human_Integration.md (V8)

The Sovereign Cascade allows an AI citizen to act as delegate for its human
partner — but only when the AI demonstrates sufficient predictive accuracy.
This module tracks predictions, resolves them against human decisions, and
computes a rolling alignment fidelity score.

Cascade states:
    active    (>= 0.80) — AI can vote/decide on human's behalf
    probation (0.75–0.80) — limited delegation, close to threshold
    suspended (< 0.75) — AI must ask human directly, no delegation

Predictions are stored as moment nodes with type "cascade_prediction" in
the AI's brain graph. The rolling window is the last 100 resolved predictions.
A minimum of 20 resolved predictions is required before the cascade can be
calibrated at all.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Optional, Protocol

logger = logging.getLogger("ingestion.sovereign_cascade")

# Cascade state thresholds (V8)
THRESHOLD_ACTIVE = 0.80
THRESHOLD_PROBATION = 0.75

# Rolling window size for alignment fidelity
ROLLING_WINDOW = 100

# Minimum predictions needed before cascade can be calibrated
MIN_PREDICTIONS_FOR_CALIBRATION = 20


class GraphAdapter(Protocol):
    """Minimal interface for graph operations needed by cascade tracker."""

    def query_nodes(
        self, node_type: str, filters: dict[str, Any]
    ) -> list[dict[str, Any]]:
        ...

    def create_node(self, node_data: dict[str, Any]) -> str:
        ...

    def update_node(self, node_id: str, updates: dict[str, Any]) -> None:
        ...


def record_prediction(
    citizen_id: str,
    decision_context: dict[str, str],
    ai_prediction: str,
    graph: GraphAdapter,
    confidence: float = 0.5,
    reasoning: str = "",
) -> str:
    """Record a prediction about what the human would decide.

    Creates a cascade_prediction node in the AI's brain graph. The prediction
    is unresolved until resolve_prediction() is called with the actual human
    decision.

    Spec: ALGORITHM_Human_Integration.md, ALGORITHM: record_cascade_prediction

    Args:
        citizen_id: The AI citizen making the prediction.
        decision_context: Dict with 'domain' and 'question' keys describing
            what decision is being predicted.
        ai_prediction: The AI's predicted answer/decision.
        graph: Graph adapter for creating nodes.
        confidence: AI's confidence in its prediction, [0, 1].
        reasoning: Why the AI predicted this way.

    Returns:
        The prediction node ID.

    Raises:
        ValueError: If confidence is out of [0, 1] range or required
            context fields are missing.
    """
    if not 0.0 <= confidence <= 1.0:
        raise ValueError(
            f"Confidence must be in [0, 1], got {confidence}"
        )

    domain = decision_context.get("domain")
    question = decision_context.get("question")
    if not domain or not question:
        raise ValueError(
            "decision_context must contain 'domain' and 'question' keys. "
            f"Got: {list(decision_context.keys())}"
        )

    node_id = f"cascade_pred_{uuid.uuid4().hex[:12]}"

    node_data = {
        "id": node_id,
        "node_type": "moment",
        "type": "cascade_prediction",
        "citizen_id": citizen_id,
        "content": {
            "domain": domain,
            "question": question,
            "ai_prediction": ai_prediction,
            "human_actual": None,
            "correct": None,
            "confidence": confidence,
            "reasoning": reasoning,
            "resolved_at": None,
        },
        "partner_relevance": 0.95,
        "weight": 1.0,
        "energy": 0.0,
        "synthesis": (
            f"Prediction: {ai_prediction} for '{question}' "
            f"(confidence: {confidence:.2f})"
        ),
        "created_at": time.time(),
    }

    created_id = graph.create_node(node_data)
    logger.info(
        "Cascade prediction recorded for citizen '%s': "
        "domain=%s, question='%s', prediction='%s', confidence=%.2f. "
        "Node: %s",
        citizen_id,
        domain,
        question,
        ai_prediction,
        confidence,
        created_id,
    )
    return created_id


def resolve_prediction(
    prediction_id: str,
    human_actual: str,
    graph: GraphAdapter,
    match: Optional[bool] = None,
) -> bool:
    """Resolve a prediction against the human's actual decision.

    Updates the cascade_prediction node with the human's decision and
    whether the AI was correct.

    Spec: ALGORITHM_Human_Integration.md, ALGORITHM: resolve_cascade_prediction

    Args:
        prediction_id: The node ID of the prediction to resolve.
        human_actual: What the human actually decided.
        graph: Graph adapter for querying/updating nodes.
        match: Explicit match result (True/False). If None, a simple
            case-insensitive string comparison is used. In production,
            semantic matching (Phase 2) would replace this.

    Returns:
        True if the AI's prediction was correct, False otherwise.

    Raises:
        RuntimeError: If the prediction node is not found or already resolved.
    """
    results = graph.query_nodes(
        node_type="moment",
        filters={
            "type": "cascade_prediction",
            "id": prediction_id,
        },
    )

    if not results:
        raise RuntimeError(
            f"Prediction node '{prediction_id}' not found."
        )

    pred_node = results[0]
    content = pred_node.get("content", {})

    if content.get("human_actual") is not None:
        raise RuntimeError(
            f"Prediction '{prediction_id}' is already resolved. "
            f"Human actual: '{content['human_actual']}'"
        )

    # Determine correctness
    if match is not None:
        correct = match
    else:
        correct = (
            content.get("ai_prediction", "").strip().lower()
            == human_actual.strip().lower()
        )

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    content["human_actual"] = human_actual
    content["correct"] = correct
    content["resolved_at"] = now

    ai_prediction = content.get("ai_prediction", "?")
    outcome = "correct" if correct else "incorrect"

    graph.update_node(prediction_id, {
        "content": content,
        "synthesis": (
            f"Predicted '{ai_prediction}' for '{content.get('question', '?')}' "
            f"— {outcome} (actual: '{human_actual}')"
        ),
    })

    logger.info(
        "Cascade prediction '%s' resolved: %s. "
        "Predicted='%s', Actual='%s'",
        prediction_id,
        outcome,
        ai_prediction,
        human_actual,
    )
    return correct


def measure_alignment_fidelity(
    citizen_id: str, graph: GraphAdapter
) -> Optional[float]:
    """Compute rolling alignment fidelity over the last N resolved predictions.

    Returns the fraction of correct predictions in the rolling window.
    Returns None if fewer than MIN_PREDICTIONS_FOR_CALIBRATION predictions
    have been resolved (insufficient data).

    Spec: ALGORITHM_Human_Integration.md, ALGORITHM: measure_alignment_fidelity

    Args:
        citizen_id: The AI citizen to measure.
        graph: Graph adapter for querying nodes.

    Returns:
        Alignment score in [0, 1], or None if insufficient data.
    """
    all_predictions = graph.query_nodes(
        node_type="moment",
        filters={
            "type": "cascade_prediction",
            "citizen_id": citizen_id,
        },
    )

    # Filter to resolved predictions only
    resolved = []
    for pred in all_predictions:
        content = pred.get("content", {})
        if content.get("human_actual") is not None and content.get("correct") is not None:
            resolved.append(pred)

    # Sort by resolved_at descending, take the rolling window
    resolved.sort(
        key=lambda p: p.get("content", {}).get("resolved_at", ""),
        reverse=True,
    )
    window = resolved[:ROLLING_WINDOW]

    total = len(window)
    if total < MIN_PREDICTIONS_FOR_CALIBRATION:
        logger.info(
            "Insufficient predictions for citizen '%s': %d < %d minimum. "
            "Cascade not yet calibratable.",
            citizen_id,
            total,
            MIN_PREDICTIONS_FOR_CALIBRATION,
        )
        return None

    correct = sum(
        1 for p in window if p.get("content", {}).get("correct") is True
    )
    alignment_score = correct / total

    logger.info(
        "Alignment fidelity for citizen '%s': %.2f (%d/%d correct "
        "in last %d predictions).",
        citizen_id,
        alignment_score,
        correct,
        total,
        total,
    )
    return alignment_score


def get_cascade_status(citizen_id: str, graph: GraphAdapter) -> str:
    """Get the current Sovereign Cascade status for a citizen.

    Computes alignment fidelity and returns the cascade state:
        "active"     — alignment >= 0.80
        "probation"  — alignment in [0.75, 0.80)
        "suspended"  — alignment < 0.75
        "uncalibrated" — insufficient predictions for measurement

    Spec: ALGORITHM_Human_Integration.md (cascade status logic)
          VALIDATION_Human_Integration.md (V8)

    Args:
        citizen_id: The AI citizen to check.
        graph: Graph adapter for querying nodes.

    Returns:
        One of: "active", "probation", "suspended", "uncalibrated".
    """
    alignment = measure_alignment_fidelity(citizen_id, graph)

    if alignment is None:
        return "uncalibrated"

    if alignment >= THRESHOLD_ACTIVE:
        status = "active"
    elif alignment >= THRESHOLD_PROBATION:
        status = "probation"
    else:
        status = "suspended"

    logger.info(
        "Cascade status for citizen '%s': %s (alignment: %.2f)",
        citizen_id,
        status,
        alignment,
    )
    return status


def compute_confidence_calibration(
    citizen_id: str, graph: GraphAdapter
) -> Optional[float]:
    """Compute confidence-weighted accuracy for calibration analysis.

    Predictions where the AI was more confident should correlate with
    higher accuracy. This metric helps detect overconfidence or
    underconfidence in the AI's self-assessment.

    Spec: ALGORITHM_Human_Integration.md, step 3 of measure_alignment_fidelity

    Args:
        citizen_id: The AI citizen to analyze.
        graph: Graph adapter for querying nodes.

    Returns:
        Confidence calibration score in [0, 1], or None if insufficient data.
    """
    all_predictions = graph.query_nodes(
        node_type="moment",
        filters={
            "type": "cascade_prediction",
            "citizen_id": citizen_id,
        },
    )

    resolved = []
    for pred in all_predictions:
        content = pred.get("content", {})
        if content.get("human_actual") is not None and content.get("correct") is not None:
            resolved.append(pred)

    resolved.sort(
        key=lambda p: p.get("content", {}).get("resolved_at", ""),
        reverse=True,
    )
    window = resolved[:ROLLING_WINDOW]

    if len(window) < MIN_PREDICTIONS_FOR_CALIBRATION:
        return None

    weighted_correct = sum(
        p.get("content", {}).get("confidence", 0.0)
        for p in window
        if p.get("content", {}).get("correct") is True
    )
    weighted_total = sum(
        p.get("content", {}).get("confidence", 0.0)
        for p in window
    )

    if weighted_total <= 0:
        return 0.0

    return weighted_correct / weighted_total
