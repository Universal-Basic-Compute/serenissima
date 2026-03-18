"""
mind CLI - Memory for AI agents

DOCS: docs/mind_cli_core/OBJECTIVES_mind_cli_core.md

Protocol for context, state, and handoffs across sessions.

What `mind init` does:
1. Copies the protocol files to .mind/ in your project
2. Appends the protocol bootstrap to .mind/CLAUDE.md (creates it if missing)

What `mind validate` does:
1. Checks protocol invariants (from VALIDATION_Protocol_Invariants.md)
2. Reports gaps and issues
3. Helps maintain protocol health

WHY A CLI INSTEAD OF "JUST COPY THE FOLDER":
- Versioning: `pip install --upgrade mind` gets you updates
- Discoverability: easier to remember than a git URL
- Future: can add `validate`, `new-module`, etc. without changing workflow

TEMPLATES LOCATION:
- When installed: mind/templates/ (bundled with package)
- When developing: templates/ at repo root
- CLI checks both locations
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

# Import from submodules
from .agent_cli import AGENT_CHOICES, DEFAULT_AGENT
from .init_cmd import init_protocol
from .validate import validate_protocol
from .prompt import print_bootstrap_prompt
from .context import print_module_context
from .project_map import print_project_map
from .sync import sync_command
from .solve_escalations import solve_special_markers_command
from .refactor import refactor_command
from .status_cmd import status_command
from .repo_overview import generate_and_save as generate_overview
from .docs_fix import docs_fix_command
from .symbol_extractor import extract_symbols_command
from .procedure_runner import run_protocol_command
from .graph_query import query_command as graph_query_command
from .procedure_validator import validate_cluster_command
from .cluster_metrics import ClusterMetrics, ClusterValidator
from .explore_cmd import explore_command


from .agent_cli import build_agent_command

# Import new CLI commands
try:
    from cli.commands.agents import agents_command
    from cli.commands.tasks import tasks_command
    from cli.commands.events import events_command, errors_command
    from cli.commands.swarm import run as swarm_run
    HAS_NEW_COMMANDS = True
except ImportError:
    HAS_NEW_COMMANDS = False


def _add_module_translation_args(parser):
    parser.add_argument("--module-old", type=str, help="Existing module key in modules.yaml")
    parser.add_argument("--module-new", type=str, help="New module key name in modules.yaml")


def _validate_module_translation(args):
    if args.module_old or args.module_new:
        if not (args.module_old and args.module_new):
            raise ValueError("--module-old and --module-new must be supplied together")


def _add_refactor_conflict_args(parser):
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip moves when the target path already exists",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing targets when moving files/directories (default)",
    )
    parser.add_argument(
        "--no-overwrite",
        action="store_true",
        help="Do not overwrite existing targets",
    )


def _validate_refactor_conflicts(args):
    if args.skip_existing and args.overwrite:
        raise ValueError("--skip-existing and --overwrite cannot be used together")
    if args.no_overwrite:
        args.overwrite = False
        if args.skip_existing and args.overwrite:
            raise ValueError("--skip-existing and --overwrite cannot be used together")



def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        prog="mind",
        description="mind - Memory for AI agents. Protocol for context, state, and handoffs."
    )
    parser.add_argument(
        "--model",
        choices=AGENT_CHOICES,
        default="all",
        help="Agent model for work (default: all, randomly picks a provider per task)",
    )
    parser.add_argument(
        "--agents",
        choices=AGENT_CHOICES,
        dest="model",
        help=argparse.SUPPRESS,
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # init command
    init_parser = subparsers.add_parser(
        "init",
        help="Initialize mind in the current directory"
    )
    init_parser.add_argument(
        "--no-force",
        action="store_true",
        dest="no_force",
        help="Don't overwrite existing .mind/ directory (default: overwrite)"
    )
    init_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Directory to initialize (default: current directory)"
    )
    init_parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear existing graph data before injecting seeds"
    )

    # ... (the rest of the original subparsers)


    # validate command
    validate_parser = subparsers.add_parser(
        "validate",
        help="Check protocol invariants and find gaps"
    )
    validate_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Directory to validate (default: current directory)"
    )
    validate_parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show details for all checks, not just failures"
    )

    # prompt command
    prompt_parser = subparsers.add_parser(
        "prompt",
        help="Generate bootstrap prompt for LLM"
    )
    prompt_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )

    # context command
    context_parser = subparsers.add_parser(
        "context",
        help="Get full documentation context for a file"
    )
    context_parser.add_argument(
        "file",
        type=Path,
        help="File path to get context for"
    )
    context_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )

    # solve-markers command
    markers_parser = subparsers.add_parser(
        "solve-markers",
        help="List @mind special markers (escalations, propositions) for human review"
    )
    markers_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )

    # map command
    map_parser = subparsers.add_parser(
        "map",
        help="Show visual project map of modules and dependencies"
    )
    map_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    map_parser.add_argument(
        "--output", "-o",
        type=Path,
        default=None,
        help="Output HTML file path (default: open in browser)"
    )

    # overview command
    overview_parser = subparsers.add_parser(
        "overview",
        help="Generate repository overview with file tree, sections, functions, and dependencies"
    )
    overview_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    overview_parser.add_argument(
        "--folder", "-p",
        type=str,
        default=None,
        help="Subfolder to map only (relative to project root)"
    )
    overview_parser.add_argument(
        "--format", "-f",
        choices=["md", "yaml", "json"],
        default="md",
        help="Output format (default: md)"
    )
    overview_parser.add_argument(
        "--min-size",
        type=int,
        default=500,
        help="Minimum file size in chars to include (default: 500, 0 = no limit)"
    )
    overview_parser.add_argument(
        "--top",
        type=int,
        default=10,
        help="Max files per directory, largest first (default: 10, 0 = no limit)"
    )
    overview_parser.add_argument(
        "--all",
        action="store_true",
        help="Include all files (equivalent to --min-size 0 --top 0)"
    )

    # sync command
    sync_parser = subparsers.add_parser(
        "sync",
        help="Show SYNC file status (auto-archives large files)"
    )
    sync_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )

    # status command
    status_parser = subparsers.add_parser(
        "status",
        help="Show module implementation progress and health"
    )
    status_parser.add_argument(
        "module",
        nargs="?",
        type=str,
        default=None,
        help="Module name to show detailed status (optional, shows all if omitted)"
    )
    status_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    status_parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed information including doc chain files"
    )

    # refactor command
    refactor_parser = subparsers.add_parser(
        "refactor",
        help="Adjust module/doc names and keep references in sync"
    )
    refactor_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    refactor_subparsers = refactor_parser.add_subparsers(dest="action")

    rename_parser = refactor_subparsers.add_parser(
        "rename",
        help="Rename a doc/module path and update references"
    )
    rename_parser.add_argument("old", type=str, help="Existing path to rename (relative to project root)")
    rename_parser.add_argument("new", type=str, help="New target path (relative to project root)")
    _add_module_translation_args(rename_parser)
    _add_refactor_conflict_args(rename_parser)
    rename_parser.set_defaults(overwrite=True)
    rename_parser.set_defaults(action="rename")

    move_parser = refactor_subparsers.add_parser(
        "move",
        help="Move a doc/module path elsewhere (alias for rename)"
    )
    move_parser.add_argument("old", type=str, help="Existing path to move (relative to project root)")
    move_parser.add_argument("new", type=str, help="Destination path (relative to project root)")
    _add_module_translation_args(move_parser)
    _add_refactor_conflict_args(move_parser)
    move_parser.set_defaults(overwrite=True)
    move_parser.set_defaults(action="move")

    promote_parser = refactor_subparsers.add_parser(
        "promote",
        help="Promote a docs area/module into the root docs folder"
    )
    promote_parser.add_argument("source", type=str, help="Existing docs path (docs/<area>/<module>)")
    promote_parser.add_argument(
        "--target", "-t",
        type=str,
        default=None,
        help="Optional explicit target path (defaults to docs/<module>)"
    )
    _add_module_translation_args(promote_parser)
    _add_refactor_conflict_args(promote_parser)
    promote_parser.set_defaults(overwrite=True)
    promote_parser.set_defaults(action="promote")

    demote_parser = refactor_subparsers.add_parser(
        "demote",
        help="Demote a docs module into an area (docs/<area>/<module>)"
    )
    demote_parser.add_argument("module", type=str, help="Existing module path (usually docs/<module>)")
    demote_parser.add_argument(
        "--target-area", "-a",
        type=str,
        required=True,
        help="Area name under docs/ to move into"
    )
    _add_module_translation_args(demote_parser)
    _add_refactor_conflict_args(demote_parser)
    demote_parser.set_defaults(overwrite=True)
    demote_parser.set_defaults(action="demote")

    batch_parser = refactor_subparsers.add_parser(
        "batch",
        help="Apply a filelist of refactor actions"
    )
    batch_parser.add_argument(
        "--filelist", "-f",
        type=str,
        required=True,
        help="Path to a file containing refactor actions"
    )
    _add_module_translation_args(batch_parser)
    _add_refactor_conflict_args(batch_parser)
    batch_parser.set_defaults(overwrite=True)
    batch_parser.set_defaults(action="batch")

    # docs-fix command
    docs_fix_parser = subparsers.add_parser(
        "docs-fix",
        help="Work doc chains and create minimal missing docs"
    )
    docs_fix_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    docs_fix_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without writing files"
    )

    # symbols command
    symbols_parser = subparsers.add_parser(
        "symbols",
        help="Extract code symbols (functions, classes, methods) to graph"
    )
    symbols_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    symbols_parser.add_argument(
        "--folder", "-f",
        type=str,
        default=None,
        help="Specific folder to scan (e.g., engine/physics)"
    )
    symbols_parser.add_argument(
        "--graph", "-g",
        type=str,
        default=None,
        help="Graph name (defaults to project directory name)"
    )
    symbols_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract without upserting to graph"
    )
    symbols_parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed extraction info"
    )

    # protocol command
    protocol_parser = subparsers.add_parser(
        "protocol",
        help="Execute or list protocols for dense graph creation"
    )
    protocol_subparsers = protocol_parser.add_subparsers(dest="protocol_action")

    protocol_run_parser = protocol_subparsers.add_parser(
        "run",
        help="Run a protocol to create nodes and links"
    )
    protocol_run_parser.add_argument(
        "name",
        type=str,
        help="Protocol name (e.g., add_health_coverage)"
    )
    protocol_run_parser.add_argument(
        "--graph", "-g",
        type=str,
        default=None,
        help="Graph name to connect to"
    )
    protocol_run_parser.add_argument(
        "--actor", "-a",
        type=str,
        default="actor_SYSTEM_cli",
        help="Actor ID running this protocol"
    )
    protocol_run_parser.add_argument(
        "--context", "-c",
        type=str,
        action="append",
        default=[],
        help="Initial context values (key=value, can be repeated)"
    )
    protocol_run_parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed execution info"
    )

    protocol_list_parser = protocol_subparsers.add_parser(
        "list",
        help="List available protocols"
    )
    protocol_list_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )

    protocol_validate_parser = protocol_subparsers.add_parser(
        "validate",
        help="Validate a cluster created by protocol"
    )
    protocol_validate_parser.add_argument(
        "cluster_type",
        type=str,
        help="Cluster type (e.g., health_coverage, validation, behavior)"
    )
    protocol_validate_parser.add_argument(
        "root_node",
        type=str,
        help="Root node ID of the cluster"
    )
    protocol_validate_parser.add_argument(
        "--graph", "-g",
        type=str,
        default=None,
        help="Graph name to connect to"
    )

    # query command
    query_parser = subparsers.add_parser(
        "query",
        help="Query the knowledge graph"
    )
    query_parser.add_argument(
        "query_type",
        choices=["find", "context", "uncovered", "orphans", "stubs"],
        help="Query type"
    )
    query_parser.add_argument(
        "--type", "-t",
        type=str,
        default=None,
        help="Node type (e.g., narrative.health, thing.dock)"
    )
    query_parser.add_argument(
        "--node", "-n",
        type=str,
        default=None,
        help="Node ID for context query"
    )
    query_parser.add_argument(
        "--space", "-s",
        type=str,
        default=None,
        help="Space ID to limit search"
    )
    query_parser.add_argument(
        "--by",
        type=str,
        default=None,
        help="For uncovered: type that should link (e.g., narrative.health)"
    )
    query_parser.add_argument(
        "--via",
        type=str,
        default=None,
        help="For uncovered: relationship direction (e.g., verifies)"
    )
    query_parser.add_argument(
        "--depth",
        type=int,
        default=2,
        help="Context depth (default: 2)"
    )
    query_parser.add_argument(
        "--graph", "-g",
        type=str,
        default=None,
        help="Graph name to connect to"
    )

    # explore command
    explore_parser = subparsers.add_parser(
        "explore",
        help="Run SubEntity exploration on the graph"
    )
    explore_parser.add_argument(
        "query",
        type=str,
        help="What to search for (the query text)"
    )
    explore_parser.add_argument(
        "--actor", "-a",
        type=str,
        required=True,
        help="Actor ID doing the exploration"
    )
    explore_parser.add_argument(
        "--intention", "-i",
        type=str,
        default=None,
        help="Why searching (defaults to query text)"
    )
    explore_parser.add_argument(
        "--intention-type", "-t",
        choices=["summarize", "verify", "find_next", "explore", "retrieve"],
        default="explore",
        help="Intention type affecting traversal (default: explore)"
    )
    explore_parser.add_argument(
        "--origin-moment", "-o",
        type=str,
        default=None,
        help="Moment that triggered this exploration"
    )
    explore_parser.add_argument(
        "--graph", "-g",
        type=str,
        default=None,
        help="Graph name to connect to"
    )
    explore_parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Exploration timeout in seconds (default: 30)"
    )
    explore_parser.add_argument(
        "--max-depth",
        type=int,
        default=10,
        help="Maximum traversal depth (default: 10)"
    )
    explore_parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable detailed traversal logging (writes JSONL + TXT logs)"
    )
    explore_parser.add_argument(
        "--format", "-f",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)"
    )

    # agents command
    agents_parser = subparsers.add_parser(
        "agents",
        help="Agent lifecycle management (list, pause, stop, kill, enable)"
    )
    agents_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    agents_subparsers = agents_parser.add_subparsers(dest="agents_action")

    agents_list_parser = agents_subparsers.add_parser(
        "list",
        help="List all agents and their status"
    )
    agents_list_parser.add_argument(
        "--format", "-f",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)"
    )

    agents_pause_parser = agents_subparsers.add_parser(
        "pause",
        help="Pause an agent (keeps state)"
    )
    agents_pause_parser.add_argument("actor_id", type=str, help="Agent ID to pause")

    agents_stop_parser = agents_subparsers.add_parser(
        "stop",
        help="Stop an agent gracefully"
    )
    agents_stop_parser.add_argument("actor_id", type=str, help="Agent ID to stop")

    agents_kill_parser = agents_subparsers.add_parser(
        "kill",
        help="Force kill an agent"
    )
    agents_kill_parser.add_argument("actor_id", type=str, help="Agent ID to kill")

    agents_enable_parser = agents_subparsers.add_parser(
        "enable",
        help="Enable a paused agent"
    )
    agents_enable_parser.add_argument("actor_id", type=str, help="Agent ID to enable")

    # tasks command
    tasks_parser = subparsers.add_parser(
        "tasks",
        help="List and filter tasks (pending, running, stuck, failed)"
    )
    tasks_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    tasks_parser.add_argument(
        "--module", "-m",
        type=str,
        default=None,
        help="Filter by module name"
    )
    tasks_parser.add_argument(
        "--capability", "-c",
        type=str,
        default=None,
        help="Filter by capability name"
    )
    tasks_parser.add_argument(
        "--status", "-s",
        choices=["pending", "running", "stuck", "failed"],
        default=None,
        help="Filter by status"
    )
    tasks_parser.add_argument(
        "--format", "-f",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)"
    )
    tasks_parser.add_argument(
        "--limit", "-l",
        type=int,
        default=50,
        help="Maximum tasks to show (default: 50)"
    )

    # events command
    events_parser = subparsers.add_parser(
        "events",
        help="Show event timeline from all sources"
    )
    events_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    events_parser.add_argument(
        "--last",
        type=str,
        default="1h",
        help="Time window (e.g., '30m', '2h', '1d', default: 1h)"
    )
    events_parser.add_argument(
        "--type", "-t",
        choices=["error", "trigger", "task", "agent", "health", "file"],
        default=None,
        help="Filter by event type"
    )
    events_parser.add_argument(
        "--format", "-f",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)"
    )
    events_parser.add_argument(
        "--limit", "-l",
        type=int,
        default=50,
        help="Maximum events to show (default: 50)"
    )

    # errors command (shortcut for error events)
    errors_parser = subparsers.add_parser(
        "errors",
        help="Show error moments (shortcut for 'events --type error')"
    )
    errors_parser.add_argument(
        "--dir", "-d",
        type=Path,
        default=Path.cwd(),
        help="Project directory (default: current directory)"
    )
    errors_parser.add_argument(
        "--unresolved",
        action="store_true",
        help="Only show unresolved errors"
    )
    errors_parser.add_argument(
        "--type", "-t",
        type=str,
        default=None,
        help="Filter by error type substring"
    )
    errors_parser.add_argument(
        "--last",
        type=str,
        default="24h",
        help="Time window (default: 24h)"
    )
    errors_parser.add_argument(
        "--format", "-f",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)"
    )

    # swarm command
    swarm_parser = subparsers.add_parser(
        "swarm",
        help="Run multiple agents in parallel with live streaming"
    )
    swarm_parser.add_argument(
        "--agents", "-n",
        type=int,
        default=0,
        help="Number of agents to spawn"
    )
    swarm_parser.add_argument(
        "--status",
        action="store_true",
        help="Show swarm status"
    )
    swarm_parser.add_argument(
        "--stop",
        action="store_true",
        help="Stop all agents"
    )
    swarm_parser.add_argument(
        "--stream",
        action="store_true",
        help="Stream moments live"
    )
    swarm_parser.add_argument(
        "--logs",
        action="store_true",
        help="Tail log files"
    )
    swarm_parser.add_argument(
        "--log-file",
        type=str,
        default=None,
        help="Custom log file path"
    )

    # cluster command
    cluster_parser = subparsers.add_parser(
        "cluster",
        help="Validate and score node clusters"
    )
    cluster_subparsers = cluster_parser.add_subparsers(dest="cluster_action")

    cluster_validate_parser = cluster_subparsers.add_parser(
        "validate",
        help="Run comprehensive validation on a cluster"
    )
    cluster_validate_parser.add_argument(
        "root_node",
        type=str,
        help="Root node ID of the cluster"
    )
    cluster_validate_parser.add_argument(
        "--type", "-t",
        type=str,
        default=None,
        help="Primary node type (e.g., narrative.health)"
    )
    cluster_validate_parser.add_argument(
        "--graph", "-g",
        type=str,
        default=None,
        help="Graph name to connect to"
    )

    # version
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 0.1.0"
    )

    args = parser.parse_args()

    if args.command == "init":
        success = init_protocol(args.dir, not args.no_force, clear_graph=args.clear)
        sys.exit(0 if success else 1)
    elif args.command == "validate":
        success = validate_protocol(args.dir, args.verbose)
        sys.exit(0 if success else 1)
    elif args.command == "prompt":
        print_bootstrap_prompt(args.dir)
        sys.exit(0)
    elif args.command == "context":
        success = print_module_context(args.dir, args.file)
        sys.exit(0 if success else 1)
    elif args.command == "solve-markers":
        exit_code = solve_special_markers_command(args.dir)
        sys.exit(exit_code)
    elif args.command == "map":
        print_project_map(args.dir, args.output)
        sys.exit(0)
    elif args.command == "overview":
        # Handle --all flag
        min_size = 0 if args.all else args.min_size
        top_files = 0 if args.all else args.top
        output_path = generate_overview(
            args.dir, args.format,
            subfolder=args.folder,
            min_size=min_size,
            top_files=top_files,
        )
        print(f"Generated: {output_path}")
        sys.exit(0)
    elif args.command == "sync":
        exit_code = sync_command(args.dir)
        sys.exit(exit_code)
    elif args.command == "status":
        exit_code = status_command(args.dir, args.module, args.verbose)
        sys.exit(exit_code)
    elif args.command == "refactor":
        if not args.action:
            refactor_parser.print_help()
            sys.exit(1)
        try:
            _validate_module_translation(args)
            _validate_refactor_conflicts(args)
        except ValueError as exc:
            print(exc)
            sys.exit(1)
        exit_code = refactor_command(args)
        sys.exit(exit_code)
    elif args.command == "docs-fix":
        exit_code = docs_fix_command(args.dir, args.dry_run)
        sys.exit(exit_code)
    elif args.command == "symbols":
        import os
        import logging
        if args.verbose:
            logging.basicConfig(level=logging.DEBUG)
        else:
            logging.basicConfig(level=logging.INFO)

        # Change to project directory for extraction
        original_cwd = os.getcwd()
        os.chdir(args.dir)

        try:
            result = extract_symbols_command(
                directory=args.folder,
                graph_name=args.graph,
                dry_run=args.dry_run
            )

            print(f"\nSymbol Extraction Complete:")
            print(f"  Files scanned: {result.files}")
            print(f"  Symbols extracted: {result.symbols}")
            print(f"  Links created: {result.links}")

            if result.errors:
                print(f"\nErrors ({len(result.errors)}):")
                for error in result.errors[:10]:
                    print(f"  - {error}")
                if len(result.errors) > 10:
                    print(f"  ... and {len(result.errors) - 10} more")

            if args.dry_run:
                print("\n(dry-run mode - no changes made to graph)")

            sys.exit(0 if not result.errors else 1)
        finally:
            os.chdir(original_cwd)
    elif args.command == "protocol":
        import logging
        import yaml

        if not args.protocol_action:
            protocol_parser.print_help()
            sys.exit(1)

        if args.protocol_action == "run":
            if hasattr(args, 'verbose') and args.verbose:
                logging.basicConfig(level=logging.DEBUG)
            else:
                logging.basicConfig(level=logging.INFO)

            # Parse initial context from key=value pairs
            initial_context = {}
            for ctx in args.context:
                if '=' in ctx:
                    key, value = ctx.split('=', 1)
                    initial_context[key] = value

            try:
                result = run_protocol_command(
                    args.name,
                    actor_id=args.actor,
                    graph_name=args.graph,
                    answers=None  # Interactive mode
                )

                print(f"\nProtocol: {args.name}")
                print(f"Result: {'SUCCESS' if result.success else 'FAILED'}")
                print(f"Nodes created: {len(result.nodes_created)}")
                print(f"Links created: {result.links_created}")

                if result.nodes_created:
                    print("\nCreated nodes:")
                    for node_id in result.nodes_created[:10]:
                        print(f"  - {node_id}")
                    if len(result.nodes_created) > 10:
                        print(f"  ... and {len(result.nodes_created) - 10} more")

                if result.errors:
                    print(f"\nErrors:")
                    for err in result.errors:
                        print(f"  - {err}")

                sys.exit(0 if result.success else 1)

            except FileNotFoundError as e:
                print(f"Error: {e}")
                sys.exit(1)

        elif args.protocol_action == "list":
            protocols_dir = args.dir / "protocols"
            if not protocols_dir.exists():
                print("No procedures/ directory found.")
                sys.exit(1)

            protocol_files = sorted(protocols_dir.glob("*.yaml"))
            if not protocol_files:
                print("No protocols found in procedures/")
                sys.exit(0)

            print(f"Available Protocols ({len(protocol_files)}):")
            print("-" * 50)
            for pf in protocol_files:
                try:
                    with open(pf) as f:
                        protocol = yaml.safe_load(f)
                    name = protocol.get('protocol', pf.stem)
                    desc = protocol.get('description', '')
                    print(f"  {name}")
                    if desc:
                        print(f"    {desc}")
                except:
                    print(f"  {pf.stem} (could not parse)")
            sys.exit(0)

        elif args.protocol_action == "validate":
            result = validate_cluster_command(
                args.cluster_type,
                args.root_node,
                args.graph
            )

            print(f"\nCluster: {result.cluster_type}")
            print(f"Root: {result.root_node}")
            print(f"Valid: {result.valid}")

            if result.checks_passed:
                print(f"\nPassed ({len(result.checks_passed)}):")
                for check in result.checks_passed:
                    print(f"  + {check}")

            if result.checks_failed:
                print(f"\nFailed ({len(result.checks_failed)}):")
                for check in result.checks_failed:
                    print(f"  - {check}")

            sys.exit(0 if result.valid else 1)

    elif args.command == "query":
        query_args = {
            'type': args.type,
            'node_id': args.node,
            'in_space': args.space,
            'target': args.type,
            'by': getattr(args, 'by', None),
            'via': getattr(args, 'via', None),
            'depth': args.depth,
        }

        result = graph_query_command(args.query_type, query_args, args.graph)

        if isinstance(result, str):
            print(result)
        elif isinstance(result, list):
            if not result:
                print("No results found.")
            else:
                print(f"Found {len(result)} results:")
                for item in result:
                    if hasattr(item, 'id'):
                        print(f"  {item.id}: {item.name}")
                    else:
                        print(f"  {item}")
        else:
            print(result)

        sys.exit(0)

    elif args.command == "explore":
        exit_code = explore_command(
            query=args.query,
            actor_id=args.actor,
            intention=args.intention,
            intention_type=args.intention_type,
            origin_moment=args.origin_moment,
            graph_name=args.graph,
            timeout=args.timeout,
            max_depth=args.max_depth,
            debug=args.debug,
            output_format=args.format,
        )
        sys.exit(exit_code)

    elif args.command == "cluster":
        from .cluster_metrics import cluster_validate_command

        if not args.cluster_action:
            cluster_parser.print_help()
            sys.exit(1)

        if args.cluster_action == "validate":
            result = cluster_validate_command(
                args.root_node,
                args.type,
                args.graph
            )

            if 'report' in result:
                print(result['report'])

            sys.exit(0 if result.get('valid', False) else 1)

    elif args.command == "agents":
        if not HAS_NEW_COMMANDS:
            print("Error: CLI commands module not found")
            sys.exit(1)

        action = args.agents_action or "list"
        actor_id = getattr(args, 'actor_id', None)
        format_output = getattr(args, 'format', 'text')

        exit_code = agents_command(
            target_dir=args.dir,
            action=action,
            actor_id=actor_id,
            format_output=format_output,
        )
        sys.exit(exit_code)

    elif args.command == "tasks":
        if not HAS_NEW_COMMANDS:
            print("Error: CLI commands module not found")
            sys.exit(1)

        exit_code = tasks_command(
            target_dir=args.dir,
            module=args.module,
            capability=args.capability,
            status_filter=args.status,
            format_output=args.format,
            limit=args.limit,
        )
        sys.exit(exit_code)

    elif args.command == "events":
        if not HAS_NEW_COMMANDS:
            print("Error: CLI commands module not found")
            sys.exit(1)

        exit_code = events_command(
            target_dir=args.dir,
            time_window=args.last,
            event_type_filter=args.type,
            format_output=args.format,
            limit=args.limit,
        )
        sys.exit(exit_code)

    elif args.command == "errors":
        if not HAS_NEW_COMMANDS:
            print("Error: CLI commands module not found")
            sys.exit(1)

        exit_code = errors_command(
            target_dir=args.dir,
            unresolved_only=args.unresolved,
            error_type=args.type,
            time_window=args.last,
            format_output=args.format,
        )
        sys.exit(exit_code)

    elif args.command == "swarm":
        if not HAS_NEW_COMMANDS:
            print("Error: CLI commands module not found")
            sys.exit(1)

        swarm_run(
            agents=args.agents,
            status=args.status,
            stop=args.stop,
            stream=args.stream,
            logs=args.logs,
            log_file=args.log_file,
        )
        sys.exit(0)

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
