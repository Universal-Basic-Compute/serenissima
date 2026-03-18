# Task: extract_constants

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Extract hardcoded magic values to named constants.

---

## Resolves

| Problem | Severity |
|---------|----------|
| MAGIC_VALUES | medium |

---

## Inputs

```yaml
inputs:
  target: file_path       # File with magic values
  values: string[]        # List of detected magic values
  problem: problem_id     # MAGIC_VALUES
```

---

## Outputs

```yaml
outputs:
  constants_file: path    # Path to constants file (or same file)
  constants_created: int  # Number of constants created
  occurrences_replaced: int # Number of replacements made
  tests_pass: bool        # Do tests still pass
```

---

## Executor

```yaml
executor:
  type: script
  script: extract_constants
  fallback: agent (voice, steward)
```

---

## Uses

```yaml
uses:
  skill: SKILL_refactor
```

---

## Process

1. **Identify** — List all magic values in file
2. **Name** — Generate descriptive constant names
3. **Create** — Add constant definitions to top of file or constants module
4. **Replace** — Substitute all occurrences with constant references
5. **Test** — Verify behavior unchanged

---

## Validation

Complete when:
1. All identified magic values extracted
2. Constants have descriptive names (SCREAMING_SNAKE_CASE)
3. All occurrences replaced
4. < 3 magic values remain in file
5. Tests pass
6. Health check no longer detects MAGIC_VALUES

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "concerns"

links:
  - nature: serves
    to: TASK_extract_constants
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: MAGIC_VALUES
```
