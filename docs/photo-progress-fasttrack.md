# SOP 09 v1.3 — Photo Progress Fast-Track Executor (test branch only)

## Current status (20 October 2026)
- Source of truth: current SOP 09 v1.3 in private Google Drive; the INDEX is always reread before any run.
- **Prototype, not Production-enabled**. No scheduled rename, no DB migration, no change to the web app.
- Existing `/photo-mapping` works with a Supabase photo index/task mapping. It does **not** rename the original Drive file. This isolated executor uses Drive metadata only.
- This branch must not be merged automatically. It does not authorize new scopes or grant access to the service account.

## Single-command execution contract
One command `จัดรูป Progress` means a complete authorized operation after deployment: read latest INDEX + full SOP, verify source/identity/role, search Plot 6–9 image folders, prioritize most recent candidate-bearing dates, use correctly named photos **from the same Plot** as references, check capture-date evidence and multiple stable landmarks, check name collisions and the existing web filename contract, rename eligible files by their original Drive file IDs, read back every change, store private reversible audit, and report PASS / REVIEW / FAIL by Plot × date. Ambiguous photos are deferred individually.

Visual similarity (ORB homography) in `scripts/progress_photo_fasttrack.py` currently makes **proposals only**. It is NOT evidence that the same permanent architectural landmarks exist; a separate verifier must provide `PHOTO_VERIFIED_MATCHES_JSON`, recording at least two independently checked fixed landmarks per accepted pair. Until the visual verifier is integrated and tested against real image pairs, automatic rename **must remain disabled**. Requiring this verification does not mean asking the user to approve each candidate individually; the goal is reliable end-to-end verifier automation.

## What is implemented
- Read-only live SOP Index + complete current Docs content check before operations.
- Safe-by-default CLI dry-run with Plot 6–9 scope and recent-date-first processing.
- Candidate filename detection, day-folder and EXIF consistency check, geometric image similarity prefilter, same-Plot references, ambiguity/collision handling.
- Apply mode is separately gated by exact verified per-file mapping with two distinct landmark observations and verified_source, a filename-date guard, a repeated per-folder collision check, web naming compatibility QA flag, explicit enablement, and a private audit folder. Writes use `files.update(name)` with the same file ID; readback checks parent, hash, size, type and ID.
- Offline unit tests and GitHub Actions branch PR checks. No Production write trigger from a PR.

## Configuration (repository secrets; never commit IDs or credentials)
`PHOTO_SA_JSON`: existing approved service-account credential with exact required Drive/Docs/Sheets permissions. Before enabling, verify access to SOP, Photo folder and private audit folder. Reuse an existing account if it already has the least privileges; do not ask for broader rights by default.

`PHOTO_PLOT_FOLDERS_JSON`: a JSON object keyed exactly `6`, `7`, `8`, `9`, with current Drive folder IDs. `PHOTO_SOP_INDEX_ID` and `PHOTO_SOP_DOC_ID`: current connected Drive objects, maintained privately. `PHOTO_AUDIT_FOLDER_ID`: private owner-controlled folder. `PHOTO_VERIFIED_MATCHES_JSON`: an independent verified mapping array with file_id, old, new, reference_id, plot, day, landmarks and verified_source. Every accepted pair must have independently verified evidence of at least two distinct permanent architectural landmarks; a matching CV score by itself is insufficient. `PHOTO_WEB_PARSER_VERIFIED` and `PHOTO_ENABLE_WRITE` must both equal `YES` before applying.

No extra paid service is required in code; GitHub Actions, Drive and API usage remain subject to their quotas and current account entitlements.

## Tests and release gates
1. PR checks: unit tests, static skill validator, full diff review; no Drive writes.
2. Credential/access test: dry-run against the real hierarchy; compare output with Drive counts, check incomplete pagination and protected folders.
3. Independent visual validation: labeled same-angle pairs, unrelated same-material pairs, changing construction conditions, rotated/cropped frames, dates/EXIF, duplicate target names, low-confidence ties, same-Plot-only restriction.
4. Web contract: verify the proposed names render in Photo Index, Gallery and Presentation with real photo sync; verify no broken references before enabling write.
5. Isolated 1-photo reversible apply test with private audit and readback; test interrupted rename/retry and SOP Gate refusal if source/permission changes.
6. Only after E2E passes: add a verified invocation channel from chat or a trusted executor. GitHub workflow_dispatch alone is **not** automatic ChatGPT-to-Drive invocation.
7. No Production deployment, merge, secrets changes, or scheduled job has been performed by committing this branch.

## Known gaps before one-command Production service
- Semantic viewpoint checker that validates two or more persistent architectural landmarks independently from ORB scores and emits signed/verified match evidence.
- Backlog resume checkpoint persisted per Plot/day; current implementation scans folder metadata each run and sorts days with candidates, safe but not fully optimized.
- A ChatGPT-to-executor authenticated dispatch path and live end-to-end permission test.
- Web filename parser contract checked against the actual Production photo importer; current apply switch defaults to off.
- Apply audit should record outcomes durably after every individual item for robust interruption recovery (current implementation creates the pre-write audit, then updates it at batch end).

### Blast radius
The branch touches only SOP Skill/manifest, isolated script/tests/workflow and this documentation. It does **not** modify Defect, Materials, Daily Report, Payroll, Calendar, RBAC/RLS, Supabase migrations, existing web Photo Mapping, or Vercel. The eventual Drive rename could affect existing photo filename indexing; that is why live parser + sync regression are mandatory before apply.

## Authorization and current evidence
- The user authorized work within the requested scope without repeated per-item approvals whenever actual access and all technical checks are satisfied. This never implies that service-account edit access, the independent visual verifier, or authenticated dispatch is currently configured.
- SOP 09 v1.3 and INDEX were read from the current owner Drive; the branch Skill and manifest point to the same title.
- Offline unit and static skill validation passed on the test branch. The independent live visual matching + Drive write/readback E2E checks have **not** been performed.
- Protected-preview Playwright checks on this branch cannot be used as evidence of live visual/photo QA: the workflow stops at a branch/SHA precondition before browsing.
- Keep Production writes disabled until the remaining gates above pass. Do not request routine photo-by-photo approvals once the system can verify these gates automatically.
