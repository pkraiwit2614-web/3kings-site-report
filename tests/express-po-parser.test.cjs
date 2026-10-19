'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {parseExpressPoReport,projectCodes}=require('../lib/express-po/parser.cjs')
function cp874(text){
 const out=[]
 for(const ch of text){
  const c=ch.charCodeAt(0)
  if(c<128)out.push(c)
  else if(c>=0x0E01&&c<=0x0E3A)out.push(c-0x0E01+0xA1)
  else if(c===0x0E3F)out.push(0xDF)
  else if(c>=0x0E40&&c<=0x0E5B)out.push(c-0x0E40+0xE0)
  else throw Error('unsupported test character')
 }
 return Buffer.from(out)
}
function sample({differentTotal=false,duplicate=false,extraInvalidItem=false}={}){
 const lines=[
  'บริษัท ตัวอย่าง','  รายงานใบสั่งซื้อ เรียงตามผู้จำหน่าย',
  '  ผู้จำหน่าย ตัวอย่าง /AP-0001',
  '  PO691019001  19/10/69  19/10/69   30  2                  100.00        7.00       '+(differentTotal?'108.00':'107.00')+'  Y    Plot 6,7',
  '       1) 05-07-001 ทดสอบ แผ่น                                            2.00แผ่น            50.00                   100.00',
  '                หมายเหตุ:', '                  ใช้ใน Plot 6,7',
  ...(extraInvalidItem?['       2) 05-07-002 malformed line']:[]),
  ...(duplicate?['  PO691019001  19/10/69  19/10/69   30  2                  100.00        7.00       107.00  Y']:[]),
  ' *PL   .        19/10/69  19/10/69       2                     0.00         0.00          0.00  N',
  'รวมทั้งสิ้น  2 ใบ                                          100.00        7.00       107.00',
  '>>>> จบรายงาน <<<<'
 ]
 return cp874(lines.join('\r\n'))
}
test('site hints keep one shared PO, not duplicate totals',()=>{
 assert.deepEqual(projectCodes('Plot 6,7,8'),['AV-P6','AV-P7','AV-P8'])
 assert.deepEqual(projectCodes('Above Condo A'),['CONDO-A'])
 assert.deepEqual(projectCodes('Unknown'),[])
})
test('invalid bytes or format fail closed',()=>{
 assert.throws(()=>parseExpressPoReport(Buffer.alloc(0)),/INVALID_SOURCE_SIZE/)
 assert.throws(()=>parseExpressPoReport(Buffer.from('a,b,c')),/UNSUPPORTED_EXPRESS_REPORT/)
})
test('CP874, item, cancelled placeholder and receipt flag',()=>{
 const x=parseExpressPoReport(sample())
 assert.equal(x.summary.reportedDocuments,2)
 assert.equal(x.summary.validDocuments,1)
 assert.equal(x.summary.cancelledDocuments,1)
 assert.equal(x.summary.lineItems,1)
 assert.deepEqual(x.documents[0].projectCodes,['AV-P6','AV-P7'])
 assert.equal(x.documents[0].expressReceivedAllFlag,'Y')
 assert.equal(x.documents[0].totalCents,10700)
 assert.equal(x.documents[0].documentDate,'2026-10-19')
 assert.equal(x.documents[0].plannedReceiptDate,'2026-10-19')
 assert.equal(x.qa.length,0)
})
test('quarantine one mismatch without amending the accounting value',()=>{
 const x=parseExpressPoReport(sample({differentTotal:true}))
 assert.equal(x.documents[0].totalCents,10800)
 assert.equal(x.qa.some(y=>y.code==='HEADER_TOTAL_MISMATCH'),true)
 assert.deepEqual(x.summary.quarantinedDocuments,['PO691019001'])
})
test('an unreadable item is never silently dropped',()=>{
 const x=parseExpressPoReport(sample({extraInvalidItem:true}))
 assert.equal(x.qa.some(y=>y.code==='ITEM_UNREADABLE'),true)
})
test('duplicate document identity is reported and quarantined',()=>{
 const x=parseExpressPoReport(sample({duplicate:true}))
 assert.equal(x.qa.some(y=>y.code==='DUPLICATE_PO'),true)
})
