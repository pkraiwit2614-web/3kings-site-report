'use strict';
// Network-only, read-only, no credentials and never sends LINE.
// Executed in GitHub Actions runners; fail closed for release readiness.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const base='https://wtqubwdduzedmcvyhbgs.supabase.co/functions/v1/kings_daily_line_images';
const worker='https://3kings-line-autopilot.p-kraiwit2614.workers.dev';
const get=async url=>{
 const controller=new AbortController();
 const t=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(url,{signal:controller.signal,redirect:'error'});
  const type=r.headers.get('content-type')||'';
  const body=type.includes('application/json')?await r.json():{};
  return {status:r.status,body,type};
 }finally{clearTimeout(t)}
};
test('live Edge health returns no send capability',async()=>{
 const r=await get(base+'/health');
 assert.equal(r.status,200);
 assert.equal(r.body.line_sends_enabled,false);
 assert.equal(r.body.ready,true);
});
test('live gateway denies unauthenticated ready and unsigned image access',async()=>{
 const r=await get(base+'/ready?date=2026-10-17');
 assert.equal(r.status,401);
 const bad=await get(base+'/image?date=2026-10-17&site=above_villa&sha='+('a'.repeat(64))+'&exp=1793000000&sig='+('b'.repeat(64)));
 assert.equal(bad.status,403);
});
test('live Cloudflare health confirms server-to-server gateway handshake, no push',async()=>{
 const r=await get(worker+'/daily-line/health');
 assert.equal(r.status,200);
 assert.equal(r.body.service,'daily-line');
 // 19 Oct's manually QA-finalized Saturday 17 Oct is valid only TODAY (19 Oct).
 // This probes the private server key with no external LINE action.
 assert.equal(r.body.gateway_http_status,200,JSON.stringify({gateway_status:r.body.gateway_http_status,server_role_rpc:r.body.server_role_rpc}));
 assert.equal(r.body.gateway,true);
});
