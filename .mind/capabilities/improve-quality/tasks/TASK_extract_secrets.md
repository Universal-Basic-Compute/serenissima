# Task: extract_secrets

```
NODE: narrative:task
STATUS: active
PRIORITY: CRITICAL
```

---

## Purpose

Remove hardcoded secrets from code and replace with environment variable reads.

**CRITICAL:** This is a security issue. Must be resolved immediately.

---

## Resolves

| Problem | Severity |
|---------|----------|
| HARDCODED_SECRET | critical |

---

## Inputs

```yaml
inputs:
  target: file_path       # File with hardcoded secret
  patterns: string[]      # Secret patterns matched
  problem: problem_id     # HARDCODED_SECRET
```

---

## Outputs

```yaml
outputs:
  secrets_removed: int    # Number of secrets removed
  env_vars_added: string[] # Environment variable names created
  env_example_updated: bool # Was .env.example updated
  secret_rotated: bool    # Was the secret rotated (if committed)
  tests_pass: bool        # Do tests still pass
```

---

## Executor

```yaml
executor:
  type: script
  script: extract_secrets
  fallback: agent (fixer)
```

---

## Uses

```yaml
uses:
  skill: SKILL_refactor
```

---

## Process

1. **Identify** — Locate the exact secret in code
2. **Remove** — Delete the hardcoded value immediately
3. **Replace** — Add `os.environ.get("VAR_NAME")` or equivalent
4. **Document** — Add to .env.example with placeholder
5. **Protect** — Ensure .env is in .gitignore
6. **Rotate** — If secret was committed to git, rotate it
7. **Test** — Verify application works with env var

---

## Validation

Complete when:
1. No secret patterns detected in file
2. Environment variable read in place
3. .env.example has placeholder
4. .env is in .gitignore
5. Secret rotated if was committed
6. Tests pass
7. Health check no longer detects HARDCODED_SECRET

---

## Security Checklist

- [ ] Secret removed from source code
- [ ] Environment variable added
- [ ] .env.example updated
- [ ] .env in .gitignore
- [ ] Git history checked for exposure
- [ ] Secret rotated if exposed
- [ ] Incident documented in SYNC

---

## Instance (task_run)

Created by runtime when HEALTH.on_signal fires:

```yaml
node_type: narrative
type: task_run
nature: "urgently concerns"

links:
  - nature: serves
    to: TASK_extract_secrets
  - nature: concerns
    to: "{target}"
  - nature: resolves
    to: HARDCODED_SECRET
```
