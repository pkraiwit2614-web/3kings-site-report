const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const gas=fs.readFileSync('docs/apps-script/WorkOrderMasterCompletedSync_20261107.gs','utf8')
const handler=fs.readFileSync('docs/apps-script/WorkOrderAutoSync_2026-10-15.gs','utf8')
const sql=fs.readFileSync('supabase/migrations/20261107023500_work_order_master_completed_37_guarded_sync.sql','utf8')
const header=[
 'Work ID','ห้อง/กลุ่ม Combine','ผู้รับเหมา','รายการ Defect (หนึ่งจุด/บรรทัด)',
 'แนวทางดำเนินการ / จำนวนจุด','วันที่รับแจ้งจริง','ครบกำหนด 7 วัน',
 'ลิงก์ภาพ / PDF (ตรวจวัน)','สถานะงาน','สถานะห้อง (Web ผ่าน Defect Master)','ผู้คุม A/B'
]
const config={A207:4,A301:2,A327:2,A416:9,A512:12,A612:8}
function fixture(){
 const rows=[header]
 for(const [room,count] of Object.entries(config)){
  for(let n=1;n<=count;n++){
   const id='DF-'+room+'-'+String(n).padStart(2,'0')
   rows.push([id,room,'3 Kings','Defect item '+n,'รอเข้าตรวจ',
     '2026-11-03','2026-11-10','https://drive.google.com/file/d/fixture/view',
     'เสร็จแล้ว — งดแจก (รอตรวจรับ)',
     room==='A416'?'Defect เสร็จแล้ว / รอ Hotel ตรวจ':'Defect เสร็จแล้ว / รอตรวจ',
     'พี่ปู'])
  }
 }
 return rows
}
const context={workOrderIsoDate20261015_:value=>String(value||'').slice(0,10)}
vm.runInNewContext(gas,context)
function parse(rows){return context.workOrderMasterCompletedRows20261107_({
 getName:()=> 'รายการ Defect',
 getDataRange:()=>({getValues:()=>rows})
})}
test('the existing 2-hour handler invokes completed-owner reconciliation without new triggers',()=>{
 assert.match(handler,/workOrderMasterCompletedSync20261107_\(false\)/)
 assert.match(handler,/const legacy=workOrderRun20261015_\(false,false\)/)
 assert.match(handler,/return \{\.\.\.legacy,approved,completed\}/)
 assert.match(gas,/WORK_ORDER_MASTER_COMPLETED_SYNC_REV_20261107/)
 assert.doesNotMatch(gas,/ScriptApp\.newTrigger|\.deleteTrigger|\.setProperty\('WORK_ORDER_FILE_ID'/)
})
test('parser extracts exactly the six authorized rooms and 37 ids as COMPLETED, no dispatch',()=>{
 const rows=parse(fixture())
 assert.equal(rows.length,37)
 assert.equal(new Set(rows.map(x=>x.work_id)).size,37)
 for(const [room,n] of Object.entries(config))
  assert.equal(rows.filter(x=>x.room_group===room).length,n)
 assert.ok(rows.some(x=>x.work_id==='DF-A207-04'))
 assert.ok(rows.every(x=>x.work_status==='เสร็จแล้ว — งดแจก (รอตรวจรับ)'))
})
test('parser refuses incomplete scope, stale statuses, missing evidence or an ambiguous room',()=>{
 let data=fixture();data.pop()
 assert.throws(()=>parse(data),/EXACT_37_SOURCE_SCOPE_MISMATCH/)
 data=fixture();data[1][8]='HOLD'
 assert.throws(()=>parse(data),/ROOM_OR_STATUS_MISMATCH/)
 data=fixture();data[1][7]=''
 assert.throws(()=>parse(data),/EVIDENCE_MISSING/)
 data=fixture();data[1][1]='A999'
 assert.throws(()=>parse(data),/ROOM_OR_STATUS_MISMATCH/)
})
test('SQL requires original approved XLSX, exact 37 ids, original promotions, queue guards and audit',()=>{
 assert.match(sql,/private\.drive_sync_key_valid\(p_sync_key\)/)
 assert.match(sql,/18P3OFYtOLsslCtDujlSQVf9IQSuplKcx/)
 assert.match(sql,/jsonb_array_length\(p_rows\) <> 37/)
 for(const [room,count] of Object.entries(config))
  assert.ok(sql.includes("('"+room+"',"+count+")"))
 assert.match(sql,/defect_web_overrides/)
 assert.match(sql,/coalesce\(a\.combine_checked,false\)/)
 assert.match(sql,/existing_approval_missing/)
 assert.match(sql,/source_file_id IS DISTINCT FROM p_source_file_id/)
 assert.match(sql,/ARCHIVE_STAGED_HOLD_AS_COMPLETED_NO_DISPATCH/)
 assert.match(sql,/source_active\)/)
 assert.match(sql,/now\(\),false\)/)
 assert.match(sql,/work_order_promotion_audit/)
 assert.doesNotMatch(sql,/UPDATE\s+public\.condo_room_status/i)
 assert.doesNotMatch(sql,/DELETE\s+FROM\s+public\.defect_work_order_snapshot/i)
 assert.doesNotMatch(sql,/GRANT\s+(ALL|UPDATE|INSERT|DELETE)\s+ON\s+public\.defect_work_order_snapshot/i)
})
test('GAS executes existing REST transport with guarded dry-run, write, readback and unchanged file id',()=>{
 assert.match(gas,/workOrderConfig20261015_\(\)/)
 assert.match(gas,/openSpreadsheetFromExcel_\(file\)/)
 assert.match(gas,/p_sync_key:c\.syncKey/)
 assert.match(gas,/p_source_file_id:WORK_ORDER_COMPLETED_20261107\.SOURCE_ID/)
 assert.match(gas,/workOrderMasterCompletedPost20261107_\(c,revision,rows,true\)/)
 assert.match(gas,/workOrderMasterCompletedPost20261107_\(c,revision,rows,false\)/)
 assert.match(gas,/Number\(verified\.would_change\)!==0/)
 assert.match(gas,/Number\(applied\.closed_total\)!==37/)
 assert.doesNotMatch(gas,/DriveApp\.createFile|\.setSharing\(|\.setTrashed\(/)
})
