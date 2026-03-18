# Fix Membrane — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: fix-membrane
```

---

## CHAIN

```
OBJECTIVES:      ./OBJECTIVES.md
PATTERNS:        ./PATTERNS.md
THIS:            VOCABULARY.md (you are here)
BEHAVIORS:       ./BEHAVIORS.md
ALGORITHM:       ./ALGORITHM.md
```

---

## PURPOSE

Terms and problems owned by this capability.

---

## TERMS

### membrane

The communication layer between agents and the Mind system. Exposed via MCP tools.

### procedure

A YAML-defined step-by-step dialogue for structured work. Lives in .mind/procedures/.

### step

A single action within a procedure. Has id, action, params, and optional condition.

### schema

The expected structure of a procedure file. Defines required and optional fields.

---

## PROBLEMS

### PROBLEM: MEMBRANE_NO_PROTOCOLS

```yaml
id: MEMBRANE_NO_PROTOCOLS
severity: critical
category: membrane

definition: |
  No procedure YAML files exist in .mind/procedures/.
  The membrane system has nothing to execute.

detection:
  - .mind/procedures/ directory exists
  - Zero .yaml files in directory
  - Or directory doesn't exist at all

resolves_with: TASK_create_procedures

examples:
  - "New project initialized without procedures"
  - "Procedures deleted accidentally"
  - "Wrong directory configured"
```

### PROBLEM: MEMBRANE_PARSE_ERROR

```yaml
id: MEMBRANE_PARSE_ERROR
severity: critical
category: membrane

definition: |
  A procedure YAML file has syntax errors that prevent it from being
  parsed. The procedure cannot be loaded or executed.

detection:
  - yaml.safe_load() raises exception
  - Error message contains line number
  - File exists but can't be parsed

resolves_with: TASK_fix_yaml_syntax

examples:
  - "Missing colon after field name"
  - "Wrong indentation level"
  - "Unquoted string with special characters"
  - "Merge conflict markers left in file"
```

### PROBLEM: MEMBRANE_INVALID_STEP

```yaml
id: MEMBRANE_INVALID_STEP
severity: high
category: membrane

definition: |
  A procedure step has invalid structure - missing required fields,
  wrong field types, or unknown action type.

detection:
  - Step missing 'id' field
  - Step missing 'action' field
  - Action value not in allowed list
  - Params has wrong type (not dict)

resolves_with: TASK_fix_step_structure

examples:
  - "Step has action but no id"
  - "Step params is string instead of dict"
  - "Action 'unknown_action' not registered"
```

### PROBLEM: MEMBRANE_MISSING_FIELDS

```yaml
id: MEMBRANE_MISSING_FIELDS
severity: high
category: membrane

definition: |
  A procedure definition is missing required fields like name, steps,
  or required metadata.

detection:
  - YAML parses but 'name' field missing
  - YAML parses but 'steps' field missing
  - 'steps' is empty list

resolves_with: TASK_add_missing_fields

examples:
  - "Procedure has steps but no name"
  - "Procedure template not fully filled in"
  - "Required field deleted accidentally"
```

---

## USAGE

```yaml
# In HEALTH.md
on_problem:
  problem_id: MEMBRANE_NO_PROTOCOLS
  creates:
    node:
      node_type: narrative
      type: task_run
      nature: "urgently concerns"
    links:
      - nature: "serves"
        to: TASK_create_procedures
      - nature: "resolves"
        to: MEMBRANE_NO_PROTOCOLS
```
