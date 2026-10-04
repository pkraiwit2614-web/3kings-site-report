// Local-only UI fixtures. Every nonlocal request is mocked or blocked.
const {chromium}=require('playwright')
const assert=require('node:assert/strict')
const origin='http://127.0.0.1:3012'
const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{}}
const batch={id:'batch-fixture',site_operations_entry_id:'entry-fixture',work_date:'2026-09-01',expected_headcount:1,supervisor_worker_id:'LEADER',supervisor_raw:'Fixture Leader',home_team:'Fixture Team',verification_status:'verified',verified_at:'2026-09-01T10:00:00Z'}
const fixtures={profiles:[{user_id:user.id,full_name:'Fixture QA',role:'manager',active:true}],
 site_operations_entries:[{id:'entry-fixture',work_date:batch.work_date,source_row:1,supervisor_raw:batch.supervisor_raw,total_manpower:1,work_detail:'Synthetic work only',work_date_validation_status:'valid'}],
 labour_verification_batches:[batch],labour_workers:[{worker_id:'WORKER',full_name:'Fixture Worker',default_team:'Fixture Team',status:'Active'},{worker_id:'LEADER',full_name:'Fixture Leader',default_team:'Fixture Team',status:'Active'}],
 labour_daily_assignments:[{id:'assignment-fixture',batch_id:batch.id,worker_id:'WORKER',work_date:batch.work_date,home_team:'Fixture Team',working_team:'Fixture Team'}],
 payroll_verification_records:[],payroll_verification_items:[],projects:[],site_operations_entry_projects:[]}
;(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  await context.addInitScript(({user})=>{
   const payload=btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}))
   localStorage.setItem('sb-wtqubwdduzedmcvyhbgs-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}))
  },{user})
  const writes=[];let failSave=false
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url())
   if(url.origin===origin)return route.continue()
   if(url.hostname!=='wtqubwdduzedmcvyhbgs.supabase.co')return route.abort()
   if(url.pathname.startsWith('/auth/v1/user'))return route.fulfill({json:user})
   if(url.pathname.endsWith('/rpc/payroll_save_verification')){
    const payload=req.postDataJSON();writes.push(payload)
    if(failSave)return route.fulfill({status:400,json:{message:'PAYROLL_RULES_NOT_APPROVED',code:'P0001'}})
    return route.fulfill({json:'record-fixture'})
   }
   if(!['GET','HEAD','OPTIONS'].includes(req.method()))throw Error('Unexpected fixture write '+url.pathname)
   const rows=fixtures[url.pathname.split('/').at(-1)]||[]
   return route.fulfill({headers:{'content-range':rows.length?`0-${rows.length-1}/${rows.length}`:'*/0'},json:req.headers().accept?.includes('vnd.pgrst.object')?(rows[0]||null):rows})
  })
  await context.routeWebSocket('**/realtime/**',ws=>ws.close())
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/reports/labour')
  await page.getByRole('button',{name:'Payroll Verification Record',exact:true}).click()
  await page.getByRole('button',{name:'เริ่มตรวจบัตรตอก',exact:true}).click()
  await page.getByRole('button',{name:'บันทึกร่าง',exact:true}).click()
  await page.getByText('บันทึกฉบับร่าง Payroll Verification Record แล้ว',{exact:true}).waitFor()
  assert.equal(writes[0].p_status,'draft')
  for(const key of ['regular_rate','ot_rate','regular_pay','ot_pay','total_pay','calculation_status'])assert(!Object.hasOwn(writes[0].p_items[0],key),key+' must not be sent')
  console.log('PASS UI draft save; payload has no monetary authority')
  await page.getByRole('button',{name:'✓ ตรงทุกคน',exact:true}).click()
  await page.getByRole('button',{name:'ยืนยันตรวจบัตรตอก',exact:true}).click()
  await page.getByText('ตรวจบัตรตอกครบแล้ว • บันทึก Payroll Verification Record • ยอดเงินรอ Rate Master',{exact:true}).waitFor()
  assert.equal(writes[1].p_status,'timecard_checked')
  console.log('PASS UI timecard_checked save without rates')
  await page.locator('details.legacy-payroll summary').click()
  assert(await page.getByRole('button',{name:'รอกติกาบัญชียืนยัน',exact:true}).isDisabled())
  console.log('PASS UI Excel verification disabled')
  const units=page.locator('.payroll-worker-table input[type=number]').first()
  await units.fill('0.999')
  await page.getByRole('button',{name:'บันทึกร่าง',exact:true}).click()
  await page.getByText('กรุณาระบุวันทำงาน 0–1 และ OT 0–24 เป็นตัวเลขทศนิยมไม่เกิน 2 ตำแหน่ง',{exact:true}).waitFor()
  assert.equal(writes.length,2)
  await units.fill('1');failSave=true
  await page.getByRole('button',{name:'บันทึกร่าง',exact:true}).click()
  await page.getByText('ยังยืนยันยอดเงินไม่ได้: รออัตรา สูตร และกติกาปัดเศษที่บัญชีอนุมัติ',{exact:true}).waitFor()
  console.log('PASS UI invalid precision blocked and server error translated')
  await page.setViewportSize({width:390,height:844})
  assert(await page.getByRole('button',{name:'บันทึกร่าง',exact:true}).isVisible())
  assert.equal(errors.length,0,errors.join('\n'))
  console.log('PASS mobile controls present; no browser page errors. Synthetic mocked backend only.')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
