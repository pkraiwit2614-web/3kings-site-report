'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const vm=require('node:vm');
const src=fs.readFileSync(require('node:path').resolve(__dirname,'../docs/apps-script/ExpressBridgeAutoScheduler_2026-11-02.gs'),'utf8');
const HEAD=['request_id','action','source_fingerprint','requested_at','expires_at','requester','status','started_at','finished_at','result_code','master_file_id','notes','worker_version','verification_status','verified_at'];
const oldFiles=[{id:'F1',name:'PO-old.csv',hash:'hash1'},{id:'F2',name:'PR-old.csv',hash:'hash2'}];
let files=[...oldFiles,{id:'F3',name:'PR-new.csv',hash:'hash3'}];
const fp=x=>crypto.createHash('sha256').update(x.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(z=>z.id+'|'+z.name+'|'+z.hash).join('\n')).digest('hex');
let signature='sig21';
const props=new Map([['EXPRESS_AUTO_VERIFIED_DB_FINGERPRINT_20261102','a'.repeat(64)],['EXPRESS_AUTO_LAST_SOURCE_SIGNATURE_20261102','sig19']]);
const rows=[HEAD];
const control={queue_state:'LIVE_APPROVED',worker_active:'TRUE',auto_enabled:'TRUE'};
const requests={
 getLastRow:()=>rows.length,
 getRange:(r,c,n=1,m=1)=>({
   getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i][c-1+j]||'')),
   setValue:v=>{rows[r-1][c-1]=v;},
   setValues:vs=>vs.forEach((arr,i)=>arr.forEach((v,j)=>{rows[r-1+i][c-1+j]=v;}))
 }),
 appendRow:r=>rows.push(r)
};
const x={control,requests};
const ctx=vm.createContext({
 console,
 EXPRESS_QUEUE_20261102:{actions:['EXPRESS_MASTER_IMPORT','EXPRESS_REGISTRY_SYNC'],headers:HEAD,owner:'owner@example.com',masterId:'MASTER'},
 SpreadsheetApp:{flush(){}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
 Utilities:{getUuid:()=> '1545851d-8dc5-47b6-8ca5-91f01a5f967d'},
 EB_qaReadFolder_:()=>files,
 EB_dbFingerprint_:fp,
 EB_qaVerifyFolderUnchanged_:()=>{},
 expressQueueEnabled20261102_:()=>true,
 expressQueueOpen20261102_:()=>x,
 expressQueueSourceSignature20261102_:()=>signature,
 expressQueueFingerprint20261102_:()=>fp(files),
 expressQueueDBComplete20261102_:()=>null,
 EB_masterMakePayload_:()=>({status:'NO_CHANGE'}),
 processExpressBridgeQueue20261102:()=>({status:'WORKER_MOCK_NOT_STARTED'})
});
new vm.Script(src).runInContext(ctx);
ctx.expressQueueSourceSignature20261102_=()=>signature;
ctx.expressQueueDBComplete20261102_=()=>null;
ctx.x=x;ctx.rows=rows;
const run=s=>vm.runInContext(s,ctx);
assert.equal(run('expressBridgeAutoTick20261102().status'),'WAIT_SOURCE_STABLE');
assert.equal(rows.length,1);
assert.equal(run('expressBridgeAutoTick20261102().status'),'ENQUEUED');
assert.equal(rows.length,2);
assert.equal(rows[1][2],fp(files));
rows.pop();
const review=[
 '6545851d-8dc5-47b6-8ca5-91f01a5f967d','EXPRESS_MASTER_IMPORT',fp(oldFiles),
 '2026-11-04T11:25:22.390Z','2026-11-04T12:10:22.390Z','owner@example.com',
 'REVIEW','','','','MASTER','SOURCE_FINGERPRINT_CHANGED','','',''
];
const originalReview=[...review];
rows.push(review);
assert.equal(run('expressQueueSupersedeUnstartedGrowth20261104_(x, [rows[1]])'),'SUPERSEDED_SAFE_SOURCE_GROWTH');
assert.equal(rows[1][6],'SUPERSEDED');
assert.equal(rows[1][13],'SUPERSEDED_BEFORE_EXECUTION_NOT_IMPORT_PASS');
rows[1]=[...originalReview];rows[1][7]='execution_started';
assert.equal(run('expressQueueSupersedeUnstartedGrowth20261104_(x, [rows[1]])'),'HOLD_REVIEW_NOT_AUTORECOVERABLE');
assert.equal(rows[1][6],'REVIEW');
rows[1]=[...originalReview];rows[1][2]='f'.repeat(64);
assert.equal(run('expressQueueSupersedeUnstartedGrowth20261104_(x, [rows[1]])'),'HOLD_NONMONOTONIC_SOURCE_CHANGE');
assert.equal(rows[1][6],'REVIEW');
console.log('PASS Express scheduler isolated regression: stable-tick gate, monotonic new CSV supersession, interrupted-row and nonmonotonic HOLD');