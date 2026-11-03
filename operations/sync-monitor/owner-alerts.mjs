import {metricLines} from './pipeline-metrics.mjs';
import {evaluateAlertPolicy} from './notification-policy.mjs';
import {decideOwnerAlert} from './alert-policy.mjs';
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
 if(run.sync_type==='schedule' && run.metrics?.read===0 &&
    run.metrics?.written===0 &&
    /source unchanged, sync skipped/i.test(String(run.message||''))){
   const p=verifyE2E(proof);
   return p.status==='PASS'?{status:'NO_CHANGE_VERIFIED',reason:'SOURCE_UNCHANGED_E2E_MATCH'}:
    {status:'NO_CHANGE_UNVERIFIED',reason:'SOURCE_UNCHANGED_WEB_UNVERIFIED'};
 }
 const proofResult=verifyE2E(proof);
 return {status:proofResult.status,reason:proofResult.reason};
}
const clean=(x,n=100)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);
export function lineMessage(run,result,proof,verification){
 if(!['PASS','FAIL','UNVERIFIED','HOLD','NO_CHANGE_UNVERIFIED','NO_CHANGE_VERIFIED','OVERDUE'].includes(result?.status))return null;
 const state={PASS:'สำเร็จ (Source→DB→Web ตรงกัน)',
 FAIL:'ล้มเหลว',UNVERIFIED:'รอยืนยันผลบนเว็บ',HOLD:'ยังไม่จบรอบ',
 NO_CHANGE_UNVERIFIED:'ไม่มีข้อมูลเปลี่ยน (ยังไม่ยืนยันบนเว็บ)',
 NO_CHANGE_VERIFIED:'ไม่มีข้อมูลเปลี่ยน (ตรวจถึงเว็บแล้ว)',
 OVERDUE:'แจ้งเตือนตรวจแก้: เกินรอบ Sync ถัดไปแล้วยังยืนยันผลไม่ได้'}[result.status];
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
  result.status==='OVERDUE' && verification?.nextRoundDueAt?
   'รอบตรวจถัดไปที่เลยกำหนด: '+new Date(verification.nextRoundDueAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',hour12:false}):'',
  result.status==='OVERDUE' && verification?.lastCheckReason?
   'หลักฐานที่ยังขาด: '+clean(verification.lastCheckReason,150):'',
  result.status==='OVERDUE'?'ให้ตรวจแก้: เปิด 3 Kings Web App และตรวจ Source / Sync Log / Supabase / หน้าเว็บ ตาม Run ID นี้':'',
  result.status==='UNVERIFIED'?'หมายเหตุ: Log success ไม่ใช่ Web PASS':''
 ].filter(Boolean).join('\n');
}
export async function deliverOnce(opts={}){
 const {enabled=false,run,proof,sha256,quota,claim,push,ack,
   pending=null,nextScheduledAt=null,now=new Date().toISOString(),
   persistPending,resolvePending}=opts;
 if(enabled!==true)return {status:'OFF'};
 const result=classifyRun(run,proof);
 const policy=evaluateAlertPolicy({run,classification:result,pending,nextScheduledAt,now});
 if(policy.action==='SUPPRESS')return {status:'SUPPRESSED',reason:policy.reason};
 if(policy.action==='HOLD')return {status:'HOLD',reason:policy.reason};
 if(policy.action==='WAIT')return {status:'WAITING_VERIFICATION',
   reason:policy.reason,nextScheduledAt:policy.nextScheduledAt};
 if(policy.action==='START_PENDING'){
   // ACK of durable DB receipt is mandatory before a pending run is accepted.
   if(typeof persistPending!=='function')return {status:'HOLD',reason:'PENDING_STORAGE_NOT_CONFIGURED'};
   let saved;
   try{saved=await persistPending({
     pipeline:run.sync_type,sourceFile:run.source_file,
     originalRunKey:policy.originalRunKey,nextScheduledAt:policy.nextScheduledAt,
     reason:result.reason,firstSeenAt:now,
     metrics:run.metrics||{},createdAt:run.created_at
   })}catch{return {status:'HOLD',reason:'PENDING_STORAGE_FAILED'}}
   if(saved?.stored!==true)return {status:'HOLD',reason:'PENDING_STORAGE_UNVERIFIED'};
   return {status:'WAITING_VERIFICATION',reason:policy.reason,
     nextScheduledAt:policy.nextScheduledAt};
 }
 if(policy.action==='RESOLVE_SILENT'){
   if(typeof resolvePending!=='function')return {status:'HOLD',reason:'PENDING_RESOLVE_NOT_CONFIGURED'};
   try{if((await resolvePending({episodeKey:policy.episodeKey,
       status:'resolved'}))?.resolved!==true)
      return {status:'HOLD',reason:'PENDING_RESOLVE_UNVERIFIED'};}
   catch{return {status:'HOLD',reason:'PENDING_RESOLVE_FAILED'};}
   return {status:'RESOLVED_NO_NOTIFICATION'};
 }
 if(!['SEND_VERIFIED','SEND_FAILURE','ESCALATE'].includes(policy.action))
   return {status:'HOLD',reason:'POLICY_ACTION_UNKNOWN'};
 if([sha256,quota,claim,push,ack].some(x=>typeof x!=='function'))
   return {status:'HOLD',reason:'SENDER_NOT_CONFIGURED'};
 const q=await quota();
 if(q?.allow!==true)return {status:'HOLD',reason:'LINE_QUOTA_BLOCK'};
 // An escalation belongs to the ORIGINAL unresolved episode, never to the
 // subsequent no-change run. This enforces one LINE delivery per incident.
 const original=pending?.originalRun;
 const notifyRun=policy.action==='ESCALATE'?{
   ...(original&&typeof original==='object'?original:{
     ...run,metrics:{},created_at:pending.firstSeenAt||run.created_at}),
   id:policy.originalRunKey,run_key:policy.originalRunKey,
   sync_type:run.sync_type,source_file:run.source_file
 }:run;
 const runKey=String(policy.action==='ESCALATE'?
   policy.originalRunKey:(pending?.originalRunKey||run.run_key||run.id));
 const key=await sha256('3kings|sync-owner|'+run.sync_type+'|'+runKey);
 if(!hash.test(String(key||'')))return {status:'HOLD',reason:'BAD_DEDUP_KEY'};
 const message=policy.action==='ESCALATE'?
   [lineMessage(notifyRun,{status:'UNVERIFIED',reason:policy.reason}),
     'ตรวจปลายทางไม่เสร็จภายในรอบ Sync ถัดไป',
     'เริ่มค้าง: '+clean(policy.firstSeenAt,40),
     'กำหนดตรวจรอบถัดไป: '+clean(policy.nextScheduledAt,40),
     'โปรดเข้า Web App โมดูล '+clean(run.sync_type,45)+' เพื่อตรวจสอบและแก้ไข',
     'ไม่ใช่ผลยืนยันว่า Sync ล้มเหลว'].join('\n'):
   lineMessage(run,result,proof);
 if(!message)return {status:'HOLD',reason:'NO_VALID_LINE_MESSAGE'};
 const c=await claim({key,kind:'sync_owner_run',scope:'owner',
   pipeline:run.sync_type,runKey,summary:message.slice(0,300)});
 if(c?.claim_status!=='new')return {status:'DEDUP_OR_PENDING'};
 if(!uid.test(String(c.retry_key||'')))return {status:'HOLD',reason:'BAD_RETRY_KEY'};
 let http=null;
 try{http=(await push({message,retryKey:c.retry_key,recipient:'owner'}))?.status??null;}catch{}
 const delivery=http===200?'delivered':'uncertain';
 try{await ack({key,retryKey:c.retry_key,status:delivery,http});}
 catch{return {status:'ACK_UNVERIFIED',http};}
 // Episode completion is a separate readback; no retry of an uncertain LINE
 // push until the original retry key's delivery status is reconciled.
 if(delivery==='delivered'&&pending&&typeof resolvePending==='function'){
   try{await resolvePending({episodeKey:policy.episodeKey||pending.episodeKey,
     status:policy.action==='ESCALATE'?'alerted':'resolved'});}
   catch{return {status:'ACKED_PENDING_CLOSE_UNVERIFIED',http};}
 }
 return {status:delivery==='delivered'?'DELIVERED':'UNCERTAIN',
   runStatus:policy.action==='ESCALATE'?'OVERDUE_UNVERIFIED':result.status,http};
}
