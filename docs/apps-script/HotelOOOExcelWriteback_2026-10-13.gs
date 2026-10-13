/**
 * Hotel OOO/OOS Excel writeback, single pinned file ID.
 * Only the OOO/OOS Master sheet and the four source Schedule columns are edited.
 * Do NOT use this executor for Defect source Excel or hotel participation data.
 *
 * Install in the EXISTING 3 Kings Apps Script project; same Script Properties:
 *   SUPABASE_PUBLISHABLE_KEY, DEFECT_SYNC_KEY
 * Advanced Drive service is not required for this module; DriveApp/UrlFetchApp used.
 * After installing, run hotelOOODryRun() then hotelOOOInstallTrigger() once.
 */
const HOTEL_OOO_WB = Object.freeze({
  FILE_ID:'19TX2KinSx3QXLw_VMZCE3Gm-bQVzzsSC',
  NAME_RE:/^Contractor_Schedule_Above_Element_OOO_OOS_Updated_\d{4}-\d{2}-\d{2}\.xlsx$/,
  URL:'https://wtqubwdduzedmcvyhbgs.supabase.co',
  MIME:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  SHEET_MASTER:'xl/worksheets/sheet3.xml',
  SHEET_SCHEDULE:'xl/worksheets/sheet2.xml',
  TZ:'Asia/Bangkok',
  MAX_BATCH:8
});
function hotelOOOConfig_(){
  const props=PropertiesService.getScriptProperties();
  const api=props.getProperty('SUPABASE_PUBLISHABLE_KEY'),key=props.getProperty('DEFECT_SYNC_KEY');
  if(!api||!key)throw Error('Missing SUPABASE_PUBLISHABLE_KEY / DEFECT_SYNC_KEY');
  return {api:api,key:key};
}
function hotelOOORpc_(config,method,body){
  const r=UrlFetchApp.fetch(HOTEL_OOO_WB.URL+'/rest/v1/rpc/'+method,{
    method:'post',contentType:'application/json',
    headers:{apikey:config.api,Authorization:'Bearer '+config.api},
    payload:JSON.stringify(Object.assign({p_sync_key:config.key},body||{})),
    muteHttpExceptions:true
  });
  if(r.getResponseCode()!==200)throw Error(method+' HTTP '+r.getResponseCode()+' '+r.getContentText().slice(0,250));
  const value=JSON.parse(r.getContentText());
  if(value&&value.ok===false)throw Error(method+' returned '+JSON.stringify(value).slice(0,150));
  return value;
}
function hotelOOOEscape_(str){
  return String(str??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function hotelOOOUnescape_(v){
  return String(v||'').replace(/&quot;/g,'"').replace(/&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
}
function hotelOOOShared_(blob) {
  if(!blob)throw Error('XLSX sharedStrings.xml missing');
  const s=blob.getDataAsString(),matches=s.match(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)||[];
  return matches.map(si=>(si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)||[])
    .map(t=>hotelOOOUnescape_(t.replace(/^<t[^>]*>/,'').replace(/<\/t>$/,''))).join(''));
}
function hotelOOORead_(xml,cell,shared){
  const m=xml.match(new RegExp('<c\\b[^>]*\\br="'+cell+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)'));
  if(!m)return '';
  const s=m[0],type=(s.match(/\bt="([^"]+)"/)||[])[1]||'';
  if(type==='inlineStr')return hotelOOOUnescape_((s.match(/<t[^>]*>([\s\S]*?)<\/t>/)||[])[1]||'');
  const raw=(s.match(/<v>([\s\S]*?)<\/v>/)||[])[1]||'';
  return type==='s'?(shared[Number(raw)]||''):raw;
}
function hotelOOOPut_(xml,addr,value){
  const n=(addr.match(/\d+/)||[])[0];
  const rp=new RegExp('(<row\\b[^>]*\\br="'+n+'"[^>]*>)([\\s\\S]*?)(<\\/row>)');
  const match=xml.match(rp);if(!match)throw Error('XLSX row missing '+addr);
  const cp=new RegExp('<c\\b[^>]*\\br="'+addr+'"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)');
  const old=match[2].match(cp);if(old&&/<f(?:\s|>)/.test(old[0]))throw Error('Refuse formula overwrite '+addr);
  const style=old?(old[0].match(/\bs="(\d+)"/)||[])[1]:null;
  const cell='<c r="'+addr+'"'+(style?' s="'+style+'"':'')+' t="inlineStr"><is><t xml:space="preserve">'+
    hotelOOOEscape_(value)+'</t></is></c>';
  const body=old?match[2].replace(cp,cell):match[2]+cell;
  return xml.replace(rp,()=>match[1]+body+match[3]);
}
function hotelOOONormalize_(room){
  const x=String(room||'').replace(/[\s-]/g,'').toUpperCase();
  const m=x.match(/^GOOD0?([1-5])$/);
  return m?'B10'+m[1]:x;
}
function hotelOOOPeriod_(from,to){
  const d=x=>x?String(x).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1'):'';
  return from&&to?d(from)+' – '+d(to):'';
}
function hotelOOOVerifyChange_(change,master,schedule,shared){
  const row=Number(change.master_row),source=Number(change.source_row);
  if(!Number.isInteger(row)||row<5||row>267||!Number.isInteger(source)||source<5||source>271)
    throw Error('Invalid pinned row identity');
  const room=String(change.room_no);
  if(hotelOOORead_(master,'A'+row,shared)!==room ||
     hotelOOONormalize_(hotelOOORead_(schedule,'F'+source,shared))!==room ||
     hotelOOONormalize_(String(change.original_room_no))!==room)
    throw Error('Room identity conflict '+room);
  const expected=[
   ['B'+row,change.source_synced_status||''],
   ['C'+row,change.source_synced_start||''],
   ['D'+row,change.source_synced_end||''],
   ['E'+row,change.source_synced_reason||''],
   ['F'+row,change.source_synced_remark||''],
   ['K'+row,String(change.source_synced_revision??0)]
  ];
  expected.forEach(([cell,v])=>{
    if(hotelOOORead_(master,cell,shared)!==String(v))
      throw Error('Excel changed outside Web: '+room+' '+cell+'; Data Reconciliation required');
  });
  const priorPeriod=hotelOOOPeriod_(change.source_synced_start,change.source_synced_end);
  [['H'+source,change.source_synced_status||''],
   ['I'+source,priorPeriod],
   ['J'+source,change.source_synced_reason||''],
   ['K'+source,change.source_synced_remark||'']].forEach(([cell,v])=>{
      if(hotelOOORead_(schedule,cell,shared)!==String(v))
        throw Error('Source Schedule conflict '+room+' '+cell+'; Data Reconciliation required');
  });
}
function hotelOOOApplyChange_(change,master,schedule){
  const row=Number(change.master_row),source=Number(change.source_row);
  const toWrite=[
    ['B'+row,change.availability_status],
    ['C'+row,change.start_date||''],
    ['D'+row,change.end_date||''],
    ['E'+row,change.reason||''],
    ['F'+row,change.hotel_remark||''],
    ['I'+row,change.updated_by_name],
    ['J'+row,Utilities.formatDate(new Date(),HOTEL_OOO_WB.TZ,'yyyy-MM-dd')],
    ['K'+row,String(change.revision)]
  ];
  toWrite.forEach(([cell,value])=>{master=hotelOOOPut_(master,cell,value)});
  [
    ['H'+source,change.availability_status],
    ['I'+source,hotelOOOPeriod_(change.start_date,change.end_date)],
    ['J'+source,change.reason||''],
    ['K'+source,change.hotel_remark||'']
  ].forEach(([cell,value])=>{schedule=hotelOOOPut_(schedule,cell,value)});
  return {master:master,schedule:schedule};
}
function hotelOOOBackup_(file){
  const props=PropertiesService.getScriptProperties();
  const day=Utilities.formatDate(new Date(),HOTEL_OOO_WB.TZ,'yyyy-MM-dd');
  const key='HOTEL_OOO_WB_BACKUP_'+day;
  if(props.getProperty(key))return;
  const parents=file.getParents();if(!parents.hasNext())throw Error('Missing parent folder');
  const parent=parents.next();
  const backups=parent.getFoldersByName('Backup');const dir=backups.hasNext()?backups.next():parent.createFolder('Backup');
  const name='BACKUP_before_HotelOOOWriteback_'+day+'_'+file.getName();
  const existing=dir.getFilesByName(name);
  const copy=existing.hasNext()?existing.next():file.makeCopy(name,dir);
  if(!copy||!copy.getId())throw Error('Backup failed; no Excel writes');
  props.setProperty(key,copy.getId());
}
function hotelOOORun_(dryRun){
  let pending=[],configForError=null;
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(2000))return {ok:false,status:'locked'};
  try {
    const config=hotelOOOConfig_();
    configForError=config;
    const file=DriveApp.getFileById(HOTEL_OOO_WB.FILE_ID);
    if(file.getMimeType()!==HOTEL_OOO_WB.MIME||!HOTEL_OOO_WB.NAME_RE.test(file.getName()))
      throw Error('Unexpected hotel Excel file name/type: '+file.getName());
    const received=hotelOOORpc_(config,'hotel_room_excel_writeback_pull',{p_limit:HOTEL_OOO_WB.MAX_BATCH});
    const changes=received.rows||[];
    pending=changes;
    if(received.file_id!==HOTEL_OOO_WB.FILE_ID)throw Error('Pinned file ID mismatch');
    if(!changes.length)return {ok:true,dryRun:dryRun,queued:0,saved:0};
    const mod=file.getLastUpdated().getTime();
    const parts=Utilities.unzip(file.getBlob());
    const blobs={};parts.forEach(p=>{blobs[p.getName()]=p});
    const masterBlob=blobs[HOTEL_OOO_WB.SHEET_MASTER],scheduleBlob=blobs[HOTEL_OOO_WB.SHEET_SCHEDULE];
    if(!masterBlob||!scheduleBlob)throw Error('Hotel OOO sheets not found at exact pinned paths');
    let master=masterBlob.getDataAsString(),schedule=scheduleBlob.getDataAsString();
    const strings=hotelOOOShared_(blobs['xl/sharedStrings.xml']);
    for(const change of changes) {
      if(change.source_file_id!==HOTEL_OOO_WB.FILE_ID)throw Error('Unexpected source file ID');
      hotelOOOVerifyChange_(change,master,schedule,strings);
      const updated=hotelOOOApplyChange_(change,master,schedule);
      master=updated.master;schedule=updated.schedule;
    }
    const result={ok:true,dryRun:dryRun,queued:changes.length,saved:0};
    if(dryRun){console.log(JSON.stringify(result));return result}
    // Fail closed if another editor touched the workbook after our read.
    if(file.getLastUpdated().getTime()!==mod)throw Error('Excel changed during processing; retry/reconcile');
    hotelOOOBackup_(file);
    blobs[HOTEL_OOO_WB.SHEET_MASTER]=Utilities.newBlob(master,'text/xml',HOTEL_OOO_WB.SHEET_MASTER);
    blobs[HOTEL_OOO_WB.SHEET_SCHEDULE]=Utilities.newBlob(schedule,'text/xml',HOTEL_OOO_WB.SHEET_SCHEDULE);
    const zip=Utilities.zip(parts.map(p=>blobs[p.getName()]),file.getName());
    const sent=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/'+HOTEL_OOO_WB.FILE_ID+'?uploadType=media',{
      method:'patch',contentType:HOTEL_OOO_WB.MIME,
      headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
      payload:zip.getBytes(),muteHttpExceptions:true
    });
    if(sent.getResponseCode()<200||sent.getResponseCode()>=300)
      throw Error('Drive update failed: '+sent.getResponseCode()+' '+sent.getContentText().slice(0,200));
    // Read back exact original ID before acknowledging any database revision.
    const reloaded=Utilities.unzip(DriveApp.getFileById(HOTEL_OOO_WB.FILE_ID).getBlob());
    const map={};reloaded.forEach(p=>map[p.getName()]=p);
    const readMaster=map[HOTEL_OOO_WB.SHEET_MASTER].getDataAsString();
    const readSchedule=map[HOTEL_OOO_WB.SHEET_SCHEDULE].getDataAsString();
    const freshStrings=hotelOOOShared_(map['xl/sharedStrings.xml']);
    for(const change of changes) {
      const row=change.master_row,srow=change.source_row;
      if(hotelOOORead_(readMaster,'A'+row,freshStrings)!==change.room_no||
         hotelOOORead_(readMaster,'B'+row,freshStrings)!==change.availability_status||
         hotelOOORead_(readMaster,'K'+row,freshStrings)!==String(change.revision)||
         hotelOOORead_(readSchedule,'H'+srow,freshStrings)!==change.availability_status)
        throw Error('Excel post-write readback mismatch '+change.room_no);
    }
    const newName='Contractor_Schedule_Above_Element_OOO_OOS_Updated_'+
      Utilities.formatDate(new Date(),HOTEL_OOO_WB.TZ,'yyyy-MM-dd')+'.xlsx';
    DriveApp.getFileById(HOTEL_OOO_WB.FILE_ID).setName(newName);
    const ackErrors=[];
    changes.forEach(change=>{
      try{const ack=hotelOOORpc_(config,'hotel_room_excel_writeback_ack',{
        p_room_no:change.room_no,p_revision:change.revision,p_file_id:HOTEL_OOO_WB.FILE_ID});
        if(!ack.ok)ackErrors.push(change.room_no+': revision changed')
        else result.saved++;
      }catch(e){ackErrors.push(change.room_no+': '+String(e));}
    });
    result.ok=ackErrors.length===0;result.errors=ackErrors;
    console.log(JSON.stringify(result));return result;
  } catch(err) {
    // No blind automatic overwrite or destructive repair on a conflict.
    console.error('hotelOOORun_: '+String(err));
    if(!dryRun&&configForError){
      pending.forEach(change=>{
        try{hotelOOORpc_(configForError,'hotel_room_excel_writeback_failure',{
          p_room_no:change.room_no,p_revision:change.revision,p_error:String(err)});
        }catch(reportError){console.error('Failure-report error: '+String(reportError));}
      });
    }
    return {ok:false,error:String(err)};
  } finally{lock.releaseLock()}
}
function hotelOOODryRun(){return hotelOOORun_(true)}
function hotelOOOExecuteWriteback(){return hotelOOORun_(false)}
function hotelOOOInstallTrigger(){
  const handler='hotelOOOExecuteWriteback';
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler)
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(handler).timeBased().everyMinutes(15).create();
  const matching=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===handler);
  if(matching.length!==1)throw Error('Expected exactly one hotel writeback trigger');
  console.log('Hotel OOO/OOS Excel writeback trigger installed: every 15 minutes');
  return {ok:true,trigger:handler,count:matching.length,fileId:HOTEL_OOO_WB.FILE_ID};
}
