const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const source = fs.readFileSync('docs/apps-script/WorkOrderSingleWriterCompletion_2026-10-21.gs','utf8')
const importer = fs.readFileSync('docs/apps-script/WorkOrderAutoSync_2026-10-15.gs','utf8')

test('Single-writer Apps Script is valid and fail-closed until enabled', () => {
  assert.doesNotThrow(()=>new vm.Script(source))
  assert.match(source,/function workOrderSingleWriterPreflight20261021\(/)
  assert.match(source,/WORK_ORDER_SINGLE_WRITER_ENABLED/)
  assert.match(source,/if\(!dryRun&&!gate\.enabled\)/)
  assert.match(source,/if\(!gate\.ok\|\|!gate\.enabled\)/)
  assert.match(source,/mirror===0&&importer===1&&writer<=1/)
  assert.match(source,/defectWorkOrderScheduled20261015/)
  assert.doesNotMatch(source,/function defectWorkOrderScheduled20261015\(/)
  assert.match(source,/function syncWorkOrderCompletion20261015\(/)
  assert.match(source,/LockService\.getScriptLock\(\)/)
  assert.match(importer,/LockService\.getScriptLock\(\)/)
  assert.match(importer,/everyHours\(2\)/)
})

test('Only exact Work ID is written to original XLSX, acknowledged after readback', () => {
  assert.match(source,/found!==1/)
  assert.match(source,/Work ID missing or duplicated/)
  assert.match(source,/getLastUpdated\(\)\.getTime\(\)!==modified/)
  assert.match(source,/workOrderWbBaseline20261015_\(file\)/)
  assert.match(source,/Saved Excel Work ID \/ status \/ date mismatch/)
  const readbackIndex=source.indexOf('Saved Excel Work ID / status / date mismatch')
  const ackIndex=source.indexOf("'defect_work_order_writeback_ack'")
  assert.ok(readbackIndex>=0&&ackIndex>readbackIndex)
  assert.match(source,/writeback_fail/)
  assert.doesNotMatch(source,/UPDATE public\.condo_room_status|function defectWorkOrderScheduled20261015|HotelOOO|PayRoll/)
})

test('Surgical XLSX edit preserves other cells and blocks formulas',()=>{
  const ctx=vm.createContext({})
  vm.runInContext(source,ctx)
  const cell=ctx.workOrderWbCell20261015_
  const row=ctx.workOrderWbRow20261015_
  const put=ctx.workOrderWbPutCell20261015_
  const original='<worksheet><sheetData><row r="4"><c r="C4" t="inlineStr"><is><t>Work ID</t></is></c><c r="J4" t="inlineStr"><is><t>สถานะล่าสุด</t></is></c></row><row r="5"><c r="C5" t="inlineStr"><is><t>DF-A212-01</t></is></c><c r="D5" t="inlineStr"><is><t>keep</t></is></c><c r="J5" t="inlineStr"><is><t>ยังไม่เริ่ม</t></is></c></row></sheetData></worksheet>'
  const changed=put(original,'J5','เสร็จแล้ว')
  assert.equal(cell(row(changed,5),'C5',[]),'DF-A212-01')
  assert.equal(cell(row(changed,5),'D5',[]),'keep')
  assert.equal(cell(row(changed,5),'J5',[]),'เสร็จแล้ว')
  assert.equal(cell(row(original,5),'J5',[]),'ยังไม่เริ่ม')
  const formula='<worksheet><sheetData><row r="5"><c r="J5"><f>SUM(A1:A3)</f><v>0</v></c></row></sheetData></worksheet>'
  assert.throws(()=>put(formula,'J5','เสร็จแล้ว'),/Refusing to overwrite Excel formula/)
})
