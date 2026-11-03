import {metricLines} from './pipeline-metrics.mjs';
/* 3 Kings owner Sync LINE notifier: isolated, OFF by default.
 * Requires approved sender/ledger injection. Never changes a Sync pipeline. */
const hash=/^[a-f0-9]{64}$/i;
const uid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const stages=['source','parser','database','web'];
export function verifyE2E(proof){
 if(!proof || stages.some(s=>{
   const p=proof[s];
   return !p||!p.fileId||!p.revision||!Number.isSafeInteger(p.rows)
     ||p.rows<0||!hash.test(String(p.sha256||''));
 }))return {status:'UNVERIFIED',reason:'MISSING_STAGE'};
 if(proof.web.authenticated!==true)return {status:'UNVERIFIED',reason:'WEB_AUTH_MISSING'};
 const a=proof.source;
 if(stages.some(s=>{
   const b=proof[s];
   return b.fileId!==a.fileId||b.revision!==a.revision||
     b.rows!==a.rows||b.sha256.toLowerCase()!==a.sha256.toLowerCase();
 }))return {status:'FAIL',reason:'STAGES_MISMATCH'};
 return {status:'PASS',reason:'E2E_MATCH'};
}
const validRunKey=x=>uid.test(String(x||'')) || /^[a-z][a-z0-9_]{2,32}:[A-Za-z0-9_.:-]{1,160}$/.test(String(x||''));
export function classifyRun(run,proof){
 if(!run||!validRunKey(run.run_key||run.id)||
   !Number.isFinite(Date.parse(String(run.created_at||'')))||
   !String(run.sync_type||'').trim())return {status:'SKIP',reason:'BAD_LOG_ID'};
 const status=String(run.status||'').toLowerCase();
 if(['error','failed','failure'].includes(status))
   return {status:'FAIL',reason:'EXPLICIT_LOG_ERROR'};
 if(!['success','succeeded'].includes(status))
   return {status:'HOLD',reason:'NOT_FINAL'};
 const proofResult=verifyE2E(proof);
 return {status:proofResult.status,reason:proofResult.reason};
}
const clean=(x,n=100)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);
export function lineMessage(run,result,proof){
 if(!['PASS','FAIL','UNVERIFIED','HOLD'].includes(result?.status))return null;
 const state={PASS:'สำเร็จ (Source→DB→Web ตรงกัน)',
 FAIL:'ล้มเหลว',UNVERIFIED:'รอยืนยันผลบนเว็บ',HOLD:'ยังไม่จบรอบ'}[result.status];
 const stamp=new Date(run.created_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',hour12:false});
 return [
  '3 Kings • Sync Monitoring',
  'สถานะ: '+state,
  'ระบบ: '+clean(run.sync_type,50),
  'ต้นทาง: '+clean(run.source_file,100),
  'เวลา: '+stamp,
  'ผลตรวจ: '+clean(result.reason,60),
  ...metricLines(run,{status:result.status,rows:proof?.web?.rows}),
  'Run ID: '+clean(run.run_key||run.id,65),
  result.status==='UNVERIFIED'?'หมายเหตุ: Log success ไม่ใช่ Web PASS':''
 ].filter(Boolean).join('\n');
}
export async function deliverOnce(opts={}){
 const {enabled=false,run,proof,sha256,quota,claim,push,ack}=opts;
 if(enabled!==true)return {status:'OFF'};
 const result=classifyRun(run,proof);
 if(result.status==='SKIP')return {status:'SKIP'};
 if([sha256,quota,claim,push,ack].some(x=>typeof x!=='function'))
   return {status:'HOLD',reason:'SENDER_NOT_CONFIGURED'};
 const q=await quota();
 if(q?.allow!==true)return {status:'HOLD',reason:'LINE_QUOTA_BLOCK'};
 const runKey=String(run.run_key||run.id);
 const key=await sha256('3kings|sync-owner|'+run.sync_type+'|'+runKey);
 if(!hash.test(String(key||'')))return {status:'HOLD',reason:'BAD_DEDUP_KEY'};
 const message=lineMessage(run,result,proof);
 const c=await claim({key,kind:'sync_owner_run',scope:'owner',pipeline:run.sync_type,runKey,summary:message.slice(0,300)});
 if(c?.claim_status!=='new')return {status:'DEDUP_OR_PENDING'};
 if(!uid.test(String(c.retry_key||'')))return {status:'HOLD',reason:'BAD_RETRY_KEY'};
 let http=null;
 try{http=(await push({message,retryKey:c.retry_key,recipient:'owner'}))?.status??null;}catch{}
 const delivery=http===200?'delivered':'uncertain';
 try{await ack({key,retryKey:c.retry_key,status:delivery,http});}
 catch{return {status:'ACK_UNVERIFIED',http};}
 return {status:delivery==='delivered'?'DELIVERED':'UNCERTAIN',
   runStatus:result.status,http};
}
