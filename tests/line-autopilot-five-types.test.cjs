const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const loaded = new Map()
function loadTypeScript(file) {
  const full = path.resolve(__dirname, '..', file)
  if (loaded.has(full)) return loaded.get(full)
  const code = fs.readFileSync(full,'utf8')
  const js = ts.transpileModule(code, {
    compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 }
  }).outputText
  const m = {exports:{}}
  const moduleRequire = spec => spec.startsWith('.')
    ? loadTypeScript(path.join(path.dirname(file),spec+'.ts'))
    : require(spec)
  new Function('require','module','exports',js)(moduleRequire,m,m.exports)
  loaded.set(full,m.exports)
  return m.exports
}
const {
  prepareLineAutoPilotNotification, LINE_AUTOPILOT_SCOPE, LINE_AUTOPILOT_SOP_FILES
} = loadTypeScript('lib/lineAutoPilotNotifications.ts')
const { dispatchPreparedLineAlert } = loadTypeScript('lib/lineAutoPilotDelivery.ts')

const privateId='U'+'1'.repeat(32)
const groupId='C'+'2'.repeat(32)
const plot6='C'+'3'.repeat(32)
const routing = {
  ownerUserId:privateId,mainGroupId:groupId,
  siteGroupsJson:JSON.stringify({'AV-P6':plot6})
}
const timestamp='2026-10-17T01:00:00.000Z'
function sample(kind,override={}) {
  const base={
    kind,eventId:'issue-001',status:kind==='sync_failure'?'FAIL':'WARN',
    confirmedItems:2,title:'ตรวจพบรายการต้องติดตาม',facts:['มีหลักฐานตรวจแล้ว 2 รายการ'],
    evidence:{
      sourceVerified:true,sopVerified:true,
      sourceIds:['1z57u9sJEDtEAsSORONGRaeNDmUvhS6dw2YkVCv2ovhQ'],
      sopFileId:LINE_AUTOPILOT_SOP_FILES[kind],sopRevision:'v1.0',
      inspectedAt:timestamp,sourceRevision:'rev-20261017'
    }
  }
  return {...base,...override,evidence:{...base.evidence,...override.evidence}}
}

test('scope is exactly five types and company group by default',()=>{
  assert.deepEqual(Object.keys(LINE_AUTOPILOT_SCOPE).sort(),[
    'daily_site_report','defect_overdue','po_materials','sync_failure','weekly_recap'
  ])
  for(const kind of ['defect_overdue','po_materials','daily_site_report','weekly_recap']){
    const prepared=prepareLineAutoPilotNotification(sample(kind),routing)
    assert.equal(prepared.to,groupId,kind)
    assert.match(prepared.text,/3 Kings AutoPilot/)
    assert.match(prepared.text,/ตรวจข้อมูล:/)
    assert.equal(prepared.kind,kind)
    assert.equal(prepared.eventKey.length,64)
  }
})

test('a sync FAILURE routes only to owner; success never sends',()=>{
  const good=prepareLineAutoPilotNotification(sample('sync_failure'),routing)
  assert.equal(good.to,privateId)
  assert.equal(prepareLineAutoPilotNotification(sample('sync_failure',{status:'PASS'}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample('sync_failure'),{mainGroupId:groupId}),null)
})

test('specific site group needs explicit approved mapping and never defaults to main',()=>{
  const a=sample('defect_overdue',{destinationScope:'site',projectCode:'AV-P6'})
  assert.equal(prepareLineAutoPilotNotification(a,routing)?.to,plot6)
  assert.equal(prepareLineAutoPilotNotification({...a,projectCode:'AV-P9'},routing),null)
  assert.equal(prepareLineAutoPilotNotification({...a,projectCode:'__proto__'},routing),null)
  assert.equal(prepareLineAutoPilotNotification({...a,projectCode:undefined},routing),null)
})

test('source, SOP, revision, status and facts must be verified',()=>{
  const type='po_materials'
  assert.equal(prepareLineAutoPilotNotification(sample(type,{evidence:{sourceVerified:false}}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample(type,{evidence:{sopVerified:false}}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample(type,{evidence:{sopFileId:LINE_AUTOPILOT_SOP_FILES.weekly_recap}}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample(type,{evidence:{sourceIds:[]}}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample(type,{evidence:{sourceRevision:''}}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample(type,{confirmedItems:0}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample(type,{facts:['']}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample(type,{facts:['Authorization: Bearer secret']}),routing),null)
  assert.equal(prepareLineAutoPilotNotification(sample(type,{eventId:'unsafe key'}),routing),null)
})

test('same verified event makes a stable hash, revision changes produce a new key',()=>{
  const a=sample('daily_site_report')
  const k=prepareLineAutoPilotNotification(a,routing).eventKey
  assert.equal(prepareLineAutoPilotNotification(a,routing).eventKey,k)
  assert.notEqual(prepareLineAutoPilotNotification(sample('daily_site_report',{evidence:{sourceRevision:'rev-20261018'}}),routing).eventKey,k)
})

function fakeLedger(){
 const events=new Map()
 return {
   events,
   async claimOnce(k){
     if(events.has(k))return {status:events.get(k).status==='sent'?'already_sent':'in_flight'}
     const retryKey='be57590b-2a88-44c9-8ec9-d5c97e5c63dd'
     events.set(k,{status:'in_flight',retryKey})
     return {status:'new',retryKey}
   },
   async markDelivered(k,retryKey){events.set(k,{status:'sent',retryKey})},
   async markUncertain(k,retryKey,httpStatus){events.set(k,{status:'uncertain',retryKey,httpStatus})},
 }
}

test('delivery is disabled by default, does not call LINE',async()=>{
  const ledger=fakeLedger()
  const item=prepareLineAutoPilotNotification(sample('sync_failure'),routing)
  let called=0
  const transport=async()=>{called++;return {ok:true,status:200}}
  assert.deepEqual(await dispatchPreparedLineAlert(item,ledger,{enabled:false,accessToken:'a'.repeat(40),transport}),{status:'disabled'})
  assert.equal(called,0)
  assert.equal(ledger.events.size,0)
})

test('durable claim skips duplicate messages and retains retry identity',async()=>{
  const ledger=fakeLedger()
  const item=prepareLineAutoPilotNotification(sample('weekly_recap'),routing)
  const requests=[]
  const transport=async(url,params)=>{requests.push({url,...params});return {ok:true,status:200}}
  const opts={enabled:true,accessToken:'fake-long-test-channel-access-token',transport}
  assert.deepEqual(await dispatchPreparedLineAlert(item,ledger,opts),{status:'sent'})
  assert.deepEqual(await dispatchPreparedLineAlert(item,ledger,opts),{status:'duplicate'})
  assert.equal(requests.length,1)
  assert.equal(requests[0].url,'https://api.line.me/v2/bot/message/push')
  assert.equal(requests[0].headers['X-Line-Retry-Key'],ledger.events.get(item.eventKey).retryKey)
  assert.equal(JSON.parse(requests[0].body).to,groupId)
})

test('uncertain remote HTTP response is not treated as delivered or retried with new key',async()=>{
 const ledger=fakeLedger()
 const item=prepareLineAutoPilotNotification(sample('po_materials'),routing)
 const transport=async()=>({ok:false,status:429})
 const result=await dispatchPreparedLineAlert(item,ledger,{
   enabled:true,accessToken:'fake-long-test-channel-access-token',transport
 })
 assert.deepEqual(result,{status:'uncertain',httpStatus:429})
 assert.equal(ledger.events.get(item.eventKey).status,'uncertain')
})

test('group cannot receive system alerts even if transport receives a forged prepared object',async()=>{
 const ledger=fakeLedger()
 const item={...prepareLineAutoPilotNotification(sample('sync_failure'),routing),to:groupId}
 let count=0
 const result=await dispatchPreparedLineAlert(item,ledger,{
  enabled:true,accessToken:'fake-long-test-channel-access-token',
  transport:async()=>{count++;return {ok:true,status:200}}
 })
 assert.equal(result.status,'blocked')
 assert.equal(count,0)
})

test('no production scheduler or source mutations introduced by the alert policy',()=>{
 const vercel=fs.readFileSync(path.resolve(__dirname,'..','vercel.json'),'utf8')
 assert.equal(Object.keys(JSON.parse(vercel)).length,0)
 const receiver=fs.readFileSync(path.resolve(__dirname,'..','app/api/line/webhook/route.ts'),'utf8')
 assert.match(receiver,/mode:'receiver_only'/)
 const sources=['lib/lineAutoPilotNotifications.ts','lib/lineAutoPilotDelivery.ts']
 for(const file of sources){
   const code=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8')
   assert.doesNotMatch(code,/createClient|service_role|supabase|UPDATE public\.|DELETE FROM|ScriptApp\.newTrigger/)
 }
})
