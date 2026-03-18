# Task: fix_naming

```
NODE: narrative:task
STATUS: active
```

---

## Purpose

Rename files, classes, functions, or variables to follow project naming conventions.

---

## Resolves

| Problem | Severity |
|---------|----------|
| NAMING_CONVENTION | low |

---

## Inputs

```yaml
inputs:
  target: file_path       # File with naming violations
  violations: string[]    # List of names and expected format
  problem: problem_id     # NAMING_CONVENTION
```

---

## Outputs

```yaml
outputs:
  renames_completed: int  # Number of renames done
  imports_updated: int    # Number of import statements updated
  references_updated: int # Number of references updated
  tests_pass: bool        # Do tests still pass
```

---

## Executor

```yaml
executor:
  type: script
  script: rename_to_convention
  fallback: agent (steward)
```

---

## Uses

```yaml
uses:
  skill: SKILL_refactor
```

---

## Process

1. **Identify** — List all naming violations
2. **Determine correct name** — Apply convention rules
3. **Rename** — Update the name at definition
4. **Update references** — Find and update all usages
5. **Update imports** — Fix import statements
6. **Test** — Verify nothing broken

---

## Naming Engineering Principles

Code and documentation files are written for agents first, so naming must make focus and responsibility explicit.

### Core Rules

1. **Include the work being done** — Use verb phrases or work nouns: "parser", "runner", "validator"
   - Good: `prompt_quality_validator.py`, `agent_task_runner.py`
   - Bad: `utils.py`, `helpers.py`, `misc.py`

2. **List multiple responsibilities explicitly** — When a file does multiple things, name them all
   - Good: `doctor_cli_parser_and_run_checker.py`
   - Bad: `doctor.py` (hides what it actually does)

3. **Hint at processing style** — Show both what and how
   - Good: `semantic_proximity_based_character_node_selector.py`
   - Bad: `selector.py`

4. **Keep filenames long (25-75 chars)** — Longer than typical human-led repos
   - Makes responsibility boundaries explicit at a glance
   - Helps agents locate correct file with minimal digging

### Language Conventions

**Python:**
- Files: `snake_case.py` (but descriptive, not terse)
- Classes: `PascalCase`
- Functions: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Variables: `snake_case`

**TypeScript/JavaScript:**
- Files: `kebab-case.ts` or `camelCase.ts`
- Classes: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Variables: `camelCase`

### Graph Node Naming

All node names follow: `TYPE_Name_Of_Node`

**Actor nodes:**
- Format: `AGENT_{Subtype}`
- Examples: `AGENT_Witness`, `AGENT_Fixer`, `AGENT_Architect`

**Narrative nodes:**
- Tasks: `TASK_{Name_Of_Task}` (e.g., `TASK_Fix_Naming`, `TASK_Add_Tests`)
- Issues: `ISSUE_{Type}_{Target}` (e.g., `ISSUE_Naming_Convention_Utils`)

**Moment nodes:**
- Format: `MOMENT_{Action}_{Target}_{Hash}`
- Example: `MOMENT_Assign_Agent_Witness_a3f2`

**Space nodes:**
- Format: `SPACE_{Name}` (e.g., `SPACE_Runtime`, `SPACE_Capabilities`)

**Thing nodes:**
- Format: `THING_{Name}` (e.g., `THING_Graph_Database`, `THING_Config_File`)

**Document files:**
- Format: `{DOC_TYPE}_{Module}_{Topic}.md`
- Examples: `PATTERNS_Agent_System.md`, `SYNC_Project_State.md`, `TASK_Fix_Naming.md`

---

## Validation

Complete when:
1. All violations fixed
2. All imports resolve
3. All references updated
4. No new naming violations introduced
5. Tests pass
6. Health check no longer detects NAMING_CONVENTION

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "optionally concerns"

links:
  - nature: serves
    to: TASK_fix_naming
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: NAMING_CONVENTION
```
