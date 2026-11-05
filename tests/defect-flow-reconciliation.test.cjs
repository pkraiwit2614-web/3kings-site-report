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
