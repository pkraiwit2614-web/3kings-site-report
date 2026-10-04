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
    process, Buffer, URL, Request, Response, AbortController, AbortSignal: mocks.AbortSignal || AbortSignal, setTimeout, clearTimeout, console, fetch: mocks.fetch || global.fetch}
  vm.runInNewContext(code, context, {filename})
  return module.exports
}
const {createLiveLoader, requireSuccessfulReads} = loadTs('lib/liveLoader.ts')
const tick = () => new Promise(resolve => setImmediate(resolve))

const workDateIntegrity = loadTs('lib/workDateIntegrity.ts')
test('Work Date integrity uses Bangkok midnight and excludes future/review dates',()=>{
  assert.equal(workDateIntegrity.bangkokToday(new Date('2026-10-03T16:59:59.999Z')),'2026-10-03')
  assert.equal(workDateIntegrity.bangkokToday(new Date('2026-10-03T17:00:00.000Z')),'2026-10-04')
  const rows=[
    {work_date:'2026-12-09',work_date_validation_status:'future_review'},
    {work_date:'2026-09-30',work_date_validation_status:'valid'},
    {work_date:'2026-09-16',work_date_validation_status:'valid'}
  ]
  assert.equal(workDateIntegrity.latestUsableDate(rows,'2026-10-04'),'2026-09-30')
  assert.equal(workDateIntegrity.latestUsableDate([rows[0]],'2026-10-04'),'')
  assert.equal(workDateIntegrity.isUsableActualWorkDate(rows[0],'2026-10-04'),false)
  assert.equal(workDateIntegrity.isBatchWorkDateUsable({work_date:'2026-12-09',site_operations_entry_id:'row91'},rows[0],'2026-10-04'),false)
})


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

// Execute the actual effect bodies, with controllable network promises and state.
function loadEffect(file, marker, scope) {
  const source = ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let effect
  function visit(node) {
    if(ts.isCallExpression(node) && node.expression.getText(source)==='useEffect' && node.arguments[0].getText(source).includes(marker)) effect=node.arguments[0]
    ts.forEachChild(node,visit)
  }
  visit(source); assert.ok(effect, `missing effect ${marker}`)
  const code=ts.transpileModule(`(${effect.getText(source)})`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  return vm.runInNewContext(code,{AbortController,window:{setTimeout,clearTimeout},...scope})
}
function accessFixture(profileResult, authPromise) {
  const state={errors:[],ready:[],redirects:[],signouts:0}
  const query={select(){return this},eq(){return this},abortSignal(){return this},maybeSingle:async()=>profileResult}
  const supabase={auth:{getUser:()=>authPromise||Promise.resolve({data:{user:{id:'user',email:'test'}},error:null}),signOut:async()=>{state.signouts++}},from:()=>query}
  const effect=loadEffect('components/AppShell.tsx','const checkAccess',{
    getSupabase:()=>supabase,router:{replace:p=>state.redirects.push(p)},
    setAccessError:v=>state.errors.push(v),setUserName:()=>{},setRole:()=>{},setReady:v=>state.ready.push(v)
  })
  return {state,effect}
}
test('profile DB outage fails closed, offers retry, and does not sign out a valid session',async()=>{
  const {state,effect}=accessFixture({data:null,error:{message:'database offline'}})
  const dispose=effect();await tick();dispose()
  assert.deepEqual(state.errors,[false,true]);assert.deepEqual(state.ready,[])
  assert.equal(state.signouts,0);assert.deepEqual(state.redirects,[])
})
test('active profile opens shell; genuinely inactive profile remains denied',async()=>{
  for(const active of [true,false]) {
    const {state,effect}=accessFixture({data:{active,role:'viewer'},error:null})
    const dispose=effect();await tick();dispose()
    assert.deepEqual(state.ready,active?[true]:[])
    assert.equal(state.signouts,active?0:1)
    assert.deepEqual(state.redirects,active?[]:['/login'])
  }
})
test('unmounted access check cannot set state or redirect after auth completes',async()=>{
  let resolve
  const {state,effect}=accessFixture({data:{active:true},error:null},new Promise(r=>resolve=r))
  const dispose=effect();dispose();resolve({data:{user:{id:'user'}},error:null});await tick()
  assert.deepEqual(state.ready,[]);assert.deepEqual(state.redirects,[])
})
test('old dashboard date response cannot overwrite the newly selected date',async()=>{
  const pending=[];let rows=[];let error=false
  const query={select(){return this},eq(){return this},abortSignal(){return new Promise(r=>pending.push(r))}}
  const scope={getSupabase:()=>({from:()=>query}),createLiveLoader,requireSuccessfulReads,
    setSnapshotRows:v=>rows=v,setSnapshotError:v=>error=v,setSnapshotLoading:()=>{}}
  const first=loadEffect('app/page.tsx','if(!snapshotDate)',{...scope,snapshotDate:'2026-10-01'})()
  first()
  const second=loadEffect('app/page.tsx','if(!snapshotDate)',{...scope,snapshotDate:'2026-10-02'})()
  pending[1]({data:[{date:'new'}],error:null});await tick()
  pending[0]({data:[{date:'old'}],error:null});await tick();second()
  assert.equal(rows[0].date,'new');assert.equal(error,false)
})
test('dashboard history failure is an error, never an empty successful snapshot',async()=>{
  let error=false;let loading=true
  const query={select(){return this},eq(){return this},abortSignal:async()=>({data:null,error:{message:'offline'}})}
  const dispose=loadEffect('app/page.tsx','if(!snapshotDate)',{snapshotDate:'2026-10-01',
    getSupabase:()=>({from:()=>query}),createLiveLoader,requireSuccessfulReads,
    setSnapshotRows:()=>{},setSnapshotError:v=>error=v,setSnapshotLoading:v=>loading=v})()
  await tick();dispose();assert.equal(error,true);assert.equal(loading,false)
})

test('gallery consumes all per-project previews in one batch, including older projects',async()=>{
  let result;const calls=[]
  const rows=[{project_id:'villa',drive_file_id:'new'},{project_id:'condo',drive_file_id:'older'}]
  const fixture={projects:[{id:'villa',code:'AV-P6'},{id:'condo',code:'CONDO-A'}],v_latest_site_photos:rows}
  const query=table=>({select(){return this},eq(){return this},abortSignal:async()=>({data:fixture[table],error:null})})
  const dispose=loadEffect('components/SitePhotosGallery.tsx','const loader=createLiveLoader',{
    getSupabase:()=>({from:table=>{calls.push(table);return query(table)}}),createLiveLoader,requireSuccessfulReads,
    setLoadError:()=>{},setLoaded:()=>{},setLatestByCode:v=>result=v})()
  await tick();dispose()
  assert.equal(result['CONDO-A'].drive_file_id,'older');assert.equal(result['AV-P6'].drive_file_id,'new')
  assert.deepEqual(calls,['projects','v_latest_site_photos'])
})
test('gallery outage preserves previous previews and surfaces error',async()=>{
  let result='previous';let failed=false
  const q={select(){return this},eq(){return this},abortSignal:async()=>({data:null,error:{message:'offline'}})}
  const dispose=loadEffect('components/SitePhotosGallery.tsx','const loader=createLiveLoader',{
    getSupabase:()=>({from:()=>q}),createLiveLoader,requireSuccessfulReads,
    setLoadError:v=>failed=v,setLoaded:()=>{},setLatestByCode:v=>result=v})()
  await tick();dispose();assert.equal(failed,true);assert.equal(result,'previous')
})
test('photo proxy stops retries when total deadline expires and returns placeholder',async()=>{
  const deadline=new AbortController();let attempts=0;const timeouts=[]
  const next={NextResponse:class extends Response {static json(v,o){return new Response(JSON.stringify(v),o)}}}
  const module=loadTs('app/api/drive-photo/route.ts',{
    'next/server':next,
    AbortSignal:{timeout:ms=>{timeouts.push(ms);return ms===11000?deadline.signal:new AbortController().signal},any:signals=>AbortSignal.any(signals)},
    fetch:async(_url,options)=>{attempts++;deadline.abort();assert.equal(options.signal.aborted,true);throw Error('timeout')}
  })
  const response=await module.GET({nextUrl:new URL('https://example.test/api/drive-photo?fileId=valid_file_id_123')})
  assert.equal(response.status,200);assert.equal(response.headers.get('x-photo-fallback'),'unavailable')
  assert.equal(attempts,1);assert.deepEqual(timeouts,[11000,3500])
})

test('archive callback/retry reject null JSON and return controlled errors on network rejection',async()=>{
  const next={NextResponse:{json:(body,options)=>new Response(JSON.stringify(body),options)}}
  const saved=process.env.N8N_PHOTO_ARCHIVE_KEY;process.env.N8N_PHOTO_ARCHIVE_KEY='fixture-callback-key'
  try {
    for(const route of ['callback','retry']) {
      let unavailable=false
      const client={auth:{getUser:async()=>{if(unavailable)throw Error('offline');return {data:{user:{id:'fixture'}},error:null}}},rpc:async()=>{throw Error('offline')}}
      const mod=loadTs(`app/api/archive/photo/${route}/route.ts`,{'next/server':next,'@supabase/supabase-js':{createClient:()=>client}})
      const request=payload=>new Request(`https://example.test/api/archive/photo/${route}`,{method:'POST',headers:{authorization:'Bearer fixture','x-archive-key':'fixture-callback-key','content-type':'application/json'},body:JSON.stringify(payload)})
      assert.equal((await mod.POST(request(null))).status,400)
      unavailable=true
      const failure=await mod.POST(request({photo_id:'fixture',status:'failed'}))
      assert.equal(failure.status,503);assert.equal((await failure.json()).ok,false)
    }
  } finally {if(saved===undefined)delete process.env.N8N_PHOTO_ARCHIVE_KEY;else process.env.N8N_PHOTO_ARCHIVE_KEY=saved}
})
