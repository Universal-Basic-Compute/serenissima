# TOUCHES: Where {Concept Name} Appears in the System

```
LAST_UPDATED: {DATE}
```

---

## MODULES THAT IMPLEMENT

| Module | What It Does With {Concept} |
|--------|------------------------------|
| `{area}/{module}` | {how it uses/implements the concept} |
| `{area}/{module}` | {how it uses/implements the concept} |
| `{area}/{module}` | {how it uses/implements the concept} |

---

## INTERFACES

### {area}/{module}

**Functions:**
- `{function_name}()` — {what it does with this concept}
- `{function_name}()` — {what it does}

**Relevant docs:**
- `docs/{area}/{module}/PATTERNS_*.md`

### {area}/{module}

**Functions:**
- `{function_name}()` — {what it does}

**Relevant docs:**
- `docs/{area}/{module}/PATTERNS_*.md`

---

## DEPENDENCIES

How the concept flows through modules:

```
{module that defines} (defines/creates)
         ↓
{module that transforms} (uses/transforms)
         ↓
{module that consumes} (consumes/displays)
```

---

## INVARIANTS ACROSS MODULES

{What must be true about this concept everywhere?}

- **I1:** {cross-module invariant}
- **I2:** {cross-module invariant}

---

## CONFLICTS / TENSIONS

{Any places where modules disagree about this concept?}
{Any unresolved design tensions?}

---

## SYNC

```
LAST_VERIFIED: {DATE}
ALL_MODULES_ALIGNED: YES | NO
CONFLICTS: {list any disagreements}
```

---

## WHEN TO UPDATE THIS FILE

Update TOUCHES when:
- A new module starts using this concept
- A module changes how it uses this concept
- Dependencies between modules change
- New interfaces are added
