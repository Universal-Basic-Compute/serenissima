# Skill: write_tests

```
NODE: narrative:skill
STATUS: active
```

---

## Purpose

Agent skill for writing tests from invariants with VALIDATES markers.

---

## Gates

Prerequisites before using this skill:

```yaml
gates:
  - Agent can read VALIDATION.md files
  - Agent can write Python test code
  - pytest available in environment
  - Target module exists and has code
  - VALIDATION.md exists for target (or invariant is specified)
```

---

## Process

```yaml
process:
  1. Read invariants
     - Load VALIDATION.md for target module
     - Extract invariant definitions (V1, V2, etc.)
     - Understand what each invariant asserts

  2. For each invariant to test:
     a. Analyze the invariant
        - What condition must hold?
        - What inputs trigger the condition?
        - What would violate it?

     b. Design test case
        - Setup: create necessary state
        - Action: trigger the behavior
        - Assert: verify invariant holds

     c. Write test function
        - Name: test_{module}_{invariant_description}
        - Docstring: explain what's being tested
        - VALIDATES marker in docstring or comment

  3. Structure test file
     - Imports at top
     - Fixtures if needed
     - One test per invariant (or logical group)
     - VALIDATES marker for each test

  4. Run tests
     - pytest {test_file} --tb=short
     - All tests must pass
     - Fix any failures before completing

  5. Verify coverage
     - Check all target invariants have VALIDATES
     - Confirm markers reference correct IDs
```

---

## VALIDATES Marker Format

```python
def test_auth_token_required():
    """
    Test that API endpoints require valid auth token.

    VALIDATES: V1
    """
    # ... test code ...


# Alternative: comment style
def test_data_integrity():
    # VALIDATES: V2
    # ... test code ...
```

---

## Tips

- Read existing tests in the module first (if any)
- Match test style to existing codebase conventions
- One invariant per test function keeps things clear
- Use descriptive test names (not just test_1, test_2)
- Include edge cases that could violate invariants
- Run tests multiple times to catch flaky issues

---

## Common Patterns

### Testing "must not" invariants

```python
def test_null_not_allowed():
    """
    VALIDATES: V3 - Input field must not be null
    """
    with pytest.raises(ValueError):
        process_input(None)
```

### Testing "must always" invariants

```python
def test_auth_always_checked():
    """
    VALIDATES: V1 - Auth check runs on every request
    """
    response = client.get("/protected", headers={})
    assert response.status_code == 401
```

### Testing state invariants

```python
def test_balance_non_negative():
    """
    VALIDATES: V5 - Account balance never goes negative
    """
    account = Account(balance=100)
    with pytest.raises(InsufficientFunds):
        account.withdraw(150)
    assert account.balance >= 0
```

---

## Executes

```yaml
executes:
  procedure: PROCEDURE_add_tests
```

---

## Used By

```yaml
used_by:
  tasks:
    - TASK_add_tests
    - TASK_test_invariant
    - TASK_add_validates_markers
```
