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
 assert.equal(result.work,'ไม่มีสายรัดผ้าม่าน, มีน้ำหยดที่วาล์ว')
 assert.equal(result.count,'13 รายการ')
 assert.equal(result.dates,'04/10/2026 → 15/10/2026')
 assert.doesNotMatch(result.work,/ผู้ใช้ยืนยัน|Pre Fur.|10\/10/)
})

test('numbered work list retains all work but omits missing numeric evidence assumptions',()=>{
 assert.deepEqual(summarizeDefectDetail('[1] Living room — scratches; [2] Paint; [3] Sink'),{
   work:'[1] Living room — scratches, [2] Paint, [3] Sink',dates:'ไม่ระบุ',count:'3 รายการ'})
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
 assert.doesNotMatch(page,/<b>จำนวนงาน:/,'count is source metadata, no redundant count shown in Report')
 assert.match(page,/other\.defect_detail/)
 assert.match(page,/\.defect-detail \.defect-detail-text\.is-collapsed/)
 assert.match(page,/siteOnlyNextAction\(r\.next_action\|\|r\.follow_up\)/)
 assert.doesNotMatch(page,/update\(\{\s*defect_detail:/)
})

test('all historically recorded source jobs are displayed consistently without turning update notes into new jobs',()=>{
 const detail='Hotel list ล่าสุด 30/09/2026: Kitchen—RCU Frozen; Door not adjusted; Bathroom—Stopper not working. หลักฐานเสริม doc 23/09/2026: คราบน้ำ/เก็บสี; RCU ไม่ติด.'
  +'\\n[อัปเดต 15/10/2026 จากผู้ใช้] งานอื่นเสร็จแล้ว; คงค้างเฉพาะ RCU Frozen'
 const result=summarizeDefectDetail(detail)
 assert.equal(result.work,'Kitchen—RCU Frozen, Door not adjusted, Bathroom—Stopper not working, คราบน้ำ/เก็บสี, RCU ไม่ติด')
 assert.equal(result.dates,'23/09/2026 → 15/10/2026')
 assert.doesNotMatch(result.work,/งานอื่นเสร็จแล้ว|คงค้างเฉพาะ/)
})

test('A217/A218 visit-only notes keep the source truth without displaying a visit as a repair item',()=>{
 const original='เข้าเก็บ Defect วันนี้ 02/10/2026; รายการย่อยยังไม่ระบุ'
   +'\n14/10/2026 — ปิดรอบ Defect โดยปริยายตามกฎเกิน 7 วัน: ซ่อมเสร็จ 05/10/2026'
 const result=summarizeDefectDetail(original)
 assert.equal(result.work,'รายการย่อยยังไม่ระบุ')
 assert.equal(result.dates,'02/10/2026 → 14/10/2026')
 assert.equal(result.count,'ไม่ระบุ')
 assert.doesNotMatch(result.work,/เข้าเก็บ|ปิดรอบ|ซ่อมเสร็จ/)
})

test('A313/A314 preserve the documented system job and latest update date without treating follow-up as another job',()=>{
 const original='งานระบบ — สะดืออ่าง'
   +'\\n[อัพเดท 15/10/2026 จากผู้ใช้] น้ำรั่วใต้อ่างล้างหน้า; รอขอพงษ์ตรวจงานระบบ — Combine A313+A314'
 const result=summarizeDefectDetail(original)
 assert.equal(result.work,'งานระบบ — สะดืออ่าง')
 assert.equal(result.dates,'15/10/2026')
 assert.doesNotMatch(result.work,/รอขอพงษ์|Combine/)
})

test('Defect Report keeps the same display sections and full printable text for every room',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../app/defects/page.tsx'),'utf8')
 const css=fs.readFileSync(path.join(__dirname,'../app/defects/print.css'),'utf8')
 assert.match(page,/\.defect-summary-work-label\{display:block;margin-bottom:2px/)
 assert.match(page,/\.defect-summary-meta\{display:block;font-size:9px;line-height:1\.35/)
 assert.match(page,/\.defect-detail-text\{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1\.45/)
 assert.match(css,/\.detail-panel \.defect-table \.defect-summary-meta\{margin-top:1px!important;line-height:1\.16!important\}/)
 assert.match(page,/\.defect-detail \.defect-detail-text\.is-collapsed\{display:block!important/) // Report expands on print
})

test('Combine room decorator never erases Report work headings, dates, Work Order links or print controls',()=>{
 const enhancer=fs.readFileSync(path.join(__dirname,'../components/DefectCombineRoomEnhancer.tsx'),'utf8')
 const report=fs.readFileSync(path.join(__dirname,'../app/defects/page.tsx'),'utf8')
 assert.doesNotMatch(enhancer,/detailCell\.textContent\s*=/,'a Combine badge cannot replace the entire React details cell')
 assert.doesNotMatch(enhancer,/row\.cells\[6\]\.textContent\s*=/)
 assert.match(enhancer,/code\.textContent='c'/,'preserve existing Combine indicator')
 assert.match(enhancer,/combine-room-badge/,'preserve existing Combine room label')
 assert.match(report,/className="defect-summary-work-label">งานทั้งหมด :/)
  assert.ok(report.includes('className="defect-summary-meta"><b>วันที่งาน/อัพเดท :</b>'))
  assert.ok(report.includes('className="defect-summary-meta"><b>ดู Work Order :</b>'))
 assert.match(report,/summaryByRoom\.get\(r\.room_no\)\?\.work/)
 assert.match(report,/summaryByRoom\.get\(r\.room_no\)\?\.dates/)
 assert.match(report,/isLongDefectDetail/)
})

test('Flow deep link reaches rendered report table, Work Order missing popup is guarded, print hides only next-action column',()=>{
 const flow=fs.readFileSync(path.join(__dirname,'../app/defect-flow/page.tsx'),'utf8')
 const report=fs.readFileSync(path.join(__dirname,'../app/defects/page.tsx'),'utf8')
 const printCss=fs.readFileSync(path.join(__dirname,'../app/defects/print.css'),'utf8')
 assert.match(flow,/#report-results/)
 assert.match(report,/id="report-results"/)
 assert.match(report,/document\.getElementById\(target\)\?\.scrollIntoView/)
 assert.match(report,/\[loading,filter,building,q,rows\.length\]/)
 assert.match(report,/งานทั้งหมด :/)
 assert.match(report,/วันที่งาน\/อัพเดท :/)
 assert.match(report,/ดู Work Order :/)
 assert.match(report,/workOrderReadState==='ready'\?'Work Order ไม่มี/)
 assert.match(report,/data-has-open-work=\{workOpenByRoom\.has\(r\.room_no\)\?'true':'false'\}/)
 assert.match(report,/r\.defect_detail\?\.trim\(\)/)
 assert.match(printCss,/@media print/)
 assert.match(printCss,/\.defect-table th:nth-child\(9\),\.defect-table td:nth-child\(9\)\{display:none!important\}/)
 assert.doesNotMatch(printCss,/\.defect-table th:nth-child\(10\),\.defect-table td:nth-child\(10\)\{display:none/)
})



const displayRaw=fs.readFileSync(path.join(__dirname,'../lib/defectReportDisplay.ts'),'utf8')
const displayJs=ts.transpileModule(displayRaw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const displayMod={exports:{}}
new Function('module','exports',displayJs)(displayMod,displayMod.exports)
const {siteOnlyNextAction}=displayMod.exports


test('next action retains real new Defect counts, dates and practical follow-up',()=>{
 const raw='รับแจ้ง Warranty Defect 12 จุด 02/11/2026; เปิด Work ID DF-A512-01 ถึง 12; ติดตามแก้ไข/After และนัดลูกค้าตรวจซ้ำ (ไม่เปลี่ยน Pending Handover)'
 const shown=siteOnlyNextAction(raw)
 assert.match(shown,/12 จุด 02\/11\/2026/)
 assert.match(shown,/ติดตามแก้ไข\/After และนัดลูกค้าตรวจซ้ำ/)
 assert.doesNotMatch(shown,/Work ID|DF-A512|Pending Handover/)
})

test('next action hides Work ID, Doc identifiers and duplicate HOLD matching commentary',()=>{
 const raw='รับ Defect ลูกค้าตรวจใหม่ Doc.135 วันที่ 03/11/2026 จำนวน 16 จุด; ติดตาม Work ID DF-A401-17 ถึง 32 (รายการ 12 HOLD รอเทียบงานเดิม); คง 7 งานเก่าที่ปิดแล้ว (01,08,09), งานค้าง Doc.69; รอเก็บ After/ลูกค้าตรวจส่งมอบ'
 const shown=siteOnlyNextAction(raw)
 assert.match(shown,/16 จุด/)
 assert.match(shown,/รอเก็บ After\/ลูกค้าตรวจส่งมอบ/)
 assert.doesNotMatch(shown,/Doc\.|Work ID|DF-A401|HOLD|รอเทียบงานเดิม|งานค้าง Doc/)
 const a311='รับแจ้ง Defect ใหม่ 28/10/2026 จากรายงาน Inspection 26/10/2026 (Doc.265) รวม 9 จุด; 8 Work ID ใหม่ DF-A311-02 ถึง 09; จุดลามิเนต #2 ผูกตรวจเทียบกับ DF-A311-01 เดิม (HOLD ไม่เปิดงานซ้ำ); รอยืนยันสิทธิ์เข้าห้อง/ทีม/วันเข้าซ่อมและหลักฐานหลังแก้'
 assert.equal(siteOnlyNextAction(a311),'รับแจ้ง Defect ใหม่ 28/10/2026 จากรายงาน Inspection 26/10/2026 รวม 9 จุด; รอยืนยันสิทธิ์เข้าห้อง/ทีม/วันเข้าซ่อมและหลักฐานหลังแก้')
})

test('remaining work uses canonical field only; Combine, status and work links still present',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../app/defects/page.tsx'),'utf8')
 assert.match(page,/siteOnlyNextAction\(r\.next_action\|\|r\.follow_up\)/)
 assert.match(page,/siteOnlyNextAction\(other\.next_action\|\|other\.follow_up\)/)
 assert.match(page,/r\.room_no,summarizeDefectDetail\(r\.defect_detail\)/)
 assert.match(page,/workOpenByRoom\.has\(r\.room_no\)/)
 assert.match(page,/displayRoomStatus\(r\)/)
 assert.doesNotMatch(page,/\.update\(\{\s*next_action:/)
})

test('mixed administrative HOLD never discards repairs or appointments in the same clause',()=>{
 assert.equal(siteOnlyNextAction('รายการ 12 HOLD รอเทียบงานเดิม, นัดช่างซ่อมประตู 05/11/2026 โดยคุณเอ'),
 'นัดช่างซ่อมประตู 05/11/2026 โดยคุณเอ')
 assert.equal(siteOnlyNextAction('ติดตาม Work ID DF-A999-01; รออนุมัติเข้าห้อง/นัดลูกค้า/เก็บ After'),
 'รออนุมัติเข้าห้อง/นัดลูกค้า/เก็บ After')
 assert.equal(siteOnlyNextAction('ผูกตรวจเทียบกับ DF-A999-01 เดิม (HOLD ไม่เปิดงานซ้ำ), รอเก็บภาพ After'),
 'รอเก็บภาพ After')
})
test('operational HOLD and uncertain wording remain verbatim',()=>{
 for(const raw of ['งาน #08-#09 HOLD รอยืนยันช่าง','รออนุมัติซ่อม/รอยืนยันชิ้นส่วน; ผู้รับผิดชอบ พี่ปู',
 'Combine A901+A902 นัดเข้าห้อง 05/11/2026','HOLD ตรวจหน้างานกับคุณเอก่อนอนุมัติ',
 'ตรวจตำแหน่งคราบกาว #9 เทียบ #6']){
   assert.equal(siteOnlyNextAction(raw),raw)
 }
})
test('document removal never rewrites intake, names, dates or counts',()=>{
 assert.equal(siteOnlyNextAction('04/11/2026 รับ PDF A999 Art House Doc ID.219 จำนวน 9 รายการ; นัดช่าง'),
 '04/11/2026 รับ PDF A999 Art House จำนวน 9 รายการ; นัดช่าง')
 assert.equal(siteOnlyNextAction('รับแจ้ง Doc. Id. 219 วันที่ 03/11/2026; เปิด Work ID DF-A999-01 ถึง DF-A999-09 รอแก้/After'),
 'รับแจ้ง วันที่ 03/11/2026; รอแก้/After')
 assert.equal(siteOnlyNextAction('รับ Defect 23 จุด (ทีมเอ 23 จุด, อนุมัติ Work Order 8 รายการ DF-A999-01..17 ส่วนที่เหลือ 15 จุด HOLD); นัดตรวจ'),
 'รับ Defect 23 จุด (ทีมเอ 23 จุด); นัดตรวจ')
})
test('empty source keeps original placeholder and no fabricated replacement',()=>{
 assert.equal(siteOnlyNextAction(null),'-')
 assert.equal(siteOnlyNextAction(''),'-')
})

test('system sync and duplicate-link spans preserve the site action next to them',()=>{
 assert.equal(siteOnlyNextAction('Sync สำเร็จ, นัดช่างเข้าห้อง; ฐานข้อมูลอัปเดตแล้ว, รอเก็บ After'),
 'นัดช่างเข้าห้อง; รอเก็บ After')
 assert.equal(siteOnlyNextAction('เชื่อม Work Order DF-A999-01 เพื่อป้องกันรายการซ้ำ, นัดลูกค้าตรวจรับ'),
 'นัดลูกค้าตรวจรับ')
})

test('system history between sentences leaves complete site clauses without orphan punctuation',()=>{
 const raw='เครื่องหมายถูกไม่ใช่หลักฐานตรวจรับ/After ยืนยันการปิด จึงคงสถานะ เพิ่งได้รับแจ้ง Defect และ Work ID DF-A999-01..04 โดยไม่สร้างซ้ำ. DF-A999-01 ถึง -03 ยังคงรอดำเนินการ/รอตรวจผลจริง; DF-A999-04 คง HOLD ตรวจตำแหน่งคราบกาว #9 เทียบ #6.'
 assert.equal(siteOnlyNextAction(raw),'เครื่องหมายถูกไม่ใช่หลักฐานตรวจรับ/After ยืนยันการปิด; ยังคงรอดำเนินการ/รอตรวจผลจริง; คง HOLD ตรวจตำแหน่งคราบกาว #9 เทียบ #6')
})
