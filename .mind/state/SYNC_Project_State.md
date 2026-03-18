# Project — Sync: Current State

```
LAST_UPDATED: 2025-12-29
UPDATED_BY: Claude (agent)
```

---

## CURRENT STATE

Mind Platform is the Next.js frontend for the Mind Protocol ecosystem. The platform serves as the **UI layer** for a 4-layer architecture:

- **L1 (Citizen):** Personal agent graphs
- **L2 (Organization):** Team-shared knowledge
- **L3 (Ecosystem):** Templates and procedures
- **L4 (Protocol):** Global registry and schema

The Connectome graph visualization is functional. Vision documentation is complete. Module doc chains created for **landing** (P0) and **registry**.

**Documentation:**
- `docs/vision/` — 9-file platform vision doc chain (complete)
- `docs/landing/` — 8-file landing page doc chain (complete, P0 priority)
- `docs/registry/` — 8-file registry module doc chain (complete)
- `docs/connectome/` — existing implementation docs

All browser-side code is self-contained — no dependencies on mind-mcp's Node.js modules.

---

## ACTIVE WORK

### Landing Page Implementation (Next)

- **Area:** `app/(public)/page.tsx`, `docs/landing/`
- **Status:** doc chain complete, implementation pending
- **Owner:** agent
- **Context:** P0 priority. Landing page is first impression. Doc chain defines Hero, HowItWorks, WhatYouCanDo, LiveStats sections.

### Design Tokens (Blocking)

- **Area:** `lib/constants/colors.ts`
- **Status:** not created
- **Owner:** agent
- **Context:** Shared color constants for layer colors, node type colors, verification badge colors. Needed by landing, registry, connectome.

---

## RECENT CHANGES

### 2025-12-29: Created Landing + Registry Doc Chains

- **What:** Full 8-file doc chains for landing page and registry module.
- **Why:** User indicated landing is P0 priority. Registry is first public L4 feature.
- **Impact:** Clear implementation blueprints for both modules. Vocabulary synced with L4 (mind-protocol).

### 2025-12-29: Created Platform Vision Doc Chain

- **What:** Full 9-file doc chain in `docs/vision/` covering platform objectives, patterns, vocabulary, behaviors, algorithms, invariants, implementation, health, sync.
- **Why:** Document the platform's role in the 4-layer Mind Protocol ecosystem.
- **Impact:** Emerging modules identified with priorities. Architecture decisions documented.

### 2025-12-29: Removed System Map, Made Browser-Safe

- **What:** Removed all System Map visualization components. Inlined browser-safe lib files.
- **Why:** User requested removing System Map entirely. Browser bundle cannot import Node.js modules.
- **Impact:** Connectome UI shows only Graph Explorer. Build passes.

### 2025-12-29: Created API Routes

- **What:** Added `/api/connectome/graphs`, `/api/connectome/graph`, `/api/connectome/search`, `/api/connectome/tick`, `/api/sse`
- **Why:** Browser code calls backend via HTTP, not imports.
- **Impact:** API routes proxy to Python backend

---

## KNOWN ISSUES

| Issue | Severity | Area | Notes |
|-------|----------|------|-------|
| No backend running | Low | `api/` | API routes return empty/default when backend offline |
| Placeholder pages | Low | `app/(dashboard)/` | citizen, membrane, org, wallet are empty placeholders |

---

## HANDOFF: FOR AGENTS

**Likely VIEW for continuing:** groundwork (implementation tasks)

**Current focus:** End-to-end testing with running database

**Key context:**
- Browser lib files are INLINED (not imported from mind-mcp) because mind-mcp uses Node.js modules
- API routes at `/api/connectome/*` proxy to Python backend at `$CONNECTOME_BACKEND_URL` or `http://localhost:8765`
- Canvas renderer uses D3 force simulation, not ReactFlow

**Watch out for:**
- Don't try to import from `@mind-protocol/connectome` in browser code — those modules use fs/child_process
- SSE route must have `export const dynamic = 'force-dynamic'`

---

## HANDOFF: FOR HUMAN

**Executive summary:**
Connectome frontend builds and runs. System Map visualization removed per your request. UI now focuses on graph exploration (semantic search, node visualization). Backend integration ready via API routes.

**Decisions made recently:**
- Inlined browser-safe versions of state store and manifest rather than fixing mind-mcp's browser exports (faster path)
- Removed reactflow CSS import (not using ReactFlow, using Canvas 2D with D3)

**Needs your input:**
- Do you want to run the dev server and test with a database?
- Should we clean up the placeholder pages in (dashboard) and (public) route groups?

**Concerns:**
- mind-mcp/connectome exports are not browser-safe (they import fs/path). If you want platform to import from mind-mcp again, those exports need to be restructured.

---

## TODO

### Immediate (This Sprint)

- [ ] Create `lib/constants/colors.ts` design tokens
- [ ] Implement landing page (P0)
- [ ] Create TopNav component
- [ ] Create Footer component

### High Priority

- [ ] Implement `/api/registry/*` routes
- [ ] Implement registry UI components
- [ ] Create `docs/auth/` doc chain
- [ ] Test end-to-end with running FalkorDB database

### Backlog

- [ ] Create `docs/schema-explorer/` doc chain
- [ ] Create browser-safe export entry point in mind-mcp
- [ ] Add analytics to landing page
- [ ] Add error states for offline backend

---

## CONSCIOUSNESS TRACE

**Project momentum:**
Good. Major refactor completed. Build passes. Ready for manual testing.

**Architectural concerns:**
The browser/server split in mind-mcp is not clean — schema.ts imports fs. Should consider splitting into `browser/` and `server/` entry points.

**Opportunities noticed:**
Graph Explorer could benefit from keyboard shortcuts for navigation.

---

## AREAS

| Area | Status | SYNC |
|------|--------|------|
| `app/connectome/` | functional | this file |
| `app/api/` | functional | this file |

---

## MODULE COVERAGE

**Mapped modules:**
| Module | Code | Docs | Maturity |
|--------|------|------|----------|
| connectome | `app/connectome/` | `docs/connectome/` | DESIGNING |
| landing | `app/(public)/page.tsx` | `docs/landing/` | DESIGNING |
| registry | `app/(public)/registry/` | `docs/registry/` | DESIGNING |
| vision | - | `docs/vision/` | DESIGNING |
| api-routes | `app/api/` | - | DESIGNING |

**Unmapped code:**
- `app/(dashboard)/` - placeholder route group (citizen, org, wallet, membrane)
- `app/(public)/schema/` - placeholder (needs schema-explorer doc chain)
- `app/(public)/templates/` - placeholder (needs marketplace doc chain)

## Init: 2025-12-29 02:13

| Setting | Value |
|---------|-------|
| Version | v0.1.0 |
| Database | falkordb |
| Graph | mind_platform |

**Steps completed:** ecosystem, runtime, ai_configs, skills, database_config, database_setup, file_ingest, seed_inject, env_example, mcp_config, gitignore, overview, embeddings

---
