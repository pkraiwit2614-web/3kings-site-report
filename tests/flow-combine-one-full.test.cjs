const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

// Minimal loader: exercise the real TypeScript helper, not a duplicated test map.
const cache=new Map()
function load(source){
  const filename=path.join(__dirname,'..',source)
  if(cache.has(filename))return cache.get(filename)
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  }).outputText
  const exports={}
  const module={exports}
  cache.set(filename,exports)
  const localRequire=specifier=>{
    if(specifier==='./hotelRoomGroups')return load('lib/hotelRoomGroups.ts')
    return require(specifier)
  }
  new Function('require','module','exports',code)(localRequire,module,exports)
  return module.exports
}

test('Hotel Engineer list is exactly 16 whole-room Combine pairs',()=>{
  const {HOTEL_ENGINEER_COMBINE_PAIRS,flowCombineKey}=load('lib/flowCombineOne.ts')
  const expected=[
    'A213/A214','A217/A218','A308/A309','A317/A318',
    'A402/A403','A413/A414','A417/A418','A508/A509',
    'A513/A514','A602/A603','A613/A614','A621/A622',
    'A702/A703','A706/A707','B610/B611','B614/B615',
  ]
  assert.deepEqual(HOTEL_ENGINEER_COMBINE_PAIRS.map(pair=>pair.join('/')),expected)
  const physical=HOTEL_ENGINEER_COMBINE_PAIRS.flat()
  assert.equal(new Set(physical).size,32)
  for(const [a,b] of HOTEL_ENGINEER_COMBINE_PAIRS)
    assert.equal(flowCombineKey(a,'ร่วมโรงแรม'),flowCombineKey(b,'ร่วมโรงแรม'))
  // Not on the Engineer's Combine list, although paired by another workflow.
  assert.notEqual(flowCombineKey('A517','ร่วมโรงแรม'),flowCombineKey('A518','ร่วมโรงแรม'))
  assert.notEqual(flowCombineKey('A606','ร่วมโรงแรม'),flowCombineKey('A607','ร่วมโรงแรม'))
})

test('144 physical Hotel rooms become 128 engineer-counted units',()=>{
  const {HOTEL_ENGINEER_COMBINE_PAIRS,flowCombineKey}=load('lib/flowCombineOne.ts')
  const included=HOTEL_ENGINEER_COMBINE_PAIRS.flat()
  // 112 single physical rooms (the remaining Hotel source entries).
  const singles=Array.from({length:112},(_,i)=>'X'+String(i).padStart(3,'0'))
  const count=new Set([...included,...singles].map(room=>flowCombineKey(room,'ร่วมโรงแรม'))).size
  assert.equal(included.length+singles.length,144)
  assert.equal(count,128)
})

test('Non-hotel units retain the existing confirmed Condo Combine mapping',()=>{
  const {flowCombineKey}=load('lib/flowCombineOne.ts')
  assert.equal(flowCombineKey('A221','ไม่ร่วมโรงแรม'),flowCombineKey('A222','ไม่ร่วมโรงแรม'))
  assert.equal(flowCombineKey('B712','ไม่ร่วมโรงแรม'),flowCombineKey('B713','ไม่ร่วมโรงแรม'))
  // The canonical map no longer has a different Combine definition per UI.
  assert.equal(flowCombineKey('A221','ร่วมโรงแรม'),flowCombineKey('A222','ไม่ร่วมโรงแรม'))
})

test('Flow and Report keep full-sector coverage and use the shared grouping',()=>{
  const flow=fs.readFileSync(path.join(__dirname,'../app/defect-flow/page.tsx'),'utf8')
  const report=fs.readFileSync(path.join(__dirname,'../app/defects/page.tsx'),'utf8')
  assert.match(flow,/view==='hotel'\?<HotelFlowDiagram rows=\{hotelRows\}/)
  assert.match(flow,/const flowRows=view==='combine'\?combineRows:rows/)
  assert.match(flow,/const key=row.hotel_participation\+'\|'\+flowCombineKey/)
  assert.match(flow,/combineMode=\{view==='combine'\}/)
  // Search from full Combine Flow must not force a hotel-only Report filter.
  assert.match(flow,/view==='hotel'\?'filter=hotel&':''/)
  assert.doesNotMatch(flow,/view!=='sales'\?'filter=hotel&':''/)
  assert.match(report,/const scopedRows=rows/)
  assert.match(report,/flowCombineKey\(r.room_no,r.hotel_participation\)/)
  assert.doesNotMatch(report,/combineMode\?rows\.filter\(r=>r.hotel_participation==='ร่วมโรงแรม'\)/)
})
