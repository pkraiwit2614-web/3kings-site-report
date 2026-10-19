const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(p)=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');

test('shift timetable is Bangkok-only, Monday-Saturday operations, daily photos',()=>{
 const code=read('docs/apps-script/ShiftSyncScheduler_2026-10-13.gs');
 assert.match(code,/TZ:'Asia\/Bangkok'/);
 assert.match(code,/clock\.sunday\|\|clock\.hour<8\|\|clock\.hour>18/);
 assert.match(code,/\(clock\.hour-8\)%3===0/);
 assert.match(code,/\[8,12,17\]\.forEach/);
 assert.match(code,/syncShiftPhoto0800/);
 assert.match(code,/syncShiftPhoto1200/);
 assert.match(code,/syncShiftPhoto1700/);
 assert.doesNotMatch(code,/handlers.*runDefectWritebackScheduled/);
});
test('snapshot migration skips same-day unchanged rows without altering historical snapshots',()=>{
 const code=read('supabase/migrations/20261013200000_schedule_snapshot_changed_only.sql');
 assert.match(code,/coalesce\(new\.rows_written,0\)=0 and exists/);
 assert.match(code,/v_snapshot_date := \(new\.created_at at time zone 'Asia\/Bangkok'\)::date/);
});
test('procurement migration uses source identity, preserving existing PR PO and overrides',()=>{
 const code=read('supabase/migrations/20261013201000_procurement_stable_identity.sql');
 assert.doesNotMatch(code,/delete from public\.procurement_items\b/i);
 assert.match(code,/pi\.source_row=nullif\(r->>'source_row',''\)::integer/);
 assert.match(code,/pi\.updated_by is null/);
 assert.match(code,/PROCUREMENT_MISSING_SOURCE_ROWS_RECONCILIATION_REQUIRED/);
});
test('defect UI sends a loaded server revision to guarded RPC',()=>{
 const ui=read('components/DefectInputPanel.tsx');
 const migration=read('supabase/migrations/20261013202000_defect_revision_save.sql');
 assert.match(ui,/defect_manual_update_apply_checked/);
 assert.match(ui,/p_expected_source_modified_at:loadedRoom\.stamp/);
 assert.match(migration,/FOR UPDATE/i);
 assert.match(migration,/DEFECT_REVISION_CONFLICT_REFRESH_ROOM/);
});
test('B511 RSE reconciliation proposes approved Current Status and Next Action only on explicit click',()=>{
 const ui=read('components/DefectInputPanel.tsx');
 assert.match(ui,/room:'B511'/);
 assert.match(ui,/status:'Defect เสร็จแล้ว \/ รอ Hotel Engineer ตรวจ'/);
 assert.match(ui,/group:'Hotel - Awaiting Check'/);
 assert.match(ui,/nextAction:'นัด\/ตาม Hotel Engineer ตรวจ; รวบรวมรูป After'/);
 assert.match(ui,/normalizeHotelRoom\(room\)!==B511_RECONCILIATION\.room/);
 assert.match(ui,/loadedRoom\?\.room!==B511_RECONCILIATION\.room/);
 assert.match(ui,/onClick=\{applyB511Reconciliation\}/);
 assert.match(ui,/target===B511_RECONCILIATION\.room&&\/RSE/);
 assert.match(ui,/proposedStatus!==B511_RECONCILIATION\.status/);
 assert.match(ui,/nextAction\.trim\(\)!==B511_RECONCILIATION\.nextAction/);
 assert.match(ui,/\.rpc\('defect_manual_update_apply_checked'/);
 assert.match(ui,/p_expected_source_modified_at:loadedRoom\.stamp/);
 assert.match(ui,/\.select\('current_status,status_group,next_action'\)\.eq\('room_no',target\)\.maybeSingle\(\)/);
 assert.match(ui,/verified\.current_status!==proposedStatus/);
 assert.match(ui,/verified\.status_group!==proposedGroup/);
 assert.match(ui,/verified\.next_action!==nextAction\.trim\(\)/);
 assert.doesNotMatch(ui,/\.from\('condo_room_status'\)\.update\(/);
});
