/**
 * Source-backed observer adapters for Work Order and Hotel Work Plan.
 * Strictly interpret database evidence; do NOT invent Apps Script Execution IDs.
 * No source/trigger/DB/UI writes. Bound to existing records.
 */
const validStamp=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const int=x=>Number.isSafeInteger(x)&&x>=0;
export const HOTEL_MASTER_ID='1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS';
export const WORK_ORDER_MASTER_ID='18P3OFYtOLsslCtDujlSQVf9IQSuplKcx';

export function assessHotelWorkPlanAck({control,rooms,days,sourceComparison}={}){
 if(!control || !validStamp(control.last_verified_at)||
    control.verified_file_id!==HOTEL_MASTER_ID)
  return {level:'UNVERIFIED',reason:'HOTEL_SYNC_ACK_ABSENT_OR_WRONG_FILE'};
 if(!Array.isArray(rooms)||rooms.length!==267||
    !Array.isArray(days)||days.length!==9)
  return {level:'UNVERIFIED',reason:'HOTEL_ROWS_MISSING'};
 if(rooms.some(x=>x.sync_state!=='synced')||
    days.some(x=>x.sync_state!=='synced'))
  return {level:'FAIL',reason:'HOTEL_DB_NOT_ALL_SYNCED'};
 // Source comparison is performed by an independent connector readback
 // and needs exact same source revision and proven comparison time.
 if(sourceComparison?.fileId!==HOTEL_MASTER_ID ||
    !validStamp(sourceComparison?.checkedAt)||
    sourceComparison?.roomCount!==267||
    sourceComparison?.dayCount!==9||
    sourceComparison?.mismatchCount!==0||
    Date.parse(sourceComparison.checkedAt)<Date.parse(control.last_verified_at))
  return {level:'DB_ACK_OBSERVED',reason:'COMPLETE_DB_ACK_SOURCE_COMPARISON_NOT_CURRENT',
    observedAt:control.last_verified_at,observedRows:276};
 return {level:'SOURCE_DB_MATCH',reason:'SOURCE_AND_DB_ROWS_MATCHED',
   observedAt:control.last_verified_at,observedRows:276,
   authenticatedWeb:false,realGasExecutionId:false};
}
export function assessWorkOrderStaging({source,staging,approved,web}={}){
 if(!source||source.fileId!==WORK_ORDER_MASTER_ID||
    !validStamp(source.modifiedAt)||!int(source.uniqueWorkIds)||
    !Array.isArray(staging)||!Array.isArray(approved))
  return {level:'UNVERIFIED',reason:'WORK_ORDER_MASTER_OR_STAGE_MISSING'};
 const rows=staging.filter(x=>x.source_file_id===WORK_ORDER_MASTER_ID);
 const latest=rows.map(x=>x.staged_at).filter(validStamp)
   .sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
 if(!latest)return {level:'UNVERIFIED',reason:'WORK_ORDER_STAGE_TIME_UNKNOWN'};
 const reason=Date.parse(latest)<Date.parse(source.modifiedAt)?
   'WORK_ORDER_STAGE_OLDER_THAN_MASTER':'WORK_ORDER_STAGE_OBSERVED_NOT_EXECUTION';
 const hold=rows.filter(x=>x.stage_decision==='HOLD_MISSING_EVIDENCE').length;
 const promoted=approved.filter(x=>x.promoted_at && !x.revoked_at).length;
 return {level:reason==='WORK_ORDER_STAGE_OLDER_THAN_MASTER'?'STALE':'STAGING_OBSERVED',
   reason,observedAt:latest,sourceWorkIds:source.uniqueWorkIds,
   stagedRows:rows.length,hold,approved:promoted,
   authenticatedWeb:!!web?.authenticated&&web?.verified===true,
   realGasExecutionId:false};
}
/** A cadence can be OBSERVED from log stamps, not certified as actual GAS trigger. */
export function observedCadence(times,expectedMinutes,toleranceMinutes=5){
 if(!Array.isArray(times)||times.length<2||!int(expectedMinutes)||expectedMinutes<1||
   !int(toleranceMinutes))
  return {status:'INSUFFICIENT',intervals:[]};
 const sorted=[...new Set(times.filter(validStamp))].sort((a,b)=>Date.parse(a)-Date.parse(b));
 if(sorted.length<2)return {status:'INSUFFICIENT',intervals:[]};
 const intervals=sorted.slice(1).map((x,i)=>Math.round(
   (Date.parse(x)-Date.parse(sorted[i]))/60000));
 return {status:intervals.every(x=>Math.abs(x-expectedMinutes)<=toleranceMinutes)?
   'OBSERVED_MATCH':'OBSERVED_GAPS',
   intervals,actualTriggerVerified:false};
}
