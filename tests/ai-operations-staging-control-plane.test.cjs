'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getManifest,assessSource,planOperations}=require('../scripts/ai-operations/staging-control-plane.cjs');
const NOW=new Date('2026-10-29T01:30:00Z');
const paths=getManifest();
const a='a'.repeat(64),b='b'.repeat(64);
const sopEvidence={indexStatus:'ACTIVE',sop15Status:'ACTIVE',scope:'STAGING_BRANCH_ONLY',observedAt:'2026-10-29T01:20:00Z'};
const source=(status='EXACT_MATCH')=>({
 mode:'READ_ONLY_GET',codeOrigin:'GOOGLE_APPS_SCRIPT_API',
 verification:'HEAD_OR_EXPLICIT_VERSION_NOT_LIVE_DEPLOYMENT',checked:7,
 results:paths.map(gitFile=>({gitFile,status,gitSha256:a,liveSha256:status==='EXACT_MATCH'?a:b}))
});
const event=(overrides={})=>({source:'GAS_EXECUTION',component:'DAILY_SITE_REPORT',status:'FAILED',
 code:'GAS_EXECUTION_ERROR',occurredAt:'2026-10-29T01:00:00Z',eventId:'run-1',...overrides});
const run=(input)=>planOperations(input,{now:NOW});
test('no live evidence: staging is read-only and cannot dispatch',()=>{
 const r=run({events:[event()]});
 assert.equal(r.phase1.source.status,'NO_LIVE_SOURCE_EVIDENCE');
 assert.equal(r.phase1.triggers.status,'NO_LIVE_TRIGGER_EVIDENCE');
 assert.equal(r.phase3.dispatchAllowed,false);
 assert.equal(r.phase3.autoRepairEnabled,false);
 assert.equal(r.phase3.deployAllowed,false);
 assert.equal(r.phase3.liveGasWriteAllowed,false);
 assert.equal(r.phase3.proposals[0].executor,'CHATGPT_ANALYST_ONLY');
});
test('reported seven matches are not proof of deployed version',()=>{
 const r=run({sourceComparison:source(),events:[event()]});
 assert.equal(r.phase1.source.status,'HEAD_MATCH_REPORTED_DEPLOYMENT_UNVERIFIED');
 assert.equal(r.phase1.source.verifiedDeployment,false);
 assert.equal(r.phase1.source.source,'SUPPLIED_SNAPSHOT_NOT_ATTESTED');
});
test('source diff blocks patch proposal',()=>{
 const r=run({action:'PROPOSE_PATCH',sourceComparison:source('CONTENT_DIFF'),sopEvidence,targetFile:paths[0],expectedGitSha256:a,events:[event()]});
 assert.equal(r.phase2.patch.status,'BLOCKED');
 assert.equal(r.phase2.patch.reason,'SOURCE_NOT_MATCHED');
});
test('matching HEAD allows proposal only, never write',()=>{
 const r=run({action:'PROPOSE_PATCH',sourceComparison:source(),sopEvidence,targetFile:paths[0],expectedGitSha256:a,events:[event()]});
 assert.equal(r.phase2.patch.status,'PROPOSAL_ONLY');
 assert.equal(r.phase2.patch.codeModificationPerformed,false);
 assert.equal(r.phase3.dispatchAllowed,false);
});
test('reject out of scope and forbidden runtime actions',()=>{
 assert.throws(()=>run({action:'PROPOSE_PATCH',targetFile:'../../secrets.env',events:[event()]}),/TARGET_NOT_ALLOWLISTED/);
 for(const action of ['DEPLOY','EXECUTE','AUTO_REPAIR','MERGE'])assert.throws(()=>run({action}),/STAGING_ACTION_FORBIDDEN/);
});
test('source hash conflicts are rejected',()=>{
 const s=source();s.results[0].liveSha256=b;
 assert.throws(()=>run({sourceComparison:s}),/CONFLICTING_SOURCE_HASH/);
});
test('missing source entries and duplicate paths rejected',()=>{
 const s=source();s.results[1].gitFile=s.results[0].gitFile;
 assert.throws(()=>run({sourceComparison:s}),/INVALID_SOURCE_RESULT/);
});
test('hash mismatch prevents proposal even if snapshot reports matching',()=>{
 const r=run({action:'PROPOSE_PATCH',sourceComparison:source(),sopEvidence,targetFile:paths[0],expectedGitSha256:b,events:[event()]});
 assert.equal(r.phase2.patch.reason,'SOURCE_HASH_CONFLICT');
});
test('critical security event always blocks patch',()=>{
 const r=run({action:'PROPOSE_PATCH',sourceComparison:source(),sopEvidence,targetFile:paths[0],expectedGitSha256:a,events:[event({code:'RLS_PERMISSION_DENIED'})]});
 assert.equal(r.phase2.patch.status,'BLOCKED');
 assert.equal(r.phase2.patch.reason,'CRITICAL_EVENT_REQUIRES_REVIEW');
});
test('recovered-only evidence cannot trigger a patch',()=>{
 const r=run({action:'PROPOSE_PATCH',sourceComparison:source(),sopEvidence,targetFile:paths[0],expectedGitSha256:a,events:[event({status:'RECOVERED'})]});
 assert.equal(r.phase2.patch.status,'BLOCKED');
});
test('no secret from raw event survives triage',()=>{
 const r=run({events:[event({message:'Bearer token-abc 0812345678 user@example.com'})]});
 const output=JSON.stringify(r);
 for(const secret of ['Bearer','token-abc','0812345678','user@example.com'])assert.equal(output.includes(secret),false);
});
test('stale current-user trigger snapshot is not proof of live health',()=>{
 const r=run({triggerSnapshot:{schemaVersion:1,collector:'GAS_CURRENT_USER_TRIGGER_INVENTORY',collectedAt:'2026-10-25T01:00:00Z',triggers:[]}});
 assert.equal(r.phase1.triggers.status,'STALE');
 assert.equal(r.phase1.triggers.lastExecution,'NOT_EXPOSED_BY_SCRIPTAPP');
});
test('malformed trigger snapshot fails closed',()=>{
 assert.throws(()=>run({triggerSnapshot:{schemaVersion:1,collector:'INVALID',triggers:[]}}),/INVALID_GAS_SNAPSHOT/);
});
test('RUN_QA only simulates routing',()=>{
 const r=run({action:'RUN_QA',events:[event()]});
 assert.equal(r.phase3.routeStatus,'SIMULATION_ONLY');
 assert.equal(r.phase3.productionWriteAllowed,false);
});

test('security failure remains blocked after a recovered observation',()=>{
 const r=run({action:'PROPOSE_PATCH',sourceComparison:source(),sopEvidence,targetFile:paths[0],expectedGitSha256:a,
  events:[event({code:'RLS_PERMISSION_DENIED'}),event({status:'RECOVERED',code:'SYNC_SUCCESS',occurredAt:'2026-10-29T01:10:00Z',eventId:'run-2'})]});
 assert.equal(r.phase2.patch.status,'BLOCKED');
 assert.equal(r.phase2.patch.reason,'CRITICAL_EVENT_REQUIRES_REVIEW');
});
test('offline CLI cannot overwrite output or source',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {main}=require('../scripts/ai-operations/staging-control-cli.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiops-staging-'));
 try{
  const input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
  fs.writeFileSync(input,JSON.stringify({action:'TRIAGE',events:[event()]}));
  assert.equal(main(['--input',input,'--output',output]),0);
  assert.equal(JSON.parse(fs.readFileSync(output)).phase3.dispatchAllowed,false);
  assert.throws(()=>main(['--input',input,'--output',output]),/EEXIST/);
  assert.throws(()=>main(['--input',input,'--output',input]),/SOURCE_OVERWRITE_BLOCKED/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('SOP evidence is required for any patch proposal',()=>{
 const r=run({action:'PROPOSE_PATCH',sourceComparison:source(),targetFile:paths[0],expectedGitSha256:a,events:[event()]});
 assert.equal(r.phase2.patch.reason,'SOP_NOT_VERIFIED');
 assert.equal(r.phase3.sopGate.status,'UNVERIFIED');
});
test('stale or non-staging SOP evidence blocks proposal',()=>{
 for(const evidence of [{...sopEvidence,observedAt:'2026-10-26T00:00:00Z'},{...sopEvidence,scope:'PRODUCTION'}]){
  const r=run({action:'PROPOSE_PATCH',sourceComparison:source(),sopEvidence:evidence,targetFile:paths[0],expectedGitSha256:a,events:[event()]});
  assert.equal(r.phase2.patch.status,'BLOCKED');
  assert.notEqual(r.phase3.sopGate.status,'STAGING_REVIEW_ONLY');
 }
});
