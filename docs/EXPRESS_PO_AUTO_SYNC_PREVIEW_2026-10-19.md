# Express PO Auto Sync - Phase 1 Preview

## Source and safety
- Live 3 Kings SOP 06 / 07 / 13 / 15. Read from the current Google Drive SOP index before changes.
- Source: private Drive folder under 3Kings Construction / 5-Purchase / Express. Keep IDs, actual purchasing data and credentials out of this public repository.
- Express exported CSV is actually Windows-874 fixed-width paginated print output.
- A locally verified report yielded 34 regular PO/PL records, 2 cancellation placeholders and 155 item lines. One document has inconsistent totals and must be held. The private source file is not committed.
- The printed received-all Y/N field is not physical receiving proof.

## Added in this branch
- lib/express-po/parser.cjs: read CP874, supplier, PO, items, percent discounts, notes, cancellation placeholders, project hints and QA holds.
- app/api/sync/express-po/route.ts: Preview-only protected POST with dry_run (no writes) or stage_only (separate staging DB required).
- supabase/migrations/20261019160000_express_po_staging.sql: append-only snapshots and atomic service-role-only staging RPC; do NOT apply in Production.
- Synthetic parser tests and isolated PR CI. Existing Materials, procurement, Defect, Daily Reports, payroll, calendar, sync and UI unchanged.

## Private Vercel Preview setup
- EXPRESS_PO_SYNC_ENABLED=true
- EXPRESS_PO_SYNC_SECRET=unique long bearer token
- EXPRESS_PO_SOURCE_FOLDER_ID=verified private Drive folder ID
- Existing Preview AGENT OIDC settings; grant the service-account Google Drive read-only access to the source folder.
- Preview endpoint POST /api/sync/express-po, with Authorization Bearer secret and JSON mode dry_run.
- For stage_only: isolated Supabase test project only. Apply migration there; set EXPRESS_PO_STAGING_DB_URL, EXPRESS_PO_STAGING_SERVICE_ROLE_KEY and EXPRESS_PO_ALLOW_STAGING_WRITE=true. Production Supabase host is explicitly rejected by the endpoint.

## Impact and tests
- Preview API: one disabled-by-default server route.
- Database: a migration file only, not applied; new stage tables with RLS and no authenticated policies.
- Existing Materials/PR/PO, Excel, live sync, print, RBAC/RLS and unrelated systems: zero writes or code changes.
- Actual preview OIDC folder access, CI build, test DB, import readback and schedule remain untested until Preview setup.
- Header arithmetic exceptions quarantine the affected document; unmapped plots are held; shared plots are not counted as duplicate POs.
- No scheduler is installed. User must still Export the CSV from Express using .Connect and save to the Drive folder. Automating the Express export needs a separate capability check.
