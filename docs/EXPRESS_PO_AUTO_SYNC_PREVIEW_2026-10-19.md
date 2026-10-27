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


## Owner-confirmed change of target — 21 October 2026

The intended destination is **the existing XLSX Masters**, not a new independent staging
sheet or direct PO upserts to Production Supabase. Current Preview-only routing and
the old staging sheet stay isolated, read-only/fail-closed until validated otherwise.

1. Operator exports current Express PO/PL and PC/PR CSV history into private Drive;
   check file ID, modified time, exact SHA, document math and source QA.
2. Compare confirmed PO/PL lines to **existing** Materials status and purchasing/PR
   follow-up XLSX Masters. Read actual sheet layouts, cell formulas, current values,
   revision and the Sync's canonical source IDs *at runtime*.
3. Build a cell-scoped delta; an Express PO is evidence of an order **only**, while
   PR/PC is requisition evidence and a physical receipt requires separate receipt.
   Preserve existing requests not found in Express and all manual status notes.
4. Apply only unambiguous, authorized, exact-line/Plot/supplier-linked cells to
   **the same original XLSX file IDs** after revision/hash preconditions and formula
   protection. New rows require an independently verified template + safe append;
   never replace or re-export the entire workbook as a substitute for same-ID editing.
5. Invoke the **existing** GAS/Drive-to-Supabase Materials/Procurement sync once,
   when its source mapping/permissions are verified; then compare new/changed cells
   with import-run logs, database and the user-visible Materials/Procurement rows.
6. Re-run an unchanged input and prove zero additional cells/documents/rows changed.

### In-scope implementation checkpoint

- `lib/express-po/master-delta.cjs`: **pure read-only** verified-link comparator.
  It emits only `materials.status: ยังไม่สั่ง → สั่งแล้ว` or an empty PO reference
  on an exact-identified PR-follow-up row, with explicit Plot, supplier, item code,
  description, quantity and unit; all other statuses, formula/locked cells and
  ambiguous lines are HOLD. It does not perform Drive, Sync or Supabase writes.
- `tests/express-po-master-delta.test.cjs`: fixed-line, multi-Plot, idempotent,
  missing mapping, conflicting manual status, formula/quantity and QA quarantine.
- Original XLSX writeback/append compatibility, actual up-to-date Master mapping,
  Drive ACL, source revision guard and existing GAS trigger/run remain **UNTESTED**.
  A separate draft helper for limited existing-cell XLSX writeback is not evidence
  that row append, source-ID equivalence or whole pipeline is ready.
- The existing Preview route's `stage_only` continues fail-closed. Neither this
  comparator nor the synthetic GitHub CI proves a full real-data import.

### Release acceptance (non-waivable)

Actual source/master revision & permission readback → exact row delta, holds &
duplicate check → disposable XLSX cell/formula/layout test → same-ID original file
update (only after authorization/gates) → original GAS Sync run & logs → affected
Supabase row identities/linked Plot counts → authenticated UI readback/timestamps.
No new cron, schema, parallel importer, missing-PO cancellation or inferred
receipts. Preserve other 3 Kings modules untouched.
