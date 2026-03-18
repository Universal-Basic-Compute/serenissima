# Skill: `mind.author_skills`
@mind:id: SKILL.META.AUTHOR_SKILLS.STRUCTURE_AND_QUALITY

## Maps to VIEW
`(meta-skill; guides creation of other skills)`

---

## Context

Skills = contextual knowledge (project-specific, not generic LLM knowledge).

Contains: local conventions, domain quirks, historical decisions, integration points, terminology definitions.

```
Skill (contextual knowledge) → Protocol (procedure) → Membrane (executor) → Graph (nodes + links)
```

Structure requirements:
- No gates → "done" ambiguous
- No never-stop → work halts on ambiguity
- No inputs/outputs → scope unclear
- No reasoning → cargo-cult execution

---

## Pre-flight

Check existing skills before creating:
```yaml
queries:
  - "MATCH (s:Skill) WHERE s.domain CONTAINS '{domain}' RETURN s"
  - "MATCH (p:Protocol) WHERE p.domain = '{domain}' RETURN p"
```

If overlap exists → extend, don't duplicate.

---

## Purpose
Write skill documents that are actionable, verifiable, and maintain work conservation.

---

## Inputs
```yaml
domain: "<area>"                     # string
capability: "<what this enables>"    # string
protocols_available: []              # list of protocol names
existing_skills: "<query result>"    # to avoid duplication
```

## Outputs
```yaml
skill_document:
  path: "skills/SKILL_<Verb>_<Object>_<Context>.md"
  required_sections: [context, purpose, inputs, outputs, gates, process, protocols, never_stop]
```

---

## Gates

**Naming:**
- Skill name: `mind.<verb>_<object>`
- File: `SKILL_<Verb>_<Object>_<Context>.md`

**Content:**
- Purpose = one sentence, starts with verb
- Every rule has reasoning
- Define project-specific terms used
- Specify protocols (or "knowledge-only")

**Work conservation:**
- Include never-stop rule
- Specify blocked → escalate → propose → continue

---

## Process

### 1. Identify need
```yaml
batch_questions:
  - capability: "What can someone DO after reading this?"
  - gap: "What knowledge is missing/scattered?"
  - failures: "What mistakes happen without this?"
  - exists: "What existing skills/docs overlap?"
  - protocols: "What protocols will this guide?"
```
Concrete > vague. "Verify health coverage for HIGH validations" > "check health stuff".

### 2. Write context section
Include only project-specific knowledge. Define local terms. Show system integration.

### 3. Define boundaries
Typed inputs. Concrete output artifacts. Explicit out-of-scope.

### 4. Set gates
Verifiable ("must have X" not "should be good"). Minimal (too many = overhead). Each gate has reason.

### 5. Reference protocols
```yaml
protocols:
  - name: "protocol:explore_space"
    when: "First, to understand current state"
    creates: "exploration moment"
```
Order matters. Prerequisites matter.

### 6. Never-stop rule
```
If blocked → @mind:escalation + @mind:proposition → proceed with proposition
```

---

## Complexity Tiers

| Tier | Use | Sections |
|------|-----|----------|
| Atomic | Single action | Context, Purpose, Gates, Never-stop |
| Compound | Multi-step, calls protocols | + Process, Protocols |
| Meta | Creates other artifacts | + Full reasoning |

---

## Signals: Overcomplicating

| Signal | Action |
|--------|--------|
| >5 gates | Split skill |
| >10 process steps | Extract sub-skills |
| >7 inputs | Narrow scope |

---

## Membrane Integration

```yaml
membrane_hook:
  trigger: "Doctor detects capability gap"
  protocol: "protocol:author_skill"  # NOT YET IMPLEMENTED
  auto_fetch:
    - detected_gap
    - related_protocols
    - related_skills
  output: "SKILL_*.md"
```

Doctor finds gap → triggers protocol → protocol gathers context from graph → creates skill systematically.

---

## Procedures Referenced

| Protocol | When | Creates |
|----------|------|---------|
| `protocol:explore_space` | Before creating | exploration moment |
| `protocol:author_skill` | To create skill | SKILL_*.md (NOT YET IMPLEMENTED) |

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
