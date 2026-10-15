/**
 * Work Order XLSX -> isolated Supabase Work Order snapshot (read-only Web viewer).
 * INSTALL as ONE ADDITIONAL .gs file in existing 3 Kings Apps Script project.
 * Dependencies ALREADY in that project: openSpreadsheetFromExcel_, cleanupTempSpreadsheet_.
 * Script Properties (reuse existing): SUPABASE_PUBLISHABLE_KEY, DEFECT_SYNC_KEY.
 * Script Property to add ONCE: WORK_ORDER_FILE_ID = the approved private XLSX Drive file ID.
 * No edits to the original Excel; no updates to condo_room_status.
 * Schedule: Mon–Sat 08:00–18:59 Asia/Bangkok, hourly, no Sunday sync.
 */
const WORK_ORDER_AUTO_20261015=Object.freeze({
  TZ:'Asia/Bangkok',
  FILE_NAME:'Defect_Work_Order_Updated_2026-10-15.xlsx',
  SHEET_NAME:'ใบแจกงานตามทีม',
  DB_URL:'https://wtqubwdduzedmcvyhbgs.supabase.co',
  RPC:'defect_work_order_sync_import',
  STATE_KEY:'WORK_ORDER_SYNC_SOURCE_REV_20261015',
  HANDLER:'syncWorkOrderHourly20261015'
});

function workOrderConfig20261015_(){
  const p=PropertiesService.getScriptProperties();
  const id=p.getProperty('WORK_ORDER_FILE_ID');
  const apikey=p.getProperty('SUPABASE_PUBLISHABLE_KEY');
  const syncKey=p.getProperty('DEFECT_SYNC_KEY');
  if(!id||!apikey||!syncKey)throw Error('Missing WORK_ORDER_FILE_ID or existing Supabase sync properties');
  if(!/^[A-Za-z0-9_-]{20,200}$/.test(id))throw Error('Invalid WORK_ORDER_FILE_ID');
  return {id,apikey,syncKey,props:p};
}
function workOrderIsoDate20261015_(v){
  if(v instanceof Date&&!isNaN(v.getTime()))
    return Utilities.formatDate(v,WORK_ORDER_AUTO_20261015.TZ,'yyyy-MM-dd');
  const s=String(v==null?'':v).trim();
  if(!s||s==='รอยืนยัน'||s==='—'||s==='-')return null;
  if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    let year=Number(m[3]);if(year>=2400)year-=543;
    const dt=new Date(Date.UTC(year,Number(m[2])-1,Number(m[1])));
    if(dt.getUTCDate()!==Number(m[1])||dt.getUTCMonth()+1!==Number(m[2]))throw Error('Invalid Excel date '+s);
    return String(year).padStart(4,'0')+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  }
  throw Error('Unrecognized verified date in Work Order: '+s.slice(0,35));
}
function workOrderParse20261015_(sheet){
  const values=sheet.getDataRange().getValues();
  const required=['ผู้รับเหมา','Work ID','ห้อง/Combine','รายการ Defect','งานที่ต้องทำต่อ',
    'ผู้คุม','วันรับแจ้งจริง','ครบ 7 วัน','สถานะล่าสุด','หลักฐานต้นฉบับ',
    'ผลตรวจแจกงาน','ซิงก์ต้นทางล่าสุด','ข้อขัดแย้ง / Combine'];
  let header=-1,map={};
  for(let i=0;i<Math.min(15,values.length);i++){
    const head=values[i].map(v=>String(v||'').replace(/\s+/g,' ').trim());
    const indexes=Object.fromEntries(required.map(key=>[key,head.indexOf(key)]));
    if(required.every(key=>indexes[key]>=0)){header=i;map=indexes;break;}
  }
  if(header<0)throw Error('Work Order source columns missing; refuse to overwrite Web snapshot');
  const rows=[],seen={};
  function field(row,key){const v=row[map[key]];return v==null?'':String(v).trim();}
  for(let i=header+1;i<values.length;i++){
    const row=values[i],id=field(row,'Work ID');
    if(!id)continue;
    if(!/^DF-[A-Za-z0-9()_-]+$/.test(id))throw Error('Unexpected Work ID at row '+(i+1));
    if(seen[id])throw Error('Duplicate Work ID: '+id);
    seen[id]=true;
    const room=field(row,'ห้อง/Combine');
    const building=room.charAt(0);
    if(!/^[AB]$/.test(building)||!/[AB]\d{3}/.test(room))throw Error('Invalid room group at row '+(i+1));
    const contractor=field(row,'ผู้รับเหมา'),item=field(row,'รายการ Defect');
    if(!contractor||!item)throw Error('Missing contractor or job at row '+(i+1));
    const evidence=field(row,'หลักฐานต้นฉบับ');
    if(evidence&&!/^https:\/\/drive\.google\.com\//.test(evidence))throw Error('Invalid evidence URL row '+(i+1));
    rows.push({
      work_id:id,room_group:room,building,
      contractor,defect_item:item,
      next_action:field(row,'งานที่ต้องทำต่อ')||null,
      supervisor:field(row,'ผู้คุม')||null,
      received_date:workOrderIsoDate20261015_(row[map['วันรับแจ้งจริง']]),
      due_date:workOrderIsoDate20261015_(row[map['ครบ 7 วัน']]),
      work_status:field(row,'สถานะล่าสุด')||null,
      evidence_url:evidence||null,
      qa_status:field(row,'ผลตรวจแจกงาน')||null,
      conflict_note:field(row,'ข้อขัดแย้ง / Combine')||null,
      source_sync_note:field(row,'ซิงก์ต้นทางล่าสุด')||null
    });
  }
  if(rows.length<1||rows.length>300)throw Error('Unreasonable Work Order row count '+rows.length);
  return rows;
}
function workOrderPost20261015_(config,file,revision,rows,dryRun){
  const response=UrlFetchApp.fetch(WORK_ORDER_AUTO_20261015.DB_URL+'/rest/v1/rpc/'+WORK_ORDER_AUTO_20261015.RPC,{
    method:'post',contentType:'application/json',
    headers:{apikey:config.apikey,Authorization:'Bearer '+config.apikey},
    payload:JSON.stringify({
      p_sync_key:config.syncKey,p_source_file_id:file.getId(),
      p_source_file_name:file.getName(),p_source_modified_at:revision,
      p_rows:rows,p_dry_run:Boolean(dryRun)
    }),muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)
    throw Error('Work Order RPC '+response.getResponseCode()+': '+response.getContentText().slice(0,350));
  const data=JSON.parse(response.getContentText());
  if(!data||data.ok!==true)throw Error('Work Order sync rejected: '+JSON.stringify(data).slice(0,350));
  return data;
}
function workOrderRun20261015_(dryRun,force){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(4000))return {status:'locked'};
  let temp=null;
  try{
    const c=workOrderConfig20261015_();
    const file=DriveApp.getFileById(c.id);
    if(file.getName()!==WORK_ORDER_AUTO_20261015.FILE_NAME)throw Error('Unexpected Work Order workbook');
    if(file.getMimeType()!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      throw Error('Work Order must remain an original XLSX file');
    const revision=file.getLastUpdated().toISOString();
    if(!dryRun&&!force&&c.props.getProperty(WORK_ORDER_AUTO_20261015.STATE_KEY)===revision)
      return {status:'skipped',reason:'source-unchanged',modified:revision};
    if(typeof openSpreadsheetFromExcel_!=='function'||typeof cleanupTempSpreadsheet_!=='function')
      throw Error('Existing 3 Kings XLSX converter helpers unavailable');
    // Convert a temporary COPY for reading only. NEVER update the original Excel file.
    temp=openSpreadsheetFromExcel_(file);
    const book=SpreadsheetApp.openById(temp.spreadsheetId);
    const sheet=book.getSheetByName(WORK_ORDER_AUTO_20261015.SHEET_NAME);
    if(!sheet)throw Error('Missing approved Work Order dispatch sheet');
    const rows=workOrderParse20261015_(sheet);
    // Reject races: newer Excel edits during import must be retried, not acknowledged.
    if(DriveApp.getFileById(c.id).getLastUpdated().toISOString()!==revision)
      throw Error('Work Order Excel changed during reading; retry later');
    const result=workOrderPost20261015_(c,file,revision,rows,dryRun);
    if(!dryRun)c.props.setProperty(WORK_ORDER_AUTO_20261015.STATE_KEY,revision);
    const summary={status:dryRun?'dry-run':'success',rows:rows.length,modified:revision,db:result};
    console.log(JSON.stringify(summary));
    return summary;
  }finally{
    if(temp)cleanupTempSpreadsheet_(temp);
    lock.releaseLock();
  }
}
function workOrderDryRun20261015(){return workOrderRun20261015_(true,true)}
function workOrderSyncNow20261015(){return workOrderRun20261015_(false,true)}
function syncWorkOrderHourly20261015(){
  const now=new Date(),day=Number(Utilities.formatDate(now,WORK_ORDER_AUTO_20261015.TZ,'u'));
  const hour=Number(Utilities.formatDate(now,WORK_ORDER_AUTO_20261015.TZ,'H'));
  if(day===7||hour<8||hour>18)return {status:'outside-shift'};
  return workOrderRun20261015_(false,false);
}
function installWorkOrderTrigger20261015(){
  // Create or replace ONLY this one Work Order trigger; preserve all existing ones.
  const name=WORK_ORDER_AUTO_20261015.HANDLER;
  const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name);
  existing.forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(name).timeBased().everyHours(1).create();
  return {handler:name,count:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()===name).length};
}
function workOrderSyncStatus20261015(){
  const props=PropertiesService.getScriptProperties();
  const handlers=ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction());
  return {handlerInstalled:handlers.includes(WORK_ORDER_AUTO_20261015.HANDLER),
    lastAcceptedExcelRevision:props.getProperty(WORK_ORDER_AUTO_20261015.STATE_KEY)||null,
    sourceConfigured:Boolean(props.getProperty('WORK_ORDER_FILE_ID'))};
}
