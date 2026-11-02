'use strict';
/** Offline state-machine tests for new GAS Express Auto Scheduler. No network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../docs/apps-script/ExpressBridgeAutoScheduler_2026-11-02.gs'),'utf8');
const props=new Map();
const calls=[];
const headers=['request_id','action','source_fingerprint','requested_at','expires_at','requester','status','started_at','finished_at','result_code','master_file_id','notes','worker_version','verification_status','verified_at'];
const rows=[headers];
let owner='p.kraiwit2614@gmail.com';
let currentFP='b'.repeat(64), signature='sigB', live=true, dbReady=true, masterCurrent=true;
const control={queue_state:'STAGING_DISABLED',worker_active:'FALSE',auto_enabled:'FALSE'};
const requests={
 getLastRow:()=>rows.length,
 getRange:(r,c,n=1,m=1)=>({
  getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i][c-1+j]||'')),
  setValue:v=>{rows[r-1][c-1]=v;}
 }),
 appendRow:r=>{rows.push(r);calls.push('enqueued:'+r[1]);}
};
const x={control,requests,owner};
const context=vm.createContext({
 console,
 EXPRESS_QUEUE_20261102:{
  scriptId:'project',owner,masterId:'master',
  actions:['EXPRESS_MASTER_IMPORT','EXPRESS_REGISTRY_SYNC'],headers
 },
 PropertiesService:{getScriptProperties:()=>({
  getProperty:k=>props.has(k)?props.get(k):null,
  setProperty:(k,v)=>props.set(k,v)
 })},
 Utilities:{getUuid:()=> '12345678-1234-4234-8234-123456789abc'},
 SpreadsheetApp:{flush:()=>{}},
 DriveApp:{getFolderById:()=>({getFiles:()=>({
  hasNext:()=>false,next:()=>{throw Error('no real Drive')}
 })})},
 EB_FULL_QA:{sourceFolderId:'fake',allowedSource:/csv$/,sourceMinimum:0,maxSources:50},
 EB_qaHashText_:()=>signature,
 expressQueueEnabled20261102_:()=>live,
 expressQueueOpen20261102_:()=>x,
 expressQueueSourceSignature20261102_:()=>signature,
 expressQueueFingerprint20261102_:()=>currentFP,
 expressQueueDBComplete20261102_:()=>dbReady?{state:'complete',document_count:3,line_count:4}:null,
 EB_masterMakePayload_:()=>({status:masterCurrent?'NO_CHANGE':'DELTA_READY'}),
 processExpressBridgeQueue20261102:()=>{
  calls.push('worker');
  const req=rows.find(r=>r[6]==='REQUESTED');
  if(!req)return {status:'NO_PENDING'};
  req[6]='WAIT_QA';
  req[9]=req[1]==='EXPRESS_MASTER_IMPORT'?'MASTER_REGISTER_WRITE_READBACK_PASS':'DB_REGISTER_READBACK_PASS';
  return {status:'WAIT_QA'};
 }
});
new vm.Script(source,{filename:'ExpressBridgeAutoScheduler_2026-11-02.gs'}).runInContext(context);
const run=f=>vm.runInContext(f,context);
assert.equal(run('expressBridgeAutoTick20261102().status'),'DISABLED_BY_CONTROL');
control.queue_state='LIVE_APPROVED';control.worker_active='TRUE';control.auto_enabled='TRUE';
assert.equal(run('expressBridgeAutoTick20261102().status'),'HOLD_BASELINE_MISSING');
props.set('EXPRESS_AUTO_VERIFIED_DB_FINGERPRINT_20261102','a'.repeat(64));
props.set('EXPRESS_AUTO_LAST_SOURCE_SIGNATURE_20261102','sigA');
assert.equal(run('expressBridgeAutoTick20261102().status'),'ENQUEUED');
assert.equal(rows[1][1],'EXPRESS_MASTER_IMPORT');
assert.equal(rows.length,2);
assert.equal(run('expressBridgeAutoTick20261102().status'),'WAIT_QA');
assert.equal(calls.filter(x=>x==='worker').length,1);
assert.equal(run('expressBridgeAutoTick20261102().status'),'ENQUEUED');
assert.equal(rows[2][1],'EXPRESS_REGISTRY_SYNC');
assert.equal(run('expressBridgeAutoTick20261102().status'),'WAIT_QA');
assert.equal(run('expressBridgeAutoTick20261102().status'),'SOURCE_MASTER_DB_VERIFIED_WEB_PENDING');
assert.equal(props.get('EXPRESS_AUTO_VERIFIED_DB_FINGERPRINT_20261102'),currentFP);
assert.equal(run('expressBridgeAutoTick20261102().status'),'NO_CHANGE');
assert.equal(rows.length,3);
currentFP='c'.repeat(64);signature='sigC';
assert.equal(run('expressBridgeAutoTick20261102().status'),'ENQUEUED');
assert.equal(rows.length,4);
rows[3][6]='RUNNING';
assert.equal(run('expressBridgeAutoTick20261102().status'),'HOLD_QUEUED_ERROR_OR_UNFINISHED');
assert.equal(rows.length,4,'No automatic duplicate when RUNNING is incomplete');
rows[3][6]='ERROR';
assert.equal(run('expressBridgeAutoTick20261102().status'),'HOLD_QUEUED_ERROR_OR_UNFINISHED');
rows[3][6]='WAIT_QA';rows[3][9]='MASTER_REGISTER_WRITE_READBACK_PASS';
dbReady=false;
assert.equal(run('expressBridgeAutoTick20261102().status'),'ENQUEUED');
rows[4][6]='WAIT_QA';rows[4][9]='DB_REGISTER_READBACK_PASS';
assert.equal(run('expressBridgeAutoTick20261102().status'),'HOLD_DB_COMPLETE_READBACK_MISMATCH');
assert.equal(props.get('EXPRESS_AUTO_VERIFIED_DB_FINGERPRINT_20261102'),'b'.repeat(64));
console.log('PASS: staged Express auto tick disabled, source delta, one-phase enqueue, inherited worker, DB readback and no auto retry.');
