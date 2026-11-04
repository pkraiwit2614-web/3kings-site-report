const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

const src=fs.readFileSync(path.join(__dirname,'../app/defect-flow/page.tsx'),'utf8')
function compiledBetween(first,last){
  const a=src.indexOf(first),b=src.indexOf(last,a+first.length)
  assert.ok(a>=0&&b>a,'Missing original Flow helper boundary: '+first)
  return ts.transpileModule(src.slice(a,b),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
  }}).outputText
}

const GROUP={
  checked:'Hotel - Checked Complete',
  awaiting:'Hotel - Awaiting Check',
  roomInspection:'Hotel - Awaiting Room Inspection',
  incomplete:'Hotel - Incomplete',
  nonHotelIncomplete:'Non-Hotel - Incomplete',
  handover:'Non-Hotel - Handover Complete',
  pending:'Non-Hotel - Pending Handover',
  awaitingSale:'Non-Hotel - Awaiting Sale',
}
const isNewDefect=r=>/^เพิ่งได้รับแจ้ง\s+Defect\b/i.test((r.current_status||'').trim())
const helpers=compiledBetween('function buildingCounts(','function BuildingFlow(')
const {buildingCounts,hotelStatusItems}=new Function(
  'GROUP','isNewDefect','defectHref','awaitingAcceptanceLines',
  helpers+';return {buildingCounts,hotelStatusItems}'
)(GROUP,isNewDefect,()=>'/defects',['Defect เสร็จแล้ว • รอตรวจ'])
const roomPreview=new Function(compiledBetween('function roomPreview(','function SvgStatusCard(')+';return roomPreview')()
const row=(room_no,customer_status,hotel_participation,status_group,current_status='รอตรวจรับ')=>({
  room_no,building:'A',customer_status,hotel_participation,status_group,current_status,synced_at:null
})

test('Yellow and red Hotel branch room lists use the exact rows counted in both Hotel and Full Flow',()=>{
  const rows=[
    row('A501','มีลูกค้า','ร่วมโรงแรม',GROUP.awaiting),
    row('A502','มีลูกค้า','ร่วมโรงแรม',GROUP.incomplete,'เพิ่งได้รับแจ้ง Defect 04/11/2026'),
    row('A503','ไม่มีลูกค้า','ร่วมโรงแรม',GROUP.pending),
    row('A504','ไม่มีลูกค้า','ร่วมโรงแรม',GROUP.incomplete,'เพิ่งได้รับแจ้ง Defect 04/11/2026'),
    row('A505','มีลูกค้า','ร่วมโรงแรม',GROUP.checked),
    row('A506','มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.pending),
  ]
  const counts=buildingCounts(rows,'A')
  const sold=hotelStatusItems(counts,'A',true)
  const unsold=hotelStatusItems(counts,'A',false)
  const card=(items,label)=>items.find(x=>x.label===label)
  assert.deepEqual(card(sold,'Awaiting Acceptance').roomNos,['A501'])
  assert.deepEqual(card(sold,'New Defect').roomNos,['A502'])
  assert.deepEqual(card(unsold,'Awaiting Acceptance').roomNos,['A503'])
  assert.deepEqual(card(unsold,'New Defect').roomNos,['A504'])
  for(const item of [...sold,...unsold].filter(x=>x.tone==='warn'||x.tone==='danger')){
    assert.equal(item.roomNos.length,item.count,'Room labels/count drift: '+item.label)
  }
})

test('Non-Hotel pending and newly-notified lists are derived from the existing customer, hotel, and status dimensions',()=>{
  const data=buildingCounts([
    row('A201','มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.pending),
    row('A327','มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.checked),
    row('A503','มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.nonHotelIncomplete,'เพิ่งได้รับแจ้ง Defect 04/11/2026'),
    row('A620','ไม่มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.nonHotelIncomplete,'เพิ่งได้รับแจ้ง Defect 04/11/2026'),
  ],'A')
  assert.deepEqual(data.roomList('มีลูกค้า','ไม่ร่วมโรงแรม',r=>r.status_group===GROUP.pending||r.status_group===GROUP.checked),['A201','A327'])
  assert.deepEqual(data.roomList('มีลูกค้า','ไม่ร่วมโรงแรม',isNewDefect),['A503'])
  assert.deepEqual(data.roomList('ไม่มีลูกค้า','ไม่ร่วมโรงแรม',isNewDefect),['A620'])
})

test('Combine view lists display every physical room in the pair without changing counting keys',()=>{
  assert.match(src,/display_room:members\.map\(r=>r\.room_no\).*?\.join\('\/'\)/)
  const rows=[
    {...row('A217','ไม่มีลูกค้า','ร่วมโรงแรม',GROUP.awaiting),display_room:'A217/A218'},
    {...row('A513','มีลูกค้า','ร่วมโรงแรม',GROUP.awaiting),display_room:'A513/A514'},
  ]
  const data=buildingCounts(rows,'A')
  assert.deepEqual(data.roomList('ไม่มีลูกค้า','ร่วมโรงแรม',r=>r.status_group===GROUP.awaiting),['A217/A218'])
  assert.deepEqual(data.roomList('มีลูกค้า','ร่วมโรงแรม',r=>r.status_group===GROUP.awaiting),['A513/A514'])
  assert.equal(data.noHotelAwaiting,1)
  assert.equal(data.customerHotelAwaiting,1)
})

test('All four Flow tabs reuse the same yellow/red SVG renderer and preserve PNG font/export and read-only backend',()=>{
  for(const view of ["'sales'","'hotel'","'combine'","'hotel-combine'"])assert.ok(src.includes(view),'view not supported: '+view)
  assert.match(src,/statusRow\(b1\+1,hotelCustomer\)/)
  assert.match(src,/statusRow\(b2\+1,nonHotelCustomer\)/)
  assert.match(src,/statusRow\(b3\+1,hotelNoCustomer\)/)
  assert.match(src,/statusRow\(b4\+1,nonHotelNoCustomer\)/)
  assert.match(src,/statusRow\(stream\.y\+31,hotelStatusItems\(/)
  assert.match(src,/roomNos:data\.roomList\('มีลูกค้า','ไม่ร่วมโรงแรม'/)
  assert.match(src,/roomNos:data\.roomList\('ไม่มีลูกค้า','ไม่ร่วมโรงแรม'/)
  assert.match(src,/<title>\{'เลขห้องทั้งหมด/)
  assert.match(src,/roomPreview\(item\.roomNos!,w\)/)
  assert.match(src,/embedRenderedSvgFonts\(svg,clone\)/)
  assert.match(src,/from\('condo_room_status'\)\.select\('room_no,building,customer_status,hotel_participation,current_status,status_group,synced_at'\)/)
  assert.doesNotMatch(src,/\.from\('condo_room_status'\)\.(insert|update|upsert|delete)\(/)
})

test('Long room lists are abbreviated within fixed-size cards; all identifiers are still available in tooltip',()=>{
  assert.equal(roomPreview([],400),'— ไม่มี —')
  assert.equal(roomPreview(['A201'],400),'ห้อง: A201')
  assert.match(roomPreview(Array.from({length:26},(_,i)=>'A'+(201+i)),393),/\+\d+ ห้อง/)
})
