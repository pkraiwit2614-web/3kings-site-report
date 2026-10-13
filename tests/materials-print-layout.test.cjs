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
