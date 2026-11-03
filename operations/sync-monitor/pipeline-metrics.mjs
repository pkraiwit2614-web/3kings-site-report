/**
 * 3 Kings Sync log-to-owner-message adapters.
 * No network, no database writes, no Apps Script calls.
 * Never equate existing DB audit counts to authenticated Web readback.
 */
export const PIPELINE_UNITS=Object.freeze({
 defects:'ห้อง',materials:'รายการ',schedule:'รายการงาน',photos:'รูปภาพ',
 work_order:'Work ID',hotel_work_plan:'รายการแผนงาน',
 express:'เอกสาร',daily_site_report:'แถวรายงาน'
});
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?x:null;
const str=(x,max=100)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
/** drive_sync_runs is a job log, not a complete source or web proof. */
export function fromDriveSyncRun(x){
 if(!x||!['defects','materials','schedule','photos'].includes(x.sync_type))
   throw Error('UNSUPPORTED_DRIVE_SYNC_PIPELINE');
 return {
   id:String(x.id??''),run_key:String(x.id??''),sync_type:x.sync_type,
   source_system:'drive_sync_runs',source_file:str(x.source_file),
   created_at:x.created_at,status:x.status,message:str(x.message,300),
   metrics:{read:count(x.rows_read),written:count(x.rows_written)},
   metric_unit:PIPELINE_UNITS[x.sync_type]
 };
}
/** Daily audit rows verify import consistency, not the authenticated Web UI. */
export function fromDailySiteAudit(x){
 if(!x || !Number.isSafeInteger(x.id)||x.id<1||!stamp(x.created_at))
   throw Error('INVALID_DAILY_AUDIT');
 return {
   run_key:'daily_site_report:'+x.id,sync_type:'daily_site_report',
   source_system:'daily_site_report_sync_audit',
   source_file:str(x.source_file_id),created_at:x.created_at,
   status:count(x.rows_verified)===null?'hold':'success',
   message:str(x.notes,300),metric_unit:'แถวรายงาน',
   metrics:{read:count(x.source_rows_read),parsed:count(x.rows_parsed),
    inserted:count(x.rows_inserted),updated:count(x.rows_updated),
    skipped:count(x.rows_skipped),db_verified:count(x.rows_verified)}
 };
}
/** Express register complete means register DB accepted, NOT Web E2E PASS. */
export function fromExpressRegister(x){
 if(!x || !/^[a-f0-9-]{36}$/i.test(String(x.id||'')) ||
   !stamp(x.created_at))throw Error('INVALID_EXPRESS_AUDIT');
 return {
   id:x.id,run_key:'express:'+x.id,sync_type:'express',
   source_system:'express_register_runs',source_file:'Express Register',
   created_at:stamp(x.completed_at)||x.created_at,
   status:x.state==='complete'?'success':'hold',
   message:'Express registry '+str(x.state,50),metric_unit:'เอกสาร',
   metrics:{source_files:count(x.source_files),documents:count(x.document_count),
    lines:count(x.line_count),review:count(x.review_count),
    canceled:count(x.canceled_count)}
 };
}
export function pipelineEvidenceCoverage(){
 return [
  {pipeline:'defects',source:'drive_sync_runs',runId:true,counts:'read/written',authenticatedWeb:false},
  {pipeline:'materials',source:'drive_sync_runs',runId:true,counts:'read/written',authenticatedWeb:false},
  {pipeline:'schedule',source:'drive_sync_runs',runId:true,counts:'read/written',authenticatedWeb:false},
  {pipeline:'photos',source:'drive_sync_runs',runId:true,counts:'read/written',authenticatedWeb:false},
  {pipeline:'daily_site_report',source:'daily_site_report_sync_audit',runId:true,counts:'read/parsed/inserted/updated/skipped/db_verified',authenticatedWeb:false},
  {pipeline:'express',source:'express_register_runs',runId:true,counts:'source_files/documents/lines/review/canceled',authenticatedWeb:false},
  {pipeline:'work_order',source:'GAS execution + Work Order approved sync',runId:false,counts:'NOT_VERIFIED_PER_RUN',authenticatedWeb:false},
  {pipeline:'hotel_work_plan',source:'GAS execution + plan import log',runId:false,counts:'NOT_VERIFIED_PER_RUN',authenticatedWeb:false}
 ];
}
export function metricLines(run,webProof){
 const m=run?.metrics||{},u=run?.metric_unit||'รายการ';
 const rows=[];
 const add=(key,label,unit=u)=>{if(count(m[key])!==null)rows.push(label+': '+m[key]+' '+unit)};
 if(run.sync_type==='express'){
   add('source_files','ไฟล์ต้นทาง','ไฟล์');add('documents','เอกสาร','เอกสาร');
   add('lines','บรรทัดรายการ','บรรทัด');add('review','รายการรอตรวจ','รายการ');
   add('canceled','รายการยกเลิก','เอกสาร');
 }else{
   add('read','อ่านจากต้นทางในรอบนี้');
   add('parsed','ประมวลผล');
   add('inserted','เพิ่มใหม่');add('updated','อัปเดต');
   add('skipped','ข้ามเพราะมีอยู่/ไม่เปลี่ยน');
   add('written','เขียน DB ในรอบนี้');
   add('db_verified','ตรวจยืนยันในขั้นตอนนำเข้า');
 }
 if(webProof?.status==='PASS'&&count(webProof.rows)!==null)
   rows.push('ตรวจยืนยันความตรงกันบนเว็บ: '+webProof.rows+' '+u+' (ทั้งชุด)');
 else rows.push('ยืนยันหน้าเว็บ: ยังไม่มีหลักฐาน E2E ครบ');
 if(count(m.errors)!==null)rows.push('จำนวนรายการผิดพลาด: '+m.errors+' '+u);
 else if(['error','failed','failure'].includes(String(run.status).toLowerCase()))
   rows.push('จำนวนรายการผิดพลาด: ไม่ทราบ (รอบ Sync ล้มเหลว)');
 return rows;
}
