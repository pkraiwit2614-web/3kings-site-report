'use strict';
/**
 * ChatGPT-only operations: deterministic, offline STAGING policy evaluator.
 * Never contacts APIs, calls an executor, writes source, or changes Production.
 * Input snapshots are untrusted until independently verified.
 */
const fs=require('node:fs');
const path=require('node:path');
const {buildReport,inspectGasSnapshot}=require('./central-error-log.cjs');
const ROOT=path.resolve(__dirname,'../..');
const SHA=/^[a-f0-9]{64}$/;
const ACTIONS=new Set(['AUDIT','TRIAGE','PROPOSE_PATCH','RUN_QA']);
const ALLOWED_STATUSES=new Set(['EXACT_MATCH','LINE_ENDINGS_ONLY','CONTENT_DIFF','REMOTE_NOT_FOUND']);
function getManifest(root=ROOT){
 const m=JSON.parse(fs.readFileSync(path.join(root,'docs/ai-operations/gas-source-manifest.json'),'utf8'));
 if(m.version!==1||m.mode!=='staging'||!Array.isArray(m.paths)||m.paths.length!==7||new Set(m.paths).size!==7||m.paths.some(n=>typeof n!=='string'||!n.endsWith('.gs')||n.includes('/')||n.includes('..')))throw Error('INVALID_SOURCE_MANIFEST');
 return m.paths;
}
function assessSource(snapshot,paths){
 if(snapshot==null)return {status:'NO_LIVE_SOURCE_EVIDENCE',matched:0,total:paths.length,verifiedDeployment:false};
 if(snapshot.mode!=='READ_ONLY_GET'||snapshot.codeOrigin!=='GOOGLE_APPS_SCRIPT_API'||snapshot.verification!=='HEAD_OR_EXPLICIT_VERSION_NOT_LIVE_DEPLOYMENT'||snapshot.checked!==paths.length||!Array.isArray(snapshot.results)||snapshot.results.length!==paths.length)throw Error('INVALID_SOURCE_EVIDENCE');
 const byName=new Map();
 for(const r of snapshot.results){
  if(!r||!paths.includes(r.gitFile)||byName.has(r.gitFile)||!ALLOWED_STATUSES.has(r.status))throw Error('INVALID_SOURCE_RESULT');
  if(r.status!=='REMOTE_NOT_FOUND'&&(!SHA.test(r.gitSha256||'')||!SHA.test(r.liveSha256||'')))throw Error('INVALID_SOURCE_HASH');
  if(r.status==='EXACT_MATCH'&&r.gitSha256!==r.liveSha256)throw Error('CONFLICTING_SOURCE_HASH');
  byName.set(r.gitFile,r);
 }
 if(byName.size!==paths.length)throw Error('INCOMPLETE_SOURCE_RESULTS');
 const matched=[...byName.values()].filter(r=>r.status==='EXACT_MATCH').length;
 return {status:matched===paths.length?'HEAD_MATCH_REPORTED_DEPLOYMENT_UNVERIFIED':'SOURCE_MISMATCH_OR_MISSING',matched,total:paths.length,verifiedDeployment:false,source:'SUPPLIED_SNAPSHOT_NOT_ATTESTED'};
}
function assessTriggers(snapshot,now){
 if(snapshot==null)return {status:'NO_LIVE_TRIGGER_EVIDENCE',scope:'UNKNOWN',lastExecution:'UNKNOWN'};
 const result=inspectGasSnapshot(snapshot,now);
 return {status:result.status,scope:result.scope,lastExecution:result.lastExecution,otherOwners:result.otherOwners};
}
function assessSop(evidence,now){
 if(evidence==null)return {status:'UNVERIFIED',writeAuthorized:false};
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))throw Error('INVALID_SOP_EVIDENCE');
 if(evidence.indexStatus!=='ACTIVE'||evidence.sop15Status!=='ACTIVE'||evidence.scope!=='STAGING_BRANCH_ONLY')
  return {status:'BLOCKED',writeAuthorized:false};
 const checked=new Date(evidence.observedAt);
 if(Number.isNaN(+checked)||+checked>+new Date(now)+300000)return {status:'INVALID_TIME',writeAuthorized:false};
 if(+new Date(now)-+checked>86400000)return {status:'STALE',writeAuthorized:false};
 return {status:'STAGING_REVIEW_ONLY',writeAuthorized:false,observedAt:checked.toISOString(),source:'SUPPLIED_SOP_SNAPSHOT_NOT_ATTESTED'};
}
function planOperations(input,{now=new Date(),root=ROOT}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_REQUEST');
 const action=input.action||'TRIAGE';
 if(!ACTIONS.has(action))throw Error('STAGING_ACTION_FORBIDDEN');
 const paths=getManifest(root);
 const source=assessSource(input.sourceComparison,paths);
 const triggers=assessTriggers(input.triggerSnapshot,now);
 const sop=assessSop(input.sopEvidence,now);
 const report=buildReport(input.events||[],now);
 const blocked=report.events.some(e=>e.severity==='CRITICAL');
 const hasFailure=report.events.some(e=>e.state==='FAILED');
 const proposals=report.groups.map(g=>({
  fingerprint:g.fingerprint,source:g.source,errorCode:g.errorCode,severity:g.severity,
  executor:'CHATGPT_ANALYST_ONLY',suggestedSpecialist:g.proposedExecutor,
  nextStep:g.severity==='CRITICAL'?'MANUAL_SECURITY_REVIEW':'INVESTIGATE_EVIDENCE',
  dispatchAllowed:false
 }));
 let patch=null;
 if(action==='PROPOSE_PATCH'){
  const target=input.targetFile;
  if(typeof target!=='string'||!paths.includes(target))throw Error('TARGET_NOT_ALLOWLISTED');
  if(!SHA.test(input.expectedGitSha256||''))throw Error('EXPECTED_SOURCE_HASH_REQUIRED');
  const record=input.sourceComparison?.results?.find(r=>r.gitFile===target);
  if(source.status!=='HEAD_MATCH_REPORTED_DEPLOYMENT_UNVERIFIED'||record?.gitSha256!==input.expectedGitSha256||blocked||!hasFailure||sop.status!=='STAGING_REVIEW_ONLY')
   patch={status:'BLOCKED',reason:blocked?'CRITICAL_EVENT_REQUIRES_REVIEW':source.status!=='HEAD_MATCH_REPORTED_DEPLOYMENT_UNVERIFIED'?'SOURCE_NOT_MATCHED':record?.gitSha256!==input.expectedGitSha256?'SOURCE_HASH_CONFLICT':!hasFailure?'NO_ACTIVE_FAILURE_EVIDENCE':'SOP_NOT_VERIFIED'};
  else patch={status:'PROPOSAL_ONLY',target:'docs/apps-script/'+target,expectedGitSha256:input.expectedGitSha256,sourceStatus:'HEAD_ONLY',approval:'REQUIRED_BEFORE_LIVE_WRITE',allowedChange:'ISOLATED_BRANCH_ONLY',tests:'AFFECTED_TESTS_AND_SECURITY_GATE',codeModificationPerformed:false};
 }
 return {
  schemaVersion:1,mode:'STAGING_ONLY',generatedAt:new Date(now).toISOString(),
  phase1:{source,triggers},phase2:{triage:report,patch},phase3:{
   requestedAction:action,routeStatus:'SIMULATION_ONLY',executor:'CHATGPT_ANALYST_ONLY',
   proposals,autoRepairEnabled:false,dispatchAllowed:false,productionWriteAllowed:false,
   mergeAllowed:false,deployAllowed:false,liveGasWriteAllowed:false,
   sopGate:sop
  },
  caveats:['No authenticated live Apps Script connection is established by supplying a snapshot.',
   'Current-user trigger inventory cannot prove other owners, enabled state, or last execution.',
   'No background monitoring or execution occurs in this staging evaluator.']
 };
}
module.exports={getManifest,assessSource,assessTriggers,assessSop,planOperations};
