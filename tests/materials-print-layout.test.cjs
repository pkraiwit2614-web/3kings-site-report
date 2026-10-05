const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const page = fs.readFileSync(path.join(root, 'app/materials/page.tsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'app/report-print.css'), 'utf8')

assert.equal((page.match(/materials-print-repeat-title/g) || []).length, 3, 'all three Materials tables must have a repeating print title row')
assert.match(page, /materials-status-print-table/)
assert.match(page, /procurement-print-table/)
assert.match(page, /tools-print-table/)
assert.match(page, /colSpan=\{7\}/)
assert.match(page, /colSpan=\{9\}/)
assert.match(page, /colSpan=\{10\}/)

assert.match(css, /data-print-report="วัสดุ เครื่องมือและผู้รับเหมา"/)
assert.match(css, /\.materials-print-table thead\{[\s\S]*display:table-header-group!important/)
assert.match(css, /\.materials-print-table tr\{[\s\S]*break-inside:avoid!important/)
assert.match(css, /section\[aria-labelledby="materials-status-title"\] \.panel,[\s\S]*break-inside:auto!important/)
assert.match(css, /\.materials-print-repeat-title\{[\s\S]*display:table-row!important/)

console.log('materials print pagination regression: PASS')
