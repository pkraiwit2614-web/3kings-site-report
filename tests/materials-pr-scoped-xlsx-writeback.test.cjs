const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { test } = require('node:test')

const file = path.join(__dirname, '../docs/apps-script/MaterialsPRScopedXlsxWriteback_2026-10-21.gs')
const code = fs.readFileSync(file, 'utf8')
const sandbox = { console }
vm.createContext(sandbox)
vm.runInContext(code, sandbox, { filename: path.basename(file) })

test('only isolated Apps Script helper is staged, no trigger and no hardcoded IDs', () => {
  assert.match(code, /function xlsxScopedPreview\(/)
  assert.match(code, /function xlsxScopedApply\(/)
  assert.match(code, /MATERIAL_PR_XLSX_ALLOWLIST/)
  assert.match(code, /expectedSha256/)
  assert.match(code, /expectedModifiedMs/)
  assert.match(code, /DRIVE_READBACK_PASS/)
  assert.match(code, /SOURCE_REVISION_CHANGED/)
  assert.match(code, /upload\/drive\/v3\/files\//)
  assert.doesNotMatch(code, /ScriptApp\.newTrigger|doPost\(|doGet\(/)
  assert.doesNotMatch(code, /1Yr9iNVo54g4PrB2ntFb6E_|1I8EdnL43kI-qBQfvgYxPyvJIETxrtYKj/)
})
test('resolve an exact existing worksheet name to the sheet XML', () => {
  const blob = text => ({getDataAsString:()=>text})
  const parts = {
    'xl/workbook.xml': blob('<workbook><sheets><sheet name="01 รายการทั้งหมด" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': blob('<Relationships><Relationship Type="worksheet" Target="worksheets/sheet2.xml" Id="rId2"/></Relationships>'),
    'xl/worksheets/sheet2.xml': blob('<worksheet/>')
  }
  assert.equal(sandbox.xlsxScopedSheetPath_(parts,'01 รายการทั้งหมด'),'xl/worksheets/sheet2.xml')
  assert.throws(() => sandbox.xlsxScopedSheetPath_(parts,'Wrong Name'),/missing\/ambiguous/)
})
test('patch a specified cell and preserve unrelated formulas and XML', () => {
  const old = '<worksheet><sheetData><row r="2"><c r="A2" t="inlineStr"><is><t>old</t></is></c><c r="B2"><f>2+3</f><v>5</v></c></row></sheetData></worksheet>'
  const newXml = sandbox.xlsxScopedPatch_(old, [], [{cell:'A2',expected:'old',value:'new & ดี'}])
  assert.equal(sandbox.xlsxScopedCell_(newXml,'A2',[]).old,'new & ดี')
  assert.match(newXml, /<f>2\+3<\/f><v>5<\/v>/)
  assert.throws(() => sandbox.xlsxScopedPatch_(old,[],[{cell:'B2',expected:'5',value:6}]), /Refusing formula/)
  assert.throws(() => sandbox.xlsxScopedPatch_(old,[],[{cell:'A2',expected:'stale',value:'bad'}]), /Previous value changed/)
  assert.throws(() => sandbox.xlsxScopedPatch_(old,[],[{cell:'A3',expected:'',value:'not allowed'}]), /Existing worksheet row not found/)
})
test('existing shared strings are resolved, and no duplicate cell changes allowed', () => {
  const row = '<row r="12"><c r="C12" t="s"><v>2</v></c></row>'
  assert.equal(sandbox.xlsxScopedCell_(row,'C12',['one','two','ไทย']).old,'ไทย')
  const old = '<worksheet><row r="12">'+row.replace(/^<row[^>]*>|<\/row>$/g,'')+'</row></worksheet>'
  const next=sandbox.xlsxScopedPatch_(old,['one','two','ไทย'],[{cell:'C12',expected:'ไทย',value:'ใหม่'}])
  assert.equal(sandbox.xlsxScopedCell_(next,'C12',[]).old,'ใหม่')
})
