const test=require('node:test')
const assert=require('node:assert/strict')
const {buildStagingRows,toAppendRequests}=require('../lib/express-po/staging.cjs')
const report={sourceSha256:'a'.repeat(64),documents:[{poNo:'PO691019001',documentDate:'2026-10-19',supplierCode:'AP-001',supplierName:'X',subtotalCents:10000,vatCents:700,totalCents:10700,expressReceivedAllFlag:'Y',projectCodes:['AV-P6','AV-P7'],projectMapping:'shared',reference:'Plot 6/7',notes:[],items:[{sequence:1,itemCode:'A',description:'=HYPERLINK("unsafe")',quantity:2,unit:'pcs',unitPriceCents:5000,lineDiscountCents:0,lineDiscountPercent:null,amountCents:10000}]}],qa:[{code:'HEADER_TOTAL_MISMATCH',poNo:'PO691019001',line:6}],summary:{quarantinedDocuments:['PO691019001']}}
const source={fileName:'191020261505.csv',modifiedTime:'2026-10-19T08:22:39Z'}
test('stage sheets retain source values and explicitly hold QA, never receipts',()=>{
 const rows=buildStagingRows(report,source,'2026-10-19T09:00:00Z')
 assert.equal(rows.Runs[0][4],1)
 assert.equal(rows.Documents[0][10],'hold_qa')
 assert.equal(rows.Documents[0][8],'Y')
 const requests=toAppendRequests(rows,{Runs:1,Documents:2,Items:3,Issues:4})
 assert.equal(requests.length,4)
 assert.deepEqual(requests[2].appendCells.rows[0].values[4].userEnteredValue,{stringValue:'=HYPERLINK("unsafe")'})
})
test('reject fatal source errors and duplicate PO identifiers',()=>{
 assert.throws(()=>buildStagingRows({...report,qa:[{code:'REPORT_SUM_MISMATCH'}]},source,'2026-10-19T09:00:00Z'),/SOURCE_REPORT_QA_BLOCK/)
 assert.throws(()=>buildStagingRows({...report,documents:[...report.documents,...report.documents]},source,'2026-10-19T09:00:00Z'),/INVALID_PO_IDENTITY/)
})
