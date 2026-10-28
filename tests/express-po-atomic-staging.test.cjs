'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const os=require('node:os')
const path=require('node:path')
const {stageExpressAtomic,LocalAtomicStagingStore}=require('../lib/express-po/atomic-staging.cjs')
const document=()=>({poNo:'PL0000915',supplierCode:'AP-0070',supplierName:'Synthetic Vendor',
 documentDate:'2026-10-20',plannedReceiptDate:'2026-10-30',subtotalCents:10000,
 vatCents:700,totalCents:10700,projectCodes:['AV-P6','AV-P7'],
 items:[{sequence:1,itemCode:'TEST',description:'Synthetic Decking',quantity:2,
 unit:'pcs',unitPriceCents:5000,lineDiscountCents:0,lineDiscountPercent:null,amountCents:10000}]})
const report=(docs=[document()],qa=[])=>({
 sourceSha256:'a'.repeat(64),reportType:'PO_PL',documents:docs,qa
})
async function fixture(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'express-atomic-'))
 try{return await fn(new LocalAtomicStagingStore(dir),dir)}
 finally{await fs.rm(dir,{recursive:true,force:true})}
}
const stage=(store,r=report(),canonical=[])=>stageExpressAtomic({
 report:r,sourceMode:'po_history',canonical,store
})
test('full import, repeat identical import is NO_CHANGE and no duplicate rows',async()=>{
 await fixture(async(store,dir)=>{
  const first=await stage(store)
  assert.equal(first.result,'STAGED_ATOMIC_LOCAL')
  assert.equal(first.inserted,1)
  assert.equal(first.productionWritesAllowed,false)
  const contentBefore=await fs.readFile(path.join(dir,'po_history.json'),'utf8')
  const again=await stage(store)
  assert.equal(again.result,'NO_CHANGE')
  assert.equal(again.inserted,0)
  assert.equal(again.summary.unchanged,1)
  assert.equal(await fs.readFile(path.join(dir,'po_history.json'),'utf8'),contentBefore)
  const rows=await store.readAll('po_history')
  assert.equal(rows.length,1)
  assert.deepEqual(rows[0].projectCodes,['AV-P6','AV-P7'])
  assert.equal(rows[0].lineCount,1,'multi-Plot document staged once')
 })
})
test('revision changes and canonical Work IDs are held, old snapshot untouched',async()=>{
 await fixture(async store=>{
  await stage(store)
  const changed=document();changed.items[0].quantity=4
  const result=await stage(store,report([changed]))
  assert.equal(result.summary.changed_review,1)
  assert.equal(result.inserted,0)
  assert.equal((await store.readAll('po_history')).length,1)
 })
 await fixture(async store=>{
  const result=await stage(store,report(),[{id:'existing-uuid',po_no:'PL0000915'}])
  assert.equal(result.summary.hold_existing,1)
  assert.deepEqual(await store.readAll('po_history'),[])
 })
})
test('hold QA/mapping and fatal source: no unverified write',async()=>{
 await fixture(async store=>{
  const bad=document();bad.projectCodes=[]
  assert.equal((await stage(store,report([bad]))).summary.hold_mapping,1)
  assert.equal((await stage(store,report([document()],[{code:'REPORT_SUM_MISMATCH'}]))).result,'HOLD_SOURCE_INTEGRITY')
  assert.deepEqual(await store.readAll('po_history'),[])
 })
})
test('transaction rollback after an injected exception preserves complete prior snapshot',async()=>{
 await fixture(async(store,dir)=>{
  await stage(store)
  const before=await fs.readFile(path.join(dir,'po_history.json'),'utf8')
  await assert.rejects(store.transaction('po_history',async tx=>{
   await tx.insert({poNo:'PL0000916',supplierCode:'AP-0070',
    fingerprint:'b'.repeat(64),sourceSha256:'b'.repeat(64),projectCodes:['AV-P6'],lineCount:1})
   throw Error('SIMULATED_CRASH_BEFORE_COMMIT')
  }),/SIMULATED_CRASH/)
  assert.equal(await fs.readFile(path.join(dir,'po_history.json'),'utf8'),before)
  assert.equal((await store.readAll('po_history')).length,1)
 })
})
test('exclusive lock rejects competing writer, next retry is idempotent',async()=>{
 await fixture(async store=>{
  let release,entered
  const held=new Promise(resolve=>{release=resolve})
  const started=new Promise(resolve=>{entered=resolve})
  const first=store.transaction('po_history',async()=>{entered();await held;return {result:'HELD_TEST'}})
  await started
  await assert.rejects(stage(store),/ATOMIC_STAGE_LOCK_BUSY/)
  release();await first
  assert.equal((await stage(store)).inserted,1)
  assert.equal((await stage(store)).inserted,0)
 })
})
test('missing canonical, source type mismatch and corrupt snapshots fail closed',async()=>{
 await fixture(async(store,dir)=>{
  await assert.rejects(stageExpressAtomic({report:report(),sourceMode:'po_history',canonical:null,store}),
   /ATOMIC_IMPORT_PREFLIGHT_REQUIRED/)
  await assert.rejects(stage(store,{...report(),reportType:'PR_PC'}),
   /ATOMIC_IMPORT_SOURCE_TYPE_MISMATCH/)
  await fs.writeFile(path.join(dir,'po_history.json'),'{bad-json','utf8')
  await assert.rejects(stage(store),SyntaxError)
 })
})
