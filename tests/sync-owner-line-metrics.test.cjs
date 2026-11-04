'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const imports=async()=>Promise.all([
 import(pathToFileURL(path.resolve(__dirname,'../operations/sync-monitor/pipeline-metrics.mjs')).href),
 import(pathToFileURL(path.resolve(__dirname,'../operations/sync-monitor/owner-alerts.mjs')).href)
]);
const drive=()=>({id:'11111111-1111-4111-8111-111111111111',
 sync_type:'materials',status:'success',source_file:'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx',
 created_at:'2026-11-03T10:19:51Z',rows_read:614,rows_written:15,
 message:'Sync completed'});
const daily=()=>({id:45,created_at:'2026-11-03T10:52:00Z',
 source_file_id:'native-form-id',source_rows_read:569,rows_parsed:17,
 rows_inserted:2,rows_updated:0,rows_skipped:15,rows_verified:17,
 notes:'import validated'});
const express=()=>({id:'22222222-2222-4222-8222-222222222222',
 state:'complete',source_files:17,document_count:3758,line_count:13256,
 review_count:273,canceled_count:68,created_at:'2026-11-02T15:50:00Z',
 completed_at:'2026-11-02T15:53:36Z'});
test('Drive materials: source read and DB written counts are not Web QA',async()=>{
 const [m,o]=await imports();
 const r=m.fromDriveSyncRun(drive()),res=o.classifyRun(r);
 assert.equal(r.metrics.read,614);
 assert.equal(r.metrics.written,15);
 assert.equal(res.status,'UNVERIFIED');
 const msg=m.metricLines(r,{status:res.status}).join('\n');
 assert.match(msg,/อ่านจากต้นทางในรอบนี้: 614 รายการ/);
 assert.match(msg,/เขียน DB ในรอบนี้: 15 รายการ/);
 assert.match(msg,/ยืนยันหน้าเว็บ: ยังไม่มีหลักฐาน E2E ครบ/);
 assert.doesNotMatch(msg,/ตรวจยืนยันความตรงกันบนเว็บ: 15/);
});
test('Daily importer: 17 DB-verified does not mean 17 Web-verified',async()=>{
 const [m,o]=await imports();
 const r=m.fromDailySiteAudit(daily()),res=o.classifyRun(r);
 assert.equal(r.run_key,'daily_site_report:45');
 assert.equal(res.status,'UNVERIFIED');
 const msg=m.metricLines(r,{status:res.status}).join('\n');
 assert.match(msg,/ประมวลผล: 17 แถวรายงาน/);
 assert.match(msg,/เพิ่มใหม่: 2 แถวรายงาน/);
 assert.match(msg,/ข้ามเพราะมีอยู่\/ไม่เปลี่ยน: 15 แถวรายงาน/);
 assert.match(msg,/ตรวจยืนยันในขั้นตอนนำเข้า: 17 แถวรายงาน/);
 assert.match(msg,/ยืนยันหน้าเว็บ: ยังไม่มีหลักฐาน E2E ครบ/);
});
test('Express: documents and lines retain distinct units; DB complete != Web PASS',async()=>{
 const [m,o]=await imports();
 const r=m.fromExpressRegister(express());
 assert.equal(o.classifyRun(r).status,'UNVERIFIED');
 const msg=m.metricLines(r,{status:o.classifyRun(r).status}).join('\n');
 assert.match(msg,/เอกสาร: 3758 เอกสาร/);
 assert.match(msg,/บรรทัดรายการ: 13256 บรรทัด/);
 assert.match(msg,/รายการรอตรวจ: 273 รายการ/);
});
test('Work Order and Hotel must report missing per-run E2E evidence',async()=>{
 const [m]=await imports();
 const coverage=m.pipelineEvidenceCoverage();
 assert.equal(coverage.length,8);
 for(const p of ['work_order','hotel_work_plan']){
   const item=coverage.find(x=>x.pipeline===p);
   assert.equal(item.runId,false);
   assert.equal(item.authenticatedWeb,false);
 }
});
test('zero writes are displayed as zero, not inferred error or full E2E PASS',async()=>{
 const [m,o]=await imports();
 const a=drive();a.sync_type='schedule';a.source_file='Above Villa Plot6 Construction Progress_Updated_2026-09-21.xlsx';a.rows_read=0;a.rows_written=0;
 const r=m.fromDriveSyncRun(a);
 assert.equal(o.classifyRun(r).status,'UNVERIFIED');
 assert.match(m.metricLines(r,{status:o.classifyRun(r).status}).join('\n'),/เขียน DB ในรอบนี้: 0 รายการงาน/);
});
test('verified Web count only appears with explicit four-stage matching E2E proof',async()=>{
 const [m,o]=await imports();
 const r=m.fromDriveSyncRun(drive());
 const stage={fileId:'drive1',revision:'r1',rows:614,sha256:'a'.repeat(64)};
 const proof={source:{...stage},parser:{...stage},database:{...stage},
 web:{...stage,authenticated:true}};
 assert.equal(o.classifyRun(r,proof).status,'PASS');
 assert.match(m.metricLines(r,{status:'PASS',rows:proof.web.rows}).join('\n'),
    /ตรวจยืนยันความตรงกันบนเว็บ: 614 รายการ \(ทั้งชุด\)/);
});
test('explicit Sync error with unknown error row count never assumes one failed row',async()=>{
 const [m,o]=await imports();const x=drive();x.status='error';
 const r=m.fromDriveSyncRun(x);const msg=m.metricLines(r,{status:o.classifyRun(r).status}).join('\n');
 assert.match(msg,/จำนวนรายการผิดพลาด: ไม่ทราบ/);
});
