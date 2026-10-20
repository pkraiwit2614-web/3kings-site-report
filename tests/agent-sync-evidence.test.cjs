const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const raw=fs.readFileSync('lib/agentSyncEvidence.ts','utf8')
const js=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const moduleShim={exports:{}}
vm.runInNewContext(js,{exports:moduleShim.exports,module:moduleShim,require:(name)=>{throw Error('unexpected runtime import '+name)},Date})
const inspector=moduleShim.exports

function fakeClient(fixtures){
 const calls=[]
 const writes=[]
 return {calls,writes,from(table){
  const query={table,filter:null,orderCol:null}
  return{
   select(columns){query.columns=columns;return this},
   eq(column,value){query.filter={column,value};return this},
   order(column){query.orderCol=column;return this},
   async limit(n){
    calls.push({...query,limit:n})
    const source=fixtures[table]
    if(source===undefined)return{data:null,error:{code:'TEST_DENIED'}}
    let data=source
    if(query.filter)data=data.filter(x=>x[query.filter.column]===query.filter.value)
    if(query.orderCol)data=[...data].sort((a,b)=>String(b[query.orderCol]||'').localeCompare(String(a[query.orderCol]||'')))
    return{data:data.slice(0,n),error:null}
   },
   insert(){writes.push('insert');throw Error('write forbidden')},
   update(){writes.push('update');throw Error('write forbidden')},
   delete(){writes.push('delete');throw Error('write forbidden')},
   upsert(){writes.push('upsert');throw Error('write forbidden')}
  }
 }}
}
const clock=new Date('2026-10-19T00:00:00Z')
test('read-only inspector samples each actual pipeline separately and never claims all-stages pass',async()=>{
 const client=fakeClient({
  drive_sync_runs:[
   {sync_type:'schedule',created_at:'2026-10-18T12:00:00Z',status:'success',rows_read:0,rows_written:0},
   {sync_type:'schedule',created_at:'2026-10-18T11:00:00Z',status:'success',rows_read:0,rows_written:0},
   {sync_type:'materials',created_at:'2026-10-17T12:00:00Z',status:'success',rows_read:50,rows_written:1},
   {sync_type:'materials',created_at:'2026-10-17T11:00:00Z',status:'error',rows_read:0,rows_written:0},
   {sync_type:'defects',created_at:'2026-10-16T12:00:00Z',status:'success',rows_read:263,rows_written:0}
  ],
  site_operations_entries:[{synced_at:'2026-10-18T11:00:00Z'}],
  materials:[{updated_at:'2026-10-18T09:00:00Z'}],
  procurement_items:[{updated_at:'2026-10-17T09:00:00Z'}],
  condo_room_status:[{synced_at:'2026-10-17T07:00:00Z'}],
  defect_work_order_snapshot:[{imported_at:'2026-10-16T08:00:00Z'}],
 })
 const r=await inspector.inspectSyncEvidence(client,clock)
 assert.equal(r.status,'PARTIAL')
 const m=r.checks.find(x=>x.name==='sync_log_materials')
 assert.equal(m.status,'READ_OK')
 assert.equal(m.details.failureCount,1)
 assert.equal(m.details.rowsWritten,1)
 const schedule=r.checks.find(x=>x.name==='sync_log_schedule')
 assert.equal(schedule.details.zeroWritesProvesNoChange,false)
 assert.equal(r.checks.find(x=>x.name==='sync_log_photos').status,'NO_LOG_ROWS')
 assert.equal(r.checks.find(x=>x.name==='db_snapshot_site_operations_entries').status,'DB_TIMESTAMP_ONLY')
 for(const stage of ['drive_source_file_metadata','apps_script_trigger_and_execution',
   'source_vs_parsed_vs_written_vs_verified','authenticated_web_ui_readback'])
   assert.equal(r.checks.find(x=>x.name===stage).status,'NOT_VERIFIED')
 assert.equal(client.calls.length,9)
 assert.equal(client.writes.length,0)
})
test('denied Supabase access reports UNVERIFIED, never PASS',async()=>{
 const c=fakeClient({})
 const r=await inspector.inspectSyncEvidence(c,clock)
 assert.equal(r.status,'UNVERIFIED')
 assert.ok(r.checks.some(c=>c.status==='READ_FAILED'))
 assert.equal(c.writes.length,0)
})
test('read-only route still delegates Sync inspector and adds no mutator',()=>{
 const route=fs.readFileSync('app/api/agent/read-only/route.ts','utf8')
 const checks=fs.readFileSync('lib/agentReadOnlyChecks.ts','utf8')
 assert.ok(route.includes('inspectSync(client)'))
 assert.ok(checks.includes('return inspectSyncEvidence(client)'))
 const source=raw+checks
 assert.equal(/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(/.test(source),false)
})
test('Owner access probe guards production without running Agent or exposing credentials',()=>{
 const route=fs.readFileSync('app/api/agent/access-check/route.ts','utf8')
 const page=fs.readFileSync('app/data-health/agent-security-qa/page.tsx','utf8')
 for(const marker of ['getUser(jwt)','OWNER_USER_ID','profile?.active','readPermissionSnapshot',
   'FORBIDDEN_MATRIX','UNAUTHORIZED','FORBIDDEN','OWNER_AUTHORIZATION_VERIFIED'])
  assert.ok(route.includes(marker),marker)
 assert.ok(route.indexOf("if(!jwt)")<route.indexOf('getUser(jwt)'))
 assert.ok(route.includes("process.env.AGENT_PRODUCTION_ENABLED==='true'"))
 assert.ok(page.includes("'/api/agent/access-check'"))
 assert.ok(page.includes("actualRole!=='owner'"))
 assert.ok(page.includes("const noAuth=await fetch(url"))
 assert.equal(/createLiveSopSource|exchangeVercelOidcToken|generateAccessToken|\.insert\(|\.update\(|\.delete\(/.test(route),false)
})

test('Viewer-accessible read-only security QA invokes only same-origin agent access endpoint',()=>{
 const qa=fs.readFileSync('app/agent-access-qa/page.tsx','utf8')
 assert.ok(qa.includes("'/api/agent/access-check'"))
 assert.ok(qa.includes('getSupabase().auth.getSession()'))
 assert.ok(qa.includes('FORBIDDEN')===false)
 assert.equal(/createLiveSopSource|console\.log|\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(qa),false)
})


test('latest failed Materials import is surfaced as reconciliation-required, not a success',async()=>{
 const client=fakeClient({
   drive_sync_runs:[{sync_type:'materials',status:'error',created_at:'2026-10-19T10:19:37Z',
      message:'materials: 2 unmatched existing records; no writes/deletes',rows_read:0,rows_written:0}],
 })
 const r=await inspector.inspectSyncEvidence(client,new Date('2026-10-19T11:00:00Z'))
 const c=r.checks.find(x=>x.name==='sync_log_materials')
 assert.equal(c.status,'SOURCE_RECONCILIATION_REQUIRED')
 assert.equal(c.details.latestFailed,true)
 assert.equal(c.details.latestDiagnosticCategory,'UNMATCHED_MATERIALS')
 assert.equal(r.status,'UNVERIFIED') // failed latest log without DB/source readback is unverified
 assert.equal(client.writes.length,0)
})
test('other failed latest run is flagged; historical success cannot mask latest error',async()=>{
 const client=fakeClient({drive_sync_runs:[
  {sync_type:'defects',status:'error',created_at:'2026-10-19T12:00:00Z',message:'source_parse_failed'},
  {sync_type:'defects',status:'success',created_at:'2026-10-19T11:00:00Z'}
 ]})
 const result=await inspector.inspectSyncEvidence(client,new Date('2026-10-19T13:00:00Z'))
 assert.equal(result.checks.find(x=>x.name==='sync_log_defects').status,'LATEST_RUN_FAILED')
})
test('full proof requires independent authenticated source, parser, DB and UI fingerprints',()=>{
 const sha='a'.repeat(64)
 const stage={fileId:'source-id',revision:'rev-3',rowCount:263,rowsetSha256:sha}
 const proof={source:stage,parser:stage,database:stage,web:{...stage,authenticated:true}}
 assert.equal(inspector.verifyCompleteSyncProof(proof).status,'PASS')
 assert.equal(inspector.verifyCompleteSyncProof({...proof,web:{...stage,authenticated:false}}).status,'UNVERIFIED')
 assert.equal(inspector.verifyCompleteSyncProof({...proof,web:undefined}).status,'UNVERIFIED')
 assert.equal(inspector.verifyCompleteSyncProof({...proof,database:{...stage,rowsetSha256:'b'.repeat(64)}}).status,'FAIL')
 assert.equal(inspector.verifyCompleteSyncProof({...proof,parser:{...stage,rowCount:262}}).status,'FAIL')
})
test('SOP 13 inspector does not manufacture complete Sync evidence from logs',async()=>{
 const fixture=fakeClient({drive_sync_runs:[{sync_type:'materials',status:'success',created_at:'2026-10-19T12:00:00Z',rows_read:263,rows_written:263}]})
 const r=await inspector.inspectSyncEvidence(fixture,clock)
 assert.notEqual(r.status,'PASS')
 assert.equal(r.checks.find(x=>x.name==='authenticated_web_ui_readback').status,'NOT_VERIFIED')
})
