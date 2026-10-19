/**
 * Install as a NEW file in the existing 3 Kings Apps Script project.
 * Depends on DefectExcelWriteback_2026-10-13.gs helpers and Script Properties.
 * The ORIGINAL XLSX (Drive ID stored in WORK_ORDER_FILE_ID) is authoritative.
 * This worker does not change actual repair date; it records Hotel OK closure date separately.
 */
const DEFECT_AGENT_WO_20261019=Object.freeze({
  name:'Defect_Work_Order_Updated_2026-10-15.xlsx',
  mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sheets:[
    {name:'รายการ Defect',path:'xl/worksheets/sheet1.xml',
      idCol:'B',statusCol:'X',dateCol:'AR',dateHeader:'วันที่ปิด Work Order (Hotel OK)',hotelCol:'AH'},
    {name:'ใบแจกงานคงค้าง 151026',path:'xl/worksheets/sheet8.xml',
      idCol:'C',statusCol:'J',dateCol:'P',dateHeader:'วันที่ปิด Work Order (Hotel OK)'}
  ],
  handler:'runDefectAgentWorkOrderWriteback20261019'
});
function defectAgentWorkOrderConfig20261019_(){
  const props=PropertiesService.getScriptProperties();
  const id=props.getProperty('WORK_ORDER_FILE_ID');
  if(!id||!/^[A-Za-z0-9_-]+$/.test(id))
    throw Error('WORK_ORDER_FILE_ID missing');
  if(typeof defectWbConfig_!=='function'||typeof defectWbRpc_!=='function'||
     typeof defectWbSharedStrings_!=='function'||typeof defectWbReadCell_!=='function'||
     typeof defectWbPutCell_!=='function'||typeof defectWbEnsureBaselineBackup_!=='function')
    throw Error('Original lossless Defect XLSX helpers not installed');
  return {id:id,config:defectWbConfig_()};
}
function defectAgentWorkRow20261019_(xml,shared,col,id){
  const rows=xml.match(/<row\b[^>]*\br="\d+"[^>]*>[\s\S]*?<\/row>/g)||[];
  let found=null;
  rows.forEach(function(row){
    const n=Number((row.match(/<row\b[^>]*\br="(\d+)"/)||[])[1]);
    if(n<=5)return;
    if(defectWbReadCell_(row,col+n,shared)===id){
      if(found!==null)throw Error('Duplicate Work ID in XLSX: '+id);
      found=n;
    }
  });
  if(found===null)throw Error('Work ID absent from approved source: '+id);
  return found;
}
function defectAgentSetDimension20261019_(xml,col){
  return xml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\s*\/>/,
    function(full,start,row,last,finalRow){
      // Only extend beyond the verified rightmost dimension.
      const number=function(s){return s.split('').reduce(function(n,c){return n*26+c.charCodeAt(0)-64;},0);};
      return number(last)>=number(col)?full:
        '<dimension ref="'+start+row+':'+col+finalRow+'"/>';
    });
}
function defectAgentPatchWorkXml20261019_(xml,shared,meta,workId,closedDate){
  if(defectWbReadCell_(xml,meta.idCol+'5',shared)!=='Work ID')
    throw Error('Approved Work Order sheet header mismatch: '+meta.name);
  const row=defectAgentWorkRow20261019_(xml,shared,meta.idCol,workId);
  const required={
    status: 'เสร็จแล้ว — งดแจก',
    date: closedDate
  };
  let next=defectWbPutCell_(xml,meta.statusCol+row,required.status);
  next=defectWbPutCell_(next,meta.dateCol+'5',meta.dateHeader);
  next=defectWbPutCell_(next,meta.dateCol+row,closedDate);
  if(meta.hotelCol)next=defectWbPutCell_(next,meta.hotelCol+row,'Hotel Engineer ตรวจแล้ว');
  next=defectAgentSetDimension20261019_(next,meta.dateCol);
  return {xml:next,row:row,
    expected:[{addr:meta.statusCol+row,value:required.status},
      {addr:meta.dateCol+row,value:closedDate},
      ...(meta.hotelCol?[{addr:meta.hotelCol+row,value:'Hotel Engineer ตรวจแล้ว'}]:[])]};
}
function defectAgentWorkOrderWrite20261019_(id,workId,completedAt,dryRun){
  if(!/^DF-[A-Za-z0-9()_-]+$/.test(workId))throw Error('Invalid Work ID');
  const completed=new Date(completedAt);
  if(isNaN(completed.getTime())||completed.getTime()>Date.now()+300000)
    throw Error('Invalid verified completion time');
  const closedDate=Utilities.formatDate(completed,'Asia/Bangkok','yyyy-MM-dd');
  const meta=DEFECT_AGENT_WO_20261019;
  const file=DriveApp.getFileById(id);
  if(file.getName()!==meta.name||file.getMimeType()!==meta.mime)
    throw Error('Approved original Work Order workbook changed identity');
  const initialModified=file.getLastUpdated().getTime();
  const files=Utilities.unzip(file.getBlob());
  const entries={};files.forEach(function(f){entries[f.getName()]=f;});
  const book=entries['xl/workbook.xml'];
  if(!book)throw Error('XLSX missing workbook manifest');
  const workbookXml=book.getDataAsString();
  const shared=defectWbSharedStrings_(entries['xl/sharedStrings.xml']);
  const checks=[];
  meta.sheets.forEach(function(sheet){
    if(workbookXml.indexOf('name="'+sheet.name+'"')<0||!entries[sheet.path])
      throw Error('Unapproved or missing worksheet '+sheet.name);
    const before=entries[sheet.path].getDataAsString();
    const patched=defectAgentPatchWorkXml20261019_(before,shared,sheet,workId,closedDate);
    if(!patched.xml||patched.xml===before)throw Error('No XLSX delta '+sheet.name);
    entries[sheet.path]=Utilities.newBlob(patched.xml,'text/xml',sheet.path);
    checks.push({path:sheet.path,expected:patched.expected});
  });
  function assertVerified(blobs){
    const lookup={};blobs.forEach(function(b){lookup[b.getName()]=b;});
    checks.forEach(function(check){
      const sheet=lookup[check.path];if(!sheet)throw Error('Missing readback worksheet');
      const xml=sheet.getDataAsString();
      check.expected.forEach(function(item){
        if(defectWbReadCell_(xml,item.addr,shared)!==item.value)
          throw Error('XLSX readback mismatch '+check.path+' '+item.addr);
      });
    });
  }
  if(dryRun){assertVerified(files.map(function(f){return entries[f.getName()];}));
    return {dryRun:true,workId:workId,closedDate:closedDate};}
  // The existing Work Order import uses this same ScriptLock. No concurrent in-project import.
  if(file.getLastUpdated().getTime()!==initialModified)
    throw Error('Workbook revision changed during update; retry');
  defectWbEnsureBaselineBackup_(file);
  const packed=Utilities.zip(files.map(function(f){return entries[f.getName()];}),meta.name);
  const result=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media',{
    method:'patch',contentType:meta.mime,
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:packed.getBytes(),muteHttpExceptions:true
  });
  if(result.getResponseCode()<200||result.getResponseCode()>=300)
    throw Error('Original Work Order XLSX upload failed: HTTP '+result.getResponseCode());
  assertVerified(Utilities.unzip(DriveApp.getFileById(id).getBlob()));
  return {verified:true,workId:workId,closedDate:closedDate};
}
function defectAgentWorkOrderExecute20261019_(dryRun){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(4000))return {ok:false,reason:'executor-locked'};
  try{
    const c=defectAgentWorkOrderConfig20261019_();
    const queue=defectWbRpc_(c.config,'defect_work_order_writeback_pull',{p_limit:8});
    if(!queue||queue.ok!==true||!Array.isArray(queue.rows))throw Error('Work Order writeback RPC invalid');
    const results=[],errors=[];
    queue.rows.forEach(function(row){
      try{
        const out=defectAgentWorkOrderWrite20261019_(c.id,row.work_id,row.web_completed_at,dryRun);
        if(!dryRun){
          const ack=defectWbRpc_(c.config,'defect_work_order_writeback_ack',{
            p_work_id:row.work_id,p_completed_at:row.web_completed_at});
          if(!ack.ok)throw Error('Work Order acknowledgement rejected');
        }
        results.push(out);
      }catch(e){
        errors.push({workId:row.work_id,error:String(e).slice(0,200)});
        if(!dryRun){try{defectWbRpc_(c.config,'defect_work_order_writeback_fail',{
          p_work_id:row.work_id,p_completed_at:row.web_completed_at,p_error:String(e)});
        }catch(ignored){console.error('Error reporting failed '+ignored);}}
      }
    });
    const status={ok:errors.length===0,dryRun:dryRun,queued:queue.rows.length,
      verified:results.length,errors:errors};
    console.log(JSON.stringify(status));return status;
  }finally{lock.releaseLock();}
}
function dryRunDefectAgentWorkOrder20261019(){
  return defectAgentWorkOrderExecute20261019_(true);
}
function runDefectAgentWorkOrderWriteback20261019(){
  return defectAgentWorkOrderExecute20261019_(false);
}
function installDefectAgentWorkOrderTrigger20261019(){
  const handler=DEFECT_AGENT_WO_20261019.handler;
  ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()===handler;})
    .forEach(function(t){ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(5).create();
  return {handler:handler,count:ScriptApp.getProjectTriggers()
    .filter(function(t){return t.getHandlerFunction()===handler;}).length};
}
