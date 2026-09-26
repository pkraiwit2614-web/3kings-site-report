# Web App Development Backlog V4

Baseline date: 26 Sep 2026
Branch: `v4-reliability`

## V4.0 — Reliability / Production Readiness

### P0 — Security hardening
- [x] Set `v_schedule_tasks` to `security_invoker=true`
- [x] Remove anon access to `v_schedule_tasks`
- [x] Restrict authenticated access on `v_schedule_tasks` to SELECT
- [x] Revoke direct API execution of trigger-only `capture_schedule_daily_snapshot()`
- [ ] Review external sync RPCs individually before further revokes
- [ ] Re-run full role smoke tests: Manager / Engineer / Foreman / Viewer
- [ ] Enable leaked-password protection in Supabase Auth when account settings permit

### P0 — Photo ↔ Task Mapping
Current production baseline:
- Active P6-P9 Drive photos: 1,364
- Matched to Schedule task: 38
- Unmatched: 1,326

- [ ] Add verification audit fields to `drive_photo_index`
- [ ] Create Photo Mapping Inbox
- [ ] Filters: unmatched / auto-matched / verified
- [ ] Manager/Engineer confirm or remap task
- [ ] Preserve verified/manual mapping during future sync
- [ ] Presentation must distinguish verified evidence from fallback/project images

### P0 — Daily Report field pilot
Current production baseline:
- Active manager: 1
- Active foreman: 1
- Submitted Daily Reports: 0
- Cloud drafts: 2

- [ ] Quick-entry mode for foreman
- [ ] Keep advanced fields collapsible
- [ ] Add safe `ใช้รายการเมื่อวาน` workflow
- [ ] Verify duplicate prevention
- [ ] Verify photo archive end-to-end
- [ ] Pilot on mobile with a real foreman report

## V4.1 — Management Accuracy

### P1 — Data Health
- [ ] Show source modified date separately from sync time
- [ ] Schedule freshness by Plot
- [ ] Materials / Tools freshness
- [ ] Photo matched / unmatched health
- [ ] Condo source update
- [ ] Daily Report submitted / missing status
- [ ] Drill-through links to the relevant module

### P1 — Progress weighting
- [ ] Stop presenting simple average task progress as equivalent to physical project progress
- [ ] Define weight source: BOQ cost / planned man-days / approved WBS weight
- [ ] Add `weight` field or approved weight table
- [ ] Calculate weighted Plan / Actual / Variance
- [ ] Rename current unweighted metric to `Average Task Progress` until weighting is approved

### P1 — Procurement control
- [ ] PR/PO reference
- [ ] Owner/PIC
- [ ] Required-on-site date
- [ ] Expected delivery / actual delivery
- [ ] Payment / claim status
- [ ] Document link / evidence
- [ ] Overdue procurement alerts

## V4.2 — Site Operations

### P1 — Labour / Manpower
- [ ] Worker master
- [ ] Daily attendance
- [ ] Work allocation by Plot / time block
- [ ] OT rate / OT hours
- [ ] Weekly payroll
- [ ] Unique-worker count and man-day allocation without double counting

### P2 — Automated verification
- [ ] Typecheck / lint in CI
- [ ] RLS/RPC authorization tests
- [ ] Daily Report submit/retry integration test
- [ ] Drive sync regression test
- [ ] Executive Presentation data integrity test
- [ ] Mobile smoke test

## Release gates
V4.0 should not be called production-ready until:
1. Security critical findings are understood and intentional exceptions documented.
2. Daily Report has at least one successful real field workflow from mobile.
3. Photo evidence can be distinguished as verified/direct vs fallback.
4. Dashboard exposes data freshness / health instead of sync time alone.
