# Fix Membrane — Algorithm

```
STATUS: CANONICAL
CAPABILITY: fix-membrane
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

How fix-membrane works — detection, repair, validation.

---

## DETECTION ALGORITHM

```python
def check_membrane_health(mind_dir):
    """
    Check all procedure files for validity.
    Called by: init_scan, cron:daily, file_watch
    """

    procedures_dir = mind_dir / "procedures"
    problems = []

    # 1. Check procedures directory exists
    if not procedures_dir.exists():
        problems.append({
            "type": "MEMBRANE_NO_PROTOCOLS",
            "severity": "critical",
            "target": str(procedures_dir)
        })
        return problems  # Can't check files if dir missing

    # 2. Find all YAML files
    yaml_files = list(procedures_dir.glob("*.yaml"))

    if not yaml_files:
        problems.append({
            "type": "MEMBRANE_NO_PROTOCOLS",
            "severity": "critical",
            "target": str(procedures_dir)
        })
        return problems

    # 3. Check each file
    for yaml_file in yaml_files:
        file_problems = check_procedure_file(yaml_file)
        problems.extend(file_problems)

    return problems


def check_procedure_file(path):
    """
    Check single procedure file for all error types.
    """
    problems = []

    # Layer 1: Can we parse it?
    try:
        with open(path) as f:
            content = yaml.safe_load(f)
    except yaml.YAMLError as e:
        problems.append({
            "type": "MEMBRANE_PARSE_ERROR",
            "severity": "critical",
            "target": str(path),
            "error": str(e),
            "line": getattr(e, 'problem_mark', {}).get('line', None)
        })
        return problems  # Can't check structure if parse fails

    # Layer 2: Required fields present?
    required_fields = ['name', 'steps']
    missing_fields = [f for f in required_fields if f not in content]

    if missing_fields:
        problems.append({
            "type": "MEMBRANE_MISSING_FIELDS",
            "severity": "high",
            "target": str(path),
            "missing": missing_fields
        })

    # Empty steps is also a problem
    if 'steps' in content and not content['steps']:
        problems.append({
            "type": "MEMBRANE_MISSING_FIELDS",
            "severity": "high",
            "target": str(path),
            "missing": ["steps (empty)"]
        })
        return problems  # Can't check steps if none exist

    # Layer 3: Steps valid?
    if 'steps' in content and content['steps']:
        for i, step in enumerate(content['steps']):
            step_problems = validate_step(step, i, path)
            problems.extend(step_problems)

    return problems


def validate_step(step, index, path):
    """
    Validate single step structure.
    """
    problems = []

    # Required step fields
    if 'id' not in step:
        problems.append({
            "type": "MEMBRANE_INVALID_STEP",
            "severity": "high",
            "target": str(path),
            "step_index": index,
            "issue": "missing 'id' field"
        })

    if 'action' not in step and 'name' not in step:
        problems.append({
            "type": "MEMBRANE_INVALID_STEP",
            "severity": "high",
            "target": str(path),
            "step_index": index,
            "issue": "missing 'action' or 'name' field"
        })

    # Type checks
    if 'params' in step and not isinstance(step['params'], dict):
        problems.append({
            "type": "MEMBRANE_INVALID_STEP",
            "severity": "high",
            "target": str(path),
            "step_index": index,
            "issue": f"'params' should be dict, got {type(step['params']).__name__}"
        })

    return problems
```

---

## REPAIR ALGORITHM

```python
def fix_yaml_syntax(path, error):
    """
    Attempt to fix common YAML syntax errors.
    Called when: MEMBRANE_PARSE_ERROR detected
    """

    with open(path) as f:
        lines = f.readlines()

    line_num = error.get('line', 0)

    # Common fixes by error pattern
    error_msg = error.get('error', '')

    if 'expected \":\"' in error_msg:
        # Missing colon after key
        line = lines[line_num]
        # Find first word, add colon after it
        fixed = add_missing_colon(line)
        lines[line_num] = fixed

    elif 'mapping values' in error_msg:
        # Indentation issue
        # Try to fix by aligning with previous line
        fixed = fix_indentation(lines, line_num)
        lines[line_num] = fixed

    elif '<<<<<<' in error_msg or '======' in lines[line_num]:
        # Merge conflict markers
        # Remove conflict markers, keep ours
        lines = remove_merge_conflicts(lines)

    else:
        # Unknown error - escalate
        return {"success": False, "reason": "Unknown error pattern"}

    # Write fixed content
    with open(path, 'w') as f:
        f.writelines(lines)

    # Re-validate
    try:
        with open(path) as f:
            yaml.safe_load(f)
        return {"success": True}
    except yaml.YAMLError as e:
        return {"success": False, "reason": str(e)}


def add_missing_fields(path, missing):
    """
    Add missing required fields to procedure.
    Called when: MEMBRANE_MISSING_FIELDS detected
    """

    with open(path) as f:
        content = yaml.safe_load(f) or {}

    # Load template for defaults
    template = load_template("PROCEDURE_TEMPLATE.yaml")

    for field in missing:
        if field == 'name':
            # Derive from filename
            content['name'] = path.stem.replace('_', ' ')
        elif field == 'steps':
            # Add empty steps list with placeholder
            content['steps'] = [
                {'id': 'placeholder', 'action': 'noop', 'name': 'TODO: Add steps'}
            ]
        elif field in template:
            content[field] = template[field]

    # Write back
    with open(path, 'w') as f:
        yaml.dump(content, f, default_flow_style=False)

    return {"success": True, "added": missing}


def fix_step_structure(path, step_index, issue):
    """
    Fix invalid step structure.
    Called when: MEMBRANE_INVALID_STEP detected
    """

    with open(path) as f:
        content = yaml.safe_load(f)

    step = content['steps'][step_index]

    if 'missing' in issue and 'id' in issue:
        # Generate id from action or index
        step['id'] = step.get('action', f'step_{step_index}')

    if 'missing' in issue and 'action' in issue:
        # Default to noop
        step['action'] = 'noop'

    if 'params' in issue and 'dict' in issue:
        # Wrap in dict if string
        if isinstance(step['params'], str):
            step['params'] = {'value': step['params']}

    content['steps'][step_index] = step

    with open(path, 'w') as f:
        yaml.dump(content, f, default_flow_style=False)

    return {"success": True, "fixed_step": step_index}
```

---

## CREATION ALGORITHM

```python
def create_procedures(mind_dir):
    """
    Copy procedure templates to project.
    Called when: MEMBRANE_NO_PROTOCOLS detected
    """

    procedures_dir = mind_dir / "procedures"
    procedures_dir.mkdir(exist_ok=True)

    # Source templates
    template_dir = get_template_dir() / "procedures"

    created = []

    for template_file in template_dir.glob("*.yaml"):
        dest = procedures_dir / template_file.name

        if not dest.exists():
            shutil.copy(template_file, dest)
            created.append(str(dest))

    # Validate all created
    for path in created:
        problems = check_procedure_file(Path(path))
        if problems:
            return {
                "success": False,
                "created": created,
                "validation_errors": problems
            }

    return {"success": True, "created": created}
```

---

## DECISION TREE

```
Procedure file detected
|
+-- Can parse YAML?
|   +-- No -> MEMBRANE_PARSE_ERROR -> attempt syntax fix
|   |         +-- Fix succeeded? -> re-validate
|   |         +-- Fix failed? -> escalate to human
|   |
|   +-- Yes -> Check structure
|       +-- Has 'name'?
|       |   +-- No -> MEMBRANE_MISSING_FIELDS -> add name
|       +-- Has 'steps'?
|       |   +-- No -> MEMBRANE_MISSING_FIELDS -> add steps
|       |   +-- Empty? -> MEMBRANE_MISSING_FIELDS -> add placeholder
|       |   +-- Yes -> Validate each step
|       |       +-- Step has 'id'?
|       |       |   +-- No -> MEMBRANE_INVALID_STEP -> add id
|       |       +-- Step has 'action'?
|       |       |   +-- No -> MEMBRANE_INVALID_STEP -> add action
|       |       +-- Params valid type?
|       |           +-- No -> MEMBRANE_INVALID_STEP -> fix type
|       +-- All valid -> healthy

No procedures exist
|
+-- MEMBRANE_NO_PROTOCOLS -> copy templates
```
