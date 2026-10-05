const {chromium}=require('playwright')
const assert=require('node:assert/strict')

const origin=process.env.APP_URL||'http://127.0.0.1:3000'
const supabaseOrigin='https://wtqubwdduzedmcvyhbgs.supabase.co'
const userId='33333333-3333-4333-8333-333333333333'
const user={id:userId,email:'prompt15-e2e@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{}}
const entry={
  id:'a1500000-0000-4000-8000-000000000001',work_date:'2026-10-04',source_row:1501,
  project_name_raw:'PTEST',area_raw:'Prompt 15 E2E',supervisor_raw:'Synthetic Supervisor',
  male_count:1,female_count:0,total_manpower:1,work_detail:'Attendance evidence E2E',
  status_text:'TEST',next_plan:null,afternoon_detail:null,specific_area:null,
  source_fingerprint:'prompt15-fp-1',supervisor_worker_id:null,
  work_date_validation_status:'valid',work_date_validation_reason:null
}
const batch={
  id:'b1500000-0000-4000-8000-000000000001',site_operations_entry_id:entry.id,work_date:entry.work_date,
  expected_headcount:1,headcount_source_status:'matched',headcount_confirmation_status:'confirmed',
  headcount_discrepancy:{},confirmed_headcount:1,confirmed_headcount_basis:'source_total',
  confirmed_headcount_evidence:'Synthetic E2E',headcount_confirmed_by:userId,headcount_confirmed_at:'2026-10-04T03:00:00Z',
  supervisor_worker_id:null,supervisor_raw:entry.supervisor_raw,home_team:'Synthetic Team',
  verification_status:'verified',verified_by:userId,verified_at:'2026-10-04T03:00:00Z',
  verified_source_fingerprint:entry.source_fingerprint,note:null,concurrency_revision:1,
  contractor_person_count:null,contractor_count_basis:null,contractor_count_evidence:null,contractor_count_confirmed_at:null
}
const worker={
  worker_id:'W150',full_name:'Synthetic Worker',nickname:'E2E Worker',trade_skill:'Test',
  default_team:'Synthetic Team',status:'Active',display_label:'E2E Worker',
  worker_class:'company',payroll_eligible:true,payroll_eligibility_source:'synthetic_fixture',payroll_eligibility_evidence:'Prompt15 E2E'
}
const assignment={
  id:'d1500000-0000-4000-8000-000000000001',batch_id:batch.id,worker_id:worker.worker_id,work_date:entry.work_date,
  project_id:null,home_team:'Synthetic Team',working_team:'Synthetic Team',movement_status:'same_team',
  allocation_hours:null,allocation_share:null,work_detail:entry.work_detail,notes:null,verified_at:batch.verified_at
}
const fixtures={
  site_operations_entries:[entry],
  labour_verification_batches:[batch],
  labour_workers:[worker],
  projects:[],
  site_operations_entry_projects:[],
  labour_daily_assignments:[assignment],
  payroll_verification_records:[],
  payroll_verification_items:[]
}
function fakeJwt(){
  const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
  return enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:userId,role:'authenticated',exp:4102444800})+'.stub'
}
function authSession(){
  return {access_token:fakeJwt(),refresh_token:'fixture',expires_at:4102444800,expires_in:3600,token_type:'bearer',user}
}
async function fulfillJson(route,body,status=200){
  const contentRange=Array.isArray(body)?(body.length?('0-'+(body.length-1)+'/'+body.length):'*/0'):'0-0/1'
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':contentRange,'access-control-expose-headers':'Content-Range','access-control-allow-origin':'*'}})
}

;(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
  const writes=[]
  const pageErrors=[]
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}})
    await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{
      key:'sb-wtqubwdduzedmcvyhbgs-auth-token',value:JSON.stringify(authSession())
    })
    await context.route('**/api/access-control?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowed:true,role:'admin',redirect:null})}))
    await context.route(supabaseOrigin+'/**',async route=>{
      const req=route.request()
      const url=new URL(req.url())
      if(url.pathname==='/auth/v1/user')return fulfillJson(route,user)
      if(url.pathname==='/auth/v1/logout')return fulfillJson(route,{})
      if(url.pathname==='/rest/v1/profiles')return fulfillJson(route,{role:'admin',active:true})
      if(url.pathname==='/rest/v1/rpc/payroll_save_verification'){
        writes.push(req.postDataJSON())
        return fulfillJson(route,'p1500000-0000-4000-8000-000000000001')
      }
      const table=url.pathname.split('/').at(-1)
      if(Object.hasOwn(fixtures,table))return fulfillJson(route,fixtures[table])
      return fulfillJson(route,{message:'unhandled '+url.pathname},500)
    })
    await context.routeWebSocket('**/realtime/**',ws=>ws.close())

    const page=await context.newPage()
    page.on('pageerror',e=>pageErrors.push(e.message))
    await page.goto(origin+'/reports/labour?date=2026-10-04',{waitUntil:'domcontentloaded'})
    await page.getByText('Labour & Payroll Verification',{exact:true}).waitFor({state:'visible',timeout:15000})
    await page.getByRole('button',{name:'Payroll Verification Record',exact:true}).click()
    await page.getByRole('button',{name:'เริ่มตรวจบัตรตอก',exact:true}).click()

    const row=page.locator('.payroll-worker-table tbody tr').first()
    const match=row.locator('td').nth(8).locator('input[type=checkbox]')
    const finalButton=page.getByRole('button',{name:'ยืนยันตรวจบัตรตอก',exact:true})
    const clockIn=row.locator('input[type=time]').nth(0)
    const clockOut=row.locator('input[type=time]').nth(1)
    const units=row.locator('input[type=number]').nth(0)
    const ot=row.locator('input[type=number]').nth(1)
    const attendance=row.locator('select')
    const overnight=row.getByText('ออกวันถัดไป').locator('..').locator('input[type=checkbox]')
    const exception=row.getByText('ใช้ข้อยกเว้น').locator('..').locator('input[type=checkbox]')

    // blank clock: bulk matching must not turn this into checked.
    await page.getByRole('button',{name:'✓ ติ๊กเฉพาะหลักฐานครบ',exact:true}).click()
    assert.equal(await match.isDisabled(),true,'blank clock must disable matching')
    assert.equal(await finalButton.isDisabled(),true,'blank clock must block final')

    // missing punch.
    await clockIn.fill('08:00')
    assert.equal(await match.isDisabled(),true,'missing punch must disable matching')

    // clock-out before clock-in without explicit overnight.
    await clockIn.fill('22:00')
    await clockOut.fill('06:00')
    assert.equal(await match.isDisabled(),true,'clock-out < in must be invalid without overnight')

    // explicit overnight is allowed; no duration/shift rule is inferred.
    await overnight.check()
    assert.equal(await match.isDisabled(),false,'explicit overnight should make complete punches matchable')
    await match.check()
    assert.equal(await finalButton.isDisabled(),false,'explicit overnight complete evidence should allow final')

    // absent + units 1 must be rejected.
    await attendance.selectOption('absent')
    await units.fill('1')
    assert.equal(await match.isDisabled(),true,'absent + units 1 must be invalid')

    // leave + OT must be rejected.
    await attendance.selectOption('leave')
    await ot.fill('2')
    assert.equal(await match.isDisabled(),true,'leave + OT must be invalid')

    // half-day 0.5 with complete punches is valid.
    await attendance.selectOption('half_day')
    await ot.fill('0')
    assert.equal(await units.inputValue(),'0.5','half-day should use 0.5 work_units')
    assert.equal(await match.isDisabled(),false,'half-day 0.5 with complete punch should be valid')

    // invalid exception: missing evidence.
    await attendance.selectOption('present')
    await clockIn.fill('')
    await clockOut.fill('')
    if(await overnight.isChecked())await overnight.uncheck()
    await exception.check()
    const exceptionInputs=row.locator('.attendance-exception input:not([type=checkbox])')
    await exceptionInputs.nth(0).fill('เครื่องสแกนเสีย')
    assert.equal(await match.isDisabled(),true,'exception without evidence must be invalid')

    // valid exception: explicit reason + evidence, then server payload must carry audit fields.
    await exceptionInputs.nth(1).fill('Supervisor ref E2E-150')
    assert.equal(await match.isDisabled(),false,'complete explicit exception should be matchable')
    await page.getByRole('button',{name:'✓ ติ๊กเฉพาะหลักฐานครบ',exact:true}).click()
    assert.equal(await match.isChecked(),true,'valid exception should be marked by bulk action')
    assert.equal(await finalButton.isDisabled(),false,'valid exception should allow final')
    await finalButton.click()
    await page.getByText('ตรวจบัตรตอกครบแล้ว • บันทึก Payroll Verification Record • ยอดเงินรอ Rate Master',{exact:true}).waitFor({state:'visible',timeout:10000})

    assert.equal(writes.length,1,'expected one final RPC save')
    const payload=writes[0]
    assert.equal(payload.p_status,'timecard_checked')
    assert.equal(payload.p_expected_source_fingerprint,entry.source_fingerprint)
    assert.equal(payload.p_expected_batch_revision,1)
    assert.equal(payload.p_expected_payroll_revision,0)
    assert.equal(payload.p_items[0].attendance_exception_requested,true)
    assert.equal(payload.p_items[0].attendance_exception_reason,'เครื่องสแกนเสีย')
    assert.equal(payload.p_items[0].attendance_exception_evidence,'Supervisor ref E2E-150')
    assert.equal(payload.p_items[0].clock_spans_next_day,false)
    for(const money of ['regular_rate','ot_rate','regular_pay','ot_pay','total_pay','calculation_status']){
      assert.equal(Object.hasOwn(payload.p_items[0],money),false,'Prompt 2 money authority leaked: '+money)
    }
    assert.equal(pageErrors.length,0,pageErrors.join('\n'))
    await page.screenshot({path:'prompt15-attendance-e2e.png',fullPage:true})
    console.log(JSON.stringify({status:'PASS',cases:['blank clock','missing punch','clock-out<in','explicit overnight','absent+units1','leave+OT','half-day','invalid exception','valid exception'],payload},null,2))
  }finally{
    await browser.close()
  }
})().catch(err=>{console.error(err);process.exitCode=1})
