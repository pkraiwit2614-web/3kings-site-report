/**
 * Existing Work Order sync extension -- 07 Nov 2026, owner-confirmed scope.
 * Reads ONLY the original XLSX (same WORK_ORDER_FILE_ID) "รายการ Defect" tab.
 * Reconciles 37 explicitly completed Work IDs (6 rooms) through the existing
 * Supabase project and existing DEFECT_SYNC_KEY / SUPABASE_PUBLISHABLE_KEY.
 * No direct DB updates, extra trigger, OAuth, second Excel writer, or new approval.
 * Staged unapproved A207-04 is archived as INACTIVE history, never dispatched.
 */
var WORK_ORDER_COMPLETED_20261107=Object.freeze({
  SOURCE_ID:'18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',
  SHEET:'รายการ Defect',
  RPC:'defect_work_order_master_completed_sync_20261107',
  STATE:'WORK_ORDER_MASTER_COMPLETED_SYNC_REV_20261107',
  EXPECTED:37,
  DONE:'เสร็จแล้ว — งดแจก (รอตรวจรับ)',
  ROOMS:Object.freeze({A207:4,A301:2,A327:2,A416:9,A512:12,A612:8})
});
function workOrderMasterCompletedRows20261107_(sheet){
  if(!sheet||sheet.getName()!==WORK_ORDER_COMPLETED_20261107.SHEET)
    throw Error('WORK_ORDER_COMPLETED_SOURCE_SHEET_MISSING');
  var rows=sheet.getDataRange().getValues(),cols=null,headerIndex=-1;
  var required=['Work ID','ห้อง/กลุ่ม Combine','ผู้รับเหมา','รายการ Defect (หนึ่งจุด/บรรทัด)',
    'แนวทางดำเนินการ / จำนวนจุด','วันที่รับแจ้งจริง','ครบกำหนด 7 วัน',
    'ลิงก์ภาพ / PDF (ตรวจวัน)','สถานะงาน',
    'สถานะห้อง (Web ผ่าน Defect Master)','ผู้คุม A/B'];
  for(var i=0;i<Math.min(rows.length,20);i++){
    var names=rows[i].map(function(x){return String(x||'').replace(/\s+/g,' ').trim();});
    if(required.every(function(h){return names.indexOf(h)>=0;})){
      cols={};required.forEach(function(h){cols[h]=names.indexOf(h);});
      headerIndex=i;break;
    }
  }
  if(!cols)throw Error('WORK_ORDER_COMPLETED_HEADER_CHANGED');
  var out=[],seen={},counts={};
  function field(r,k){return String(r[cols[k]]==null?'':r[cols[k]]).trim();}
  for(var i=headerIndex+1;i<rows.length;i++){
    var r=rows[i],id=field(r,'Work ID'),m=/^DF-(A207|A301|A327|A416|A512|A612)-(\d{2})$/.exec(id);
    if(!m)continue;
    var room=m[1],max=WORK_ORDER_COMPLETED_20261107.ROOMS[room];
    if(+m[2]<1||+m[2]>max||seen[id])throw Error('WORK_ORDER_COMPLETED_UNEXPECTED_OR_DUPLICATE_ID_'+id);
    seen[id]=true;counts[room]=(counts[room]||0)+1;
    var status=field(r,'สถานะงาน');
    var expectedRoomStatus=room==='A416'
      ?'Defect เสร็จแล้ว / รอ Hotel ตรวจ':'Defect เสร็จแล้ว / รอตรวจ';
    if(field(r,'ห้อง/กลุ่ม Combine')!==room ||
       status!==WORK_ORDER_COMPLETED_20261107.DONE ||
       field(r,'สถานะห้อง (Web ผ่าน Defect Master)')!==expectedRoomStatus)
      throw Error('WORK_ORDER_COMPLETED_ROOM_OR_STATUS_MISMATCH_'+id);
    var url=field(r,'ลิงก์ภาพ / PDF (ตรวจวัน)');
    if(!/^https:\/\/drive[.]google[.]com\//.test(url))
      throw Error('WORK_ORDER_COMPLETED_EVIDENCE_MISSING_'+id);
    out.push({
      work_id:id,room_group:room,work_status:status,
      contractor:field(r,'ผู้รับเหมา'),
      defect_item:field(r,'รายการ Defect (หนึ่งจุด/บรรทัด)'),
      next_action:field(r,'แนวทางดำเนินการ / จำนวนจุด'),
      supervisor:field(r,'ผู้คุม A/B'),
      evidence_url:url,
      received_date:workOrderIsoDate20261015_(r[cols['วันที่รับแจ้งจริง']])||null,
      due_date:workOrderIsoDate20261015_(r[cols['ครบกำหนด 7 วัน']])||null,
      source_master_row:i+1
    });
  }
  if(out.length!==WORK_ORDER_COMPLETED_20261107.EXPECTED||
     Object.keys(WORK_ORDER_COMPLETED_20261107.ROOMS).some(function(room){
       return (counts[room]||0)!==WORK_ORDER_COMPLETED_20261107.ROOMS[room];
     }))throw Error('WORK_ORDER_COMPLETED_EXACT_37_SOURCE_SCOPE_MISMATCH');
  return out.sort(function(a,b){return a.work_id.localeCompare(b.work_id);});
}
function workOrderMasterCompletedPost20261107_(c,revision,rows,dryRun){
  var endpoint=WORK_ORDER_AUTO_20261015.DB_URL+'/rest/v1/rpc/'+WORK_ORDER_COMPLETED_20261107.RPC;
  var response=UrlFetchApp.fetch(endpoint,{
    method:'post',contentType:'application/json',
    headers:{apikey:c.apikey,Authorization:'Bearer '+c.apikey},
    payload:JSON.stringify({
      p_sync_key:c.syncKey,p_source_file_id:WORK_ORDER_COMPLETED_20261107.SOURCE_ID,
      p_source_modified_at:revision,p_rows:rows,p_dry_run:dryRun===true
    }),muteHttpExceptions:true
  });
  if(response.getResponseCode()!==200)
    throw Error('WORK_ORDER_COMPLETED_RPC_HTTP_'+response.getResponseCode()+
      ': '+response.getContentText().slice(0,180));
  var result=JSON.parse(response.getContentText());
  if(!result||result.ok!==true||Number(result.checked)!==37)
    throw Error('WORK_ORDER_COMPLETED_RPC_REJECTED_'+String(result&&result.error||'mismatched_count'));
  return result;
}
function workOrderMasterCompletedSync20261107_(dryRun){
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(4000))return {status:'HOLD_LOCKED'};
  var temp=null;
  try{
    var c=workOrderConfig20261015_();
    if(c.id!==WORK_ORDER_COMPLETED_20261107.SOURCE_ID)throw Error('WORK_ORDER_MASTER_FILE_ID_CHANGED');
    var file=DriveApp.getFileById(c.id);
    if(file.getName()!==WORK_ORDER_AUTO_20261015.FILE_NAME ||
       file.getMimeType()!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      throw Error('WORK_ORDER_COMPLETED_FILE_MIME_OR_NAME_CHANGED');
    var revision=file.getLastUpdated().toISOString();
    if(dryRun!==true&&c.props.getProperty(WORK_ORDER_COMPLETED_20261107.STATE)===revision)
      return {status:'NO_CHANGE',checked:37,revision:revision};
    if(typeof openSpreadsheetFromExcel_!=='function' ||
       typeof cleanupTempSpreadsheet_!=='function')
      throw Error('WORK_ORDER_EXISTING_CONVERTER_NOT_FOUND');
    temp=openSpreadsheetFromExcel_(file);
    var sheet=SpreadsheetApp.openById(temp.spreadsheetId)
      .getSheetByName(WORK_ORDER_COMPLETED_20261107.SHEET);
    var rows=workOrderMasterCompletedRows20261107_(sheet);
    if(DriveApp.getFileById(c.id).getLastUpdated().toISOString()!==revision)
      throw Error('WORK_ORDER_COMPLETED_SOURCE_CHANGED_DURING_SCAN');
    var pre=workOrderMasterCompletedPost20261107_(c,revision,rows,true);
    if(dryRun===true)return {status:'DRY_RUN',checked:37,db:pre};
    if(DriveApp.getFileById(c.id).getLastUpdated().toISOString()!==revision)
      throw Error('WORK_ORDER_COMPLETED_SOURCE_CHANGED_BEFORE_SYNC');
    var applied=workOrderMasterCompletedPost20261107_(c,revision,rows,false);
    var verified=workOrderMasterCompletedPost20261107_(c,revision,rows,true);
    if(Number(verified.would_change)!==0 || Number(applied.closed_total)!==37)
      throw Error('WORK_ORDER_COMPLETED_DB_READBACK_MISMATCH');
    c.props.setProperty(WORK_ORDER_COMPLETED_20261107.STATE,revision);
    var summary={status:applied.status,checked:37,changed:applied.changed_existing,
      inserted_history:applied.inserted_history,db_verified:37,revision:revision};
    console.log('WORK_ORDER_MASTER_COMPLETED '+JSON.stringify(summary));
    return summary;
  }finally{
    if(temp)cleanupTempSpreadsheet_(temp);
    lock.releaseLock();
  }
}
// Manual fallback uses this function in the SAME original Apps Script editor.
function workOrderMasterCompletedSyncNow20261107(){
  return workOrderMasterCompletedSync20261107_(false);
}
function workOrderMasterCompletedDryRun20261107(){
  return workOrderMasterCompletedSync20261107_(true);
}
