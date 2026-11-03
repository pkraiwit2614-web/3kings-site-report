'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const obj=import(pathToFileURL(path.resolve(__dirname,'../operations/sync-monitor/log-collector.mjs')).href);
const since='2026-11-02T00:00:00Z',until='2026-11-04T00:00:00Z';
const drive={id:'11111111-1111-4111-8111-111111111111',
 sync_type:'materials',source_file:'Master.xlsx',created_at:'2026-11-03T10:19:51Z',
 status:'success',rows_read:614,rows_written:15};
const daily={id:45,created_at:'2026-11-03T10:52:00Z',source_file_id:'sheet-id',
 source_rows_read:569,rows_parsed:17,rows_inserted:2,rows_updated:0,
 rows_skipped:15,rows_verified:17};
const express={id:'22222222-2222-4222-8222-222222222222',
 created_at:'2026-11-02T15:50:00Z',completed_at:'2026-11-02T15:53:36Z',
 state:'complete',source_files:17,document_count:3758,line_count:13256,
 review_count:273,canceled_count:68};
test('read-only collector collects unique audit event per available pipeline',async()=>{
 const m=await obj;const calls=[];
 const reader=async({table})=>{
   calls.push(table);
   return table==='drive_sync_runs'?[drive,drive]:
     table==='daily_site_report_sync_audit'?[daily]:
     table==='express_register_runs'?[express]:[];
 };
 const r=await m.collectObservedRuns(reader,{since,until});
 assert.equal(r.status,'READ_COMPLETE');
 assert.equal(r.observed.length,3);
 assert.equal(r.cannotVerifyE2E,true);
 assert.deepEqual(r.unsupportedPerRunPipelines,['work_order','hotel_work_plan']);
 assert.equal(r.observed.find(x=>x.sync_type==='express').metrics.documents,3758);
 assert.equal(calls.length,3);
});
test('bad pages, date out of window and pagination cap are visible, not silent',async()=>{
 const m=await obj;
 let r=await m.collectObservedRuns(async()=>[drive],{since,until,pageSize:1,maxPages:1});
 assert.equal(r.status,'PARTIAL');
 assert.ok(r.errors.some(x=>x.reason==='PAGINATION_TRUNCATED'));
 r=await m.collectObservedRuns(async({table})=>
   table==='drive_sync_runs'?[{...drive,created_at:'2026-01-01T00:00:00Z'}]:[],
   {since,until});
 assert.equal(r.status,'PARTIAL');
 assert.ok(r.errors.some(x=>x.reason==='BAD_EVENT_TIME'));
});
test('existing Supabase-only reader cannot write or leave allowlisted tables',async()=>{
 const m=await obj;let captured=null;
 const read=m.makeSupabaseReadPage({
   SUPABASE_URL:'https://test-project.supabase.co',SUPABASE_SERVER_KEY:'sb_secret_placeholder'
 },async(url,options)=>{captured={url,options};return {ok:true,status:200,json:async()=>[drive]}});
 const s=m.STREAMS[0];const got=await read({table:s.table,fields:s.fields,
   since,until,offset:0,limit:50});
 assert.equal(got.length,1);
 assert.equal(captured.options.method,'GET');
 assert.ok(captured.url.includes('created_at=gte.'));
 assert.ok(captured.url.includes('created_at=lte.'));
 assert.equal(captured.options.headers.authorization,undefined);
 assert.ok(!captured.url.includes('sb_secret_placeholder'));
 await assert.rejects(read({table:'users',fields:'*',since,until,offset:0,limit:5}),/ALLOWLISTED/);
});
test('failed DB read never claims complete coverage',async()=>{
 const m=await obj;
 const result=await m.collectObservedRuns(async()=>{throw Error('403')},{since,until});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.errors.length,3);
 assert.equal(result.observed.length,0);
});
