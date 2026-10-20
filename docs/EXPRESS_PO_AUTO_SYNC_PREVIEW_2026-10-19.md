# Express PO Auto Sync — no-paid-database Preview

## Source and isolation
- The 3 Kings SOP 06 / 07 / 13 / 15 remains the governing source.
- Private Google Drive CSV source: 3Kings Construction / 5-Purchase / Express.
- A **different private Google Sheets file** named Express_PO_Preview_Staging_2026-10-19 stores Preview evidence: Runs, Documents, Items, Issues. Do not change the Express source file, Materials master, PO status, receiving, Supabase, Defect, Payroll, Calendar or legacy sync.
- The CSV is Windows-874 (CP874) fixed-width **print output**, not ordinary comma-separated columns. Synthetic CI tests cover parser, status holds, unsafe formula strings, dates and duplicate PO identity.
- Previously verified sample: 34 regular PO/PL documents, 2 cancellation placeholders, 155 item lines. One PO had a 111.71 THB inconsistent header, held for QA.
- Excel status and web operations unchanged, no Source of Truth overwrite. PO used in multiple Plots is one PO with multiple project tags, not duplicate cost.
- The Express `รับหมด` Y/N field is source text, never physical-delivery confirmation.

## Actual Google Sheets staging setup
- A new native Google Sheet exists under the **Express** folder and was shared as Editor *only on that file* to the existing Preview OIDC service account; the parent Express folder itself remains Reader.
- Sheet IDs and secrets are configured in Vercel Preview, NEVER committed to public GitHub.
- Existing `exchangeVercelOidcToken` remains strictly **read-only**; the new `sheets-sync.ts` requests a *separate* Preview-only service token scoped to `spreadsheets` for staging writes. It checks the pinned staging file title, sheet tabs, fixed header columns and idempotency hash.
- One Google Sheets `batchUpdate` request appends all four tables; after completion readback validates source hash and counts.
- The same file SHA is skipped on a repeated run (`ALREADY_STAGED_NO_WRITE`); no write when source QA is fundamentally broken. Documents with ambiguous mapping or incorrect totals remain isolated as holds.

## Preview configuration
Required env only on `feat/express-po-auto-sync-preview-20261019`:
- `EXPRESS_PO_SYNC_ENABLED=true`
- `EXPRESS_PO_SYNC_SECRET`: dedicated Preview-only high-entropy server secret
- `EXPRESS_PO_SOURCE_FOLDER_ID`: private Express source folder
- `EXPRESS_PO_STAGING_SHEET_ID`: private Google Sheets staging document ID
- `EXPRESS_PO_ALLOW_STAGING_WRITE=false` initially, switch true **only after dry-run and access checks**
- Existing `AGENT_*` Preview OIDC impersonation configuration remains unchanged.

Call `POST /api/sync/express-po` with `Authorization: Bearer <preview secret>`, JSON `{"mode":"dry_run"}` to read without writing, or `{"mode":"stage_only"}` when safe. Vercel Preview deployment must be READY with current commit SHA; its protected deployment may need authorized Preview credentials.

## Costs, constraints and safety gates
- **No Supabase Branch created. No staging DB or migration applied. No new paid storage service requested.** Normal Google Drive/Sheets storage and API quotas still apply; quota-limited failures block sync and are logged.
- Reuse of the existing service account grants spreadsheets write access limited by Drive file ACL to this staging Sheet; the source folder remains Read-only.
- No Scheduler, Merge or Production deployment. Operator still manually exports CSV from Express into Drive via .Connect. The web has no Materials PO import view yet.
- Check GitHub CI and all regressions, Preview OIDC/Drive list, actual CSV dry run, Sheets write-readback and rerun no-duplicate, then consider scheduler separately.
- Security limitation: concurrent requests could both pass SHA check before append; keep a single scheduler/worker until an atomic lock is implemented for production.


## 20 Oct 2026 P0 parser/source update (no automatic writes)
- Pinned named sources: PO2024-Now.csv (~3.4 MB) and PR2024-Now.csv (~0.66 MB); explicitly selectable dated daily PO / PR exports. Files are CP874 fixed-width *print* reports, not RFC-4180 rows.
- Preview POST body is `{"mode":"dry_run","source":"po_history"}` or `pr_history`, `po_daily`, `pr_daily`. Default `po_history`. The source ID, modified timestamp, file size and SHA256 must be checked; all source material stays private and read-only.
- PO/PL and PC/PR are different document types; Express flag in PR means pending approval, never receiving. Masked `***` document counts and suffixed PL numbers are parsed; malformed lines and accounting differences remain QA holds.
- New complete history exports are **read-only dry run** until bounded incremental delta, document/line identity, duplicate-safe locking and verified staging + authenticated UI E2E are implemented. Existing staging sheet is intentionally **not** filled wholesale with 3,000+ documents; `stage_only` fails closed on full-history and PR sources.
- No changes to Production schema, cron, Supabase Materials master, purchases, receipt status, Daily Reports, PNG or LINE Gateway. No automatic Vercel Preview build requested for code QA.
