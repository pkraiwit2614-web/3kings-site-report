# PR #168 current-main scoped integration — 20 Oct 2026

Base main: 00db8dd8b2cb5dae5a1dd10fbac027a58a650ade.

Only five approved chat Defect rooms: A311, A401, B204, B502, B707.
- API parser: only explicitly chat-marked 'Defect Detail (Web App)' values are candidates.
- Scoped RPC migration: 263-room identity check (A162/B101), original key/source file ID, and a guarded SQL baseline for existing RPC and field-level override trigger. Only the five rooms can change defect_detail; all other Defect statuses and history continue under existing trigger.
- Read-only Work Order and Defect report permit unfinished single-room Non-Hotel work items; no item-level status editor.
- GAS source in docs requires comparison with the **live** Apps Script project and a separate controlled installation; repo files do not install a trigger.

RELEASE BLOCKERS: fresh-SHA CI and READY Preview with actual authenticated Viewer / role tests, replay-safe E2E Source→GAS/API→DB→UI, branch SQL migration safety QA on isolated *local* Postgres (not paid Supabase branch), exact real schema and override hash preflight, check source revision/queue, then only authorized production migration and merge/deploy with SHA readback. No automatic status change, extra fees, or unrelated systems.
