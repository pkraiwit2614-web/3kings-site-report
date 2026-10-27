const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const migration = fs.readFileSync('supabase/migrations/20261027233000_b515_defect_sync_reconcile.sql', 'utf8')
const route = fs.readFileSync('app/api/sync/drive/route.ts', 'utf8')
const gas = fs.readFileSync('docs/apps-script/SmartSyncDefects_v1.3_2026-10-02.gs', 'utf8')

test('B515 scoped migration contains preflight guards, trigger update, and reconciliation', () => {
  // Preflight validation
  assert.match(migration, /Keep the five previously approved Hotel Engineer transitions unchanged/)
  assert.match(migration, /private\.defect_reconcile_field_versions/)
  assert.match(migration, /private\.defect_reconcile_field_audit/)
  assert.match(migration, /ROOM_B515_NOT_FOUND_IN_CANONICAL_INVENTORY/)

  // Scoped B515 trigger logic
  assert.match(migration, /IF new\.room_no = 'B515' THEN/)
  assert.match(migration, /1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj/)
  assert.match(migration, /Handover_Defect_Summary_Updated_28-09-2026\.xlsx/)
  assert.match(migration, /new\.current_status = 'Defect ยังไม่เสร็จ \/ ต้องปิดงาน'/)
  assert.match(migration, /new\.status_group = 'Hotel - Incomplete'/)
  assert.match(migration, /new\.source_modified_at >= '2026-10-26 00:00:00\+00'::timestamptz/)

  // History preservation: if incoming defect_detail is blank, retain old.defect_detail
  assert.match(migration, /new\.defect_detail := old\.defect_detail/)

  // RPC update
  assert.match(migration, /v_room = 'B515' AND coalesce\(r->>'defect_detail',''\) LIKE '%Customer Defect B515%'/)
  assert.match(migration, /263 rooms \(A=162, B=101\)/)

  // Atomic reconciliation without app.defect_manual_update bypass
  assert.match(migration, /UPDATE public\.condo_room_status/)
  assert.match(migration, /WHERE room_no = 'B515'/)
  assert.doesNotMatch(migration, /SET app\.defect_manual_update = '1'/i)
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM public\.condo_room_status/i)
})

test('app/api/sync/drive/route.ts extracts B515 Customer Defect detail without dropping chat detail', () => {
  assert.match(route, /detail\?\.includes\('รายการ Defect แจ้งผ่านแชต:'\)/)
  assert.match(route, /roomNo === 'B515' && detail\?\.includes\('Customer Defect B515'\)/)
})

test('SmartSyncDefects_v1.3 Apps Script includes B515 Customer Defect detail', () => {
  assert.match(gas, /src\.defect_detail\.includes\('รายการ Defect แจ้งผ่านแชต:'\)/)
  assert.match(gas, /src\.room_no === 'B515' && src\.defect_detail\.includes\('Customer Defect B515'\)/)
})

test('Zero touch on protected zones in SQL statements: Materials, Payroll, Calendar, OOO/OOS, RBAC/RLS', () => {
  // Strip comments first to inspect executable SQL statements
  const sqlWithoutComments = migration.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(sqlWithoutComments, /materials/i)
  assert.doesNotMatch(sqlWithoutComments, /payroll/i)
  assert.doesNotMatch(sqlWithoutComments, /calendar/i)
  assert.doesNotMatch(sqlWithoutComments, /hotel_work_plan/i)
  assert.doesNotMatch(sqlWithoutComments, /room_ooo_oos/i)
  assert.doesNotMatch(sqlWithoutComments, /GRANT.*TO.*anon/i)
  assert.doesNotMatch(sqlWithoutComments, /ALTER ROLE/i)
})
