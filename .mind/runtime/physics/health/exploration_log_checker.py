"""
Exploration Log Health Checker (v1.9)

Analyzes SubEntity traversal logs to assess exploration quality.

HEALTH: docs/physics/subentity/HEALTH_SubEntity.md

Indicators:
- H1: Efficiency (narratives_found / steps)
- H2: Satisfaction velocity (Δsatisfaction / steps)
- H3: Sibling divergence (mean divergence across branches)
- H4: Semantic quality (mean semantic of selected links)
- H5: Backtrack rate (revisits / steps)
- H6: Crystallization novelty (novelty score if crystallized)
- H7: Anomaly count (number of anomalies)

Usage:
    python -m mind.physics.health.exploration_log_checker <exploration_id>
    python -m mind.physics.health.exploration_log_checker --all --since 1h

IMPL: mind/physics/traversal_logger.py
"""

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

from .base import HealthStatus, HealthResult, BaseChecker

logger = logging.getLogger(__name__)

# Default log directory
LOG_DIR = Path("engine/data/logs/traversal")


@dataclass
class ExplorationHealthReport:
    """Complete health report for an exploration."""
    exploration_id: str
    overall_status: HealthStatus
    checks: Dict[str, HealthResult]
    summary: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "exploration_id": self.exploration_id,
            "overall_status": self.overall_status.value,
            "checks": {k: v.to_dict() for k, v in self.checks.items()},
            "summary": self.summary,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class StepRecord:
    """Parsed step record from JSONL log."""
    step_id: int
    state_after: str
    depth: int
    satisfaction: float
    criticality: float
    decision: Optional[Dict] = None
    movement: Optional[Dict] = None
    anomalies: List[Dict] = field(default_factory=list)
    found_narratives: Dict[str, float] = field(default_factory=dict)


def parse_log_file(log_path: Path) -> List[StepRecord]:
    """
    Parse a JSONL traversal log file.

    Args:
        log_path: Path to the traversal_{id}.jsonl file

    Returns:
        List of StepRecord objects
    """
    steps = []

    if not log_path.exists():
        logger.warning(f"Log file not found: {log_path}")
        return steps

    with open(log_path, 'r') as f:
        for line_num, line in enumerate(f, 1):
            try:
                record = json.loads(line.strip())

                # Only process STEP-level records
                header = record.get("header", {})
                if header.get("level") != "STEP":
                    continue

                step = StepRecord(
                    step_id=record.get("step_id", line_num),
                    state_after=record.get("state_after", "unknown"),
                    depth=record.get("depth", 0),
                    satisfaction=record.get("satisfaction", 0.0),
                    criticality=record.get("criticality", 0.0),
                    decision=record.get("decision"),
                    movement=record.get("movement"),
                    anomalies=record.get("anomalies", []),
                    found_narratives=record.get("found_narratives", {}),
                )
                steps.append(step)

            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse line {line_num}: {e}")
                continue

    return steps


class EfficiencyChecker(BaseChecker):
    """
    H1: Check exploration efficiency (narratives found / steps).

    HEALTHY: ≥ 0.20
    WARNING: 0.10-0.19
    ERROR: < 0.10
    """

    name = "efficiency"
    validation_ids = ["H1"]
    priority = "high"

    HEALTHY_THRESHOLD = 0.20
    WARNING_THRESHOLD = 0.10

    def __init__(self, steps: List[StepRecord], **kwargs):
        super().__init__(**kwargs)
        self.steps = steps

    def check(self) -> HealthResult:
        if not self.steps:
            return self.unknown("No steps to analyze")

        num_steps = len(self.steps)
        final_step = self.steps[-1]
        narratives_found = len(final_step.found_narratives)

        efficiency = narratives_found / num_steps if num_steps > 0 else 0

        details = {
            "steps": num_steps,
            "narratives_found": narratives_found,
            "efficiency": round(efficiency, 4),
        }

        if efficiency >= self.HEALTHY_THRESHOLD:
            return self.ok(f"Efficiency {efficiency:.2f} (≥ {self.HEALTHY_THRESHOLD})", details)
        elif efficiency >= self.WARNING_THRESHOLD:
            return self.warn(f"Low efficiency {efficiency:.2f}", details)
        else:
            return self.error(f"Very low efficiency {efficiency:.2f}", details)


class SatisfactionVelocityChecker(BaseChecker):
    """
    H2: Check satisfaction velocity (Δsatisfaction / steps).

    HEALTHY: ≥ 0.10
    WARNING: 0.03-0.09
    ERROR: < 0.03
    """

    name = "satisfaction_velocity"
    validation_ids = ["H2"]
    priority = "high"

    HEALTHY_THRESHOLD = 0.10
    WARNING_THRESHOLD = 0.03

    def __init__(self, steps: List[StepRecord], **kwargs):
        super().__init__(**kwargs)
        self.steps = steps

    def check(self) -> HealthResult:
        if len(self.steps) < 2:
            return self.ok("Insufficient data (< 2 steps)", {"steps": len(self.steps)})

        initial = self.steps[0].satisfaction
        final = self.steps[-1].satisfaction
        num_steps = len(self.steps)

        velocity = (final - initial) / num_steps if num_steps > 0 else 0

        details = {
            "initial_satisfaction": round(initial, 4),
            "final_satisfaction": round(final, 4),
            "delta": round(final - initial, 4),
            "steps": num_steps,
            "velocity": round(velocity, 4),
        }

        if velocity >= self.HEALTHY_THRESHOLD:
            return self.ok(f"Velocity {velocity:.2f}/step", details)
        elif velocity >= self.WARNING_THRESHOLD:
            return self.warn(f"Slow velocity {velocity:.2f}/step", details)
        else:
            return self.error(f"Stalled velocity {velocity:.2f}/step", details)


class SiblingDivergenceChecker(BaseChecker):
    """
    H3: Check sibling divergence (mean divergence across branches).

    HEALTHY: ≥ 0.70
    WARNING: 0.50-0.69
    ERROR: < 0.50
    """

    name = "sibling_divergence"
    validation_ids = ["H3"]
    priority = "high"

    HEALTHY_THRESHOLD = 0.70
    WARNING_THRESHOLD = 0.50

    def __init__(self, steps: List[StepRecord], **kwargs):
        super().__init__(**kwargs)
        self.steps = steps

    def check(self) -> HealthResult:
        divergences = []

        for step in self.steps:
            if step.decision and step.decision.get("candidates"):
                for candidate in step.decision["candidates"]:
                    div = candidate.get("sibling_divergence", 0)
                    if div > 0:
                        divergences.append(div)

        if not divergences:
            return self.ok("No branching occurred", {"branches": 0})

        mean_div = sum(divergences) / len(divergences)
        min_div = min(divergences)
        max_div = max(divergences)

        details = {
            "mean_divergence": round(mean_div, 4),
            "min_divergence": round(min_div, 4),
            "max_divergence": round(max_div, 4),
            "sample_count": len(divergences),
        }

        if mean_div >= self.HEALTHY_THRESHOLD:
            return self.ok(f"Mean divergence {mean_div:.2f}", details)
        elif mean_div >= self.WARNING_THRESHOLD:
            return self.warn(f"Low divergence {mean_div:.2f}", details)
        else:
            return self.error(f"Poor divergence {mean_div:.2f}", details)


class SemanticQualityChecker(BaseChecker):
    """
    H4: Check semantic quality (mean semantic of selected links).

    HEALTHY: ≥ 0.60
    WARNING: 0.40-0.59
    ERROR: < 0.40
    """

    name = "semantic_quality"
    validation_ids = ["H4"]
    priority = "high"

    HEALTHY_THRESHOLD = 0.60
    WARNING_THRESHOLD = 0.40

    def __init__(self, steps: List[StepRecord], **kwargs):
        super().__init__(**kwargs)
        self.steps = steps

    def check(self) -> HealthResult:
        semantics = []

        for step in self.steps:
            if step.decision and step.decision.get("candidates"):
                for candidate in step.decision["candidates"]:
                    if candidate.get("verdict") == "SELECTED":
                        semantic = candidate.get("semantic", 0)
                        semantics.append(semantic)

        if not semantics:
            return self.ok("No traversals with decisions", {"decisions": 0})

        mean_sem = sum(semantics) / len(semantics)
        min_sem = min(semantics)

        details = {
            "mean_semantic": round(mean_sem, 4),
            "min_semantic": round(min_sem, 4),
            "decision_count": len(semantics),
        }

        if mean_sem >= self.HEALTHY_THRESHOLD:
            return self.ok(f"Mean semantic {mean_sem:.2f}", details)
        elif mean_sem >= self.WARNING_THRESHOLD:
            return self.warn(f"Low semantic {mean_sem:.2f}", details)
        else:
            return self.error(f"Poor semantic {mean_sem:.2f}", details)


class BacktrackRateChecker(BaseChecker):
    """
    H5: Check backtrack rate (revisits / steps).

    HEALTHY: < 0.10
    WARNING: 0.10-0.29
    ERROR: ≥ 0.30
    """

    name = "backtrack_rate"
    validation_ids = ["H5"]
    priority = "high"

    HEALTHY_THRESHOLD = 0.10
    WARNING_THRESHOLD = 0.30

    def __init__(self, steps: List[StepRecord], **kwargs):
        super().__init__(**kwargs)
        self.steps = steps

    def check(self) -> HealthResult:
        if not self.steps:
            return self.unknown("No steps to analyze")

        visited = set()
        backtracks = 0

        for step in self.steps:
            if step.movement:
                to_node = step.movement.get("to_node_id")
                from_node = step.movement.get("from_node_id")

                if to_node and to_node in visited:
                    backtracks += 1

                if from_node:
                    visited.add(from_node)
                if to_node:
                    visited.add(to_node)

        rate = backtracks / len(self.steps) if self.steps else 0

        details = {
            "backtracks": backtracks,
            "steps": len(self.steps),
            "unique_nodes_visited": len(visited),
            "rate": round(rate, 4),
        }

        if rate < self.HEALTHY_THRESHOLD:
            return self.ok(f"Backtrack rate {rate:.2f}", details)
        elif rate < self.WARNING_THRESHOLD:
            return self.warn(f"High backtrack rate {rate:.2f}", details)
        else:
            return self.error(f"Excessive backtracking {rate:.2f}", details)


class CrystallizationNoveltyChecker(BaseChecker):
    """
    H6: Check crystallization novelty score.

    HEALTHY: ≥ 0.85
    WARNING: 0.70-0.84
    ERROR: < 0.70

    Note: Only applicable if crystallization occurred.
    """

    name = "crystallization_novelty"
    validation_ids = ["H6"]
    priority = "med"

    HEALTHY_THRESHOLD = 0.85
    WARNING_THRESHOLD = 0.70

    def __init__(self, steps: List[StepRecord], crystallization_record: Optional[Dict] = None, **kwargs):
        super().__init__(**kwargs)
        self.steps = steps
        self.crystallization_record = crystallization_record

    def check(self) -> HealthResult:
        # Check if crystallization occurred
        crystallized = False
        novelty = None

        for step in self.steps:
            if step.state_after.lower() == "crystallizing":
                crystallized = True
                # Try to get novelty from step or crystallization record
                if self.crystallization_record:
                    novelty = self.crystallization_record.get("novelty_score")
                break

        if not crystallized:
            return self.ok("No crystallization occurred", {"crystallized": False})

        if novelty is None:
            return self.unknown("Crystallization occurred but novelty score not recorded")

        details = {
            "crystallized": True,
            "novelty_score": round(novelty, 4),
        }

        if novelty >= self.HEALTHY_THRESHOLD:
            return self.ok(f"Novelty {novelty:.2f}", details)
        elif novelty >= self.WARNING_THRESHOLD:
            return self.warn(f"Borderline novelty {novelty:.2f}", details)
        else:
            return self.error(f"Likely duplicate {novelty:.2f}", details)


class AnomalyCountChecker(BaseChecker):
    """
    H7: Check anomaly count.

    HEALTHY: 0
    WARNING: 1-2
    ERROR: ≥ 3
    """

    name = "anomaly_count"
    validation_ids = ["H7"]
    priority = "high"

    def __init__(self, steps: List[StepRecord], **kwargs):
        super().__init__(**kwargs)
        self.steps = steps

    def check(self) -> HealthResult:
        warn_count = 0
        error_count = 0
        anomaly_details = []

        for step in self.steps:
            for anomaly in step.anomalies:
                severity = anomaly.get("severity", {})
                sev_value = severity.get("value", "warn") if isinstance(severity, dict) else severity

                if sev_value == "error":
                    error_count += 1
                else:
                    warn_count += 1

                anomaly_details.append({
                    "step": step.step_id,
                    "type": anomaly.get("type", "unknown"),
                    "severity": sev_value,
                })

        total = warn_count + error_count

        details = {
            "total": total,
            "warnings": warn_count,
            "errors": error_count,
            "anomalies": anomaly_details[:10],  # First 10 only
        }

        if total == 0:
            return self.ok("No anomalies", details)
        elif total <= 2:
            return self.warn(f"{total} anomalies detected", details)
        else:
            return self.error(f"{total} anomalies detected", details)


def run_exploration_health_checks(
    exploration_id: str,
    log_dir: Path = LOG_DIR,
) -> ExplorationHealthReport:
    """
    Run all health checks on an exploration log.

    Args:
        exploration_id: ID of the exploration to analyze
        log_dir: Directory containing traversal logs

    Returns:
        ExplorationHealthReport with all check results
    """
    log_path = log_dir / f"traversal_{exploration_id}.jsonl"
    steps = parse_log_file(log_path)

    if not steps:
        return ExplorationHealthReport(
            exploration_id=exploration_id,
            overall_status=HealthStatus.UNKNOWN,
            checks={},
            summary={"error": f"No steps found in {log_path}"},
        )

    # Run all checkers
    checkers = [
        EfficiencyChecker(steps),
        SatisfactionVelocityChecker(steps),
        SiblingDivergenceChecker(steps),
        SemanticQualityChecker(steps),
        BacktrackRateChecker(steps),
        CrystallizationNoveltyChecker(steps),
        AnomalyCountChecker(steps),
    ]

    results = {}
    for checker in checkers:
        try:
            result = checker.check()
            results[checker.name] = result
        except Exception as e:
            logger.exception(f"Checker {checker.name} failed")
            results[checker.name] = HealthResult(
                checker_name=checker.name,
                status=HealthStatus.UNKNOWN,
                message=f"Checker crashed: {e}",
            )

    # Compute overall status
    statuses = [r.status for r in results.values()]
    if HealthStatus.ERROR in statuses:
        overall = HealthStatus.ERROR
    elif HealthStatus.WARN in statuses:
        overall = HealthStatus.WARN
    elif HealthStatus.UNKNOWN in statuses:
        overall = HealthStatus.UNKNOWN
    else:
        overall = HealthStatus.OK

    # Build summary
    final_step = steps[-1]
    summary = {
        "steps": len(steps),
        "final_satisfaction": round(final_step.satisfaction, 4),
        "narratives_found": len(final_step.found_narratives),
        "max_depth": max(s.depth for s in steps),
        "status_counts": {
            "ok": sum(1 for s in statuses if s == HealthStatus.OK),
            "warn": sum(1 for s in statuses if s == HealthStatus.WARN),
            "error": sum(1 for s in statuses if s == HealthStatus.ERROR),
            "unknown": sum(1 for s in statuses if s == HealthStatus.UNKNOWN),
        },
    }

    return ExplorationHealthReport(
        exploration_id=exploration_id,
        overall_status=overall,
        checks=results,
        summary=summary,
    )


def find_recent_explorations(log_dir: Path, since: timedelta) -> List[str]:
    """Find exploration IDs with logs modified within the time window."""
    cutoff = datetime.utcnow() - since
    exploration_ids = []

    if not log_dir.exists():
        return exploration_ids

    for log_file in log_dir.glob("traversal_*.jsonl"):
        mtime = datetime.utcfromtimestamp(log_file.stat().st_mtime)
        if mtime >= cutoff:
            # Extract exploration_id from filename
            exp_id = log_file.stem.replace("traversal_", "")
            exploration_ids.append(exp_id)

    return sorted(exploration_ids)


def print_health_report(report: ExplorationHealthReport, verbose: bool = False):
    """Print health report to console."""
    status_emoji = {
        HealthStatus.OK: "\033[92m✓\033[0m",
        HealthStatus.WARN: "\033[93m⚠\033[0m",
        HealthStatus.ERROR: "\033[91m✗\033[0m",
        HealthStatus.UNKNOWN: "\033[90m?\033[0m",
    }

    status_color = {
        HealthStatus.OK: "\033[92m",
        HealthStatus.WARN: "\033[93m",
        HealthStatus.ERROR: "\033[91m",
        HealthStatus.UNKNOWN: "\033[90m",
    }
    reset = "\033[0m"

    # Header
    print("═" * 79)
    print(f"HEALTH REPORT: {report.exploration_id}")
    print("═" * 79)
    print()

    # Overall status
    color = status_color.get(report.overall_status, "")
    print(f"OVERALL: {color}{report.overall_status.value.upper()}{reset} "
          f"{status_emoji.get(report.overall_status, '?')}")
    print()

    # Checks
    print("Checks:")
    for name, result in report.checks.items():
        emoji = status_emoji.get(result.status, "?")
        print(f"  {emoji} {name}: {result.message}")
        if verbose and result.details:
            for key, value in result.details.items():
                if key != "anomalies":  # Skip verbose anomaly list
                    print(f"      {key}: {value}")
    print()

    # Summary
    print("Summary:")
    for key, value in report.summary.items():
        if key != "status_counts":
            print(f"  - {key}: {value}")
    print()

    # Verdict
    verdicts = {
        HealthStatus.OK: "Efficient exploration with good decisions.",
        HealthStatus.WARN: "Some issues detected, review recommended.",
        HealthStatus.ERROR: "Significant problems, investigation needed.",
        HealthStatus.UNKNOWN: "Could not fully assess exploration.",
    }
    print(f"Verdict: {verdicts.get(report.overall_status, 'Unknown')}")
    print("═" * 79)


def parse_duration(duration_str: str) -> timedelta:
    """Parse duration string like '1h', '30m', '2d'."""
    if duration_str.endswith('h'):
        return timedelta(hours=int(duration_str[:-1]))
    elif duration_str.endswith('m'):
        return timedelta(minutes=int(duration_str[:-1]))
    elif duration_str.endswith('d'):
        return timedelta(days=int(duration_str[:-1]))
    else:
        # Assume hours
        return timedelta(hours=int(duration_str))


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="SubEntity Exploration Log Health Checker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "exploration_id",
        nargs="?",
        help="Exploration ID to analyze",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Check all recent explorations",
    )
    parser.add_argument(
        "--since",
        default="1h",
        help="Time window for --all (e.g., 1h, 30m, 2d)",
    )
    parser.add_argument(
        "--log-dir",
        type=Path,
        default=LOG_DIR,
        help="Directory containing traversal logs",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed output",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON",
    )

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s: %(message)s",
    )

    if args.all:
        # Check all recent explorations
        since = parse_duration(args.since)
        exploration_ids = find_recent_explorations(args.log_dir, since)

        if not exploration_ids:
            print(f"No explorations found in the last {args.since}")
            sys.exit(0)

        reports = []
        for exp_id in exploration_ids:
            report = run_exploration_health_checks(exp_id, args.log_dir)
            reports.append(report)

        if args.json:
            print(json.dumps([r.to_dict() for r in reports], indent=2))
        else:
            for report in reports:
                print_health_report(report, args.verbose)
                print()

        # Exit code based on worst status
        statuses = [r.overall_status for r in reports]
        if HealthStatus.ERROR in statuses:
            sys.exit(2)
        elif HealthStatus.WARN in statuses:
            sys.exit(1)
        else:
            sys.exit(0)

    elif args.exploration_id:
        # Check single exploration
        report = run_exploration_health_checks(args.exploration_id, args.log_dir)

        if args.json:
            print(json.dumps(report.to_dict(), indent=2))
        else:
            print_health_report(report, args.verbose)

        if report.overall_status == HealthStatus.ERROR:
            sys.exit(2)
        elif report.overall_status == HealthStatus.WARN:
            sys.exit(1)
        else:
            sys.exit(0)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
