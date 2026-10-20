'use strict'

const EXPECTED_SHEETS = ['Runs','Documents','Items','Issues']
const MAX_DOCUMENTS=500, MAX_ITEMS=3000, MAX_ISSUES=300
const amount = n => (Number(n||0)/100).toFixed(2)
const str = n => String(n ?? '')
function buildStagingRows(report, source, importedAt) {
  if (!report || !Array.isArray(report.documents) || !Array.isArray(report.qa) ||
      !/^[a-f0-9]{64}$/.test(report.sourceSha256 || '') ||
      report.documents.length > MAX_DOCUMENTS || report.qa.length > MAX_ISSUES ||
      !Number.isFinite(Date.parse(importedAt)) ||
      !/^\d{12}\.csv$/i.test(source.fileName || '')) throw Error('INVALID_STAGING_INPUT')
  const sha = report.sourceSha256
  const docs=[],items=[],issues=[],unique=new Set()
  const holding = new Set(report.summary.quarantinedDocuments || [])
  const globalErrors=['REPORT_COUNT_MISMATCH','REPORT_SUM_MISMATCH','PO_HEADER_UNREADABLE','ORPHAN_ITEM']
  if (report.qa.some(issue=>globalErrors.includes(issue.code))) throw Error('SOURCE_REPORT_QA_BLOCK')
  for(const doc of report.documents){
    if (!/^(PO\d{9}|PL\d{7}[A-Z]?)$/.test(doc.poNo) || unique.has(doc.poNo) || !Array.isArray(doc.items)) throw Error('INVALID_PO_IDENTITY')
    unique.add(doc.poNo)
    const decision=holding.has(doc.poNo)?'hold_qa':doc.projectMapping==='unmapped'?'hold_mapping':'staged_verified'
    const p=Array.isArray(doc.projectCodes)?doc.projectCodes.join(' | '):''
    docs.push([sha,doc.poNo,str(doc.documentDate),str(doc.supplierCode),str(doc.supplierName),
      amount(doc.subtotalCents),amount(doc.vatCents),amount(doc.totalCents),str(doc.expressReceivedAllFlag),
      p,decision,str(doc.reference),Array.isArray(doc.notes)?doc.notes.join(' | '):'',doc.items.length])
    const lines=new Set()
    for(const item of doc.items){
      const seq=Number(item.sequence)
      if(!Number.isInteger(seq)||seq<1||lines.has(seq))throw Error('INVALID_ITEM_IDENTITY')
      lines.add(seq)
      items.push([sha,doc.poNo,seq,str(item.itemCode),str(item.description),Number(item.quantity),str(item.unit),
        amount(item.unitPriceCents),amount(item.lineDiscountCents),item.lineDiscountPercent??'',
        amount(item.amountCents),decision])
    }
  }
  if(items.length>MAX_ITEMS)throw Error('STAGING_ITEMS_LIMIT')
  for(const issue of report.qa){issues.push([sha,str(issue.code),str(issue.poNo),str(issue.line),str(issue.field)])}
  const run=[sha,source.fileName,str(source.modifiedTime),importedAt,docs.length,items.length,issues.length,'STAGED_PREVIEW']
  return {Runs:[run],Documents:docs,Items:items,Issues:issues}
}
function toAppendRequests(rows,sheetIds){
  return EXPECTED_SHEETS.map(name=>({appendCells:{sheetId:sheetIds[name],fields:'userEnteredValue',rows:rows[name].map(row=>({values:row.map(value=>({userEnteredValue:typeof value==='number'&&Number.isFinite(value)?{numberValue:value}:{stringValue:str(value)}}))}))}})).filter(req=>req.appendCells.rows.length)
}
module.exports={buildStagingRows,toAppendRequests,EXPECTED_SHEETS}
