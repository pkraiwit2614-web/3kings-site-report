'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const url='https://wtqubwdduzedmcvyhbgs.supabase.co';
const env={DAILY_SITE_LINE_ENABLED:'true',SUPABASE_URL:url,
  SUPABASE_SERVER_KEY:'test-only',DAILY_LINE_BRIDGE_TOKEN:'dedicated-test-token',LINE_CHANNEL_ACCESS_TOKEN:'test-only'};
const load=()=>import('../cloudflare/dailySiteSendTick.mjs');
const now=new Date('2026-10-21T01:04:00Z');
function mock(){
 const pushes=[],ledger=new Map(),metas=[];
 const suffixes={
   above_villa:'Page_01_Above_Villa',above_condo:'Page_02_Above_Condo',
   mirage:'Page_03_Mirage',henessy:'Page_04_Henessy'
 };
 const assets=['above_villa','above_condo','mirage','henessy'].map(site=>({
   site,filename:'Daily_Site_Report_20-10-2026_'+suffixes[site]+'.png',
   sha256:'c'.repeat(64),width:2947,height:2000,
   url:url+'/functions/v1/kings_daily_line_images/image?site='+site}));
 const transport=async (request,options)=>{
  if(request.includes('/ready?'))return {ok:true,status:200,json:async()=>({
    ready:true,report_date:'2026-10-20',pdf_sha256:'d'.repeat(64),assets})};
  if(request.endsWith('/message/quota'))return {
    ok:true,status:200,json:async()=>({type:'limited',value:1000})};
  if(request.endsWith('/message/quota/consumption'))return {
    ok:true,status:200,json:async()=>({totalUsage:0})};
  if(request.includes('/members/count'))return {
    ok:true,status:200,json:async()=>({count:5})};
  if(request.includes('/message/push')){
    pushes.push({payload:JSON.parse(options.body),retry:options.headers['X-Line-Retry-Key']});
    return {ok:true,status:200};
  }
  throw Error('unexpected URL');
 };
 const db=async (_env,path,body)=>{
   if(path.includes('line_autopilot_daily_route'))
     return [{would_send_line:body.p_site_code==='above_villa',group_id:'C'+'a'.repeat(32)}];
   if(path.includes('line_autopilot_claim')){
     const existing=ledger.get(body.p_event_key);
     if(existing)return [{claim_status:existing.status,retry_key:'00000000-0000-4000-8000-000000000000'}];
     ledger.set(body.p_event_key,{status:'in_flight'});
     return [{claim_status:'new',retry_key:'00000000-0000-4000-8000-000000000000'}];
   }
   if(path.includes('daily_line_record_delivery')){metas.push(body);return true;}
   if(path.includes('line_autopilot_ack')){
     ledger.set(body.p_event_key,{status:body.p_status==='delivered'?'already_sent':'in_flight'});
     return true;
   }
   throw Error('unexpected RPC');
 };
 const hash=async input=>input.includes('|form_text')?'a'.repeat(64):'b'.repeat(64);
 return {pushes,ledger,metas,transport,db,hash,assets};
}
test('Sunday and disabled flag send nothing',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const a=await dailySiteSendTick(env,{...m,now:new Date('2026-10-18T01:02:00Z')});
 assert.equal(a.mode,'NO_SEND');
 const b=await dailySiteSendTick({...env,DAILY_SITE_LINE_ENABLED:'false'},{...m,now});
 assert.equal(b.mode,'NO_SEND');assert.equal(m.pushes.length,0);
});
test('manual Condo B 20 October must not receive any automated replay',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const result=await dailySiteSendTick(env,{...m,now:new Date('2026-10-20T03:02:00Z')});
 assert.equal(result.mode,'NO_SEND');
 assert.equal(m.pushes.length,0);
});
test('select Saturday on Monday, yesterday otherwise',async()=>{
 const {dailyBangkokPolicy}=await load();
 assert.equal(dailyBangkokPolicy(new Date('2026-10-19T01:02:00Z')).reportDate,'2026-10-17');
 assert.equal(dailyBangkokPolicy(now).reportDate,'2026-10-20');
});
test('No messages when QA gateway missing',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 m.transport=async()=>({ok:false,status:503});
 const x=await dailySiteSendTick(env,{...m,now});
 assert.equal(x.mode,'GATEWAY_NOT_READY');assert.equal(m.pushes.length,0);
});
test('FORM ACK precedes PNG: two cron ticks and never a duplicate push',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const first=await dailySiteSendTick(env,{...m,now});
 assert.equal(first.textAccepted,1);assert.equal(first.imageAccepted,0);
 assert.equal(first.bundlesAccepted,0);
 assert.equal(m.pushes.length,1);
 assert.deepEqual(m.pushes[0].payload.messages.map(x=>x.type),['text']);
 const second=await dailySiteSendTick(env,{...m,now});
 assert.equal(second.textAccepted,0);assert.equal(second.imageAccepted,1);
 assert.equal(m.pushes.length,2);
 assert.deepEqual(m.pushes[1].payload.messages.map(x=>x.type),['image']);
 const third=await dailySiteSendTick(env,{...m,now});
 assert.equal(third.textAccepted+third.imageAccepted,0);
 assert.equal(m.pushes.length,2);
 assert.equal(new Set(m.metas.map(x=>x.p_event_key)).size,2);
 assert(m.metas.every(x=>x.p_site_code==='above_villa'));
});

test('429 uncertain FORM is held: no retry at any cron slot and no PNG',async()=>{
 const {dailySiteSendTick,dailyRetryWindow}=await load();const m=mock();
 const transport=m.transport;let once=true;
 m.transport=async(u,o)=>{
  if(u.includes('/message/push')&&once){
   once=false;
   m.pushes.push({payload:JSON.parse(o.body),retry:o.headers['X-Line-Retry-Key']});
   return {ok:false,status:429,json:async()=>({message:'The API rate limit has been exceeded. Try again later.'})};
  }
  return transport(u,o);
 };
 const failed=await dailySiteSendTick(env,{...m,now});
 assert.equal(failed.uncertain,1);assert.equal(m.pushes.length,1);
 assert.deepEqual(m.pushes[0].payload.messages.map(x=>x.type),['text']);
 for(const time of ['01:10','01:12','01:32','02:02']){
   const t=new Date('2026-10-21T'+time+':00Z');
   assert.equal(dailyRetryWindow({localTime:time}),false);
   const held=await dailySiteSendTick(env,{...m,now:t});
   assert.equal(held.textAccepted+held.imageAccepted,0);
   assert.equal(m.pushes.length,1);
 }
 assert.equal(m.metas.every(x=>x.p_stage==='form_text'),true);
});

test('429 uncertain PNG is held while already delivered FORM stays delivered',async()=>{
 const {dailySiteSendTick}=await load();const m=mock(),transport=m.transport;
 const text=await dailySiteSendTick(env,{...m,now});
 assert.equal(text.textAccepted,1);
 let once=true;
 m.transport=async(u,o)=>{
   if(u.includes('/message/push')&&once){
     once=false;
     m.pushes.push({payload:JSON.parse(o.body),retry:o.headers['X-Line-Retry-Key']});
     return {ok:false,status:429,json:async()=>({message:'rate limit'})};
   }
   return transport(u,o);
 };
 const image=await dailySiteSendTick(env,{...m,now});
 assert.equal(image.uncertain,1);assert.equal(m.pushes.length,2);
 assert.deepEqual(m.pushes[1].payload.messages.map(x=>x.type),['image']);
 const held=await dailySiteSendTick(env,{...m,now:new Date('2026-10-21T01:12:00Z')});
 assert.equal(held.textAccepted+held.imageAccepted,0);
 assert.equal(m.pushes.length,2);
});

test('monthly quota exhausted and unverified membership block all pushes',async()=>{
 const {dailySiteSendTick}=await load();
 const q=mock(),original=q.transport;
 q.transport=async(u,o)=>u.endsWith('/message/quota/consumption')
  ? {ok:true,status:200,json:async()=>({totalUsage:1000})}
  : original(u,o);
 const blocked=await dailySiteSendTick(env,{...q,now});
 assert.equal(blocked.mode,'QUOTA_BLOCKED');assert.equal(q.pushes.length,0);
 const group=mock(),t=group.transport;
 group.transport=async(u,o)=>u.includes('/members/count')
  ? {ok:false,status:403}:t(u,o);
 const noGroup=await dailySiteSendTick(env,{...group,now});
 assert.equal(noGroup.blocked,3);assert.equal(group.pushes.length,0);
});

test('409 accepted retry key ACKs each stage in order without duplicate sends',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();const orig=m.transport;
 m.transport=async(u,o)=>{
  if(u.includes('/message/push')) {
   m.pushes.push({payload:JSON.parse(o.body),retry:o.headers['X-Line-Retry-Key']});
   return {status:409,ok:false,
     headers:{get:n=>n==='x-line-accepted-request-id'?'accepted-original':null},
     json:async()=>({message:'A request with this retry key has already been accepted.'})};
  }
  return orig(u,o);
 };
 const one=await dailySiteSendTick(env,{...m,now});
 assert.equal(one.textAccepted,1);assert.equal(one.imageAccepted,0);
 const two=await dailySiteSendTick(env,{...m,now});
 assert.equal(two.textAccepted,0);assert.equal(two.imageAccepted,1);
 assert.deepEqual(m.pushes.map(p=>p.payload.messages.map(x=>x.type)),[['text'],['image']]);
 const three=await dailySiteSendTick(env,{...m,now});
 assert.equal(three.textAccepted+three.imageAccepted,0);
 assert.equal(m.pushes.length,2);
});
test('image gateway URL agrees between worker and deployed Edge Function name',async()=>{
 const fs=require('node:fs');
 const worker=fs.readFileSync('cloudflare/dailySiteSendTick.mjs','utf8');
 const gateway=fs.readFileSync('supabase/functions/3kings-daily-line-images/index.ts','utf8');
 const route='/functions/v1/kings_daily_line_images';
 assert(worker.includes(route+'/ready?'));
 assert(worker.includes(route+'/image?'));
 assert(gateway.includes(route));
 assert(!worker.includes('/functions/v1/3kings-daily-line-images/'));
 assert(!gateway.includes('/functions/v1/3kings-daily-line-images/'));
});
test('live sender keeps missing image proof fail-closed and never guesses routes',async()=>{
 const {dailySiteSendTick,DAILY_ROUTES}=await load();
 assert.deepEqual(DAILY_ROUTES.map(r=>r.route),['above_villa','above_condo_a','above_condo_b']);
 const m=mock();
 m.transport=async(u,o)=>{
  if(u.includes('/ready?'))return {ok:true,json:async()=>({ready:true,assets:[{
   site:'above_villa',sha256:'c'.repeat(64),width:2947,height:2000,
   url:'https://example.com/untrusted.png'
  }]})};
  throw Error('must not send');
 };
 const result=await dailySiteSendTick(env,{...m,now});
 assert.equal(result.mode,'QA_BLOCKED');
 assert.equal(m.pushes.length,0);
});

test('daily sender reads only dedicated owner-approved routes and preserves staged legacy',async()=>{
 const fs=require('node:fs');
 const worker=fs.readFileSync('cloudflare/dailySiteSendTick.mjs','utf8');
 assert(worker.includes('/rpc/line_autopilot_daily_route'));
 assert(!worker.includes('/rpc/line_autopilot_preview_route'));
 const sql=fs.readFileSync('tests/fixtures/line-autopilot/daily_live_routes_REFERENCE_ONLY.sql','utf8');
 assert(sql.includes('line_autopilot.daily_live_routes'));
 assert(sql.includes('r.enabled IS TRUE'));
 assert(sql.includes('r.owner_approved_at IS NOT NULL'));
 assert(sql.includes('c.verified_member IS TRUE'));
 assert(sql.includes('c.group_name=r.expected_group_name'));
 assert(sql.includes('REVOKE ALL ON FUNCTION public.line_autopilot_daily_route(text) FROM PUBLIC,anon,authenticated'));
 assert(!sql.includes('DROP CONSTRAINT'));
});

test('three approved groups each receive FORM first, then their mapped PNG, never twice',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const groups={above_villa:'C'+'a'.repeat(32),above_condo_a:'C'+'b'.repeat(32),above_condo_b:'C'+'c'.repeat(32)};
 const original=m.db;
 m.db=(env,path,arg)=>path.includes('line_autopilot_daily_route')
   ? [{would_send_line:true,group_id:groups[arg.p_site_code]}]
   : original(env,path,arg);
 const crypto=require('node:crypto');
 m.hash=async input=>crypto.createHash('sha256').update(input).digest('hex');
 const a=await dailySiteSendTick(env,{...m,now});
 assert.equal(a.textAccepted,3);assert.equal(a.imageAccepted,0);
 assert.equal(a.bundlesAccepted,0);assert.equal(m.pushes.length,3);
 assert(m.pushes.every(p=>p.payload.messages.length===1&&p.payload.messages[0].type==='text'));
 const b=await dailySiteSendTick(env,{...m,now});
 assert.equal(b.textAccepted,0);assert.equal(b.imageAccepted,3);assert.equal(m.pushes.length,6);
 assert(m.pushes.slice(3).every(p=>p.payload.messages.length===1&&p.payload.messages[0].type==='image'));
 const c=await dailySiteSendTick(env,{...m,now});
 assert.equal(c.textAccepted+c.imageAccepted,0);assert.equal(m.pushes.length,6);
 assert.equal(new Set(m.metas.map(x=>x.p_event_key)).size,6);
 assert.equal(m.pushes[4].payload.messages[0].originalContentUrl,
              m.pushes[5].payload.messages[0].originalContentUrl);
 assert.notEqual(m.pushes[4].payload.to,m.pushes[5].payload.to);
});

test('legacy delivered text with uncertain image stays held, no automated replay',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const imageKey='b'.repeat(64),textKey='a'.repeat(64);
 m.ledger.set(textKey,{status:'already_sent'});
 m.ledger.set(imageKey,{status:'in_flight'});
 const x=await dailySiteSendTick(env,{...m,now:new Date('2026-10-21T01:12:00Z')});
 assert.equal(x.textAccepted,0);assert.equal(x.imageAccepted,0);
 assert.equal(m.pushes.length,0);
});

test('Publisher v2.0 handoff blocks stale PDF date, bad PDF hash and incorrect PNG names before LINE',async()=>{
 const {dailySiteSendTick}=await load();
 const checks=[
   {report_date:'2026-10-19'},
   {pdf_sha256:'missing-or-stale'},
   {assets:'wrong_name'}
 ];
 for(const invalid of checks){
   const m=mock(),orig=m.transport;
   m.transport=async(u,o)=>u.includes('/ready?')
     ? {ok:true,status:200,json:async()=>({
       ready:true,report_date:'2026-10-20',pdf_sha256:'d'.repeat(64),
       assets:invalid.assets==='wrong_name'
         ? m.assets.map((asset,index)=>index===0?{...asset,filename:'old.png'}:asset)
         :m.assets,
       ...('report_date' in invalid?{report_date:invalid.report_date}:{}),
       ...('pdf_sha256' in invalid?{pdf_sha256:invalid.pdf_sha256}:{})
     })}
     :orig(u,o);
   const r=await dailySiteSendTick(env,{...m,now});
   assert.equal(r.mode,invalid.assets==='wrong_name'?'IMAGE_METADATA_BLOCKED':'QA_BLOCKED');
   assert.equal(m.pushes.length,0);
   assert.equal(m.metas.length,0);
 }
});
