"""
Health Checks: fill-gaps

Decorator-based health checks for documentation quality.
Source: capabilities/fill-gaps/runtime/checks.py
Installed to: .mind/capabilities/fill-gaps/runtime/checks.py
"""

import re
from itertools import combinations
from pathlib import Path

# Import from capability runtime infrastructure
# Located at: runtime/capability/ (MCP code, not copied to .mind/)
try:
    from runtime.capability import check, Signal, triggers
except ImportError:
    # Fallback: when running from .mind/capabilities after init
    # The runtime module should be available via PYTHONPATH
    from runtime.capability import check, Signal, triggers


# =============================================================================
# CONSTANTS
# =============================================================================

GAP_PATTERN = re.compile(r"@mind:gap\s*(.+?)(?:\n|$)")

SIMILARITY_THRESHOLD = 0.30

MAX_DOC_LINES = 200

# Patterns to strip when comparing docs for duplication
STRIP_PATTERNS = [
    re.compile(r"```\n.*?CHAIN.*?```", re.DOTALL),  # CHAIN blocks
    re.compile(r"```\nSTATUS:.*?```", re.DOTALL),  # Status blocks
    re.compile(r"^#+\s+.*$", re.MULTILINE),  # Headers
]


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def scan_for_gaps(docs_path: Path) -> list:
    """Find all @mind:gap markers in documentation."""
    gaps = []

    for doc_path in docs_path.rglob("*.md"):
        try:
            content = doc_path.read_text()
            matches = GAP_PATTERN.findall(content)

            for match in matches:
                gaps.append({
                    "path": str(doc_path),
                    "context": match.strip(),
                })
        except Exception:
            continue

    return gaps


def strip_for_comparison(content: str) -> str:
    """Strip headers and template sections for fair comparison."""
    for pattern in STRIP_PATTERNS:
        content = pattern.sub("", content)
    return content.strip()


def compute_ngram_similarity(text1: str, text2: str, n: int = 3) -> float:
    """Compute Jaccard similarity of word ngrams."""
    def ngrams(text):
        words = text.lower().split()
        if len(words) < n:
            return set()
        return set(tuple(words[i:i+n]) for i in range(len(words) - n + 1))

    ng1 = ngrams(text1)
    ng2 = ngrams(text2)

    if not ng1 or not ng2:
        return 0.0

    intersection = len(ng1 & ng2)
    union = len(ng1 | ng2)

    return intersection / union if union > 0 else 0.0


def detect_duplicates(docs_path: Path, threshold: float = 0.30) -> list:
    """Find doc pairs with overlapping content."""
    # Load and preprocess docs
    docs = {}
    for doc_path in docs_path.rglob("*.md"):
        try:
            content = doc_path.read_text()
            stripped = strip_for_comparison(content)
            if len(stripped) > 100:  # Only consider substantial docs
                docs[str(doc_path)] = stripped
        except Exception:
            continue

    # Compare all pairs
    duplicates = []
    for (path1, content1), (path2, content2) in combinations(docs.items(), 2):
        similarity = compute_ngram_similarity(content1, content2)

        if similarity > threshold:
            duplicates.append({
                "path1": path1,
                "path2": path2,
                "similarity": round(similarity, 2),
            })

    return duplicates


def detect_large_docs(docs_path: Path, max_lines: int = 200) -> list:
    """Find docs exceeding line threshold."""
    large = []

    for doc_path in docs_path.rglob("*.md"):
        try:
            content = doc_path.read_text()
            line_count = len(content.splitlines())

            if line_count > max_lines:
                large.append({
                    "path": str(doc_path),
                    "lines": line_count,
                    "excess": line_count - max_lines,
                })
        except Exception:
            continue

    return large


# =============================================================================
# HEALTH CHECKS
# =============================================================================


@check(
    id="gap_detection",
    triggers=[
        triggers.file.on_modify("docs/**/*.md"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="DOC_GAPS",
    task="TASK_fill_gap",
)
def gap_detection(ctx) -> dict:  # ctx: CheckContext
    """
    H1: Check for @mind:gap markers in documentation.

    Returns DEGRADED if any gaps found.
    Returns HEALTHY if no gaps.
    """
    docs_path = Path(ctx.docs_path) if hasattr(ctx, "docs_path") else Path("docs")
    gaps = scan_for_gaps(docs_path)

    if not gaps:
        return Signal.healthy()

    return Signal.degraded(gaps=gaps, count=len(gaps))


@check(
    id="duplication_detection",
    triggers=[
        triggers.cron.weekly(),
        triggers.event.after_ingest(),
    ],
    on_problem="DOC_DUPLICATION",
    task="TASK_dedupe_content",
)
def duplication_detection(ctx) -> dict:  # ctx: CheckContext
    """
    H2: Check for duplicate content across docs.

    Returns DEGRADED if any pairs have >30% overlap.
    Returns HEALTHY if no significant duplicates.
    """
    docs_path = Path(ctx.docs_path) if hasattr(ctx, "docs_path") else Path("docs")
    duplicates = detect_duplicates(docs_path, threshold=SIMILARITY_THRESHOLD)

    if not duplicates:
        return Signal.healthy()

    return Signal.degraded(duplicates=duplicates, count=len(duplicates))


@check(
    id="size_detection",
    triggers=[
        triggers.file.on_modify("docs/**/*.md"),
        triggers.init.after_scan(),
        triggers.cron.daily(),
    ],
    on_problem="LARGE_DOC_MODULE",
    task="TASK_split_large_doc",
)
def size_detection(ctx) -> dict:  # ctx: CheckContext
    """
    H3: Check for docs exceeding 200 lines.

    Returns DEGRADED if any docs are too large.
    Returns HEALTHY if all docs are under threshold.
    """
    docs_path = Path(ctx.docs_path) if hasattr(ctx, "docs_path") else Path("docs")
    large_docs = detect_large_docs(docs_path, max_lines=MAX_DOC_LINES)

    if not large_docs:
        return Signal.healthy()

    return Signal.degraded(large_docs=large_docs, count=len(large_docs))


# =============================================================================
# REGISTRY (collected by MCP loader)
# =============================================================================

CHECKS = [
    gap_detection,
    duplication_detection,
    size_detection,
]
