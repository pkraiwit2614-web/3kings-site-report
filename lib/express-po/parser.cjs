'use strict'
const {createHash}=require('node:crypto')
function cents(v) {
 if(!/^\d[\d,]*\.\d{2}$/.test(String(v)))throw Error('INVALID_MONEY')
 const n=Number(String(v).replaceAll(',',''))
 if(!Number.isFinite(n)||n<0||n>1e12)throw Error('INVALID_MONEY')
 return Math.round(n*100)
}
function isoDate(s) {
 const m=/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s)
 if(!m)throw Error('INVALID_DATE')
 // Express prints two-digit Thai Buddhist years (69 = 2569 BE = 2026 CE).
 const y=2500+Number(m[3])-543
 const d=new Date(Date.UTC(y,Number(m[2])-1,Number(m[1])))
 if(d.getUTCDate()!==Number(m[1])||d.getUTCMonth()!==Number(m[2])-1)throw Error('INVALID_DATE')
 return d.toISOString().slice(0,10)
}
function projectCodes(s){
 s=String(s||'').normalize('NFKC')
 const codes=new Set()
 for(const m of s.matchAll(/\bPlot[\s-]*(10|[2-9])((?:\s*[,/&+]\s*(?:10|[2-9]))*)/gi)){
  for(const n of [m[1],...[...m[2].matchAll(/10|[2-9]/g)].map(x=>x[0])])if(['2','3','6','7','8','9','10'].includes(n))codes.add('AV-P'+n)
 }
 if(/Above\s*Condo\s*A\b|Condo\s*Building\s*A\b/i.test(s))codes.add('CONDO-A')
 if(/Above\s*Condo\s*B\b|Condo\s*Building\s*B\b/i.test(s))codes.add('CONDO-B')
 if(/\bMirage\b/i.test(s))codes.add('MIRAGE')
 return [...codes]
}
// Exported .csv is a paginated, Windows-874 FIXED-WIDTH report, not an RFC-4180 CSV.
function parseExpressPoReport(source){
 if(!Buffer.isBuffer(source)||!source.length||source.length>8_000_000)throw Error('INVALID_SOURCE_SIZE')
 const txt=new TextDecoder('windows-874',{fatal:true}).decode(source).replace(/\u00a0/g,' ')
 const isPO=txt.includes('รายงานใบสั่งซื้อ'),isPR=txt.includes('รายงานใบขอซื้อ')
 if(txt.includes('\ufffd')||isPO===isPR||!txt.includes('รวมทั้งสิ้น'))
   throw Error('UNSUPPORTED_EXPRESS_REPORT')
 const reportType=isPO?'PO_PL':'PR_PC'
 const documents=[],qa=[],cancelled=[],seen=new Set()
 let supplierName=null,supplierCode=null,active=null,inNote=false,total=null
 const lines=txt.replace(/\r\n?/g,'\n').split('\n')
 for(let ix=0;ix<lines.length;ix++){
  const line=lines[ix].replace(/[\x00-\x1f]/g,'').replace(/\u00a0/g,' ').replace(/^"/,'').replace(/"$/,'')
  const t=line.trim()
  if(!t){inNote=false;continue}
  const supplier=/^\s{2,}(.+?)\s*\/(AP-\d+)\s*$/.exec(line)
  if(supplier&&!/^รวม/.test(supplier[1].trim())){
   supplierName=supplier[1].trim();supplierCode=supplier[2];active=null;inNote=false;continue
  }
  const report=/^รวมทั้งสิ้น\s+(\d+|\*{2,})\s+ใบ\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/.exec(t)
  if(report){
   total={count:/^\d+$/.test(report[1])?Number(report[1]):null,subtotalCents:cents(report[2]),vatCents:cents(report[3]),totalCents:cents(report[4])}
   active=null;inNote=false;continue
  }
  if(/^\*\s*(?:PO|PL|PC|PR)/.test(t)){
   cancelled.push({line:ix+1,identifier:'UNUSABLE_CANCELLED_REFERENCE'})
   active=null;inNote=false;continue
  }
  const header=/^\s*(PO\d{9}|PL\d{7}[A-Z]?|PC\d{8,9}|PR\d{7,9})\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+)$/.exec(line)
  if(header){
   if((isPO&&!/^(PO|PL)/.test(header[1]))||(isPR&&!/^(PC|PR)/.test(header[1]))) {qa.push({code:'DOC_TYPE_CONFLICT',line:ix+1});active=null;continue}
   inNote=false
   const flag=/^(.*?)\s{2,}([YN])(?:\s{2,}(.+))?\s*$/.exec(header[4])
   const sums=flag&&/([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/.exec(flag[1])
   if(!supplierCode||!supplierName||!flag||!sums){
    qa.push({code:'PO_HEADER_UNREADABLE',line:ix+1});active=null;continue
   }
   const poNo=header[1]
   if(seen.has(poNo)){qa.push({code:'DUPLICATE_PO',poNo,line:ix+1});active=null;continue}
   seen.add(poNo)
   let documentDate,plannedReceiptDate
   try{documentDate=isoDate(header[2]);plannedReceiptDate=isoDate(header[3])}
   catch{qa.push({code:'DOCUMENT_DATE_UNREADABLE',poNo,line:ix+1});active=null;continue}
   active={poNo,docType:poNo.slice(0,2),documentDate,plannedReceiptDate,
    supplierCode,supplierName,subtotalCents:cents(sums[1]),vatCents:cents(sums[2]),
    totalCents:cents(sums[3]),expressReceivedAllFlag:isPO?flag[2]:null,expressPendingApprovalFlag:isPR?flag[2]:null,
    reference:(flag[3]||'').trim(),notes:[],items:[],sourceLine:ix+1}
   documents.push(active)
   if(Math.abs(active.subtotalCents+active.vatCents-active.totalCents)>1)
    qa.push({code:'HEADER_TOTAL_MISMATCH',poNo,line:ix+1})
   continue
  }
  if(/^หมายเหตุ\s*:/i.test(t)){inNote=Boolean(active);continue}
  if(inNote&&active&&/^\s{10,}\S/.test(line)&&!/^(?:-{5,}|={5,})/.test(t)){
   active.notes.push(t);continue
  }
  const item=(isPO?/^\s*(\d+)\)\s+([A-Za-z0-9-]+)\s+(.+)$/:/^\s*(\d+)\s+([A-Za-z0-9-]+)\s+(.+)$/).exec(line)
  if(item&&active){
   inNote=false
   const f=/^(.*?)\s{2,}([\d,]+\.\d{2})(\S+)\s{2,}([\d,]+\.\d{2})\s{2,}(?:([\d,]+\.\d{2}|\d+(?:\.\d+)?%)\s{2,})?([\d,]+\.\d{2})\s*$/.exec(item[3])
   if(!f){qa.push({code:'ITEM_UNREADABLE',poNo:active.poNo,line:ix+1});continue}
   const sequence=Number(item[1])
   if(active.items.some(x=>x.sequence===sequence)){
    qa.push({code:'DUPLICATE_LINE_NUMBER',poNo:active.poNo,line:ix+1});continue
   }
   active.items.push({sequence,itemCode:item[2],description:f[1].trim(),
    quantity:Number(f[2].replaceAll(',','')),unit:f[3],unitPriceCents:cents(f[4]),
    lineDiscountCents:f[5]&&!f[5].endsWith('%')?cents(f[5]):0,
    lineDiscountPercent:f[5]?.endsWith('%')?Number(f[5].slice(0,-1)):null,
    amountCents:cents(f[6]),sourceLine:ix+1})
   continue
  }
  if(item&&!active)qa.push({code:'ORPHAN_ITEM',line:ix+1})
  // Numeric-looking document headers that were not parsed must be quarantined,
  // never silently lost from a page of an accounting export.
  if(!header&&/^\s*(?:PO|PL|PC|PR)\d{4,}[A-Z]?\s+\d{2}\/\d{2}\/\d{2}/.test(line))
   qa.push({code:'DOCUMENT_HEADER_UNRECOGNIZED',line:ix+1})
  if(!item&&active&&(isPO?/^\s*\d+\)\s+/ : /^\s*\d+\s+[A-Za-z]\d/).test(line))
   qa.push({code:'ITEM_UNREADABLE',poNo:active.poNo,line:ix+1})
 }
 if(!total||!documents.length)throw Error('MISSING_REPORT_TOTAL_OR_DOCUMENTS')
 for(const d of documents){
  d.projectCodes=projectCodes([d.reference,...d.notes].join(' '))
  d.projectMapping=d.projectCodes.length===1?'matched':d.projectCodes.length>1?'shared':'unmapped'
  if(!d.items.length)qa.push({code:'PO_WITHOUT_ITEMS',poNo:d.poNo,line:d.sourceLine})
 }
 if(total.count!==null&&total.count!==documents.length+cancelled.length)qa.push({code:'REPORT_COUNT_MISMATCH'})
 for(const key of ['subtotalCents','vatCents','totalCents'])
  if(documents.reduce((n,d)=>n+d[key],0)!==total[key])
   qa.push({code:'REPORT_SUM_MISMATCH',field:key})
 return {sourceSha256:createHash('sha256').update(source).digest('hex'),reportType,documents,cancelled,qa,
  summary:{reportedDocuments:total.count,validDocuments:documents.length,cancelledDocuments:cancelled.length,
   lineItems:documents.reduce((n,d)=>n+d.items.length,0),reportedTotalCents:total.totalCents,
   unmappedDocuments:documents.filter(d=>d.projectMapping==='unmapped').length,
   quarantinedDocuments:[...new Set(qa.filter(q=>q.poNo).map(q=>q.poNo))]}}
}
module.exports={parseExpressPoReport,parseExpressReport:parseExpressPoReport,projectCodes}
