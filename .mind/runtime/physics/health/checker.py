"""
Physics Health Checker — CLI Entry Point

Run health checks for energy physics system.

Usage:
    python -m mind.physics.health.checker all
    python -m mind.physics.health.checker energy_balance
    python -m mind.physics.health.checker no_negative
    python -m mind.physics.health.checker link_ratio
    python -m mind.physics.health.checker tick_order
    python -m mind.physics.health.checker moment_states

Options:
    --verbose       Show detailed output
    --json          Output as JSON
    --graph NAME    Graph name (default: blood_ledger)
    --host HOST     Redis host (default: localhost)
    --port PORT     Redis port (default: 6379)

DOCS: docs/physics/HEALTH_Energy_Physics.md
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

from .base import HealthStatus, HealthResult, BaseChecker
from .checkers import (
    EnergyConservationChecker,
    NoNegativeEnergyChecker,
    LinkStateChecker,
    TickIntegrityChecker,
    MomentLifecycleChecker,
)

logger = logging.getLogger(__name__)


# Re-export for convenience
__all__ = ["HealthStatus", "HealthResult", "run_all_checks", "run_check"]


# Registry of available checkers
CHECKERS = {
    "energy_balance": EnergyConservationChecker,
    "energy_conservation": EnergyConservationChecker,  # alias
    "no_negative": NoNegativeEnergyChecker,
    "link_ratio": LinkStateChecker,
    "link_state": LinkStateChecker,  # alias
    "tick_order": TickIntegrityChecker,
    "tick_integrity": TickIntegrityChecker,  # alias
    "moment_states": MomentLifecycleChecker,
    "moment_lifecycle": MomentLifecycleChecker,  # alias
}


@dataclass
class AggregateResult:
    """Aggregate result of multiple health checks."""
    status: HealthStatus
    checks: List[HealthResult]
    timestamp: datetime
    summary: Dict[str, int]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "checks": [c.to_dict() for c in self.checks],
            "timestamp": self.timestamp.isoformat(),
            "summary": self.summary,
        }


def get_graph_connection(graph_name: str, host: str, port: int):
    """Get graph query interface."""
    try:
        from runtime.physics.graph import GraphQueries
        return GraphQueries(graph_name=graph_name, host=host, port=port)
    except ImportError:
        logger.warning("Could not import GraphQueries - running in standalone mode")
        return None
    except Exception as e:
        logger.warning(f"Could not connect to graph: {e}")
        return None


def run_check(
    checker_name: str,
    graph_name: str = "test",
    host: str = "localhost",
    port: int = 6379
) -> HealthResult:
    """
    Run a single health check.

    Args:
        checker_name: Name of the checker to run
        graph_name: Graph database name
        host: Redis host
        port: Redis port

    Returns:
        HealthResult with check outcome
    """
    if checker_name not in CHECKERS:
        return HealthResult(
            checker_name=checker_name,
            status=HealthStatus.UNKNOWN,
            message=f"Unknown checker: {checker_name}. Available: {list(CHECKERS.keys())}",
        )

    graph = get_graph_connection(graph_name, host, port)
    checker_class = CHECKERS[checker_name]
    checker = checker_class(graph_queries=graph)

    try:
        return checker.check()
    except Exception as e:
        logger.exception(f"Checker {checker_name} failed")
        return HealthResult(
            checker_name=checker_name,
            status=HealthStatus.UNKNOWN,
            message=f"Checker crashed: {e}",
        )


def run_all_checks(
    graph_name: str = "test",
    host: str = "localhost",
    port: int = 6379
) -> AggregateResult:
    """
    Run all health checks.

    Returns:
        AggregateResult with all check outcomes
    """
    graph = get_graph_connection(graph_name, host, port)

    # Unique checker classes (avoid running aliases)
    unique_checkers = {
        "energy_conservation": EnergyConservationChecker,
        "no_negative": NoNegativeEnergyChecker,
        "link_state": LinkStateChecker,
        "tick_integrity": TickIntegrityChecker,
        "moment_lifecycle": MomentLifecycleChecker,
    }

    results = []
    for name, checker_class in unique_checkers.items():
        checker = checker_class(graph_queries=graph)
        try:
            result = checker.check()
        except Exception as e:
            logger.exception(f"Checker {name} failed")
            result = HealthResult(
                checker_name=name,
                status=HealthStatus.UNKNOWN,
                message=f"Checker crashed: {e}",
            )
        results.append(result)

    # Calculate aggregate status
    statuses = [r.status for r in results]
    if HealthStatus.ERROR in statuses:
        aggregate_status = HealthStatus.ERROR
    elif HealthStatus.WARN in statuses:
        aggregate_status = HealthStatus.WARN
    elif HealthStatus.UNKNOWN in statuses:
        aggregate_status = HealthStatus.UNKNOWN
    else:
        aggregate_status = HealthStatus.OK

    # Summary counts
    summary = {
        "ok": sum(1 for s in statuses if s == HealthStatus.OK),
        "warn": sum(1 for s in statuses if s == HealthStatus.WARN),
        "error": sum(1 for s in statuses if s == HealthStatus.ERROR),
        "unknown": sum(1 for s in statuses if s == HealthStatus.UNKNOWN),
        "total": len(results),
    }

    return AggregateResult(
        status=aggregate_status,
        checks=results,
        timestamp=datetime.utcnow(),
        summary=summary,
    )


def print_result(result: HealthResult, verbose: bool = False):
    """Print a health result to console."""
    # Status emoji
    status_emoji = {
        HealthStatus.OK: "\033[92m✓\033[0m",      # green
        HealthStatus.WARN: "\033[93m⚠\033[0m",    # yellow
        HealthStatus.ERROR: "\033[91m✗\033[0m",   # red
        HealthStatus.UNKNOWN: "\033[90m?\033[0m", # gray
    }

    emoji = status_emoji.get(result.status, "?")
    print(f"  {emoji} [{result.checker_name}] {result.message}")

    if verbose and result.details:
        for key, value in result.details.items():
            print(f"      {key}: {value}")


def print_aggregate(result: AggregateResult, verbose: bool = False):
    """Print aggregate result to console."""
    status_color = {
        HealthStatus.OK: "\033[92m",
        HealthStatus.WARN: "\033[93m",
        HealthStatus.ERROR: "\033[91m",
        HealthStatus.UNKNOWN: "\033[90m",
    }
    reset = "\033[0m"

    color = status_color.get(result.status, "")
    print(f"\n{color}Physics Health: {result.status.value.upper()}{reset}")
    print(f"  {result.summary['ok']} ok, {result.summary['warn']} warn, "
          f"{result.summary['error']} error, {result.summary['unknown']} unknown")
    print()

    for check in result.checks:
        print_result(check, verbose)

    print()


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Physics Health Checker",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        "check",
        nargs="?",
        default="all",
        help="Check to run (default: all)"
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--test", "-t", action="store_true", help="Use test database")
    parser.add_argument("--graph", default=None, help="Graph name (default: test or blood_ledger)")
    parser.add_argument("--host", default="localhost", help="Redis host")
    parser.add_argument("--port", type=int, default=6379, help="Redis port")

    args = parser.parse_args()

    # Determine graph name
    if args.graph:
        graph_name = args.graph
    elif args.test:
        graph_name = "test"
    else:
        graph_name = "test"  # Default to test for safety

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s: %(message)s"
    )

    if args.verbose:
        print(f"Using graph: {graph_name}")

    # Run checks
    if args.check == "all":
        result = run_all_checks(graph_name, args.host, args.port)

        if args.json:
            print(json.dumps(result.to_dict(), indent=2))
        else:
            print_aggregate(result, args.verbose)

        # Exit code based on status
        if result.status == HealthStatus.ERROR:
            sys.exit(2)
        elif result.status == HealthStatus.WARN:
            sys.exit(1)
        else:
            sys.exit(0)

    else:
        result = run_check(args.check, graph_name, args.host, args.port)

        if args.json:
            print(json.dumps(result.to_dict(), indent=2))
        else:
            print()
            print_result(result, args.verbose)
            print()

        # Exit code based on status
        if result.status == HealthStatus.ERROR:
            sys.exit(2)
        elif result.status == HealthStatus.WARN:
            sys.exit(1)
        else:
            sys.exit(0)


if __name__ == "__main__":
    main()
