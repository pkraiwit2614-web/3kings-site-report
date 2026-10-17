const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

const src=fs.readFileSync(path.join(__dirname,'../app/defect-flow/page.tsx'),'utf8')
const groupSource=fs.readFileSync(path.join(__dirname,'../lib/hotelRoomGroups.ts'),'utf8')
const helperSource=fs.readFileSync(path.join(__dirname,'../lib/flowCombineOne.ts'),'utf8')
function load(tsSource,requireLocal=()=>{throw Error('Unexpected import')}){
  const output=ts.transpileModule(tsSource,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
  }}).outputText
  const module={exports:{}}
  new Function('require','module','exports',output)(requireLocal,module,module.exports)
  return module.exports
}
const groups=load(groupSource)
const helper=load(helperSource,id=>{
  if(id==='./hotelRoomGroups')return groups
  throw Error('Unexpected import: '+id)
})

test('Hotel Combine=1 is a fourth opt-in tab and preserves existing defaults',()=>{
  assert.match(src,/useState<'sales'\\|'hotel'\\|'combine'\\|'hotel-combine'>\\('sales'\\)/)
  assert.ok(src.includes("target==='hotel-combine'"))
  assert.ok(src.includes("changeView('hotel-combine')}>Flow โรงแรม Combine = 1"))
  assert.ok(src.includes("view==='hotel'?<HotelFlowDiagram rows={hotelRows} synced={displayedSync}/>"))
  assert.ok(src.includes("view==='hotel-combine'?<HotelFlowDiagram rows={hotelCombineRows} synced={displayedSync} combineMode/>"))
  assert.ok(src.includes("const flowRows=view==='combine'?combineRows:rows"))
})

test('Hotel Combine=1 reuses full Combine calculation, scoped to participating hotel rooms',()=>{
  assert.ok(src.includes("const key=row.hotel_participation+'|'+flowCombineKey(row.room_no,row.hotel_participation)"))
  assert.ok(src.includes("const hotelCombineRows=useMemo(()=>combineRows.filter(r=>r.hotel_participation==='ร่วมโรงแรม'),[combineRows])"))
  const hotelPhysical=['A213','A214','B610','B611','A219']
  const hotelUnits=new Set(hotelPhysical.map(room=>'ร่วมโรงแรม|'+helper.flowCombineKey(room,'ร่วมโรงแรม')))
  assert.equal(hotelPhysical.length,5)
  assert.equal(hotelUnits.size,3)
  assert.equal(helper.flowCombineKey('A213','ร่วมโรงแรม'),helper.flowCombineKey('A214','ร่วมโรงแรม'))
  assert.notEqual(helper.flowCombineKey('A213','ร่วมโรงแรม'),helper.flowCombineKey('A219','ร่วมโรงแรม'))
  assert.ok(src.includes("status_group:statusConflict?null:first.status_group"))
  assert.ok(src.includes("customer_status:customerConflict?'รอตรวจสอบ':first.customer_status"))
})

test('Hotel-only grouping deep-links to grouped Report and preserves role/source constraints',()=>{
  assert.ok(src.includes("(view==='hotel'||view==='hotel-combine'?'filter=hotel&':'')"))
  assert.ok(src.includes("(view==='combine'||view==='hotel-combine'?'combine=1&':'')"))
  assert.ok(src.includes("+'combine=1#report-results'"))
  assert.ok(src.includes("filter:view==='hotel-combine'?'hotel':undefined"))
  assert.ok(src.includes("view==='hotel-combine'?'hotel-combine-one-flow-'"))
  assert.ok(src.includes("formula={'ร่วมโรงแรม '+stream.list.length+(combineMode?' ชุดห้อง':' ห้อง')}"))
  assert.ok(src.includes("view==='hotel-combine'?hotelCombineWarnings:[]"))
  assert.ok(src.includes("select('room_no,building,customer_status,hotel_participation,status_group,synced_at')"))
  assert.doesNotMatch(src,/\\.from\\('condo_room_status'\\)\\.(?:insert|update|upsert|delete)\\(/)
})
