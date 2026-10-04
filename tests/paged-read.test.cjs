const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const ts=require('typescript')
const {createRequire}=require('node:module')

function loadTs(file){
  const filename=path.resolve(file)
  const module={exports:{}}
  const realRequire=createRequire(filename)
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  vm.runInNewContext(code,{module,exports:module.exports,require:realRequire,AbortSignal,Error,Set,Number,Promise},{filename})
  return module.exports
}

const {readAllPages,requireCompletePagedReads}=loadTs('lib/pagedRead.ts')

function fakePagedSource(rows,{serverCap=250,permissionError=false,countShiftAtPage=0}={}){
  let calls=0
  return async(from,to)=>{
    calls++
    if(permissionError)return {data:null,error:{code:'42501',message:'permission denied'},count:null}
    const requested=Math.max(0,to-from+1)
    const take=Math.min(requested,serverCap)
    const count=countShiftAtPage&&calls>=countShiftAtPage?rows.length+1:rows.length
    return {data:rows.slice(from,from+take),error:null,count}
  }
}

test('loads >1,500 rows completely even when server silently caps each page below requested size',async()=>{
  const rows=Array.from({length:1607},(_,i)=>({id:`e-${i}`,work_date:i===1606?'2026-09-04':'2026-10-03'}))
  const result=await readAllPages({label:'site_operations_entries',pageSize:500,fetchPage:fakePagedSource(rows,{serverCap:173}),keyOf:r=>r.id})
  requireCompletePagedReads([result])
  assert.equal(result.count,1607)
  assert.equal(result.loaded,1607)
  assert.equal(result.truncated,false)
  assert.equal(result.data.at(-1).id,'e-1606')
  assert.equal(result.data.at(-1).work_date,'2026-09-04')
})

test('loads several thousand assignments including the tail row without gaps',async()=>{
  const rows=Array.from({length:5003},(_,i)=>({id:`a-${i}`,batch_id:`b-${Math.floor(i/10)}`,work_date:i<3?'2026-09-04':'2026-10-03'}))
  const result=await readAllPages({label:'labour_daily_assignments',pageSize:500,fetchPage:fakePagedSource(rows,{serverCap:211}),keyOf:r=>r.id})
  requireCompletePagedReads([result])
  assert.equal(result.loaded,5003)
  assert.equal(result.data[0].work_date,'2026-09-04')
  assert.equal(result.data.at(-1).id,'a-5002')
})

test('distinguishes a genuine empty result from a permission/error result',async()=>{
  const empty=await readAllPages({label:'empty',fetchPage:fakePagedSource([])})
  assert.deepEqual({count:empty.count,loaded:empty.loaded,truncated:empty.truncated},{count:0,loaded:0,truncated:false})
  await assert.rejects(()=>readAllPages({label:'forbidden',fetchPage:fakePagedSource([], {permissionError:true})}),error=>error&&error.code==='42501')
})

test('does not silently accept a changing result set while paging',async()=>{
  const rows=Array.from({length:1601},(_,i)=>({id:`r-${i}`}))
  await assert.rejects(()=>readAllPages({label:'moving',pageSize:500,fetchPage:fakePagedSource(rows,{serverCap:200,countShiftAtPage:3}),keyOf:r=>r.id}),/PAGED_READ_COUNT_CHANGED/)
})

test('reports truncation if the server stops early before exact count is reached',async()=>{
  const rows=Array.from({length:1601},(_,i)=>({id:`r-${i}`}))
  let calls=0
  const result=await readAllPages({label:'truncated',pageSize:500,keyOf:r=>r.id,fetchPage:async(from,to)=>{
    calls++
    if(calls===4)return {data:[],error:null,count:rows.length}
    return {data:rows.slice(from,Math.min(from+250,to+1)),error:null,count:rows.length}
  }})
  assert.equal(result.truncated,true)
  assert.throws(()=>requireCompletePagedReads([result]),/PAGED_READ_TRUNCATED/)
})
