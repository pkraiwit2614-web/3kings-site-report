# 3 Kings verified closure checkpoint — 25 Oct 2026 (read-only system audit + PR metadata)

This is a scoped, evidence-based continuation of `docs/handoffs/2026-10-25_full_backlog_closure_report.md`. It **does not** certify any unverified Production or live scheduler execution.

## Source and authority
- Re-read live Google Drive SOP_INDEX and ACTIVE SOP 03, 06/07, 09, 12, 15, 16, EX/SUP-PUBLISH (as applicable) on 25 Oct 2026.
- Preserve Source of Truth, actual-vs-plan, rights, live data and protected cross-system functions. No Google Sheets, GAS, Google Calendar events, image metadata, database data, PR code or Production deployment changed by this checkpoint.

## P0-1 — PDF/PNG publication artifact QA: verified, data discrepancy remains
- Native `Daily Report - Oct 26` sheet `241026` currently has **9 teams, 74 workers, 8 supervisors, 82 total people**, male 48, female 26.
- Drive PDF `Daily_Site_Report_24-10-2026.pdf` ID `1afBEjQEvsxXPZrHHqsQJB_A-sbdXdBHZ`, 70,192 bytes: read actual PDF bytes, found **4 page objects; A4 landscape 841.8898 × 595.2756 pt** on each page; parsed/rendered four separate project reports (Above Villa, Above Condo, Mirage, Henessy) with signature fields. The sheet and PDF both include นายช่างต่อ.
- Four PNG files exist and were read from Google Drive bytes; dimensions:
  1. Above Villa 2,947 × 2,054
  2. Above Condo 2,947 × 1,298
  3. Mirage 2,947 × 1,814
  4. Henessy 2,947 × 1,298
  They use the original Drive IDs documented in the previous handoff.
- **Known unresolved inconsistency:** นายช่างต่อ worker field 11 (male 7 + female 4), supervisor 1, per-row team total 12 including supervisor; however line-level allocation states 4 + 2 + 6 = 12 workers. Do not invent extra male/female worker or rewrite the PDF merely to hide this mismatch. Owner previously confirmed “12 คน” without a confirmed worker/supervisor and gender breakdown; determine whether line allocations overlap or whether one reported worker count is wrong. Keep data QA PARTIAL until sourced.
- Do **not** sum per-project subtotals to derive company unique headcount because บังรุน appears on both Above Condo and Mirage pages, per ACTIVE SOP. Native total 82 is unique team-row counting.

## P0-2 — A421 source-dispatch gate (independent DB readback)
- `public.condo_room_status` A421 current status = `Defect ยังไม่เสร็จ / ต้องปิดงาน`.
- `public.defect_work_order_snapshot` contains **0** rows matching `DF-A421-%` / room group A421; latest import timestamp `2026-10-23 05:57:22 UTC`.
- Earlier master review identified `DF-A421-01…09` only in Excel's `รายการ Defect`; importer reads `ใบแจกงานคงค้าง 151026` and these entries were gated awaiting confirmed on-site inspection and receipt date. **Do not fabricate/force-dispatch or report End-to-End Sync PASS.** Preserve room status QA as passed and dispatch/snapshot as HOLD.

## P0-3 — GAS LINE Gateway
- Prior GAS HEAD 25-file readback remains documented; **07:30 Bangkok 26 Oct execution still unverified** at this 25 Oct checkpoint. Do not trigger a duplicate real LINE send.

## P4 #222 — independent Calendar Account inventory: DONE_VERIFIED
- Google Calendar connector lists the seven 3 Kings production calendars with **owner** ACL in the signed-in account.
- Actual read-only event search (wide enough to include an event in Jan 2027):
  - Construction Plan **62** (61 dated in 2026 + 1 in 2027)
  - Site / Actual **90**
  - Delivery **5**
  - Plot 6 **7**; Plot 7 **7**; Plot 8 **11**; Plot 9 **6**
  - **Total 188**, matching Runbook baseline; no unformatted names missing the separator `•` in this snapshot.
- This closes **only** independently authenticated Calendar visibility/baseline audit. It does NOT authenticate Apps Script `CalendarApp` runtime, run `diagnoseCalendarAccess20261024`, prove exact source/event key reconciliation, or enable `CALENDAR_SYNC_ENABLED`. Those gates remain OPEN.

## P4 #209 — reactivated PR metadata + latest date inventory
- PR #209 latest head `83fe176558b05aece54f35b1b3db0904e8fd3b79`: existing isolated photo workflow and baseline GitHub CI **SUCCESS**, mergeable and still **DRAFT**.
- Because User authorized continuation, updated GitHub PR title from `[PAUSED]` to `[ACTIVE — QA GATED]` and verified readback. This **changed PR title only**; no branch SHA or code changed and no rename was performed.
- Located `VILLA / Picture Progress` root Drive folder `1fEZrhbLQlKkQHlk7VO7NkY24ZQLGt0mx` with Plot6–9 date directories. The latest day present on all four plots was `22102026`, with **31+8+22+29 = 90** named JPG files; no generic IMG_/DSC_ candidate was found in that day's listings. This is a **single-day metadata check**, not an all-history inventory or image-angle visual matching pass.
- Protected WIF/OIDC inventory job, visual evidence, one-image same-ID rename/rollback and audited Apply remain OPEN. Do not rename a live image without full SOP 09 evidence.

## Other P4 PRs — unchanged release-gated status
- #213 Migration: CI PASS; existing historical blank-root replay fails before the repaired rename because legacy `daily_reports` base schema is absent. Need isolated baseline/replay, confirm no Payroll/RLS regression. Do NOT repair remote migration history or run historical SQL on Production.
- #197 Materials/PR XLSX: CI PASS; disposable workbook same-ID write/readback/rollback awaits authorized Drive write identity; no original master write.
- #167 Express: CI PASS; integrated atomic staged real-source E2E and database QA remain; absent proposed registry tables on Production must not be created before isolated migration/RLS QA.
- #210 Work Order Single Writer: CI PASS; guarded Web→RPC→queue→QA-XLSX→ACK→import→DB/UI test with actual isolation remains; writer flag OFF.
- #222 Calendar as detailed above: source/event and GAS Owner OAuth runtime remains despite connector account inventory pass.
- None of the six PRs was merged or released by this checkpoint.

## Execution next, without repeated baseline work
1. On Home/Office executor, read this checkpoint + prior handoff, fresh SOP INDEX and exact PR HEAD; reuse successful CI unless revisions/env differ.
2. If authoritative evidence for นายช่างต่อ line-level worker and sex breakdown exists, surgically correct relevant Native sheet cell(s), regenerate same-ID PDF/PNG when necessary, and verify Drive. Otherwise keep that **single detail** in HOLD without deleting existing published files.
3. At or after 26 Oct 07:30, read actual GAS Trigger execution and downstream LINE delivery evidence without sending test messages.
4. Do not dispatch A421 WO lines until on-site verification and actual receipt-date evidence pass. Reconcile Source→import→DB→UI when legitimately released.
5. Close independent PR #213 isolated baseline replay, #197 QA workbook, #210 queue QA, #167 Express staging QA and #209 keyless photo inventory/visual acceptance as permissions allow, **without bypassing security/release gates**.
6. For #222 run genuine GAS read-only Owner diagnostic/dry-run with zero event writes, compare against the verified 188-event baseline, then release only through SOP16 if remaining gates pass.
7. Update per-PR evidence, exact SHA, baseline/config differences and blast radius. Halt only the blocked line and proceed with other safe independent work.

## Result
This checkpoint closes the PDF/PNG file existence + dimensions and the independent 7-calendar/188-event inventory evidence, and reactivates PR #209. It does **not** close the line-level Labour data discrepancy, A421 dispatch, LINE runtime or six Production PR releases.
