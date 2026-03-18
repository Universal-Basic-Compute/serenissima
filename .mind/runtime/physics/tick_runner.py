"""
Physics Tick Runner — CLI Entry Point

Run the v1.2 physics tick loop with configurable stop conditions.

Usage:
    python -m mind.physics.tick_runner until_next_moment
    python -m mind.physics.tick_runner until_completion_or_interruption
    python -m mind.physics.tick_runner until_next_moment --max-ticks 100
    python -m mind.physics.tick_runner until_completion_or_interruption --graph blood_ledger

Modes:
    until_next_moment
        Runs ticks until ANY moment completes (status → completed).
        Pure physics mode, not actor-centric.
        Use for: advancing world state until something happens.

    until_completion_or_interruption
        Runs ticks until a moment completes OR is interrupted/overridden.
        Stops on any terminal state change (completed, interrupted, overridden).
        Use for: observing narrative branch points.

Options:
    --graph NAME    Graph name (default: test)
    --max-ticks N   Maximum ticks before giving up (default: 100)
    --verbose       Show detailed tick output
    --json          Output as JSON

DOCS: docs/physics/tick-runner/PATTERNS_Tick_Runner.md
"""

import argparse
import json
import logging
import sys
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class TickRunResult:
    """Result of a tick run."""
    mode: str
    ticks_run: int
    stopped_reason: str
    completions: List[Dict[str, Any]]
    interruptions: List[Dict[str, Any]]
    final_stats: Dict[str, Any]
    graph_name: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def run_until_next_moment(
    graph_name: str = "test",
    max_ticks: int = 100,
    verbose: bool = False
) -> TickRunResult:
    """
    Run ticks until any moment completes.

    Pure physics mode — not actor-centric.
    Stops when any moment transitions to 'completed' status.

    Args:
        graph_name: Graph database name
        max_ticks: Maximum ticks before giving up
        verbose: Log detailed tick output

    Returns:
        TickRunResult with run details
    """
    from runtime.physics.tick_v1_2 import GraphTickV1_2

    tick_runner = GraphTickV1_2(graph_name=graph_name)

    ticks_run = 0
    completions = []
    stopped_reason = "max_ticks_reached"
    final_result = None

    for tick_num in range(max_ticks):
        result = tick_runner.run()
        ticks_run += 1
        final_result = result

        if verbose:
            logger.info(f"[tick {ticks_run}] generated={result.energy_generated:.2f} "
                       f"active={result.moments_active} completed={result.moments_completed}")

        # Check for completions
        if result.completions:
            completions.extend(result.completions)
            stopped_reason = "moment_completed"
            break

        # Early exit if no energy (nothing will happen)
        total_energy = (
            result.energy_generated +
            result.energy_drawn +
            result.energy_flowed +
            result.energy_backflowed
        )
        if total_energy == 0 and ticks_run > 5:
            stopped_reason = "no_energy_in_system"
            break

    final_stats = {}
    if final_result:
        final_stats = {
            "energy_generated": final_result.energy_generated,
            "energy_drawn": final_result.energy_drawn,
            "moments_active": final_result.moments_active,
            "moments_possible": final_result.moments_possible,
            "hot_links": final_result.hot_links,
        }

    return TickRunResult(
        mode="until_next_moment",
        ticks_run=ticks_run,
        stopped_reason=stopped_reason,
        completions=completions,
        interruptions=[],
        final_stats=final_stats,
        graph_name=graph_name,
    )


def run_until_completion_or_interruption(
    graph_name: str = "test",
    max_ticks: int = 100,
    verbose: bool = False
) -> TickRunResult:
    """
    Run ticks until a moment completes OR is interrupted/overridden.

    Stops on any terminal state change:
    - completed: moment finished naturally
    - interrupted: moment was cut short
    - overridden: moment was replaced by another

    Args:
        graph_name: Graph database name
        max_ticks: Maximum ticks before giving up
        verbose: Log detailed tick output

    Returns:
        TickRunResult with run details
    """
    from runtime.physics.tick_v1_2 import GraphTickV1_2

    tick_runner = GraphTickV1_2(graph_name=graph_name)

    ticks_run = 0
    completions = []
    interruptions = []
    stopped_reason = "max_ticks_reached"
    final_result = None

    for tick_num in range(max_ticks):
        result = tick_runner.run()
        ticks_run += 1
        final_result = result

        if verbose:
            logger.info(f"[tick {ticks_run}] generated={result.energy_generated:.2f} "
                       f"active={result.moments_active} completed={result.moments_completed} "
                       f"interrupted={getattr(result, 'moments_interrupted', 0)}")

        # Check for completions
        if result.completions:
            completions.extend(result.completions)
            stopped_reason = "moment_completed"
            break

        # Check for interruptions (if available in result)
        if hasattr(result, 'interruptions') and result.interruptions:
            interruptions.extend(result.interruptions)
            stopped_reason = "moment_interrupted"
            break

        # Check for overrides (if available in result)
        if hasattr(result, 'overrides') and result.overrides:
            interruptions.extend(result.overrides)
            stopped_reason = "moment_overridden"
            break

        # Check rejections as a form of interruption
        if result.rejections:
            interruptions.extend(result.rejections)
            stopped_reason = "moment_rejected"
            break

        # Early exit if no energy
        total_energy = (
            result.energy_generated +
            result.energy_drawn +
            result.energy_flowed +
            result.energy_backflowed
        )
        if total_energy == 0 and ticks_run > 5:
            stopped_reason = "no_energy_in_system"
            break

    final_stats = {}
    if final_result:
        final_stats = {
            "energy_generated": final_result.energy_generated,
            "energy_drawn": final_result.energy_drawn,
            "moments_active": final_result.moments_active,
            "moments_possible": final_result.moments_possible,
            "hot_links": final_result.hot_links,
        }

    return TickRunResult(
        mode="until_completion_or_interruption",
        ticks_run=ticks_run,
        stopped_reason=stopped_reason,
        completions=completions,
        interruptions=interruptions,
        final_stats=final_stats,
        graph_name=graph_name,
    )


def print_result(result: TickRunResult, verbose: bool = False):
    """Print tick run result to console."""
    status_color = {
        "moment_completed": "\033[92m",      # green
        "moment_interrupted": "\033[93m",    # yellow
        "moment_overridden": "\033[93m",     # yellow
        "moment_rejected": "\033[93m",       # yellow
        "max_ticks_reached": "\033[91m",     # red
        "no_energy_in_system": "\033[90m",   # gray
    }
    reset = "\033[0m"

    color = status_color.get(result.stopped_reason, "")
    print(f"\n{color}Tick Runner: {result.mode}{reset}")
    print(f"  Graph: {result.graph_name}")
    print(f"  Ticks: {result.ticks_run}")
    print(f"  Stopped: {result.stopped_reason}")

    if result.completions:
        print(f"\n  Completions ({len(result.completions)}):")
        for c in result.completions[:5]:
            moment_id = c.get("moment_id", "?")
            print(f"    - {moment_id}")

    if result.interruptions:
        print(f"\n  Interruptions ({len(result.interruptions)}):")
        for i in result.interruptions[:5]:
            moment_id = i.get("moment_id", "?")
            reason = i.get("reason", "?")
            print(f"    - {moment_id}: {reason}")

    if verbose and result.final_stats:
        print(f"\n  Final stats:")
        for key, value in result.final_stats.items():
            print(f"    {key}: {value}")

    print()


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Physics Tick Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        "mode",
        choices=["until_next_moment", "until_completion_or_interruption"],
        help="Stop condition mode"
    )
    parser.add_argument("--graph", default="test", help="Graph name (default: test)")
    parser.add_argument("--max-ticks", type=int, default=100, help="Max ticks (default: 100)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s: %(message)s"
    )

    # Run selected mode
    if args.mode == "until_next_moment":
        result = run_until_next_moment(
            graph_name=args.graph,
            max_ticks=args.max_ticks,
            verbose=args.verbose
        )
    else:
        result = run_until_completion_or_interruption(
            graph_name=args.graph,
            max_ticks=args.max_ticks,
            verbose=args.verbose
        )

    # Output
    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
    else:
        print_result(result, args.verbose)

    # Exit code based on result
    if result.stopped_reason == "max_ticks_reached":
        sys.exit(1)
    elif result.stopped_reason == "no_energy_in_system":
        sys.exit(2)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
