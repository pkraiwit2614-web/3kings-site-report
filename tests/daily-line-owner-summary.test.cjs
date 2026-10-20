'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../cloudflare/dailySiteSendTick.mjs');
const owner='U'+'a'.repeat(32);
const env={
 DAILY_SITE_LINE_ENABLED:'true',
 SUPABASE_URL:'https://example.supabase.co',
 SUPABASE_SERVER_KEY:'test-service-only',
 LINE_CHANNEL_ACCESS_TOKEN:'test-token',
 LINE_OWNER_USER_ID:owner
};
const ready=()=>{
 const sites=['above_villa','above_condo_a','above_condo_b'].map(site_code=>({
  site_code,form_status:'delivered',form_http:200,
  image_status:'delivered',image_http:200
 }));
 return {report_date:'2026-10-20',qa_published:true,sites};
};
const moment=time=>new Date('2026-10-21T'+time+':00Z');
function fixture(report=ready()){
 const ledger=new Map(),pushes=[],requests=[];
 const hash=async()=>('f'.repeat(64));
 const db=async(_env,path,body)=>{
  requests.push({path,body});
  if(path.includes('line_autopilot_daily_owner_summary'))return report;
  if(path.includes('line_autopilot_claim')){
   assert.equal(body.p_alert_kind,'daily_site_report');
   assert.equal(body.p_target_scope,'owner');
   const known=ledger.get(body.p_event_key);
   return [{claim_status:known?.status||'new',
    retry_key:'00000000-0000-4000-8000-000000000001'}];
  }
  if(path.includes('line_autopilot_ack')){
   const record=ledger.get(body.p_event_key)||{};
   ledger.set(body.p_event_key,{...record,
    status:body.p_status==='delivered'?'already_sent':'in_flight'});
   return true;
  }
  throw Error('Unexpected db call '+path);
 };
 const transport=async(_url,options)=>{
  const p=JSON.parse(options.body);
  pushes.push({body:p,headers:options.headers});
  return {ok:true,status:200};
 };
 return {ledger,pushes,requests,hash,db,transport};
}
test('owner gets one combined 3-group summary; next cron does not send again',async()=>{
 const {dailyOwnerSummaryTick}=await load(),m=fixture();
 const a=await dailyOwnerSummaryTick(env,{...m,now:moment('01:06')});
 assert.equal(a.mode,'OWNER_ACCEPTED');assert.equal(a.delivered,true);
 assert.equal(m.pushes.length,1);
 const p=m.pushes[0].body;
 assert.equal(p.to,owner);
 assert.equal(p.messages.length,1);
 assert.equal(p.messages[0].type,'text');
 assert.match(p.messages[0].text,/3\/3/);
 assert.match(p.messages[0].text,/Above Villa/);
 assert.match(p.messages[0].text,/Condo A/);
 assert.match(p.messages[0].text,/Condo B/);
 assert(!p.messages[0].text.includes(owner));
 const b=await dailyOwnerSummaryTick(env,{...m,now:moment('01:08')});
 assert.equal(b.mode,'OWNER_ALREADY_SENT');assert.equal(m.pushes.length,1);
});
test('partial failure waits through retry window, then privately reports exact status',async()=>{
 const {dailyOwnerSummaryTick}=await load(),data=ready();
 const target=data.sites.find(x=>x.site_code==='above_condo_b');
 target.image_status='uncertain';target.image_http=429;
 const m=fixture(data);
 const early=await dailyOwnerSummaryTick(env,{...m,now:moment('01:08')});
 assert.equal(early.mode,'OWNER_WAIT_RETRIES');assert.equal(m.pushes.length,0);
 const final=await dailyOwnerSummaryTick(env,{...m,now:moment('01:40')});
 assert.equal(final.mode,'OWNER_ACCEPTED');assert.equal(m.pushes.length,1);
 const message=m.pushes[0].body.messages[0].text;
 assert.match(message,/2\/3/);
 assert.match(message,/Condo B.*HTTP 429/);
 const noDup=await dailyOwnerSummaryTick(env,{...m,now:moment('01:42')});
 assert.equal(noDup.mode,'OWNER_ALREADY_SENT');assert.equal(m.pushes.length,1);
});
test('no owner message on 20 Oct, Sundays, disabled flag or invalid owner',async()=>{
 const {dailyOwnerSummaryTick}=await load(),m=fixture();
 const old=await dailyOwnerSummaryTick(env,{...m,now:new Date('2026-10-20T01:08:00Z')});
 assert.equal(old.mode,'OWNER_OFF');
 const sun=await dailyOwnerSummaryTick(env,{...m,now:new Date('2026-10-25T01:08:00Z')});
 assert.equal(sun.mode,'OWNER_OFF');
 const off=await dailyOwnerSummaryTick({...env,DAILY_SITE_LINE_ENABLED:'false'},
  {...m,now:moment('01:08')});
 assert.equal(off.mode,'OWNER_OFF');
 const bad=await dailyOwnerSummaryTick({...env,LINE_OWNER_USER_ID:'unknown'},
  {...m,now:moment('01:08')});
 assert.equal(bad.mode,'OWNER_OFF');
 assert.equal(m.pushes.length,0);assert.equal(m.requests.length,0);
});
test('unverified source report cannot trigger owner DM',async()=>{
 const {dailyOwnerSummaryTick}=await load(),m=fixture({...ready(),sites:[]});
 const r=await dailyOwnerSummaryTick(env,{...m,now:moment('01:40')});
 assert.equal(r.mode,'OWNER_LOG_INVALID');assert.equal(m.pushes.length,0);
});
test('429 owner DM retry reuses same LINE retry key, no blind immediate resend',async()=>{
 const {dailyOwnerSummaryTick}=await load(),m=fixture();
 const original=m.transport;let first=true;
 m.transport=async(u,o)=>{
  if(first){
   first=false;
   m.pushes.push({body:JSON.parse(o.body),headers:o.headers});
   return {ok:false,status:429};
  }
  return original(u,o);
 };
 const a=await dailyOwnerSummaryTick(env,{...m,now:moment('01:06')});
 assert.equal(a.mode,'OWNER_UNCERTAIN');assert.equal(m.pushes.length,1);
 const b=await dailyOwnerSummaryTick(env,{...m,now:moment('01:20')});
 assert.equal(b.mode,'OWNER_NO_RETRY');assert.equal(m.pushes.length,1);
 const c=await dailyOwnerSummaryTick(env,{...m,now:moment('01:44')});
 assert.equal(c.mode,'OWNER_ACCEPTED');assert.equal(m.pushes.length,2);
 assert.equal(m.pushes[0].headers['X-Line-Retry-Key'],
              m.pushes[1].headers['X-Line-Retry-Key']);
});
test('owner summary SQL is locked to service_role and no raw group identifiers',()=>{
 const fs=require('node:fs');
 const sql=fs.readFileSync(
  'tests/fixtures/line-autopilot/daily_owner_summary_REFERENCE_ONLY.sql','utf8');
 assert.match(sql,/current_user <> 'service_role'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.line_autopilot_daily_owner_summary/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.line_autopilot_daily_owner_summary/);
 assert.match(sql,/p_target_scope='owner'/);
 assert(!sql.includes('SELECT * FROM line_autopilot.group_candidates'));
});
