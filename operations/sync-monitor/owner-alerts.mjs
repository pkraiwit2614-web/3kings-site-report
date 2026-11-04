import {metricLines} from './pipeline-metrics.mjs';
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
const labels={photos:'Photos',photo:'Photos',defects:'Defects',defect:'Defects',materials:'Materials',procurement:'Procurement',schedule:'Villa Schedule',daily_site_report:'Daily Site Report',express:'Express',work_order:'Work Order',hotel_work_plan:'Hotel Work Plan'};
const thaiTime=x=>new Date(x).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export function lineMessage(run,result,proof,verification){
 if(!['PASS','FAIL','UNVERIFIED','HOLD','NO_CHANGE_UNVERIFIED','NO_CHANGE_VERIFIED','OVERDUE'].includes(result?.status))return null;
 const pipeline=clean(labels[run.sync_type]||run.sync_type,50);
 const status={PASS:'ตรวจข้อมูลถึงหน้าเว็บแล้ว',FAIL:'พบข้อผิดพลาดในการ Sync',UNVERIFIED:'ยังตรวจผลหน้าเว็บไม่ครบ',HOLD:'รอบ Sync ยังไม่เสร็จ',NO_CHANGE_UNVERIFIED:'ไม่มีข้อมูลเปลี่ยน',NO_CHANGE_VERIFIED:'ไม่มีข้อมูลเปลี่ยน',OVERDUE:'ถึงรอบ Sync ถัดไปแล้ว ยังตรวจผลหน้าเว็บไม่ครบ'}[result.status];
 const issue=result.status==='OVERDUE'&&verification?.lastCheckReason?
   'ยังขาด: '+clean(verification.lastCheckReason,100):
   result.status==='FAIL'?'ปัญหา: '+clean(result.reason,100):
   result.status==='PASS'?'ผลตรวจ: Source, DB และเว็บตรงกัน':
   'ปัญหา: ยังไม่ยืนยันข้อมูลบนเว็บหลังล็อกอิน';
 const action='สิ่งที่ต้องดำเนินการต่อ: ตรวจสอบและแก้ไข Sync ของ '+pipeline+
   ' ให้ข้อมูลตรงกับ Master และหน้าเว็บ พร้อมยืนยันผลจริงตาม SOP โดยห้ามกระทบระบบอื่น';
 return [
  '3 Kings | Sync Alert',
  pipeline+' — '+status,
  'รอบ Sync: '+thaiTime(run.created_at)+' น.',
  issue,
  action,
  result.status==='OVERDUE'||result.status==='UNVERIFIED'?'หมายเหตุ: ยังไม่ยืนยันว่า Sync ล้มเหลว':''
 ].filter(Boolean).join('\n');
}
export async function deliverOnce(opts={}){
 const {enabled=false,run,proof,sha256,quota,claim,push,ack,
  noChangeProof,verification,now=new Date()}=opts;
 if(enabled!==true)return {status:'OFF'};
 const result=classifyRun(run,proof);
 const policy=decideOwnerAlert(run,result,{noChangeProof,verification,now});
 if(policy.decision!=='SEND')return {status:policy.decision,reason:policy.reason};
 if([sha256,quota,claim,push,ack].some(x=>typeof x!=='function'))
   return {status:'HOLD',reason:'SENDER_NOT_CONFIGURED'};
 const q=await quota();
 if(q?.allow!==true)return {status:'HOLD',reason:'LINE_QUOTA_BLOCK'};
 // For overdue cases, key the alert to the ORIGINAL unresolved changed
 // run, not a later no-change check. This prevents repeated incident DMs.
 const runKey=String(policy.status==='OVERDUE' && verification?.originalRunKey?
   verification.originalRunKey:(run.run_key||run.id));
 const key=await sha256('3kings|sync-owner|'+run.sync_type+'|'+runKey);
 if(!hash.test(String(key||'')))return {status:'HOLD',reason:'BAD_DEDUP_KEY'};
 const alertRun=policy.status==='OVERDUE' && verification?.originalRun &&
   typeof verification.originalRun==='object'?
   {...verification.originalRun,run_key:runKey,sync_type:run.sync_type,
    source_file:run.source_file}:
   (policy.status==='OVERDUE' && runKey!==String(run.run_key||run.id)?
     {...run,run_key:runKey,metrics:{},
       created_at:verification?.firstDetectedAt||run.created_at}:run);
 const message=lineMessage(alertRun,policy.status==='OVERDUE'?
   {status:'OVERDUE',reason:policy.reason}:result,proof,verification);
 if(typeof message!=='string'||!message)return {status:'BLOCK',reason:'EMPTY_MESSAGE'};
 const c=await claim({key,kind:'sync_owner_run',scope:'owner',pipeline:run.sync_type,runKey,summary:message.slice(0,300)});
 if(c?.claim_status!=='new')return {status:'DEDUP_OR_PENDING'};
 if(!uid.test(String(c.retry_key||'')))return {status:'HOLD',reason:'BAD_RETRY_KEY'};
 let http=null;
 try{http=(await push({message,retryKey:c.retry_key,recipient:'owner'}))?.status??null;}catch{}
 const delivery=http===200?'delivered':'uncertain';
 try{await ack({key,retryKey:c.retry_key,status:delivery,http});}
 catch{return {status:'ACK_UNVERIFIED',http};}
 return {status:delivery==='delivered'?'DELIVERED':'UNCERTAIN',
   runStatus:policy.status,http};
}
