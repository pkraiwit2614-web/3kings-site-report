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
test('canonical SOP_INDEX is read directly without a redundant sheet-list request',async()=>{
 Object.assign(process.env,config,{AGENT_SOP_INDEX_ID:'index123'})
 const urls=[]
 const m=setup(async(url)=>{
  urls.push(url)
  if(url==='https://sts.googleapis.com/v1/token')return response({access_token:'sts'})
  if(url.includes('iamcredentials.googleapis.com'))return response({accessToken:'drive'})
  if(url.includes('/drive/v3/files/index123?'))return response({id:'index123',name:'00-SOP_INDEX - 3Kings Construction',mimeType:'application/vnd.google-apps.spreadsheet',modifiedTime:'revision1'})
  if(url.includes('/values/')){
   assert.equal(decodeURIComponent(url.split('/values/')[1]),\"'SOP_INDEX'!A1:K100\")
   return response({values:[['ลำดับ','คำสั่งลัด','','','','','ลิงก์ SOP','สถานะเอกสาร'],['13','ตรวจ Sync','','','','','https://docs.google.com/document/d/sop13/edit','จัดทำ SOP v1.0']]})
  }
  throw Error('unexpected request '+url)
 })
 const source=await m.createLiveSopSource(token())
 const snapshot=await source.readIndex()
 assert.equal(snapshot.rows.length,1)
 assert.equal(snapshot.rows[0].shortcut,'ตรวจ Sync')
 assert.equal(urls.filter(x=>x.includes('/sheets.googleapis.com/v4/spreadsheets/')).length,0)
 assert.equal(urls.filter(x=>x.includes('/values/')).length,1)
 delete process.env.AGENT_SOP_INDEX_ID
})

test('noncanonical index tab still works through legacy header discovery',async()=>{
 Object.assign(process.env,config,{AGENT_SOP_INDEX_ID:'index123'})
 const requested=[]
 const m=setup(async(url)=>{
  requested.push(url)
  if(url==='https://sts.googleapis.com/v1/token')return response({access_token:'sts'})
  if(url.includes('iamcredentials.googleapis.com'))return response({accessToken:'drive'})
  if(url.includes('/drive/v3/files/index123?'))return response({id:'index123',name:'00-SOP_INDEX - 3Kings Construction',mimeType:'application/vnd.google-apps.spreadsheet',modifiedTime:'revision1'})
  if(url.endsWith('?fields=sheets(properties(title))'))return response({sheets:[{properties:{title:'Legacy Index'}}]})
  if(url.includes('/values/')){
   const tab=decodeURIComponent(url.split('/values/')[1])
   return tab===\"'SOP_INDEX'!A1:K100\"?response({values:[['not the expected headers']]}):
     response({values:[['ลำดับ','คำสั่งลัด','','','','','ลิงก์ SOP','สถานะเอกสาร'],['13','ตรวจ Sync','','','','','https://docs.google.com/document/d/sop13/edit','จัดทำ SOP v1.0']]})
  }
  throw Error('unexpected request '+url)
 })
 const source=await m.createLiveSopSource(token())
 assert.equal((await source.readIndex()).rows[0].shortcut,'ตรวจ Sync')
 assert.equal(requested.filter(u=>u.includes('/values/')).length,2)
 assert.equal(requested.filter(u=>u.endsWith('?fields=sheets(properties(title))')).length,1)
 delete process.env.AGENT_SOP_INDEX_ID
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

process.on('exit',()=>{for(const key of Object.keys(config)){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}})
