# ChatGPT-Only Operations — Phase 1–3 STAGING
Date: 2026-10-29. Status: STAGING, not a live monitor or auto-repair system.

## Scope and authority
- GitHub is the source for code review. Google Drive 00-SOP_INDEX ACTIVE and SOP 15 v2.0 are the operating authority; recheck revisions before any real change.
- No Vercel/Cloudflare deployment, Apps Script install, OAuth consent, production DB/Drive/LINE writes, or automatic executor invocation is part of this change.
- Avoid overlap with existing Materials, Defect, Calendar, Daily and other live synchronization work. Do not change any of those implementations.

## Phase 1 — Read-only live evidence (adapter ready, connection BLOCKED)
- Existing P1 comparator `scripts/ai-operations/compare-gas-live.cjs` supports official Google Apps Script projects.getContent with `script.projects.readonly` when the authorized owner supplies a private mapping and short-lived OAuth token.
- Existing seven Git snapshots are not proven to be the seven live projects; some files may share a single project.
- `docs/apps-script/AI_Operations_Trigger_Inventory_ReadOnly_2026-10-20.gs` is an **uninstalled** owner-run collector. It can see only triggers registered by the current account and cannot show enabled state or execution history. Do not install or run it without separate authorization.
- The current ChatGPT Google Drive connector does not provide the Apps Script projects/executions API or that OAuth scope. **No actual live source or trigger read has been performed**.
- The staging evaluator accepts only the comparator's seven-file result contract; even EXACT_MATCH means HEAD or explicit version only, not verified active deployment. Untrusted imported snapshots are not proof of authenticity.

## Phase 2 — Central Error Log and patch proposals
- Reuse P0-B `central-error-log.cjs` and `triage-cli.cjs` from the existing isolated branch. Seven metadata-only source categories; hashed fingerprints; grouped occurrences; no raw messages, tokens, stack traces or room identifiers.
- `staging-control-plane.cjs` combines source comparison, current-user trigger snapshot and sanitized error metadata. Missing, stale, mismatched or invalid evidence must remain visible as UNKNOWN/BLOCKED.
- PROPOSE_PATCH requires a recent, explicitly staging-scoped ACTIVE SOP index and SOP 15 evidence snapshot, and is only a proposed Git-branch change with a pinned expected SHA-256; it is blocked on source mismatch, missing failure evidence or critical security errors. No patch is generated or applied automatically.

## Phase 3 — ChatGPT command router and SOP gate
- Allowed staging intents: AUDIT, TRIAGE, PROPOSE_PATCH, RUN_QA.
- Explicitly prohibited: EXECUTE, DEPLOY, MERGE, AUTO_REPAIR, live Apps Script write and any automatic dispatch. The only executor in the output is CHATGPT_ANALYST_ONLY; specialist names are **recommendations**, not calls.
- CI is GitHub Actions PR-scoped, read-only, no credentials. On-demand offline CLI:
  `node scripts/ai-operations/staging-control-cli.cjs --input private-staging-request.json --output new-staging-report.json`
- Input/output files are local and must be kept private. CLI creates a new output only and does not overwrite an existing report.

## QA and activation gates
1. Run targeted P0-B/P0-C/Control Plane tests on exact PR SHA; inspect CI and surgical diff.
2. Verify independent Google account authorization and private Script IDs before claiming Phase 1 live connection.
3. Later, if authorized, add a separate least-privilege cloud read-only collector with redaction and timestamped evidence; check Script deployment versions and execution telemetry separately.
4. For any future live write: explicit owner authorization, source/revision pinning, SOP/RBAC/QA gate, non-production integration test and post-write readback. Do not infer consent from this staging request.
5. Background checks require a separately approved scheduler and connected cloud credentials. A closed ChatGPT conversation does not keep the code running.

## Evidence matrix
| Capability | Current evidence |
|---|---|
| Git source inventory | Existing 7-file manifest |
| Google Apps Script source | Read-only comparator code; LIVE ACCESS BLOCKED |
| GAS triggers/executions | Owner-run collector source; NOT RUN |
| Error normalization | Offline P0-B engine + tests |
| Patch creation | PROPOSAL_ONLY, no writes |
| Executor routing | SIMULATION_ONLY |
| Production deployment | FORBIDDEN |
