/**
 * Generic owner-executed approved source-delta bridge.
 * Add as one file; no triggers, settings, legacy imports or room-status writes.
 * Config: WORK_ORDER_APPROVED_DELTA_MANIFEST_ID (private owner-approved JSON).
 * Reuses existing XLSX read-copy helpers and protected Script Properties.
 */
function workOrderApprovedSourceDeltaDryRun(){return workOrderApprovedSourceDelta_(null,true);}
function workOrderApprovedSourceDeltaApply(){return workOrderApprovedSourceDelta_(null,false);}
function workOrderApprovedSourceDelta_(manifestId,dryRun){
 const props=PropertiesService.getScriptProperties();
 const id=manifestId||props.getProperty('WORK_ORDER_APPROVED_DELTA_MANIFEST_ID');
 if(!id||!/^[A-Za-z0-9_-]{20,200}$/.test(id))throw Error('APPROVED_MANIFEST_REQUIRED');
 const lock=LockService.getScriptLock();
 if(!lock.tryLock(4000))throw Error('CONCURRENT_SCRIPT_WRITER');
 let temp=null;
 try{
  const mf=DriveApp.getFileById(id),raw=mf.getBlob().getDataAsString('UTF-8');
  if(raw.length>100000)throw Error('MANIFEST_TOO_LARGE');
  const m=JSON.parse(raw),owner=Session.getEffectiveUser().getEmail();
  if(!owner||mf.getOwner().getEmail()!==owner||m.approved_by!==owner||m.authorized_write!==true)
    throw Error('OWNER_APPROVAL_REQUIRED');
  if(m.source_file_id!=='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx'||
     !/^https:\/\/github[.]com\/pkraiwit2614-web\/3kings-site-report\/issues\/230#issuecomment-\d+$/.test(m.approval_evidence_url||'')||
     !Array.isArray(m.items)||m.items.length<1||m.items.length>50)throw Error('INVALID_MANIFEST');
  const ids=m.items.map(x=>x.work_id);
  if(new Set(ids).size!==ids.length||ids.some(x=>!/^DF-[A-Za-z0-9()_-]+$/.test(x)))throw Error('INVALID_MANIFEST_IDS');
  const file=DriveApp.getFileById(m.source_file_id);
  const revision=()=>DriveApp.getFileById(m.source_file_id).getLastUpdated().toISOString();
  if(file.getOwner().getEmail()!==owner||file.getName()!=='Defect_Work_Order_Updated_2026-10-15.xlsx'||
     file.getMimeType()!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'||
     revision()!==m.source_modified_at)throw Error('SOURCE_AUTHORITY_OR_REVISION_CHANGED');
  temp=openSpreadsheetFromExcel_(file);
  const sheet=SpreadsheetApp.openById(temp.spreadsheetId).getSheetByName(m.sheet_name);
  if(!sheet)throw Error('SOURCE_SHEET_MISSING');
  const values=sheet.getDataRange().getValues(),header=values[m.header_row-1];
  const required=['Work ID','ห้อง/กลุ่ม Combine','อาคาร','ผู้รับเหมา','รายการ Defect (หนึ่งจุด/บรรทัด)',
   'แนวทางดำเนินการ / จำนวนจุด','ลิงก์ภาพ / PDF (ตรวจวัน)','สถานะงาน','วันที่รับแจ้งจริง','ครบกำหนด 7 วัน','ผู้คุม A/B'];
  if(!header||required.some(x=>header.indexOf(x)<0))throw Error('SOURCE_HEADER_CHANGED');
  const field=(row,key)=>row[header.indexOf(key)];
  const text=(row,key)=>String(field(row,key)==null?'':field(row,key)).trim();
  const date=(row,key)=>workOrderIsoDate20261015_(field(row,key));
  const rows=m.items.map(item=>{
   if(!Number.isInteger(item.source_master_row)||item.source_master_row<=m.header_row)throw Error('INVALID_SOURCE_ROW');
   const row=values[item.source_master_row-1];if(!row)throw Error('SOURCE_ROW_MISSING');
   const actual={work_id:text(row,'Work ID'),room_group:text(row,'ห้อง/กลุ่ม Combine'),building:text(row,'อาคาร'),
    contractor:text(row,'ผู้รับเหมา'),defect_item:text(row,'รายการ Defect (หนึ่งจุด/บรรทัด)'),
    next_action:text(row,'แนวทางดำเนินการ / จำนวนจุด'),evidence_url:text(row,'ลิงก์ภาพ / PDF (ตรวจวัน)'),
    work_status:text(row,'สถานะงาน'),received_date:date(row,'วันที่รับแจ้งจริง'),due_date:date(row,'ครบกำหนด 7 วัน'),
    supervisor:text(row,'ผู้คุม A/B')};
   if(Object.keys(actual).some(k=>actual[k]!==item.expected[k])||actual.work_id!==item.work_id)
    throw Error('APPROVED_SOURCE_CONTENT_CHANGED');
   if(!/^[AB]\d{3}$/.test(actual.room_group)||!['รอดำเนินการ','ยังไม่เริ่ม','กำลังดำเนินการ'].includes(actual.work_status)||
      /HOLD|รอยืนยัน/i.test(actual.next_action)||!/^https:\/\/drive[.]google[.]com\//.test(actual.evidence_url))
     throw Error('SOURCE_NOT_DISPATCH_ELIGIBLE');
   return {work_id:actual.work_id,room_group:actual.room_group,building:actual.building,contractor:actual.contractor,
    defect_item:actual.defect_item,source_work_status:actual.work_status,stage_decision:'STAGE_REVERIFY_NO_DB_WRITE',
    source_master_row:item.source_master_row,source_evidence_url:actual.evidence_url,
    payload:{next_action:actual.next_action,received_date:actual.received_date,due_date:actual.due_date,supervisor:actual.supervisor}};
  });
  if(revision()!==m.source_modified_at)throw Error('SOURCE_CHANGED_DURING_READ');
  const key=props.getProperty('SUPABASE_SERVICE_ROLE_KEY'),syncKey=props.getProperty('DEFECT_SYNC_KEY');
  if(!key||!syncKey)throw Error('EXISTING_PROTECTED_CREDENTIALS_UNAVAILABLE');
  const root='https://wtqubwdduzedmcvyhbgs.supabase.co/rest/v1/';
  const request=(path,method,body,prefer)=>{
   const response=UrlFetchApp.fetch(root+path,{method,contentType:'application/json',
    headers:{apikey:key,Authorization:'Bearer '+key,Prefer:prefer||'return=representation'},
    ...(body===undefined?{}:{payload:JSON.stringify(body)}),muteHttpExceptions:true});
   const code=response.getResponseCode();if(code<200||code>=300)throw Error('APPROVED_DELTA_HTTP_'+code);
   const raw=response.getContentText();return raw?JSON.parse(raw):null;
  };
  const rpc=(name,body)=>{const out=request('rpc/'+name,'post',body);if(!out||out.ok!==true)throw Error('APPROVED_DELTA_RPC_REJECTED_'+String(out&&out.error||'unknown'));return out;};
  const existing=request('defect_work_order_snapshot?select=work_id,room_group,building,contractor,defect_item,next_action,evidence_url,work_status,source_active,qa_status,received_date,due_date,supervisor','get');
  const pending=rows.filter(row=>{
   const old=existing.find(x=>x.work_id===row.work_id);if(!old)return true;
   if(!old.source_active||old.qa_status!=='APPROVED_NONRETIRING'||old.room_group!==row.room_group||
      old.building!==row.building||old.contractor!==row.contractor||old.defect_item!==row.defect_item||
      (old.received_date||null)!==(row.payload.received_date||null)||(old.due_date||null)!==(row.payload.due_date||null)||
      (old.supervisor||'')!==row.payload.supervisor||
      (old.next_action||'')!==(row.payload.next_action||'')||old.evidence_url!==row.source_evidence_url||
      old.work_status!==row.source_work_status)throw Error('EXISTING_WORK_ID_CONFLICT');
   return false;
  });
  if(!pending.length)return {ok:true,status:'NO_CHANGE',changed:0,source_revision:m.source_modified_at};
  const stageBody={p_sync_key:syncKey,p_source_file_id:m.source_file_id,p_source_modified_at:m.source_modified_at,
   p_rows:pending,p_dry_run:true};
  const stageCheck=rpc('defect_work_order_nonretiring_stage_import',stageBody);
  if(dryRun!==false)return {ok:true,status:'DRY_RUN_APPROVED_SOURCE',would_stage:pending.length,changed:0,stage:stageCheck};
  if(revision()!==m.source_modified_at)throw Error('SOURCE_CHANGED_BEFORE_WRITE');
  rpc('defect_work_order_nonretiring_stage_import',{...stageBody,p_dry_run:false});
  const staged=request('defect_work_order_import_staging?select=*&work_id=in.('+pending.map(x=>x.work_id).join(',')+')','get');
  const stable=x=>JSON.stringify(Object.keys(x||{}).sort().map(k=>[k,x[k]]));
  if(staged.length!==pending.length||new Set(staged.map(x=>x.work_id)).size!==pending.length||
    staged.some(s=>{
     const r=pending.find(x=>x.work_id===s.work_id);if(!r)return true;
     return Object.keys(r).some(k=>k==='payload'?stable(r.payload)!==stable(s.source_payload):r[k]!==s[k])||
      s.source_file_id!==m.source_file_id||new Date(s.source_modified_at).toISOString()!==m.source_modified_at;
    }))throw Error('STAGING_READBACK_MISMATCH');
  const approvals=staged.map(s=>({work_id:s.work_id,source_file_id:m.source_file_id,source_modified_at:m.source_modified_at,
   approval_evidence_url:m.approval_evidence_url,approved_by:owner,completion_confirmed_open:true,contractor_room_confirmed:true,
   override_queue_checked:true,combine_checked:true,approved_stage_snapshot:s}));
  request('work_order_promotion_approvals?on_conflict=work_id','post',approvals,'resolution=ignore-duplicates,return=minimal');
  const body=id=>({p_sync_key:syncKey,p_work_id:id,p_source_file_id:m.source_file_id,p_source_modified_at:m.source_modified_at,p_dry_run:true});
  pending.forEach(r=>rpc('defect_work_order_promote_nonretiring_approved',body(r.work_id)));
  const applied=[];
  pending.forEach(r=>{
   if(revision()!==m.source_modified_at)throw Error('SOURCE_CHANGED_DURING_PROMOTION');
   const out=rpc('defect_work_order_promote_nonretiring_approved',{...body(r.work_id),p_dry_run:false});
   if(!['PROMOTED_NEW_WORK_ID','ALREADY_PRESENT_NO_CHANGE'].includes(out.status)||Number(out.retired||0)!==0)
    throw Error('UNEXPECTED_PROMOTION_RESULT');
   applied.push({work_id:r.work_id,status:out.status});
  });
  const after=request('defect_work_order_snapshot?select=work_id','get');
  if(after.length!==existing.length+pending.length)throw Error('SNAPSHOT_COUNT_CONFLICT_AFTER_PROMOTION');
  return {ok:true,status:'APPROVED_SOURCE_DELTAS_APPLIED',applied,retired:0,source_revision:m.source_modified_at};
 }finally{
  if(temp)cleanupTempSpreadsheet_(temp);
  lock.releaseLock();
 }
}

function defectApprovedPdfSourceDryRun(){return defectApprovedPdfSource_(true);}
function defectApprovedPdfSourceApply(){return defectApprovedPdfSource_(false);}
function defectApprovedPdfSource_(dryRun){
 const id=PropertiesService.getScriptProperties().getProperty('WORK_ORDER_APPROVED_DELTA_MANIFEST_ID');
 if(!id||!/^[A-Za-z0-9_-]{20,200}$/.test(id))throw Error('APPROVED_MANIFEST_REQUIRED');
 const mf=DriveApp.getFileById(id),raw=mf.getBlob().getDataAsString('UTF-8');
 if(raw.length>100000)throw Error('MANIFEST_TOO_LARGE');
 const m=JSON.parse(raw),owner=Session.getEffectiveUser().getEmail();
 if(!owner||mf.getOwner().getEmail()!==owner||m.approved_by!==owner||m.authorized_write!==true)
  throw Error('OWNER_APPROVAL_REQUIRED');
 if(m.defect_source_file_id!=='1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj'||
   !/^https:\/\/github[.]com\/pkraiwit2614-web\/3kings-site-report\/issues\/230#issuecomment-\d+$/.test(m.approval_evidence_url||'')||
   !Array.isArray(m.defect_rooms)||m.defect_rooms.length!==1||
   !/^[AB]\d{3}$/.test(m.defect_rooms[0])||['A404','A405'].includes(m.defect_rooms[0]))throw Error('INVALID_DEFECT_MANIFEST');
 const f=DriveApp.getFileById(m.defect_source_file_id);
 if(f.getOwner().getEmail()!==owner||f.getLastUpdated().toISOString()!==m.defect_source_modified_at)
  throw Error('DEFECT_SOURCE_AUTHORITY_OR_REVISION_CHANGED');
 const opts={force:true,scopeRooms:m.defect_rooms,verifiedPdfDetailOnly:true,expectedSourceRevision:m.defect_source_modified_at};
 const before=runDefectSyncV13_({...opts,dryRun:true});
 if(before.status!=='dry-run'||!Array.isArray(before.changedRooms)||
   before.changedRooms.some(r=>!m.defect_rooms.includes(r))||before.changed!==before.changedRooms.length)
  throw Error('DEFECT_PREFLIGHT_REJECTED');
 if(dryRun!==false||before.changed===0)return before;
 const applied=runDefectSyncV13_({...opts,dryRun:false});
 if(applied.status!=='success'||applied.changed!==before.changed)throw Error('DEFECT_APPLY_RECEIPT_MISMATCH');
 const after=runDefectSyncV13_({...opts,dryRun:true});
 if(after.status!=='dry-run'||after.changed!==0)throw Error('DEFECT_DB_READBACK_MISMATCH');
 return {ok:true,status:'SCOPED_PDF_SOURCE_APPLIED',changed:applied.changed,source_revision:m.defect_source_modified_at,
  ui_verification_required:true};
}
