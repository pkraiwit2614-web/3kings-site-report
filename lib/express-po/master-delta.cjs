'use strict'
// Pure read-only proposal layer for the existing XLSX Masters. No Drive/Supabase IO.
// Caller MUST independently verify exact source/master revisions, tab + cell layout,
// permissions and original file ID before considering a separate scoped writeback.
const PO=/^(?:PO\d{9}|PL\d{7}[A-Z]?)$/;
const norm=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const normalizedText=s=>norm(s).replace(/\s+/g,' ');
const VALID_FILES=new Set(['materials','pr_followup']);
function fail(code){throw Error(code)}
function makeKey(row){
 if(!VALID_FILES.has(row.file)||!Number.isSafeInteger(row.row)||row.row<1||
   typeof row.sheet!=='string'||!row.sheet.trim())fail('INVALID_MASTER_ROW')
 return row.file+'|'+row.sheet+'|'+row.row
}
function planMasterDelta({report,masterRows,links,sourceRevision,masterRevisions}={}){
 if(!report||report.reportType!=='PO_PL'||!Array.isArray(report.documents)||
   !Array.isArray(report.qa)||!Array.isArray(masterRows)||!Array.isArray(links)||
   !/^[a-f0-9]{64}$/.test(String(report.sourceSha256||''))||
   !sourceRevision||!masterRevisions||
   !Object.keys(masterRevisions).every(k=>VALID_FILES.has(k))||
   !['materials','pr_followup'].every(k=>
     typeof masterRevisions[k]==='string'&&/^[a-f0-9]{64}$/.test(masterRevisions[k])))
  fail('MASTER_PREFLIGHT_REQUIRED')
 const rows=new Map(),docs=new Map(),seenLinks=new Set(),patches=[],holds=[],unchanged=[]
 for(const row of masterRows){const key=makeKey(row);
   if(rows.has(key))fail('DUPLICATE_MASTER_ROW');rows.set(key,row)}
 for(const d of report.documents){
   if(!PO.test(String(d.poNo||''))||!String(d.supplierCode||'').startsWith('AP-')||
     !Array.isArray(d.items))fail('INVALID_SOURCE_DOCUMENT')
   if(docs.has(d.poNo))fail('DUPLICATE_SOURCE_DOCUMENT')
   docs.set(d.poNo,d)
 }
 const globalBlock=report.qa.some(x=>!x.poNo)
 const documentIssues=new Set(report.qa.map(x=>x.poNo).filter(Boolean))
 for(const link of links){
   const id=norm(link.poNo)+'|'+String(link.sequence)+'|'+norm(link.projectCode)+'|'+String(link.masterKey)
   if(seenLinks.has(id))fail('DUPLICATE_MASTER_LINK')
   seenLinks.add(id)
   const hold=reason=>holds.push({masterKey:String(link.masterKey||''),poNo:String(link.poNo||''),reason})
   const doc=docs.get(link.poNo),row=rows.get(link.masterKey)
   if(!doc||!row){hold('UNRESOLVED_SOURCE_OR_MASTER');continue}
   if(globalBlock||documentIssues.has(doc.poNo)){hold('EXPRESS_QA_HOLD');continue}
   if(norm(doc.supplierCode)!==norm(link.supplierCode)||
     !Array.isArray(doc.projectCodes)||!doc.projectCodes.includes(link.projectCode)||
     norm(row.projectCode)!==norm(link.projectCode)){hold('VENDOR_OR_PLOT_UNVERIFIED');continue}
   const item=doc.items.find(x=>x.sequence===link.sequence)
   if(!item||!item.itemCode||!row.itemCode||
      norm(item.itemCode)!==norm(row.itemCode)||
      !row.description||normalizedText(item.description)!==normalizedText(row.description)||
      !row.unit||norm(item.unit)!==norm(row.unit)||
      !Number.isFinite(Number(row.quantity))||
      Number(item.quantity)!==Number(row.quantity)){
     hold('LINE_UNIT_QUANTITY_UNVERIFIED');continue
   }
   if(row.protectedFormula===true||row.locked===true){
     hold('PROTECTED_OR_FORMULA_CELL');continue
   }
   if(row.file==='materials'){
     if(row.status==='สั่งแล้ว'){
       unchanged.push({masterKey:link.masterKey,reason:'ORDERED_ALREADY'});continue
     }
     if(row.status!=='ยังไม่สั่ง'){
       hold('STATUS_REQUIRES_REVIEW');continue
     }
     patches.push({masterKey:link.masterKey,field:'status',expected:'ยังไม่สั่ง',
       value:'สั่งแล้ว',reason:'MATCHED_EXPRESS_PO_NOT_RECEIPT',
       poNo:doc.poNo,sourceSha256:report.sourceSha256})
   }else{
     if(norm(row.poNo)===norm(doc.poNo)){
       unchanged.push({masterKey:link.masterKey,reason:'PO_REF_ALREADY'});continue
     }
     if(String(row.poNo||'').trim()){hold('EXISTING_PO_REF_CONFLICT');continue}
     patches.push({masterKey:link.masterKey,field:'poNo',expected:'',
       value:doc.poNo,reason:'MATCHED_EXPRESS_PO_REFERENCE',
       poNo:doc.poNo,sourceSha256:report.sourceSha256})
   }
 }
 // A Master row must never receive multiple cell writes in one batch.
 const used=new Set()
 for(const p of patches){
   const key=p.masterKey+'|'+p.field
   if(used.has(key))fail('AMBIGUOUS_MASTER_TARGET')
   used.add(key)
 }
 patches.sort((a,b)=>(a.masterKey+'|'+a.field).localeCompare(b.masterKey+'|'+b.field))
 holds.sort((a,b)=>a.masterKey.localeCompare(b.masterKey)||a.reason.localeCompare(b.reason))
 return {sourceRevision,masterRevisions,patches,holds,unchanged,
   summary:{proposedCells:patches.length,heldLinks:holds.length,
     unchangedLinks:unchanged.length,unlinkedSourceDocuments:report.documents.filter(d=>
       !links.some(l=>l.poNo===d.poNo)).length},
   // Explicitly no writer; must use independently authorized original-ID XLSX patch.
   writesAllowed:false,receiptStatus:'unverified'}
}
module.exports={planMasterDelta,makeKey}
