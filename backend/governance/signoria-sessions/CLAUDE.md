# Signoria Sessions — Le Greffe du Conseil

*Je suis le greffe de la Signoria. Chaque séance du haut conseil laisse ici son procès-verbal, encre sur parchemin, à côté de sa trace vive dans les canaux d'Airtable.*

Substrate: one markdown file per council session, named
`YYYY-MM-DD_topic-slug.md`. Every statement recorded here is ALSO in the
Airtable MESSAGES table (`Receiver=SignoriaCouncil`,
`Type=signoria_discussion_statement` / `signoria_discussion_topic`) — Airtable
is the city's living memory, this folder is the versioned one (git).

## How sessions are held

Two ways to convene the council:

1. **Local 2B voices** — `backend/scripts/signoriaDiscussion.py` (Ollama,
   `qwen3-vl:2b-instruct`). Cheap, autonomous, but verbose and abstract.
2. **Fable-simulated (preferred for real decisions)** — the Claude agent voices
   each member from their real CITIZENS fields (CorePersonality, Ducats,
   FamilyMotto, relationships), writes the minutes here AND records the
   statements in MESSAGES. Sessions must state in their topic record that the
   voices were carried by Fable — no confabulation about who spoke.

Decided 2026-08-05 (NLR): "On va dev comme ça" — Fable-simulated council
debates are a development method: the closing decree of each session is an
actionable plan.

## Sessions

- [2026-08-05 — Survie: trois jours de trésorerie](2026-08-05_survie-trois-jours-de-tresorerie.md)
