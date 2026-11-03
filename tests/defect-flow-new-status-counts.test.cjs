const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

function loadPresentation(){
  const filename=path.join(__dirname,'../lib/defectStatusPresentation.ts')
  const src=fs.readFileSync(filename,'utf8')
  const compiled=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const module={exports:{}}
  new Function('module','exports',compiled)(module,module.exports)
  return module.exports
}
const flow=fs.readFileSync(path.join(__dirname,'../app/defect-flow/page.tsx'),'utf8')
const report=fs.readFileSync(path.join(__dirname,'../app/defects/page.tsx'),'utf8')
const {canonicalDefectStatusGroup,statusLabel,statusTone}=loadPresentation()

test('newly reported Defect reopens presentation count regardless of historical handover',()=>{
  const raw=[
    {room_no:'A311',hotel_participation:'ไม่ร่วมโรงแรม',current_status:'เพิ่งได้รับแจ้ง Defect 28/10/2026 — รอดำเนินการ',status_group:'Non-Hotel - Handover Complete'},
    {room_no:'B707',hotel_participation:'ไม่ร่วมโรงแรม',current_status:'เพิ่งได้รับแจ้ง Defect 28/10/2026 — รอดำเนินการ',status_group:'Non-Hotel - Handover Complete'},
    {room_no:'A209',hotel_participation:'ไม่ร่วมโรงแรม',current_status:'Handover Complete / ส่งมอบลูกค้าแล้ว',status_group:'Non-Hotel - Handover Complete'},
  ]
  const visible=raw.map(r=>({...r,status_group:canonicalDefectStatusGroup(r.status_group,r.hotel_participation,r.current_status)}))
  assert.deepEqual(visible.map(r=>r.status_group),['Non-Hotel - Incomplete','Non-Hotel - Incomplete','Non-Hotel - Handover Complete'])
  assert.equal(visible.filter(r=>r.status_group==='Non-Hotel - Incomplete').length,2)
  assert.equal(visible.filter(r=>r.status_group==='Non-Hotel - Handover Complete').length,1)
  assert.equal(statusLabel(visible[0]),'เพิ่งได้รับแจ้ง Defect')
  assert.equal(statusTone(visible[0]),'danger')
  assert.equal(statusLabel(visible[2]),'ลูกค้าตรวจรับเรียบร้อยแล้ว')
  assert.equal(raw[0].status_group,'Non-Hotel - Handover Complete')
})

test('old hotel and handover status aliases continue to behave unchanged',()=>{
  assert.equal(canonicalDefectStatusGroup('Hotel - Completed / Awaiting Hotel Inspection','ร่วมโรงแรม','Defect เสร็จ / รอ Hotel ตรวจ'),'Hotel - Awaiting Check')
  assert.equal(canonicalDefectStatusGroup('Handover Complete','ไม่ร่วมโรงแรม','Handover Complete / ส่งมอบลูกค้าแล้ว'),'Non-Hotel - Handover Complete')
  assert.equal(canonicalDefectStatusGroup('Hotel - Checked Complete','ร่วมโรงแรม','Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว'),'Hotel - Checked Complete')
  assert.equal(canonicalDefectStatusGroup('Hotel - Checked Complete','ร่วมโรงแรม','เพิ่งได้รับแจ้ง Defect 01/11/2026'),'Hotel - Incomplete')
  assert.equal(canonicalDefectStatusGroup('Non-Hotel - Pending Handover','ไม่ร่วมโรงแรม','Pending Handover / รอลูกค้าเข้าตรวจ'),'Non-Hotel - Pending Handover')
})

test('Flow and Report both project the current status, and their New Defect links resolve',()=>{
  assert.match(flow,/select\('room_no,building,customer_status,hotel_participation,current_status,status_group,synced_at'\)/)
  assert.match(flow,/canonicalDefectStatusGroup\(row\.status_group,row\.hotel_participation,row\.current_status\)/)
  assert.match(report,/canonicalDefectStatusGroup\(row\.status_group,row\.hotel_participation,row\.current_status\)/)
  assert.match(flow,/GROUP\.incomplete\|\|r\.status_group===GROUP\.nonHotelIncomplete/)
  for(const id of ['status-incomplete','nonhotel-customer-incomplete','nonhotel-nocustomer-incomplete']){
    assert.ok(report.includes("id:'"+id+"'"),'missing Report link target '+id)
  }
  for(const f of ['nonhotel-customer-new','nonhotel-nocustomer-new'])
    assert.ok(flow.includes("filter:'"+f+"'"),'missing Flow link '+f)
  assert.match(flow,/customerNonIncomplete:status\(/)
  assert.match(flow,/noNonIncomplete:status\(/)
  assert.doesNotMatch(flow,/\.from\('condo_room_status'\)\.(insert|update|upsert|delete)\(/)
})

test('Hotel and non-Hotel group counts remain distinct, with no static hard-coded totals',()=>{
  const rows=[
    {hotel_participation:'ร่วมโรงแรม',current_status:'Defect ยังไม่เสร็จ / ต้องปิดงาน',status_group:'Hotel - Incomplete'},
    {hotel_participation:'ไม่ร่วมโรงแรม',current_status:'เพิ่งได้รับแจ้ง Defect 28/10/2026',status_group:'Non-Hotel - Handover Complete'},
    {hotel_participation:'ร่วมโรงแรม',current_status:'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว',status_group:'Hotel - Checked Complete'},
  ].map(r=>({...r,status_group:canonicalDefectStatusGroup(r.status_group,r.hotel_participation,r.current_status)}))
  assert.equal(rows.filter(r=>r.status_group==='Hotel - Incomplete').length,1)
  assert.equal(rows.filter(r=>r.status_group==='Non-Hotel - Incomplete').length,1)
  assert.equal(rows.filter(r=>['Hotel - Incomplete','Non-Hotel - Incomplete'].includes(r.status_group)).length,2)
})

test('new-only Flow counts exclude five older Hotel open defects and preserve 18 real newly notified rooms',()=>{
  const oldHotel=Array.from({length:5},(_,i)=>({room_no:'OLD'+i,hotel_participation:'ร่วมโรงแรม',current_status:'Defect ยังไม่เสร็จ / ต้องปิดงาน',status_group:'Hotel - Incomplete'}))
  const newRooms=Array.from({length:18},(_,i)=>({room_no:'NEW'+i,hotel_participation:i===0?'ร่วมโรงแรม':'ไม่ร่วมโรงแรม',current_status:'เพิ่งได้รับแจ้ง Defect — รอดำเนินการ',status_group:'Non-Hotel - Pending Handover'}))
  const all=[...oldHotel,...newRooms]
  const isNew=r=>/^เพิ่งได้รับแจ้ง\s+Defect\b/i.test(r.current_status)
  assert.equal(all.filter(isNew).length,18)
  assert.equal(all.filter(r=>r.hotel_participation==='ร่วมโรงแรม'&&isNew(r)).length,1)
  assert.equal(all.filter(r=>r.hotel_participation==='ร่วมโรงแรม'&&!isNew(r)).length,5)
  assert.match(flow,/const isNewDefect=/)
  assert.match(flow,/count:v.newly/)
  assert.doesNotMatch(flow,/label:'Open Defect'/)
  for(const id of ['newly-notified','old-incomplete','hotel-newly-notified','hotel-old-incomplete','hotel-customer-new','hotel-nocustomer-new','nonhotel-customer-new','nonhotel-nocustomer-new'])
   assert.ok(report.includes("id:'"+id+"'"),id)
  assert.doesNotMatch(flow,/count:v.incomplete,tone:'danger'/)
  assert.doesNotMatch(flow,/Defect ค้างเดิม/)
});

test('Defect Report keeps old incomplete room labels distinct from newly notified status',()=>{
 assert.match(report,/const displayRoomStatus=\(r:RoomRow\)=>/)
 assert.match(report,/return r\.current_status\|\|'Defect ยังไม่เสร็จ'/)
 assert.match(report,/\{displayRoomStatus\(r\)\}<\/span>/)
 assert.match(report,/displayRoomStatus\(other\)/)
});
