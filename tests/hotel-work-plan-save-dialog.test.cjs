const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const work=fs.readFileSync('app/hotel-work-plan/page.tsx','utf8')
const sql=fs.readFileSync('supabase/migrations/20261014115000_hotel_work_plan_isolated.sql','utf8')

test('Day and room save buttons open review modal before any save RPC',()=>{
 assert.match(work,/onClick=\{openDaySaveReview\}>บันทึก Day/)
 assert.match(work,/onClick=\{openRoomSaveReview\}>บันทึกรายห้อง/)
 assert.match(work,/setSaveDialog\(\{phase:'confirm',intent:\{kind:'day'/)
 assert.match(work,/setSaveDialog\(\{phase:'confirm',intent:\{kind:'room'/)
 assert.match(work,/saveDialog\.phase!=='confirm'\|\|!saveDialog\.intent\.changes\.length/)
 assert.match(work,/onClick=\{\(\)=>\{void confirmSave\(\)\}\}>ยืนยันบันทึก/)
 assert.match(work,/saveDialog\.phase==='saving'/)
 assert.match(work,/disabled=\{saving\|\|!saveDialog\.intent\.changes\.length\}/)
})
test('modal distinguishes confirmed Web write from pending Excel writeback',()=>{
 assert.match(work,/receipt\?\.ok!==true\|\|typeof receipt\.revision!=='number'/)
 assert.match(work,/phase:'success',intent,returnedRevision:receipt\.revision/)
 assert.match(work,/บันทึกเข้า Web App สำเร็จ/)
 assert.match(work,/ไม่ได้ยืนยันว่าไฟล์ Excel อัปเดตแล้ว/)
 assert.match(work,/phase:'error',intent,feedback/)
 assert.match(work,/REVISION_CONFLICT_RELOAD/)
 assert.match(work,/work-save-feedback/)
 assert.match(work,/role="dialog" aria-modal="true"/)
 assert.match(work,/role="alert"/)
 assert.match(work,/onMouseDown=\{e=>/)
 assert.match(work,/saveDialog\.phase!=='saving'&&!saving/)
})
test('Day and room edits retain exact backend revision checks and original RPC names',()=>{
 assert.match(work,/hotel_work_plan_save_day',intent\.values/)
 assert.match(work,/hotel_work_plan_save_room',intent\.values/)
 assert.match(work,/p_expected_revision:day\.revision/)
 assert.match(work,/p_expected_revision:selected\.revision/)
 assert.match(work,/p_note:day\.note\|\|''/)
 assert.match(work,/p_note:selected\.note\|\|''/)
 assert.match(sql,/REVISION_CONFLICT_RELOAD/)
 assert.match(sql,/sync_state='pending'/)
 assert.doesNotMatch(work,/from\('hotel_room_availability'\)\.update/)
 assert.doesNotMatch(work,/from\('condo_room_status'\)\.update/)
})
test('change review includes exact before and after values and suppresses unchanged fields',()=>{
 const start=work.indexOf('type SaveChange=')
 const end=work.indexOf('const LABELS:',start)
 assert.ok(start>0&&end>start,'save diff utility not found')
 const code=ts.transpileModule(work.slice(start,end)+'\nexports.buildSaveChanges=buildSaveChanges',{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText
 const context={exports:{}}
 vm.createContext(context)
 vm.runInContext(code,context)
 const compare=context.exports.buildSaveChanges
 const result=compare([
  {label:'Day',before:'1',after:'2',format:value=>'Day '+value},
  {label:'หมายเหตุ',before:'รอตรวจ',after:'ยืนยันแล้ว'},
  {label:'วันเข้าจริง',before:null,after:null},
  {label:'วันที่เฉพาะห้อง',before:null,after:'2026-10-25',format:value=>value||'ตาม Day'},
 ])
 assert.deepEqual(JSON.parse(JSON.stringify(result)),[
  {label:'Day',before:'Day 1',after:'Day 2'},
  {label:'หมายเหตุ',before:'รอตรวจ',after:'ยืนยันแล้ว'},
  {label:'วันที่เฉพาะห้อง',before:'ตาม Day',after:'2026-10-25'},
 ])
 assert.equal(compare([{label:'no-op',before:'',after:null}]).length,0)
})
console.log('Hotel Work Plan save confirmation modal and review safeguards: PASS')
