const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('docs/apps-script/WorkOrderApprovedSourceDelta.gs','utf8');
const owner='owner@example.test',revision='2026-10-29T14:00:00.000Z';
const headers=['Work ID','ห้อง/กลุ่ม Combine','อาคาร','ผู้รับเหมา','รายการ Defect (หนึ่งจุด/บรรทัด)','แนวทางดำเนินการ / จำนวนจุด','ลิงก์ภาพ / PDF (ตรวจวัน)','สถานะงาน','วันที่รับแจ้งจริง','ครบกำหนด 7 วัน','ผู้คุม A/B'];
const expected={work_id:'DF-B706-01',room_group:'B706',building:'B',contractor:'RSE',defect_item:'Reported drain leak',
 next_action:'Inspect and repair',evidence_url:'https://drive.google.com/file/d/verified',work_status:'รอดำเนินการ',
 received_date:'2026-10-29',due_date:'2026-11-05',supervisor:''};
function fixture(change=()=>{}){
 const m={approved_by:owner,authorized_write:true,source_file_id:'18P3OFYtOLsslCtDujlSQVf9IQSuplKcx',source_modified_at:revision,
 approval_evidence_url:'https://github.com/pkraiwit2614-web/3kings-site-report/issues/230#issuecomment-123',
 sheet_name:'Master',header_row:1,items:[{work_id:expected.work_id,source_master_row:2,expected:{...expected}}]};
 const state={m,owner,revision,existing:[],staged:[],calls:[],cleaned:false,released:false,drift:false};
 change(state);
 const order=['work_id','room_group','building','contractor','defect_item','next_action','evidence_url','work_status','received_date','due_date','supervisor'];
 const file={getOwner:()=>({getEmail:()=>owner}),getName:()=> 'Defect_Work_Order_Updated_2026-10-15.xlsx',
 getMimeType:()=> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',getLastUpdated:()=>new Date(state.revision)};
 const c={PropertiesService:{getScriptProperties:()=>({getProperty:k=>({WORK_ORDER_APPROVED_DELTA_MANIFEST_ID:'verified-manifest-file-id',SUPABASE_SERVICE_ROLE_KEY:'isolated-service-key',DEFECT_SYNC_KEY:'isolated-sync-key'})[k]})},
 Session:{getEffectiveUser:()=>({getEmail:()=>state.owner})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>state.released=true})},
 DriveApp:{getFileById:id=>id==='verified-manifest-file-id'?{getOwner:()=>({getEmail:()=>owner}),getBlob:()=>({getDataAsString:()=>JSON.stringify(m)})}:file},
 openSpreadsheetFromExcel_:()=>({spreadsheetId:'isolated-copy'}),cleanupTempSpreadsheet_:()=>state.cleaned=true,
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[headers,order.map(k=>state.drift&&k==='defect_item'?'tampered':expected[k])]})})})},
 workOrderIsoDate20261015_:v=>v||null,
 UrlFetchApp:{fetch:(url,opts)=>{
  const path=url.split('/rest/v1/')[1],body=opts.payload?JSON.parse(opts.payload):undefined;
  state.calls.push({path,method:opts.method,body});
  let result;
  if(path.startsWith('defect_work_order_snapshot?')){
   result=path.endsWith('select=work_id')?state.existing.map(x=>({work_id:x.work_id})):state.existing;
  }else if(path==='rpc/defect_work_order_nonretiring_stage_import'){
   if(body.p_dry_run===false)state.staged=body.p_rows.map(r=>({...r,source_payload:r.payload,source_file_id:m.source_file_id,source_modified_at:m.source_modified_at}));
   result={ok:true,dry_run:body.p_dry_run,staged:body.p_rows.length};
  }else if(path.startsWith('defect_work_order_import_staging?'))result=state.tamperedReadback?state.staged.map(s=>({...s,contractor:'Unapproved team'})):state.staged;
  else if(path.startsWith('work_order_promotion_approvals?'))result=null;
  else if(path==='rpc/defect_work_order_promote_nonretiring_approved'){
   if(state.rejectPromotion)result={ok:false,error:'web_override_pending'};
   else if(body.p_dry_run)result={ok:true,status:'DRY_RUN_APPROVED'};
   else {state.existing.push({...expected,source_active:true,qa_status:'APPROVED_NONRETIRING'});result={ok:true,status:'PROMOTED_NEW_WORK_ID',retired:0};}
  }else throw Error('Unexpected request '+path);
  return {getResponseCode:()=>200,getContentText:()=>result===null?'':JSON.stringify(result)};
 }}};
 vm.createContext(c);vm.runInContext(source,c);return {state,context:c,run:d=>c.workOrderApprovedSourceDelta_(null,d),defect:d=>c.defectApprovedPdfSource_(d)};
}
test('dry-run validates canonical rows without staging/approval/promotion writes',()=>{
 const f=fixture(),v=f.run(true);assert.equal(v.changed,0);assert.equal(v.status,'DRY_RUN_APPROVED_SOURCE');
 assert(f.state.calls.filter(x=>x.method==='post').every(x=>x.body.p_dry_run===true));
 assert(f.state.cleaned&&f.state.released);
});
test('NULL/default remains dry-run',()=>{const f=fixture();f.run(null);assert.equal(f.state.existing.length,0);});
test('owner identity mismatch fails before requests',()=>{const f=fixture(s=>s.owner='other@example.test');assert.throws(()=>f.run(false),/OWNER_APPROVAL_REQUIRED/);assert.equal(f.state.calls.length,0);});
test('source revision drift fails closed',()=>{const f=fixture(s=>s.revision='2026-10-29T14:01:00Z');assert.throws(()=>f.run(false),/REVISION_CHANGED/);});
test('approved content mismatch fails closed',()=>{const f=fixture(s=>s.drift=true);assert.throws(()=>f.run(false),/CONTENT_CHANGED/);assert.equal(f.state.calls.length,0);});
test('duplicate manifest IDs fail closed',()=>{const f=fixture(s=>s.m.items.push(s.m.items[0]));assert.throws(()=>f.run(false),/MANIFEST_IDS/);});
test('apply uses staging, immutable approval and preflight before one-ID promotion',()=>{
 const f=fixture(),v=f.run(false);assert.equal(v.status,'APPROVED_SOURCE_DELTAS_APPLIED');assert.equal(f.state.existing.length,1);
 const a=f.state.calls.find(x=>x.path.startsWith('work_order_promotion_approvals?'));assert.equal(a.body[0].approved_stage_snapshot.work_id,expected.work_id);
 const calls=f.state.calls.filter(x=>x.path==='rpc/defect_work_order_promote_nonretiring_approved');assert.equal(calls.length,2);
 assert.equal(calls[0].body.p_dry_run,true);assert.equal(calls[1].body.p_dry_run,false);
 assert(f.state.cleaned&&f.state.released);
});
test('runtime pending override stops before promotion write',()=>{
 const f=fixture(s=>s.rejectPromotion=true);assert.throws(()=>f.run(false),/web_override_pending/);
 assert.equal(f.state.existing.length,0);assert(f.state.calls.filter(x=>x.path.includes('promote_nonretiring')).every(x=>x.body.p_dry_run===true));
});
test('existing conflicting ID is never overwritten',()=>{
 const f=fixture(s=>s.existing=[{...expected,contractor:'Different',source_active:true,qa_status:'APPROVED_NONRETIRING'}]);
 assert.throws(()=>f.run(false),/EXISTING_WORK_ID_CONFLICT/);assert(!f.state.calls.some(x=>x.method==='post'));
});
test('exact applied ID retries without stage/approval mutation',()=>{
 const f=fixture(s=>s.existing=[{...expected,source_active:true,qa_status:'APPROVED_NONRETIRING'}]);assert.equal(f.run(false).status,'NO_CHANGE');
 assert(!f.state.calls.some(x=>x.method==='post'));
});

test('concurrent staged replacement cannot become owner-approved',()=>{
 const f=fixture(s=>s.tamperedReadback=true);assert.throws(()=>f.run(false),/STAGING_READBACK_MISMATCH/);
 assert(!f.state.calls.some(x=>x.path.startsWith('work_order_promotion_approvals?')));
 assert.equal(f.state.existing.length,0);
});

test('retry cannot conceal changed source notice/SLA/supervisor/building',()=>{
 for(const [field,value] of [['received_date','2026-10-28'],['due_date','2026-11-06'],['supervisor','Unexpected'],['building','A']]){
  const f=fixture(s=>s.existing=[{...expected,[field]:value,source_active:true,qa_status:'APPROVED_NONRETIRING'}]);
  assert.throws(()=>f.run(false),/EXISTING_WORK_ID_CONFLICT/);assert(!f.state.calls.some(x=>x.method==='post'));
 }
});

test('SQL NULL next_action equals approved empty source action on retry',()=>{
 const previous=expected.next_action;expected.next_action='';
 try{
  const f=fixture(s=>s.existing=[{...expected,next_action:null,source_active:true,qa_status:'APPROVED_NONRETIRING'}]);
  assert.equal(f.run(false).status,'NO_CHANGE');assert(!f.state.calls.some(x=>x.method==='post'));
 }finally{expected.next_action=previous;}
});

test('owner PDF bridge binds source revision, single room and zero-change DB readback',()=>{
 const f=fixture(s=>Object.assign(s.m,{defect_source_file_id:'1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',defect_source_modified_at:revision,defect_rooms:['B706']}));
 let reads=0,writes=0;
 f.context.runDefectSyncV13_=opts=>{
  assert.equal(opts.expectedSourceRevision,revision);assert.equal(opts.verifiedPdfDetailOnly,true);
  assert.deepEqual(Array.from(opts.scopeRooms),['B706']);
  if(opts.dryRun){reads++;return {status:'dry-run',changed:reads===1?1:0,changedRooms:reads===1?['B706']:[]};}
  writes++;return {status:'success',changed:1};
 };
 const v=f.defect(false);assert.equal(v.status,'SCOPED_PDF_SOURCE_APPLIED');assert.equal(v.ui_verification_required,true);assert.equal(writes,1);assert.equal(reads,2);
});
test('owner PDF bridge refuses a partial Combine manifest',()=>{
 const f=fixture(s=>Object.assign(s.m,{defect_source_file_id:'1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',defect_source_modified_at:revision,defect_rooms:['A404']}));
 assert.throws(()=>f.defect(false),/INVALID_DEFECT_MANIFEST/);
});
