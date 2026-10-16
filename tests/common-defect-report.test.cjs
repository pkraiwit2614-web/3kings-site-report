const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname,'..')
const read = p => fs.readFileSync(path.join(root,p),'utf8')
const data = JSON.parse(read('app/defects/common/common-defects.json'))

test('58 Common Area source IDs retained exactly once with original PDF provenance',()=>{
  const rows = data.rows
  assert.equal(rows.length,58)
  assert.deepEqual(rows.map(r=>r.id),Array.from({length:58},(_,i)=>'CA-A-'+String(i+1).padStart(3,'0')))
  assert.equal(new Set(rows.map(r=>r.id)).size,58)
  for(const row of rows){
    assert.ok(row.location && row.work && row.workType && row.area && row.team && row.supervisor)
    assert.ok(row.sourcePage>=1 && row.sourcePage<=20)
    assert.equal(row.building,'A')
    assert.equal(row.supervisor,'บังศักดิ์')
    assert.equal(row.status,'รอตรวจสถานะจริง')
  }
  assert.equal(data.source.originalFileId,'1B-SXQnoNQMth4D6p-2VaEcDEIRj5VQ5N')
  assert.equal(data.source.teamAssignmentFileId,'1TMfTCBuIwyKkq88CFZhlMpAlFe4Gj_Se')
})

test('Common assignments sum to 58 and are segregated from Condo statuses',()=>{
  const count = team => data.rows.filter(r=>r.team===team).length
  assert.equal(count('3 Kings'),40)
  assert.equal(count('ขอพงษ์'),12)
  assert.equal(count('รอยืนยันผู้รับเหมา'),6)
  assert.equal(data.rows.length,count('3 Kings')+count('ขอพงษ์')+count('รอยืนยันผู้รับเหมา'))
})

test('Condo default URL and data access unchanged; Common includes 3 filters and print',()=>{
  const condo = read('app/defects/page.tsx')
  const common = read('app/defects/common/page.tsx')
  const tabs = read('components/DefectReportTabs.tsx')
  assert.match(tabs,/href="\/defects"/)
  assert.match(tabs,/href="\/defects\/common"/)
  assert.match(condo,/<DefectReportTabs active="condo"\s*\/>/)
  assert.match(common,/<DefectReportTabs active="common"\s*\/>/)
  assert.match(condo,/from\('condo_room_status'\)/)
  assert.match(common,/workType&&row\.workType!==workType/)
  assert.match(common,/team&&row\.team!==team/)
  assert.match(common,/area&&row\.area!==area/)
  assert.match(common,/window\.print\(\)/)
  assert.match(common,/@media print/)
  assert.doesNotMatch(common,/\.from\(['"]condo_room_status['"]\)/)
  assert.doesNotMatch(common,/\.insert\(|\.upsert\(|\.update\(|\.delete\(/)
})
