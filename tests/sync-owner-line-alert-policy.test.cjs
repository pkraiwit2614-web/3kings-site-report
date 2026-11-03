'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const load=n=>import(pathToFileURL(path.resolve(__dirname,'../operations/sync-monitor/'+n+'.mjs')).href);
const retryId='11111111-1111-4111-8111-111111111111';
const sample={id:'22222222-2222-4222-8222-222222222222',run_key:retryId,
 sync_type:'materials',source_file:'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx',
 source_system:'drive_sync_runs',status:'success',created_at:'2026-11-03T10:19:51Z',
 metrics:{read:614,written:15},metric_unit:'รายการ'};
const stage={fileId:'master-drive-id',revision:'rev1',rows:614,sha256:'f'.repeat(64)};
const complete={source:{...stage},parser:{...stage},database:{...stage},
 web:{...stage,authenticated:true}};
const pending={scheduleVerified:true,nextRoundDueAt:'2026-11-03T13:19:51Z',
 firstCheckAttemptedAt:'2026-11-03T10:30:00Z'};
const time=t=>new Date(t);
const hash=async s=>createHash('sha256').update(s).digest('hex');
test('Schedule: authoritative source-unchanged skipped never sends, even at future rounds',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 const run={...sample,sync_type:'schedule',source_file:'Above Villa Plot6 Construction Progress_Updated_2026-09-21.xlsx',
 message:'Apps Script check completed; source unchanged, sync skipped',
 metrics:{read:0,written:0}};
 const res=o.classifyRun(run);
 assert.equal(res.status,'NO_CHANGE_UNVERIFIED');
 assert.equal(p.decideOwnerAlert(run,res,{verification:pending,now:time('2026-11-04T12:00:00Z')}).decision,'SILENT');
 let calls=0;
 const result=await o.deliverOnce({enabled:true,run,verification:pending,now:time('2026-11-04T12:00:00Z'),
  quota:async()=>{calls++;return {allow:true}},claim:async()=>{calls++;return {}},push:async()=>{calls++;return {}},ack:async()=>{calls++;}});
 assert.equal(result.status,'SILENT');assert.equal(calls,0);
});
test('Any pipeline: verified no-delta with same source+DB+Web baseline is silent',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 const run={...sample,sync_type:'photos',source_file:'Picture Progress',metrics:{read:2636,written:0}};
 const result=o.classifyRun(run);
 const proof={verified:true,canonicalSource:true,sourceUnchanged:true,databaseUnchanged:true,
 webBaselineValid:true,runKey:retryId};
 assert.equal(p.decideOwnerAlert(run,result,{noChangeProof:proof}).decision,'SILENT');
 assert.equal(p.decideOwnerAlert(run,result,{noChangeProof:{...proof,webBaselineValid:false}}).decision,'WAIT');
});
test('Unverified after first inspection but BEFORE next round is silent and does not claim',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 const run={...sample};
 let called=0;
 const decisions=p.decideOwnerAlert(run,o.classifyRun(run),{
  verification:pending,now:time('2026-11-03T12:00:00Z')});
 assert.equal(decisions.decision,'WAIT');
 const outcome=await o.deliverOnce({enabled:true,run,verification:pending,now:time('2026-11-03T12:00:00Z'),
 quota:async()=>{called++;return {allow:true}}});
 assert.equal(outcome.status,'WAIT');assert.equal(called,0);
});
test('If still unverified at next CONFIRMED due round, notify once on original key',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 const run={...sample};
 const now=time('2026-11-03T13:20:00Z');
 assert.deepEqual(p.decideOwnerAlert(run,o.classifyRun(run),{verification:pending,now}).status,'OVERDUE');
 let delivered=false;const sent=[];
 const opts={enabled:true,run,verification:pending,now,sha256:hash,
 quota:async()=>({allow:true}),
 claim:async()=>delivered?{claim_status:'already_sent'}:{claim_status:'new',retry_key:retryId},
 push:async({message,recipient})=>{sent.push({message,recipient});delivered=true;return {status:200}},
 ack:async()=>{}};
 const first=await o.deliverOnce(opts);const second=await o.deliverOnce(opts);
 assert.equal(first.status,'DELIVERED');
 assert.equal(first.runStatus,'OVERDUE');
 assert.equal(second.status,'DEDUP_OR_PENDING');
 assert.equal(sent.length,1);assert.equal(sent[0].recipient,'owner');
 assert.match(sent[0].message,/เกินรอบ Sync ถัดไป/);
 assert.match(sent[0].message,/Run ID:/);
});
test('No verified schedule or no first inspection must not invent an overdue alert',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 const r=o.classifyRun(sample);
 const now=time('2026-11-05T18:00:00Z');
 assert.equal(p.decideOwnerAlert(sample,r,{now}).decision,'WAIT');
 assert.equal(p.decideOwnerAlert(sample,r,{now,verification:{...pending,scheduleVerified:false}}).decision,'WAIT');
 assert.equal(p.decideOwnerAlert(sample,r,{now,verification:{...pending,firstCheckAttemptedAt:null}}).decision,'WAIT');
});
test('Explicit failed canonical run alerts without waiting for a subsequent round',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 const run={...sample,status:'error'};
 const r=o.classifyRun(run);
 assert.equal(p.decideOwnerAlert(run,r,{now:time('2026-11-03T10:20:00Z')}).decision,'SEND');
 assert.equal(p.decideOwnerAlert(run,r,{now:time('2026-11-03T10:20:00Z')}).status,'FAIL');
});
test('Confirmed no-change cannot erase an explicit Sync failure',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 const run={...sample,status:'error'};
 const noChangeProof={verified:true,canonicalSource:true,sourceUnchanged:true,
 databaseUnchanged:true,webBaselineValid:true,runKey:retryId};
 assert.equal(p.decideOwnerAlert(run,o.classifyRun(run),{noChangeProof}).status,'FAIL');
});
test('Changed, full Source/Parser/DB/authenticated-Web proof: success can send immediately',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 assert.equal(p.decideOwnerAlert(sample,o.classifyRun(sample,complete),{
  now:time('2026-11-03T10:23:00Z')}).status,'PASS');
});
test('Only 0 writes cannot prove a photo sync had no changes',async()=>{
 const [o,p]=await Promise.all([load('owner-alerts'),load('alert-policy')]);
 const run={...sample,sync_type:'photos',source_file:'Picture Progress',metrics:{read:2636,written:0}};
 assert.equal(p.decideOwnerAlert(run,o.classifyRun(run),{
  verification:pending,now:time('2026-11-03T13:20:00Z')}).status,'OVERDUE');
});
