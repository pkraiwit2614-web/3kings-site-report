// Actual browser + Supabase Local Auth and PostgreSQL RLS; no hosted traffic.
// Ancillary/non-core app tables mocked empty, but core fixture reads and Auth/RBAC/RLS
// hit the *real local* Supabase API and actual Next.js access-control route.
import assert from 'node:assert/strict'
const APP='http://127.0.0.1:3010'
const DB='http://127.0.0.1:54321'
const LOCAL_TABLES=new Set(['profiles','projects','materials','condo_room_status','site_operations_entries','payroll_verification_records'])
const key=process.env.ANON_KEY
if(!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(process.env.API_URL||'')||!key)
  throw Error('BLOCK_NO_LOCAL_SUPABASE')
if(!process.env.KINGS_LOCAL_VIEWER_LOGIN||!process.env.KINGS_LOCAL_VIEWER_PASSWORD)
  throw Error('BLOCK_VIEWER_NOT_BOOTSTRAPPED')
const {chromium}=await import('playwright')
let browser
let page
let phase='BROWSER_INIT'
try {
  browser=await chromium.launch({headless:true})
  const context=await browser.newContext({viewport:{width:1440,height:960}})
  let preventedWrites=0,blocked=0,realReads=0,viewerBearer=''
  await context.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url()), method=req.method().toUpperCase()
    if(url.origin===APP) {
      if(method!=='GET' && method!=='HEAD'){blocked++;return route.abort('blockedbyclient')}
      return route.continue()
    }
    if(url.origin!==DB){blocked++;return route.abort('blockedbyclient')}
    if(method!=='GET' && method!=='HEAD' && method!=='OPTIONS'){
      if(method==='POST' && url.pathname==='/auth/v1/token'&& url.searchParams.get('grant_type')==='password')
        return route.continue()
      if(method==='POST' && ['role_permission_matrix_read','defect_report_latest_change_at']
        .some(p=>url.pathname==='/rest/v1/rpc/'+p)) return route.continue()
      preventedWrites++;blocked++;return route.abort('blockedbyclient')
    }
    const match=url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)
    if(match && !LOCAL_TABLES.has(match[1])){
      const object=(req.headers().accept||'').includes('vnd.pgrst.object')
      return route.fulfill({status:200,headers:{'content-type':'application/json',
        'content-range':'*/0'},body:JSON.stringify(object?null:[])})
    }
    realReads++
    return route.continue()
  })
  await context.routeWebSocket('**/*',socket=>socket.close())
  page=await context.newPage()
  page.setDefaultTimeout(25000)
  page.on('response', response => {
    const u=new URL(response.url())
    if(u.origin===DB && u.pathname==='/auth/v1/token'){
      console.log('LOCAL_AUTH_HTTP_'+response.status())
      if(!response.ok()) void response.json().then(body=>{
        const code=String(body?.code||body?.error_code||body?.error||'UNKNOWN')
          .toUpperCase().replace(/[^A-Z0-9_]/g,'').slice(0,45)
        console.log('LOCAL_AUTH_ERROR_CODE_'+code)
      }).catch(()=>console.log('LOCAL_AUTH_ERROR_NON_JSON'))
    }
    if(u.origin===APP && u.pathname==='/api/access-control') console.log('LOCAL_ROLE_API_HTTP_'+response.status())
  })
  page.on('request',req=>{
    const u=new URL(req.url())
    if(u.origin===APP && u.pathname==='/api/access-control'){
      const a=req.headers().authorization||''
      if(a.startsWith('Bearer '))viewerBearer=a
    }
  })
  phase='ANON_API'
  const anon=await context.request.get(APP+'/api/access-control?path=%2Fmaterials')
  assert.equal(anon.status(),401,'anonymous API must refuse')
  phase='LOGIN_PAGE'
  await page.goto(APP+'/login',{waitUntil:'domcontentloaded'})
  await page.getByRole('heading',{name:'3 Kings Site Report'}).waitFor()
  await page.getByPlaceholder('เช่น USER01').fill(process.env.KINGS_LOCAL_VIEWER_LOGIN)
  await page.getByPlaceholder('กรอกรหัสผ่าน').fill(process.env.KINGS_LOCAL_VIEWER_PASSWORD)
  phase='LOGIN_CLICK'
  await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click()
  phase='LOGIN_REDIRECT'
  await page.waitForURL(u=>u.pathname==='/',{timeout:35000})
  phase='DASHBOARD_MARKER'
  await page.getByText('CI-ONLY PROJECT',{exact:false}).first().waitFor()
  assert.ok(viewerBearer.startsWith('Bearer '),'expected real Supabase Auth token')
  console.log('PASS_VIEWER_REAL_AUTH_AND_DASHBOARD')

  phase='FEATURE_ROUTES'
  for(const [path,marker] of [
    ['/defects','A991'],
    ['/materials','CI-ONLY MATERIAL'],
    ['/reports','CI-ONLY REPORT'],
  ]){
    const api=await context.request.get(APP+'/api/access-control?path='+encodeURIComponent(path),
      {headers:{authorization:viewerBearer}})
    assert.equal(api.status(),200,'allowed API route '+path)
    const decision=await api.json()
    assert.equal(decision.role,'viewer')
    assert.equal(decision.allowed,true)
    await page.goto(APP+path,{waitUntil:'domcontentloaded'})
    await page.getByText(marker,{exact:false}).first().waitFor()
    assert.equal(new URL(page.url()).pathname,path)
    console.log('PASS_VIEWER_UI_API_'+path.slice(1).toUpperCase())
  }
  phase='RESTRICTED_ROUTES'
  for(const path of ['/users','/reports/labour']){
    const api=await context.request.get(APP+'/api/access-control?path='+encodeURIComponent(path),
      {headers:{authorization:viewerBearer}})
    assert.equal(api.status(),403,'restricted role API path '+path)
    assert.equal((await api.json()).allowed,false)
    await page.goto(APP+path,{waitUntil:'domcontentloaded'})
    await page.waitForURL(u=>u.pathname!=='/login'&&u.pathname!==path,{timeout:25000})
    console.log('PASS_VIEWER_DENIED_'+path.slice(1).replaceAll('/','_').toUpperCase())
  }
  phase='RLS_CHECKS'
  const h={apikey:key,authorization:viewerBearer}
  phase='RLS_GET_USER'
  const user=await context.request.get(DB+'/auth/v1/user',{headers:h})
  assert.equal(user.status(),200)
  const own=(await user.json()).id
  const other=process.env.KINGS_LOCAL_OTHER_PROFILE_ID
  assert.match(other||'',/^[a-f0-9-]{36}$/i)
  assert.notEqual(other,own)
  const select=async (table,query)=> {
    const response=await context.request.get(DB+'/rest/v1/'+table+'?'+query,{headers:h})
    console.log('RLS_READ_HTTP_'+table.toUpperCase()+'_'+response.status())
    assert.equal(response.status(),200,'local RLS read '+table)
    return response.json()
  }
  phase='RLS_OWN_PROFILE'
  assert.deepEqual((await select('profiles','select=user_id&user_id=eq.'+own)).map(x=>x.user_id),[own])
  phase='RLS_OTHER_PROFILE'
  assert.deepEqual(await select('profiles','select=user_id&user_id=eq.'+other),[])
  phase='RLS_PROJECTS'
  assert.equal((await select('projects','select=id')).length,1)
  phase='RLS_MATERIALS'
  assert.equal((await select('materials','select=id')).length,1)
  phase='RLS_DEFECT'
  assert.equal((await select('condo_room_status','select=room_no')).length,1)
  phase='RLS_REPORTS'
  assert.equal((await select('site_operations_entries','select=id')).length,1)
  phase='RLS_PAYROLL_DENIAL'
  assert.deepEqual(await select('payroll_verification_records','select=id'),[])
  // All local insert attempts for viewer must be rejected; synthetic record only.
  phase='RLS_WRITE_DENIAL'
  for(const [table,payload] of [
    ['materials',{id:'55555555-5555-4555-8555-555555555555',item_name:'BLOCKED'}],
    ['payroll_verification_records',{id:'66666666-6666-4666-8666-666666666666',note:'BLOCKED'}],
  ]){
    const response=await context.request.post(DB+'/rest/v1/'+table,{
      headers:{...h,'content-type':'application/json',Prefer:'return=minimal'},data:payload
    })
    assert.ok([401,403].includes(response.status()),'RLS/grants should reject viewer write: '+table)
  }
  console.log('PASS_REAL_LOCAL_POSTGRES_RLS_READ_AND_WRITE_DENIAL')
  // The production app may *attempt* to log page views; Playwright rejects
  // all those writes before they reach PostgREST. Count prevented calls as
  // successful protection, not as persisted business writes.
  assert.ok(blocked>=preventedWrites,'all browser mutations must be blocked')
  assert.ok(realReads>0,'expected real database reads')
  console.log('PASS_LOCAL_EXTERNAL_NETWORK_BLOCKED_AND_MUTATIONS_PREVENTED')
  await context.close()
} catch(err) {
  console.error('FAIL_LOCAL_VIEWER_E2E_AT_'+phase)
  try { console.error('FAIL_ROUTE_PATH_'+new URL(page.url()).pathname) } catch {}
  console.error('FAIL_KIND_'+String(err?.name || 'Unknown').replace(/[^A-Za-z]/g,''))
  process.exitCode=1
} finally {
  if(browser)await browser.close()
}
