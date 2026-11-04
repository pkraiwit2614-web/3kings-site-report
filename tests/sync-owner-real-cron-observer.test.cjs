'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const worker=import(pathToFileURL(path.resolve(__dirname,
  '../operations/cloudflare/3kings-line-autopilot-owner-only.mjs')).href);
const hash=async x=>createHash('sha256').update(x).digest('hex');
const FILE='Above Villa Plot6 Construction Progress_Updated_2026-09-21.xlsx';
const UUID='11111111-1111-4111-8111-111111111111';
const UUID2='22222222-2222-4222-8222-222222222222';
const env={
 SUPABASE_URL:'https://wtqubwdduzedmcvyhbgs.supabase.co',
 SUPABASE_SERVER_KEY:'sb_secret_test_key_not_a_real_secret',
 LINE_CHANNEL_ACCESS_TOKEN:'token-test',
 LINE_OWNER_USER_ID:'U11111111111111111111111111111111',
 DAILY_LINE_BRIDGE_TOKEN:'bridge-fake',
 SYNC_OWNER_MONITOR_ENABLED:'true',
 SYNC_OWNER_ENABLED_PIPELINES:'schedule',
 SYNC_OWNER_MONITOR_ACTIVATED_AT:'2026-11-03T12:00:00Z'
};
const changed={
 id:UUID,sync_type:'schedule',source_file:FILE,status:'success',
 created_at:'2026-11-03T12:06:01Z',rows_read:87,rows_written:87,
 message:'Apps Script sync completed; updated 0, inserted 87, deactivated 0'
};
const unchanged={
 id:UUID2,sync_type:'schedule',source_file:FILE,status:'success',
 created_at:'2026-11-03T13:19:19Z',rows_read:0,rows_written:0,
 message:'Apps Script check completed; source unchanged, sync skipped'
};
function fixture(logs){
 const calls=[],incidents=[],deliveries=new Map();
 const send=[];
 let failRead=false;
 const response=(data,status=200)=>({
   ok:status>=200&&status<300,status,json:async()=>data
 });
 const transport=async(url,opts={})=>{
   const u=String(url);calls.push({url:u,opts});
   if(u.includes('/rest/v1/drive_sync_runs?')){
     if(failRead)return response({error:'db unavailable'},500);
     const parsed=new URL(u);
     const after=Date.parse((parsed.searchParams.get('created_at')||'')
        .replace(/^gte\./,''));
     return response(logs.filter(x=>Date.parse(x.created_at)>=after)
       .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)));
   }
   if(u.includes('/rest/v1/schedule_tasks?'))return response([{id:1}]);
   if(u.includes('/rest/v1/rpc/line_sync_owner_get_pending'))
     return response(incidents.filter(x=>x.alert_status!=='resolved'));
   if(u.includes('/rest/v1/rpc/line_sync_owner_record_pending')){
     const x=JSON.parse(opts.body);
     let item=incidents.find(y=>y.pipeline===x.p_pipeline&&
       y.original_run_key===x.p_original_run_key);
     if(!item){
       item={id:incidents.length+1,pipeline:x.p_pipeline,
         source_file_id:x.p_source_file_id,original_run_key:x.p_original_run_key,
         first_detected_at:new Date(fixture.now).toISOString(),
         missing_evidence:x.p_missing_evidence,alert_status:'pending',
         schedule_verified:x.p_schedule_verified,
         next_round_due_at:x.p_next_round_due_at};
       incidents.push(item);
     }else{
       item.schedule_verified=x.p_schedule_verified;
       item.next_round_due_at=x.p_next_round_due_at;
       item.missing_evidence=x.p_missing_evidence;
     }
     return response(item.id);
   }
   if(u.includes('/rest/v1/rpc/line_sync_owner_mark_overdue')){
     const x=JSON.parse(opts.body),item=incidents.find(y=>
       y.pipeline===x.p_pipeline&&y.original_run_key===x.p_original_run_key);
     if(item)item.alert_status='overdue_alerted';
     return response(!!item);
   }
   if(u.includes('/rest/v1/rpc/line_sync_owner_claim')){
     const x=JSON.parse(opts.body);
     if(deliveries.has(x.p_event_key))return response([{
       claim_status:'already_sent',retry_key:UUID2
     }]);
     deliveries.set(x.p_event_key,{...x,status:'claimed'});
     return response([{claim_status:'new',retry_key:UUID2}]);
   }
   if(u.includes('/rest/v1/rpc/line_sync_owner_ack')){
     const x=JSON.parse(opts.body);
     const row=deliveries.get(x.p_event_key);
     if(!row)return response(false);
     row.status=x.p_status;return response(true);
   }
   if(u.includes('/v2/bot/message/quota')){
     return response({type:'none'});
   }
   if(u.includes('/v2/bot/message/push')){
     send.push(JSON.parse(opts.body));
     return response({},200);
   }
   throw new Error('unexpected request: '+u);
 };
 return {calls,incidents,deliveries,send,transport,
   failRead:()=>{failRead=true;}};
}
async function tick(f,time,e=env){
 fixture.now=time;
 const {syncOwnerMonitorTick}=await worker;
 return syncOwnerMonitorTick(e,{
   hash,transport:f.transport,now:new Date(time)
 });
}
test('real scheduled tick: exact canonical no-change log produces no pending and zero LINE calls',async()=>{
 const f=fixture([unchanged]);
 const result=await tick(f,'2026-11-03T13:20:00Z');
 assert.equal(result.mode,'SYNC_MONITOR_OBSERVED');
 assert.equal(result.observed,1);
 assert.equal(result.noChange,1);
 assert.equal(f.incidents.length,0);
 assert.equal(f.send.length,0);
 assert.equal(f.calls.some(c=>c.url.includes('/rest/v1/drive_sync_runs?')),true);
 assert.equal(f.calls.some(c=>c.url.includes('/line_sync_owner_get_pending')),true);
});
test('real scheduled tick: changed run records pending, next observed unchanged run warns once',async()=>{
 const f=fixture([changed]);
 let out=await tick(f,'2026-11-03T12:15:00Z');
 assert.equal(out.mode,'SYNC_MONITOR_OBSERVED');
 assert.equal(out.pendingRecorded,1);
 assert.equal(f.incidents.length,1);
 assert.equal(f.incidents[0].schedule_verified,false);
 assert.equal(f.send.length,0);
 // A later actual logged sync run is independently observed; next cron does
 // not invent an Apps Script execution ID or a configured trigger schedule.
 f.incidents[0].first_detected_at='2026-11-03T12:15:00Z';
 f.calls.length=0;
 f.send.length=0;
 f.incidents[0].alert_status='pending';
 f.incidents[0].missing_evidence='Authenticated Web E2E readback';
 f.incidents[0].next_round_due_at=null;
 f.incidents[0].schedule_verified=false;
 // New run must be after the previous observer timestamp.
 f.incidents[0].first_detected_at='2026-11-03T12:15:00Z';
 const logRows=[changed,unchanged];
 const next=fixture(logRows);
 next.incidents.push(f.incidents[0]);
 out=await tick(next,'2026-11-03T13:30:00Z');
 assert.equal(out.mode,'SYNC_MONITOR_OBSERVED');
 assert.equal(out.overdue,1);
 assert.equal(next.send.length,1);
 assert.equal(next.incidents[0].alert_status,'overdue_alerted');
 assert.equal(next.incidents[0].schedule_verified,true);
 assert.equal(next.incidents[0].next_round_due_at,unchanged.created_at);
 assert.equal(next.deliveries.size,1);
 assert.equal(next.send[0].to,env.LINE_OWNER_USER_ID);
 assert.match(next.send[0].messages[0].text,/ถึงรอบ Sync ถัดไป/);
 assert.match(next.send[0].messages[0].text,/เขียน DB: 87/);
 assert.doesNotMatch(next.send[0].messages[0].text,/เขียน DB: 0/);
 // Reprocessing the same real logs must not notify twice.
 out=await tick(next,'2026-11-03T14:00:00Z');
 assert.equal(next.send.length,1);
 assert.equal(out.ownerAccepted,0);
});
test('explicit error from canonical Master is immediately owner-alerted with unknown failure count',async()=>{
 const f=fixture([{...changed,id:UUID2,status:'error',rows_written:0,
   message:'Apps Script sync error: failed validation'}]);
 const result=await tick(f,'2026-11-03T12:15:00Z');
 assert.equal(result.failures,1);
 assert.equal(result.ownerAccepted,1);
 assert.equal(f.send.length,1);
 assert.match(f.send[0].messages[0].text,/Log/);
 assert.match(f.send[0].messages[0].text,/ไม่ทราบ/);
 assert.equal(f.incidents.length,0);
});
test('noncanonical test.xlsx failure is never sent as a Master failure',async()=>{
 const f=fixture([{...changed,source_file:'test.xlsx',status:'error'}]);
 const result=await tick(f,'2026-11-03T12:15:00Z');
 assert.equal(result.observed,0);
 assert.equal(f.send.length,0);
});
test('missing activation or unavailable database cannot send an owner message',async()=>{
 const f=fixture([changed]);
 const res=await tick(f,'2026-11-03T12:15:00Z',{
   ...env,SYNC_OWNER_MONITOR_ACTIVATED_AT:''});
 assert.equal(res.mode,'HOLD_ACTIVATION_NOT_VERIFIED');
 assert.equal(f.calls.length,0);
 const other=fixture([changed]);other.failRead();
 const fail=await tick(other,'2026-11-03T12:15:00Z');
 assert.match(fail.mode,/HOLD_LOG_READ/);
 assert.equal(other.send.length,0);
});
test('Work Order and Hotel remain visibly PARTIAL without certified per-run source evidence',async()=>{
 const f=fixture([]);
 const res=await tick(f,'2026-11-03T12:15:00Z',{
  ...env,SYNC_OWNER_ENABLED_PIPELINES:'work_order,hotel_work_plan'
 });
 assert.equal(res.mode,'SYNC_MONITOR_PARTIAL');
 assert.deepEqual(res.unsupported,['work_order','hotel_work_plan']);
 assert.equal(f.send.length,0);
});
test('manual LINE test cannot bypass the default disabled live-test flag',async()=>{
 const f=fixture([]);
 const {syncOwnerMonitorTick}=await worker;
 const out=await syncOwnerMonitorTick({...env,SYNC_OWNER_LIVE_TEST_ENABLED:'false'},{
   hash,transport:f.transport,testItem:{run_key:'manual-test',pipeline:'schedule'}
 });
 assert.equal(out.mode,'SYNC_MONITOR_LIVE_TEST_DISABLED');
 assert.equal(f.calls.length,0);
});

test('one config secret can enable only allowlisted pipelines; malformed config fails closed',async()=>{
 const f=fixture([unchanged]);
 const c={version:1,enabled:true,pipelines:['schedule'],
  activatedAt:'2026-11-03T12:00:00Z'};
 const valid={...env,
  SYNC_OWNER_MONITOR_ENABLED:'false',
  SYNC_OWNER_MONITOR_CONFIG:JSON.stringify(c)};
 const out=await tick(f,'2026-11-03T13:20:00Z',valid);
 assert.equal(out.mode,'SYNC_MONITOR_OBSERVED');
 assert.equal(out.noChange,1);
 assert.equal(f.send.length,0);
 const bad=await tick(f,'2026-11-03T13:20:00Z',{
   ...env,SYNC_OWNER_MONITOR_CONFIG:'{bad json'});
 assert.equal(bad.mode,'SYNC_MONITOR_OFF');
 const unknown=await tick(f,'2026-11-03T13:20:00Z',{
   ...env,SYNC_OWNER_MONITOR_CONFIG:JSON.stringify({...c,pipelines:['users']})});
 assert.equal(unknown.mode,'SYNC_MONITOR_OFF');
});
test('Daily audit with all parsed/verified rows skipped has no change and sends no LINE',async()=>{
 const f=fixture([]);
 const source='1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw';
 const daily={
   id:51,created_at:'2026-11-03T12:52:04Z',
   source_file_id:source,source_revision:'1793668282623',
   source_rows_read:570,rows_parsed:18,rows_inserted:0,rows_updated:0,
   rows_skipped:18,rows_verified:18,notes:'all unchanged'
 };
 const orig=f.transport;
 f.transport=async(url,opts)=>{
   if(String(url).includes('/rest/v1/daily_site_report_sync_audit?'))
     return {ok:true,status:200,json:async()=>[daily]};
   return orig(url,opts);
 };
 const out=await tick(f,'2026-11-03T13:20:00Z',{
   ...env,SYNC_OWNER_ENABLED_PIPELINES:'daily_site_report',
   SYNC_OWNER_DAILY_SOURCE_ID:source});
 assert.equal(out.mode,'SYNC_MONITOR_OBSERVED');
 assert.equal(out.noChange,1);
 assert.equal(f.send.length,0);
 assert.equal(f.incidents.length,0);
});

test('Express unchanged source fingerprint compared with last completed registry is silent',async()=>{
 const f=fixture([]);
 const base={
   id:'44444444-4444-4444-8444-444444444444',
   created_at:'2026-11-03T11:10:00Z',
   completed_at:'2026-11-03T11:11:00Z',
   source_fingerprint:'same-files-sha256',state:'complete',
   document_count:3758
 };
 const changedRun={...base,id:'55555555-5555-4555-8555-555555555555',
   created_at:'2026-11-03T12:10:00Z',completed_at:'2026-11-03T12:11:00Z'};
 const orig=f.transport;
 f.transport=async(url,opts={})=>{
   if(String(url).includes('/rest/v1/express_register_runs?')){
     const filter=new URL(url).searchParams.get('created_at')||'';
     return {ok:true,status:200,json:async()=>filter.startsWith('lt.')?[base]:[changedRun]};
   }
   return orig(url,opts);
 };
 const out=await tick(f,'2026-11-03T12:20:00Z',{
   ...env,SYNC_OWNER_ENABLED_PIPELINES:'express'});
 assert.equal(out.mode,'SYNC_MONITOR_OBSERVED');
 assert.equal(out.noChange,1);
 assert.equal(f.incidents.length,0);
 assert.equal(f.send.length,0);
});

test('monitor private Edge bridge intercepts ONLY protected Supabase reads and RPC, not LINE',async()=>{
 const f=fixture([changed]);
 const calls=[];
 const basic=f.transport;
 const proxy=async(url,opts={})=>{
   if(String(url).endsWith('/functions/v1/kings_sync_owner_bridge')){
     const req=JSON.parse(opts.body);
     calls.push({path:req.path,method:req.method,
       tokenPresent:opts.headers?.['x-3kings-owner-sync-key']==='unit-test-private'});
     assert.ok(req.path.startsWith('/rest/v1/'));
     assert.ok(!JSON.stringify(opts).includes('LINE_CHANNEL_ACCESS_TOKEN'));
     return basic(env.SUPABASE_URL+req.path,{
       method:req.method,
       ...(req.args===undefined?{}:{body:JSON.stringify(req.args)})
     });
   }
   return basic(url,opts);
 };
 const {syncOwnerMonitorTick}=await worker;
 const res=await syncOwnerMonitorTick({
   ...env,SYNC_OWNER_BRIDGE_TOKEN:'unit-test-private'
 },{hash,transport:proxy,now:new Date('2026-11-03T12:15:00Z')});
 assert.equal(res.mode,'SYNC_MONITOR_OBSERVED');
 assert.equal(res.pendingRecorded,1);
 assert.equal(f.incidents.length,1);
 assert.equal(f.send.length,0);
 assert.ok(calls.length>=3);
 assert.ok(calls.every(x=>x.tokenPresent));
 assert.ok(calls.some(x=>x.path.startsWith('/rest/v1/drive_sync_runs?')));
 assert.ok(calls.some(x=>x.path==='/rest/v1/rpc/line_sync_owner_record_pending'));
});
