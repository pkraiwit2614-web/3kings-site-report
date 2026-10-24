'use strict';
// Pure parser for 3 Kings Express CP874 fixed-width print CSV exported as .csv.
// All helper names prefixed to avoid colliding with existing Apps Script.
function EB_normalize_(v){return String(v??'').replace(/\u00a0/g,' ').normalize('NFKC').trim()}
function EB_cleanLine_(line){return String(line).replace(/\x1b\[[\d;]*[A-Za-z]|\x1b&[a-zA-Z0-9]+/g,'').replace(/\u00a0/g,' ').replace(/(?:,\s*){2,}$/,'').replace(/^"/,'').replace(/"+$/,'')}
function EB_projects_(s){s=EB_normalize_(s);const p=new Set();for(const m of s.matchAll(/\bPlot[\s-]*(10|[2-9])((?:\s*[,/&+]\s*(?:10|[2-9]))*)/gi))for(const n of [m[1],...[...m[2].matchAll(/10|[2-9]/g)].map(x=>x[0])])p.add('AV-P'+n);
if(/Above\s*Condo\s*A\b|Condo\s*Building\s*A\b|Condo\s*A\b/i.test(s))p.add('CONDO-A');if(/Above\s*Condo\s*B\b|Condo\s*Building\s*B\b|Condo\s*B\b/i.test(s))p.add('CONDO-B');if(/\bMirage\b|มิราจ/i.test(s))p.add('MIRAGE');if(/Hennessy|Henessy|เฮนเนสซี่/i.test(s))p.add('HENNESSY');return [...p]}
function EB_amount_(s){if(!/^[0-9,]+\.[0-9]{2}$/.test(s))throw Error('MONEY_PARSE');return Math.round(Number(s.replaceAll(',',''))*100)}
function EB_parseFile_(text, source){
if(!/รายงานใบสั่งซื้อ|รายงานใบขอซื้อ/.test(text))throw Error('UNSUPPORTED_REPORT_'+source.name);
const kind=/รายงานใบสั่งซื้อ/.test(text)?'PO_PL':'PR_PC';
const docs=[],issues=[],cancel=new Set(),seen=new Set();let active=null,supplier='',docLines=0;
for(const [lineIdx,raw] of text.replace(/\r\n?/g,'\n').split('\n').entries()){
 const line=EB_cleanLine_(raw),t=line.trim();if(!t)continue;
 const supplierMatch=/^\s{2,}(.+?)\s*\/AP-?(\d{3,4})\s*$/.exec(line);
 if(supplierMatch&&!/^รวม/.test(supplierMatch[1].trim())){supplier=supplierMatch[1].trim()+' /AP-'+supplierMatch[2];active=null;continue;}
 const starred=/^\s*\*\s*(?:(PO|PL|PR|PC)(\d{6,9}[A-Z]?))?\b/.exec(line);
 if(starred){if(starred[1])cancel.add(starred[1]+starred[2]);active=null;continue;}
 if(/^\s*(?:PRTEST|POTEST|PCTEST|PLTEST)\b/i.test(line)){issues.push({source:source.name,line:lineIdx+1,reason:'SKIP_TEST_DOCUMENT'});active=null;continue;}
 const hdr=/^\s*(PO\d{9}|PL\d{7}[A-Z]?|PC\d{8,9}|PR\d{7,9})\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+)$/.exec(line);
 if(hdr){
   const docNo=hdr[1];if((kind==='PO_PL'&&!/^(PO|PL)/.test(docNo))||(kind==='PR_PC'&&!/^(PR|PC)/.test(docNo))){issues.push({source:source.name,line:lineIdx+1,doc:docNo,reason:'TYPE'});active=null;continue;}
   if(seen.has(docNo)){issues.push({source:source.name,line:lineIdx+1,doc:docNo,reason:'REPEATED_DOC'});active=null;continue;}
   seen.add(docNo);
   const tail=hdr[4].match(/^.*?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([YN])(?:\s+(.*))?$/);
   if(!tail){issues.push({source:source.name,line:lineIdx+1,doc:docNo,reason:'HEADER_FIELDS'});active=null;continue;}
   const data={group:kind,docNo:docNo,date:hdr[2],receiptPlan:hdr[3],supplier:supplier,subtotal:EB_amount_(tail[1]),vat:EB_amount_(tail[2]),total:EB_amount_(tail[3]),source:source.name,sourceId:source.id,sourceLine:lineIdx+1,reference:tail[5]||'',notes:[],lines:[],lastSeen:source.modifiedAt||'',qa:[]};
   if(data.subtotal+data.vat!==data.total)data.qa.push('HEADER_TOTAL_MISMATCH');
   if(!supplier)data.qa.push('SUPPLIER_MISSING');
   docs.push(data);active=data;continue;
 }
 // Avoid seeing spurious item rows outside a known document.
 if(active){
   const im=/^\s*(\d+)\)?\s+([A-Za-z0-9-]+)[ \t](.*)$/.exec(line);
   if(im){
      const parsed=/^(.*?)\s{2,}([\d,]+\.\d{2})(\S+)\s{2,}([\d,]+\.\d{2})\s{2,}(?:([\d,]+\.\d{2}|\d+(?:\.\d+)?%)\s{2,})?([\d,]+\.\d{2})\s*$/.exec(im[3]);
      if(!parsed){issues.push({source:source.name,line:lineIdx+1,doc:active.docNo,reason:'ITEM_UNREADABLE'});active.qa.push('ITEM_UNREADABLE');continue;}
      const seq=Number(im[1]);if(active.lines.some(x=>x.seq===seq)){issues.push({source:source.name,line:lineIdx+1,doc:active.docNo,reason:'ITEM_DUP'});active.qa.push('ITEM_DUP');continue;}
      if(!parsed[1].trim()) active.qa.push('EMPTY_ITEM_DESCRIPTION');
      active.lines.push({seq,code:im[2],description:parsed[1].trim(),qty:Number(parsed[2].replaceAll(',','')),unit:parsed[3],unitPrice:EB_amount_(parsed[4]),amount:EB_amount_(parsed[6]),sourceLine:lineIdx+1});docLines++;continue;
   }
   if(/^หมายเหตุ\s*:/.test(t))continue;
   if(/^\s{10,}[-+\p{L}]/u.test(line)&&active.notes.length<20)active.notes.push(t);
 }
}
for(const d of docs){d.plot=EB_projects_(d.reference+' '+d.notes.join(' '));if(!d.lines.length)d.qa.push('NO_LINES')}
return {kind,docs,issues,cancel:[...cancel],parsedLines:docLines};
}
function EB_mergeReports_(files){
 let docs=new Map(),canceled=new Set(),issues=[];
 // Newest source wins for each doc identity, regardless of filename, with modification timestamp.
 const sorted=files.slice().sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)||b.name.localeCompare(a.name));
 for(const f of sorted){const p=EB_parseFile_(f.text,f);issues.push(...p.issues);for(const n of p.cancel)canceled.add(n);
   for(const d of p.docs){const key=d.group+'|'+d.docNo;const older=docs.get(key);
       if(!older)docs.set(key,d); else if(older.total!==d.total||JSON.stringify(older.lines.map(x=>[x.seq,x.code,x.qty,x.unit,x.amount]))!==JSON.stringify(d.lines.map(x=>[x.seq,x.code,x.qty,x.unit,x.amount]))) {
          older.qa.push('CONFLICTING_EXPORT_REVISION');issues.push({source:d.source,line:d.sourceLine,doc:d.docNo,reason:'CONFLICTING_EXPORT_REVISION'});
       }
   }
 }
 const final=[...docs.values()].filter(d=>!canceled.has(d.docNo));
 return {docs:final,skippedCanceled:canceled.size,issues,counts:{docs:final.length,lines:final.reduce((n,d)=>n+d.lines.length,0),held:final.filter(d=>d.qa.length).length}};
}


/**
 * 3 Kings Express full-history QA importer — ISOLATED TEST COPY ONLY.
 * Dependency: ExpressBridgeAppendQA already installed and previously PASS.
 * DO NOT install a time trigger or run against the original Materials Master.
 * Input: raw fixed-width CP874 / TIS-620 CSV in the existing Express folder.
 * Output: two QA-only worksheets in original-ID QA copy (never Master itself).
 */
const EB_FULL_QA = Object.freeze({
 sourceFolderId:'1eGDpZ6FK7vjeQaExfhMeSig1PI6gM5DI',
 qaCopyId:'1GeZZHQdrLPv83xtPx1pgA4HipFSEvtWF',
 originalMasterId:'1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn',
 originalSha:'3ab818826c1a4da6dd4848ec94c5b857d5af7aadbd71085b95928e1e692b7394',
 allowedSource:/^(?:PO|PR)20\d{2}-\d{12}\.csv$/i,
 // only sources checked in by owner; new files are accepted with strict QA and revision.
 sourceMinimum:2, maxSources:90, maxBytesPerSource:8000000,
 expectedSheetPaths:['xl/worksheets/sheet12.xml','xl/worksheets/sheet13.xml'],
 qaHashProp:'EXPRESS_BRIDGE_QA_LAST_WORKSHEETS_SHA_20261022',
 maxWorkbookBytes:20000000,
 docColumns:['DocType','DocumentNo','DateBE','Supplier','PlotHint','PlotStatus','LineCount','SourceQA','SourceFile','SourceEvidence','SourceLine','SourceModified','MasterDecision','Subtotal','VAT','GrandTotal'],
 itemColumns:['DocType','DocumentNo','ItemSeq','ItemCode','Description','Quantity','Unit','UnitPrice','LineAmount','Supplier','PlotHint','SourceFile','SourceLine','SourceEvidence','ReviewStatus']
});
function EB_qaHash_(bytes){return expressBridgeAppendQASha_(bytes)}
function EB_qaHashText_(s){return EB_qaHash_(Utilities.newBlob(String(s),'text/plain').getBytes())}
function EB_qaXML_(s){return expressBridgeAppendQAXml_(s)}
function EB_qaColumn_(i){let s='';do{s=String.fromCharCode(65+i%26)+s;i=Math.floor(i/26)-1}while(i>=0);return s}
function EB_qaWorksheetXml_(rows, ncols){
 let data='';
 for(let i=0;i<rows.length;i++){
  const row=rows[i];if(row.length!==ncols)throw Error('QA_UNEXPECTED_COLUMN_COUNT');
  let cells='';for(let j=0;j<ncols;j++){
   // All values intentionally inline strings; no Excel formula execution on source text.
   const raw=String(row[j]??'');if(raw.length>32760)throw Error('QA_CELL_TOO_LONG');
   cells+='<c r="'+EB_qaColumn_(j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+EB_qaXML_(raw)+'</t></is></c>';
  }
  data+='<row r="'+(i+1)+'">'+cells+'</row>';
 }
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<dimension ref="A1:'+EB_qaColumn_(ncols-1)+rows.length+'"/>'+
  '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'+
  '<sheetFormatPr defaultRowHeight="15"/><sheetData>'+data+'</sheetData></worksheet>';
}
function EB_qaMapRegisters_(result){
 const docs=[EB_FULL_QA.docColumns],items=[EB_FULL_QA.itemColumns];
 const ordered=result.docs.slice().sort(function(a,b){return (a.group+'|'+a.docNo).localeCompare(b.group+'|'+b.docNo)});
 ordered.forEach(function(d){
  const status=d.qa.length?'SOURCE_LINE_REVIEW':d.plot.length===0?'HOLD_UNASSIGNED_PLOT':d.plot.length>1?'HOLD_MULTI_PLOT':'VERIFIED_SOURCE_ONLY';
  const ref='https://drive.google.com/file/d/'+d.sourceId+'/view';
  docs.push([d.group,d.docNo,d.date,d.supplier,d.plot.join('; '),d.plot.length===0?'UNSTATED':d.plot.length>1?'MULTI_PROJECT':'EXPLICIT',d.lines.length,
   d.qa.length?d.qa.join('|'):'ITEM_LINES_PARSED',d.source,ref,d.sourceLine,d.lastSeen,status,
   (d.subtotal/100).toFixed(2),(d.vat/100).toFixed(2),(d.total/100).toFixed(2)]);
  d.lines.slice().sort(function(a,b){return a.seq-b.seq}).forEach(function(line){items.push([
   d.group,d.docNo,line.seq,line.code,line.description,String(line.qty),line.unit,(line.unitPrice/100).toFixed(2),(line.amount/100).toFixed(2),
   d.supplier,d.plot.join('; '),d.source,line.sourceLine,ref,status
  ])})
 });
 return {docRows:docs,itemRows:items,documents:ordered.length,lines:items.length-1};
}
function EB_qaReadFolder_(){
 const parent=DriveApp.getFolderById(EB_FULL_QA.sourceFolderId),iter=parent.getFiles(),files=[];
 while(iter.hasNext()){
  const f=iter.next(),name=f.getName();if(!EB_FULL_QA.allowedSource.test(name))continue;
  if(f.getSize()<1||f.getSize()>EB_FULL_QA.maxBytesPerSource)throw Error('SOURCE_SIZE_UNSAFE: '+name);
  if(f.getMimeType()!=='text/csv' && f.getMimeType()!=='application/vnd.ms-excel')throw Error('SOURCE_TYPE_UNEXPECTED: '+name);
  const raw=f.getBlob().getBytes();if(raw.length!==f.getSize())throw Error('SOURCE_SIZE_CHANGED');
  let text='';try{text=Utilities.newBlob(raw,'text/plain',name).getDataAsString('windows-874')}catch(_){}
  if(!/รายงานใบสั่งซื้อ|รายงานใบขอซื้อ/.test(text))
    text=Utilities.newBlob(raw,'text/plain',name).getDataAsString('TIS-620');
  if(!/รายงานใบสั่งซื้อ|รายงานใบขอซื้อ/.test(text))throw Error('SOURCE_CHARSET_OR_LAYOUT_NOT_SUPPORTED');
  files.push({id:f.getId(),name:name,modifiedAt:f.getLastUpdated().toISOString(),size:raw.length,hash:EB_qaHash_(raw),text:text});
 }
 if(files.length<EB_FULL_QA.sourceMinimum||files.length>EB_FULL_QA.maxSources)throw Error('SOURCE_COUNT_UNEXPECTED');
 files.sort(function(a,b){return a.name.localeCompare(b.name)});
 return files;
}
function EB_qaVerifyFolderUnchanged_(files){
 for(const f of files){const latest=DriveApp.getFileById(f.id);if(latest.getName()!==f.name||latest.getLastUpdated().toISOString()!==f.modifiedAt||latest.getSize()!==f.size)
  throw Error('SOURCE_FILE_CHANGED_DURING_IMPORT: '+f.name)}
}
function EB_qaUnchangedOriginal_(orig, target){
 const om=orig.map,tm=target.map;const exempt=new Set(['xl/workbook.xml','xl/_rels/workbook.xml.rels','[Content_Types].xml']);
 for(const n of Object.keys(om)){
   if(!tm[n])throw Error('QA_ORIGINAL_PART_MISSING_'+n);
   if(!exempt.has(n)&&EB_qaHash_(om[n].getBytes())!==EB_qaHash_(tm[n].getBytes()))throw Error('QA_UNRELATED_MASTER_PART_CHANGED_'+n);
 }
 const expected=Object.keys(om).concat(EB_FULL_QA.expectedSheetPaths).sort();
 if(JSON.stringify(expected)!==JSON.stringify(Object.keys(tm).sort()))throw Error('QA_UNEXPECTED_XLSX_MEMBERS');
 return Object.keys(om).length-exempt.size;
}
function EB_qaOnlyTwoWorksheetsChanged_(before,after){
 const a=before.map,b=after.map;
 if(JSON.stringify(Object.keys(a).sort())!==JSON.stringify(Object.keys(b).sort()))throw Error('QA_ZIP_PARTS_CHANGED');
 const writable=new Set(EB_FULL_QA.expectedSheetPaths);
 for(const name of Object.keys(a)){
   if(!writable.has(name) && EB_qaHash_(a[name].getBytes())!==EB_qaHash_(b[name].getBytes()))
     throw Error('QA_OTHER_PACKAGE_PART_CHANGED_'+name);
 }
}
function EB_qaProveSheetNames_(parts){
 const book=parts.map['xl/workbook.xml'].getDataAsString('UTF-8');
 EB_FULL_QA.expectedSheetPaths.forEach(function(path,i){
  if(!parts.map[path])throw Error('QA_MISSING_REGISTER_SHEET_'+path);
  if(!book.includes('name="'+EXPRESS_BRIDGE_APPEND_QA_20261022.sheetNames[i]+'"'))throw Error('QA_MISSING_REGISTER_SHEET_NAME');
 });
}
function expressBridgeFullHistoryQA20261022(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(30000))throw Error('QA_IMPORT_LOCK_BUSY');
 try{
  const original=DriveApp.getFileById(EB_FULL_QA.originalMasterId);
  if(original.getName()!=='ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx')throw Error('MASTER_NAME_OR_ID_CHANGED');
  const origBlob=original.getBlob(),origHash=EB_qaHash_(origBlob.getBytes());
  if(origHash!==EB_FULL_QA.originalSha)throw Error('MASTER_REVISION_CHANGED_HOLD');
  const qaCopy=DriveApp.getFileById(EB_FULL_QA.qaCopyId);
  if(qaCopy.getId()===original.getId()||qaCopy.getMimeType()!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')throw Error('QA_IS_PRODUCTION_OR_MIME_CHANGED');
  if(qaCopy.getName()!=='QA_Express_Append_OriginalWorkbook_SameID_2026-10-22.xlsx')throw Error('QA_COPY_IDENTITY_CHANGED');
  const before=expressBridgeAppendQAParts_(origBlob),old=expressBridgeAppendQAParts_(qaCopy.getBlob());
  EB_qaProveSheetNames_(old);const originalParts=EB_qaUnchangedOriginal_(before,old);
  const input=EB_qaReadFolder_(),parsed=EB_mergeReports_(input);
  if(parsed.docs.length===0)throw Error('NO_VALID_ACTIVE_DOCUMENTS');
  if(parsed.docs.some(function(x){return x.lines.some(function(y){return y.seq<1||!Number.isFinite(y.qty)||!Number.isFinite(y.amount)})}))throw Error('INVALID_LINE_VALUES');
  const mapped=EB_qaMapRegisters_(parsed);
  // Preserve local QA invariants on pinned snapshot; new files can increase counts, not silently shrink history.
  const historicalExists=input.some(function(f){return f.name==='PO2023-211020260935.csv'})&&
     input.some(function(f){return f.name==='PR2023-211020260935.csv'});
  if(historicalExists&&(mapped.documents<3706||mapped.lines<13114))throw Error('SOURCE_DATA_LOSS_HOLD');
  const xml=[EB_qaWorksheetXml_(mapped.docRows,EB_FULL_QA.docColumns.length),
             EB_qaWorksheetXml_(mapped.itemRows,EB_FULL_QA.itemColumns.length)];
  const wanted=xml.map(EB_qaHashText_).join('|');
  const current=EB_FULL_QA.expectedSheetPaths.map(function(p){return EB_qaHashText_(old.map[p].getDataAsString('UTF-8'))}).join('|');
  const prop=PropertiesService.getScriptProperties(),previous=prop.getProperty(EB_FULL_QA.qaHashProp);
  if(wanted===current){prop.setProperty(EB_FULL_QA.qaHashProp,wanted);
   const noChange={status:'FULL_REGISTER_QA_NO_CHANGE',qaFileId:qaCopy.getId(),sourceFiles:input.length,documents:mapped.documents,lines:mapped.lines,originalMutation:0,sha256:input.map(function(x){return {name:x.name,hash:x.hash}})};
   console.log('EXPRESS_BRIDGE_FULL_QA '+JSON.stringify(noChange));return noChange;
  }
  const synthetic=expressBridgeAppendQAExpected_();
  const fixture=synthetic.map(EB_qaHashText_).join('|');
  if(current!==fixture && current!==previous)throw Error('QA_WORKSHEETS_MANUALLY_CHANGED_HOLD');
  const patches=new Map(EB_FULL_QA.expectedSheetPaths.map(function(p,i){return [p,xml[i]]}));
  const zip=Utilities.zip(old.list.map(function(p){return patches.has(p.getName())?
      Utilities.newBlob(patches.get(p.getName()),'text/xml',p.getName()):p
    }),'QA_Express_Full_History.xlsx');
  if(zip.getBytes().length>EB_FULL_QA.maxWorkbookBytes)throw Error('QA_CANDIDATE_TOO_LARGE');
  const verify=expressBridgeAppendQAParts_(zip);
  EB_qaOnlyTwoWorksheetsChanged_(old,verify);
  EB_FULL_QA.expectedSheetPaths.forEach(function(p,i){if(verify.map[p].getDataAsString('UTF-8')!==xml[i])throw Error('QA_CANDIDATE_MISMATCH')});
  EB_qaVerifyFolderUnchanged_(input);
  const qaBeforeHash=EB_qaHash_(qaCopy.getBlob().getBytes());
  const lastCheck=DriveApp.getFileById(EB_FULL_QA.qaCopyId);
  if(EB_qaHash_(lastCheck.getBlob().getBytes())!==qaBeforeHash)throw Error('QA_COPY_CHANGED_DURING_PROCESS');
  if(EB_qaHash_(original.getBlob().getBytes())!==origHash)throw Error('ORIGINAL_CHANGED_DURING_PROCESS');
  const resp=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+
    encodeURIComponent(EB_FULL_QA.qaCopyId)+'?uploadType=media&fields=id',{
       method:'patch',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:zip.getBytes(),muteHttpExceptions:true});
  if(resp.getResponseCode()<200||resp.getResponseCode()>=300)throw Error('QA_PATCH_HTTP_'+resp.getResponseCode());
  const json=JSON.parse(resp.getContentText());if(json.id!==EB_FULL_QA.qaCopyId)throw Error('QA_ID_CHANGED');
  const after=expressBridgeAppendQAParts_(DriveApp.getFileById(EB_FULL_QA.qaCopyId).getBlob());
  EB_qaOnlyTwoWorksheetsChanged_(old,after);
  EB_FULL_QA.expectedSheetPaths.forEach(function(p,i){if(after.map[p].getDataAsString('UTF-8')!==xml[i])throw Error('QA_FULL_REGISTER_READBACK_FAILED')});
  if(EB_qaHash_(original.getBlob().getBytes())!==origHash)throw Error('ORIGINAL_CHANGED_DURING_READBACK');
  prop.setProperty(EB_FULL_QA.qaHashProp,wanted);
  const result={status:'FULL_REGISTER_QA_PASS',qaFileId:EB_FULL_QA.qaCopyId,originalFileId:EB_FULL_QA.originalMasterId,
   sourceFiles:input.length,documents:mapped.documents,lines:mapped.lines,sourceDocumentReview:parsed.docs.filter(function(d){return d.qa.length>0}).length,
   unassigned:parsed.docs.filter(function(d){return d.plot.length===0}).length,skippedCanceled:parsed.skippedCanceled,
   packagePartsPreserved:originalParts,originalMutation:0,supabaseMutation:0,nextGate:'PRODUCTION_SCOPE_AND_SYNC_REGISTRY_MAPPING'};
  console.log('EXPRESS_BRIDGE_FULL_QA '+JSON.stringify(result));return result;
 }finally{lock.releaseLock()}
}
