'use strict'
const {createHash}=require('node:crypto')
const VALID=/^(?:PO\d{9}|PL\d{7}[A-Z]?|PC\d{8,9}|PR\d{7,9})$/
const GLOBAL_BLOCK=new Set(['REPORT_COUNT_MISMATCH','REPORT_SUM_MISMATCH','PO_HEADER_UNREADABLE',
 'DOCUMENT_HEADER_UNRECOGNIZED','DOCUMENT_DATE_UNREADABLE','DOC_TYPE_CONFLICT','ORPHAN_ITEM'])
const norm=s=>String(s??'').trim().normalize('NFKC').toUpperCase()
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
function identity(d){
 if(!d||!VALID.test(String(d.poNo||''))||!/^AP-\d+$/.test(String(d.supplierCode||'')))
  throw Error('INVALID_DOCUMENT_IDENTITY')
 return norm(d.poNo)+'|'+norm(d.supplierCode)
}
function fingerprint(d){
 const seq=new Set()
 if(!Array.isArray(d.items))throw Error('MISSING_ITEM_LINES')
 const items=d.items.map(item=>{
  if(!Number.isSafeInteger(item.sequence)||item.sequence<=0||seq.has(item.sequence))
   throw Error('INVALID_ITEM_SEQUENCE')
  seq.add(item.sequence)
  if(!Number.isFinite(item.quantity)||item.quantity<0)throw Error('INVALID_ITEM_QUANTITY')
  return [item.sequence,norm(item.itemCode),norm(item.description),item.quantity,norm(item.unit),
   item.unitPriceCents,item.lineDiscountCents,item.lineDiscountPercent,item.amountCents]
 }).sort((a,b)=>a[0]-b[0])
 return digest([norm(d.poNo),norm(d.supplierCode),norm(d.supplierName),d.documentDate,
  d.plannedReceiptDate,d.subtotalCents,d.vatCents,d.totalCents,
  [...(d.projectCodes||[])].map(norm).sort(),items])
}
/**
 * Pure, bounded, read-only plan. No database or Google Sheets writes.
 * canonical=null means latest Materials records have not been verified; fail closed.
 * Existing multi-Plot rows are not merged or overwritten based on document number alone.
 */
function planExpressDelta(report, staged=[], canonical=null, options={}){
 if(!report||!Array.isArray(report.documents)||!Array.isArray(report.qa)||
    !/^[a-f0-9]{64}$/.test(report.sourceSha256||'')||!Array.isArray(staged))
  throw Error('INVALID_DELTA_INPUT')
 const limit=Number(options.maxDocumentsPerPage||100),itemLimit=Number(options.maxItemsPerPage||1000)
 if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(itemLimit)||itemLimit<1||itemLimit>3000)
  throw Error('INVALID_DELTA_LIMITS')
 if(canonical!==null&&!Array.isArray(canonical))throw Error('INVALID_CANONICAL_SNAPSHOT')
 const stageIndex=new Map(),canonicalIndex=new Map()
 for(const row of staged){
  const key=identity(row)
  if(stageIndex.has(key))throw Error('DUPLICATE_STAGING_IDENTITY')
  if(!/^[a-f0-9]{64}$/.test(String(row.fingerprint||'')))throw Error('STAGING_FINGERPRINT_REQUIRED')
  stageIndex.set(key,row.fingerprint)
 }
 if(canonical)for(const row of canonical){
  const docNo=norm(row.po_no||row.pr_no)
  if(!docNo)continue
  if(!VALID.test(docNo)||!row.id)throw Error('INVALID_CANONICAL_REFERENCE')
  const list=canonicalIndex.get(docNo)||[];list.push(row);canonicalIndex.set(docNo,list)
 }
 const blocked=report.qa.filter(i=>GLOBAL_BLOCK.has(i.code)).map(i=>i.code)
 const qaIds=new Set(report.qa.filter(i=>i.poNo).map(i=>norm(i.poNo)))
 const seen=new Set(),plans=[],counts={unchanged:0,new_candidate:0,changed_review:0,
  hold_qa:0,hold_mapping:0,hold_canonical:0,hold_existing:0}
 for(const d of report.documents){
  const key=identity(d)
  if(seen.has(key))throw Error('DUPLICATE_SOURCE_IDENTITY')
  seen.add(key)
  const hash=fingerprint(d),previous=stageIndex.get(key),matches=canonicalIndex.get(norm(d.poNo))||[]
  let decision
  if(blocked.length||qaIds.has(norm(d.poNo))||!d.items.length)decision='hold_qa'
  else if(!Array.isArray(d.projectCodes)||!d.projectCodes.length)decision='hold_mapping'
  else if(previous===hash)decision='unchanged'
  else if(previous)decision='changed_review'
  else if(canonical===null)decision='hold_canonical'
  else if(matches.length)decision='hold_existing' // preserve all existing UUIDs; line matching not proved
  else decision='new_candidate' // staging candidate only, never Production upsert
  counts[decision]++
  plans.push({key,sourceSha256:report.sourceSha256,fingerprint:hash,decision,
   lineCount:d.items.length,projectCodes:[...(d.projectCodes||[])],
   existingIds:matches.map(r=>String(r.id)).sort()})
 }
 plans.sort((a,b)=>a.key.localeCompare(b.key))
 const pages=[]
 let page=[],pageItems=0
 for(const doc of plans){
  if(doc.lineCount>itemLimit)throw Error('DOC_EXCEEDS_PAGE_LIMIT')
  if(page.length&&(page.length>=limit||pageItems+doc.lineCount>itemLimit)){
   pages.push(page);page=[];pageItems=0
  }
  page.push(doc);pageItems+=doc.lineCount
 }
 if(page.length)pages.push(page)
 return {gate:blocked.length?'HOLD_SOURCE_INTEGRITY':canonical===null?'HOLD_CANONICAL_SNAPSHOT':
  counts.hold_qa||counts.hold_existing||counts.changed_review||counts.hold_mapping?'HOLD_REVIEW':'STAGING_CANDIDATES_ONLY',
  globalIssues:[...new Set(blocked)],summary:counts,pages,
  receiptEvidence:'unverified',productionWritesAllowed:false}
}
module.exports={identity,fingerprint,planExpressDelta}
