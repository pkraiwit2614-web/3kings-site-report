const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const vm=require('node:vm')
const raw=fs.readFileSync('lib/materialsReconciliation.ts','utf8')
const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod={exports:{}}
vm.runInNewContext(js,{module:mod,exports:mod.exports})
const inspect=mod.exports.stageMaterialsReconciliation
const old={id:'old-1',sourceSheet:'01 รายการทั้งหมด',sourceRow:59,sourceItemNo:'1.9',itemName:'ยาแนวกระเบื้อง',projectCode:'AV-P8'}
test('unchanged identity remains read-only with no write decision',()=>{
 const actual=inspect([old],[{...old,sourceRow:59}])
 assert.equal(actual.status,'READ_ONLY')
 assert.equal(actual.matched,1)
 assert.equal(actual.rows[0].reason,'SAME_IDENTITY')
})
test('shifted physical row with stable item identity is flagged but not rewritten',()=>{
 const actual=inspect([old],[{...old,sourceRow:60}])
 assert.equal(actual.status,'READ_ONLY')
 assert.equal(actual.rows[0].reason,'ROW_SHIFT')
 assert.equal(actual.rows[0].sourceRow,60)
})
test('PR supersession cannot be silently matched as an old purchase',()=>{
 const prior={...old,id:'old-pr',sourceRow:744,sourceItemNo:'PR-151026-P6-02',
 itemName:'ปูนกาว Weber Tile Gres สีขาว',projectCode:'AV-P6'}
 const proposed={...prior,sourceRow:742,sourceItemNo:'PR-191026-P6-02'}
 const actual=inspect([prior],[proposed])
 assert.equal(actual.status,'BLOCK_WRITE')
 assert.equal(actual.reviewRequired,1)
 assert.equal(actual.rows[0].reason,'RENAME_OR_REPLACED_PR')
})
test('duplicate item numbers across sites cannot cross-match',()=>{
 const actual=inspect([old],[{...old,projectCode:'AV-P9'}])
 assert.equal(actual.status,'BLOCK_WRITE')
 assert.equal(actual.rows[0].reason,'UNMATCHED')
})
test('ambiguous matching fails closed without deleting source rows',()=>{
 const actual=inspect([old],[{...old,sourceRow:60},{...old,sourceRow:61}])
 assert.equal(actual.status,'BLOCK_WRITE')
 assert.equal(actual.rows[0].reason,'AMBIGUOUS')
 assert.equal(/\.delete\(|\.upsert\(|\.insert\(|\.update\(|\.rpc\(/.test(raw),false)
})
