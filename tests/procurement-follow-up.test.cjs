const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const path = 'lib/procurementFollowUp.ts'
const code = ts.transpileModule(fs.readFileSync(path,'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText
const mod = new Module(path, module)
mod.filename = path
mod.paths = module.paths
mod._compile(code, path)
const {needsProcurementFollowUp, procurementFollowUpStage, sortedProcurementFollowUps} = mod.exports

test('same follow-up classifier guards ambiguous completion text and payment evidence', () => {
  assert.equal(needsProcurementFollowUp({current_status:'ต้องยืนยันว่าบริการเสร็จแล้วหรือยัง; ถ้าเสร็จรอวางบิล'}),true)
  assert.equal(needsProcurementFollowUp({current_status:'งานเสร็จและตรวจรับแล้ว • รอยืนยันชำระ'}),true)
  assert.equal(needsProcurementFollowUp({current_status:'รับสินค้าแล้ว / ปิดติดตาม'}),false)
  assert.equal(needsProcurementFollowUp({current_status:'รับสินค้าแล้ว / ปิดติดตาม',payment_status:'รับสินค้าแล้ว • เครดิตครบกำหนด 31/10/2569'}),true)
  assert.equal(needsProcurementFollowUp({current_status:'ส่งครบแล้ว แต่รอชำระเงิน'}),true)
  assert.equal(needsProcurementFollowUp({current_status:'รับสินค้าแล้ว 1 ชุด • ไม่ใช่หลักฐานชำระเงิน'}),true)
  assert.equal(needsProcurementFollowUp({current_status:'ส่งครบแล้ว',payment_status:'ค้างชำระ'}),true)
  assert.equal(needsProcurementFollowUp({current_status:'สั่งแล้วตาม PO'}),true)
  assert.equal(needsProcurementFollowUp({current_status:'PR / Pending PO verification'}),true)
})

test('never infer an issued purchase order solely from narrative status', () => {
  assert.equal(procurementFollowUpStage({current_status:'สั่งแล้วตาม PO • ยังไม่พบหลักฐานรับสินค้า'}),'verify')
  assert.equal(procurementFollowUpStage({current_status:'รอสินค้าเข้า',po_no:'PL0000969'}),'ordered')
  assert.equal(procurementFollowUpStage({current_status:'PR / Pending PO verification'}),'pr')
  assert.equal(procurementFollowUpStage({current_status:'รับสินค้าแล้ว / ปิดติดตาม'}),'closed')
})

test('confirmed overdue dates and urgent items take precedence without creating dates', () => {
  const list = sortedProcurementFollowUps([
    {id:'a',current_status:'รอ PO',expected_delivery:null},
    {id:'b',current_status:'รอส่ง',expected_delivery:'2026-10-20'},
    {id:'c',current_status:'รอ PO • ด่วน',expected_delivery:null},
    {id:'d',current_status:'ปิดติดตาม',expected_delivery:'2026-10-01'}
  ],'2026-10-22')
  assert.deepEqual(list.map(x=>x.id),['b','c','a'])
})

test('dashboard and procurement page use the same business classification', () => {
  const dashboard=fs.readFileSync('app/page.tsx','utf8')
  const page=fs.readFileSync('app/procurement/page.tsx','utf8')
  assert.match(dashboard,/sortedProcurementFollowUps\(proc,bangkokToday\(\)\)/)
  assert.match(page,/!needsProcurementFollowUp\(x\)/)
  assert.match(dashboard,/procurement_item_projects/)
  assert.doesNotMatch(dashboard,/proc\.filter\(x=>!\/\(ส่งครบ/)
})
