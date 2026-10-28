'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const path=require('node:path')
const root=path.join(__dirname,'..')
const qa=fs.readFileSync(path.join(root,'docs/apps-script/ExpressBridgeAppendSafeQA_2026-10-22.gs'),'utf8')
const code=fs.readFileSync(path.join(root,'docs/apps-script/ExpressBridgeFullHistoryQA_2026-10-22.gs'),'utf8')
const ctx=vm.createContext({})
vm.runInContext(qa+'\n'+code,ctx)
const sample=[
 'บริษัท ทดสอบ','  รายงานใบสั่งซื้อ เรียงตามผู้จำหน่าย',
 '  บริษัททดสอบ /AP-0001',
 '  PO691021001  21/10/69  21/10/69       2                   100.00        7.00       107.00  N    Plot 6',
 '       1) 12-02-039 test item              2.00pcs            50.00                  100.00',
 ' *PL0000962    20/10/69  20/10/69       2                     0.00        0.00         0.00  N    Plot 9',
 'รวมทั้งสิ้น  2 ใบ            100.00        7.00       107.00'
].join('\r\n')
const make=()=>ctx.EB_mergeReports_([{name:'PO2026-211020261535.csv',id:'a',modifiedAt:'2026-10-22T08:00:00Z',text:sample}])
test('parses the fixed-width line, but never persists a canceled document',()=>{
 const result=make()
 assert.equal(result.docs.length,1)
 assert.equal(result.counts.lines,1)
 assert.equal(result.skippedCanceled,1)
 assert.equal(JSON.stringify(result.docs).includes('PL0000962'),false)
 assert.equal(result.docs[0].plot.join('|'),'AV-P6')
})
test('source data remains strings and spreadsheet formulas cannot execute',()=>{
 const result=make()
 result.docs[0].lines[0].description='=SUM(1,2) <&'
 const values=ctx.EB_qaMapRegisters_(result)
 const xml=ctx.EB_qaWorksheetXml_(values.itemRows,15)
 assert.match(xml,/t="inlineStr"/)
 assert.doesNotMatch(xml,/<f>/)
 assert.match(xml,/&lt;&amp;/)
 assert.match(xml,/<dimension ref="A1:O2"\/>/)
})
test('isolated QA never writes master and allows only the two test sheets to change',()=>{
 assert.notEqual(vm.runInContext('EB_FULL_QA.qaCopyId',ctx),vm.runInContext('EB_FULL_QA.originalMasterId',ctx))
 for(const marker of ['MASTER_REVISION_CHANGED_HOLD','QA_OTHER_PACKAGE_PART_CHANGED','QA_COPY_CHANGED_DURING_PROCESS','ORIGINAL_CHANGED_DURING_READBACK','originalMutation:0'])
   assert.ok(code.includes(marker),marker)
 assert.doesNotMatch(code,/\.clearContents\(|\.deleteSheet\(|\.deleteRow\(/)
})
