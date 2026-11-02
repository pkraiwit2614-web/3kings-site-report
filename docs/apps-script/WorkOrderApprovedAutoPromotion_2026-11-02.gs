/**
 * Approved Work Order -> Production, called ONLY by existing 2-hour handler.
 * Reads the original Excel MASTER (not the old 55-row dispatch view).
 * No new trigger, source edits, approval creation, RLS changes or blanket import.
 * The existing private, per-Work-ID nonretiring promotion RPC is authoritative.
 */
function workOrderApprovedAutoPromotion20261102_(){
  const SOURCE_ID='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx';
  const ROOT='https://wtqubwdduzedmcvyhbgs.supabase.co/rest/v1/';
  const BATCH=25;
  const props=PropertiesService.getScriptProperties();
  const key=props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  const syncKey=props.getProperty('DEFECT_SYNC_KEY');
  const fileId=props.getProperty('WORK_ORDER_FILE_ID');
  if(!key||!syncKey||fileId!==SOURCE_ID){
    return {status:'HOLD_CONFIG',reason:'existing_approved_sync_credentials_or_source_not_configured'};
  }
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(4000))return {status:'HOLD_LOCKED'};
  let temp=null;
  const out={status:'NO_CHANGE',promoted:0,alreadyPresent:0,held:0,checked:0,blocked:[]};
  const hold=(id,reason)=>{
    out.held++;
    if(out.blocked.length<20)out.blocked.push({work_id:id,reason:reason});
  };
  const call=(path,method,body)=>{
    const res=UrlFetchApp.fetch(ROOT+path,{
      method:method||'get',contentType:'application/json',
      headers:{apikey:key,Authorization:'Bearer '+key},
      ...(body===undefined?{}:{payload:JSON.stringify(body)}),
      muteHttpExceptions:true
    });
    if(res.getResponseCode()<200||res.getResponseCode()>=300)
      throw Error('WORK_ORDER_APPROVED_API_'+res.getResponseCode());
    return JSON.parse(res.getContentText()||'null');
  };
  try{
    const approvals=call('work_order_promotion_approvals?select=work_id,source_file_id,source_modified_at,approval_evidence_url,approved_at,approved_stage_snapshot,approved_fields,expected_snapshot_hash,promoted_at,revoked_at&revoked_at=is.null&promoted_at=is.null&order=approved_at.asc&limit=500');
    if(!Array.isArray(approvals))throw Error('APPROVAL_READ_FAILED');
    if(!approvals.length)return out;
    const file=DriveApp.getFileById(SOURCE_ID);
    if(file.getName()!=='Defect_Work_Order_Updated_2026-10-15.xlsx'||
      file.getMimeType()!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      throw Error('WORK_ORDER_SOURCE_ID_OR_MIME_CHANGED');
    const revision=file.getLastUpdated().toISOString();
    temp=openSpreadsheetFromExcel_(file);
    const book=SpreadsheetApp.openById(temp.spreadsheetId);
    const keys=['Work ID','ห้อง/กลุ่ม Combine','อาคาร','ผู้รับเหมา','รายการ Defect (หนึ่งจุด/บรรทัด)',
      'แนวทางดำเนินการ / จำนวนจุด','ลิงก์ภาพ / PDF (ตรวจวัน)','สถานะงาน',
      'วันที่รับแจ้งจริง','ครบกำหนด 7 วัน','ผู้คุม A/B'];
    let sheet=null,headers=null,headerRow=0,values=null;
    for(const sh of book.getSheets()){
      const rows=sh.getDataRange().getValues();
      for(let i=0;i<Math.min(15,rows.length);i++){
        const h=rows[i].map(v=>String(v==null?'':v).trim());
        if(keys.every(k=>h.includes(k))){
          if(sheet)throw Error('DUPLICATE_MASTER_SHEETS');
          sheet=sh;headers=h;headerRow=i;values=rows;
        }
      }
    }
    if(!sheet)throw Error('WORK_ORDER_MASTER_HEADER_NOT_FOUND');
    const col=k=>headers.indexOf(k);
    const str=(row,k)=>String(row[col(k)]==null?'':row[col(k)]).trim();
    const dt=(row,k)=>workOrderIsoDate20261015_(row[col(k)])||'';
    const idRows=new Map();
    for(let i=headerRow+1;i<values.length;i++){
      const row=values[i],id=str(row,'Work ID');
      if(!id)continue;
      if(!/^DF-[A-Za-z0-9()_-]+$/.test(id))continue;
      if(idRows.has(id))throw Error('DUPLICATE_WORK_ID_IN_MASTER');
      idRows.set(id,{row,index:i+1});
    }
    for(const a of approvals){
      if(out.checked>=BATCH)break;
      const id=String(a.work_id||'');
      const staged=a.approved_stage_snapshot;
      if(a.source_file_id!==SOURCE_ID||!staged||
        !/^https:\/\/\S+$/.test(a.approval_evidence_url||'')||
        staged.work_id!==id||staged.source_file_id!==SOURCE_ID||
        new Date(staged.source_modified_at).toISOString()!==new Date(a.source_modified_at).toISOString()){
        hold(id,'APPROVAL_SCOPE_OR_VERSION_INVALID');continue;
      }
      const src=idRows.get(id);
      if(!src){hold(id,'WORK_ID_NOT_IN_MASTER');continue;}
      const row=src.row;
      let actual;
      try{
        actual={work_id:str(row,'Work ID'),room_group:str(row,'ห้อง/กลุ่ม Combine'),
          building:str(row,'อาคาร'),contractor:str(row,'ผู้รับเหมา'),
          defect_item:str(row,'รายการ Defect (หนึ่งจุด/บรรทัด)'),
          next_action:str(row,'แนวทางดำเนินการ / จำนวนจุด'),
          evidence_url:str(row,'ลิงก์ภาพ / PDF (ตรวจวัน)'),
          work_status:str(row,'สถานะงาน'),
          received_date:dt(row,'วันที่รับแจ้งจริง'),
          due_date:dt(row,'ครบกำหนด 7 วัน'),
          supervisor:str(row,'ผู้คุม A/B')};
      }catch(e){hold(id,'INVALID_MASTER_DATE');continue;}
      const payload=staged.source_payload||{};
      const fields=a.approved_fields||{};
      const allow=['defect_item','next_action','evidence_url'];
      if(Object.keys(fields).some(k=>!allow.includes(k))){
        hold(id,'UNAPPROVED_CHANGED_FIELDS');continue;
      }
      const expected={work_id:staged.work_id,room_group:staged.room_group,building:staged.building,
        contractor:staged.contractor,defect_item:staged.defect_item,
        next_action:payload.next_action||'',evidence_url:staged.source_evidence_url||'',
        work_status:staged.source_work_status,received_date:payload.received_date||'',
        due_date:payload.due_date||'',supervisor:payload.supervisor||''};
      for(const k of allow)if(Object.prototype.hasOwnProperty.call(fields,k))
        expected[k]=String(fields[k]==null?'':fields[k]);
      if(src.index!==staged.source_master_row||
        Object.keys(expected).some(k=>actual[k]!==expected[k])||
        !['รอดำเนินการ','ยังไม่เริ่ม','กำลังดำเนินการ'].includes(actual.work_status)||
        /HOLD|รอยืนยัน/i.test(actual.next_action)||
        !/^https:\/\/drive\.google\.com\//.test(actual.evidence_url)){
        hold(id,'MASTER_DIFF_OR_HOLD_REAPPROVAL_REQUIRED');continue;
      }
      if(DriveApp.getFileById(SOURCE_ID).getLastUpdated().toISOString()!==revision){
        hold(id,'MASTER_CHANGED_DURING_SCAN');break;
      }
      const args={p_sync_key:syncKey,p_work_id:id,p_source_file_id:SOURCE_ID,
        p_source_modified_at:a.source_modified_at,p_dry_run:true};
      try{
        const dry=call('rpc/defect_work_order_promote_nonretiring_approved','post',args);
        if(!dry||dry.ok!==true||!['DRY_RUN_APPROVED','ALREADY_PRESENT_NO_CHANGE'].includes(dry.status)){
          hold(id,'PROMOTION_DRY_RUN_REJECTED_'+String(dry&&dry.error||'unexpected'));continue;
        }
        if(dry.status==='ALREADY_PRESENT_NO_CHANGE'){out.alreadyPresent++;out.checked++;continue;}
        const result=call('rpc/defect_work_order_promote_nonretiring_approved','post',
          {...args,p_dry_run:false});
        if(result&&result.ok===true&&['PROMOTED_NEW_WORK_ID','UPDATED_APPROVED_FIELDS','ALREADY_PRESENT_NO_CHANGE'].includes(result.status)){
          if(result.status==='ALREADY_PRESENT_NO_CHANGE')out.alreadyPresent++;
          else out.promoted++;
          out.checked++;
        }else hold(id,'PROMOTION_REJECTED_'+String(result&&result.error||'unexpected'));
      }catch(e){hold(id,'PROMOTION_API_ERROR_'+String(e.message||e).slice(0,90));}
    }
    // Approved promotion remains separate from stage-only intake for newly edited
    // but still-unapproved Work IDs. Neither operation grants approval by itself.
    try{
      out.stage=workOrderStageUnapprovedMaster20261102_(idRows,str,dt,call,revision);
    }catch(e){
      out.stage={status:'HOLD_STAGE_API',reason:String(e&&e.message||e).slice(0,120)};
    }
    out.status=out.held?'PARTIAL_HOLD':out.promoted?'PROMOTED_APPROVED':
      out.stage&&out.stage.staged?'STAGED_REVIEW_ONLY':'NO_CHANGE';
    console.log('WORK_ORDER_APPROVED_AUTO '+JSON.stringify(out));
    return out;
  }finally{
    if(temp)cleanupTempSpreadsheet_(temp);
    lock.releaseLock();
  }
}


/**
 * Stage only NEW/CHANGED, UNAPPROVED, unfinished Master Work IDs for review.
 * This never approves or promotes an ID; only the original guarded per-ID RPC
 * may subsequently move an approved row into the Production snapshot.
 */
function workOrderStageUnapprovedMaster20261102_(idRows,str,dt,call,revision){
  const sourceId='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx';
  const [snapshot,approved,staged]=[
    call('defect_work_order_snapshot?select=work_id&limit=1000'),
    call('work_order_promotion_approvals?select=work_id&limit=1000'),
    call('defect_work_order_import_staging?select=work_id,room_group,building,contractor,defect_item,source_work_status,stage_decision,source_master_row,source_evidence_url,source_payload&limit=1000')
  ];
  if(!Array.isArray(snapshot)||!Array.isArray(approved)||!Array.isArray(staged))
    throw Error('UNAPPROVED_INTAKE_READ_FAILED');
  const activeIds=new Set(snapshot.map(x=>x.work_id));
  const approvedIds=new Set(approved.map(x=>x.work_id));
  const stageById=new Map(staged.map(x=>[x.work_id,x]));
  const openStatuses=new Set(['รอดำเนินการ','ยังไม่เริ่ม','กำลังดำเนินการ']);
  const changes=[];
  let holds=0;
  for(const [id,{row,index}] of idRows){
    if(activeIds.has(id)||approvedIds.has(id))continue;
    const room=str(row,'ห้อง/กลุ่ม Combine'),building=str(row,'อาคาร');
    const team=str(row,'ผู้รับเหมา'),item=str(row,'รายการ Defect (หนึ่งจุด/บรรทัด)');
    const status=str(row,'สถานะงาน'),next=str(row,'แนวทางดำเนินการ / จำนวนจุด');
    const evidence=str(row,'ลิงก์ภาพ / PDF (ตรวจวัน)');
    if(!room||!team||!item||!/^[AB]\d{3}([+/][AB]\d{3})?$/.test(room)||room[0]!==building){
      holds++;continue;
    }
    // History/closed records are left alone. Ambiguous open work is staged HOLD.
    if(/เสร็จสิ้น|เสร็จแล้ว|งดแจก|ยกเลิก/.test(status))continue;
    const ready=openStatuses.has(status)&&!(/HOLD|รอยืนยัน|รอจำแนก/i.test(team+' '+next))&&
      /^https:\/\/drive\.google\.com\//.test(evidence);
    const decision=ready?'STAGE_REVERIFY_NO_DB_WRITE':'HOLD_MISSING_EVIDENCE';
    let received='',due='';
    try{received=dt(row,'วันที่รับแจ้งจริง');due=dt(row,'ครบกำหนด 7 วัน');}
    catch(e){holds++;continue;}
    const payload={next_action:next,received_date:received,due_date:due,
      supervisor:str(row,'ผู้คุม A/B')};
    const candidate={work_id:id,room_group:room,building,contractor:team,
      defect_item:item,source_work_status:status,stage_decision:decision,
      source_master_row:index,source_evidence_url:evidence||null,payload};
    const previous=stageById.get(id);
    if(previous&&previous.room_group===room&&previous.building===building&&
      previous.contractor===team&&previous.defect_item===item&&
      previous.source_work_status===status&&previous.stage_decision===decision&&
      previous.source_master_row===index&&
      (previous.source_evidence_url||'')===evidence&&
      JSON.stringify(previous.source_payload||{})===JSON.stringify(payload))continue;
    changes.push(candidate);
  }
  if(!changes.length)return {status:'NO_CHANGE',staged:0,held_unmappable:holds};
  // Bounded stage-only intake; no production writer and no approval mutations.
  const batch=changes.slice(0,50);
  const body={p_sync_key:PropertiesService.getScriptProperties().getProperty('DEFECT_SYNC_KEY'),
    p_source_file_id:sourceId,p_source_modified_at:revision,p_rows:batch,p_dry_run:true};
  const dry=call('rpc/defect_work_order_nonretiring_stage_import','post',body);
  if(!dry||dry.ok!==true||dry.dry_run!==true)
    return {status:'HOLD_STAGE_DRY_RUN',staged:0,reason:dry&&dry.error||'rejected'};
  const written=call('rpc/defect_work_order_nonretiring_stage_import','post',
    {...body,p_dry_run:false});
  if(!written||written.ok!==true||Number(written.staged)!==batch.length)
    return {status:'HOLD_STAGE_WRITE',staged:0,reason:written&&written.error||'rejected'};
  return {status:'STAGED_FOR_APPROVAL',staged:batch.length,
    held_unmappable:holds,remaining:changes.length-batch.length,production_mutation:0};
}
