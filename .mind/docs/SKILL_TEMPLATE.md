# Skill: `mind.<verb>_<object>`
@mind:id: SKILL.<DOMAIN>.<ACTION>.<CONTEXT>

## Maps to VIEW
`<VIEW path or "(meta-skill)">`

---

## Context
<!-- Project-specific knowledge only. Define local terms. Show system integration. NO generic LLM knowledge. -->

---

## Purpose
<!-- One sentence, starts with verb. -->

---

## Inputs
```yaml
input_name: "<description>"  # type
```

## Outputs
```yaml
output_name:
  - "<artifact>"
```

---

## Gates
<!-- Verifiable conditions. "must X" not "should be good". Each gate has reason. -->

---

## Process
<!-- Steps with reasoning. Batch related questions. -->

### 1. <Step>
<!-- What + Why + How -->

---

## Protocols Referenced
<!-- Or state: "Knowledge-only skill, no protocols." -->

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:name` | condition | output |

---

## Membrane Integration
<!-- Optional: auto-trigger, auto-fetch context -->
```yaml
membrane_hook:
  trigger: "<condition>"
  protocol: "<name>"
  auto_fetch: []
  output: "<artifact>"
```

---

## Evidence
- Docs: `@mind:id + file + header`
- Code: `file + symbol`

## Markers
- `@mind:TODO`
- `@mind:escalation`
- `@mind:proposition`

## Never-stop
If blocked → `@mind:escalation` + `@mind:proposition` → proceed with proposition.
