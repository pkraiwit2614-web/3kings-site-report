'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {selectExpressCsv}=require('../lib/express-po/source-selection.cjs')
const file=(name,modifiedTime='2026-10-21T05:01:39Z')=>({
 id:'12ZQFaFGpQtNirb7ekKGfHrtUoQ_wHXI2',name,mimeType:'text/csv',
 modifiedTime,size:'3691052'
})
test('selects the verified 21 October 2026 Express history names',()=>{
 assert.equal(selectExpressCsv([file('PO2023-211020260935.csv')],'po_history').name,'PO2023-211020260935.csv')
 assert.equal(selectExpressCsv([file('PR2023-211020260935.csv')],'pr_history').name,'PR2023-211020260935.csv')
})
test('accepts legacy 2024-Now and chooses newest explicitly dated export',()=>{
 assert.equal(selectExpressCsv([file('PO2024-Now.csv')],'po_history').name,'PO2024-Now.csv')
 assert.equal(selectExpressCsv([file('PR2024-Now.csv')],'pr_history').name,'PR2024-Now.csv')
 assert.equal(selectExpressCsv([file('PO2023-201020260935.csv'),file('PO2023-211020260935.csv')],'po_history').name,'PO2023-211020260935.csv')
})
test('keeps daily export modes separate from full histories',()=>{
 assert.equal(selectExpressCsv([file('211020260935.csv')],'po_daily').name,'211020260935.csv')
 assert.equal(selectExpressCsv([file('PR-211020260935.csv')],'pr_daily').name,'PR-211020260935.csv')
 assert.throws(()=>selectExpressCsv([file('PO2023-211020260935.csv')],'po_daily'),/NO_VALID_EXPRESS_CSV/)
})
test('fails closed for unexpected, malformed, duplicate or oversized exports',()=>{
 assert.throws(()=>selectExpressCsv([file('PO2023-321320260935.csv')],'po_history'),/NO_VALID_EXPRESS_CSV/)
 assert.throws(()=>selectExpressCsv([file('PO2023-211020260935.csv.exe')],'po_history'),/NO_VALID_EXPRESS_CSV/)
 assert.throws(()=>selectExpressCsv([file('PO2023-211020260935.csv'),file('PO2023-211020260935.csv')],'po_history'),/SOURCE_AMBIGUOUS/)
 assert.throws(()=>selectExpressCsv([{...file('PO2023-211020260935.csv'),size:'9000000'}],'po_history'),/NO_VALID_EXPRESS_CSV/)
 assert.throws(()=>selectExpressCsv([file('PO2023-211020260935.csv')],'unexpected'),/INVALID_SOURCE_MODE/)
})
test('preview API delegates file selection to the isolated selector',()=>{
 const route=fs.readFileSync('app/api/sync/express-po/route.ts','utf8')
 assert.match(route,/selectExpressCsv\(files\.files\|\|\[\],sourceMode\)/)
 assert.match(route,/SOURCE_FILE_CHANGED_DURING_READ/)
 assert.match(route,/process\.env\.VERCEL_ENV!=='preview'/)
})


test('bounded PO/PR period exports are distinct from cumulative history and validate dates',()=>{
 const list=[
  file('PO2023-211020260935.csv'),
  file('PR2023-211020260935.csv'),
  file('PO PL 15102026-21102026.csv','2026-10-22T01:56:42Z'),
  file('PR 15102026-21102026.csv','2026-10-22T01:57:15Z'),
 ]
 assert.equal(selectExpressCsv(list,'po_range').name,'PO PL 15102026-21102026.csv')
 assert.equal(selectExpressCsv(list,'pr_range').name,'PR 15102026-21102026.csv')
 assert.equal(selectExpressCsv(list,'po_history').name,'PO2023-211020260935.csv')
 assert.equal(selectExpressCsv(list,'pr_history').name,'PR2023-211020260935.csv')
 assert.throws(()=>selectExpressCsv([file('PO PL 32132026-21102026.csv')],'po_range'),/NO_VALID_EXPRESS_CSV/)
 assert.throws(()=>selectExpressCsv([file('PO PL 22102026-21102026.csv')],'po_range'),/NO_VALID_EXPRESS_CSV/)
 assert.throws(()=>selectExpressCsv([file('PR 15102026-21102026.csv')],'po_range'),/NO_VALID_EXPRESS_CSV/)
})
