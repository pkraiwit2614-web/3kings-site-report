# 3 Kings Work Order / Express persistent mapping — Production Release Gate

**Owner request:** 29 October 2026. **PR:** #240. **Status:** Draft; NO production migration or GAS change until all gates below.

## Confirmed data authorities
- Active SOP 01/02/04 and 06/07, SOP 15/16, six central rules.
- Work Order Master ID `18P3OFYtOLsslCtDujlSQVf9IQSuplKcx`, last verified 2026-10-28T00:00:45.397Z.
- QA reconciliation ID `12NemEWLPKIBAZIVZMGWn36F4ntVLdLNK` + preflight ID `1bm9cO_y3BgmZPPMWis1b-jnsx_sQaebI`.
- DB baseline before import: Work Order 74 total / 48 source_active / 26 inactive, plus 14 DB-only Work IDs that must never retire.
- Express signed docs PL0000976 `CONDO-B` room B603, THB 4,387; PL0000850 `PROUD-KARON` rooftop stair Building B, THB 12,091.
- PL0000973 / PO691027002 MUST remain unassigned until a signed PR/PO/PL, site receipt or scope proof links document number to project.
- J-Tech QT2026090068 owner-confirmed same job as PL0000916. Do not create second order. Invoice BL2026100069 NOT payment proof.

## Production acceptance (do not mark PASS by inference)
1. All required PR GitHub Actions exact HEAD SHA PASS; isolated PostgreSQL fixture and role checks PASS.
2. Confirm main SHA, no conflicting active worktree/PR, original Drive Work Order File ID and latest revision, canonical 82 source-only IDs and Combine pairs, current DB baseline and zero Web override collisions.
3. Authorize any DDL/DML from the exact merged migration SHA only. Backup DB schema/affected snapshot and ensure a rollback package; no direct import bypassing Excel-first.
4. Apply additive migrations exactly once in migration history, verify two override rows and security_invoker effective view. Confirm raw Express registry same row count and hashes. Check `authenticated` procurement reader and `anon` rejection in isolated/live safe tests.
5. Work Order stage-import 82 **review-only** records via trusted sync key and approved transport. Verify existing 74 rows byte-for-byte unchanged; 48 active and 26 inactive unchanged, 14 DB-only preserved; retry is NO_CHANGE. No dispatch until Hotel/Defect evidence passes per Work ID.
6. Effective Express view mapping must persist on new source batch without re-importing historical COMPLETE batch. To show in production UI, an approved UI/consumer change is required. Current front-end ExpressPoSection reads `/api/materials/express-po` staged Drive-sheet preview and does NOT read this effective view.
7. Authenticated Production Web QA exact deployment SHA: Work Order active list unchanged; review-stage data never dispatches; Express only 2 verified projects map correctly; unresolved 2 remain HOLD. Check critical baseline and roles. No false CI=E2E inference.

## External blockers
- Desktop Commander device `LAPTOP-S1HPA018` offline on 29/10 ~02:40 BKK. No live Apps Script connector/writer currently available.
- Signed project proof for PL0000973 and PO691027002 missing. Not required to finish the two already verified mappings.
- 63 Work Order candidate rows have no blanket real-time Hotel/work eligibility approvals. 12 history-only, 6 HOLD, 1 deny dispatch must never be made active automatically.
- Existing draft PR #210 is a single-writer/completion workflow; avoid concurrent edits to its Work Order source files.
- Existing PR #239 is AI ops staging; this PR must not modify it.

## Rollback / release safety
These migrations are additive and are designed not to change original `public.defect_work_order_snapshot` or `public.express_register_rows` data. Prior to first activation, a safe rollback can be executed in a controlled transaction when no other module consumes the new objects:

```sql
begin;
drop view if exists public.express_register_effective_rows;
drop function if exists public.defect_work_order_nonretiring_stage_import(text,text,timestamptz,jsonb,boolean);
-- Preserve audit/evidence rows until separately exported and approved for deletion.
-- Do NOT automatically drop project override or Work Order staging tables containing data.
commit;
```

If rows have been staged or imported, rollback is to disable access to new consumers and preserve staging evidence for reconciliation, not delete source history. Never change legacy importer, role matrix, source files or production triggers as part of rollback.
