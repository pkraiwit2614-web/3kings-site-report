'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../docs/apps-script/ExpressBridgeQueue_2026-11-02.gs'),'utf8');
const header=['request_id','action','source_fingerprint','requested_at','expires_at','requester','status','started_at','finished_at','result_code','master_file_id','notes','worker_version','verification_status','verified_at'];
const n=Date.now();
const row=['1545851d-8dc5-47b6-8ca5-91f01a5f967d','EXPRESS_MASTER_IMPORT','a'.repeat(64),new Date(n-30000).toISOString(),new Date(n+2700000).toISOString(),'p.kraiwit2614@gmail.com','REQUESTED','','','','1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn','','','',''];
const data=[header,row];
const range=(r,c,n=1,m=1)=>({
 getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[r-1+i][c-1+j]||'')),
 setValue:v=>{data[r-1][c-1]=v},
 setValues:arr=>arr.forEach((values,i)=>values.forEach((v,j)=>{data[r-1+i][c-1+j]=v}))
});
const requests={getLastRow:()=>data.length,getRange:range};
const ctx=vm.createContext({
 console:{error:()=>{}},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'true'})},
 ScriptApp:{getScriptId:()=> '1sKddwvs-DOav0ltdrcxyqPXYinXE3uCgFKmDzGu_XEb4VvMvYVwDUDeT'},
 Session:{getEffectiveUser:()=>({getEmail:()=> 'p.kraiwit2614@gmail.com'})},
 LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 SpreadsheetApp:{flush:()=>{}}
});
new vm.Script(source).runInContext(ctx);
ctx.expressQueueOpen20261102_=()=>({control:{queue_state:'LIVE_APPROVED',worker_active:'TRUE'},requests,owner:'p.kraiwit2614@gmail.com'});
ctx.expressQueueFingerprint20261102_=()=> 'a'.repeat(64);
ctx.expressQueueExecute20261102_=()=> {throw Error('MASTER_REGISTER_MANUAL_EDIT_OR_STATE_MISSING_HOLD');};
const r=vm.runInContext('processExpressBridgeQueue20261102()',ctx);
assert.equal(r.status,'ERROR');
assert.equal(row[6],'ERROR');
assert.equal(r.errorCode,'MASTER_REGISTER_MANUAL_EDIT_OR_STATE_MISSING_HOLD');
assert.equal(row[11],'REVIEW_GAS_EXECUTION_STACK_NO_AUTO_RETRY;CODE=MASTER_REGISTER_MANUAL_EDIT_OR_STATE_MISSING_HOLD');
console.log('PASS: Express queue fail-closed on writer exception; stores error code without stack, no retry');