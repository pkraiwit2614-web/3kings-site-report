const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')
const file=fs.readFileSync('lib/agentGoogleDrive.ts','utf8')
const compiled=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const saved={...process.env}
const config={
  VERCEL_ENV:'preview',
  AGENT_GCP_PROJECT_NUMBER:'123456789012',AGENT_GCP_POOL_ID:'test-vercel-sop',
  AGENT_GCP_PROVIDER_ID:'test-preview',AGENT_GCP_SERVICE_ACCOUNT_EMAIL:'reader@test-project.iam.gserviceaccount.com',
  AGENT_OIDC_EXPECTED_ISSUER:'https://oidc.vercel.com/test-team',
  AGENT_OIDC_EXPECTED_AUDIENCE:'https://vercel.com/test-team',
  AGENT_OIDC_EXPECTED_SUBJECT:'owner:test-team:project:3kings-site-report:environment:preview',
}
const encode=(a)=>Buffer.from(JSON.stringify(a)).toString('base64url')
function token(overrides={}){
 const claims={iss:config.AGENT_OIDC_EXPECTED_ISSUER,aud:config.AGENT_OIDC_EXPECTED_AUDIENCE,
   sub:config.AGENT_OIDC_EXPECTED_SUBJECT,environment:'preview',nbf:Math.floor(Date.now()/1000)-10,
   exp:Math.floor(Date.now()/1000)+1800,...overrides}
 return 'header.'+encode(claims)+'.signature'
}
const response=(payload)=>({ok:true,json:async()=>payload})
function setup(fetchMock){
 const mod={exports:{}}
 vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:(path)=>{
   if(path==='./agentCore')return {
     AgentGateError:class AgentGateError extends Error{constructor(code){super(code);this.code=code}},
     sopIdFromUrl:u=>new URL(u).pathname.split('/')[3]
   }
   throw Error('unexpected import '+path)
 },process,Buffer,Date,URL,URLSearchParams,AbortSignal,fetch:fetchMock})
 return mod.exports
}
test('preview token exchanges at Google STS then impersonates Reader only',async()=>{
 Object.assign(process.env,config)
 const requests=[]
 const m=setup(async(url,init)=>{
  requests.push({url,init})
  if(url==='https://sts.googleapis.com/v1/token')return response({access_token:'sts-short-lived'})
  if(url.includes('iamcredentials.googleapis.com'))return response({accessToken:'google-readonly'})
  throw Error('unexpected host '+url)
 })
 assert.equal(await m.exchangePreviewOidcToken(token()),'google-readonly')
 assert.equal(requests.length,2)
 assert.equal(new URLSearchParams(requests[0].init.body).get('subject_token_type'),
   'urn:ietf:params:oauth:token-type:jwt')
 assert.equal(new URLSearchParams(requests[0].init.body).get('audience'),
   '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/test-vercel-sop/providers/test-preview')
 assert.ok(requests[1].url.includes('reader%40test-project.iam.gserviceaccount.com'))
 assert.deepEqual(Array.from(JSON.parse(requests[1].init.body).scope),[
    'https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/spreadsheets.readonly'])
})
test('production or wrong-issuer tokens fail before any network request',async()=>{
 Object.assign(process.env,config)
 let calls=0
 const m=setup(async()=>{calls++;throw Error('network must not be called')})
 for(const input of [
   token({sub:'owner:test-team:project:3kings-site-report:environment:production',environment:'production'}),
   token({iss:'https://oidc.vercel.com/attacker'}),
   token({aud:'https://vercel.com/attacker'}),
   token({exp:Math.floor(Date.now()/1000)-1}),
   'malformed',
   ''
 ])await assert.rejects(m.exchangePreviewOidcToken(input),/BLOCK_OIDC_ENVIRONMENT_CLAIMS/)
 assert.equal(calls,0)
 process.env.VERCEL_ENV='production'
 await assert.rejects(m.exchangePreviewOidcToken(token()),/BLOCK_PRODUCTION_DISABLED/)
 assert.equal(calls,0)
})
test('provider impersonation denial blocks and does not fall back to JSON key',async()=>{
 Object.assign(process.env,config)
 process.env.AGENT_GOOGLE_SERVICE_ACCOUNT_JSON='unsafe-unused-json-key'
 const m=setup(async(url)=>{
   if(url==='https://sts.googleapis.com/v1/token')return response({access_token:'federated'})
   return {ok:false,status:403}
 })
 await assert.rejects(m.exchangePreviewOidcToken(token()),/BLOCK_SOP_SOURCE_UNAVAILABLE/)
 assert.equal(file.includes('AGENT_GOOGLE_SERVICE_ACCOUNT_JSON'),false)
 assert.equal(file.includes('private_key'),false)
 delete process.env.AGENT_GOOGLE_SERVICE_ACCOUNT_JSON
})
test('existing route reads runtime Vercel function header after owner RBAC',()=>{
 const route=fs.readFileSync('app/api/agent/read-only/route.ts','utf8')
 assert.ok(route.indexOf('readPermissionSnapshot')<route.indexOf("request.headers.get('x-vercel-oidc-token')"))
 assert.ok(route.includes("request.headers.get('x-vercel-oidc-token')"))
})

test('production remains disabled even when preview and production config values are present',async()=>{
 Object.assign(process.env,config,{
  VERCEL_ENV:'production',
  AGENT_PRODUCTION_GCP_PROJECT_NUMBER:'123456789012',
  AGENT_PRODUCTION_GCP_POOL_ID:'test-vercel-sop',
  AGENT_PRODUCTION_GCP_PROVIDER_ID:'test-production',
  AGENT_PRODUCTION_GCP_SERVICE_ACCOUNT_EMAIL:'reader@test-project.iam.gserviceaccount.com',
  AGENT_PRODUCTION_OIDC_EXPECTED_ISSUER:'https://oidc.vercel.com/test-team',
  AGENT_PRODUCTION_OIDC_EXPECTED_AUDIENCE:'https://vercel.com/test-team',
  AGENT_PRODUCTION_OIDC_EXPECTED_SUBJECT:'owner:test-team:project:3kings-site-report:environment:production',
  AGENT_PRODUCTION_OIDC_EXPECTED_PROJECT_ID:'prj_123ABC',
  AGENT_PRODUCTION_OIDC_EXPECTED_OWNER_ID:'team_123ABC',
 })
 delete process.env.AGENT_PRODUCTION_ENABLED
 let calls=0
 const m=setup(async()=>{calls++;throw Error('network unavailable')})
 await assert.rejects(m.exchangeVercelOidcToken(token()),/BLOCK_PRODUCTION_DISABLED/)
 assert.equal(calls,0)
})
test('production requires separate provider, exact production claims and IAM identity',async()=>{
 Object.assign(process.env,config,{
  VERCEL_ENV:'production',
  AGENT_PRODUCTION_ENABLED:'true',
  AGENT_PRODUCTION_GCP_PROJECT_NUMBER:'123456789012',
  AGENT_PRODUCTION_GCP_POOL_ID:'test-vercel-sop',
  AGENT_PRODUCTION_GCP_PROVIDER_ID:'test-production',
  AGENT_PRODUCTION_GCP_SERVICE_ACCOUNT_EMAIL:'reader@test-project.iam.gserviceaccount.com',
  AGENT_PRODUCTION_OIDC_EXPECTED_ISSUER:'https://oidc.vercel.com/test-team',
  AGENT_PRODUCTION_OIDC_EXPECTED_AUDIENCE:'https://vercel.com/test-team',
  AGENT_PRODUCTION_OIDC_EXPECTED_SUBJECT:'owner:test-team:project:3kings-site-report:environment:production',
  AGENT_PRODUCTION_OIDC_EXPECTED_PROJECT_ID:'prj_123ABC',
  AGENT_PRODUCTION_OIDC_EXPECTED_OWNER_ID:'team_123ABC',
 })
 let calls=0
 const m=setup(async(url)=>{
   calls++
   if(url==='https://sts.googleapis.com/v1/token')return response({access_token:'sts-production'})
   if(url.includes('iamcredentials.googleapis.com'))return response({accessToken:'drive-token'})
   throw Error('unexpected '+url)
 })
 const prodToken=token({
   sub:'owner:test-team:project:3kings-site-report:environment:production',
   environment:'production',project_id:'prj_123ABC',owner_id:'team_123ABC'
 })
 assert.equal(await m.exchangeVercelOidcToken(prodToken),'drive-token')
 assert.equal(calls,2)
 for(const change of [
   {environment:'preview'},
   {sub:'owner:test-team:project:3kings-site-report:environment:preview'},
   {project_id:'prj_WRONG'},
   {owner_id:'team_WRONG'},
 ])await assert.rejects(m.exchangeVercelOidcToken(token({...{
   sub:'owner:test-team:project:3kings-site-report:environment:production',
   environment:'production',project_id:'prj_123ABC',owner_id:'team_123ABC'},...change})),/BLOCK_OIDC_ENVIRONMENT_CLAIMS/)
 assert.equal(calls,2)
 process.env.AGENT_PRODUCTION_GCP_PROVIDER_ID='vercel-preview'
 await assert.rejects(m.exchangeVercelOidcToken(prodToken),/BLOCK_OIDC_CONFIGURATION_MISMATCH/)
 delete process.env.AGENT_PRODUCTION_ENABLED
 for(const key of Object.keys(process.env).filter(k=>k.startsWith('AGENT_PRODUCTION_')))delete process.env[key]
})


test('disabled Production supports explicit, read-only server probe but default Agent remains blocked',async()=>{
 Object.assign(process.env,config,{
  VERCEL_ENV:'production',AGENT_PRODUCTION_ENABLED:'false',
  AGENT_PRODUCTION_GCP_PROJECT_NUMBER:'123456789012',
  AGENT_PRODUCTION_GCP_POOL_ID:'test-vercel-sop',
  AGENT_PRODUCTION_GCP_PROVIDER_ID:'test-production',
  AGENT_PRODUCTION_GCP_SERVICE_ACCOUNT_EMAIL:'reader@test-project.iam.gserviceaccount.com',
  AGENT_PRODUCTION_OIDC_EXPECTED_ISSUER:'https://oidc.vercel.com/test-team',
  AGENT_PRODUCTION_OIDC_EXPECTED_AUDIENCE:'https://vercel.com/test-team',
  AGENT_PRODUCTION_OIDC_EXPECTED_SUBJECT:'owner:test-team:project:3kings-site-report:environment:production',
  AGENT_PRODUCTION_OIDC_EXPECTED_PROJECT_ID:'prj_123ABC',
  AGENT_PRODUCTION_OIDC_EXPECTED_OWNER_ID:'team_123ABC'
 })
 let calls=0
 const m=setup(async(url)=>{
  calls++
  if(url==='https://sts.googleapis.com/v1/token')return response({access_token:'federated'})
  if(url.includes('iamcredentials.googleapis.com'))return response({accessToken:'drive-readonly'})
  throw Error('unexpected host')
 })
 const prodToken=token({sub:'owner:test-team:project:3kings-site-report:environment:production',
   environment:'production',project_id:'prj_123ABC',owner_id:'team_123ABC'})
 await assert.rejects(m.exchangeVercelOidcToken(prodToken),/BLOCK_PRODUCTION_DISABLED/)
 assert.equal(calls,0)
 assert.equal(await m.exchangeVercelOidcToken(prodToken,true),'drive-readonly')
 assert.equal(calls,2)
 await assert.rejects(m.exchangeVercelOidcToken(token(),true),/BLOCK_OIDC_ENVIRONMENT_CLAIMS/)
 assert.equal(calls,2)
 delete process.env.AGENT_PRODUCTION_ENABLED
 for(const key of Object.keys(process.env).filter(k=>k.startsWith('AGENT_PRODUCTION_')))delete process.env[key]
})
test('Production OIDC probe is restricted by Owner auth, matrix and hard-coded SOP 13 preflight',()=>{
 const route=fs.readFileSync('app/api/agent/production-oidc-probe/route.ts','utf8')
 const page=fs.readFileSync('app/data-health/agent-security-qa/page.tsx','utf8')
 assert.ok(route.indexOf('user.id!==OWNER_USER_ID')<route.indexOf("createLiveSopSource("))
 assert.ok(route.indexOf('readPermissionSnapshot(client)')<route.indexOf("createLiveSopSource("))
 assert.ok(route.includes("process.env.VERCEL_ENV!=='production'"))
 assert.ok(route.includes("evaluateSopGate(13,'preflight',source)"))
 assert.ok(route.includes("request.headers.get('x-vercel-oidc-token')||'',true"))
 assert.ok(!/process\\.env\\.AGENT_PRODUCTION_ENABLED\\s*=/.test(route))
 assert.ok(!/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(route))
 assert.ok(page.includes("'/api/agent/production-oidc-probe'"))
})

process.on('exit',()=>{for(const key of Object.keys(config)){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}})
