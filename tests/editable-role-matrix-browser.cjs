// Local browser contract test with synthetic sessions and intercepted services only.
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'.']}))
const assert=require('node:assert/strict')
const origin=process.env.MATRIX_TEST_ORIGIN||'http://127.0.0.1:3011'
const user={id:'bc6ee244-3472-422f-bbf9-d551987ee9a3',email:'fixture@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{}}
let snapshot={revision:1,rows:require('./role-matrix-defaults.json').map(x=>({...x}))},saves=[]
;(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']})
 try{
  const context=await browser.newContext()
  await context.addInitScript(({user})=>{const payload=btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}));localStorage.setItem('sb-wtqubwdduzedmcvyhbgs-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}))},{user})
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url())
   if(url.origin===origin){
    if(url.pathname==='/api/access-control')return route.fulfill({json:{allowed:true,role:'owner',permissions:snapshot}})
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true}})
    return route.continue()
   }
   if(url.hostname!=='wtqubwdduzedmcvyhbgs.supabase.co')return route.abort()
   if(url.pathname.startsWith('/auth/v1/user'))return route.fulfill({json:user})
   if(url.pathname.endsWith('/rpc/role_permission_matrix_read'))return route.fulfill({json:snapshot})
   if(url.pathname.endsWith('/rpc/role_permission_matrix_history'))return route.fulfill({json:[]})
   if(url.pathname.endsWith('/rpc/role_permission_matrix_save')){
    const body=req.postDataJSON();saves.push(body);assert.equal(body.p_expected_revision,snapshot.revision)
    snapshot={revision:snapshot.revision+1,rows:snapshot.rows.map(r=>{const c=body.p_changes.find(c=>c.role===r.role&&c.module===r.module);return c?{...r,level:c.level}:r})}
    return route.fulfill({json:snapshot})
   }
   if(url.pathname.includes('/functions/v1/admin-users'))return route.fulfill({json:{ok:true,users:[]}})
   const rows=url.pathname.endsWith('/profiles')?[{user_id:user.id,full_name:'QA Owner',role:'manager',active:true}]:[]
   return route.fulfill({json:req.headers().accept?.includes('vnd.pgrst.object')?(rows[0]||null):rows})
  })
  await context.routeWebSocket('**/realtime/**',ws=>ws.close())
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/users');await page.getByRole('button',{name:'Permission Matrix',exact:true}).click()
  const cell=page.getByRole('combobox',{name:'Viewer / Schedule / Plan vs Actual',exact:true})
  await cell.waitFor();assert.equal(await cell.inputValue(),'view')
  await cell.selectOption('manage');assert.equal(saves.length,0)
  await page.getByRole('button',{name:'ตรวจสอบก่อนบันทึก (1)',exact:true}).click();assert.equal(saves.length,0)
  await page.getByRole('button',{name:'ยืนยันบันทึกสิทธิ์',exact:true}).click()
  await page.getByRole('status').filter({hasText:'บันทึกสิทธิ์แล้ว'}).waitFor()
  assert.deepEqual(saves[0],{p_expected_revision:1,p_changes:[{role:'viewer',module:'schedule',level:'manage'}]})
  await page.reload();await page.getByRole('button',{name:'Permission Matrix',exact:true}).click();await cell.waitFor();assert.equal(await cell.inputValue(),'manage')
  await page.getByRole('button',{name:'คืนค่าเริ่มต้น',exact:true}).click();assert.equal(await cell.inputValue(),'view');assert.equal(saves.length,1)
  await page.getByRole('button',{name:'ยกเลิกการแก้ไข',exact:true}).click();assert.equal(await cell.inputValue(),'manage')
  assert.equal(await page.getByRole('combobox',{name:/^Owner \//}).count(),0)
  assert.deepEqual(errors,[])
  await page.screenshot({path:'/tmp/role-permission-matrix-browser.png',fullPage:true})
  console.log('PASS: browser owner matrix, staged edits, confirmation, minimal save payload, reload persistence, restore and cancel; no page errors')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
