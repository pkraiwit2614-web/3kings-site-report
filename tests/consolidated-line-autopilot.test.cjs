'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const root=path.resolve(__dirname,'..')
const workerPath=path.join(root,'cloudflare/line-autopilot/worker.mjs')
const dailyPath=path.join(root,'cloudflare/dailySiteSendTick.mjs')
const workerSource=fs.readFileSync(workerPath,'utf8')
const dailySource=fs.readFileSync(dailyPath,'utf8')
const loadWorker=async()=> (await import(pathToFileURL(workerPath).href)).default

test('one Cloudflare receiver, scheduler, and shared daily sender implementation',()=>{
  assert.match(workerSource,/from '\.\.\/dailySiteSendTick\.mjs'/)
  assert.equal((workerSource.match(/async scheduled\(controller,env\)/g)||[]).length,1)
  assert.equal((workerSource.match(/url\.pathname==='\/line\/webhook'/g)||[]).length,1)
  assert.doesNotMatch(workerSource,/export (async )?function dailySiteSendTick/)
  assert.equal((dailySource.match(/export async function dailySiteSendTick\(/g)||[]).length,1)
  assert.equal((dailySource.match(/export async function dailyOwnerSummaryTick\(/g)||[]).length,1)
  assert.equal(fs.existsSync(path.join(root,'app/api/line/webhook/route.ts')),false)
  assert.equal(fs.existsSync(path.join(root,'lib/lineAutoPilotDelivery.ts')),false)
})

test('disabled feature flags cause zero external sends or database calls',async()=>{
  const worker=await loadWorker()
  const original=global.fetch
  let count=0
  global.fetch=async()=>{count++;throw Error('BLOCK_UNEXPECTED_NETWORK')}
  try{
    const env={AUTOPILOT_ENABLED:'false',DAILY_SITE_LINE_ENABLED:'false',LINE_GROUP_DISCOVERY_ENABLED:'false'}
    const status=await worker.fetch(new Request('https://example.test/health'),env)
    assert.equal(status.status,200)
    const payload=await status.json()
    assert.equal(payload.live,false)
    assert.deepEqual(payload.enabledCollectors,[])
    await worker.scheduled({},env)
    assert.equal(count,0)
  }finally{global.fetch=original}
})

test('bad webhook HMAC is rejected and valid HMAC remains no-send receiver',async()=>{
  const worker=await loadWorker()
  const secret='synthetic-test-only-key'
  const raw=JSON.stringify({destination:'U'+'f'.repeat(32),events:[]})
  const signed=createHmac('sha256',secret).update(raw).digest('base64')
  const env={LINE_CHANNEL_SECRET:secret,LINE_GROUP_DISCOVERY_ENABLED:'false',
             AUTOPILOT_ENABLED:'false',DAILY_SITE_LINE_ENABLED:'false'}
  const original=global.fetch
  let count=0
  global.fetch=async()=>{count++;throw Error('BLOCK_UNEXPECTED_NETWORK')}
  const req=s=>new Request('https://example.test/line/webhook',{method:'POST',
    headers:{'X-Line-Signature':s},body:raw})
  try{
    assert.equal((await worker.fetch(req('invalid'),env)).status,401)
    const accepted=await worker.fetch(req(signed),env)
    assert.equal(accepted.status,200)
    assert.deepEqual(await accepted.json(),{ok:true,processed:0,mode:'receiver_only'})
    assert.equal(count,0)
  }finally{global.fetch=original}
})

test('the source-only gateway has no LINE sender and no executable historical migrations',()=>{
  const gateway=fs.readFileSync(path.join(root,'supabase/functions/3kings-daily-line-images/index.ts'),'utf8')
  assert.match(gateway,/kings_daily_line_images/)
  assert.match(gateway,/line_autopilot_claim/)
  assert.match(dailySource,/DAILY_SITE_LINE_ENABLED/)
  assert.doesNotMatch(gateway,/api\.line\.me\/v2\/bot\/message\/push/)
  assert.doesNotMatch(workerSource,/sb_secret_[A-Za-z0-9]{20,}/)
  assert.doesNotMatch(dailySource,/sb_secret_[A-Za-z0-9]{20,}/)
  for(const name of [
    '20261019093957_daily_line_secure_bridge_20261019.sql',
    '20261019170000_daily_line_secure_bridge.sql',
    '20261019184500_daily_line_isolated_live_routes.sql',
    '20261020094500_daily_line_owner_summary.sql'
  ]) assert.equal(fs.existsSync(path.join(root,'supabase/migrations',name)),false)
})
