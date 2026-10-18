const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const raw=fs.readFileSync('lib/agentReadOnlyChecks.ts','utf8')
const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod={exports:{}}
vm.runInNewContext(code,{module:mod,exports:mod.exports,require:(x)=>{if(x==='./agentSyncEvidence')return {inspectSyncEvidence:async()=>({status:'PARTIAL',checks:[],note:'test stub'})};throw Error('unexpected runtime import '+x)},
  fetch:async()=>{throw Error('no live calls in fixture')},Date,Intl,URL,AbortSignal})
const checks=mod.exports
function client(tables){
 let writes=0
 return {get writes(){return writes},from:(name)=>({
   select(){return this},order(){return this},
   limit(){return Promise.resolve(tables[name]||{data:null,error:{message:'table not found'}})},
   insert(){writes++;throw Error('write forbidden')},
   update(){writes++;throw Error('write forbidden')},
   delete(){writes++;throw Error('write forbidden')}
 })}
}
test('Defect counts are marked PARTIAL and avoid false Flow-vs-Report equality',async()=>{
 const s=client({
  condo_room_status:{data:[{room_no:'A213',building:'A'},{room_no:'A214',building:'A'}],error:null},
  defect_work_order_snapshot:{data:[{work_id:'1',room_group:'A213/A214'},{work_id:'2',room_group:'A213/A214'}],error:null},
  hotel_room_group_members:{data:[{room_no:'A213',group_key:'A213/A214'},{room_no:'A214',group_key:'A213/A214'}],error:null}
 })
 const r=await checks.inspectDefectCounts(s)
 assert.equal(r.status,'PARTIAL')
 assert.equal(r.checks[0].details.physicalRoomRows,2)
 assert.equal(r.checks[1].details.uniqueWorkIds,2)
 assert.equal(r.checks[2].details.distinctGroups,1)
 assert.match(r.note,/not reconciled counts/)
 assert.equal(s.writes,0)
})
test('seven-day inspector flags only source-active older pending rows, never closes',async()=>{
 const s=client({defect_work_order_snapshot:{data:[
  {work_id:'w1',room_group:'A724',received_date:'2026-10-08',work_status:'ยังไม่เริ่ม',source_active:true},
  {work_id:'w2',room_group:'A725',received_date:'2026-10-10',work_status:'ยังไม่เริ่ม',source_active:true},
  {work_id:'w3',room_group:'B314',received_date:'2026-10-01',work_status:'แก้ไขเสร็จแล้ว',source_active:true},
  {work_id:'w4',room_group:'A313',received_date:'2026-10-01',work_status:'ยังไม่เริ่ม',source_active:false}
 ],error:null}})
 const r=await checks.inspectDefectSevenDays(s,new Date('2026-10-17T14:00:00Z'))
 assert.equal(r.status,'PARTIAL')
 assert.equal(r.checks[0].details.bangkokDate,'2026-10-17')
 assert.equal(r.checks[0].details.candidateCount,1)
 assert.equal(r.checks[0].details.candidates[0].workId,'w1')
 assert.match(r.note,/No rooms closed/)
 assert.equal(s.writes,0)
})
test('missing source returns UNVERIFIED not fabricated success',async()=>{
 const s=client({})
 const r=await checks.inspectDefectCounts(s)
 const r2=await checks.inspectDefectSevenDays(s,new Date('2026-10-17T00:00:00Z'))
 assert.equal(r.status,'UNVERIFIED')
 assert.equal(r2.status,'UNVERIFIED')
})
