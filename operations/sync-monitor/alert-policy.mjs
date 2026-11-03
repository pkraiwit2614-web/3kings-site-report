import {isCanonicalSyncSource} from './source-catalog.mjs';
/**
 * 3 Kings owner LINE policy: quiet no-change, deferred E2E verification.
 *
 * No network, state mutation, scheduler installation or LINE sends.
 * The caller supplies existing scheduled-run proof and a trusted next-round
 * deadline. A guessed cadence is NOT an alert deadline.
 */
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const normalized=v=>String(v||'').toLowerCase();

/** Only an explicit, scoped source-check response can justify a silent skip. */
export function isVerifiedNoChange(run,result,noChangeProof){
 if(result?.status==='FAIL')return false;
 if(run?.source_system==='drive_sync_runs' &&
   run.sync_type==='schedule' &&
   isCanonicalSyncSource(run.sync_type,run.source_file) &&
   run.status==='success' &&
   run.metrics?.read===0 && run.metrics?.written===0 &&
   /^Apps Script check completed; source unchanged, sync skipped$/i.test(
     String(run.message||'').trim()))
   return true;
 // For other pipelines do not infer no-change from 0 DB writes alone.
 return noChangeProof?.verified===true &&
   noChangeProof?.canonicalSource===true &&
   noChangeProof?.sourceUnchanged===true &&
   noChangeProof?.databaseUnchanged===true &&
   noChangeProof?.webBaselineValid===true &&
   noChangeProof?.runKey===String(run?.run_key||run?.id||'');
}
export function decideOwnerAlert(run,result,{
 noChangeProof,verification,now=new Date()
}={}){
 if(!run||!result||!stamp(run.created_at) ||
   !Number.isFinite(new Date(now).getTime()))
   return {decision:'BLOCK',reason:'INVALID_RUN_OR_CLOCK'};
 if(result.status==='SKIP')return {decision:'SILENT',reason:'INVALID_EVENT'};
 if(['dry-run','dry_run','test'].includes(normalized(run.status)))
   return {decision:'SILENT',reason:'NON_PRODUCTION_RUN'};
 if(result.status==='FAIL')
   return {decision:'SEND',status:'FAIL',reason:result.reason||'EXPLICIT_FAILURE'};
 // A later unchanged check cannot silently close an older changed run
 // that is still missing authenticated Source-to-Web proof.
 const olderRunUnresolved=verification?.pendingUnresolved===true &&
   verification?.pendingReconciled!==true;
 if(!olderRunUnresolved && isVerifiedNoChange(run,result,noChangeProof))
   return {decision:'SILENT',reason:'NO_SOURCE_DELTA'};
 if(result.status==='PASS' && !olderRunUnresolved)
   return {decision:'SEND',status:'PASS',reason:'CHANGED_AND_VERIFIED'};
 // A bare status of NO_CHANGE_UNVERIFIED is not enough to suppress unless
 // an explicit scoped source check or all four no-change proofs exist.
 if(!['UNVERIFIED','HOLD','NO_CHANGE_UNVERIFIED','NO_CHANGE_VERIFIED']
   .includes(result.status))
   return {decision:'BLOCK',reason:'UNEXPECTED_RUN_STATUS'};
 const deadline=verification?.nextRoundDueAt;
 const checked=verification?.firstCheckAttemptedAt;
 if(verification?.scheduleVerified!==true || !stamp(deadline) ||
   !stamp(checked) || Date.parse(checked)<Date.parse(run.created_at) ||
   Date.parse(deadline)<=Date.parse(run.created_at))
   return {decision:'WAIT',reason:'NO_VERIFIED_NEXT_ROUND_OR_FIRST_CHECK'};
 if(new Date(now).getTime()<Date.parse(deadline))
   return {decision:'WAIT',reason:'RECHECK_BEFORE_NEXT_ROUND'};
 // Warn once against the ORIGINAL run key, not separately for every retry
 // or every scheduled observer wakeup. Only a verified PASS clears this.
 return {decision:'SEND',status:'OVERDUE',
   reason:'VERIFICATION_UNRESOLVED_AT_NEXT_ROUND',
   nextRoundDueAt:deadline};
}
