const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {createHmac}=require('node:crypto')
const ts=require('typescript')

const source=fs.readFileSync(path.join(__dirname,'..','lib','lineAutopilotSecurity.ts'),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const m={exports:{}}
new Function('require','module','exports',js)(require,m,m.exports)
const {verifyLineWebhookSignature,resolveLineAlertDestination}=m.exports
const owner='U'+'1'.repeat(32)
const group='C'+'a'.repeat(32)
const plot6='C'+'b'.repeat(32)
const secret='fake-test-channel-secret'
const raw='{"destination":"U'+'9'.repeat(32)+'","events":[]}'
const valid=createHmac('sha256',secret).update(raw,'utf8').digest('base64')

test('accepts only original HMAC-signed body',()=>{
  assert.equal(verifyLineWebhookSignature(raw,valid,secret),true)
  assert.equal(verifyLineWebhookSignature(raw+' ',valid,secret),false)
  assert.equal(verifyLineWebhookSignature(raw,valid,'wrong-secret'),false)
  assert.equal(verifyLineWebhookSignature(raw,null,secret),false)
  assert.equal(verifyLineWebhookSignature(raw,valid,''),false)
  assert.equal(verifyLineWebhookSignature(raw,'invalid-signature',secret),false)
})

test('system alerts never fall back to shared group',()=>{
  const cfg={ownerUserId:owner,mainGroupId:group,siteGroupsJson:JSON.stringify({'AV-P6':plot6})}
  assert.equal(resolveLineAlertDestination({category:'system'},cfg),owner)
  assert.equal(resolveLineAlertDestination({category:'system'},{mainGroupId:group}),null)
  assert.equal(resolveLineAlertDestination({category:'management'},cfg),group)
})

test('site alerts go only to explicitly approved project group',()=>{
  const cfg={ownerUserId:owner,mainGroupId:group,siteGroupsJson:JSON.stringify({'AV-P6':plot6})}
  assert.equal(resolveLineAlertDestination({category:'site',siteCode:'AV-P6'},cfg),plot6)
  assert.equal(resolveLineAlertDestination({category:'site',siteCode:'AV-P7'},cfg),null)
  assert.equal(resolveLineAlertDestination({category:'site'},cfg),null)
  assert.equal(resolveLineAlertDestination({category:'site',siteCode:'__proto__'},cfg),null)
  assert.equal(resolveLineAlertDestination({category:'site',siteCode:'AV-P6'},{...cfg,siteGroupsJson:'broken'}),null)
})

test('webhook receiver is signed and read-only',()=>{
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','line','webhook','route.ts'),'utf8')
  assert.match(route,/request\.text\(\)/)
  assert.match(route,/verifyLineWebhookSignature\(raw,request\.headers\.get\('x-line-signature'\),secret\)/)
  assert.match(route,/processed:0,mode:'receiver_only'/)
  assert.doesNotMatch(route,/createClient|\.from\(|message\/push|channel\/webhook\/endpoint/)
})
