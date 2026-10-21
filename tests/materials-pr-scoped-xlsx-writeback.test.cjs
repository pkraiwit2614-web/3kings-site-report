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
  assert.throws(() => sandbox.xlsxScopedPatch_(old,[],[{cell:'C2',expected:'',value:'not allowed'}]), /Existing worksheet cell not found/)
  assert.throws(() => sandbox.xlsxScopedPatch_(old,[],[{cell:'A3',expected:'',value:'not allowed'}]), /Existing worksheet row not found/)
})
test('existing shared strings are resolved, and no duplicate cell changes allowed', () => {
  const row = '<row r="12"><c r="C12" t="s"><v>2</v></c></row>'
  assert.equal(sandbox.xlsxScopedCell_(row,'C12',['one','two','ไทย']).old,'ไทย')
  const old = '<worksheet><row r="12">'+row.replace(/^<row[^>]*>|<\/row>$/g,'')+'</row></worksheet>'
  const next=sandbox.xlsxScopedPatch_(old,['one','two','ไทย'],[{cell:'C12',expected:'ไทย',value:'ใหม่'}])
  assert.equal(sandbox.xlsxScopedCell_(next,'C12',[]).old,'ใหม่')
})


test('namespaced Excel XML fixture matches the QA workbook encoding and preserves formulas', () => {
  const blob = value => ({ getDataAsString:() => value })
  const parts = {
    'xl/workbook.xml':blob('<x:workbook><x:sheets><x:sheet name="ตามจัดซื้อ" sheetId="1" r:id="rId1" /></x:sheets></x:workbook>'),
    'xl/_rels/workbook.xml.rels':blob('<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml" /></Relationships>'),
    'xl/sharedStrings.xml':blob('<x:sst><x:si><x:t xml:space="preserve">ไทย &amp; &#60;ok&#62;</x:t></x:si></x:sst>'),
    'xl/worksheets/sheet1.xml':blob('<x:worksheet><x:sheetData><x:row r="2"><x:c r="A2" s="5" t="s"><x:v>0</x:v></x:c><x:c r="B2" s="6"><x:f>1+1</x:f><x:v>2</x:v></x:c></x:row></x:sheetData></x:worksheet>')
  }
  assert.equal(sandbox.xlsxScopedSheetPath_(parts,'ตามจัดซื้อ'),'xl/worksheets/sheet1.xml')
  const shared=sandbox.xlsxScopedSharedStrings_(parts)
  assert.equal(shared[0],'ไทย & <ok>')
  const xml=parts['xl/worksheets/sheet1.xml'].getDataAsString()
  assert.equal(sandbox.xlsxScopedCell_(xml,'A2',shared).old,'ไทย & <ok>')
  const changed=sandbox.xlsxScopedPatch_(xml,shared,[{cell:'A2',expected:'ไทย & <ok>',value:'ใหม่ & ทดสอบ'}])
  assert.match(changed, /<x:c r="A2" s="5" t="inlineStr"><x:is><x:t xml:space="preserve">ใหม่ &amp; ทดสอบ<\/x:t><\/x:is><\/x:c>/)
  assert.match(changed, /<x:f>1\+1<\/x:f><x:v>2<\/x:v>/)
  assert.equal(sandbox.xlsxScopedCell_(changed,'A2',shared).old,'ใหม่ & ทดสอบ')
  assert.throws(()=>sandbox.xlsxScopedPatch_(xml,shared,[{cell:'B2',expected:'2',value:4}]), /Refusing formula/)
  assert.throws(()=>sandbox.xlsxScopedPatch_(xml,shared,[{cell:'C2',expected:'',value:'not allowed'}]), /Existing worksheet cell not found/)
})


test('Apps Script QA canary matches the actual .xlsx filename and blocks other names/MIME', () => {
  const id = 'qa-mock-file-id-never-real-0000'
  const name = 'QA_PR_Original_Copy_20261019_DO_NOT_SYNC.xlsx'
  const scope = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const data = {
    MATERIAL_PR_XLSX_ALLOWLIST: JSON.stringify([id]),
    MATERIAL_PR_XLSX_CANARY_ID: id,
    MATERIAL_PR_XLSX_CANARY_REQUEST: JSON.stringify({
      fileId:id, expectedName:name, sheetName:'QA',
      changes:[{cell:'D11',expected:'previous value',value:'QA_CANARY_20261021'}]
    })
  }
  sandbox.PropertiesService = {getScriptProperties:() => ({getProperty:key => data[key] || null})}
  let actualName = name, actualMime = scope
  sandbox.DriveApp = {getFileById:(_id) => ({
    getName:()=>actualName, getMimeType:()=>actualMime, getBlob:()=>({})
  })}
  sandbox.Utilities = {unzip:()=>[
    {getName:()=> 'xl/workbook.xml'},
    {getName:()=> 'xl/_rels/workbook.xml.rels'}
  ]}
  assert.equal(sandbox.xlsxScopedConnectionProbe().status,'OWNER_OAUTH_READ_PROBE_PASS')
  assert.equal(sandbox.xlsxScopedConnectionProbe().probeVersion,'CANARY_PROBE_V3')
  actualName='QA_PR_Original_Copy_20261019.xlsx'
  assert.throws(()=>sandbox.xlsxScopedConnectionProbe(),/BLOCK_CANARY_NOT_ISOLATED/)
  actualName=name
  actualMime='application/vnd.google-apps.spreadsheet'
  assert.throws(()=>sandbox.xlsxScopedConnectionProbe(),/BLOCK_CANARY_NOT_ISOLATED/)
  actualMime=scope
  const calls=[]
  sandbox.xlsxScopedPreview = req => {
    calls.push({type:'preview',req})
    return {status:'DRY_RUN_PASS',expectedSha256:'mock-hash',expectedModifiedMs:1}
  }
  sandbox.xlsxScopedApply = req => {
    calls.push({type:'apply',req})
    return {status:'DRIVE_READBACK_PASS'}
  }
  assert.equal(sandbox.xlsxScopedCanaryWriteAndRestore().status,'QA_ONLY_SAME_ID_WRITE_AND_RESTORE_PASS')
  assert.equal(calls.filter(x=>x.type==='apply').length,2)
  assert.equal(calls[1].req.changes[0].value,'QA_CANARY_20261021')
  assert.equal(calls[3].req.changes[0].value,'previous value')
})
