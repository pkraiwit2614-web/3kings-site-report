'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const mod=import(pathToFileURL(path.resolve(__dirname,'../operations/sync-monitor/observation-adapters.mjs')).href);
test('Hotel: DB ACK is not authenticated Web or actual Apps Script Execution ID',async()=>{
 const m=await mod;const control={verified_file_id:m.HOTEL_MASTER_ID,last_verified_at:'2026-11-03T12:54:48Z'};
 const rooms=Array.from({length:267},()=>({sync_state:'synced'}));
 const days=Array.from({length:9},()=>({sync_state:'synced'}));
 const ack=m.assessHotelWorkPlanAck({control,rooms,days});
 assert.equal(ack.level,'DB_ACK_OBSERVED');
 const full=m.assessHotelWorkPlanAck({control,rooms,days,
 sourceComparison:{fileId:m.HOTEL_MASTER_ID,checkedAt:'2026-11-03T12:55:00Z',roomCount:267,dayCount:9,mismatchCount:0}});
 assert.equal(full.level,'SOURCE_DB_MATCH');
 assert.equal(full.authenticatedWeb,false);
 assert.equal(full.realGasExecutionId,false);
 const bad=m.assessHotelWorkPlanAck({control,rooms:rooms.slice(1),days});
 assert.equal(bad.level,'UNVERIFIED');
});
test('Work Order: staging after source is not full successful job, and HOLD remains',async()=>{
 const m=await mod;
 const a=m.assessWorkOrderStaging({
 source:{fileId:m.WORK_ORDER_MASTER_ID,modifiedAt:'2026-11-03T10:46:56Z',uniqueWorkIds:336},
 staging:[{source_file_id:m.WORK_ORDER_MASTER_ID,staged_at:'2026-11-03T11:02:48Z',stage_decision:'HOLD_MISSING_EVIDENCE'},
          {source_file_id:m.WORK_ORDER_MASTER_ID,staged_at:'2026-11-03T11:02:48Z',stage_decision:'STAGE_REVERIFY_NO_DB_WRITE'}],
 approved:[{promoted_at:'2026-11-03T00:07:35Z',revoked_at:null}]});
 assert.equal(a.level,'STAGING_OBSERVED');
 assert.equal(a.hold,1);
 assert.equal(a.approved,1);
 assert.equal(a.sourceWorkIds,336);
 assert.equal(a.realGasExecutionId,false);
});
test('Observed timestamps do not prove actual trigger firing every slot',async()=>{
 const m=await mod;
 const x=m.observedCadence(['2026-11-03T09:02:00Z','2026-11-03T11:02:00Z'],120);
 assert.equal(x.status,'OBSERVED_MATCH');
 assert.equal(x.actualTriggerVerified,false);
 assert.equal(m.observedCadence(['2026-11-03T09:02:00Z','2026-11-03T12:02:00Z'],120).status,'OBSERVED_GAPS');
 assert.equal(m.observedCadence([],120).status,'INSUFFICIENT');
});
