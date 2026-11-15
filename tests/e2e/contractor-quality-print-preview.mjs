// PR #289: isolated actual Next.js /contractor-quality Print Preview with synthetic rows.
// Reuse existing local Supabase stack, real authenticated editor role, and Playwright.
// ALL browser network traffic is restricted to localhost; no hosted user data or writes.
import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
import {randomBytes} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
const APP='http://127.0.0.1:3010'
const DB='http://127.0.0.1:54321'
if(process.env.API_URL!==DB||!process.env.SERVICE_ROLE_KEY||!process.env.ANON_KEY)throw Error('BLOCK_REMOTE_TEST_ENV')
const {chromium}=await import('playwright')
const admin=createClient(DB,process.env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const secret=randomBytes(24).toString('base64url')
const email='cq-preview-'+randomBytes(9).toString('hex')+'@gmail.com'
let userId
let browser
let phase='BOOTSTRAP'
try {
  const {data,error}=await admin.auth.admin.createUser({
    email,password:secret,email_confirm:true,
    app_metadata:{app_role:'viewer_editor',provisioned_by_admin:true}
  })
  if(error||!data?.user?.id)throw Error('FAIL_LOCAL_EDITOR_AUTH')
  userId=data.user.id
  const profile=await admin.from('profiles').insert({
    user_id:userId,full_name:'CI-ONLY QUALITY PRINT',role:'viewer_editor',active:true,email
  })
  if(profile.error)throw Error('FAIL_LOCAL_EDITOR_PROFILE')
  const history=Array.from({length:72},(_,index)=>({
    work_id:'CI-WORK-'+String(index+1).padStart(3,'0'),
    room_group:'A'+String(101+index),
    building:'A',
    contractor:'Pre Fur.',
    defect_item:'Synthetic furniture alignment inspection — test sample '+String(index+1)+'; check panel and hinges',
    work_status:'รอตรวจ',
    evidence_url:null,
    source_file_id:null,
    source_modified_at:'2026-11-15T08:15:00+07:00',
    source_confirmed:true,
    source_origin:'master_register'
  }))
  const snapshot=history.map(r=>({
    work_id:r.work_id,room_group:r.room_group,building:r.building,
    contractor:r.contractor,defect_item:r.defect_item,
    work_status:r.work_status,source_active:true,imported_at:'2026-11-15T08:25:00+07:00'
  }))
  await mkdir('tests/e2e/artifacts',{recursive:true})
  browser=await chromium.launch({headless:true})
  const context=await browser.newContext({viewport:{width:1440,height:960}})
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method().toUpperCase()
    if(url.origin===APP)return method==='GET'||method==='HEAD'?route.continue():route.abort('blockedbyclient')
    if(url.origin!==DB)return route.abort('blockedbyclient')
    if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password')return route.continue()
    if(method==='POST'&&['role_permission_matrix_read','defect_report_latest_change_at'].some(name=>url.pathname==='/rest/v1/rpc/'+name))return route.continue()
    if(!['GET','HEAD','OPTIONS'].includes(method))return route.abort('blockedbyclient')
    if(url.pathname==='/rest/v1/contractor_quality_history'||url.pathname==='/rest/v1/defect_work_order_snapshot')
      return route.fulfill({status:200,headers:{'content-type':'application/json'},
        body:JSON.stringify(url.pathname.endsWith('contractor_quality_history')?history:snapshot)})
    const table=url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)
    if(table&&table[1]!=='profiles'){
      const object=(req.headers().accept||'').includes('vnd.pgrst.object')
      return route.fulfill({status:200,headers:{'content-type':'application/json','content-range':'*/0'},
        body:JSON.stringify(object?null:[])})
    }
    return route.continue()
  })
  await context.routeWebSocket('**/*',socket=>socket.close())
  const page=await context.newPage()
  page.setDefaultTimeout(30000)
  phase='LOGIN'
  await page.goto(APP+'/login',{waitUntil:'domcontentloaded'})
  await page.getByPlaceholder('เช่น USER01').fill(email)
  await page.getByPlaceholder('กรอกรหัสผ่าน').fill(secret)
  await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click()
  await page.waitForURL(u=>u.pathname==='/',{timeout:35000})
  phase='CONTRACTOR_QUALITY_SCREEN'
  await page.goto(APP+'/contractor-quality',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>document.querySelectorAll('.quality-table-scroll tbody tr').length===72)
  assert.equal(await page.locator('.quality-table-scroll tbody tr').count(),72)
  assert.equal(await page.getByRole('heading',{name:'ความครบถ้วนของข้อมูล'}).count(),0)
  assert.equal(await page.getByRole('button',{name:'พิมพ์รายงาน Contractor Quality'}).count(),1)
  const scroll=page.locator('.quality-table-scroll')
  await scroll.evaluate(el=>{el.scrollTop=350})
  const screenMetrics=await scroll.evaluate(el=>{
    const heading=el.querySelector('thead th'),headBox=heading.getBoundingClientRect(),box=el.getBoundingClientRect()
    return {scrollTop:el.scrollTop,headOffset:headBox.top-box.top,position:getComputedStyle(heading).position}
  })
  assert.ok(screenMetrics.scrollTop>0,'drilldown should scroll vertically')
  assert.equal(screenMetrics.position,'sticky')
  assert.ok(Math.abs(screenMetrics.headOffset)<4,'sticky headings remain at table viewport top')
  await page.screenshot({path:'tests/e2e/artifacts/contractor-quality-screen.png',fullPage:true})
  phase='PRINT_BUTTON'
  await page.evaluate(()=>{window.__qualityPrintCalls=0;window.print=()=>{window.__qualityPrintCalls++}})
  await page.getByRole('button',{name:'พิมพ์รายงาน Contractor Quality'}).click()
  await page.waitForFunction(()=>window.__qualityPrintCalls===1&&document.body.classList.contains('report-print-mode'))
  assert.equal(await page.locator('body').getAttribute('data-print-report'),'Contractor Quality')
  phase='A4_PRINT_PREVIEW'
  await page.emulateMedia({media:'print'})
  const metrics=await page.evaluate(()=>{
    const el=document.querySelector('.quality-table-scroll')
    const table=el?.querySelector('table')
    const header=document.querySelector('.report-print-header')
    return {
      headerVisible:header&&getComputedStyle(header).display!=='none',
      printTitle:header?.textContent||'',
      rowCount:el?.querySelectorAll('tbody tr').length||0,
      viewportOverflow:getComputedStyle(el).overflow,
      viewportMaxHeight:getComputedStyle(el).maxHeight,
      tableMinWidth:getComputedStyle(table).minWidth,
      tableW:table?.getBoundingClientRect().width||0,
      viewportW:el?.getBoundingClientRect().width||0,
      headGroup:getComputedStyle(table?.querySelector('thead')).display,
      missingCard:document.body.textContent.includes('ความครบถ้วนของข้อมูล')
    }
  })
  assert.equal(metrics.headerVisible,true,'printed report has Work Order shared header')
  assert.ok(metrics.printTitle.includes('Contractor Quality'))
  assert.equal(metrics.rowCount,72,'all 72 synthetic rows must remain printable')
  assert.equal(metrics.viewportOverflow,'visible','no clipped rows')
  assert.equal(metrics.viewportMaxHeight,'none','no scrolling height limit in print')
  assert.ok(metrics.tableW<=metrics.viewportW+2,'landscape print table fits available width')
  assert.equal(metrics.headGroup,'table-header-group','print header repeats across pages')
  assert.equal(metrics.missingCard,false,'removed card absent on printed report')
  await page.screenshot({path:'tests/e2e/artifacts/contractor-quality-print.png',fullPage:true})
  const bytes=await page.pdf({
    path:'tests/e2e/artifacts/contractor-quality-print.pdf',
    format:'A4',landscape:true,printBackground:true,
    margin:{top:'10mm',bottom:'10mm',left:'10mm',right:'10mm'}
  })
  assert.ok(bytes.length>25000,'actual Chromium print PDF generated')
  console.log('PASS_CONTRACTOR_QUALITY_PRINT_PREVIEW_REAL_BROWSER_72_SYNTHETIC_ROWS')
  console.log('PASS_PRINT_STICKY_A4_LANDSCAPE_NO_TRUNCATION_SHARED_HEADER')
  await context.close()
} catch(error) {
  console.error('FAIL_CONTRACTOR_QUALITY_PRINT_PREVIEW_AT_'+phase)
  console.error(String(error?.message||error).replaceAll(email,'[REDACTED]'))
  process.exitCode=1
} finally {
  if(browser)await browser.close()
  if(userId){await admin.auth.admin.deleteUser(userId).catch(()=>{})}
}
