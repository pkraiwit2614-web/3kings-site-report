/**
 * 3 Kings Owner Sync Monitoring — evidence-first notification policy.
 * Pure evaluator, no clock/network/DB/UI side effects. An external durable
 * adapter MUST persist pending episodes and pass genuine next scheduled slots.
 * No-change suppression does not clear an older unresolved changed episode.
 */
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
const canonical=x=>typeof x==='string'&&x.length>0&&x.length<256;
const success=x=>['success','succeeded'].includes(String(x||'').toLowerCase());
export function genuineNoChange(run){
 if(!run||!success(run.status))return false;
 const m=run.metrics||{};
 // Explicit unchanged gate used by existing four-plot schedule importer.
 if(run.sync_type==='schedule' && m.read===0 && m.written===0 &&
   /source unchanged, sync skipped/i.test(run.message||''))return true;
 // For other collectors, require both unchanged source identity and
 // matching already-committed version. Zero writes by itself is NOT proof.
 const e=run.no_change_evidence;
 return e?.source_unchanged===true && e.pending_changes===0 &&
   e.unchanged_snapshot_verified===true &&
   canonical(e.source_revision) && e.source_revision===e.committed_revision &&
   (m.written===0 || (nonnegative(m.inserted)&&m.inserted===0 &&
     nonnegative(m.updated)&&m.updated===0));
}
export function evaluateAlertPolicy({
 run,classification,pending=null,nextScheduledAt=null,now,graceMinutes=10
}={}){
 if(!run||!classification||!stamp(now)||!nonnegative(graceMinutes)||
   graceMinutes>60)
   return {action:'HOLD',reason:'POLICY_INPUT_INVALID'};
 const state=classification.status;
 const unchanged=genuineNoChange(run);
 // If a previous changed run is still unresolved, it takes precedence
 // over a new unchanged run; do not quietly discard the old incident.
 if(pending && pending.resolved!==true){
   if(pending.alerted===true)return {action:'SUPPRESS',reason:'PENDING_ALREADY_ALERTED'};
   if(!canonical(pending.episodeKey)||!canonical(pending.originalRunKey)||
       !stamp(pending.nextScheduledAt)||pending.sourceFile!==run.source_file||
       pending.pipeline!==run.sync_type)
     return {action:'HOLD',reason:'PENDING_STATE_INVALID'};
   if(state==='PASS'){
     return {action:unchanged?'RESOLVE_SILENT':'SEND_VERIFIED',
       reason:unchanged?'PENDING_RESOLVED_NO_CHANGE':'PENDING_RESOLVED_VERIFIED',
       episodeKey:pending.episodeKey};
   }
   // A verified no-change new cycle cannot prove the preceding modified run
   // unless the original pending source/version was reconciled independently.
   if(state==='FAIL'&&!unchanged)return {action:'SEND_FAILURE',
     reason:'EXPLICIT_FAILURE_AFTER_PENDING',episodeKey:pending.episodeKey};
   const deadline=Date.parse(pending.nextScheduledAt)+graceMinutes*60000;
   if(Date.parse(now)>=deadline)return {action:'ESCALATE',
     reason:'PENDING_UNVERIFIED_AT_NEXT_SCHEDULED_RUN',
     episodeKey:pending.episodeKey,originalRunKey:pending.originalRunKey,
     firstSeenAt:pending.firstSeenAt,nextScheduledAt:pending.nextScheduledAt};
   return {action:'WAIT',reason:'PREVIOUS_CHANGE_STILL_UNVERIFIED',
     episodeKey:pending.episodeKey,nextScheduledAt:pending.nextScheduledAt};
 }
 if(unchanged)return {action:'SUPPRESS',reason:'GENUINE_NO_CHANGE'};
 if(state==='SKIP')return {action:'SUPPRESS',reason:'INVALID_AUDIT_EVENT'};
 if(state==='PASS')return {action:'SEND_VERIFIED',reason:'SOURCE_DB_AUTH_WEB_MATCH'};
 if(state==='FAIL')return {action:'SEND_FAILURE',reason:classification.reason||'SYNC_FAILURE'};
 if(!['UNVERIFIED','HOLD','NO_CHANGE_UNVERIFIED','NO_CHANGE_VERIFIED'].includes(state))
   return {action:'HOLD',reason:'UNSUPPORTED_CLASSIFICATION'};
 if(!stamp(nextScheduledAt)||Date.parse(nextScheduledAt)<=Date.parse(now))
   return {action:'HOLD',reason:'NEXT_SCHEDULE_UNVERIFIED'};
 return {action:'START_PENDING',reason:'AWAIT_END_TO_END_EVIDENCE',
   nextScheduledAt,originalRunKey:run.run_key||run.id};
}
