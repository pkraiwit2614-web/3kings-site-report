const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const source=fs.readFileSync(path.join(__dirname,'../app/defect-flow/page.tsx'),'utf8')
const pure=source.slice(0,source.indexOf('export default function DefectFlowPage')).replace(/^import .*\r?\n/gm,'')
const js=ts.transpileModule(pure,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText
const {buildingCounts,hotelStatusItems,BuildingFlow,flowFooterItems,HotelFlowDiagram}=new Function('React','DEFECT_AWAITING_ACCEPTANCE_LABEL',js+';return {buildingCounts,hotelStatusItems,BuildingFlow,flowFooterItems,HotelFlowDiagram}')(React,'Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ')
const row=(room,customer,hotel,group,current='Defect ยังไม่เสร็จ / ต้องปิดงาน')=>({room_no:room,building:'A',customer_status:customer,hotel_participation:hotel,status_group:group,current_status:current,synced_at:null})
const old=row('A801','มีลูกค้า','ร่วมโรงแรม','Hotel - Incomplete')
const newly=row('A802','มีลูกค้า','ร่วมโรงแรม','Hotel - Incomplete','เพิ่งได้รับแจ้ง Defect')
const checked=row('A803','มีลูกค้า','ร่วมโรงแรม','Hotel - Checked Complete','Hotel Engineer ตรวจแล้ว')

test('Hotel branch includes older unfinished work exactly once alongside newly reported work',()=>{
 const rows=[old,newly,checked]
 const cards=hotelStatusItems(buildingCounts(rows,'A'),'A',true)
 assert.equal(cards.reduce((n,c)=>n+c.count,0),3)
 const open=cards.find(c=>c.tone==='danger')
 assert.equal(open.count,2)
 assert.deepEqual(open.roomNos,['A801','A802'])
 assert.match(open.href,/filter=hotel-customer-incomplete/)
 assert.ok(open.lines.join(' ').includes('แจ้งใหม่ 1'))
 assert.ok(open.lines.join(' ').includes('เดิม 1'))
 assert.equal(cards.length,3,'use the existing red card rather than adding a status')
})

test('Full Flow non-Hotel branch retains older work and links the same two rooms',()=>{
 const rows=[row('A804','มีลูกค้า','ไม่ร่วมโรงแรม','Non-Hotel - Incomplete'),row('A805','มีลูกค้า','ไม่ร่วมโรงแรม','Non-Hotel - Incomplete','เพิ่งได้รับแจ้ง Defect')]
 const html=renderToStaticMarkup(React.createElement(BuildingFlow,{top:190,building:'A',data:buildingCounts(rows,'A')}))
 assert.ok(html.includes('filter=nonhotel-customer-incomplete'))
 assert.ok(html.includes('A804, A805'))
 assert.ok(html.includes('แจ้งใหม่ 1'))
})

test('footer includes unfinished work once and preserves the newly reported subset',()=>{
 const cards=flowFooterItems({awaitingSale:0,roomInspection:0,checked:1,handover:0,awaitingAcceptance:0,incomplete:2,newly:1})
 assert.equal(cards.reduce((n,c)=>n+c.count,0),3)
 const open=cards.find(c=>c.tone==='danger')
 assert.equal(open.count,2)
 assert.match(open.href,/filter=status-incomplete/)
 assert.ok(open.lines.join(' ').includes('แจ้งใหม่ 1'))
})

test('Hotel footer, branch counts and room total reconcile for physical and Combine units',()=>{
 for(const rows of [[old,newly,checked],[{...old,display_room:'A801/A802'},checked]]){
  const html=renderToStaticMarkup(React.createElement(HotelFlowDiagram,{rows,synced:null,combineMode:rows.length===2}))
  assert.ok(html.includes('filter=hotel-status-incomplete'))
  const cards=hotelStatusItems(buildingCounts(rows,'A'),'A',true)
  assert.equal(cards.reduce((n,c)=>n+c.count,0),rows.length)
 }
})

test('Dashboard Condo Summary uses canonical Flow status counts for all 263 physical rooms without data mutation',()=>{
 const dashboardSource=fs.readFileSync(path.join(__dirname,'../components/DashboardCondoDefectSummary.tsx'),'utf8')
 const dashboardPure=dashboardSource.slice(0,dashboardSource.indexOf('export default function DashboardCondoDefectSummary')).replace(/^import .*\r?\n/gm,'')
 const dashboardJs=ts.transpileModule(dashboardPure,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText
 const {rowsForStatus,finalStatuses}=new Function('DEFECT_AWAITING_ACCEPTANCE_LABEL',dashboardJs+';return {rowsForStatus,finalStatuses}')('Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ')
 const presentationSource=fs.readFileSync(path.join(__dirname,'../lib/defectStatusPresentation.ts'),'utf8')
 const presentationJs=ts.transpileModule(presentationSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 const mod={exports:{}}
 new Function('module','exports',presentationJs)(mod,mod.exports)
 const {canonicalDefectStatusGroup}=mod.exports
 let seq=0
 const make=(count,group,hotel,current='')=>Array.from({length:count},()=>({
   room_no:'QA'+(++seq),building:'A',customer_status:'มีลูกค้า',
   hotel_participation:hotel,current_status:current,status_group:group,synced_at:null,
 }))
 // Reproduce the categories present in the production 263-room snapshot, including
 // historical handover/pending states reopened by nine newly reported defects.
 const raw=[
   ...make(131,'Hotel - Checked Complete','ร่วมโรงแรม'),
   ...make(67,'Non-Hotel - Handover Complete','ไม่ร่วมโรงแรม'),
   ...make(40,'Non-Hotel - Pending Handover','ไม่ร่วมโรงแรม'),
   ...make(1,'Non-Hotel - Pending Handover','ร่วมโรงแรม'),
   ...make(13,'Hotel - Awaiting Check','ร่วมโรงแรม'),
   ...make(1,'Hotel - Completed / Awaiting Hotel Inspection','ร่วมโรงแรม'),
   ...make(1,'Hotel - Incomplete','ร่วมโรงแรม','Defect ยังไม่เสร็จ'),
   ...make(6,'Non-Hotel - Pending Handover','ไม่ร่วมโรงแรม','เพิ่งได้รับแจ้ง Defect 07/11/2026'),
   ...make(2,'Non-Hotel - Handover Complete','ไม่ร่วมโรงแรม','เพิ่งได้รับแจ้ง Defect 07/11/2026'),
   ...make(1,'Handover Complete','ไม่ร่วมโรงแรม','เพิ่งได้รับแจ้ง Defect 07/11/2026'),
 ]
 const original=JSON.stringify(raw)
 const projected=raw.map(r=>({...r,status_group:canonicalDefectStatusGroup(r.status_group,r.hotel_participation,r.current_status)}))
 const byKey=Object.fromEntries(finalStatuses.map(s=>[s.key,rowsForStatus(projected,s).length]))
 assert.deepEqual(byKey,{
   'status-handover-complete':67,
   'status-awaiting-hotel':14,
   'status-incomplete':10,
   'status-hotel-checked':131,
   'status-pending-handover':41,
 })
 assert.equal(Object.values(byKey).reduce((sum,n)=>sum+n,0),263)
 assert.equal(byKey['status-awaiting-hotel']+byKey['status-pending-handover'],55)
 assert.equal(byKey['status-incomplete'],projected.filter(r=>r.status_group==='Hotel - Incomplete'||r.status_group==='Non-Hotel - Incomplete').length)
 assert.equal(JSON.stringify(raw),original,'Dashboard normalization must not overwrite source statuses')
 assert.match(dashboardSource,/canonicalDefectStatusGroup\(row\.status_group,row\.hotel_participation,row\.current_status\)/)
 assert.match(dashboardSource,/select\('room_no,building,customer_status,hotel_participation,current_status,status_group,synced_at'\)/)
 assert.doesNotMatch(dashboardSource,/\.from\('condo_room_status'\)\.(update|insert|upsert|delete)\(/)
})
