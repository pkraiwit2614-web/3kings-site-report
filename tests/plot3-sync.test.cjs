const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {stripTypeScriptTypes} = require('node:module')
const {createHash} = require('node:crypto')
const source = fs.readFileSync(path.join(__dirname,'../app/api/sync/drive/route.ts'),'utf8')
let sheets = {}
let rpcCalls = []
let bodyReads = 0
const api = new Function('NextResponse','createClient','readSheet','createHash',
  stripTypeScriptTypes(source.replace(/^import .*$/gm,'').replace(/^export /gm,'')) +
  '\nreturn {POST,parseMaterials,parseSchedule,mapProjectFromLocation,mapProjectsFromLocation}')
(
  {json:(data,init)=>({data,status:init?.status||200})},
  ()=>({rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:{ok:true},error:null}}}),
  async(_buffer,sheet)=>{if(!sheets[sheet])throw new Error('Missing sheet');return sheets[sheet]},
  createHash
)
const request = query => ({
  url:'https://example.test/api/sync/drive?'+query,
  headers:{get:()=> 'synthetic-test-key'},
  arrayBuffer:async()=>{bodyReads++;return new Uint8Array([1]).buffer}
})
async function main(){
  for(const value of ['Plot 3','Plot3','plot 3','P3','AV-P3']){
    assert.equal(api.mapProjectFromLocation(value),'AV-P3',value)
  }
  for(const value of ['Plot 30','Plot 31','P30','AV-P30','Plot 3A','Plot 60','Plot 2','Plot 10']){
    assert.equal(api.mapProjectFromLocation(value),null,value)
  }
  for(const n of [6,7,8,9]) assert.equal(api.mapProjectFromLocation('Villa Plot '+n),'AV-P'+n)
  assert.deepEqual(api.mapProjectsFromLocation('Plot 3/6'),['AV-P3','AV-P6'])
  assert.deepEqual(api.mapProjectsFromLocation('Plot 6 / Plot 3'),['AV-P6','AV-P3'])
  assert.deepEqual(api.mapProjectsFromLocation('Plot 6 + Plot 7'),['AV-P6','AV-P7'])
  assert.deepEqual(api.mapProjectsFromLocation('Above Condo A / Above Condo B'),['CONDO-A','CONDO-B'])
  for(const kind of ['materials','schedule']){
    for(const flag of ['true','1','yes']){
      const out=await api.POST(request('kind='+kind+'&project=AV-P3&dryRun='+flag))
      assert.equal(out.status,400);assert.equal(out.data.writes_performed,false)
    }
  }
  assert.equal(bodyReads,0);assert.equal(rpcCalls.length,0)
  for(const name of ['REFERENCE_ONLY_PR_Plot3.xlsx','PR_Plot3_Working_2026-10-07.xlsx']){
    const out=await api.POST(request('kind=materials&sourceFile='+encodeURIComponent(name)))
    assert.equal(out.status,422)
  }
  assert.equal(bodyReads,0);assert.equal(rpcCalls.length,0)
  sheets={'01 รายการทั้งหมด':[['สถานที่/หลัง','รายการวัสดุ/งาน'],['Plot 6 / Plot 3','Shared material']]}
  const ambiguous=await api.POST(request('kind=materials'))
  assert.equal(ambiguous.status,500);assert.match(ambiguous.data.error,/Ambiguous shared Plot 3/)
  assert.equal(rpcCalls.length,0)
  const header=['ID','หมวดหลัก','Task Name ตาม Schedule','พื้นที่/ชั้น','% หน้างานล่าสุด','สถานะหน้างาน','ปัญหา/อุปสรรค','งานถัดไป/แนวทางแก้','วันที่อัปเดต']
  sheets={'ติดตามความคืบหน้าP3':[header,['1','Structure','Synthetic column','F1',0,'Not started','','','08/10/2026']]}
  const schedule=await api.POST(request('kind=schedule&project=AV-P3'))
  assert.equal(schedule.status,200);assert.equal(rpcCalls.length,1)
  assert.equal(rpcCalls[0].name,'drive_sync_apply_schedule')
  assert.equal(rpcCalls[0].args.p_project_code,'AV-P3')
  const first=rpcCalls[0].args.p_rows
  await api.POST(request('kind=schedule&project=AV-P3'))
  assert.deepEqual(rpcCalls[1].args.p_rows,first,'Repeated parse must retain source identity')
  console.log('PASS: Plot aliases/boundaries, P6–9 compatibility, shared procurement, zero-RPC dry-run/reference rejection, ambiguous master guard, schedule routing and stable identity')
}
main().catch(error=>{console.error(error);process.exitCode=1})

