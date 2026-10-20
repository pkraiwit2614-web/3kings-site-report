'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {gate,evidenceMatches,advanceJob,proposeImprovements}=require('../lib/sopV2Policy.cjs')
const verified={sha:'abc',config:'c1',dependencies:'d1',schema:'s1',environment:'prod',role:'viewer',sourceRevision:'r1'}
test('requires explicit scope, real ACL and source evidence',()=>{
 assert.equal(gate({mode:'authorized_write',explicitScope:true,actualPermission:false,sourceVerified:true}).allowed,false)
 assert.equal(gate({mode:'authorized_write',explicitScope:true,actualPermission:true,sourceVerified:false}).allowed,false)
})
test('read only cannot write or deploy; unsupported mode fails',()=>{
 const p={mode:'read_only',explicitScope:true,actualPermission:true,sourceVerified:true}
 assert.equal(gate({...p,requestedAction:'write'}).reason,'READ_ONLY')
 assert.equal(gate({...p,requestedAction:'deploy'}).reason,'DEPLOY_NOT_AUTHORIZED')
 assert.throws(()=>gate({...p,mode:'root'}),/INVALID_MODE/)
})
test('cannot waive mandatory release checks or critical approval',()=>{
 const p={mode:'deploy',requestedAction:'deploy',explicitScope:true,actualPermission:true,sourceVerified:true}
 assert.equal(gate({...p,requiredChecks:[{status:'SKIPPED'}]}).allowed,false)
 assert.equal(gate({...p,requiredChecks:[{status:'PASS'}],changeImpact:['RLS']}).reason,'CRITICAL_CHANGE_APPROVAL_REQUIRED')
})
test('exact same evidence must match every dimension',()=>{
 assert.equal(evidenceMatches(verified,{...verified}),true)
 assert.equal(evidenceMatches(verified,{...verified,role:'admin'}),false)
 assert.equal(evidenceMatches(verified,{...verified,sha:'different'}),false)
 const g=gate({mode:'code_change',requestedAction:'change_code',explicitScope:true,actualPermission:true,
 sourceVerified:true,qaEvidence:{prior:verified,current:{...verified}}})
 assert.equal(g.qa,'REUSE_EXACT_EVIDENCE')
 assert.equal(g.hostedPreview,false)
 assert.equal(g.requireBranch,true)
})
test('Hosted Preview only for affected code integration',()=>{
 const p={explicitScope:true,actualPermission:true,sourceVerified:true,hostedIntegrationRequired:true,requestedAction:'change_code'}
 assert.equal(gate({...p,mode:'authorized_write',requestedAction:'write'}).hostedPreview,false)
 assert.equal(gate({...p,mode:'code_change'}).hostedPreview,true)
})
test('resumable job never restarts verified step',()=>{
 assert.equal(advanceJob({status:'READY'},'START').status,'RUNNING')
 assert.equal(advanceJob({status:'RUNNING'},'BLOCK').status,'BLOCKED')
 assert.equal(advanceJob({status:'BLOCKED'},'RETRY').status,'READY')
 assert.equal(advanceJob({status:'VERIFIED'},'START').unchanged,true)
})
test('observation proposals require repeat evidence and never self publish',()=>{
 const obs=[{sop:15,category:'QUOTA',evidenceVerified:true},{sop:15,category:'QUOTA',evidenceVerified:true},
  {sop:16,category:'SECURITY',evidenceVerified:true},{sop:16,category:'SECURITY',evidenceVerified:false}]
 const out=proposeImprovements(obs)
 assert.equal(out.length,1)
 assert.equal(out[0].status,'REVIEW_CANDIDATE')
 assert.equal(out[0].allowedToAutoPublish,false)
})

test('unspecified and cross-mode actions are rejected without widening role permissions',()=>{
 const base={explicitScope:true,actualPermission:true,sourceVerified:true}
 for(const mode of ['read_only','document_only','authorized_write','code_change','deploy'])
   assert.equal(gate({...base,mode}).reason,'ACTION_NOT_AUTHORIZED')
 assert.equal(gate({...base,mode:'document_only',requestedAction:'write'}).allowed,false)
 assert.equal(gate({...base,mode:'code_change',requestedAction:'write'}).allowed,false)
 assert.equal(gate({...base,mode:'deploy',requestedAction:'write'}).allowed,false)
 assert.equal(gate({...base,mode:'authorized_write',requestedAction:'change_code'}).allowed,false)
 assert.equal(gate({...base,mode:'document_only',requestedAction:'create_artifact'}).allowed,true)
 assert.equal(gate({...base,mode:'read_only',requestedAction:'read'}).allowed,true)
})
test('critical approval must be a verified boolean true, not a truthy value',()=>{
 const ctx={mode:'code_change',requestedAction:'change_code',explicitScope:true,sourceVerified:true,changeImpact:['RLS']}
 assert.equal(gate({...ctx,actualPermission:{criticalApproval:'false'}}).allowed,false)
 assert.equal(gate({...ctx,actualPermission:{criticalApproval:true}}).allowed,true)
})
