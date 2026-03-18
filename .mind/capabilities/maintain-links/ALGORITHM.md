# Maintain Links — Algorithm

```
STATUS: CANONICAL
CAPABILITY: maintain-links
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

How maintain-links works — detection, resolution, validation.

---

## IMPL LINK VALIDATION ALGORITHM

```python
def check_impl_links(doc_path):
    """
    Validate all IMPL: markers in a document.
    Called by: init_scan, cron:daily, file_watch
    """

    # 1. Parse document for IMPL: markers
    content = read_file(doc_path)
    impl_markers = parse_impl_markers(content)
    # Returns: ["src/auth/login.py", "lib/utils.ts", ...]

    broken_links = []

    for marker in impl_markers:
        # 2. Resolve path relative to project root
        target_path = resolve_path(marker)

        # 3. Check if target exists
        if not exists(target_path):
            broken_links.append({
                "doc": doc_path,
                "marker": marker,
                "expected": target_path
            })

    return broken_links


def parse_impl_markers(content):
    """
    Extract IMPL: markers from document content.
    Patterns supported:
      - IMPL: path/to/file.py
      - `IMPL: path/to/file.py`
      - implements: path/to/file.py
    """
    patterns = [
        r'IMPL:\s*([^\s\n`]+)',
        r'implements:\s*([^\s\n`]+)',
    ]

    markers = []
    for pattern in patterns:
        markers.extend(re.findall(pattern, content))

    return markers
```

---

## ORPHAN DETECTION ALGORITHM

```python
def check_orphan_docs(project_root):
    """
    Find documentation without code references.
    Called by: cron:daily, post_refactor
    """

    # 1. Get all doc files
    doc_files = glob("docs/**/*.md")

    # 2. Get all code files with DOCS: markers
    code_docs_refs = {}
    for code_file in glob("**/*.{py,ts,js,go}"):
        docs_marker = extract_docs_marker(code_file)
        if docs_marker:
            code_docs_refs[docs_marker] = code_file

    orphans = []

    for doc in doc_files:
        # 3. Check if doc has valid IMPL: links
        impl_links = parse_impl_markers(read_file(doc))
        has_valid_impl = any(exists(link) for link in impl_links)

        # 4. Check if any code references this doc
        has_code_ref = doc in code_docs_refs

        # 5. If neither, it's orphan
        if not has_valid_impl and not has_code_ref:
            orphans.append({
                "doc": doc,
                "broken_impls": [l for l in impl_links if not exists(l)],
                "reason": "no_valid_references"
            })

    return orphans


def extract_docs_marker(code_file):
    """
    Extract DOCS: marker from code file header.
    Checks first 10 lines.
    """
    content = read_file(code_file)
    lines = content.split('\n')[:10]

    for line in lines:
        if 'DOCS:' in line:
            match = re.search(r'DOCS:\s*([^\s]+)', line)
            if match:
                return match.group(1)

    return None
```

---

## AUTO-RESOLUTION ALGORITHM

```python
def try_auto_resolve(broken_link):
    """
    Attempt to automatically fix a broken IMPL: link.
    Called when: broken link detected
    Returns: resolved_path or None
    """

    doc_path = broken_link["doc"]
    broken_marker = broken_link["marker"]

    # 1. Extract filename from broken path
    filename = os.path.basename(broken_marker)

    # 2. Search for file with same name
    candidates = glob(f"**/{filename}")

    if len(candidates) == 1:
        # 3a. Single match - high confidence
        new_path = candidates[0]
        update_impl_marker(doc_path, broken_marker, new_path)
        return new_path

    elif len(candidates) > 1:
        # 3b. Multiple matches - need disambiguation
        # Try to find best match by directory similarity
        best_match = find_best_path_match(broken_marker, candidates)
        if best_match and confidence(best_match) > 0.8:
            update_impl_marker(doc_path, broken_marker, best_match)
            return best_match

    # 4. No match or low confidence - escalate
    return None


def find_best_path_match(original, candidates):
    """
    Find candidate with most similar path structure.
    """
    original_parts = original.split('/')

    scores = []
    for candidate in candidates:
        candidate_parts = candidate.split('/')

        # Score based on matching path components
        common = len(set(original_parts) & set(candidate_parts))
        score = common / max(len(original_parts), len(candidate_parts))
        scores.append((candidate, score))

    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[0] if scores else None
```

---

## TASK CREATION ALGORITHM

```python
def create_link_task(problem):
    """
    Create task_run from detected problem.
    Called when: auto-resolution fails
    """

    # 1. Get task template
    if problem["type"] == "BROKEN_IMPL_LINK":
        template = load_task_template("TASK_fix_impl_link")
        nature = "importantly concerns"
    else:  # ORPHAN_DOCS
        template = load_task_template("TASK_fix_orphan_docs")
        nature = "concerns"

    # 2. Create task_run node
    task_run = create_node(
        node_type="narrative",
        type="task_run",
        nature=nature,
        content=f"""
        # Fix Link: {problem['doc']}

        Problem: {problem['type']}
        Document: {problem['doc']}
        Details: {problem.get('broken_impls', problem.get('marker', ''))}
        """,
        synthesis=f"Fix broken link in {problem['doc']}"
    )

    # 3. Create links
    create_link(task_run, template, nature="serves")
    create_link(task_run, problem["doc"], nature="concerns")
    create_link(task_run, problem["type"], nature="resolves")

    return task_run
```

---

## DECISION TREE

```
Document detected
|
+-- Parse IMPL: markers
|   |
|   +-- All resolve? -> healthy
|   +-- Some broken? -> try auto-resolve
|       |
|       +-- Auto-resolved? -> update doc, log
|       +-- Cannot resolve? -> BROKEN_IMPL_LINK task
|
+-- Check orphan status
    |
    +-- Has valid IMPL: links? -> not orphan
    +-- Has DOCS: refs from code? -> not orphan
    +-- Neither? -> ORPHAN_DOCS task

Task claimed by agent
|
+-- Load skill
+-- Start procedure
+-- For BROKEN_IMPL_LINK:
|   +-- Search for moved file
|   +-- Update or remove marker
|   +-- Update code DOCS: if needed
|
+-- For ORPHAN_DOCS:
|   +-- Search for related code
|   +-- If found: create links
|   +-- If not: archive/delete decision
|
+-- Validate
    +-- Pass -> complete
    +-- Fail -> retry/escalate
```
