"""
Diagnostic Report Generator for SubEntity Explorations

Generates structured diagnostic reports from:
1. Traversal logs (JSONL)
2. Metrics reports (from exploration_log_checker.py)

Output: Markdown files designed for LLM agent analysis using
SKILL_Assess_SubEntity_Exploration_Quality_From_Logs.md

HEALTH: docs/physics/subentity/HEALTH_SubEntity.md
SKILL: templates/mind/skills/SKILL_Assess_SubEntity_Exploration_Quality_From_Logs.md

Usage:
    python -m mind.physics.health.diagnostic_report_generator <exploration_id>
    python -m mind.physics.health.diagnostic_report_generator --all --since 1h
"""

import argparse
import json
import logging
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

from .base import HealthStatus, HealthResult
from .exploration_log_checker import (
    run_exploration_health_checks,
    ExplorationHealthReport,
    parse_log_file,
    StepRecord,
    find_recent_explorations,
    parse_duration,
)

logger = logging.getLogger(__name__)

# Directories
LOG_DIR = Path("engine/data/logs/traversal")
REPORT_DIR = Path("engine/data/logs/traversal")  # Store alongside logs


# =============================================================================
# FAILURE PATTERN DETECTION
# =============================================================================

@dataclass
class FailurePattern:
    """A recognized failure pattern from the skill."""
    name: str
    description: str
    likely_layer: int
    common_causes: List[str]
    suggested_fix: str


FAILURE_PATTERNS = [
    FailurePattern(
        name="found_nothing_but_narratives_exist",
        description="Found nothing but narratives exist in graph",
        likely_layer=3,
        common_causes=[
            "Semantic alignment low due to embedding mismatch",
            "Self-novelty killing path to narrative",
            "Permanence too high on links (not traversable)",
        ],
        suggested_fix="Check scoring breakdown, adjust weights or re-embed",
    ),
    FailurePattern(
        name="found_wrong_things_confidently",
        description="Found wrong things with high confidence",
        likely_layer=3,
        common_causes=[
            "Intention embedding too broad (matches many things)",
            "Query/intention mismatch",
            "Polarity reinforcement loop",
        ],
        suggested_fix="Improve query/intention extraction, consider polarity decay",
    ),
    FailurePattern(
        name="ran_forever_found_little",
        description="Ran for long time, found little",
        likely_layer=2,
        common_causes=[
            "No good links from start position (poor origin)",
            "Self-novelty too aggressive",
            "Branching not triggering",
        ],
        suggested_fix="Check origin selection, tune novelty/branching thresholds",
    ),
    FailurePattern(
        name="crystallized_garbage",
        description="Crystallized narrative makes no sense",
        likely_layer=3,
        common_causes=[
            "Crystallization embedding drifted badly",
            "Novelty gate passed but shouldn't have",
            "Path included irrelevant nodes",
        ],
        suggested_fix="Check embedding evolution, tighten novelty threshold",
    ),
    FailurePattern(
        name="AGENT_shouldnt_have_explored",
        description="Exploration triggered but was wrong tool",
        likely_layer=5,
        common_causes=[
            "Skill doesn't distinguish exploration from other tools",
            "Protocol selection logic flawed",
            "Agent lacks context to choose correctly",
        ],
        suggested_fix="Improve skill decision criteria, add protocol selection guidance",
    ),
]


def detect_failure_patterns(
    health_report: ExplorationHealthReport,
    log_data: Dict[str, Any],
) -> List[FailurePattern]:
    """Detect which failure patterns match this exploration."""
    matched = []

    # Pattern: found_nothing_but_narratives_exist
    efficiency = health_report.checks.get("efficiency")
    if efficiency and efficiency.status == HealthStatus.ERROR:
        if efficiency.details.get("narratives_found", 0) == 0:
            matched.append(FAILURE_PATTERNS[0])

    # Pattern: ran_forever_found_little
    if efficiency and efficiency.status in [HealthStatus.ERROR, HealthStatus.WARN]:
        steps = efficiency.details.get("steps", 0)
        if steps > 15:  # Many steps
            matched.append(FAILURE_PATTERNS[2])

    # Pattern: crystallized_garbage (check novelty score)
    novelty = health_report.checks.get("crystallization_novelty")
    if novelty and novelty.status == HealthStatus.ERROR:
        matched.append(FAILURE_PATTERNS[3])

    # Pattern: found_wrong_things_confidently
    semantic = health_report.checks.get("semantic_quality")
    satisfaction = health_report.summary.get("final_satisfaction", 0)
    if semantic and semantic.status in [HealthStatus.WARN, HealthStatus.ERROR]:
        if satisfaction > 0.5:  # High satisfaction but low semantic = wrong things
            matched.append(FAILURE_PATTERNS[1])

    return matched


# =============================================================================
# LOG PARSING HELPERS
# =============================================================================

def extract_exploration_context(log_path: Path) -> Optional[Dict[str, Any]]:
    """Extract exploration context from START event.

    Supports both old format (fields at top level) and new format (exploration_context nested).
    """
    if not log_path.exists():
        return None

    with open(log_path, 'r') as f:
        for line in f:
            try:
                record = json.loads(line.strip())
                if record.get("event") == "EXPLORATION_START":
                    # New format: nested exploration_context
                    if "exploration_context" in record:
                        return record["exploration_context"]

                    # Old format: fields at top level
                    return {
                        "query": record.get("intention", ""),
                        "intention": record.get("intention", ""),
                        "intention_type": record.get("intention_type", "EXPLORE"),
                        "origin_moment": record.get("origin_moment", ""),
                        "actor_task": f"Exploration by {record.get('actor_id', 'unknown')}",
                    }
            except json.JSONDecodeError:
                continue
    return None


def extract_termination_info(log_path: Path) -> Optional[Dict[str, Any]]:
    """Extract termination info from END event.

    Supports both old format (fields at top level) and new format (termination nested).
    """
    if not log_path.exists():
        return None

    # Read last few lines for END event
    with open(log_path, 'r') as f:
        lines = f.readlines()

    for line in reversed(lines):
        try:
            record = json.loads(line.strip())
            if record.get("event") == "EXPLORATION_END":
                # New format: nested termination
                if "termination" in record:
                    return record["termination"]

                # Old format: fields at top level
                return {
                    "reason": "unknown",  # Old format didn't have this
                    "final_satisfaction": record.get("satisfaction", 0.0),
                    "final_criticality": 0.0,
                    "steps_taken": record.get("total_steps", 0),
                    "duration_ms": record.get("duration_ms", 0),
                }
        except json.JSONDecodeError:
            continue
    return None


def extract_events_summary(log_path: Path) -> Dict[str, Any]:
    """Extract summary of events (branches, merges, crystallizations)."""
    summary = {
        "branches": [],
        "merges": [],
        "crystallizations": [],
        "energy_injections": [],
    }

    if not log_path.exists():
        return summary

    with open(log_path, 'r') as f:
        for line in f:
            try:
                record = json.loads(line.strip())
                event = record.get("event")

                if event == "BRANCH":
                    summary["branches"].append(record.get("branching_event", {}))
                elif event == "MERGE":
                    summary["merges"].append(record.get("merge_event", {}))
                elif event == "CRYSTALLIZE":
                    summary["crystallizations"].append({
                        "narrative_id": record.get("new_narrative_id"),
                        "novelty_score": record.get("novelty_score"),
                    })
                elif event == "ENERGY_INJECTION":
                    summary["energy_injections"].append(record.get("energy_injection", {}))

            except json.JSONDecodeError:
                continue

    return summary


def find_evidence_lines(log_path: Path, condition: str) -> List[int]:
    """Find line numbers matching a condition for evidence linking."""
    # This is a simplified version - in practice would parse more carefully
    lines = []
    if not log_path.exists():
        return lines

    with open(log_path, 'r') as f:
        for i, line in enumerate(f, 1):
            if condition.lower() in line.lower():
                lines.append(i)

    return lines[:5]  # Return first 5 matches


# =============================================================================
# REPORT GENERATION
# =============================================================================

def generate_diagnostic_report(
    exploration_id: str,
    log_dir: Path = LOG_DIR,
) -> str:
    """
    Generate a diagnostic report for an exploration.

    Returns markdown content for LLM agent analysis.
    """
    log_path = log_dir / f"traversal_{exploration_id}.jsonl"

    # Get health report
    health_report = run_exploration_health_checks(exploration_id, log_dir)

    # Extract log data
    context = extract_exploration_context(log_path) or {}
    termination = extract_termination_info(log_path) or {}
    events = extract_events_summary(log_path)

    # Detect patterns
    patterns = detect_failure_patterns(health_report, {
        "context": context,
        "termination": termination,
        "events": events,
    })

    # Build report
    report = []

    # Header
    report.append(f"# Diagnostic Report: {exploration_id}")
    report.append("")
    report.append(f"**Generated:** {datetime.utcnow().isoformat()}Z")
    report.append(f"**Overall Status:** {health_report.overall_status.value.upper()}")
    report.append("")

    # Context section
    report.append("## Context")
    report.append("")
    report.append(f"- **Query:** {context.get('query', '(not recorded)')}")
    report.append(f"- **Intention:** {context.get('intention', '(not recorded)')}")
    report.append(f"- **Intention Type:** {context.get('intention_type', '(not recorded)')}")
    report.append(f"- **Origin Moment:** {context.get('origin_moment', '(not recorded)')}")
    report.append(f"- **Actor Task:** {context.get('actor_task', '(not recorded)')}")
    report.append("")

    # Termination section
    report.append("## Termination")
    report.append("")
    report.append(f"- **Reason:** {termination.get('reason', 'unknown')}")
    report.append(f"- **Final Satisfaction:** {termination.get('final_satisfaction', 0):.2f}")
    report.append(f"- **Final Criticality:** {termination.get('final_criticality', 0):.2f}")
    report.append(f"- **Steps Taken:** {termination.get('steps_taken', 0)}")
    report.append(f"- **Duration:** {termination.get('duration_ms', 0)}ms")
    if termination.get('error_message'):
        report.append(f"- **Error:** {termination.get('error_message')}")
    report.append("")

    # Metrics Summary
    report.append("## Metrics Summary")
    report.append("")
    report.append("| Indicator | Value | Status | Concern |")
    report.append("|-----------|-------|--------|---------|")

    for name, result in health_report.checks.items():
        status_emoji = {
            HealthStatus.OK: "✓",
            HealthStatus.WARN: "⚠",
            HealthStatus.ERROR: "✗",
            HealthStatus.UNKNOWN: "?",
        }.get(result.status, "?")

        # Extract key value from details
        value = "—"
        if result.details:
            for key in ["efficiency", "velocity", "mean_divergence", "mean_semantic", "rate", "novelty_score", "total"]:
                if key in result.details:
                    value = f"{result.details[key]}"
                    break

        concern = result.message if result.status != HealthStatus.OK else "—"
        report.append(f"| {name} | {value} | {status_emoji} {result.status.value} | {concern} |")

    report.append("")

    # Layer Analysis (pre-filled observations)
    report.append("## Layer Analysis")
    report.append("")
    report.append("### Layer 1: Output Quality")
    report.append("")
    narratives_found = health_report.summary.get("narratives_found", 0)
    report.append(f"- **Observation:** {narratives_found} narratives found")
    report.append(f"- **Satisfaction:** {health_report.summary.get('final_satisfaction', 0):.2f}")
    report.append("- **Question for agent:** Did relevant narratives exist in graph?")
    evidence_lines = find_evidence_lines(log_path, "found_narratives")
    if evidence_lines:
        report.append(f"- **Evidence:** log lines {evidence_lines}")
    report.append("")

    report.append("### Layer 2: SubEntity Behaviors")
    report.append("")
    report.append(f"- **Steps taken:** {health_report.summary.get('steps', 0)}")
    report.append(f"- **Max depth reached:** {health_report.summary.get('max_depth', 0)}")
    report.append(f"- **Branches:** {len(events['branches'])}")
    report.append(f"- **Merges:** {len(events['merges'])}")
    report.append(f"- **Termination:** {termination.get('reason', 'unknown')}")
    report.append("- **Question for agent:** Did state machine follow valid transitions?")
    report.append("")

    report.append("### Layer 3: Graph Physics")
    report.append("")
    semantic_check = health_report.checks.get("semantic_quality")
    if semantic_check and semantic_check.details:
        report.append(f"- **Mean semantic:** {semantic_check.details.get('mean_semantic', 0):.2f}")
    divergence_check = health_report.checks.get("sibling_divergence")
    if divergence_check and divergence_check.details:
        report.append(f"- **Mean divergence:** {divergence_check.details.get('mean_divergence', 0):.2f}")
    report.append(f"- **Energy injections:** {len(events['energy_injections'])}")
    report.append("- **Question for agent:** Were scores appropriate for intention?")
    report.append("")

    report.append("### Layer 4: Protocol Design")
    report.append("")
    report.append(f"- **Intention type used:** {context.get('intention_type', '(not recorded)')}")
    report.append(f"- **Query:** {context.get('query', '(not recorded)')}")
    report.append("- **Question for agent:** Was intention_type appropriate for this task?")
    report.append("")

    report.append("### Layer 5: Agent Skill")
    report.append("")
    report.append(f"- **Actor task:** {context.get('actor_task', '(not recorded)')}")
    report.append("- **Question for agent:** Should exploration have been used at all?")
    report.append("")

    # Detected Patterns
    report.append("## Detected Patterns")
    report.append("")
    if patterns:
        for p in patterns:
            report.append(f"### ⚠ {p.name}")
            report.append("")
            report.append(f"**Description:** {p.description}")
            report.append(f"**Likely Layer:** {p.likely_layer}")
            report.append("")
            report.append("**Common Causes:**")
            for cause in p.common_causes:
                report.append(f"- {cause}")
            report.append("")
            report.append(f"**Suggested Fix:** {p.suggested_fix}")
            report.append("")
    else:
        report.append("No recognized failure patterns detected.")
        report.append("")

    # Summary section for agent
    report.append("## Summary for Agent")
    report.append("")
    summary_counts = health_report.summary.get("status_counts", {})
    report.append(f"- **OK checks:** {summary_counts.get('ok', 0)}")
    report.append(f"- **Warning checks:** {summary_counts.get('warn', 0)}")
    report.append(f"- **Error checks:** {summary_counts.get('error', 0)}")
    report.append("")

    if health_report.overall_status == HealthStatus.ERROR:
        report.append("**Action Required:** This exploration has significant problems.")
        report.append("Use SKILL_Assess_SubEntity_Exploration_Quality_From_Logs to diagnose root cause.")
    elif health_report.overall_status == HealthStatus.WARN:
        report.append("**Review Recommended:** This exploration has some issues worth investigating.")
    else:
        report.append("**Status OK:** Exploration completed without major issues.")

    report.append("")

    # Links section
    report.append("## References")
    report.append("")
    report.append(f"- **Log file:** `{log_path}`")
    report.append("- **Skill:** `templates/mind/skills/SKILL_Assess_SubEntity_Exploration_Quality_From_Logs.md`")
    report.append("- **Health doc:** `docs/physics/subentity/HEALTH_SubEntity.md`")
    report.append("")

    return "\n".join(report)


def save_diagnostic_report(
    exploration_id: str,
    log_dir: Path = LOG_DIR,
    report_dir: Path = REPORT_DIR,
) -> Path:
    """Generate and save diagnostic report."""
    report_content = generate_diagnostic_report(exploration_id, log_dir)

    report_path = report_dir / f"diagnostic_{exploration_id}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    with open(report_path, 'w') as f:
        f.write(report_content)

    return report_path


# =============================================================================
# CLI
# =============================================================================

def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Generate diagnostic reports for SubEntity explorations",
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
        help="Generate reports for all recent explorations",
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
        "--output-dir",
        type=Path,
        default=REPORT_DIR,
        help="Directory for output reports",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print to stdout instead of saving file",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s: %(message)s",
    )

    if args.all:
        since = parse_duration(args.since)
        exploration_ids = find_recent_explorations(args.log_dir, since)

        if not exploration_ids:
            print(f"No explorations found in the last {args.since}")
            sys.exit(0)

        for exp_id in exploration_ids:
            if args.stdout:
                print(generate_diagnostic_report(exp_id, args.log_dir))
                print("\n" + "=" * 80 + "\n")
            else:
                path = save_diagnostic_report(exp_id, args.log_dir, args.output_dir)
                print(f"Generated: {path}")

    elif args.exploration_id:
        if args.stdout:
            print(generate_diagnostic_report(args.exploration_id, args.log_dir))
        else:
            path = save_diagnostic_report(
                args.exploration_id,
                args.log_dir,
                args.output_dir,
            )
            print(f"Generated: {path}")

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
