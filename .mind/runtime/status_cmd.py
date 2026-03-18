"""
mind status - Show module implementation progress and health

DOCS: docs/cli/core/IMPLEMENTATION_CLI_Code_Architecture.md

Provides:
- Global status: overview of all modules with maturity, health, and progress
- Module status: detailed view of a specific module's implementation progress
- Full doctor integration with issue details
- Color-coded output for quick visual scanning
"""

import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field

# Try to import yaml, fall back gracefully
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False


# =============================================================================
# ANSI COLOR CODES
# =============================================================================

class Colors:
    """ANSI color codes for terminal output."""
    # Reset
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    UNDERLINE = "\033[4m"

    # Regular colors
    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    GRAY = "\033[90m"

    # Bright colors
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"

    # Background
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"
    BG_BLUE = "\033[44m"

    @classmethod
    def colorize(cls, text: str, color: str) -> str:
        return f"{color}{text}{cls.RESET}"

    @classmethod
    def maturity_color(cls, maturity: str) -> str:
        return {
            "CANONICAL": cls.BRIGHT_GREEN,
            "DESIGNING": cls.BRIGHT_YELLOW,
            "PROPOSED": cls.BRIGHT_CYAN,
            "DEPRECATED": cls.BRIGHT_RED,
        }.get(maturity, cls.WHITE)

    @classmethod
    def severity_color(cls, severity: str) -> str:
        return {
            "critical": cls.BRIGHT_RED,
            "warning": cls.YELLOW,
            "info": cls.CYAN,
        }.get(severity, cls.WHITE)

    @classmethod
    def doc_status_color(cls, status: str) -> str:
        return {
            "CANONICAL": cls.BRIGHT_GREEN,
            "STABLE": cls.GREEN,
            "DRAFT": cls.YELLOW,
            "DESIGNING": cls.BRIGHT_YELLOW,
            "PROPOSED": cls.CYAN,
            "MISSING": cls.RED,
            "ERROR": cls.BRIGHT_RED,
        }.get(status.upper(), cls.WHITE)


C = Colors  # Shorthand


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class DocChainStatus:
    """Status of a module's documentation chain."""
    objectifs: Optional[Path] = None
    patterns: Optional[Path] = None
    behaviors: Optional[Path] = None
    algorithm: Optional[Path] = None
    validation: Optional[Path] = None
    implementation: Optional[Path] = None
    health: Optional[Path] = None
    sync: Optional[Path] = None

    # Status of each doc
    objectifs_status: str = "MISSING"
    patterns_status: str = "MISSING"
    behaviors_status: str = "MISSING"
    algorithm_status: str = "MISSING"
    validation_status: str = "MISSING"
    implementation_status: str = "MISSING"
    health_status: str = "MISSING"
    sync_status: str = "MISSING"

    def completeness_score(self) -> Tuple[int, int]:
        """Return (present, total) for doc chain completeness."""
        docs = [
            self.patterns, self.behaviors, self.algorithm,
            self.validation, self.implementation, self.health, self.sync
        ]
        present = sum(1 for d in docs if d is not None)
        return present, len(docs)

    def to_bar(self, width: int = 7) -> str:
        """Return a visual bar showing completeness with colors."""
        present, total = self.completeness_score()

        # Color based on completeness
        if present == total:
            color = C.BRIGHT_GREEN
        elif present >= total * 0.7:
            color = C.GREEN
        elif present >= total * 0.4:
            color = C.YELLOW
        else:
            color = C.RED

        filled = "█" * present
        empty = "░" * (total - present)
        return f"{color}[{filled}{empty}]{C.RESET} {present}/{total}"

    def get_all_docs(self) -> List[Tuple[str, Optional[Path], str]]:
        """Return list of (name, path, status) for all docs."""
        return [
            ("OBJECTIVES", self.objectifs, self.objectifs_status),
            ("PATTERNS", self.patterns, self.patterns_status),
            ("BEHAVIORS", self.behaviors, self.behaviors_status),
            ("ALGORITHM", self.algorithm, self.algorithm_status),
            ("VALIDATION", self.validation, self.validation_status),
            ("IMPLEMENTATION", self.implementation, self.implementation_status),
            ("HEALTH", self.health, self.health_status),
            ("SYNC", self.sync, self.sync_status),
        ]


@dataclass
class HealthIssue:
    """A single health issue from doctor."""
    task_type: str
    severity: str
    path: str
    message: str
    details: Dict = field(default_factory=dict)


@dataclass
class ModuleStatus:
    """Complete status of a module."""
    name: str
    maturity: str = "UNKNOWN"
    code_pattern: str = ""
    docs_path: str = ""
    tests_path: str = ""
    owner: str = ""
    notes: str = ""
    entry_points: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    doc_chain: DocChainStatus = field(default_factory=DocChainStatus)
    sync_status: str = "NO_SYNC"
    sync_summary: str = ""
    sync_updated: str = ""
    health_issues: List[HealthIssue] = field(default_factory=list)
    exists_in_yaml: bool = False
    code_exists: bool = False
    docs_exist: bool = False


# =============================================================================
# YAML LOADING
# =============================================================================

def load_modules_yaml(project_dir: Path) -> Dict[str, Any]:
    """Load modules.yaml from project directory."""
    if not HAS_YAML:
        return {}

    yaml_path = project_dir / "modules.yaml"
    if not yaml_path.exists():
        return {}

    try:
        with open(yaml_path) as f:
            data = yaml.safe_load(f) or {}

        # Modules can be under 'modules:' key or at root level
        modules = {}

        # Check under 'modules' key first
        if "modules" in data and isinstance(data["modules"], dict):
            for k, v in data["modules"].items():
                if isinstance(v, dict) and ("code" in v or "docs" in v):
                    modules[k] = v

        # Also check root level for module definitions
        for k, v in data.items():
            if k == "modules":
                continue
            if isinstance(v, dict) and ("code" in v or "docs" in v):
                modules[k] = v

        return modules
    except Exception:
        return {}


# =============================================================================
# DOC CHAIN DISCOVERY
# =============================================================================

def extract_doc_status(doc_path: Path) -> str:
    """Extract STATUS from any doc file header."""
    if not doc_path or not doc_path.exists():
        return "MISSING"

    try:
        content = doc_path.read_text()[:1000]
        status_match = re.search(r'^STATUS:\s*(\w+)', content, re.MULTILINE)
        return status_match.group(1) if status_match else "UNKNOWN"
    except Exception:
        return "ERROR"


def find_doc_chain(docs_path: Path) -> DocChainStatus:
    """Find documentation chain files in a docs directory."""
    chain = DocChainStatus()

    if not docs_path.exists():
        return chain

    # Search for doc types
    patterns = {
        "objectifs": "OBJECTIVES_*.md",
        "patterns": "PATTERNS_*.md",
        "behaviors": "BEHAVIORS_*.md",
        "algorithm": "ALGORITHM_*.md",
        "validation": "VALIDATION_*.md",
        "implementation": "IMPLEMENTATION_*.md",
        "health": "HEALTH_*.md",
        "sync": "SYNC_*.md",
    }

    for doc_type, pattern in patterns.items():
        matches = list(docs_path.glob(pattern))
        if not matches:
            matches = list(docs_path.glob(f"**/{pattern}"))
        if matches:
            # Filter out archive files
            matches = [m for m in matches if "archive" not in m.name.lower()]
            if matches:
                doc_path = matches[0]
                setattr(chain, doc_type, doc_path)
                setattr(chain, f"{doc_type}_status", extract_doc_status(doc_path))

    return chain


def extract_sync_details(sync_path: Path) -> Tuple[str, str, str]:
    """Extract STATUS, summary, and UPDATED from a SYNC file."""
    if not sync_path or not sync_path.exists():
        return "NO_SYNC", "", ""

    try:
        content = sync_path.read_text()

        # Extract STATUS
        status_match = re.search(r'^STATUS:\s*(\w+)', content, re.MULTILINE)
        status = status_match.group(1) if status_match else "UNKNOWN"

        # Extract UPDATED
        updated_match = re.search(r'^UPDATED:\s*(.+)$', content, re.MULTILINE)
        updated = updated_match.group(1).strip() if updated_match else ""

        # Extract first meaningful content after headers
        summary = ""
        lines = content.split('\n')
        in_content = False
        for line in lines:
            if line.startswith('## '):
                in_content = True
                continue
            if in_content and line.strip() and not line.startswith('#') and not line.startswith('```'):
                summary = line.strip()[:120]
                if len(line.strip()) > 120:
                    summary += "..."
                break

        return status, summary, updated
    except Exception:
        return "ERROR", "", ""


# =============================================================================
# DOCTOR INTEGRATION
# =============================================================================

def _path_matches_glob(path: str, pattern: str) -> bool:
    """Check if a path matches a glob pattern."""
    import fnmatch
    if "**" in pattern:
        base = pattern.split("**")[0].rstrip("/")
        return path.startswith(base)
    return fnmatch.fnmatch(path, pattern)


def get_all_health_issues(project_dir: Path) -> List[HealthIssue]:
    """Get all health issues (doctor command removed)."""
    return []


def get_module_health_issues(project_dir: Path, module_name: str, code_pattern: str, docs_path: str) -> List[HealthIssue]:
    """Get health issues for a specific module from doctor."""
    all_issues = get_all_health_issues(project_dir)
    return filter_issues_for_module(all_issues, code_pattern, docs_path)


def filter_issues_for_module(all_issues: List[HealthIssue], code_pattern: str, docs_path: str) -> List[HealthIssue]:
    """Filter issues to those matching a module's code or docs paths."""
    module_issues = []
    for issue in all_issues:
        path = issue.path
        matched = False

        # Check if issue path matches module code
        if code_pattern and _path_matches_glob(path, code_pattern):
            matched = True

        # Check if issue path matches module docs
        if docs_path and path.startswith(docs_path.rstrip('/')):
            matched = True

        if matched:
            module_issues.append(issue)

    return module_issues


# =============================================================================
# MODULE STATUS BUILDING
# =============================================================================

def get_module_status(project_dir: Path, module_name: str, all_issues: List[HealthIssue] = None) -> ModuleStatus:
    """Get detailed status for a specific module."""
    modules = load_modules_yaml(project_dir)
    status = ModuleStatus(name=module_name)

    if module_name in modules:
        mod_config = modules[module_name]
        status.exists_in_yaml = True
        status.maturity = mod_config.get("maturity", "UNKNOWN")
        status.code_pattern = mod_config.get("code", "")
        status.docs_path = mod_config.get("docs", "")
        status.tests_path = mod_config.get("tests", "")
        status.owner = mod_config.get("owner", "")
        status.notes = mod_config.get("notes", "").strip()
        status.entry_points = mod_config.get("entry_points", [])
        status.depends_on = mod_config.get("depends_on", [])

        # Check if code exists
        if status.code_pattern:
            code_base = status.code_pattern.split("**")[0].rstrip("/*")
            status.code_exists = (project_dir / code_base).exists()

        # Check docs
        if status.docs_path:
            docs_full = project_dir / status.docs_path
            status.docs_exist = docs_full.exists()
            status.doc_chain = find_doc_chain(docs_full)

            # Get sync details
            if status.doc_chain.sync:
                status.sync_status, status.sync_summary, status.sync_updated = extract_sync_details(status.doc_chain.sync)

        # Get health issues (use provided list or fetch)
        if all_issues is not None:
            # Filter from provided list
            status.health_issues = filter_issues_for_module(
                all_issues, status.code_pattern, status.docs_path
            )
        else:
            status.health_issues = get_module_health_issues(
                project_dir, module_name, status.code_pattern, status.docs_path
            )

    return status


def get_all_modules_status(project_dir: Path) -> Tuple[List[ModuleStatus], List[HealthIssue]]:
    """Get status for all modules and all health issues."""
    modules = load_modules_yaml(project_dir)
    all_issues = get_all_health_issues(project_dir)

    statuses = []
    for name in sorted(modules.keys()):
        status = get_module_status(project_dir, name, all_issues)
        statuses.append(status)

    return statuses, all_issues


# =============================================================================
# FORMATTING - MODULE VIEW
# =============================================================================

def format_module_status(status: ModuleStatus, verbose: bool = False) -> str:
    """Format a detailed module status for display."""
    lines = []

    # Header
    mat_color = C.maturity_color(status.maturity)
    lines.append("")
    lines.append(f"{C.BOLD}{C.BRIGHT_WHITE}{'═' * 70}{C.RESET}")
    lines.append(f"{C.BOLD}{C.BRIGHT_WHITE}  {status.name}{C.RESET}")
    lines.append(f"{C.BOLD}{C.BRIGHT_WHITE}{'═' * 70}{C.RESET}")

    # Maturity badge
    lines.append("")
    lines.append(f"  {C.BOLD}Maturity:{C.RESET}     {mat_color}{C.BOLD}{status.maturity}{C.RESET}")

    # Owner if set
    if status.owner:
        lines.append(f"  {C.BOLD}Owner:{C.RESET}        {status.owner}")

    # Code pattern
    if status.code_pattern:
        exists_icon = f"{C.GREEN}✓{C.RESET}" if status.code_exists else f"{C.RED}✗{C.RESET}"
        lines.append(f"  {C.BOLD}Code:{C.RESET}         {C.CYAN}{status.code_pattern}{C.RESET} {exists_icon}")

    # Docs path
    if status.docs_path:
        exists_icon = f"{C.GREEN}✓{C.RESET}" if status.docs_exist else f"{C.RED}✗{C.RESET}"
        lines.append(f"  {C.BOLD}Docs:{C.RESET}         {C.CYAN}{status.docs_path}{C.RESET} {exists_icon}")

    # Tests path
    if status.tests_path:
        tests_exist = (Path.cwd() / status.tests_path).exists()
        exists_icon = f"{C.GREEN}✓{C.RESET}" if tests_exist else f"{C.RED}✗{C.RESET}"
        lines.append(f"  {C.BOLD}Tests:{C.RESET}        {C.CYAN}{status.tests_path}{C.RESET} {exists_icon}")

    # Entry points
    if status.entry_points:
        lines.append(f"  {C.BOLD}Entry Points:{C.RESET}")
        for ep in status.entry_points[:5]:
            lines.append(f"                {C.DIM}→{C.RESET} {ep}")
        if len(status.entry_points) > 5:
            lines.append(f"                {C.DIM}... and {len(status.entry_points) - 5} more{C.RESET}")

    # Dependencies
    if status.depends_on:
        lines.append(f"  {C.BOLD}Depends On:{C.RESET}   {', '.join(status.depends_on)}")

    # Doc chain section
    lines.append("")
    lines.append(f"  {C.BOLD}{C.UNDERLINE}Documentation Chain{C.RESET}")
    lines.append(f"  {C.BOLD}Progress:{C.RESET}     {status.doc_chain.to_bar()}")
    lines.append("")

    # Doc chain details
    for doc_name, doc_path, doc_status in status.doc_chain.get_all_docs():
        status_color = C.doc_status_color(doc_status)
        if doc_path:
            icon = f"{C.GREEN}✓{C.RESET}"
            filename = doc_path.name
            lines.append(f"    {icon} {C.BOLD}{doc_name:<15}{C.RESET} {filename:<45} {status_color}{doc_status}{C.RESET}")
        else:
            icon = f"{C.RED}✗{C.RESET}"
            lines.append(f"    {icon} {C.DIM}{doc_name:<15} {'─' * 45} MISSING{C.RESET}")

    # SYNC details
    if status.sync_status != "NO_SYNC":
        lines.append("")
        lines.append(f"  {C.BOLD}{C.UNDERLINE}Current State (from SYNC){C.RESET}")
        sync_color = C.doc_status_color(status.sync_status)
        lines.append(f"  {C.BOLD}Status:{C.RESET}       {sync_color}{status.sync_status}{C.RESET}")
        if status.sync_updated:
            lines.append(f"  {C.BOLD}Updated:{C.RESET}      {status.sync_updated}")
        if status.sync_summary:
            lines.append(f"  {C.BOLD}Summary:{C.RESET}")
            # Word wrap the summary
            words = status.sync_summary.split()
            line = "              "
            for word in words:
                if len(line) + len(word) > 75:
                    lines.append(line)
                    line = "              " + word + " "
                else:
                    line += word + " "
            if line.strip():
                lines.append(line)

    # Health issues
    lines.append("")
    lines.append(f"  {C.BOLD}{C.UNDERLINE}Health Status{C.RESET}")

    if not status.health_issues:
        lines.append(f"  {C.BRIGHT_GREEN}✓ No issues detected{C.RESET}")
    else:
        critical = [i for i in status.health_issues if i.severity == "critical"]
        warnings = [i for i in status.health_issues if i.severity == "warning"]
        infos = [i for i in status.health_issues if i.severity == "info"]

        # Summary line
        parts = []
        if critical:
            parts.append(f"{C.BRIGHT_RED}{len(critical)} critical{C.RESET}")
        if warnings:
            parts.append(f"{C.YELLOW}{len(warnings)} warnings{C.RESET}")
        if infos:
            parts.append(f"{C.CYAN}{len(infos)} info{C.RESET}")
        lines.append(f"  {', '.join(parts)}")
        lines.append("")

        # Group by type
        by_type: Dict[str, List[HealthIssue]] = {}
        for issue in status.health_issues:
            by_type.setdefault(issue.task_type, []).append(issue)

        # Show issues
        for task_type, issues in sorted(by_type.items()):
            severity = issues[0].severity
            sev_color = C.severity_color(severity)
            icon = "⚠" if severity == "critical" else "●" if severity == "warning" else "○"

            lines.append(f"    {sev_color}{icon} {task_type}{C.RESET} ({len(issues)})")

            if verbose:
                for issue in issues[:5]:
                    short_path = issue.path
                    if len(short_path) > 50:
                        short_path = "..." + short_path[-47:]
                    lines.append(f"      {C.DIM}└─{C.RESET} {short_path}")
                    if issue.message and issue.message != issue.path:
                        msg = issue.message[:60]
                        if len(issue.message) > 60:
                            msg += "..."
                        lines.append(f"         {C.DIM}{msg}{C.RESET}")
                if len(issues) > 5:
                    lines.append(f"      {C.DIM}... and {len(issues) - 5} more{C.RESET}")

    # Notes
    if status.notes and verbose:
        lines.append("")
        lines.append(f"  {C.BOLD}{C.UNDERLINE}Notes{C.RESET}")
        for note_line in status.notes.split('\n')[:5]:
            lines.append(f"    {C.DIM}{note_line.strip()}{C.RESET}")

    lines.append("")
    return "\n".join(lines)


# =============================================================================
# DASHBOARD DATA (agents, tasks, throttle, alerts)
# =============================================================================

def _get_dashboard_data(project_dir: Path) -> Dict[str, Any]:
    """Get dashboard data: agents, tasks, throttler, controller status."""
    dashboard = {
        "agents": {"running": 0, "ready": 0, "paused": 0, "total": 0},
        "tasks": {"pending": 0, "running": 0, "stuck": 0, "failed": 0},
        "throttler": {"active": 0, "pending": 0},
        "controller": {"mode": "unknown", "can_claim": False},
        "alerts": [],
    }

    # Try to get capability runtime status
    try:
        from .capability_integration import (
            get_capability_manager,
            get_throttler,
            get_controller,
            CAPABILITY_RUNTIME_AVAILABLE,
        )
        if CAPABILITY_RUNTIME_AVAILABLE:
            # Throttler status
            throttler = get_throttler()
            if throttler:
                dashboard["throttler"]["active"] = len(getattr(throttler, 'active_tasks', {}))
                dashboard["throttler"]["pending"] = len(getattr(throttler, 'pending_tasks', {}))

            # Controller status
            controller = get_controller()
            if controller:
                dashboard["controller"]["mode"] = getattr(controller.mode, 'value', str(controller.mode))
                dashboard["controller"]["can_claim"] = controller.can_claim()
    except ImportError:
        pass

    # Try to get agent info from graph
    try:
        from .physics.graph.graph_ops import GraphOps
        graph_name = project_dir.name
        graph = GraphOps(graph_name=graph_name)

        # Count agents by status
        agent_result = graph.query("""
            MATCH (a:Actor)
            WHERE a.type = 'AGENT' OR a.id STARTS WITH 'AGENT_'
            RETURN a.status, count(a)
        """)
        for status, count in agent_result:
            status = (status or "ready").lower()
            if status in dashboard["agents"]:
                dashboard["agents"][status] = count
            dashboard["agents"]["total"] += count

        # Count tasks by status
        task_result = graph.query("""
            MATCH (t:Narrative)
            WHERE t.type = 'task_run' OR t.type = 'task'
            RETURN t.status, count(t)
        """)
        for status, count in task_result:
            status = (status or "pending").lower()
            if status in dashboard["tasks"]:
                dashboard["tasks"][status] = count

        # Get recent alerts (critical health issues in last 24h)
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(hours=24)).isoformat()

        alert_result = graph.query(f"""
            MATCH (m:Moment)
            WHERE m.type = 'error' AND m.created >= '{cutoff}'
            AND (m.resolved IS NULL OR m.resolved = false)
            RETURN m.synthesis, m.severity
            ORDER BY m.created DESC
            LIMIT 5
        """)
        for synthesis, severity in alert_result:
            if synthesis:
                dashboard["alerts"].append({
                    "message": synthesis[:80],
                    "severity": severity or "error",
                })

    except Exception:
        pass

    return dashboard


def format_dashboard(dashboard: Dict[str, Any]) -> str:
    """Format dashboard section for status output."""
    lines = []

    agents = dashboard["agents"]
    tasks = dashboard["tasks"]
    throttler = dashboard["throttler"]
    controller = dashboard["controller"]
    alerts = dashboard["alerts"]

    # Quick status line
    lines.append(f"  {C.BOLD}{C.UNDERLINE}System Status{C.RESET}")
    lines.append("")

    # Agents row
    agent_parts = []
    if agents["running"]:
        agent_parts.append(f"{C.BRIGHT_CYAN}{agents['running']} running{C.RESET}")
    if agents["ready"]:
        agent_parts.append(f"{C.GREEN}{agents['ready']} ready{C.RESET}")
    if agents["paused"]:
        agent_parts.append(f"{C.YELLOW}{agents['paused']} paused{C.RESET}")
    agent_str = ", ".join(agent_parts) if agent_parts else f"{C.DIM}none{C.RESET}"
    lines.append(f"  {C.BOLD}Agents:{C.RESET}      {agent_str}")

    # Tasks row
    task_parts = []
    if tasks["stuck"]:
        task_parts.append(f"{C.BRIGHT_RED}{tasks['stuck']} stuck{C.RESET}")
    if tasks["failed"]:
        task_parts.append(f"{C.RED}{tasks['failed']} failed{C.RESET}")
    if tasks["running"]:
        task_parts.append(f"{C.CYAN}{tasks['running']} running{C.RESET}")
    if tasks["pending"]:
        task_parts.append(f"{C.YELLOW}{tasks['pending']} pending{C.RESET}")
    task_str = ", ".join(task_parts) if task_parts else f"{C.DIM}none{C.RESET}"
    lines.append(f"  {C.BOLD}Tasks:{C.RESET}       {task_str}")

    # Throttler/Controller
    if throttler["active"] or throttler["pending"]:
        lines.append(f"  {C.BOLD}Throttler:{C.RESET}   {throttler['active']} active, {throttler['pending']} queued")

    mode_color = C.BRIGHT_GREEN if controller["can_claim"] else C.YELLOW
    if controller["mode"] != "unknown":
        lines.append(f"  {C.BOLD}Controller:{C.RESET}  {mode_color}{controller['mode']}{C.RESET}")

    # Alerts
    if alerts:
        lines.append("")
        lines.append(f"  {C.BOLD}{C.BRIGHT_RED}Alerts ({len(alerts)}){C.RESET}")
        for alert in alerts[:3]:
            sev = alert["severity"]
            icon = "!!" if sev == "critical" else "! " if sev == "error" else "* "
            color = C.BRIGHT_RED if sev == "critical" else C.RED if sev == "error" else C.YELLOW
            lines.append(f"    {color}{icon}{C.RESET} {alert['message']}")

    lines.append("")
    return "\n".join(lines)


# =============================================================================
# FORMATTING - GLOBAL VIEW
# =============================================================================

def format_global_status(statuses: List[ModuleStatus], all_issues: List[HealthIssue], project_dir: Path = None) -> str:
    """Format global status overview with full details."""
    lines = []

    # Header
    lines.append("")
    lines.append(f"{C.BOLD}{C.BRIGHT_WHITE}{'═' * 78}{C.RESET}")
    lines.append(f"{C.BOLD}{C.BRIGHT_WHITE}  MIND PROJECT STATUS{C.RESET}")
    lines.append(f"{C.BOLD}{C.BRIGHT_WHITE}{'═' * 78}{C.RESET}")

    # Dashboard section (agents, tasks, throttle, alerts)
    if project_dir:
        dashboard = _get_dashboard_data(project_dir)
        if dashboard["agents"]["total"] or dashboard["tasks"]["pending"] or dashboard["alerts"]:
            lines.append("")
            lines.append(format_dashboard(dashboard))

    # ==========================================================================
    # SUMMARY SECTION
    # ==========================================================================
    lines.append("")
    lines.append(f"  {C.BOLD}{C.UNDERLINE}Summary{C.RESET}")
    lines.append("")

    total = len(statuses)
    by_maturity = {}
    total_critical = 0
    total_warnings = 0
    total_info = 0

    for s in statuses:
        by_maturity[s.maturity] = by_maturity.get(s.maturity, 0) + 1
        for issue in s.health_issues:
            if issue.severity == "critical":
                total_critical += 1
            elif issue.severity == "warning":
                total_warnings += 1
            else:
                total_info += 1

    lines.append(f"  {C.BOLD}Total Modules:{C.RESET}  {total}")
    lines.append("")

    # Maturity breakdown with visual bars
    lines.append(f"  {C.BOLD}Maturity Distribution:{C.RESET}")
    for mat in ["CANONICAL", "DESIGNING", "PROPOSED", "DEPRECATED", "UNKNOWN"]:
        if mat in by_maturity:
            count = by_maturity[mat]
            pct = count / total * 100
            bar_len = int(pct / 5)  # 20 chars = 100%
            color = C.maturity_color(mat)
            bar = f"{color}{'█' * bar_len}{C.DIM}{'░' * (20 - bar_len)}{C.RESET}"
            lines.append(f"    {color}{mat:<12}{C.RESET} {bar} {count:>2} ({pct:>4.1f}%)")

    # Health summary
    lines.append("")
    lines.append(f"  {C.BOLD}Health Overview:{C.RESET}")
    if total_critical > 0:
        lines.append(f"    {C.BRIGHT_RED}⚠ {total_critical} critical issues{C.RESET}")
    if total_warnings > 0:
        lines.append(f"    {C.YELLOW}● {total_warnings} warnings{C.RESET}")
    if total_info > 0:
        lines.append(f"    {C.CYAN}○ {total_info} info{C.RESET}")
    if total_critical == 0 and total_warnings == 0 and total_info == 0:
        lines.append(f"    {C.BRIGHT_GREEN}✓ All healthy{C.RESET}")

    # ==========================================================================
    # DOC COVERAGE SECTION
    # ==========================================================================
    lines.append("")
    lines.append(f"  {C.BOLD}{C.UNDERLINE}Documentation Coverage{C.RESET}")
    lines.append("")

    # Calculate coverage stats
    full_coverage = sum(1 for s in statuses if s.doc_chain.completeness_score()[0] == 7)
    partial_coverage = sum(1 for s in statuses if 0 < s.doc_chain.completeness_score()[0] < 7)
    no_coverage = sum(1 for s in statuses if s.doc_chain.completeness_score()[0] == 0)

    lines.append(f"    {C.BRIGHT_GREEN}█{C.RESET} Full (7/7):    {full_coverage:>2} modules")
    lines.append(f"    {C.YELLOW}█{C.RESET} Partial:       {partial_coverage:>2} modules")
    lines.append(f"    {C.RED}█{C.RESET} None (0/7):    {no_coverage:>2} modules")

    # Modules needing docs
    low_doc_modules = [s for s in statuses if s.doc_chain.completeness_score()[0] < 4]
    if low_doc_modules:
        lines.append("")
        lines.append(f"  {C.BOLD}Modules Needing Documentation:{C.RESET}")
        for s in sorted(low_doc_modules, key=lambda x: x.doc_chain.completeness_score()[0]):
            present, total_docs = s.doc_chain.completeness_score()
            lines.append(f"    {C.RED}●{C.RESET} {s.name:<35} {s.doc_chain.to_bar()}")

    # ==========================================================================
    # MODULE TABLE
    # ==========================================================================
    lines.append("")
    lines.append(f"  {C.BOLD}{C.UNDERLINE}All Modules{C.RESET}")
    lines.append("")

    # Table header
    header = f"  {C.BOLD}{'MODULE':<32} {'MATURITY':<12} {'DOCS':<12} {'SYNC':<12} {'HEALTH':<12}{C.RESET}"
    lines.append(header)
    lines.append(f"  {C.DIM}{'─' * 76}{C.RESET}")

    for s in statuses:
        # Module name (truncate if needed)
        name = s.name[:30] + ".." if len(s.name) > 32 else s.name

        # Maturity with color
        mat_color = C.maturity_color(s.maturity)
        maturity = f"{mat_color}{s.maturity:<12}{C.RESET}"

        # Doc coverage
        present, total_docs = s.doc_chain.completeness_score()
        if present == total_docs:
            docs_str = f"{C.BRIGHT_GREEN}{present}/{total_docs} ✓{C.RESET}      "
        elif present >= 4:
            docs_str = f"{C.YELLOW}{present}/{total_docs}{C.RESET}        "
        elif present > 0:
            docs_str = f"{C.RED}{present}/{total_docs}{C.RESET}        "
        else:
            docs_str = f"{C.RED}0/{total_docs}{C.RESET}        "

        # SYNC status
        sync_color = C.doc_status_color(s.sync_status)
        sync_str = f"{sync_color}{s.sync_status[:10]:<12}{C.RESET}"

        # Health
        critical = sum(1 for i in s.health_issues if i.severity == "critical")
        warnings = sum(1 for i in s.health_issues if i.severity == "warning")
        if critical > 0:
            health_str = f"{C.BRIGHT_RED}{critical}c {warnings}w{C.RESET}      "
        elif warnings > 0:
            health_str = f"{C.YELLOW}{warnings}w{C.RESET}         "
        else:
            health_str = f"{C.BRIGHT_GREEN}✓{C.RESET}           "

        lines.append(f"  {name:<32} {maturity} {docs_str} {sync_str} {health_str}")

    lines.append(f"  {C.DIM}{'─' * 76}{C.RESET}")

    # ==========================================================================
    # TOP HEALTH ISSUES
    # ==========================================================================
    if all_issues:
        lines.append("")
        lines.append(f"  {C.BOLD}{C.UNDERLINE}Top Health Issues{C.RESET}")
        lines.append("")

        # Group by type
        by_type: Dict[str, List[HealthIssue]] = {}
        for issue in all_issues:
            by_type.setdefault(issue.task_type, []).append(issue)

        # Sort by count (most common first), then by severity
        sorted_types = sorted(
            by_type.items(),
            key=lambda x: (
                -sum(1 for i in x[1] if i.severity == "critical"),
                -len(x[1])
            )
        )

        for task_type, issues in sorted_types[:10]:
            severity = issues[0].severity
            sev_color = C.severity_color(severity)
            icon = "⚠" if severity == "critical" else "●" if severity == "warning" else "○"
            lines.append(f"    {sev_color}{icon} {task_type:<30}{C.RESET} {len(issues):>3} occurrences")

    # ==========================================================================
    # FOOTER
    # ==========================================================================
    lines.append("")
    lines.append(f"  {C.DIM}{'─' * 76}{C.RESET}")
    lines.append(f"  {C.DIM}Run 'mind status <module>' for detailed module view{C.RESET}")
    lines.append(f"  {C.DIM}Run 'mind status <module> -v' for verbose output with issue details{C.RESET}")
    lines.append(f"  {C.DIM}Run 'mind doctor' for full health report{C.RESET}")
    lines.append("")

    return "\n".join(lines)


# =============================================================================
# MAIN COMMAND
# =============================================================================

def status_command(project_dir: Path, module_name: Optional[str] = None, verbose: bool = False) -> int:
    """
    Main status command entry point.

    Args:
        project_dir: Project root directory
        module_name: Optional specific module to show
        verbose: Show detailed information

    Returns:
        Exit code (0 = success)
    """
    if not HAS_YAML:
        print(f"{C.RED}Error: PyYAML required for status command{C.RESET}")
        print("Install with: pip install pyyaml")
        return 1

    modules_path = project_dir / "modules.yaml"
    if not modules_path.exists():
        print(f"{C.RED}No modules.yaml found in {project_dir}{C.RESET}")
        print("Run 'mind init' to create one, or add modules manually.")
        return 1

    if module_name:
        # Single module status
        all_issues = get_all_health_issues(project_dir)
        status = get_module_status(project_dir, module_name, all_issues)

        if not status.exists_in_yaml:
            print(f"{C.RED}Module '{module_name}' not found in modules.yaml{C.RESET}")
            print("")
            print(f"{C.BOLD}Available modules:{C.RESET}")
            modules = load_modules_yaml(project_dir)
            for name in sorted(modules.keys()):
                print(f"  {C.CYAN}•{C.RESET} {name}")
            return 1

        print(format_module_status(status, verbose=verbose))
    else:
        # Global status
        statuses, all_issues = get_all_modules_status(project_dir)
        if not statuses:
            print(f"{C.YELLOW}No modules defined in modules.yaml{C.RESET}")
            return 1

        print(format_global_status(statuses, all_issues, project_dir))

        if verbose:
            for status in statuses:
                print(format_module_status(status, verbose=True))

    return 0
