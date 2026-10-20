'use strict'

// SOP v2 policy core. Pure functions: no credentials, connectors, IO or side effects.
// This does NOT install an unattended executor, write gate or self-modifying agent.
const MODES=new Set(['read_only','document_only','authorized_write','code_change','deploy'])
const CHECKS=['sha','config','dependencies','schema','environment','role','sourceRevision']
const RISK={read_only:0,document_only:1,authorized_write:2,code_change:3,deploy:4}
const STATES=new Set(['READY','RUNNING','BLOCKED','FAILED','VERIFIED'])

function assertMode(mode){if(!MODES.has(mode))throw new Error('INVALID_MODE')}
function evidenceMatches(prior,current){
 if(!prior||!current)return false
 return CHECKS.every(k=>typeof prior[k]==='string'&&prior[k].length>0&&prior[k]===current[k])
}
function gate({mode,requestedAction,explicitScope,actualPermission,sourceVerified,changeImpact,requiredChecks,qaEvidence,hostedIntegrationRequired}={}){
 assertMode(mode)
 if(!explicitScope || !actualPermission || !sourceVerified)
   return {allowed:false,reason:'SCOPE_ACL_OR_SOURCE_UNVERIFIED',qa:'NOT_RUN'}
 if(requestedAction==='deploy'&&mode!=='deploy')return {allowed:false,reason:'DEPLOY_NOT_AUTHORIZED',qa:'NOT_RUN'}
 if(requestedAction==='write'&&mode==='read_only')return {allowed:false,reason:'READ_ONLY',qa:'NOT_RUN'}
 if(requestedAction==='change_code'&&!['code_change','deploy'].includes(mode))return {allowed:false,reason:'CODE_NOT_AUTHORIZED',qa:'NOT_RUN'}
 if(['RBAC','RLS','PAYROLL','SCHEMA','SECRET'].some(x=>Array.isArray(changeImpact)&&changeImpact.includes(x))&&
     !actualPermission.criticalApproval)
   return {allowed:false,reason:'CRITICAL_CHANGE_APPROVAL_REQUIRED',qa:'NOT_RUN'}
 const checks=Array.isArray(requiredChecks)?requiredChecks:[]
 if(mode==='deploy'&&checks.some(c=>c.status!=='PASS'))
   return {allowed:false,reason:'REQUIRED_CHECK_NOT_PASS',qa:'FAIL'}
 const reuse=qaEvidence&&evidenceMatches(qaEvidence.prior,qaEvidence.current)
 const risk=RISK[mode]
 return {allowed:true,reason:'SCOPED_AUTHORIZATION',risk,qa:reuse?'REUSE_EXACT_EVIDENCE':'RUN_AFFECTED_QA',
  requireBranch:risk>=3,hostedPreview:risk>=3&&Boolean(hostedIntegrationRequired),
  requireProductionReadback:mode==='deploy'}
}
function advanceJob(job,event){
 if(!job||!STATES.has(job.status))throw new Error('INVALID_JOB')
 if(!['START','CONFIRM','BLOCK','FAIL','RETRY'].includes(event))throw new Error('INVALID_EVENT')
 if(job.status==='VERIFIED')return {...job,unchanged:true}
 const valid={READY:{START:'RUNNING',BLOCK:'BLOCKED'},RUNNING:{CONFIRM:'VERIFIED',BLOCK:'BLOCKED',FAIL:'FAILED'},
  BLOCKED:{RETRY:'READY'},FAILED:{RETRY:'READY'}}
 if(!valid[job.status]?.[event])return {...job,unchanged:true}
 return {...job,status:valid[job.status][event],unchanged:false}
}
function proposeImprovements(observations){
 if(!Array.isArray(observations))throw new Error('INVALID_OBSERVATIONS')
 const groups=new Map()
 for(const item of observations){
  if(!item||!Number.isInteger(item.sop)||item.sop<1||item.sop>21||
     !['WORDING','MAPPING','EXECUTOR','SOURCE','QUOTA','SECURITY'].includes(item.category)||!item.evidenceVerified)continue
  const key=item.sop+':'+item.category
  groups.set(key,(groups.get(key)||0)+1)
 }
 return [...groups].filter(([,count])=>count>=2).map(([id,count])=>({
  id,count,status:'REVIEW_CANDIDATE',allowedToAutoPublish:false,
  why:'Repeated verified class; no changes to live SOP, data or deployment'}))
}
module.exports={gate,evidenceMatches,advanceJob,proposeImprovements}
