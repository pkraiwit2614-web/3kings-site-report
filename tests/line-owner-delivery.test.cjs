'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash,createHmac}=require('node:crypto');
const filename=path.resolve(__dirname,'../operations/cloudflare/3kings-line-autopilot-owner-only.mjs');
const source=fs.readFileSync(filename,'utf8');
const modulePromise=import(pathToFileURL(filename).href);
const now=new Date('2026-10-21T02:05:00Z');
const reportDate='2026-10-20';
const suffixes=[['above_villa','Page_01_Above_Villa'],
['above_condo','Page_02_Above_Condo'],['mirage','Page_03_Mirage'],['henessy','Page_04_Henessy']];
const assets=()=>suffixes.map(([site,suffix],i)=>({
  site,filename:'Daily_Site_Report_20-10-2026_'+suffix+'.png',
  width:2947,height:1200+i*100,sha256:String(i+1).repeat(64),
  url:'https://example.supabase.co/functions/v1/kings_daily_line_images/image?date=2026-10-20&site='+site
}));
const envelope=()=>({ready:true,report_date:reportDate,pdf_sha256:'a'.repeat(64),assets:assets()});
const env={DAILY_SITE_LINE_ENABLED:'true',DAILY_LINE_BRIDGE_TOKEN:'bridge-placeholder',
 SUPABASE_URL:'https://example.supabase.co',LINE_CHANNEL_ACCESS_TOKEN:'dummy-private',
 LINE_OWNER_USER_ID:'U'+'0'.repeat(32),AUTOPILOT_ENABLED:'false'};
function fixture({manifest=envelope(),quota=300,consumed=276,claimStatus='new',pushStatus=200}={}){
 const calls=[],dbCalls=[],ack=[];
 const transport=async(url,opts={})=>{
   calls.push({url,options:opts});
   if(url.includes('/ready?'))return{ok:true,status:200,json:async()=>manifest};
   if(url.endsWith('/quota'))return{ok:true,status:200,json:async()=>({type:'limited',value:quota})};
   if(url.endsWith('/quota/consumption'))return{ok:true,status:200,json:async()=>({totalUsage:consumed})};
   if(url==='https://api.line.me/v2/bot/message/push')return{
     ok:pushStatus===200,status:pushStatus,
     headers:{get:()=>null},json:async()=>({message:'simulated'})
   };
   throw Error('unexpected-network-'+url);
 };
 const db=async(_env,p,args)=>{
   dbCalls.push({p,args});
   if(p.endsWith('/line_autopilot_claim'))return [{claim_status:claimStatus,
     retry_key:'11111111-1111-4111-8111-111111111111'}];
   if(p.endsWith('/line_autopilot_ack')){ack.push(args);return true;}
   throw Error('unexpected-db-'+p);
 };
 return {calls,dbCalls,ack,transport,db,hash:async s=>createHash('sha256').update(s).digest('hex')};
}
async function run(f,o){const m=await modulePromise;return m.dailyOwnerSummaryTick(env,{...f,now:o||now});}
test('one approved owner gets exactly one LINE push: form text first, 4 original PNGs after',async()=>{
 const f=fixture();const result=await run(f);
 assert.equal(result.mode,'OWNER_BUNDLE_ACCEPTED');
 const sends=f.calls.filter(x=>x.url.includes('/message/push'));
 assert.equal(sends.length,1);
 const body=JSON.parse(sends[0].options.body);
 assert.equal(body.to,env.LINE_OWNER_USER_ID);
 assert.equal(body.messages.length,5);
 assert.equal(body.messages[0].type,'text');
 assert.match(body.messages[0].text,/forms\.gle/);
 for(let i=1;i<5;i++){
   assert.equal(body.messages[i].type,'image');
   assert.match(body.messages[i].originalContentUrl,new RegExp('site='+suffixes[i-1][0]+'$'));
 }
 assert.equal(f.dbCalls.filter(x=>x.p.includes('daily_route')).length,0);
 assert.equal(f.ack.length,1);
 assert.equal(f.ack[0].p_status,'delivered');
});
test('late QA report can be sent once at 14:05 Bangkok without enabling other AutoPilot collectors',async()=>{
 const f=fixture();
 const out=await run(f,new Date('2026-10-21T07:05:00Z')); // 14:05 Bangkok
 assert.equal(out.mode,'OWNER_BUNDLE_ACCEPTED');
 assert.equal(f.calls.filter(x=>x.url.includes('/message/push')).length,1);
 assert.equal(f.ack[0].p_status,'delivered');
 const sameDate=fixture({claimStatus:'already_sent'});
 assert.equal((await run(sameDate,new Date('2026-10-21T08:05:00Z'))).mode,'OWNER_ALREADY_SENT');
 assert.equal(sameDate.calls.filter(x=>x.url.includes('/message/push')).length,0);
});
test('owner-only catch-up closes after 18:00 Bangkok and never reopens on Sunday',async()=>{
 const atEnd=fixture();
 assert.equal((await run(atEnd,new Date('2026-10-21T11:00:00Z'))).mode,'OWNER_BUNDLE_ACCEPTED');
 const afterEnd=fixture();
 assert.equal((await run(afterEnd,new Date('2026-10-21T11:01:00Z'))).mode,'OWNER_OFF');
 assert.equal(afterEnd.calls.length,0);
 const sunday=fixture();
 assert.equal((await run(sunday,new Date('2026-10-25T08:05:00Z'))).mode,'OWNER_OFF');
 assert.equal(sunday.calls.length,0);
});
test('never schedule old LINE group delivery or separate owner summary',()=>{
 const scheduled=source.slice(source.lastIndexOf('  async scheduled('));
 assert.ok(scheduled.includes('dailyOwnerSummaryTick('));
 assert.ok(!scheduled.includes('dailySiteSendTick('));
 assert.ok(!scheduled.includes('daily_owner_summary_tick'));
 assert.ok(scheduled.includes('daily_owner_report_tick'));
 assert.ok(scheduled.includes("controller?.cron==='30 12 * * 1-6'"));
 assert.ok(scheduled.includes('eveningOwnerCommandsTick('));
});
test('QA mismatch refuses to send without claiming',async()=>{
 const b=envelope();b.pdf_sha256='invalid';const f=fixture({manifest:b});
 assert.equal((await run(f)).mode,'OWNER_QA_BLOCKED');
 assert.equal(f.calls.filter(x=>x.url.includes('/message/push')).length,0);
 assert.equal(f.dbCalls.length,0);
});
test('missing site or bad filename refuses to send',async()=>{
 const b=envelope();b.assets[3].filename='old.png';const f=fixture({manifest:b});
 assert.equal((await run(f)).mode,'OWNER_IMAGE_BLOCKED');
 assert.equal(f.dbCalls.length,0);
});
test('free quota exhausted blocks safely before claim',async()=>{
 const f=fixture({quota:300,consumed:300});
 assert.equal((await run(f)).mode,'OWNER_QUOTA_BLOCKED');
 assert.equal(f.calls.filter(x=>x.url.includes('/message/push')).length,0);
 assert.equal(f.dbCalls.length,0);
});
test('in-flight claim is HELD without LINE push',async()=>{
 const f=fixture({claimStatus:'in_flight'});
 assert.equal((await run(f)).mode,'OWNER_NO_RETRY');
 assert.equal(f.calls.filter(x=>x.url.includes('/message/push')).length,0);
});
test('previous owner DM blocks second delivery on same report date',async()=>{
 const f=fixture({claimStatus:'already_sent'});
 assert.equal((await run(f)).mode,'OWNER_ALREADY_SENT');
 assert.equal(f.calls.filter(x=>x.url.includes('/message/push')).length,0);
});
test('429 response becomes uncertain, never delivered',async()=>{
 const f=fixture({pushStatus:429});
 assert.equal((await run(f)).mode,'OWNER_BUNDLE_UNCERTAIN');
 assert.equal(f.ack[0].p_status,'uncertain');
 assert.equal(f.ack[0].p_http_status,429);
});
test('Sundays do not send; Monday uses Saturday report',async()=>{
 const f=fixture();
 assert.equal((await run(f,new Date('2026-10-25T02:05:00Z'))).mode,'OWNER_OFF');
 assert.equal(f.calls.length,0);
 const m=await modulePromise;
 assert.equal(m.dailyBangkokPolicy(new Date('2026-10-26T02:05:00Z')).reportDate,'2026-10-24');
});
test('owner endpoint disabled keeps zero outbound requests',async()=>{
 const f=fixture();const m=await modulePromise;
 const r=await m.dailyOwnerSummaryTick({...env,DAILY_SITE_LINE_ENABLED:'false'},{...f,now});
 assert.equal(r.mode,'OWNER_OFF');assert.equal(f.calls.length,0);
});

test('LINE webhook HMAC rejects invalid or tampered input; valid signed empty event stays receiver-only (no sends)',async()=>{
 const worker=(await modulePromise).default;
 const cfg={LINE_CHANNEL_SECRET:'synthetic-hmac-key-only',AUTOPILOT_ENABLED:'false',
  DAILY_SITE_LINE_ENABLED:'false',LINE_GROUP_DISCOVERY_ENABLED:'false'};
 const raw=JSON.stringify({destination:'U'+'f'.repeat(32),events:[]});
 const signature=createHmac('sha256',cfg.LINE_CHANNEL_SECRET).update(raw).digest('base64');
 const makeRequest=(sig,body=raw)=>new Request('https://example.test/line/webhook',{
  method:'POST',headers:{'x-line-signature':sig},body
 });
 const originalFetch=global.fetch;
 let outbound=0;
 global.fetch=async()=>{outbound++;throw Error('unexpected external request');};
 try{
  assert.equal((await worker.fetch(makeRequest('invalid'),cfg)).status,401);
  assert.equal((await worker.fetch(makeRequest(signature,raw+' '),cfg)).status,401);
  const valid=await worker.fetch(makeRequest(signature),cfg);
  assert.equal(valid.status,200);
  assert.deepEqual(await valid.json(),{ok:true,processed:0,mode:'receiver_only'});
  assert.equal(outbound,0,'receiver-only webhook must never dispatch LINE or make DB requests');
 }finally{global.fetch=originalFetch;}
});
