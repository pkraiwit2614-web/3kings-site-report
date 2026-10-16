const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')

const src=fs.readFileSync(path.join(__dirname,'../app/defect-flow/page.tsx'),'utf8')

test('Sales Defect Flow remains the default and original diagram stays available',()=>{
  assert.match(src,/useState<'sales'\|'hotel'>\('sales'\)/)
  assert.match(src,/<BuildingFlow top=\{190\} building="A" data=\{a\}\/>/)
  assert.match(src,/<BuildingFlow top=\{570\} building="B" data=\{b\}\/>/)
  assert.match(src,/>Flow ฝ่ายขาย<\/button>/)
  assert.match(src,/>Flow โรงแรม<\/button>/)
})

test('Hotel Flow is a view of canonical room status and never changes the source query',()=>{
  assert.match(src,/from\('condo_room_status'\)\.select\('room_no,building,customer_status,hotel_participation,status_group,synced_at'\)/)
  assert.match(src,/const hotelRows=useMemo\(\(\)=>rows\.filter\(r=>r\.hotel_participation==='ร่วมโรงแรม'\),\[rows\]\)/)
  assert.match(src,/<HotelFlowDiagram rows=\{hotelRows\} synced=\{displayedSync\}\/>/)
  assert.doesNotMatch(src,/\.from\('condo_room_status'\)\.(insert|update|upsert|delete)\(/)
})

test('Hotel Flow flags non-hotel status classifications instead of inferring completion',()=>{
  assert.match(src,/const HOTEL_STATUS_KEYS=\[GROUP\.checked,GROUP\.awaiting,GROUP\.roomInspection,GROUP\.incomplete\]/)
  assert.match(src,/const review=rows\.length-covered/)
  assert.match(src,/!HOTEL_STATUS_KEYS\.some\(group=>r\.status_group===group\)/)
  assert.match(src,/สถานะไม่ตรงกลุ่ม/)
})

test('Export and search use active Hotel view without altering Sales defaults',()=>{
  assert.match(src,/view==='hotel'\?'hotel-defect-flow-':'handover-defect-flow-'/)
  assert.match(src,/view==='hotel'\?'filter=hotel&':''/)
  assert.match(src,/onClick=\{\(\)=>changeView\('hotel'\)\}/)
})
