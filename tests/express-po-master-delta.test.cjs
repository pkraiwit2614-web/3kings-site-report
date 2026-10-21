'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {planMasterDelta,makeKey}=require('../lib/express-po/master-delta.cjs')
const sha='a'.repeat(64)
const item={sequence:1,itemCode:'DECK-01',description:'Decking Board',
  quantity:4,unit:'pcs'}
const doc={poNo:'PL0000969',supplierCode:'AP-0100',
  projectCodes:['AV-P8','AV-P9'],items:[item]}
const report=()=>({reportType:'PO_PL',sourceSha256:sha,
  documents:[structuredClone(doc)],qa:[]})
const row=(opts={})=>({file:'materials',sheet:'Material Status',
  row:10,projectCode:'AV-P8',itemCode:item.itemCode,
  description:item.description,unit:item.unit,quantity:item.quantity,
  status:'ยังไม่สั่ง',...opts})
const link=(r=row(),opts={})=>({poNo:doc.poNo,supplierCode:doc.supplierCode,
 sequence:1,projectCode:r.projectCode,masterKey:makeKey(r),...opts})
const run=(r=[row()],l=[link()],extra={})=>
  planMasterDelta({report:report(),masterRows:r,links:l,sourceRevision:'src-revision',
   masterRevisions:{materials:sha,pr_followup:sha},...extra})
test('exact source line, Plot and unit yield an ordered-only cell proposal',()=>{
 const a=row(), before=structuredClone(a)
 const result=run([a],[link(a)])
 assert.deepEqual(a,before,'does not mutate original Master input')
 assert.deepEqual(result.patches,[{masterKey:makeKey(a),field:'status',
  expected:'ยังไม่สั่ง',value:'สั่งแล้ว',
  reason:'MATCHED_EXPRESS_PO_NOT_RECEIPT',poNo:doc.poNo,sourceSha256:sha}])
 assert.equal(result.writesAllowed,false)
 assert.equal(result.receiptStatus,'unverified')
 assert.equal(result.summary.unlinkedSourceDocuments,0)
})
test('idempotent existing ordered row leaves Master unchanged',()=>{
 const a=row({status:'สั่งแล้ว'})
 const result=run([a],[link(a)])
 assert.equal(result.patches.length,0)
 assert.equal(result.summary.unchangedLinks,1)
})
test('a shared PO can mark two Plot rows without multiplying source line quantity',()=>{
 const a=row(),b=row({row:11,projectCode:'AV-P9'})
 const result=run([a,b],[link(a),link(b)])
 assert.equal(result.patches.length,2)
 assert.equal(result.patches.every(p=>p.field==='status'),true)
 assert.equal(result.summary.proposedCells,2)
})
test('PR follow-up only gains an exact PO reference, not receiving',()=>{
 const a=row({file:'pr_followup',sheet:'PR Tracker',status:undefined,poNo:''})
 const result=run([a],[link(a)])
 assert.deepEqual(result.patches.map(p=>[p.field,p.value]),[['poNo',doc.poNo]])
 assert.equal(result.receiptStatus,'unverified')
})
test('mismatched unit, qty, item code, description and missing Plot all HOLD',()=>{
 for(const update of [
  {unit:'sq.m.'},{quantity:5},{itemCode:'OTHER'},
  {description:'Other Work'},{projectCode:'AV-P7'}
 ]){const a=row(update),result=run([a],[link(a)])
   assert.equal(result.patches.length,0)
   assert.equal(result.holds.length,1)
 }
})
test('formula and conflicting manual status are protected',()=>{
 for(const x of [{protectedFormula:true},{locked:true},{status:'สั่งมาไม่พอ'}]){
  const a=row(x),result=run([a],[link(a)])
  assert.equal(result.patches.length,0)
  assert.equal(result.holds.length,1)
 }
})
test('Express QA quarantine cannot be bypassed by exact mapping',()=>{
 const a=row()
 const bad=report();bad.qa=[{code:'ITEM_UNREADABLE',poNo:doc.poNo}]
 const result=run([a],[link(a)],{report:bad})
 assert.equal(result.holds[0].reason,'EXPRESS_QA_HOLD')
})
test('no exact mapping means zero write proposals and unresolved source',()=>{
 const result=run([row()],[])
 assert.equal(result.patches.length,0)
 assert.equal(result.summary.unlinkedSourceDocuments,1)
})
test('preflight, duplicate Master identities, ambiguous writes fail closed',()=>{
 const a=row()
 assert.throws(()=>run([a,a],[link(a)]),/DUPLICATE_MASTER_ROW/)
 assert.throws(()=>run([a],[link(a),link(a)]),/DUPLICATE_MASTER_LINK/)
 assert.throws(()=>run([a],[link(a)],{masterRevisions:{materials:'',pr_followup:sha}}),
  /MASTER_PREFLIGHT_REQUIRED/)
 assert.throws(()=>run([a],[link(a)],{report:{...report(),reportType:'PR_PC'}}),
  /MASTER_PREFLIGHT_REQUIRED/)
})
