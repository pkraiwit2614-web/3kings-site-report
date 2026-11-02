const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'docs/apps-script/WorkOrderApprovedAutoPromotion_2026-11-02.gs'),'utf8');
const legacy=fs.readFileSync(path.join(root,'docs/apps-script/WorkOrderAutoSync_2026-10-15.gs'),'utf8');
const FILE_ID='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx';
const URL='https://drive.google.com/file/d/verified-evidence/view';
const header=['Work ID','ห้อง/กลุ่ม Combine','อาคาร','ผู้รับเหมา','รายการ Defect (หนึ่งจุด/บรรทัด)',
  'แนวทางดำเนินการ / จำนวนจุด','ลิงก์ภาพ / PDF (ตรวจวัน)','สถานะงาน','วันที่รับแจ้งจริง','ครบกำหนด 7 วัน','ผู้คุม A/B'];
const record=(id='DF-A421-01',room='A421')=>[id,room,room[0],'3 Kings','ซ่อมประตู',
  'ตรวจและแก้ไขก่อนแจกงาน',URL,'รอดำเนินการ','','','พี่ปู'];
const approval=(id='DF-A421-01',room='A421')=>({
  work_id:id,source_file_id:FILE_ID,source_modified_at:'2026-11-02T09:32:03.104Z',
  approval_evidence_url:'https://github.com/pkraiwit2614-web/3kings-site-report/issues/230#issuecomment-6573765747',
  approved_fields:{},approved_stage_snapshot:{
    work_id:id,source_file_id:FILE_ID,source_modified_at:'2026-11-02T09:32:03.104Z',
    source_master_row:5,room_group:room,building:room[0],contractor:'3 Kings',
    defect_item:'ซ่อมประตู',source_work_status:'รอดำเนินการ',
    source_evidence_url:URL,source_payload:{next_action:'ตรวจและแก้ไขก่อนแจกงาน',
      received_date:'',due_date:'',supervisor:'พี่ปู'}
  }
});
function run({approvals=[approval()],master=record(),rpcError=null}={}){
  const calls=[],revision='2026-11-02T09:32:03.104Z';
  let cleaned=0;
  const context={
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>({
      SUPABASE_SERVICE_ROLE_KEY:'private-key',DEFECT_SYNC_KEY:'sync-key',WORK_ORDER_FILE_ID:FILE_ID
    })[k]})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    DriveApp:{getFileById:id=>{
      assert.equal(id,FILE_ID);
      return {getName:()=> 'Defect_Work_Order_Updated_2026-10-15.xlsx',
        getMimeType:()=> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        getLastUpdated:()=>new Date(revision)};
    }},
    openSpreadsheetFromExcel_:()=>({spreadsheetId:'temporary'}),
    cleanupTempSpreadsheet_:()=>{cleaned++;},
    SpreadsheetApp:{openById:()=>({getSheets:()=>[{
      getDataRange:()=>({getValues:()=>[[],[],[],header,master]})
    }]})},
    workOrderIsoDate20261015_:v=>v?String(v):null,
    UrlFetchApp:{fetch:(url,options)=>{
      calls.push({url,body:options.payload?JSON.parse(options.payload):null});
      const result=url.includes('work_order_promotion_approvals?select=work_id,source_file_id')?approvals:
        url.includes('work_order_promotion_approvals?select=work_id')?approvals.map(x=>({work_id:x.work_id})):
        url.includes('defect_work_order_snapshot?')?[]:
        url.includes('defect_work_order_import_staging?')?[]:
        url.includes('/rpc/defect_work_order_nonretiring_stage_import')?
          {ok:true,dry_run:JSON.parse(options.payload).p_dry_run,staged:1}:
        rpcError?{ok:false,error:rpcError}:
        options.payload&&JSON.parse(options.payload).p_dry_run?
          {ok:true,status:'DRY_RUN_APPROVED'}:
          {ok:true,status:'PROMOTED_NEW_WORK_ID'};
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(result)};
    }},
    console:{log:()=>{},error:()=>{}},
  };
  vm.runInNewContext(source,context,{timeout:1000});
  const result=context.workOrderApprovedAutoPromotion20261102_();
  return {result:JSON.parse(JSON.stringify(result)),calls,cleaned};
}
test('existing 2h handler invokes approved processor only on normal Work Order shift',()=>{
  assert.match(legacy,/function syncWorkOrderHourly20261015\(\)/);
  assert.match(legacy,/workOrderApprovedAutoPromotion20261102_\(\)/);
  assert.match(legacy,/day===7\|\|hour<8\|\|hour>18/);
  assert.match(legacy,/workOrderRun20261015_\(false,false\)/);
  assert.doesNotMatch(source,/newTrigger\(|ScriptApp|\.delete\(/);
});
test('promotes approved Master Work ID through dry-run then live unchanged RPC only',()=>{
  const {result,calls,cleaned}=run();
  assert.equal(result.status,'PROMOTED_APPROVED');
  assert.equal(result.promoted,1);
  assert.equal(result.held,0);
  assert.equal(calls.filter(x=>x.url.includes('/rpc/')).length,2);
  assert.equal(calls[1].body.p_dry_run,true);
  assert.equal(calls[2].body.p_dry_run,false);
  assert.equal(cleaned,1);
});
test('unapproved IDs cannot enter production even when present in Master',()=>{
  const {result,calls,cleaned}=run({approvals:[]});
  assert.equal(result.status,'STAGED_REVIEW_ONLY');
  assert.equal(result.promoted,0);
  assert.equal(result.stage.staged,1);
  assert.equal(calls.filter(x=>x.url.includes('/rpc/defect_work_order_promote_nonretiring_approved')).length,0);
  assert.equal(calls.filter(x=>x.url.includes('/rpc/defect_work_order_nonretiring_stage_import')).length,2);
  assert.equal(cleaned,1);
});
test('source differs from approved payload => HOLD, without RPC mutation',()=>{
  const changed=record();changed[3]='Other team';
  const {result,calls}=run({master:changed});
  assert.equal(result.status,'PARTIAL_HOLD');
  assert.equal(result.promoted,0);
  assert.equal(result.blocked[0].reason,'MASTER_DIFF_OR_HOLD_REAPPROVAL_REQUIRED');
  assert.equal(calls.filter(x=>x.url.includes('/rpc/')).length,0);
});
test('completed status stays out of automatic promotion and historical records untouched',()=>{
  const done=record();done[7]='เสร็จสิ้น';
  const {result,calls}=run({master:done});
  assert.equal(result.promoted,0);
  assert.equal(result.held,1);
  assert.equal(calls.filter(x=>x.url.includes('/rpc/')).length,0);
});
test('Combine never bypasses the existing authoritative DB room-match gate',()=>{
  const {result,calls}=run({approvals:[approval('DF-A404-A405-01','A404+A405')],
    master:record('DF-A404-A405-01','A404+A405'),rpcError:'combine_status_mismatch'});
  assert.equal(result.promoted,0);
  assert.equal(result.held,1);
  assert.ok(calls.some(x=>x.url.includes('defect_work_order_promote_nonretiring_approved')));
  assert.equal(calls.filter(x=>x.url.includes('/rpc/')).length,1);
});
