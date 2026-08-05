# Project — Sync: Current State

```
LAST_UPDATED: 2026-08-03
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

### Cascade website rebuilt — the $5000 proof of value (2026-08-05)

- **What:** `rialto_cascade-platform/ponte-di-rialto_landing_page/MerchantPrince/cascade-website/`
  regenerated from `generate_cascade_site_pages.py` (single source of truth — edit the
  COMPANIES data there, rerun to rebuild): honest index.html + one page per company
  (CASCADE platform + the 9 Fondaco businesses), each with pitch, priced services,
  Now/Next/Later roadmap, deck link (CASCADE) or "on request", mailto CTA to NLR.
- **Honesty rule enforced:** the old site's fabricated counters ("€47,832 generated
  today", script.js) are deleted. "What's real today" section only lists repo-traceable
  facts. TherapyKin page disclaims medical care; Elite Investor disclaims financial advice.
- **Offers (from the Signoria decree):** Chronicle $15/mo, City Pulse Report $50,
  Multi-Perspective Analysis $150 (48h) — prepaid, human-reviewed before delivery.
- **Verified:** served via `.claude/launch.json` entry `cascade-site`
  (http.server :8899); index + company pages render with working links and prices.
- **@mind:TODO:** replace mailto with real payment links (Stripe/invoice) when NLR
  sets them up; deploy to a public host (cascade.computer or GitHub Pages).

### Signoria council debate rebuilt on local Ollama voices (2026-08-05)

- **What:** `backend/scripts/signoriaDiscussion.py` rewritten — same council logic
  (top 9 by Influence + NLR, randomized speaking order, RELATIONSHIPS context,
  every statement recorded in MESSAGES with Receiver=`SignoriaCouncil`), but the
  voices now come from the local Ollama model (`qwen3-vl:2b-instruct`, same mind
  as the Venice Engine) instead of the unreachable KinOS API.
- **New CLI:** `--topic` (the Doge's question, also recorded as
  `signoria_discussion_topic`), `--auto` (non-interactive, NLR skipped),
  `--rounds`, `--limit` (cap speakers, for testing), `--model`, `--nlr`.
  Interactive mode keeps the Doge's between-speaker comments and lets NLR speak
  by keyboard. Run with `backend/venv/Scripts/python.exe` (has pyairtable).
- **Deliberate scope reduction:** no per-speaker ledger and no full-profile JSON
  in the prompt (2B context can't hold them) — compact persona + council
  relationships + last 8 statements instead.
- **Validated:** live run `--auto --limit 2` — 10-member council convened from
  real Airtable data, 20 council relationships loaded, both speakers answered in
  character (second explicitly responded to the first), 3 records verified in
  MESSAGES with correct UTF-8. Speaker failures (Ollama down/evicted) skip
  loudly without ending the session. Full round run (9 speakers) exposed 2B
  limits: verbose, abstract, one speaker echoing another. `num_predict` raised
  400 → 4000 on NLR's request.
- **Method decision (NLR, 2026-08-05): "On va dev comme ça"** — for real
  decisions, council sessions are **Fable-simulated**: the Claude agent voices
  each member from their real CITIZENS fields, records statements in MESSAGES
  (topic record explicitly says voices were carried by Fable), and archives the
  minutes in `backend/governance/signoria-sessions/` (git-versioned greffe,
  see its CLAUDE.md). First session held on the 3-days-of-treasury survival
  question — closing decree = actionable 3-point plan (inventory + suspend
  unfinishable work; three priced offers: contract work, finished works,
  chronicle/reports prepaid; ducat-for-ducat matched fund). 10 records in
  MESSAGES + minutes file verified.

### Activities pipeline revived — root causes of the March freeze found (2026-08-05)

- **Root cause #1 (the freeze), full mechanism:** Airtable compares
  `{DateField} <= 'string'` LEXICOGRAPHICALLY, not as dates — `'….000Z'` vs
  `'…+00:00'` fails on the `.`-vs-`+` byte even when the instants are equal.
  Combined with the rescheduler: every `processActivities.py` pass re-stamped
  all `created` activities to StartDate = "now" (with microseconds), the
  in_progress marking then used a second-truncated cutoff that lexicographic
  comparison could never satisfy → activities re-created/re-scheduled forever,
  never promoted, never processed. THE eternal-freeze loop. Fixes:
  (a) all three date-comparison formulas now use `NOT(IS_AFTER(...))` which
  parses real dates (marking, concluded query, galley arrivals);
  (b) rescheduler writes microsecond-free StartDate/EndDate;
  (c) all cutoff timestamps microsecond-stripped. Validated: the pass after
  the fix marked **119 activities in_progress** in one go.
- **Root cause #2 (dry-run leak):** the per-activity loop called
  `update_activity_status` unconditionally — a `--dry-run` still wrote statuses.
  Side effect during diagnosis: the 120 stale March activities got marked
  `processed` WITHOUT effects (verified: 0 citizens touched) — acceptable
  cleanup, wrong path. Both the main status write and the dependent-chain
  failure write are now guarded by `dry_run`.
- **Validated end-to-end:** `createActivities.py` (real run, API_BASE_URL =
  local Next.js dev server) created 88+ fresh activities — `emergency_fishing`
  (hungry citizens after 5 months), `goto_home` with real multi-modal paths
  from /api/transport (walking + gondola, 13–39 points, 20–30 min journeys).
  `processActivities.py` then marked started ones `in_progress` and processed
  2 concluded ones. Arrival wave confirmed (13:38Z pass): 62 activities
  processed (7 goto_home, 7 emergency_fishing…), 22 citizens' positions
  written, 11 real moves 265 m – 2.8 km — including March castaways
  (VenetianBoss 2.4 km, MariaDolfin 1.9 km) finally reaching land. 3 failed
  activities unexamined. Full cycle created → in_progress → processed →
  position write is proven end-to-end.
- **Thoughts for the day's movers:** 14 `thought_log` records in MESSAGES
  (Sender=Receiver=citizen) for the citizens who moved/fished/came home on
  wake-up day. First written by the local 2B (too abstract, anachronisms),
  then **replaced by Fable-authored thoughts** per the Signoria method
  ("on va dev comme ça") — each grounded in the citizen's CorePersonality
  (Strength/Flaw/Drive), social class, actual activity and distance walked.
- **Scheduler note:** `backend/app/scheduler.py` launches scripts with
  `python3` — likely broken on this Windows host (@mind:TODO verify before
  relying on the FastAPI scheduler for continuous life). Manual loop for now:
  createActivities + processActivities every ~5 min.

### Live position persistence — the city moves in Airtable (2026-08-05)

- **What:** `backend/physics/airtable_citizen_position_live_writer.py` — diff-based writer
  (baseline snapshot → PATCH only citizens whose (lat,lng) changed, batch_update, fail-loud
  KeyError if a moved citizen has no Airtable record). Wired into the orchestrator behind
  `--live-positions`; persists after each tick. The old `tick_runner --live` TODO is resolved
  for positions and its message now points here.
- **Scope (deliberate):** positions ONLY. Ducats + RESOURCES stacks stay unpersisted while
  the economy-v2 escalation is open (non-conserved ducats must not reach the shared base).
- **Validated:** 4 new unit tests (12/12 physics suite green); real run
  `--ticks 3 --thinkers 10 --live-positions` → 29 positions written, confirmed changed in
  Airtable (movements 67 m – 2.8 km, all plausible walk distances at 4 km/Venice-hour).
- **Context:** before this run the city had been frozen since 2026-03-15 (120 ACTIVITIES
  stuck in `created`); 58/152 citizens were massed at the Inn at Calle della Misericordia,
  20 stranded mid-water on interrupted gondola journeys.
- **Note:** the engine's own movement (WorldState.travel) is straight-line at 4 km/h — it
  does NOT use the /api/transport pathfinding graph; ACTIVITIES-based movement does. Two
  movement systems exist (engine vs activity pipeline) — consolidation is an open question.

### Transport/pathfinding verified + transporter lookup fixed (2026-08-05)

- **Verified working:** `/api/transport` (GET/POST) — inter-island paths (walk + gondola),
  long cross-city routes (5.7 km, 42 points), water-only fallback from open lagoon, input
  validation, and backend `get_path_between_points` (activity_helpers.py) end-to-end against
  the local dev server. First request ~45 s (graph build from 120 polygons), then 1–5 s.
- **Fixed — transporter always null:** `TransportService.findWaterOnlyPath` put the Airtable
  record id (`rec…`) in path dock points instead of the canonical `BuildingId` (`canal_lat_lng`),
  so `/api/buildings/{id}` 404'd. Now uses `dockRef.buildingId || dockRef.id`
  (TransportService.ts:3139, :3251). Also `fetchTransporterDetails` (app/api/transport/route.ts)
  now skips virtual `waterpoint_*` water-graph nodes. Verified: transporter resolves
  (e.g. BarbarigoCadet, RunBy of the boarding dock).
- **Fixed — Airtable `UNKNOWN_FIELD_NAME: CoatOfArmsImageUrl`:** the restored base
  (appk6RszUo2a2L2L8) was missing the CITIZENS field. Recreated it via metadata API
  (type `url`, empty values — code paths handle null). `/api/get-land-owners` returns
  120 lands again; error log spam gone.
- **Note:** dock building types in the restored base are `public_dock` (22) — there is no
  `dock` type. Minor leftover: destination point of a land-to-land water route is typed
  `water`/`virtual` instead of the destination polygon; cosmetic, path still correct.

### Venice Engine — integrated and running (2026-08-04)

- **What:** `backend/venice_engine_orchestrator.py` wires Physics + Minds. Per tick: warm the
  2B model (`preload_model(300)` — it shares a 6 GB GPU with a qwen3:4b service that evicts it),
  round-robin thinkers, menu from **`legal_actions()` only** (single source of legality — the
  minds' parallel `build_menu()` produced mismatched menus and 100% refusals; do NOT feed minds
  from it), `decide()` per citizen (a network failure skips that citizen loudly, never kills the
  tick), then `apply_intentions_and_tick()`. `--live-thoughts` pushes the minds' "why" to
  Airtable MESSAGES as thought_log.
- **Validated:** 91/91 pytest; 6-tick run on real data (117 citizens): hauls picked up and
  delivered, journeys resolved, chosen `eat` + automatic hunger-eating wave at hour 12, one
  GPU-starved citizen skipped without stopping the city, conservation intact.
- **@mind:TODO:** consolidate `backend/minds/action_menu_builder.py` (redundant menu authority;
  keep only its French labeling as a decoration pass or delete + retire its tests).
- **@mind:escalation (economy v2):** no price/wage source (flat constants), building treasuries
  missing so ducats are not conserved (buy_food sinks them, haul pay is ex nihilo).

### Venice Physics Layer (2026-08-04)

- **Area:** `backend/physics/`, `tests/physics/`
- **Status:** implemented and tested (8/8 pytest, dry-run validated on real Airtable data)
- **Owner:** agent (Claude)
- **Files:** `world_state_loader.py` (Airtable + data/buildings → WorldState, read-only),
  `laws_of_conservation_and_transport.py` (pure laws: legal_actions, apply_intentions_and_tick,
  conservation ledger), `tick_runner.py` (CLI dry-run; `--live` deliberately NotImplementedError).
- **Contract:** implements `backend/physics/engine_contracts_and_types.py` exactly (untouched).
- **Known contract gaps** (flagged `@mind:escalation` in laws module): no price/wage source →
  flat FOOD_PRICE_DUCATS=10 / HAUL_PAY_PER_UNIT=2; food ducats leave the world (no building
  treasury field); eat semantics (1 unit → hunger=0) chosen, not specified.
- **Note:** `tests/minds/` (parallel workstream) is order-dependent/flaky (one test needs a live
  Ollama server) — unrelated to physics.

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

### 2026-08-04: Minds layer — Ollama-driven citizen decisions (backend/minds/)

- **What:** New `backend/minds/` implementing the Minds side of the physics/minds contract (`backend/physics/engine_contracts_and_types.py`): `action_menu_builder.py` (pure `build_menu()` — legal menu with rest/eat/goto/buy_food/work/haul, French labels, max 10 entries, anti-hallucination core), `ollama_citizen_mind.py` (`decide()` via local qwen3-vl:2b-instruct, strict-JSON answer, one retry, documented rest fallback with loud logging, `preload_model()` warm-up), `mind_round_scheduler.py` (`pick_thinkers()` deterministic round-robin), `demo_three_personas_decide.py`. Tests: `tests/minds/test_action_menu_and_ollama_decisions.py` (35 tests, incl. one real-Ollama integration test, skipped if :11434 down).
- **Why:** The 2B model must only ever pick from a physics-built legal menu — it cannot invent actions.
- **Impact:** 35/35 tests pass (incl. real model call); demo shows 3 personas answering the same menu differently. Caveat: VRAM contention with `qwen3:4b` (some other local service) evicts the 2B model; cold reload ~20-30 s can exceed decide()'s mandated 30 s timeout — call `preload_model()` before decision rounds.

### 2026-08-03: Materialized citizen inference queue in INFERENCE_REQUESTS table

- **What:** New Airtable table `INFERENCE_REQUESTS` (tblPQWsX2XvGzMQFM) records every KinOS inference request with its exact Prompt and SystemPrompt (addSystem), plus Status/Model/HttpStatus/Duration/Response/Error and a ProcessId link back to the PROCESSES row. New module `backend/engine/utils/inference_queue_helper.py` (`execute_kinos_inference`, drop-in for `requests.post`); all 8 KinOS call sites in `backend/engine/utils/thinking_helper.py` routed through it; table registered in `get_tables()` (activity_helpers.py).
- **Why:** The PROCESSES queue only stored process metadata — the actual prompts sent to KinOS were invisible, making confabulation/failure debugging impossible.
- **Impact:** Every citizen inference is now auditable. Verified end-to-end: record created with both prompts, KinOS failure (api.kinos-engine.ai currently down, SSL handshake failure) faithfully recorded as `failed` with error detail. Recording failures log loudly but never block the inference itself.

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
