'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {planExpressDelta,fingerprint}=require('../lib/express-po/delta.cjs')
const d=()=>({poNo:'PL0000915',supplierCode:'AP-0070',supplierName:'Supplier',
 documentDate:'2026-10-20',plannedReceiptDate:'2026-10-30',
 subtotalCents:10000,vatCents:700,totalCents:10700,
 projectCodes:['AV-P6','AV-P7'],items:[{sequence:1,itemCode:'D-1',description:'Decking',
 quantity:2,unit:'pcs',unitPriceCents:5000,lineDiscountCents:0,lineDiscountPercent:null,amountCents:10000}]})
const report=(documents=[d()],qa=[])=>({sourceSha256:'f'.repeat(64),documents,qa})
test('same identity and complete line fingerprint are no-op on repeat import',()=>{
 const a=d(),stage=[{...a,fingerprint:fingerprint(a)}],result=planExpressDelta(report(),stage,[])
 assert.equal(result.summary.unchanged,1)
 assert.equal(result.summary.new_candidate,0)
 assert.equal(result.productionWritesAllowed,false)
 assert.equal(result.pages[0][0].projectCodes.length,2)
})
test('missing canonical snapshot does not authorize staging',()=>{
 const result=planExpressDelta(report(),[],null)
 assert.equal(result.gate,'HOLD_CANONICAL_SNAPSHOT')
 assert.equal(result.summary.hold_canonical,1)
})
test('canonical PO matching keeps original UUID and holds for item-level verification',()=>{
 const uuid='00000000-0000-4000-8000-000000000123'
 const result=planExpressDelta(report(),[],[{id:uuid,po_no:'PL0000915'}])
 assert.equal(result.summary.hold_existing,1)
 assert.deepEqual(result.pages[0][0].existingIds,[uuid])
})
test('new confirmed document is a staging candidate only; no receiving inference',()=>{
 const result=planExpressDelta(report(),[],[])
 assert.equal(result.summary.new_candidate,1)
 assert.equal(result.receiptEvidence,'unverified')
 assert.equal(result.productionWritesAllowed,false)
})
test('source anomaly and missing Plot are quarantined, and changed revisions reviewed',()=>{
 const a=d(),staged=[{...a,fingerprint:fingerprint(a)}]
 const b=d();b.items[0].quantity=3
 assert.equal(planExpressDelta(report([b]),staged,[]).summary.changed_review,1)
 assert.equal(planExpressDelta(report([b],[{code:'ITEM_UNREADABLE',poNo:b.poNo}]),[],[]).summary.hold_qa,1)
 const c=d();c.projectCodes=[]
 assert.equal(planExpressDelta(report([c]),[],[]).summary.hold_mapping,1)
 const fatal=planExpressDelta(report([d()],[{code:'REPORT_SUM_MISMATCH'}]),[],[])
 assert.equal(fatal.gate,'HOLD_SOURCE_INTEGRITY')
 assert.equal(fatal.summary.hold_qa,1)
})
test('paged deterministic delta respects line limits and never doubles shared-Plot quantity',()=>{
 const many=Array.from({length:5},(_,i)=>({...d(),poNo:'PL'+String(i+1).padStart(7,'0')}))
 const one=planExpressDelta(report(many),[],[],{maxDocumentsPerPage:2,maxItemsPerPage:2})
 const two=planExpressDelta(report([...many].reverse()),[],[],{maxDocumentsPerPage:2,maxItemsPerPage:2})
 assert.deepEqual(one.pages,two.pages)
 assert.deepEqual(one.pages.map(p=>p.length),[2,2,1])
 assert.equal(one.summary.new_candidate,5)
})
test('duplicate source identities and unreliable older staging fingerprints block',()=>{
 assert.throws(()=>planExpressDelta(report([d(),d()]),[],[]),/DUPLICATE_SOURCE_IDENTITY/)
 assert.throws(()=>planExpressDelta(report(),[{...d(),fingerprint:''}],[]),/STAGING_FINGERPRINT_REQUIRED/)
})
