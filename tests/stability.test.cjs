const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const {createRequire} = require('node:module')

// Compile with the project's existing TypeScript version; no new test dependency.
function loadTs(file, mocks = {}, extra = '') {
  const filename = path.resolve(file)
  const module = {exports: {}}
  const realRequire = createRequire(filename)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8') + extra, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText
  const context = {module, exports: module.exports, require: id => id in mocks ? mocks[id] : realRequire(id),
    process, Buffer, URL, Request, Response, AbortController, AbortSignal, setTimeout, clearTimeout, console, fetch: mocks.fetch || global.fetch}
  vm.runInNewContext(code, context, {filename})
  return module.exports
}
const {createLiveLoader, requireSuccessfulReads} = loadTs('lib/liveLoader.ts')
const tick = () => new Promise(resolve => setImmediate(resolve))

test('overlapping refresh events coalesce; old results cannot finish after new ones', async () => {
  const release = []; const commits = []; let active = 0; let max = 0
  const loader = createLiveLoader({load: async () => {
    const index = release.length; active++; max = Math.max(max, active)
    await new Promise(resolve => release.push(resolve)); commits.push(index); active--
  }, onError: () => assert.fail('unexpected error')})
  void loader.refresh(); await tick()
  await Promise.all(Array.from({length: 30}, () => loader.refresh()))
  assert.equal(release.length, 1)
  release[0](); await tick(); assert.equal(release.length, 2)
  release[1](); await tick()
  assert.equal(max, 1); assert.deepEqual(commits, [0,1]); loader.dispose()
})

test('Supabase resolved error does not replace a previously valid snapshot', async () => {
  let snapshot = ['original']; let errors = 0; let settled = 0
  const loader = createLiveLoader({load: async () => {
    const results = [{data: ['new'],error:null}, {data:null,error:{message:'DB offline'}}]
    requireSuccessfulReads(results); snapshot = results[0].data
  }, onError: () => errors++, onSettled: () => settled++})
  await loader.refresh(); assert.deepEqual(snapshot, ['original'])
  assert.equal(errors, 1); assert.equal(settled, 1); loader.dispose()
})

test('timeout settles the loading state and a later retry succeeds', async () => {
  let calls = 0; let errors = 0; let settled = 0
  const loader = createLiveLoader({timeoutMs: 15, load: signal => {
    calls++; if(calls > 1) return Promise.resolve()
    return new Promise((_,reject) => signal.addEventListener('abort', () => reject(Error('aborted')), {once:true}))
  }, onError: () => errors++, onSettled: () => settled++})
  await loader.refresh(); await loader.refresh()
  assert.equal(errors, 1); assert.equal(settled, 2); loader.dispose()
})

test('unmount aborts in-flight reads, drops trailing refresh and suppresses callbacks', async () => {
  let calls = 0; let callbacks = 0; let signal
  const loader = createLiveLoader({load: s => {calls++; signal=s; return new Promise((_,reject) =>
    s.addEventListener('abort', () => reject(Error('unmounted')), {once:true}))
  }, onError: () => callbacks++, onSettled: () => callbacks++})
  const first = loader.refresh(); void loader.refresh(); loader.dispose(); await first; await tick()
  assert.equal(signal.aborted, true); assert.equal(calls, 1); assert.equal(callbacks, 0)
})

const sheets = {
  '01 รายการทั้งหมด': [['สถานที่/หลัง','รายการวัสดุ/งาน'], ['Villa Plot 6','วัสดุทดสอบ']],
  '04 Purchasing ค้างส่ง': [['หน้างาน','ผู้ขาย/ผู้รับเหมา','รายการ'], ['Villa Plot 6','Supplier','งานทดสอบ']],
  '06-Tools & Machine': [['รหัสรายการ','รายการเครื่องมือ/เครื่องจักร'], ['TM-001','เครื่องมือทดสอบ']],
}
function syncRoute(input) {
  const calls = []
  const route = loadTs('app/api/sync/drive/route.ts', {
    'read-excel-file/node': {readSheet: async (_,name) => {if(!(name in input)) throw Error('missing'); return input[name]}},
    '@supabase/supabase-js': {createClient: () => ({rpc: async (...args) => {calls.push(args); return {data:{ok:true},error:null}}})},
  })
  return {route,calls}
}
function syncRequest() {return new Request('http://localhost/api/sync/drive?kind=materials', {
  method:'POST',headers:{'x-sync-key':'test-only'},body:'test-fixture'
})}

test('valid materials workbook reaches the existing RPC contract', async () => {
  const {route,calls}=syncRoute(sheets); assert.equal((await route.POST(syncRequest())).status,200)
  assert.equal(calls.length,1); assert.equal(calls[0][0],'drive_sync_replace_materials_tools')
  assert.equal(calls[0][1].p_materials[0].project_code,'AV-P6')
})

test('each header-only dataset is rejected before any replacement RPC', async () => {
  for(const name of Object.keys(sheets)) {
    const input={...sheets,[name]:[sheets[name][0]]}; const {route,calls}=syncRoute(input)
    assert.equal((await route.POST(syncRequest())).status,422,name); assert.equal(calls.length,0)
  }
})

test('missing purchasing/location headers cannot silently produce an empty replacement', async () => {
  for(const name of ['04 Purchasing ค้างส่ง','01 รายการทั้งหมด']) {
    const {route,calls}=syncRoute({...sheets,[name]:[['wrong header'],['value']]})
    const result=await route.POST(syncRequest()); assert.equal(result.ok,false); assert.equal(calls.length,0)
  }
})

const userId='11111111-1111-4111-8111-111111111111'
const photoId='22222222-2222-4222-8222-222222222222'
const reportId='33333333-3333-4333-8333-333333333333'
const projectId='44444444-4444-4444-8444-444444444444'
const stagingPath=`${userId}/2026-10-03/${reportId}/${photoId}/รูปหน้างาน.jpg`
const basePayload={photo_id:photoId,report_id:reportId,project_id:projectId,project_code:'AV-P6',report_date:'2026-10-03',
  staging_path:stagingPath,signed_url:`https://wtqubwdduzedmcvyhbgs.supabase.co/storage/v1/object/sign/photo-archive-staging/${encodeURI(stagingPath)}?token=test`}
function archiveRoute({row=null,authReject=false,fetchMock}={}) {
  const filters=[]; let updates=0
  const builder={update:()=>{updates++;return builder},eq:(...args)=>{filters.push(args);return builder},select:()=>builder,
    maybeSingle:async()=>({data:row,error:null}),then:resolve=>Promise.resolve({data:row,error:null}).then(resolve)}
  const route=loadTs('app/api/archive/photo/route.ts',{fetch:fetchMock,'@supabase/supabase-js':{createClient:()=>({
    auth:{getUser:async()=>{if(authReject)throw Error('offline'); return {data:{user:{id:userId}},error:null}}},from:()=>builder,
  })}})
  return {route,filters,updates:()=>updates}
}
function archiveRequest(payload) {return new Request('http://localhost/api/archive/photo',{
  method:'POST',headers:{authorization:'Bearer test-only','content-type':'application/json'},body:JSON.stringify(payload)
})}

test('archive rejects null JSON, invalid IDs, mismatched signed object and traversal before writes', async () => {
  const inputs=[null,[],{...basePayload,photo_id:"' OR 1=1 --"},
    {...basePayload,signed_url:basePayload.signed_url.replace(encodeURI(stagingPath),`${userId}/another.jpg`)},
    {...basePayload,staging_path:`${userId}/../another.jpg`}]
  for(const payload of inputs){const f=archiveRoute();assert.equal((await f.route.POST(archiveRequest(payload))).status,400);assert.equal(f.updates(),0)}
})

test('archive never queues a webhook when the ownership-scoped UPDATE matches zero rows', async () => {
  process.env.N8N_PHOTO_ARCHIVE_WEBHOOK_URL='https://example.invalid/test-only'
  process.env.N8N_PHOTO_ARCHIVE_KEY='test-only'
  try {
    const f=archiveRoute(); const result=await f.route.POST(archiveRequest(basePayload))
    assert.equal(result.status,404)
    assert.deepEqual(f.filters,[['id',photoId],['uploaded_by',userId],['daily_report_id',reportId]])
  } finally {delete process.env.N8N_PHOTO_ARCHIVE_WEBHOOK_URL;delete process.env.N8N_PHOTO_ARCHIVE_KEY}
})

test('archive returns controlled JSON on upstream exception', async () => {
  const f=archiveRoute({authReject:true});const result=await f.route.POST(archiveRequest(basePayload))
  assert.equal(result.status,503);assert.equal((await result.json()).ok,false)
})

module.exports={loadTs}

test('valid authorized archive keeps the 202 response and original worker payload', async () => {
  process.env.N8N_PHOTO_ARCHIVE_WEBHOOK_URL='https://example.invalid/test-only'
  process.env.N8N_PHOTO_ARCHIVE_KEY='test-only'
  let forwarded
  try {
    const f=archiveRoute({row:{id:photoId},fetchMock:async(_,init)=>{
      forwarded=JSON.parse(init.body);return new Response('{}',{status:202})
    }})
    const result=await f.route.POST(archiveRequest(basePayload))
    assert.equal(result.status,202);assert.equal((await result.json()).photoId,photoId)
    assert.equal(forwarded.signed_url,basePayload.signed_url);assert.equal(forwarded.report_id,reportId)
  } finally {delete process.env.N8N_PHOTO_ARCHIVE_WEBHOOK_URL;delete process.env.N8N_PHOTO_ARCHIVE_KEY}
})
