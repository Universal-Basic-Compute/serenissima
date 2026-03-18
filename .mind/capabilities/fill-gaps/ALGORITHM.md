# Fill Gaps — Algorithm

```
STATUS: CANONICAL
CAPABILITY: fill-gaps
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
VOCABULARY:      ./VOCABULARY.md
BEHAVIORS:       ./BEHAVIORS.md
THIS:            ALGORITHM.md (you are here)
VALIDATION:      ./VALIDATION.md
```

---

## PURPOSE

How fill-gaps works — detection, resolution, validation.

---

## GAP DETECTION ALGORITHM

```python
def detect_gaps(project_root):
    """
    Scan documentation for @mind:gap markers.
    Called by: init_scan, cron:daily, doc_watch
    """
    import re

    GAP_PATTERN = re.compile(r'@mind:gap\s*(.+?)(?:\n|$)')
    problems = []

    for doc_path in glob(project_root / "docs/**/*.md"):
        content = doc_path.read_text()
        matches = GAP_PATTERN.findall(content)

        for match in matches:
            problems.append({
                "type": "DOC_GAPS",
                "target": str(doc_path),
                "context": match.strip(),
                "severity": "high"
            })

    return problems
```

---

## DUPLICATION DETECTION ALGORITHM

```python
def detect_duplicates(project_root, threshold=0.30):
    """
    Find docs with overlapping content.
    Called by: cron:weekly, post_ingest
    """
    from itertools import combinations

    # 1. Load all doc contents
    docs = {}
    for doc_path in glob(project_root / "docs/**/*.md"):
        content = doc_path.read_text()
        # Strip headers and CHAIN sections for comparison
        content = strip_headers_and_chain(content)
        docs[str(doc_path)] = content

    # 2. Compare all pairs
    problems = []
    for (path1, content1), (path2, content2) in combinations(docs.items(), 2):
        similarity = compute_similarity(content1, content2)

        if similarity > threshold:
            problems.append({
                "type": "DOC_DUPLICATION",
                "target": path1,
                "duplicate": path2,
                "similarity": similarity,
                "severity": "medium"
            })

    return problems


def compute_similarity(text1, text2):
    """
    Compute Jaccard similarity of word ngrams.
    Alternative: embedding cosine similarity.
    """
    def ngrams(text, n=3):
        words = text.lower().split()
        return set(tuple(words[i:i+n]) for i in range(len(words)-n+1))

    ng1 = ngrams(text1)
    ng2 = ngrams(text2)

    if not ng1 or not ng2:
        return 0.0

    intersection = len(ng1 & ng2)
    union = len(ng1 | ng2)

    return intersection / union if union > 0 else 0.0


def strip_headers_and_chain(content):
    """
    Remove template headers and CHAIN sections for fair comparison.
    """
    import re

    # Remove CHAIN code blocks
    content = re.sub(r'```\n.*?CHAIN.*?```', '', content, flags=re.DOTALL)
    # Remove status blocks
    content = re.sub(r'```\nSTATUS:.*?```', '', content, flags=re.DOTALL)
    # Remove markdown headers (keep content)
    content = re.sub(r'^#+\s+.*$', '', content, flags=re.MULTILINE)

    return content.strip()
```

---

## SIZE DETECTION ALGORITHM

```python
def detect_large_docs(project_root, max_lines=200):
    """
    Find docs exceeding line threshold.
    Called by: init_scan, cron:daily, doc_watch
    """
    problems = []

    for doc_path in glob(project_root / "docs/**/*.md"):
        content = doc_path.read_text()
        line_count = len(content.splitlines())

        if line_count > max_lines:
            problems.append({
                "type": "LARGE_DOC_MODULE",
                "target": str(doc_path),
                "lines": line_count,
                "excess": line_count - max_lines,
                "severity": "low"
            })

    return problems
```

---

## GAP FILLING ALGORITHM

```python
def fill_gap(gap_problem, agent):
    """
    Fill a single @mind:gap marker with content.
    Called when: agent executes gap fill task
    """
    doc_path = Path(gap_problem["target"])
    gap_context = gap_problem["context"]

    # 1. Read surrounding context
    content = doc_path.read_text()
    gap_location = find_gap_location(content, gap_context)

    # 2. Research content to fill gap
    research_context = agent.research({
        "gap_description": gap_context,
        "surrounding_content": extract_surrounding(content, gap_location),
        "module": get_module_from_path(doc_path),
    })

    # 3. Generate content
    new_content = agent.generate_content(research_context)

    # 4. Replace gap marker with content
    updated_content = replace_gap_with_content(
        content,
        gap_context,
        new_content
    )

    # 5. Write updated doc
    doc_path.write_text(updated_content)

    # 6. Update SYNC
    update_sync(doc_path, f"Filled gap: {gap_context[:50]}...")

    return {"filled": True, "content_length": len(new_content)}
```

---

## DEDUPLICATION ALGORITHM

```python
def deduplicate(dup_problem, agent):
    """
    Consolidate duplicate content to canonical source.
    Called when: agent executes dedupe task
    """
    source_path = Path(dup_problem["target"])
    dup_path = Path(dup_problem["duplicate"])

    source_content = source_path.read_text()
    dup_content = dup_path.read_text()

    # 1. Determine canonical source
    canonical, secondary = determine_canonical(
        source_path, source_content,
        dup_path, dup_content
    )

    # 2. Identify overlapping sections
    overlaps = find_overlapping_sections(
        canonical["content"],
        secondary["content"]
    )

    # 3. For each overlap:
    for overlap in overlaps:
        # Replace duplicate with reference
        secondary["content"] = replace_with_reference(
            secondary["content"],
            overlap,
            canonical["path"]
        )

    # 4. Write updated secondary
    secondary["path"].write_text(secondary["content"])

    # 5. Update SYNC
    update_sync(
        secondary["path"],
        f"Deduplicated: now references {canonical['path']}"
    )

    return {"consolidated": True, "canonical": str(canonical["path"])}


def determine_canonical(path1, content1, path2, content2):
    """
    Decide which source is canonical.
    Rules:
    1. More complete (longer after stripping)
    2. Older (by git history)
    3. Better location (docs/ > other)
    """
    score1 = len(strip_headers_and_chain(content1))
    score2 = len(strip_headers_and_chain(content2))

    if score1 > score2 * 1.1:  # 10% more content
        return (
            {"path": path1, "content": content1},
            {"path": path2, "content": content2}
        )
    elif score2 > score1 * 1.1:
        return (
            {"path": path2, "content": content2},
            {"path": path1, "content": content1}
        )
    else:
        # Similar size: prefer docs/ location
        if "docs/" in str(path1) and "docs/" not in str(path2):
            return (
                {"path": path1, "content": content1},
                {"path": path2, "content": content2}
            )
        # Default to first (arbitrary but consistent)
        return (
            {"path": path1, "content": content1},
            {"path": path2, "content": content2}
        )
```

---

## DOC SPLITTING ALGORITHM

```python
def split_large_doc(size_problem, agent):
    """
    Split oversized doc into smaller pieces.
    Called when: agent executes split task
    """
    doc_path = Path(size_problem["target"])
    content = doc_path.read_text()
    doc_type = get_doc_type(doc_path)

    if doc_type == "SYNC":
        return split_sync(doc_path, content)
    else:
        return split_by_sections(doc_path, content, agent)


def split_sync(doc_path, content):
    """
    Archive old SYNC entries, keep recent.
    """
    # Parse SYNC sections
    sections = parse_sync_sections(content)

    # Keep: STATUS, CHAIN, CURRENT STATE, RECENT (last 30 days)
    # Archive: older entries

    recent_cutoff = datetime.now() - timedelta(days=30)
    recent = []
    archive = []

    for section in sections["changes"]:
        if section["date"] >= recent_cutoff:
            recent.append(section)
        else:
            archive.append(section)

    if not archive:
        return {"split": False, "reason": "No old entries to archive"}

    # Write archive file
    archive_path = doc_path.parent / "SYNC_archive.md"
    write_archive(archive_path, archive)

    # Write trimmed SYNC
    trimmed_content = rebuild_sync(sections, recent)
    doc_path.write_text(trimmed_content)

    return {
        "split": True,
        "archived_entries": len(archive),
        "archive_path": str(archive_path)
    }


def split_by_sections(doc_path, content, agent):
    """
    Split non-SYNC doc by natural section boundaries.
    """
    # Identify split points (## headers with substantial content)
    sections = extract_sections(content)

    if len(sections) < 2:
        return {"split": False, "reason": "No natural split points"}

    # Group into chunks under 200 lines
    chunks = group_into_chunks(sections, max_lines=180)

    if len(chunks) == 1:
        return {"split": False, "reason": "Cannot split without breaking sections"}

    # Create new files
    base_name = doc_path.stem
    created = []

    for i, chunk in enumerate(chunks):
        if i == 0:
            # Keep first chunk in original file
            doc_path.write_text(chunk["content"])
        else:
            # Create new file for additional chunks
            new_path = doc_path.parent / f"{base_name}_{i+1}.md"
            new_path.write_text(chunk["content"])
            created.append(str(new_path))

    # Add cross-references
    add_split_references(doc_path, created)

    return {"split": True, "new_files": created}
```

---

## DECISION TREE

```
Problem detected
|
+-- DOC_GAPS?
|   +-- Yes -> create task_run -> fill_gap()
|
+-- DOC_DUPLICATION?
|   +-- Yes -> create task_run -> deduplicate()
|
+-- LARGE_DOC_MODULE?
    +-- Yes -> create task_run -> split_large_doc()
            |
            +-- SYNC? -> split_sync()
            +-- Other -> split_by_sections()

Gap fill:
|
+-- Research context
+-- Generate content
+-- Replace marker
+-- Validate

Dedupe:
|
+-- Determine canonical
+-- Find overlaps
+-- Replace with references
+-- Validate

Split:
|
+-- SYNC? -> Archive old entries
+-- Other? -> Split by sections
+-- Update references
+-- Validate
```
