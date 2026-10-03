// Local-only integration fixtures. No production login, records, or API writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert=require('node:assert/strict')
let activeBrowser
const origin=process.env.TEST_ORIGIN || 'http://127.0.0.1:3010'
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Fixture tests must run on localhost')
const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{}}
const project={id:'p6',code:'AV-P6',name:'Above Villa Plot 6',active:true,sort_order:1}
const task={id:'t1',project_id:'p6',source_task_no:'1',task_name:'TEST-TASK-SAFE',category:'งานทดสอบ',actual_progress:0.5,current_plan_progress:0.5,current_variance:0,delay_days:0}
const room=(no)=>({room_no:no,building:no[0],floor:5,owner_name:'Fixture owner',hotel_participation:'ร่วมโรงแรม',customer_status:'มีลูกค้า',current_status:'Hotel - Incomplete',status_group:'Hotel - Incomplete',defect_detail:'<img src=x onerror="window.__xss=1"> TEST-DEFECT-SAFE',source_modified_at:'2026-10-03T04:00:00Z',synced_at:'2026-10-03T04:00:00Z'})
const fixtures={profiles:[{user_id:user.id,full_name:'Fixture QA',role:'manager',active:true}],projects:[project],v_schedule_tasks:[task],schedule_tasks:[task],
 materials:[{id:'m1',project_id:'p6',item_name:'TEST-MATERIAL-SAFE',status:'สั่งแล้ว',source_row:1}],
 procurement_items:[{id:'pr1',project_id:'p6',vendor:'TEST-SUPPLIER',item_name:'TEST-PURCHASE-SAFE',current_status:'รอส่ง',source_row:1}],
 procurement_item_projects:[{procurement_item_id:'pr1',project_id:'p6'}],tool_machine:[{id:'tool1',item_no:1,item_name:'TEST-TOOL-SAFE'}],
 drive_sync_runs:[{created_at:'2026-10-03T04:00:00Z',sync_type:'materials',status:'success',rows_written:1}],
 condo_room_status:[room('A521'),room('A522'),{...room('B501'),status_group:'Non-Hotel - Handover Complete'}],
 daily_reports:[],v_schedule_snapshot_days:[],condo_defect_rooms:[],drive_photo_index:[],report_photos:[]}
;(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']})
 activeBrowser=browser
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 let failTable=''; const errors=[]; const writes=[]
 await context.addInitScript(({user})=>{
   const payload=btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'}))
   localStorage.setItem('sb-wtqubwdduzedmcvyhbgs-auth-token',JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}))
 },{user})
 await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url())
   if(url.origin===origin)return route.continue()
   if(url.hostname!=='wtqubwdduzedmcvyhbgs.supabase.co')return route.abort()
   if(!['GET','HEAD','OPTIONS'].includes(req.method()))writes.push(req.url())
   if(url.pathname.startsWith('/auth/v1/user'))return route.fulfill({json:user})
   const table=url.pathname.split('/').at(-1)
   if(table===failTable)return route.fulfill({status:503,json:{message:'fixture DB unavailable'}})
   const rows=fixtures[table]||[]
   return route.fulfill({json:req.headers().accept?.includes('vnd.pgrst.object')?(rows[0]||null):rows})
 })
 await context.routeWebSocket('**/realtime/**',ws=>ws.close())
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 for(const [pathname,table,needle] of [['/materials','materials','TEST-MATERIAL-SAFE'],['/procurement','procurement_items','TEST-PURCHASE-SAFE'],['/','v_schedule_tasks','PROJECT KPI SUMMARY'],['/defects','condo_room_status','A521']]){
   failTable='';await page.goto(origin+pathname)
   await page.getByText(needle,{exact:false}).first().waitFor({timeout:15000})
   failTable=table;await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
   await page.locator('.panel[role="alert"]').waitFor({timeout:6000})
   assert(await page.getByText(needle,{exact:false}).count()>0,pathname+' lost last good data')
   await page.getByRole('button',{name:'ลองใหม่',exact:true}).click({timeout:5000});failTable=''
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
   await page.locator('.panel[role="alert"]').waitFor({state:'detached',timeout:6000})
   console.log('PASS load + offline retains data + retry',pathname)
 }
 const search=page.getByRole('textbox',{name:/ค้นหาเลขห้อง/})
 for(const query of ['A521, A522','A521','A522, B501','']){
   await search.fill(query)
   const expected=query==='A521'?1:query==='A522, B501'?1:2
   await page.waitForFunction(n=>document.querySelectorAll('.combine-room-code').length===n,expected)
   assert.equal(await page.locator('.combine-room-code').count(),expected)
 }
 assert.equal(await page.locator('.defect-detail img').count(),0)
 assert.equal(await page.evaluate(()=>Boolean(window.__xss)),false)
 console.log('PASS comma search + Combine across repeated filtering + escaped HTML')
 await page.screenshot({path:'/tmp/defects-stability.png',fullPage:true})
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 console.log('PASS no browser runtime errors; no production API writes')
 await browser.close()
})().catch(async e=>{console.error(e);if(activeBrowser)await activeBrowser.close();process.exitCode=1})
