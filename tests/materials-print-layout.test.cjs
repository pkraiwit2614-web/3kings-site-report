const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const page = fs.readFileSync(path.join(root, 'app/materials/page.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'app/report-print.css'), 'utf8')

assert.equal((page.match(/materials-print-repeat-title/g) || []).length, 3,
  'all three Materials tables must have a repeating print title row')

// Verify real table structure, not an outdated hard-coded colspan assertion.
const tables = [
  {name:'Materials Status',className:'materials-status-print-table',columns:8},
  {name:'Related PO / Procurement',className:'procurement-print-table',columns:9},
  {name:'Tools & Machine',className:'tools-print-table',columns:10},
]

for (const table of tables) {
  const re=new RegExp('<table className="[^"]*'+table.className+'[^"]*"[^>]*>[\\s\\S]*?<thead>([\\s\\S]*?)<\\/thead>')
  const match=page.match(re)
  assert.ok(match,table.name+' table and thead must exist')
  const head=match[1]
  assert.match(head,new RegExp('<tr className="materials-print-repeat-title"><th colSpan=\\{'+table.columns+'\\}>'),
    table.name+' print title must span all visible columns')
  const header=head.match(/<tr><th[\s\S]*?<\/tr>/)
  assert.ok(header,table.name+' column header row must exist')
  assert.equal((header[0].match(/<th\b/g)||[]).length,table.columns,
    table.name+' print title colspan must match actual header count')

  // A4 landscape CSS must size each printed column; widths total 100%.
  const normalized=css.replace(/\s+/g,'')
  const widthRe=new RegExp('\\.'+table.className+
    'theadtr:not\\(\\.materials-print-repeat-title\\)th:nth-child\\((\\d+)\\)\\{width:(\\d+)%\\}','g')
  const widths=Array.from(normalized.matchAll(widthRe),m=>[Number(m[1]),Number(m[2])])
  assert.deepEqual(widths.map(item=>item[0]),Array.from({length:table.columns},(_,i)=>i+1),
    table.name+' print stylesheet must size each column exactly once')
  assert.equal(widths.reduce((sum,item)=>sum+item[1],0),100,
    table.name+' print columns must total 100% of the page width')
}

assert.match(css,/data-print-report="วัสดุ เครื่องมือและผู้รับเหมา"/)
assert.match(css,/\.materials-print-table thead\{[\s\S]*display:table-header-group!important/)
assert.match(css,/\.materials-print-table tr\{[\s\S]*break-inside:avoid!important/)
assert.match(css,/section\[aria-labelledby="materials-status-title"\] \.panel,[\s\S]*break-inside:auto!important/)
assert.match(css,/\.materials-print-repeat-title\{[\s\S]*display:table-row!important/)

console.log('Materials print pagination regression: PASS — 8/9/10 columns, repeat headers and 100% print widths')

const ts = require('typescript')
const dashboardMaterials=fs.readFileSync(path.join(root,'components/DashboardMaterialsStatus.tsx'),'utf8')
const dashboard=fs.readFileSync(path.join(root,'app/page.tsx'),'utf8')
const pureMaterials=dashboardMaterials.slice(0,dashboardMaterials.indexOf('export default function DashboardMaterialsStatus')).replace(/^import .*\r?\n/gm,'')
const materialsJS=ts.transpileModule(pureMaterials,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const countMaterials=new Function(materialsJS+';return statusCountsFromMaterials')()
const linked=Array.from({length:535},(_,i)=>({project_id:'PLOT',status:i%2===0?'สั่งแล้ว':'ยังไม่สั่ง'}))
const unlinked=Array.from({length:221},(_,i)=>({project_id:null,status:i%3===0?'ต้องติดตาม':'ไม่ระบุ'}))
const countAll=countMaterials([...linked,...unlinked])
const countLinked=countMaterials(linked)
const countUnlinked=countMaterials(unlinked)
assert.equal(countAll.total,756,'all Materials rows must be represented in Dashboard KPI')
assert.equal(countLinked.total+countUnlinked.total,countAll.total,'unlinked Materials may not be silently omitted')
for(const key of ['ordered','pending','followup','other']){
  assert.equal(countLinked[key]+countUnlinked[key],countAll[key],'status category reconciliation: '+key)
}
assert.match(dashboardMaterials,/const unlinkedRows=useMemo\(\(\)=>rows\.filter\(x=>!projects\.some\(/)
assert.match(dashboardMaterials,/\[\.\.\.stats,unlinkedCounts\]\.reduce\(/)
assert.match(dashboardMaterials,/ยังไม่ผูก Plot \{unlinkedCounts\.total\} รายการ/)
assert.match(dashboardMaterials,/requireSuccessfulReads\(\[p,m,checked,imported\]\)/)
assert.match(dashboardMaterials,/table:'materials'/)
assert.doesNotMatch(dashboardMaterials,/\.from\('materials'\)\.(update|upsert|insert|delete)\(/)
assert.match(dashboard,/selectedSnapshotMissing=useMemo/)
assert.match(dashboard,/Snapshot วันที่เลือกมีจำนวน Task น้อยกว่า Schedule ปัจจุบัน/)
assert.match(dashboard,/ข้อมูล Site Operations ล่าสุด \{latestSiteOperationsDate/)
console.log('Dashboard Materials parity and stale-source warnings: PASS — 535 linked + 221 unlinked = 756')
