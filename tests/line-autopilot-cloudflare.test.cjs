const test=require('node:test')
const assert=require('node:assert/strict')
const {pathToFileURL}=require('node:url')
const path=require('node:path')
const {createHmac}=require('node:crypto')
const fs=require('node:fs')

let worker
test('isolated Cloudflare Worker module and five-type scope',async()=>{
  worker=(await import(pathToFileURL(path.resolve(__dirname,'..','cloudflare/line-autopilot/worker.mjs')).href)).default
  const src=await import(pathToFileURL(path.resolve(__dirname,'..','cloudflare/line-autopilot/worker.mjs')).href)
  assert.deepEqual(src.NOTIFICATION_TYPES,[
    'sync_failure','defect_overdue','po_materials','daily_site_report','weekly_recap'
  ])
  const config=fs.readFileSync(path.resolve(__dirname,'..','cloudflare/line-autopilot/wrangler.jsonc'),'utf8')
  assert.match(config,/"AUTOPILOT_ENABLED": "false"/)
  assert.match(config,/"crons": \["0 \* \* \* \*"\]/)
  assert.doesNotMatch(config,/LINE_CHANNEL_SECRET":|LINE_CHANNEL_ACCESS_TOKEN":/)
})

test('health is unprivileged but stage remains no-send',async()=>{
  const result=await worker.fetch(new Request('https://example.test/health'),{},null)
  const data=await result.json()
  assert.equal(data.live,false)
  assert.equal(data.mode,'staged_no_send')
  assert.equal(data.storage,'3kings-existing-supabase')
  assert.equal(data.enabledCollectors.length,0)
})
test('worker does not send any LINE messages without credentials',async()=>{
  await worker.scheduled({},{AUTOPILOT_ENABLED:'true'},null)
  const result=await worker.fetch(new Request('https://example.test/line/webhook',{method:'POST',body:'{}'}),{},null)
  assert.equal(result.status,503)
})
test('unsigned or tampered webhook blocked, valid HMAC accepted without processing events',async()=>{
  const secret='fake-unit-test-secret'
  const raw=JSON.stringify({destination:'U'+'a'.repeat(32),events:[]})
  const makeReq=(data,sig)=>new Request('https://example.test/line/webhook',{
    method:'POST',headers:{'X-Line-Signature':sig},body:data
  })
  const sig=createHmac('sha256',secret).update(raw).digest('base64')
  assert.equal((await worker.fetch(makeReq(raw,'invalid'),{LINE_CHANNEL_SECRET:secret},null)).status,401)
  assert.equal((await worker.fetch(makeReq(raw+' ',sig),{LINE_CHANNEL_SECRET:secret},null)).status,401)
  const response=await worker.fetch(makeReq(raw,sig),{LINE_CHANNEL_SECRET:secret},null)
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{ok:true,processed:0,mode:'receiver_only'})
})
test('unknown routes do not serve management actions',async()=>{
  const x=await worker.fetch(new Request('https://example.test/api/dispatch',{method:'POST'}),{},null)
  assert.equal(x.status,404)
})

test('modern Supabase secret key is sent as apikey only, never as JWT bearer',async()=>{
  const previousFetch=global.fetch
  let calls=0
  global.fetch=async (url,init)=>{
    assert.match(String(url),/^https:\/\/wtqubwdduzedmcvyhbgs\.supabase\.co\/rest\/v1\/drive_sync_runs\?/)
    assert.equal(init.headers.apikey,'sb_secret_unit_test')
    assert.equal('authorization' in init.headers,false)
    calls++
    return new Response('[]',{status:200,headers:{'content-type':'application/json'}})
  }
  try{
    await worker.scheduled({},{
      AUTOPILOT_ENABLED:'true',
      SUPABASE_URL:'https://wtqubwdduzedmcvyhbgs.supabase.co',
      SUPABASE_SERVER_KEY:'sb_secret_unit_test',
      LINE_CHANNEL_ACCESS_TOKEN:'unit-test-token',
      LINE_OWNER_USER_ID:'U'+'a'.repeat(32),
      LINE_MAIN_GROUP_ID:'C'+'b'.repeat(32)
    },{})
    assert.equal(calls,1)
  } finally {
    global.fetch=previousFetch
  }
})
