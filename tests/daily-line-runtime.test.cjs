'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const url='https://wtqubwdduzedmcvyhbgs.supabase.co';
const env={DAILY_SITE_LINE_ENABLED:'true',SUPABASE_URL:url,
  SUPABASE_SERVER_KEY:'test-only',LINE_CHANNEL_ACCESS_TOKEN:'test-only'};
const load=()=>import('../cloudflare/dailySiteSendTick.mjs');
const now=new Date('2026-10-20T01:04:00Z');
function mock(){
 const pushes=[],ledger=new Map(),metas=[];
 const assets=['above_villa','above_condo','mirage','henessy'].map(site=>({
   site,sha256:'c'.repeat(64),width:2947,height:2000,
   url:url+'/functions/v1/kings_daily_line_images/image?site='+site}));
 const transport=async (request,options)=>{
  if(request.includes('/ready?'))return {ok:true,status:200,json:async()=>({ready:true,assets})};
  if(request.includes('api.line.me')){
    pushes.push({payload:JSON.parse(options.body),retry:options.headers['X-Line-Retry-Key']});
    return {ok:true,status:200};
  }
  throw Error('unexpected URL');
 };
 const db=async (_env,path,body)=>{
   if(path.includes('line_autopilot_preview_route'))
     return [{would_send_line:body.p_site_code==='above_villa',candidate_group_id:'C'+'a'.repeat(32)}];
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
test('Text then image in separate ticks, then no duplicates',async()=>{
 const {dailySiteSendTick}=await load();const m=mock();
 const a=await dailySiteSendTick(env,{...m,now});
 assert.equal(a.textAccepted,1);assert.equal(a.imageAccepted,0);
 assert.equal(m.pushes.length,1);assert.equal(m.pushes[0].payload.messages[0].type,'text');
 const b=await dailySiteSendTick(env,{...m,now});
 assert.equal(b.imageAccepted,1);
 assert.equal(m.pushes.length,2);assert.equal(m.pushes[1].payload.messages[0].type,'image');
 const c=await dailySiteSendTick(env,{...m,now});
 assert.equal(c.imageAccepted,0);assert.equal(m.pushes.length,2);
 assert.equal(m.metas.length,2);
 assert(m.metas.every(x=>x.p_site_code==='above_villa'));
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
