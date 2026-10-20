# Phase 1 RPC/API safety branch — 19 October 2026

## Authority and boundary
- Live Google Drive SOP INDEX and complete SOP 13 v1.1, SOP 15 v1.1 and SOP 17 v1.1 were read before edits.
- Branch only; never merge or deploy based on this file. All audits and helper functions are read-only.
- No production DB migration, RLS/ACL change, Source Excel edit, Apps Script trigger edit, hotel, Payroll, Defect, Calendar, or LINE delivery.
- This is a **staged, incomplete** Phase 1 change; not proof of end-to-end Sync success.

## 1. SECURITY DEFINER ACL review
- Initial catalog inspection found 107 public functions, 68 SECURITY DEFINER, 27 anon-callable SECURITY DEFINER findings and 41 authenticated-callable SECURITY DEFINER findings.
- An anon-callable definer RPC is not automatically exploitable: some import functions validate a private sync key. Nevertheless the public RPC surface requires caller-by-caller verification.
- Run `supabase/audits/phase1_rpc_permissions_readonly.sql` on a read-only connection. Classify each flagged RPC as Trigger Only, Server Sync, Owner Action, or Intended Public; review GRANT/PUBLIC inheritance, caller credentials, function body, RLS and actual negative tests.
- **Do not mass-REVOKE**: the existing Drive/Apps Script importer may rely on public-callable RPC plus a private server key. Separate safe caller migration and deployment must precede ACL changes.
- No credentials, real user details, or result dumps should enter this public repository.

## 2. Materials drift: do not force an import
- Last checked log on 2026-10-19 flagged two unmatched existing Materials records and explicitly preserved data (no write/delete).
- The live Excel source has insertion/reordering near grout materials, affecting old physical row identity. A separate Plot 6 white Weber adhesive row superseded a 15 Oct PR with a new 19 Oct PR identifier.
- An old row number is **not** a stable material identity. A newer PR does not prove PO Ordered or stock Received. A renamed/superseded PR requires approved mapping and readback.
- `lib/materialsReconciliation.ts` stages **read-only** exact identities vs conflict candidates; it does not call database APIs. The actual `sync3Kings` Apps Script source is not in the repository, so nothing here alters its live importer.
- Next implementation gate: read the live Apps Script source and latest Excel field mapping, isolate a copy, test row insertion and superseded PR, then wire the same fail-closed behavior under the current SOP 06 and SOP 13. If any row is uncertain, keep old IDs, overrides and historical PR evidence and report the conflict.

## 3. Shared Sync QA
- `lib/agentSyncEvidence.ts` continues using existing Owner-authenticated read-only API. Latest failed imports are now explicitly classified, and a four-stage evidence contract requires identical source identity/revision, canonical row count/hash and authenticated UI readback.
- The *live inspector* still returns PARTIAL or UNVERIFIED until Drive/Excel content, Apps Script execution and UI are actually independently read. It never upgrades a log success to a verified PASS.
- No new public endpoint or write-capable route has been created.

## Blast radius / QA
| Area | Intended change | Unchanged |
|---|---|---|
| SOP routing | Three current SOP titles mapped in manifest on branch | 17 shortcut identifiers/modes, Drive originals |
| Agent Sync inspect | Read-only diagnostic classification and proof helper | DB/Drive writes, SOP 13 read-only mode |
| Materials | Pure local reconciliation planning helper | Existing live Materials import and original workbook |
| RPC security | SELECT-only audit query | Privileges, RLS, functions, secrets, schemas |
| CI | Add scoped tests | Main, Production jobs, existing release process |

## Required before any Production proposal
1. Pass CI and build, inspect PR diff and Vercel Preview (if provisioned).
2. Run restricted Viewer/Owner API and RLS checks against Supabase Local seeded with synthetic data.
3. Verify current GAS import callers, any anon/public EXECUTE dependencies and real source revision. Do not revoke any permission until caller compatibility is shown.
4. Test exact Materials identity collisions, Excel insertion and new PR replacement in a **copy**. Verify both source preservation and no duplicate IDs.
5. Establish source → parser → written → readback → authenticated Web UI evidence. Report FAIL/UNVERIFIED on gaps.
6. Review any Production action against SOP 16 separately. This branch and PR are **not** approval to merge or deploy.

## Scoped read-only review — 20 October 2026
- Integrated current main while preserving all current SOP discovery titles and Fast-Track guidance.
- Scope retained: catalog SELECT audit, unwired Materials staging helper, Owner-only Sync diagnostic classification, tests. No write path, ACL/RLS change, migration, source import or trigger change.
- Materials staging now rejects incomplete identities and many-to-one existing identity collisions.
- The historical source findings above are not a fresh audit or proof that live Materials conflicts are resolved.
- Operational importer/ACL work remains deferred; merging this read-only code does not authorize it.
