// Synthetic local sessions only. Never sends credentials or writes to production.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),vm=require('vm')
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/accessControl.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});const access=m.exports
const origin='http://127.0.0.1:3010'
;(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']})
 try{for(const role of ['viewer','viewer_editor','purchase','admin','defect_contributor','defect_editor']){
 const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{}}
 const context=await browser.newContext()
 await context.addInitScript(({user})=>{const payload=btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}));localStorage.setItem('sb-wtqubwdduzedmcvyhbgs-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}))},{user})
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
 if(url.origin===origin){
 if(url.pathname==='/api/access-control'){const allowed=access.canAccessPath(role,url.searchParams.get('path'));return route.fulfill({status:allowed?200:403,json:{allowed,role,redirect:allowed?null:access.defaultPathForRole(role)}})}
 if(url.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,events:[],calendars:[]}})
 return route.continue()}
 if(url.hostname!=='wtqubwdduzedmcvyhbgs.supabase.co')return route.abort()
 if(url.pathname.startsWith('/auth/v1/user'))return route.fulfill({json:user})
 const table=url.pathname.split('/').at(-1);const rows=table==='profiles'?[{user_id:user.id,full_name:'QA',role,active:true}]:[]
 return route.fulfill({headers:{'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`},json:req.headers().accept?.includes('vnd.pgrst.object')?(rows[0]||null):rows})
 });await context.routeWebSocket('**/realtime/**',ws=>ws.close());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/defect-flow');await page.locator('nav').first().waitFor();await page.waitForTimeout(350)
 assert.equal(await page.locator('input[type=file]').count(),role==='defect_editor'?1:0,role+' defect upload')
 const restricted=role.startsWith('defect_');assert.equal(await page.locator('a[href="/?section=defect#dashboard-defect"]').count(),restricted?0:1,role+' dashboard shortcut')
 assert.equal(await page.locator('a[href="/users"]').count(),0,role+' system menu')
 for(const [path,selector,editor] of [['/schedule','.editor-box','viewer_editor'],['/procurement','.procurement-editor','purchase']]){
 await page.goto(origin+path);await page.locator('nav').first().waitFor();await page.waitForTimeout(350)
 assert.equal(new URL(page.url()).pathname,restricted?'/defect-flow':path,role+' direct route')
 assert.equal(await page.locator(selector).count(),!restricted&&role===editor?1:0,role+' '+path+' editor')
 }
 await page.goto(origin+'/users');await page.waitForURL(origin+(restricted?'/defect-flow':'/'));assert.equal(await page.getByText('จัดการผู้ใช้งาน',{exact:true}).count(),0)
 assert.deepEqual(errors,[],role+' browser errors');console.log('PASS role UI, navigation, direct routes:',role);await context.close()
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
