'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const m=import(pathToFileURL(path.resolve(__dirname,'../operations/sync-monitor/notification-policy.mjs')).href);
const now='2026-11-03T10:55:00Z',next='2026-11-03T12:00:00Z';
const work=()=>({id:'11111111-1111-4111-8111-111111111111',sync_type:'work_order',source_file:'Defect_Work_Order_Updated_2026-10-15.xlsx',created_at:now,status:'success',metrics:{read:336,written:1}});
const state=()=>({episodeKey:'work_order:episode1',originalRunKey:'work_order:run1',
 nextScheduledAt:next,firstSeenAt:now,pipeline:'work_order',
 sourceFile:'Defect_Work_Order_Updated_2026-10-15.xlsx',
 alerted:false,resolved:false});
const cls=status=>({status,reason:'MISSING_AUTH_WEB'});
test('unchanged schedule does not create a LINE notification even with missing Web E2E',async()=>{
 const x=await m;
 const run={...work(),sync_type:'schedule',source_file:'Above Villa Plot6 Construction Progress_Updated_2026-09-21.xlsx',
 metrics:{read:0,written:0},message:'Apps Script check completed; source unchanged, sync skipped'};
 assert.equal(x.genuineNoChange(run),true);
 assert.equal(x.evaluateAlertPolicy({run,classification:cls('NO_CHANGE_UNVERIFIED'),now,nextScheduledAt:next}).action,'SUPPRESS');
});
test('0 writes alone is not a reason to silence a hidden failure',async()=>{
 const x=await m;const run={...work(),metrics:{read:336,written:0}};
 assert.equal(x.genuineNoChange(run),false);
 assert.equal(x.evaluateAlertPolicy({run,classification:cls('UNVERIFIED'),now,nextScheduledAt:next}).action,'START_PENDING');
});
test('verified source and committed revision unchanged suppress non-Schedule pipelines',async()=>{
 const x=await m;
 const r={...work(),metrics:{read:336,written:0},no_change_evidence:{
 source_unchanged:true,source_revision:'rev1',committed_revision:'rev1',
 pending_changes:0,unchanged_snapshot_verified:true}};
 assert.equal(x.genuineNoChange(r),true);
 assert.equal(x.evaluateAlertPolicy({run:r,classification:cls('UNVERIFIED'),now,nextScheduledAt:next}).action,'SUPPRESS');
 assert.equal(x.genuineNoChange({...r,no_change_evidence:{...r.no_change_evidence,committed_revision:'rev0'}}),false);
});
test('pending first run waits, but escalation occurs after the actual next slot and grace',async()=>{
 const x=await m,run=work(),pending=state();
 const before=x.evaluateAlertPolicy({run,classification:cls('UNVERIFIED'),pending,now:'2026-11-03T12:09:59Z'});
 const after=x.evaluateAlertPolicy({run,classification:cls('UNVERIFIED'),pending,now:'2026-11-03T12:10:00Z'});
 assert.equal(before.action,'WAIT');assert.equal(after.action,'ESCALATE');
 assert.equal(after.originalRunKey,'work_order:run1');
});
test('the next unchanged run must NOT erase older unresolved changed source',async()=>{
 const x=await m,run={...work(),metrics:{read:0,written:0},no_change_evidence:{
 source_unchanged:true,source_revision:'rev2',committed_revision:'rev2',
 pending_changes:0,unchanged_snapshot_verified:true}};
 const a=x.evaluateAlertPolicy({run,classification:cls('NO_CHANGE_UNVERIFIED'),
 pending:state(),now:'2026-11-03T12:12:00Z'});
 assert.equal(a.action,'ESCALATE');
});
test('after first escalation sent, do not send again until incident resolved',async()=>{
 const x=await m;
 const p={...state(),alerted:true};
 const out=x.evaluateAlertPolicy({run:work(),classification:cls('UNVERIFIED'),pending:p,now:'2026-11-03T14:45:00Z'});
 assert.equal(out.action,'SUPPRESS');
 assert.equal(out.reason,'PENDING_ALREADY_ALERTED');
});
test('failure alerts immediately, verified success alerts immediately, invalid next slot blocks pending',async()=>{
 const x=await m;
 assert.equal(x.evaluateAlertPolicy({run:work(),classification:cls('FAIL'),now}).action,'SEND_FAILURE');
 assert.equal(x.evaluateAlertPolicy({run:work(),classification:cls('PASS'),now}).action,'SEND_VERIFIED');
 assert.equal(x.evaluateAlertPolicy({run:work(),classification:cls('UNVERIFIED'),now}).reason,'NEXT_SCHEDULE_UNVERIFIED');
});
test('old pending can close silently after actual reconciliation and no changed data',async()=>{
 const x=await m;
 const r={...work(),metrics:{read:0,written:0},no_change_evidence:{
 source_unchanged:true,source_revision:'rev2',committed_revision:'rev2',
 pending_changes:0,unchanged_snapshot_verified:true}};
 assert.equal(x.evaluateAlertPolicy({run:r,classification:cls('PASS'),pending:state(),now}).action,'RESOLVE_SILENT');
});
