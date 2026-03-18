# Sync State — Algorithm

```
STATUS: CANONICAL
CAPABILITY: sync-state
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

How sync-state works — detection, resolution, validation.

---

## STALE SYNC DETECTION ALGORITHM

```python
def check_sync_freshness(project_root, threshold_days=14):
    """
    Scan SYNC files for staleness.
    Called by: cron:daily, mind doctor
    """
    from datetime import datetime, timedelta

    stale_syncs = []
    threshold = datetime.now() - timedelta(days=threshold_days)

    # Find all SYNC files
    for sync_path in glob(project_root / "docs/**/SYNC*.md"):
        content = read(sync_path)

        # Extract LAST_UPDATED
        match = re.search(r'LAST_UPDATED:\s*(\d{4}-\d{2}-\d{2})', content)
        if not match:
            # No date = stale
            stale_syncs.append({
                "path": sync_path,
                "last_updated": None,
                "days_stale": "unknown"
            })
            continue

        last_updated = datetime.strptime(match.group(1), "%Y-%m-%d")
        if last_updated < threshold:
            stale_syncs.append({
                "path": sync_path,
                "last_updated": last_updated,
                "days_stale": (datetime.now() - last_updated).days
            })

    return stale_syncs
```

---

## YAML DRIFT DETECTION ALGORITHM

```python
def check_yaml_drift(project_root):
    """
    Compare modules.yaml to actual directory structure.
    Called by: cron:daily, file_watch on docs/, mind doctor
    """

    # 1. Get modules from YAML
    yaml_path = project_root / ".mind" / "modules.yaml"
    if not exists(yaml_path):
        return {"error": "modules.yaml not found"}

    yaml_modules = set(parse_yaml(yaml_path).get("modules", []))

    # 2. Get modules from file system
    docs_path = project_root / "docs"
    fs_modules = set()

    for item in docs_path.iterdir():
        if item.is_dir() and not item.name.startswith('.'):
            # Check if it's a module (has at least SYNC or PATTERNS)
            if (item / "SYNC.md").exists() or (item / "PATTERNS.md").exists():
                fs_modules.add(item.name)

    # 3. Compare
    missing_from_yaml = fs_modules - yaml_modules
    extra_in_yaml = yaml_modules - fs_modules

    if missing_from_yaml or extra_in_yaml:
        return {
            "drifted": True,
            "missing_from_yaml": list(missing_from_yaml),
            "extra_in_yaml": list(extra_in_yaml)
        }

    return {"drifted": False}
```

---

## INGESTION GAP DETECTION ALGORITHM

```python
def check_ingestion_coverage(project_root, graph):
    """
    Compare docs on disk to nodes in graph.
    Called by: mind doctor, mind sync
    """

    # 1. Get all doc files from disk
    docs_on_disk = set()
    for doc_path in glob(project_root / "docs/**/*.md"):
        # Normalize to relative path
        rel_path = doc_path.relative_to(project_root)
        docs_on_disk.add(str(rel_path))

    # 2. Query graph for doc nodes
    docs_in_graph = set()
    result = graph.query("""
        MATCH (n:Thing)
        WHERE n.type = 'doc' OR n.type STARTS WITH 'doc_'
        RETURN n.path AS path
    """)
    for row in result:
        if row["path"]:
            docs_in_graph.add(row["path"])

    # 3. Find gaps
    not_ingested = docs_on_disk - docs_in_graph

    return {
        "on_disk": len(docs_on_disk),
        "in_graph": len(docs_in_graph),
        "not_ingested": list(not_ingested)
    }
```

---

## BLOCKER DETECTION ALGORITHM

```python
def check_blocked_modules(project_root):
    """
    Find modules with STATUS: BLOCKED in SYNC.
    Called by: mind status, mind doctor
    """

    blocked = []

    for sync_path in glob(project_root / "docs/**/SYNC*.md"):
        content = read(sync_path)

        # Check for BLOCKED status
        match = re.search(r'STATUS:\s*BLOCKED', content, re.IGNORECASE)
        if match:
            # Extract module name from path
            module = sync_path.parent.name

            # Try to find blocker description
            blocker_match = re.search(
                r'(?:BLOCKED|Blocker)[:\s]+([^\n]+)',
                content
            )
            blocker_reason = blocker_match.group(1) if blocker_match else "Unknown"

            # Check how long blocked
            updated_match = re.search(
                r'LAST_UPDATED:\s*(\d{4}-\d{2}-\d{2})',
                content
            )

            blocked.append({
                "module": module,
                "path": sync_path,
                "reason": blocker_reason,
                "since": updated_match.group(1) if updated_match else None
            })

    return blocked
```

---

## SYNC UPDATE ALGORITHM

```python
def update_sync(sync_path, agent):
    """
    Update a stale SYNC file with current state.
    Called by: agent executing TASK_update_sync
    """

    # 1. Get module from path
    module = sync_path.parent.name

    # 2. Check git log for recent changes
    recent_changes = git_log(
        path=sync_path.parent.parent,  # Module code path
        since="14 days ago"
    )

    # 3. Load current SYNC
    current_content = read(sync_path)

    # 4. Parse sections
    sections = parse_sync_sections(current_content)

    # 5. Update with new info
    sections["LAST_UPDATED"] = today()
    sections["UPDATED_BY"] = agent.id

    if recent_changes:
        sections["RECENT_CHANGES"].insert(0, {
            "date": today(),
            "what": agent.summarize(recent_changes),
            "files": [c.file for c in recent_changes[:5]]
        })

    # 6. Write updated SYNC
    new_content = render_sync_template(sections)
    write(sync_path, new_content)

    return {"updated": True, "path": sync_path}
```

---

## YAML REGENERATION ALGORITHM

```python
def regenerate_modules_yaml(project_root):
    """
    Regenerate modules.yaml from file system.
    Called by: script or agent executing TASK_regenerate_yaml
    """

    docs_path = project_root / "docs"
    modules = []

    # 1. Scan for modules
    for item in sorted(docs_path.iterdir()):
        if not item.is_dir() or item.name.startswith('.'):
            continue

        # Check if valid module
        has_patterns = (item / "PATTERNS.md").exists()
        has_sync = (item / "SYNC.md").exists()

        if has_patterns or has_sync:
            modules.append({
                "name": item.name,
                "path": str(item.relative_to(project_root)),
                "status": extract_status(item)
            })

    # 2. Build YAML structure
    yaml_content = {
        "version": "1.0",
        "generated": today(),
        "modules": modules
    }

    # 3. Write
    yaml_path = project_root / ".mind" / "modules.yaml"
    write_yaml(yaml_path, yaml_content)

    return {"regenerated": True, "module_count": len(modules)}
```

---

## DECISION TREE

```
Health check runs
│
├── Check SYNC freshness
│   ├── LAST_UPDATED > 14 days ago → STALE_SYNC → task_run
│   └── Fresh → OK
│
├── Check modules.yaml drift
│   ├── Mismatch with fs → YAML_DRIFT → task_run
│   └── Matches → OK
│
├── Check ingestion coverage
│   ├── Docs not in graph → DOCS_NOT_INGESTED → task_run
│   └── All ingested → OK
│
└── Check blocked modules
    ├── STATUS: BLOCKED → MODULE_BLOCKED → task_run
    └── Not blocked → OK

Task claimed
│
├── STALE_SYNC → Run update_sync procedure
├── YAML_DRIFT → Run regenerate_yaml (script or procedure)
├── DOCS_NOT_INGESTED → Run ingest_docs (script or procedure)
└── MODULE_BLOCKED → Agent investigates, resolves or escalates
```
