const fs = require('node:fs')
const assert = require('node:assert/strict')

const route = fs.readFileSync('app/api/sync/drive/route.ts','utf8')
const sync = fs.readFileSync('docs/apps-script/SmartSyncDefects_v1.3_2026-10-02.gs','utf8')
const sql = fs.readFileSync('supabase/migrations/20261013113500_defect_single_source_retire_legacy.sql','utf8')
const report = fs.readFileSync('app/defects/page.tsx','utf8')
const flow = fs.readFileSync('app/defect-flow/page.tsx','utf8')
const overview = fs.readFileSync('components/DashboardCondoDefectSummary.tsx','utf8')

for (const path of [route,sync,sql]) {
  assert.match(path,/Handover_Defect_Summary_Updated_28-09-2026\.xlsx/)
  assert.match(path,/1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj/)
}
assert.match(route,/sourceFile !== DEFECT_SOURCE_FILE \|\| sourceFileId !== DEFECT_SOURCE_FILE_ID/)
assert.match(route,/error: 'unapproved_defect_source'/)
assert.match(sync,/file\.getId\(\) !== DEFECT_V13\.SOURCE_FILE_ID/)
assert.match(sync,/file\.getName\(\) !== DEFECT_V13\.SOURCE_FILE_NAME/)
assert.match(sql,/DROP TABLE public\.condo_defect_rooms RESTRICT;/)
assert.match(sql,/private\.condo_defect_rooms_archive_20261013/)
assert.match(sql,/unapproved_defect_source/)
assert.doesNotMatch(sql,/DROP TABLE[^;]*CASCADE/i)
for (const page of [report,flow,overview]) {
  assert.match(page,/from\('condo_room_status'\)/)
  assert.doesNotMatch(page,/from\('condo_defect_rooms'\)/)
}
console.log('Canonical Defect source controls checked')
