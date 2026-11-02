'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {isolatedFallback,ORDER}=require('../scripts/sop-runtime-fallback-isolated.cjs');
const target=Object.freeze({scriptId:'SYNTHETIC_PROJECT',functionName:'syntheticFunction',sourceFileId:'SYNTHETIC_SOURCE',deltaKey:'SYNTHETIC_DELTA'});
const base=()=>({mode:'authorized_write',errorCode:'NOT_FOUND',authorized:true,approvalState:'APPROVED',priorRun:'NOT_EXECUTED',target,adapters:{}});
const mk=(fn)=>({available:true,invoke:fn});
test('priority is the original authorized route, never new OAuth/trigger',()=>{
 assert.deepEqual(ORDER,['connected_api','same_project_editor','approved_endpoint']);
});
test('read-only inspection never calls a fallback executor',async()=>{
 let calls=0; const v=base();v.mode='read_only';v.adapters.connected_api=mk(async()=>{calls++;return {status:'EXECUTED'}});
 const r=await isolatedFallback(v);assert.equal(r.status,'READ_ONLY_NO_EXECUTION');assert.equal(calls,0);assert.equal(r.liveProductionPass,false);
});
test('unrelated document-only work cannot invoke GAS fallback',async()=>{
 let calls=0;const v=base();v.mode='document_only';v.adapters.connected_api=mk(async()=>{calls++});
 const r=await isolatedFallback(v);assert.equal(r.status,'BLOCKED_UNSUPPORTED_MODE');assert.equal(calls,0);
});
test('existing connected API is first and requires execution evidence',async()=>{
 const v=base(), calls=[];v.adapters.connected_api=mk(async()=>{calls.push('api');return {status:'EXECUTED',executionId:'SYNTHETIC_EXEC_1',exactTarget:true}});
 v.adapters.same_project_editor=mk(async()=>{calls.push('editor');return {status:'EXECUTED'}});
 const r=await isolatedFallback(v);
 assert.deepEqual(calls,['api']);assert.equal(r.path,'connected_api');assert.equal(r.status,'EXECUTION_EVIDENCE_PENDING_DOWNSTREAM_QA');
 assert.equal(r.liveProductionPass,false);
});
test('NOT_FOUND at connected API selects same-project editor without retrying API',async()=>{
 const v=base(),calls=[];v.adapters.connected_api=mk(async()=>{calls.push('api');return {code:'NOT_FOUND'}});
 v.adapters.same_project_editor=mk(async()=>{calls.push('editor');return {status:'EXECUTED',exactTarget:true,executionId:'SYNTHETIC_EXEC_2'}});
 const r=await isolatedFallback(v);assert.deepEqual(calls,['api','editor']);assert.equal(r.path,'same_project_editor');
});
test('second NOT_FOUND selects existing endpoint, not new deployment',async()=>{
 const v=base(),calls=[];v.adapters.connected_api=mk(async()=>{calls.push('api');return {code:'NOT_FOUND'}});
 v.adapters.same_project_editor=mk(async()=>{calls.push('editor');return {code:'NOT_FOUND'}});
 v.adapters.approved_endpoint=mk(async()=>{calls.push('endpoint');return {status:'EXECUTED',exactTarget:true,executionId:'SYNTHETIC_EXEC_3'}});
 const r=await isolatedFallback(v);assert.deepEqual(calls,['api','editor','endpoint']);assert.equal(r.path,'approved_endpoint');
});
test('existing trigger can only be observed, never called',async()=>{
 const v=base();let invocations=0;
 v.adapters.existing_trigger=mk(async()=>{invocations++;return {status:'EXECUTED'}});
 const r=await isolatedFallback(v);assert.equal(r.status,'WAIT_EXISTING_TRIGGER_OBSERVATION');assert.equal(invocations,0);
});
test('missing authorization/scope or approval never invokes any method',async()=>{
 for(const change of [{authorized:false},{target:{...target,sourceFileId:''}},{approvalState:'HOLD'}]){
  let calls=0;const v={...base(),...change};v.adapters={connected_api:mk(async()=>{calls++;return {status:'EXECUTED'}})};
  const r=await isolatedFallback(v);assert.ok(/^(BLOCKED_|HOLD_)/.test(r.status));assert.equal(calls,0);
 }
});
test('a previous completion or uncertain outcome prevents double import',async()=>{
 for(const [prior,expect] of [['COMPLETE','NO_CHANGE_ALREADY_EXECUTED'],['UNKNOWN','HOLD_AMBIGUOUS_PRIOR_RUN']]){
  let calls=0;const v=base();v.priorRun=prior;v.adapters={connected_api:mk(async()=>{calls++})};
  const r=await isolatedFallback(v);assert.equal(r.status,expect);assert.equal(calls,0);
 }
});
test('provider authorization rejection cannot be bypassed through alternate method',async()=>{
 const v=base();let editor=0;v.adapters.connected_api=mk(async()=>({code:'PERMISSION_DENIED'}));v.adapters.same_project_editor=mk(async()=>{editor++});
 const r=await isolatedFallback(v);assert.equal(r.status,'BLOCKED_PROVIDER_AUTHORIZATION');assert.equal(editor,0);
});
test('other errors are not misclassified as NOT_FOUND',async()=>{
 const v=base();let calls=0;v.errorCode='TIMEOUT';v.adapters.connected_api=mk(async()=>{calls++});
 const r=await isolatedFallback(v);assert.equal(r.status,'NON_NOT_FOUND_ERROR');assert.equal(calls,0);
});
test('missing all methods yields explicit blocked path, never false PASS',async()=>{
 const r=await isolatedFallback(base());assert.equal(r.status,'BLOCKED_EXECUTION_PATH');assert.equal(r.liveProductionPass,false);
});
test('guidance and SOP router preserve live Drive, read-only, and isolated-vs-live distinction',()=>{
 const root=path.resolve(__dirname,'..');const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
 const agents=read('AGENTS.md'),gate=read('.agents/skills/3kings-sop-gate/SKILL.md');
 const sync=read('.agents/skills/3kings-13-sync-check/SKILL.md');
 const rule=read('.agents/rules/antigravity-operational-guidelines.md');
 for(const doc of [agents,gate,rule]) {
  assert.match(doc,/clasp run/);assert.match(doc,/NOT_FOUND/);assert.match(doc,/SOP_RUNTIME_FALLBACK_ISOLATED_PASS/);
 }
 assert.match(gate,/live Drive INDEX/);assert.match(sync,/READ_ONLY|read-only/);
 assert.match(gate,/without installing or double-running|without installing|not installing|without.*double-running/i);
 assert.ok(!agents.includes('with verified effective ACL authorizes'));
});
