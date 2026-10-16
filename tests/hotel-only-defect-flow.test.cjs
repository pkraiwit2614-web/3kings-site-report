const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')

const src=fs.readFileSync(path.join(__dirname,'../app/defect-flow/page.tsx'),'utf8')

test('Flow รวม remains default and retains original diagram'),()=>{
  assert.match(src,/useState<'sales'\|'hotel'>\('sales'\)/)
  assert.match(src,/<BuildingFlow top=\{190\} building="A" data=\{a\}\/>/)
  assert.match(src,/<BuildingFlow top=\{570\} building="B" data=\{b\}\/>/)
  assert.match(src,/>Flow รวม<\/button>/)
  assert.match(src,/>Flow โรงแรม<\/button>/)
})

test('Hotel Flow is a view of canonical room status and never changes the source query',()=>{
  assert.match(src,/from\('condo_room_status'\)\.select\('room_no,building,customer_status,hotel_participation,status_group,synced_at'\)/)
  assert.match(src,/const hotelRows=useMemo\(\(\)=>rows\.filter\(r=>r\.hotel_participation==='ร่วมโรงแรม'\),\[rows\]\)/)
  assert.match(src,/<HotelFlowDiagram rows=\{hotelRows\} synced=\{displayedSync\}\/>/)
  assert.doesNotMatch(src,/\.from\('condo_room_status'\)\.(insert|update|upsert|delete)\(/)
})

test('Hotel Flow reuses the Sales hotel status cards and has no custom status boxes',()=>{
  assert.match(src,/function hotelStatusItems\(/)
  assert.match(src,/const hotelCustomer=hotelStatusItems\(data,building,true\)/)
  assert.match(src,/const hotelNoCustomer=hotelStatusItems\(data,building,false\)/)
  assert.match(src,/statusRow\(stream\.y\+31,hotelStatusItems\(data,building,stream\.customer\)\)/)
  const hotel=src.slice(src.indexOf('function HotelBuildingFlow('),src.indexOf('type FlowFooterSummary='))
  assert.doesNotMatch(hotel,/Review Needed|Pending Handover|statusItems:StatusItem/)
  assert.match(src,/const review=rows\.length-covered/)
})

test('Flow โรงแรม footer shares Flow รวม status definitions and every card links to Report',()=>{
  assert.match(src,/function flowFooterItems\(/)
  assert.match(src,/const footerItems=flowFooterItems\(endpoints\)/)
  assert.match(src,/const footer=flowFooterItems\(\{/)
  assert.match(src,/\},true\)/)
  assert.match(src,/return <a key=\{item\.label\} href=\{item\.href\} className="flow-link" aria-label=/)
  const defs=src.slice(src.indexOf('function flowFooterItems('),src.indexOf('function HotelFlowDiagram('))
  for(const label of ['Hotel Checked','Customer Accepted','Awaiting Acceptance','New Defect'])
    assert.ok(defs.includes("label:'"+label+"'"))
  assert.doesNotMatch(defs,/Review Needed|Pending Handover/)
})

test('Export and search use active Hotel view without altering Sales defaults',()=>{
  assert.match(src,/view==='hotel'\?'hotel-defect-flow-':'handover-defect-flow-'/)
  assert.match(src,/view==='hotel'\?'filter=hotel&':''/)
  assert.match(src,/onClick=\{\(\)=>changeView\('hotel'\)\}/)
})

test('Hotel-joined B408 remains in shared Awaiting Acceptance status rather than extra Pending Handover box',()=>{
  const report=fs.readFileSync(path.join(__dirname,'../app/defects/page.tsx'),'utf8')
  assert.match(src,/count:data\.customerHotelPending\+data\.customerHotelAwaiting/)
  assert.match(src,/awaitingAcceptance:stage\(GROUP\.awaiting\)\+stage\(GROUP\.pending\)/)
  assert.match(report,/id:'hotel-status-awaiting-acceptance'/)
  assert.match(report,/hotel_participation==='ร่วมโรงแรม'&&\(r\.status_group==='Hotel - Awaiting Check'\|\|r\.status_group==='Non-Hotel - Pending Handover'\)/)
  for(const filter of ['hotel-status-awaiting-sale','hotel-status-awaiting-room','hotel-status-handover-complete','hotel-status-awaiting-acceptance','hotel-status-incomplete'])
    assert.ok(report.includes("id:'"+filter+"'"),'missing Report filter '+filter)
  assert.match(src,/const hotelRows=useMemo\(\(\)=>rows\.filter\(r=>r\.hotel_participation==='ร่วมโรงแรม'\)/)
})

test('Defect Report and other status consumers label Hotel-joined pending acceptance precisely',()=>{
  const display=fs.readFileSync(path.join(__dirname,'../lib/defectStatusPresentation.ts'),'utf8')
  assert.match(display,/status_group==='Non-Hotel - Pending Handover'/)
  assert.match(display,/hotel_participation==='ร่วมโรงแรม'\?'Defect เสร็จแล้ว • รอลูกค้าตรวจรับ'/)
  assert.match(display,/'Defect เสร็จแล้ว • รอลูกค้า \/ Hotel ตรวจรับ'/)
})
