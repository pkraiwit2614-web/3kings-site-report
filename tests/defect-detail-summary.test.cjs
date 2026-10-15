const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

const raw=fs.readFileSync(path.join(__dirname,'../lib/defectDetailSummary.ts'),'utf8')
const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod={exports:{}}
new Function('module','exports',js)(mod,mod.exports)
const {summarizeDefectDetail}=mod.exports

test('original work items, documented count, and only first/latest date survive many updates',()=>{
 const detail='Hotel PDF 04/10/2026 ระบุ 13 รายการ. ข้อความกำกับที่อ่านได้: ไม่มีสายรัดผ้าม่าน; มีน้ำหยดที่วาล์ว. ภาพประกอบบางรายการไม่มีคำกำกับ. | ผู้ใช้ยืนยัน 05/10/2026: รอซ่อม.'
    +'\n[อัพเดท 10/10/2026] กำลังแก้ไข\n[ยืนยันล่าสุด 15/10/2026] งาน Pre Fur. เสร็จทั้งหมด'
 const result=summarizeDefectDetail(detail)
 assert.equal(result.work,'ไม่มีสายรัดผ้าม่าน; มีน้ำหยดที่วาล์ว')
 assert.equal(result.count,'13 รายการ')
 assert.equal(result.dates,'04/10/2026 → 15/10/2026')
 assert.doesNotMatch(result.work,/ผู้ใช้ยืนยัน|Pre Fur.|10\/10/)
})

test('numbered work list retains all work but omits missing numeric evidence assumptions',()=>{
 assert.deepEqual(summarizeDefectDetail('[1] Living room — scratches; [2] Paint; [3] Sink'),{
   work:'[1] Living room — scratches; [2] Paint; [3] Sink',dates:'ไม่ระบุ',count:'3 รายการ'})
 assert.equal(summarizeDefectDetail('งานระบบ — ไฟไม่ติด\n[อัพเดท 15/10/2026] เสร็จ 06/10/2026').count,'ไม่ระบุ')
})

test('room closure audit paragraphs do not leak into visible work description',()=>{
 const input='ไม่มีลิ้นกันกลิ่น 2 จุด — แก้ไขแล้ว 28/09/2026; รอ Hotel Engineer ตรวจ'
     +'\n14/10/2026 — ปิดรอบ Defect โดยปริยายตามกฎ 7 วัน'
 const result=summarizeDefectDetail(input)
 assert.equal(result.work,'ไม่มีลิ้นกันกลิ่น 2 จุด')
 assert.equal(result.dates,'28/09/2026 → 14/10/2026')
 assert.equal(result.count,'ไม่ระบุ')
})

test('dates are validated, normalized and never substituted with todays date',()=>{
 assert.equal(summarizeDefectDetail('ตรวจยาแนว 30/02/2026; เสร็จ 2026-10-06').dates,'06/10/2026')
 assert.equal(summarizeDefectDetail('ตรวจยาแนว 15/10/69').dates,'15/10/2026')
 assert.equal(summarizeDefectDetail('').dates,'ไม่ระบุ')
 assert.equal(summarizeDefectDetail('งานวัสดุ').count,'ไม่ระบุ')
})

test('scope stays presentation-only: canonical values, print, search and editing still use original detail',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../app/defects/page.tsx'),'utf8')
 assert.match(page,/summaryByRoom=useMemo/)
 assert.match(page,/summaryByRoom\.get\(r\.room_no\)\?\.work/)
 assert.match(page,/summaryByRoom\.get\(r\.room_no\)\?\.dates/)
 assert.match(page,/summaryByRoom\.get\(r\.room_no\)\?\.count/)
 assert.match(page,/other\.defect_detail/)
 assert.match(page,/\.defect-detail \.defect-detail-text\.is-collapsed/)
 assert.match(page,/r\.next_action\|\|r\.follow_up/)
 assert.doesNotMatch(page,/update\(\{\s*defect_detail:/)
})
