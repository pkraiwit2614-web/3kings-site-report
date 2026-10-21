/**
 * Single-writer Work Order completion XLSX writeback (staged, disabled by default).
 * Install ONLY in the existing WorkOrderAutoSync Apps Script project after protected QA. Never install #113 mirror or a second XLSX writer.
 * Requires existing WorkOrderAutoSync_2026-10-15.gs, Drive scopes, and Script Properties.
 * No direct edits to canonical Defect Report/Flow. Never regenerates the workbook.
 */
const WORK_ORDER_WB_20261015=Object.freeze({
  MIME:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  STATE_COLUMN:'สถานะล่าสุด',ID_COLUMN:'Work ID',DATE_COLUMN:'วันที่เสร็จผ่านเว็บ',
  HANDLER:'syncWorkOrderCompletion20261015'
});
function workOrderWbRpc20261015_(config,method,payload){
  const res=UrlFetchApp.fetch(WORK_ORDER_AUTO_20261015.DB_URL+'/rest/v1/rpc/'+method,{
    method:'post',contentType:'application/json',
    headers:{apikey:config.apikey,Authorization:'Bearer '+config.apikey},
    payload:JSON.stringify(Object.assign({p_sync_key:config.syncKey},payload||{})),
    muteHttpExceptions:true
  });
  if(res.getResponseCode()!==200)throw Error(method+' HTTP '+res.getResponseCode()+' '+res.getContentText().slice(0,180));
  const data=JSON.parse(res.getContentText());
  if(!data||data.ok!==true)throw Error(method+' '+JSON.stringify(data).slice(0,220));
  return data;
}
function workOrderWbXmlUnescape20261015_(value){
  return String(value).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}
function workOrderWbXmlEscape20261015_(value){
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function workOrderWbShared20261015_(blob){
  if(!blob)return [];
  return (blob.getDataAsString().match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)||[]).map(si=>
    workOrderWbXmlUnescape20261015_((si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)||[])
      .map(t=>t.replace(/^<t[^>]*>/,'').replace(/<\/t>$/,'')).join(''))
  );
}
function workOrderWbCell20261015_(row,ref,shared){
  const esc=ref.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
  const cell=row.match(new RegExp('<c\\b(?=[^>]*\\br="'+esc+'")[^>]*>([\\s\\S]*?)<\\/c>'));
  if(!cell)return '';
  const tag=cell[0].slice(0,cell[0].indexOf('>')+1);
  const val=(cell[1].match(/<v>([\s\S]*?)<\/v>/)||[])[1];
  if(/\bt="s"/.test(tag))return shared[Number(val)]||'';
  if(/\bt="inlineStr"/.test(tag))
    return workOrderWbXmlUnescape20261015_((cell[1].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)||[])[1]||'');
  return workOrderWbXmlUnescape20261015_(val||'');
}
function workOrderWbCol20261015_(i){
  let name='';for(let n=i+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;
  return name;
}
function workOrderWbRow20261015_(xml,index){
  const re=new RegExp('<row\\b(?=[^>]*\\br="'+index+'")[^>]*>[\\s\\S]*?<\\/row>');
  const match=xml.match(re);return match?match[0]:null;
}
function workOrderWbSheetPath20261015_(parts){
  const book=parts['xl/workbook.xml']?.getDataAsString();
  const rels=parts['xl/_rels/workbook.xml.rels']?.getDataAsString();
  if(!book||!rels)throw Error('XLSX workbook relationships missing');
  const sheet=(book.match(/<sheet\b[^>]*>/g)||[]).find(x=>
    workOrderWbXmlUnescape20261015_((x.match(/\bname="([^"]*)"/)||[])[1]||'')
      ===WORK_ORDER_AUTO_20261015.SHEET_NAME);
  if(!sheet)throw Error('Approved Work Order sheet missing');
  const id=(sheet.match(/\br:id="([^"]+)"/)||[])[1];
  if(!id)throw Error('Sheet relationship ID missing');
  const rel=(rels.match(/<Relationship\b[^>]*>/g)||[]).find(x=>(x.match(/\bId="([^"]+)"/)||[])[1]===id);
  const target=(rel?.match(/\bTarget="([^"]+)"/)||[])[1];
  if(!target||!target.includes('worksheets/')||target.includes('..'))throw Error('Unsafe Excel worksheet path');
  return target.charAt(0)==='/'?target.slice(1):'xl/'+target;
}
function workOrderWbHeader20261015_(xml,shared){
  for(let row=1;row<=15;row++){
    const text=workOrderWbRow20261015_(xml,row);if(!text)continue;
    const map={};for(let i=0;i<25;i++){
      const name=workOrderWbCell20261015_(text,workOrderWbCol20261015_(i)+row,shared)
        .replace(/\s+/g,' ').trim();if(name)map[name]=workOrderWbCol20261015_(i);
    }
    if(map[WORK_ORDER_WB_20261015.ID_COLUMN]&&map[WORK_ORDER_WB_20261015.STATE_COLUMN]){
      // Adding exactly one date field at P; never overwrite an existing unrelated column.
      if(map[WORK_ORDER_WB_20261015.DATE_COLUMN]&&map[WORK_ORDER_WB_20261015.DATE_COLUMN]!=='P')
        throw Error('Completion-date column relocated: inspect Excel before edit');
      const check=workOrderWbCell20261015_(text,'P'+row,shared);
      if(check&&check!==WORK_ORDER_WB_20261015.DATE_COLUMN)
        throw Error('Column P already belongs to another field');
      return {row:row,idCol:map[WORK_ORDER_WB_20261015.ID_COLUMN],
        statusCol:map[WORK_ORDER_WB_20261015.STATE_COLUMN],dateCol:'P'};
    }
  }
  throw Error('Approved dispatch headers not found; refuse to write');
}
function workOrderWbPutCell20261015_(xml,ref,value){
  const safe=workOrderWbXmlEscape20261015_(value);
  const rowNo=Number((ref.match(/\d+$/)||[])[0]);
  let row=workOrderWbRow20261015_(xml,rowNo);
  if(!row)throw Error('Target Excel row missing '+rowNo);
  const esc=ref.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
  const re=new RegExp('<c\\b(?=[^>]*\\br="'+esc+'")[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
  const prev=row.match(re);
  // Protect workbook formulas even if an operator adds one to the status/date cells.
  if(prev&&/<f(?:\\s|>)/.test(prev[0]))throw Error('Refusing to overwrite Excel formula at '+ref);
  const style=prev?(prev[0].match(/\bs="([^"]+)"/)||[])[1]:null;
  const replacement='<c r="'+ref+'"'+(style?' s="'+style+'"':'')+' t="inlineStr"><is><t xml:space="preserve">'+safe+'</t></is></c>';
  row=prev?row.replace(prev[0],replacement):row.replace('</row>',replacement+'</row>');
  return xml.replace(workOrderWbRow20261015_(xml,rowNo),row);
}
function workOrderWbBaseline20261015_(file){
  // Backup identity is the approved same-folder filename; no new Script Property.
  const parents=file.getParents();if(!parents.hasNext())throw Error('Workbook has no parent folder');
  const parent=parents.next(),folders=parent.getFoldersByName('Backup');
  // Never generate nested Backup/Backup when the pinned source is already in Backup.
  const folder=parent.getName()==='Backup'?parent:
    (folders.hasNext()?folders.next():parent.createFolder('Backup'));
  const name='BACKUP_before_WorkOrderWebCompletion_2026-10-15_'+file.getName();
  const copies=folder.getFilesByName(name);
  if(copies.hasNext()){
    const existing=copies.next();
    if(existing.getMimeType()!==WORK_ORDER_WB_20261015.MIME||existing.getSize()<1)
      throw Error('Existing Work Order backup invalid; manual review required');
    return {created:false};
  }
  const backup=file.makeCopy(name,folder);
  if(!backup?.getId()||backup.getMimeType()!==WORK_ORDER_WB_20261015.MIME)
    throw Error('Work Order baseline backup missing');
  return {created:true};
}
function workOrderWbApply20261015_(config,change,dryRun){
  const file=DriveApp.getFileById(config.id);
  if(file.getName()!==WORK_ORDER_AUTO_20261015.FILE_NAME||file.getMimeType()!==WORK_ORDER_WB_20261015.MIME)
    throw Error('Work Order file ID/name/MIME validation failed');
  const parents=file.getParents();
  if(!parents.hasNext()||parents.next().getName()==='Backup')
    throw Error('Pinned Work Order source is inside Backup or has no parent: reconcile canonical Excel before writeback');
  if(!/^DF-[A-Za-z0-9()_-]+$/.test(change.work_id))throw Error('Invalid Work ID');
  const completed=new Date(change.web_completed_at);
  if(isNaN(completed.getTime())||completed.getTime()>Date.now()+300000)throw Error('Invalid completed timestamp');
  const dateValue=Utilities.formatDate(completed,WORK_ORDER_AUTO_20261015.TZ,'dd/MM/yyyy HH:mm:ss');
  const modified=file.getLastUpdated().getTime();
  const blobs=Utilities.unzip(file.getBlob());
  const parts={};blobs.forEach(b=>{parts[b.getName()]=b;});
  const sheetPath=workOrderWbSheetPath20261015_(parts);
  if(!parts[sheetPath])throw Error('Approved dispatch XML not found: '+sheetPath);
  const shared=workOrderWbShared20261015_(parts['xl/sharedStrings.xml']);
  let xml=parts[sheetPath].getDataAsString();
  const h=workOrderWbHeader20261015_(xml,shared);
  let target=null,found=0;
  for(let i=h.row+1;i<=500;i++){
    const row=workOrderWbRow20261015_(xml,i);
    if(!row)continue;
    const id=workOrderWbCell20261015_(row,h.idCol+i,shared);
    if(id===change.work_id){target=i;found++;}
  }
  if(found!==1)throw Error('Work ID missing or duplicated in active dispatch: '+change.work_id);
  const before=workOrderWbRow20261015_(xml,target);
  const prior=workOrderWbCell20261015_(before,h.statusCol+target,shared);
  const existingDate=workOrderWbCell20261015_(before,'P'+target,shared);
  if(/เสร็จแล้ว|งดแจก|ยกเลิก/.test(prior)&&existingDate!==dateValue)
    throw Error('Conflicting existing completed job; do not overwrite');
  if(prior==='เสร็จแล้ว'&&existingDate===dateValue)return {verified:true,unchanged:true};
  if(existingDate&&existingDate!==dateValue)throw Error('Completion date already contains a different value');
  if(dryRun)return {verified:true,dryRun:true,row:target,oldStatus:prior};
  xml=workOrderWbPutCell20261015_(xml,h.statusCol+target,'เสร็จแล้ว');
  xml=workOrderWbPutCell20261015_(xml,'P'+h.row,WORK_ORDER_WB_20261015.DATE_COLUMN);
  xml=workOrderWbPutCell20261015_(xml,'P'+target,dateValue);
  // Update used-range dimension only when it ends at column O.
  xml=xml.replace(/(<dimension\b[^>]*\bref="[A-Z]+\d+:)O(\d+"[^>]*\/?>)/,'$1P$2');
  parts[sheetPath]=Utilities.newBlob(xml,'text/xml',sheetPath);
  if(DriveApp.getFileById(config.id).getLastUpdated().getTime()!==modified)
    throw Error('Excel changed during edit; prevent overwrite');
  workOrderWbBaseline20261015_(file);
  const out=Utilities.zip(blobs.map(b=>parts[b.getName()]),file.getName());
  const res=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+config.id+'?uploadType=media',{
    method:'patch',contentType:WORK_ORDER_WB_20261015.MIME,
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:out.getBytes(),muteHttpExceptions:true
  });
  if(res.getResponseCode()<200||res.getResponseCode()>=300)
    throw Error('Drive update '+res.getResponseCode()+': '+res.getContentText().slice(0,160));
  // Only acknowledge after fetching and validating this same workbook ID again.
  const reread=Utilities.unzip(DriveApp.getFileById(config.id).getBlob());
  const fresh=reread.filter(b=>b.getName()===sheetPath)[0];
  if(!fresh)throw Error('Saved Excel worksheet missing');
  const newXml=fresh.getDataAsString();
  const newShared=workOrderWbShared20261015_(reread.filter(b=>b.getName()==='xl/sharedStrings.xml')[0]);
  const newRow=workOrderWbRow20261015_(newXml,target);
  if(!newRow||workOrderWbCell20261015_(newRow,h.idCol+target,newShared)!==change.work_id
    ||workOrderWbCell20261015_(newRow,h.statusCol+target,newShared)!=='เสร็จแล้ว'
    ||workOrderWbCell20261015_(newRow,'P'+target,newShared)!==dateValue)
    throw Error('Saved Excel Work ID / status / date mismatch');
  return {verified:true,row:target,date:dateValue};
}
/**
 * Read-only safety check. One GAS project/script lock protects the importer
 * and this writer. This cannot discover triggers in other Apps Script projects;
 * the Owner must explicitly check no other service writes this workbook.
 */
function workOrderSingleWriterPreflight20261021(){
  if(typeof workOrderConfig20261015_!=='function' ||
     typeof WORK_ORDER_AUTO_20261015==='undefined')
    return {ok:false,error:'Importer helpers missing: install in original Work Order GAS project'};
  const handlers=ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction());
  const mirror=handlers.filter(s=>s==='defectWorkOrderScheduled20261015').length;
  const importer=handlers.filter(s=>s===WORK_ORDER_AUTO_20261015.HANDLER).length;
  const writer=handlers.filter(s=>s===WORK_ORDER_WB_20261015.HANDLER).length;
  return {ok:mirror===0&&importer===1&&writer<=1,
    importerTriggers:importer,mirrorTriggers:mirror,writerTriggers:writer,
    enabled:PropertiesService.getScriptProperties().getProperty('WORK_ORDER_SINGLE_WRITER_ENABLED')==='true',
    note:'Other Apps Script projects and manual XLSX editors require Owner verification'};
}
function workOrderWbRun20261015_(dryRun){
  const gate=workOrderSingleWriterPreflight20261021();
  if(!gate.ok)return {status:'blocked',gate:gate};
  if(!dryRun&&!gate.enabled)
    return {status:'disabled',reason:'WORK_ORDER_SINGLE_WRITER_ENABLED is not true'}; 
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(3000))return {status:'locked'};
  try{
    const config=workOrderConfig20261015_();
    const data=workOrderWbRpc20261015_(config,'defect_work_order_writeback_pull',{p_limit:10});
    const rows=data.rows||[],errors=[];let done=0;
    rows.forEach(change=>{
      try{
        const report=workOrderWbApply20261015_(config,change,dryRun);
        if(!dryRun)workOrderWbRpc20261015_(config,'defect_work_order_writeback_ack',{
          p_work_id:change.work_id,p_completed_at:change.web_completed_at});
        done++;console.log(JSON.stringify({work_id:change.work_id,writeback:report}));
      }catch(e){
        errors.push({work_id:change.work_id,error:String(e).slice(0,240)});
        if(!dryRun)try{workOrderWbRpc20261015_(config,'defect_work_order_writeback_fail',{
          p_work_id:change.work_id,p_completed_at:change.web_completed_at,p_error:String(e)
        });}catch(ackError){console.error('Work Order writeback error log failed: '+ackError);}
      }
    });
    const summary={status:dryRun?'dry-run':errors.length?'partial':'success',queued:rows.length,verified:done,errors};
    console.log(JSON.stringify(summary));return summary;
  }finally{lock.releaseLock();}
}
function workOrderCompletionDryRun20261015(){return workOrderWbRun20261015_(true)}
function workOrderCompletionSyncNow20261015(){return workOrderWbRun20261015_(false)}
function syncWorkOrderCompletion20261015(){return workOrderWbRun20261015_(false)}
function installWorkOrderCompletionTrigger20261015(){
  const gate=workOrderSingleWriterPreflight20261021();
  if(!gate.ok||!gate.enabled)
    throw Error('Single-writer gate not verified/enabled; no trigger installed');
  const name=WORK_ORDER_WB_20261015.HANDLER;
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name)
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(name).timeBased().everyMinutes(5).create();
  return {handler:name,count:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name).length};
}
