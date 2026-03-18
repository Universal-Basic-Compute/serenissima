# Implement Code — Vocabulary

```
STATUS: CANONICAL
CAPABILITY: implement-code
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

### stub

A function or method with a placeholder body: `pass`, `...`, or `raise NotImplementedError`. Defined but not implemented.

### incomplete implementation

Code with TODO, FIXME, XXX, or HACK markers indicating unfinished work.

### algorithm documentation

ALGORITHM.md — explains HOW code works: pseudocode, data flows, decision trees. Distinct from IMPLEMENTATION.md which explains WHERE code lives.

### stale documentation

Documentation that describes an old version of the code. LAST_UPDATED is older than recent code changes.

---

## PROBLEMS

### PROBLEM: STUB_IMPL

```yaml
id: STUB_IMPL
severity: critical
category: impl

definition: |
  An implementation file contains stub code — functions that exist but
  have placeholder implementations like `pass`, `TODO`, `raise NotImplementedError`,
  or empty bodies.

detection:
  - Function body is only `pass`
  - Function body is only `...`
  - Function body is `raise NotImplementedError`
  - Function body is empty (except docstring)

resolves_with: TASK_implement_stub

examples:
  - "def calculate_score(self): pass"
  - "def process_data(self): raise NotImplementedError()"
  - "def validate(self): ..."
```

### PROBLEM: INCOMPLETE_IMPL

```yaml
id: INCOMPLETE_IMPL
severity: high
category: impl

definition: |
  An implementation file has partial code — some functions are complete
  but others are marked incomplete or have TODO comments indicating
  unfinished work.

detection:
  - Line contains "TODO" or "TODO:"
  - Line contains "FIXME" or "FIXME:"
  - Line contains "XXX" or "HACK"
  - Code block has partial logic with comment "# incomplete"

resolves_with: TASK_complete_impl

examples:
  - "# TODO: handle edge case"
  - "# FIXME: this is broken for negative values"
  - "return None  # XXX: stub response"
```

### PROBLEM: UNDOC_IMPL

```yaml
id: UNDOC_IMPL
severity: high
category: impl

definition: |
  An IMPLEMENTATION.md file exists but there is no corresponding ALGORITHM.md
  explaining how the code works. The "where" is documented but not the "how".

detection:
  - docs/{module}/IMPLEMENTATION.md exists
  - docs/{module}/ALGORITHM.md does NOT exist
  - Or ALGORITHM.md exists but is a stub

resolves_with: TASK_document_impl

examples:
  - "docs/auth/IMPLEMENTATION.md exists, docs/auth/ALGORITHM.md missing"
  - "ALGORITHM.md has STATUS: STUB"
```

### PROBLEM: STALE_IMPL

```yaml
id: STALE_IMPL
severity: medium
category: impl

definition: |
  Code has changed (per git history) but the corresponding documentation
  has not been updated. The docs describe an old version of the implementation.

detection:
  - Git shows code file modified more recently than linked doc
  - IMPLEMENTATION.md LAST_VERIFIED older than code mtime
  - ALGORITHM.md describes behavior that code no longer exhibits

resolves_with: TASK_update_impl_docs

examples:
  - "src/auth/login.py modified yesterday, ALGORITHM.md unchanged for 30 days"
  - "New parameter added to function, not in ALGORITHM pseudocode"
```

---

## USAGE

```yaml
# In HEALTH.md
on_signal:
  critical:
    action: create_task_run
    params:
      problem: STUB_IMPL
      template: TASK_implement_stub
      target: "{file_path}"
      functions: "{stub_functions}"
      nature: "urgently concerns"
```
