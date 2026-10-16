const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const read=file=>fs.readFileSync(file,'utf8')
const page=read('app/work-order/page.tsx')
const css=read('app/work-order/work-order.css')
const groups=read('lib/hotelRoomGroups.ts')
const defectEnhancer=read('components/DefectCombineRoomEnhancer.tsx')
const sync=read('docs/apps-script/WorkOrderAutoSync_2026-10-15.gs')
const sql=read('supabase/migrations/20261015140000_defect_work_order_auto_import.sql')

test('Work Order table header remains sticky during screen scrolling only',()=>{
 assert.match(css,/\.wo-table-wrap\{[^}]*max-height:min\(68vh,720px\);overflow-x:auto;overflow-y:auto/)
 assert.match(css,/\.wo-table thead th\{position:sticky;top:0;z-index:3/)
 assert.match(css,/@media print/)
 assert.match(css,/\.wo-table-wrap\{max-height:none!important;height:auto!important;overflow:visible!important\}/)
 assert.match(css,/\.wo-table thead th\{position:static!important/)
 assert.match(css,/\.wo-table tr\{break-inside:avoid/)
})

test('Combine mark and group names are sourced from the existing Defect grouping',()=>{
 assert.match(page,/import \{hotelRoomLabel,hotelRoomMembers\} from '@\/lib\/hotelRoomGroups'/)
 assert.match(page,/flatMap\(room=>hotelRoomMembers\(room\)\)/)
 assert.match(page,/className="wo-combine-code" title="ห้อง Combine">c<\/span>/)
 assert.match(page,/Combine: \{ids\(r\.room_group\)\.join\(' \+ '\)\}/)
 assert.match(css,/\.wo-combine-code\{/)
 assert.match(css,/\.wo-combine-badge\{/)
 assert.match(defectEnhancer,/code\.textContent='c'/)
 assert.match(groups,/"A517",\s*"A518"/)
 assert.match(groups,/"A617",\s*"A618"/)
 assert.doesNotMatch(groups,/"A313",\s*"A314"/)
 assert.match(groups,/"B610",\s*"B611"/)
 assert.match(page,/members\.every\(room=>roomMap\.get\(room\)==='Hotel - Incomplete'\)/)
})

test('Read side excludes retired source Work IDs and cannot mutate master',()=>{
 assert.match(page,/eq\('source_active',true\)/)
 assert.doesNotMatch(page,/\.update\(|\.upsert\(|\.delete\(|\.insert\(/)
 assert.match(sql,/ADD COLUMN IF NOT EXISTS source_active boolean/)
 assert.match(sql,/SET source_active=false/)
 assert.doesNotMatch(sql,/UPDATE public\.condo_room_status|DELETE FROM public\.condo_room_status|ALTER TABLE public\.condo_room_status/i)
 assert.match(sql,/IS DISTINCT FROM/)
})

test('Isolated Apps Script compiles and installs only its own time-based trigger',()=>{
 assert.doesNotThrow(()=>new vm.Script(sync,{filename:'WorkOrderAutoSync.js'}))
 assert.match(sync,/WORK_ORDER_FILE_ID/)
 assert.match(sync,/DEFECT_SYNC_KEY/)
 assert.match(sync,/SUPABASE_PUBLISHABLE_KEY/)
 assert.match(sync,/getLastUpdated\(\)\.toISOString\(\)/)
 assert.match(sync,/p_source_modified_at:revision/)
 assert.match(sync,/getSheetByName\(WORK_ORDER_AUTO_20261015\.SHEET_NAME\)/)
 assert.match(sync,/cleanupTempSpreadsheet_\(temp\)/)
 assert.match(sync,/if\(day===7\|\|hour<8\|\|hour>18\)/)
 assert.match(sync,/getHandlerFunction\(\)===name/)
 assert.match(sync,/newTrigger\(name\)\.timeBased\(\)\.everyHours\(2\)/)
 assert.doesNotMatch(sync,/newTrigger\(name\)\.timeBased\(\)\.everyHours\(1\)/)
 assert.match(sync,/existing\.forEach\(t=>ScriptApp\.deleteTrigger\(t\)\)/)
 assert.doesNotMatch(sync,/getFileById\(.*\)\.set|Drive\.Files\.update|uploadType=media/)
})

test('Server sync source isolation, guards, and business-only writes',()=>{
 assert.match(sql,/private\.drive_sync_key_valid\(p_sync_key\)/)
 assert.match(sql,/sha256\(convert_to\(coalesce\(p_source_file_id,''\),'UTF8'\)\)/)
 assert.match(sql,/unapproved_work_order_source/)
 assert.match(sql,/invalid_or_duplicate_work_ids/)
 assert.match(sql,/unknown_room_in_source/)
 assert.match(sql,/large_source_drop_requires_review/)
 assert.match(sql,/stale_excel_revision/)
 assert.match(sql,/pg_advisory_xact_lock/)
 assert.match(sql,/IF p_dry_run THEN/)
 assert.match(sql,/ON CONFLICT \(work_id\) DO UPDATE/)
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.defect_work_order_sync_import/)
 assert.doesNotMatch(sql,/https:\/\/drive\.google\.com\/file\/d\//)
 assert.doesNotMatch(sql,/DF-[AB][0-9]{3}-[0-9]/)
})

test('Dispatch parser stops at first section break, never imports QA appendix',()=>{
 const context=vm.createContext({Date,JSON,console,Utilities:{formatDate:()=> '2026-10-15'}})
 vm.runInContext(sync,context)
 const headers=['ลำดับ','ผู้รับเหมา','Work ID','ห้อง/Combine','รายการ Defect','งานที่ต้องทำต่อ',
 'ผู้คุม','วันรับแจ้งจริง','ครบ 7 วัน','สถานะล่าสุด','หลักฐานต้นฉบับ',
 'สถานะห้อง (Web ผ่าน Defect Master)','ผลตรวจแจกงาน','ซิงก์ต้นทางล่าสุด','ข้อขัดแย้ง / Combine']
 const valid=['1','RSE','DF-B610-B611-01','B610+B611','ไฟไม่ติด','ตรวจไฟ','บังรุน','รอยืนยัน','','ยังไม่เริ่ม','','','ตรวจรายการ','15/10/2569','']
 const qaRow=['2','3 Kings','DF-A212-08','A212','รายการรอตรวจภาพ','รอเอกสาร','พี่ปู','','','ยังไม่เริ่ม','','','รอตรวจ','','']
 const fakeSheet={getDataRange(){return {getValues(){return [
  ['Defect | Work Order'],headers,valid,['','','','','','',''],['QA APPENDIX'],qaRow
 ]}}}}
 const parsed=vm.runInContext('workOrderParse20261015_',context)(fakeSheet)
 assert.equal(parsed.length,1)
 assert.equal(parsed[0].work_id,'DF-B610-B611-01')
 assert.equal(parsed[0].received_date,null)
})

test('Work Order importer reads active dispatch worksheet, never historical team ledger',()=>{
 assert.match(sync,/SHEET_NAME:'ใบแจกงานคงค้าง 151026'/)
 assert.doesNotMatch(sync,/SHEET_NAME:'ใบแจกงานตามทีม'/)
 assert.match(sync,/getSheetByName\(WORK_ORDER_AUTO_20261015\.SHEET_NAME\)/)
 assert.match(sync,/if\(!id\)\{if\(startedDispatch\)break;continue;\}/)
})
