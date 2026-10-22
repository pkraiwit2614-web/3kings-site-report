'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const text=fs.readFileSync(path.join(__dirname,'../docs/apps-script/ExpressBridgeMasterImporter_2026-10-22.gs'),'utf8')
const logs=[],ctx=vm.createContext({console:{log:x=>logs.push(x)},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}})
vm.runInContext(text,ctx)
test('owner disabled by default: cannot even read original or write without release gate',()=>{
 assert.throws(()=>ctx.expressBridgeMasterImportOnce20261022(),/OWNER_RELEASE_GATE_NOT_ENABLED/)
 assert.match(text,/EXPRESS_BRIDGE_MASTER_WRITE_APPROVED/)
 assert.doesNotMatch(text,/ScriptApp\.newTrigger|ScriptApp\.deleteTrigger|\.supabase\.co|\/rest\/v1\//)
})
test('dry run supplies bounded counts and performs zero mutations',()=>{
 vm.runInContext(`EB_masterMakePayload_=()=>({status:'DELTA_READY',first:true,documents:3706,lines:13114,sourceReview:70,unassigned:3203,skippedCanceled:68,originalHash:'a'.repeat(64),sources:[1,2,3,4,5,6],candidate:{getBytes:()=>[1,2,3]}})`,ctx)
 const r=ctx.expressBridgeMasterImportDryRun20261022()
 assert.equal(r.status,'MASTER_IMPORT_PREFLIGHT_PASS')
 assert.equal(r.documents,3706)
 assert.equal(r.lines,13114)
 assert.equal(r.mutationOriginal,0)
 assert.equal(r.mutationSupabase,0)
})
test('write path checks Drive ID and hashes, with conditional rollback',()=>{
 for(const marker of ['MASTER_BASE_REVISION_HOLD','MASTER_CHANGED_PRE_COMMIT','MASTER_REGISTER_READBACK_HOLD','SOURCE_DATA_LOSS_HOLD','MASTER_READBACK_FAILED_ROLLED_BACK','QA_REGISTRY_SOURCE_MISMATCH_HOLD'])
  assert.ok(text.includes(marker),marker)
 assert.match(text,/UrlFetchApp\.fetch\('https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\//)
 assert.match(text,/payload:state\.candidate\.getBytes\(\)/)
 assert.match(text,/mutationSupabase:0/)
})
