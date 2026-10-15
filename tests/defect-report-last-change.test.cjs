const fs=require('node:fs')
const assert=require('node:assert/strict')
const {test}=require('node:test')

const page=fs.readFileSync('app/defects/page.tsx','utf8')
const migration=fs.readFileSync('supabase/migrations/20261015115100_defect_report_live_update_time.sql','utf8')

test('Defect Report header presentation is unchanged; only timestamp source is replaced',()=>{
  assert.match(page,/<div className="update-meta"><span>ข้อมูลอัปเดต<\/span><b>\{dateTimeTH\(sourceDate\)\}<\/b><\/div>/)
  assert.match(page,/const sourceDate=latestDefectChangeAt/)
  assert.match(page,/supabase\.rpc\('defect_report_latest_change_at'\)\.abortSignal\(signal\)/)
  assert.doesNotMatch(page,/latestSourceDate\(rows\)/)
  assert.match(page,/!latestChangeRead\.error && typeof latestChangeRead\.data==='string'\?latestChangeRead\.data:null/)
})

test('live Defect records still load independently of timestamp read',()=>{
  assert.match(page,/Promise\.all\(\[/)
  assert.match(page,/requireSuccessfulReads\(\[\{error:roomRead\.error\}\]\)/)
  assert.match(page,/setRows\(\(roomRead\.data\|\|\[\]\) as RoomRow\[\]\)/)
  assert.match(page,/if\(!alive\|\|signal\.aborted\)return/)
  assert.match(page,/supabase\.channel\('defect-report-status'\)/)
})

test('read-only RPC aggregates timestamps from approved source and manual edits, never Excel ack',()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.defect_report_latest_change_at\(\)/)
  assert.match(migration,/RETURNS timestamptz/)
  assert.match(migration,/MAX\(c\.source_modified_at\)/)
  assert.match(migration,/MAX\(o\.updated_at\)/)
  assert.doesNotMatch(migration,/MAX\(o\.source_synced_at\)|MAX\(c\.synced_at\)/)
  assert.doesNotMatch(migration,/\bUPDATE\b|\bINSERT\b|\bDELETE\b|\bALTER\s+TABLE\b/)
})

test('timestamp RPC respects existing active-account Defect reader roles, not anon',()=>{
  assert.match(migration,/auth\.uid\(\)/)
  assert.match(migration,/p\.active = true/)
  assert.match(migration,/private\.matrix_can_read\(/)
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.defect_report_latest_change_at\(\) FROM PUBLIC, anon;/)
  assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.defect_report_latest_change_at\(\) TO authenticated;/)
  assert.doesNotMatch(migration,/GRANT\s+(?:SELECT|UPDATE|INSERT|DELETE)\s+ON/i)
})

test('Defect print CSS and column rendering unchanged',()=>{
  assert.match(page,/<td className="defect-detail">/)
  assert.match(page,/statusTone\(r\)/)
  assert.match(page,/hotelRoomLabel\(r\.room_no\)/)
  assert.match(page,/r\.next_action\|\|r\.follow_up/)
  assert.match(page,/@media print\{/)
})
