'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const load=s=>import(pathToFileURL(path.resolve(__dirname,'../operations/sync-monitor/'+s+'.mjs')).href);
const schedule='Above Villa Plot6 Construction Progress_Updated_2026-09-21.xlsx';
const base={id:'11111111-1111-4111-8111-111111111111',sync_type:'schedule',
  source_file:schedule,status:'success',created_at:'2026-11-03T11:19:19Z',
  rows_read:0,rows_written:0,message:'Apps Script check completed; source unchanged, sync skipped'};
test('non-master schedule test.xlsx cannot be announced as canonical success or failure',async()=>{
 const [m,o]=await Promise.all([load('pipeline-metrics'),load('log-collector')]);
 for(const status of ['success','error']){
  assert.throws(()=>m.fromDriveSyncRun({...base,status,source_file:'test.xlsx'}),/NON_CANONICAL_SOURCE/);
 }
 const result=await o.collectObservedRuns(async({table})=>
  table==='drive_sync_runs'?[{...base,source_file:'test.xlsx'}]:[],
  {since:'2026-11-03T00:00:00Z',until:'2026-11-04T00:00:00Z'});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.observed.length,0);
 assert.ok(result.errors.some(x=>x.reason==='MALFORMED_ROW'));
});
test('schedule 0/0 unchanged is explicitly no-change, not end-to-end success',async()=>{
 const [m,o]=await Promise.all([load('pipeline-metrics'),load('owner-alerts')]);
 const run=m.fromDriveSyncRun(base);
 const status=o.classifyRun(run);
 assert.equal(status.status,'NO_CHANGE_UNVERIFIED');
 assert.match(o.lineMessage(run,status),/ไม่มีข้อมูลเปลี่ยน \(ยังไม่ยืนยันบนเว็บ\)/);
 assert.match(o.lineMessage(run,status),/ยืนยันหน้าเว็บ: ยังไม่มีหลักฐาน E2E ครบ/);
});
test('Daily parsed/import discrepancy is explicit failure, not successful import',async()=>{
 const [m,o]=await Promise.all([load('pipeline-metrics'),load('owner-alerts')]);
 const d=m.fromDailySiteAudit({id:47,created_at:'2026-11-03T12:00:00Z',source_file_id:'original-sheet',
 source_rows_read:570,rows_parsed:18,rows_inserted:1,rows_updated:0,rows_skipped:16,rows_verified:17,notes:'partial'});
 assert.equal(d.status,'error');
 assert.equal(o.classifyRun(d).status,'FAIL');
});
test('photos zero upserts are not mislabelled as skipped schedule',async()=>{
 const [m,o]=await Promise.all([load('pipeline-metrics'),load('owner-alerts')]);
 const r=m.fromDriveSyncRun({...base,sync_type:'photos',source_file:'Picture Progress',rows_read:2636,
 rows_written:0,message:'Apps Script photo sync completed'});
 assert.equal(o.classifyRun(r).status,'UNVERIFIED');
});
