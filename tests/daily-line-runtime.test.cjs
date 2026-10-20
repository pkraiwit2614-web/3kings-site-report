'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const url='https://wtqubwdduzedmcvyhbgs.supabase.co';
const env={DAILY_SITE_LINE_ENABLED:'true',SUPABASE_URL:url,
  SUPABASE_SERVER_KEY:'test-only',DAILY_LINE_BRIDGE_TOKEN:'dedicated-test-token',LINE_CHANNEL_ACCESS_TOKEN:'test-only'};
const load=()=>import('../cloudflare/dailySiteSendTick.mjs');
const now=new Date('2026-10-20T01:04:00Z');
function mock(){
 const pushes=[],ledger=new Map(),metas=[];
 const assets=['above_villa','above_condo','mirage','henessy'].map(site=>({
   site,sha256:'c'.repeat(64),width:2947,height:2000,
   url:url+'/functions/v1/kings_daily_line_images/image?site='+site}));
 const transport=async (request,options)=>{
  if(request.includes('/ready?'))return {ok:true,status:200,json:async()=>({ready:true,assets})};
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
 return {pushes,ledger,metas,transport,db,hash};
}
test('Sunday and disabled flag send nothing',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const a=await dailySiteSendTick(env,{...m,now:new Date('2026-10-18T01:02:00Z')});
 assert.equal(a.mode,'NO_SEND');
 const b=await dailySiteSendTick({...env,DAILY_SITE_LINE_ENABLED:'false'},{...m,now});
 assert.equal(b.mode,'NO_SEND');assert.equal(m.pushes.length,0);
});
test('select Saturday on Monday, yesterday otherwise',async()=>{
 const {dailyBangkokPolicy}=await load();
 assert.equal(dailyBangkokPolicy(new Date('2026-10-19T01:02:00Z')).reportDate,'2026-10-17');
 assert.equal(dailyBangkokPolicy(now).reportDate,'2026-10-19');
});
test('No messages when QA gateway missing',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 m.transport=async()=>({ok:false,status:503});
 const x=await dailySiteSendTick(env,{...m,now});
 assert.equal(x.mode,'GATEWAY_NOT_READY');assert.equal(m.pushes.length,0);
});
test('fresh send batches Form and image into ONE request; subsequent cron does not duplicate',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const first=await dailySiteSendTick(env,{...m,now});
 assert.equal(first.textAccepted,1);assert.equal(first.imageAccepted,1);
 assert.equal(first.bundlesAccepted,1);
 assert.equal(m.pushes.length,1);
 assert.deepEqual(m.pushes[0].payload.messages.map(x=>x.type),['text','image']);
 const second=await dailySiteSendTick(env,{...m,now});
 assert.equal(second.textAccepted+second.imageAccepted,0);
 assert.equal(m.pushes.length,1);
 assert.equal(new Set(m.metas.map(x=>x.p_event_key)).size,2);
 assert(m.metas.every(x=>x.p_site_code==='above_villa'));
});

test('429 is recorded uncertain; reuses same retry key only in a bounded slot',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
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
 const tooSoon=await dailySiteSendTick(env,{...m,now:new Date('2026-10-20T01:10:00Z')});
 assert.equal(tooSoon.textAccepted+tooSoon.imageAccepted,0);
 assert.equal(m.pushes.length,1);
 const recovered=await dailySiteSendTick(env,{...m,now:new Date('2026-10-20T01:12:00Z')});
 assert.equal(recovered.bundlesAccepted,1);
 assert.equal(m.pushes.length,2);
 assert.equal(m.pushes[0].retry,m.pushes[1].retry);
 const done=await dailySiteSendTick(env,{...m,now:new Date('2026-10-20T01:32:00Z')});
 assert.equal(done.textAccepted+done.imageAccepted,0);
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
 assert.equal(noGroup.blocked,1);assert.equal(group.pushes.length,0);
});

test('409 with matching accepted request is idempotent, not a fresh delivery',async()=>{
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
 const result=await dailySiteSendTick(env,{...m,now});
 assert.equal(result.bundlesAccepted,1);
 assert.equal(m.pushes.length,1);
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
 const sql=fs.readFileSync('supabase/migrations/20261019184500_daily_line_isolated_live_routes.sql','utf8');
 assert(sql.includes('line_autopilot.daily_live_routes'));
 assert(sql.includes('r.enabled IS TRUE'));
 assert(sql.includes('r.owner_approved_at IS NOT NULL'));
 assert(sql.includes('c.verified_member IS TRUE'));
 assert(sql.includes('c.group_name=r.expected_group_name'));
 assert(sql.includes('REVOKE ALL ON FUNCTION public.line_autopilot_daily_route(text) FROM PUBLIC,anon,authenticated'));
 assert(!sql.includes('DROP CONSTRAINT'));
});

test('three approved routes each get one two-object push; Condo A/B share only report URL',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const groups={above_villa:'C'+'a'.repeat(32),above_condo_a:'C'+'b'.repeat(32),above_condo_b:'C'+'c'.repeat(32)};
 const original=m.db;
 m.db=(env,path,arg)=>path.includes('line_autopilot_daily_route')
   ? [{would_send_line:true,group_id:groups[arg.p_site_code]}]
   : original(env,path,arg);
 const crypto=require('node:crypto');
 m.hash=async input=>crypto.createHash('sha256').update(input).digest('hex');
 const a=await dailySiteSendTick(env,{...m,now});
 assert.equal(a.textAccepted,3);assert.equal(a.imageAccepted,3);
 assert.equal(a.bundlesAccepted,3);assert.equal(m.pushes.length,3);
 assert(m.pushes.every(p=>p.payload.messages.length===2));
 const b=await dailySiteSendTick(env,{...m,now});
 assert.equal(b.textAccepted+b.imageAccepted,0);assert.equal(m.pushes.length,3);
 assert.equal(new Set(m.metas.map(x=>x.p_event_key)).size,6);
 assert.equal(m.pushes[1].payload.messages[1].originalContentUrl,
              m.pushes[2].payload.messages[1].originalContentUrl);
 assert.notEqual(m.pushes[1].payload.to,m.pushes[2].payload.to);
});

test('legacy text already delivered plus uncertain image retries IMAGE only on same key',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const imageKey='b'.repeat(64),textKey='a'.repeat(64);
 m.ledger.set(textKey,{status:'already_sent'});
 m.ledger.set(imageKey,{status:'in_flight'});
 const x=await dailySiteSendTick(env,{...m,now:new Date('2026-10-20T01:12:00Z')});
 assert.equal(x.textAccepted,0);assert.equal(x.imageAccepted,1);
 assert.equal(m.pushes.length,1);
 assert.deepEqual(m.pushes[0].payload.messages.map(v=>v.type),['image']);
});
