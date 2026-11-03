'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const m=import(pathToFileURL(path.resolve(__dirname,'../operations/sync-monitor/owner-alerts.mjs')).href);
const id='11111111-1111-4111-8111-111111111111';
const run=(status='success')=>({id,status,sync_type:'materials',source_file:'Master.xlsx',created_at:'2026-11-03T10:19:51Z'});
const stage={fileId:'drive-file',revision:'r1',rows:614,sha256:'a'.repeat(64)};
const proof=()=>({source:{...stage},parser:{...stage},database:{...stage},web:{...stage,authenticated:true}});
test('success requires matching source/parser/database/authenticated web',async()=>{
 const x=await m;
 assert.equal(x.classifyRun(run(),proof()).status,'PASS');
 assert.equal(x.classifyRun(run()).status,'UNVERIFIED');
 const p=proof();p.web.authenticated=false;
 assert.equal(x.classifyRun(run(),p).status,'UNVERIFIED');
 const q=proof();q.database.rows=613;
 assert.equal(x.classifyRun(run(),q).status,'FAIL');
});
test('explicit errors, unknown statuses and invalid logs are not success',async()=>{
 const x=await m;
 assert.equal(x.classifyRun(run('error')).status,'FAIL');
 assert.equal(x.classifyRun(run('dry-run')).status,'HOLD');
 assert.equal(x.classifyRun({...run(),id:'bad'}).status,'SKIP');
 assert.match(x.lineMessage(run(),x.classifyRun(run())),/Log success ไม่ใช่ Web PASS/);
});
test('OFF means zero external calls',async()=>{
 const x=await m;let count=0;
 const side=async()=>{count++;return {allow:true}};
 assert.equal((await x.deliverOnce({run:run(),quota:side,claim:side,push:side,ack:side})).status,'OFF');
 assert.equal(count,0);
});
test('verified delivery claims and sends to owner once then acknowledges',async()=>{
 const x=await m;const calls=[];
 const opts={enabled:true,run:run(),proof:proof(),
  sha256:async s=>createHash('sha256').update(s).digest('hex'),
  quota:async()=>({allow:true}),
  claim:async d=>{calls.push(['claim',d]);return {claim_status:'new',retry_key:id}},
  push:async d=>{calls.push(['push',d]);return {status:200}},
  ack:async d=>{calls.push(['ack',d])}};
 const r=await x.deliverOnce(opts);
 assert.equal(r.status,'DELIVERED');
 assert.equal(r.runStatus,'PASS');
 assert.equal(calls.length,3);
 assert.equal(calls[0][1].scope,'owner');
 assert.equal(calls[1][1].retryKey,id);
 assert.equal(calls[2][1].retryKey,id);
});
test('quota exhausted / duplicate / HTTP 429 never produces false delivery',async()=>{
 const x=await m;let sends=0;const acks=[];
 const base={enabled:true,run:run('error'),
 sha256:async s=>createHash('sha256').update(s).digest('hex'),
 quota:async()=>({allow:true}),
 claim:async()=>({claim_status:'already_sent'}),
 push:async()=>{sends++;return {status:429}},
 ack:async d=>acks.push(d)};
 assert.equal((await x.deliverOnce({...base,quota:async()=>({allow:false})})).status,'HOLD');
 assert.equal((await x.deliverOnce(base)).status,'DEDUP_OR_PENDING');
 assert.equal(sends,0);
 const r=await x.deliverOnce({...base,claim:async()=>({claim_status:'new',retry_key:id})});
 assert.equal(r.status,'UNCERTAIN');
 assert.equal(acks[0].retryKey,id);
 assert.equal(acks[0].status,'uncertain');
});
