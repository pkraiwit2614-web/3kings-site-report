'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import useAccessRole from '@/components/useAccessRole'
import {canAccessPath} from '@/lib/accessControl'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import {flowCombineKey} from '@/lib/flowCombineOne'
import {DEFECT_AWAITING_ACCEPTANCE_LABEL} from '@/lib/defectStatusPresentation'
import {embedRenderedSvgFonts} from '@/lib/embedRenderedSvgFonts'

type FlowRow={
  room_no:string
  building:'A'|'B'|string
  customer_status:string
  hotel_participation:string
  status_group:string|null
  synced_at:string|null
}

type Tone='good'|'warn'|'danger'|'neutral'
type StatusItem={label:string;lines:string[];count:number;tone:Tone;href?:string}
const awaitingAcceptanceLines=DEFECT_AWAITING_ACCEPTANCE_LABEL.replace(' • ',' •\n').split('\n')

const GROUP={
  checked:'Hotel - Checked Complete',
  awaiting:'Hotel - Awaiting Check',
  roomInspection:'Hotel - Awaiting Room Inspection',
  incomplete:'Hotel - Incomplete',
  handover:'Non-Hotel - Handover Complete',
  pending:'Non-Hotel - Pending Handover',
  awaitingSale:'Non-Hotel - Awaiting Sale',
} as const

const COLORS={
  navy:'#172a43',
  navy2:'#213d5e',
  line:'#d9e0e7',
  text:'#223047',
  muted:'#6e7b8c',
  customer:'#eaf5ff',
  customerStroke:'#7eb7df',
  noCustomer:'#f1f3f5',
  noCustomerStroke:'#aab2bc',
  hotel:'#f2edfb',
  hotelStroke:'#9a7bd0',
  nonhotel:'#f5f6f7',
  nonhotelStroke:'#aab2bc',
  good:'#2e9a6a',
  goodSoft:'#edf9f2',
  warn:'#e2ad32',
  warnSoft:'#fff8e8',
  danger:'#d84d45',
  dangerSoft:'#fff1ef',
  neutral:'#4e5968',
  neutralSoft:'#f1f3f5',
} as const

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}

function latestDate(rows:FlowRow[]){
  const values=rows.map(r=>r.synced_at).filter(Boolean) as string[]
  if(!values.length)return null
  return values.reduce((a,b)=>new Date(b)>new Date(a)?b:a)
}

function toneColor(tone:Tone){
  if(tone==='good')return {main:COLORS.good,soft:COLORS.goodSoft}
  if(tone==='warn')return {main:COLORS.warn,soft:COLORS.warnSoft}
  if(tone==='danger')return {main:COLORS.danger,soft:COLORS.dangerSoft}
  return {main:COLORS.neutral,soft:COLORS.neutralSoft}
}

function defectHref({filter,building,q}:{filter?:string;building?:'A'|'B';q?:string}){
  const params=new URLSearchParams()
  if(filter)params.set('filter',filter)
  if(building)params.set('building',building)
  if(q)params.set('q',q)
  const query=params.toString()
  return `/defects${query?`?${query}`:''}#report-results`
}

// Preserve the original report URL and hash; this mode only changes display counts.
function withCombineHref(href:string|undefined,combineMode:boolean){
  if(!href||!combineMode)return href
  const hashIndex=href.indexOf('#')
  const path=hashIndex>=0?href.slice(0,hashIndex):href
  // Land on the real result table, not the summary/status cards above it.
  return path+(path.includes('?')?'&':'?')+'combine=1#report-results'
}

function SvgStatusCard({x,y,w,item}:{x:number;y:number;w:number;item:StatusItem}){
  const c=toneColor(item.tone)
  const card=<g>
    <rect x={x} y={y} width={w} height={58} rx={12} fill={c.soft} stroke={c.main} strokeWidth={2}/>
    <rect x={x} y={y} width={8} height={58} rx={8} fill={c.main}/>
    <text x={x+18} y={y+19} fontSize={13} fontWeight={800} fill={COLORS.text}>
      {item.lines.map((line,i)=><tspan key={line+i} x={x+18} dy={i===0?0:15}>{line}</tspan>)}
    </text>
    <text x={x+w-18} y={y+34} textAnchor="end" fontSize={24} fontWeight={900} fill={c.main}>{item.count}</text>
    <text x={x+w-18} y={y+48} textAnchor="end" fontSize={10} fontWeight={700} fill={COLORS.muted}>ห้อง</text>
  </g>
  return item.href?<a href={item.href} className="flow-link" aria-label={`เปิดรายละเอียด ${item.lines.join(' ')} ${item.count} ห้อง`}>{card}</a>:card
}

function SvgBranchCard({x,y,w=230,label,count,kind,href}:{x:number;y:number;w?:number;label:string;count:number;kind:'hotel'|'nonhotel';href?:string}){
  const hotel=kind==='hotel'
  const card=<g>
    <rect x={x} y={y} width={w} height={60} rx={12} fill={hotel?COLORS.hotel:COLORS.nonhotel} stroke={hotel?COLORS.hotelStroke:COLORS.nonhotelStroke} strokeWidth={2}/>
    <text x={x+w/2} y={y+24} textAnchor="middle" fontSize={15} fontWeight={800} fill={COLORS.text}>{label}</text>
    <text x={x+w/2} y={y+46} textAnchor="middle" fontSize={22} fontWeight={900} fill={hotel?'#6b4aa2':COLORS.neutral}>{count} ห้อง</text>
  </g>
  return href?<a href={href} className="flow-link" aria-label={`เปิดรายละเอียด ${label} ${count} ห้อง`}>{card}</a>:card
}

function SvgCustomerCard({x,y,label,count,formula,customer,href}:{x:number;y:number;label:string;count:number;formula:string;customer:boolean;href?:string}){
  const card=<g>
    <rect x={x} y={y} width={230} height={120} rx={16} fill={customer?COLORS.customer:COLORS.noCustomer} stroke={customer?COLORS.customerStroke:COLORS.noCustomerStroke} strokeWidth={2}/>
    <text x={x+115} y={y+35} textAnchor="middle" fontSize={17} fontWeight={800} fill={COLORS.text}>{label}</text>
    <text x={x+115} y={y+70} textAnchor="middle" fontSize={29} fontWeight={900} fill={customer?'#286e9d':COLORS.neutral}>{count} ห้อง</text>
    <text x={x+115} y={y+96} textAnchor="middle" fontSize={12} fontWeight={700} fill={COLORS.muted}>{formula}</text>
  </g>
  return href?<a href={href} className="flow-link" aria-label={`เปิดรายละเอียด ${label} ${count} ห้อง`}>{card}</a>:card
}

function Arrow({x1,y1,x2,y2}:{x1:number;y1:number;x2:number;y2:number}){
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#718095" strokeWidth={2.5} markerEnd="url(#arrow)"/>
}

function statusRow(y:number,items:StatusItem[]){
  const left=670,right=1874,gap=12
  const w=(right-left-gap*(items.length-1))/items.length
  return items.map((item,i)=><SvgStatusCard key={`${y}-${item.label}`} x={left+i*(w+gap)} y={y} w={w} item={item}/>)
}

function buildingCounts(rows:FlowRow[],building:'A'|'B'){
  const list=rows.filter(r=>r.building===building)
  const by=(customer:string,hotel:string)=>list.filter(r=>r.customer_status===customer&&r.hotel_participation===hotel)
  const status=(customer:string,hotel:string,group:string)=>by(customer,hotel).filter(r=>r.status_group===group).length
  const customerHotel=by('มีลูกค้า','ร่วมโรงแรม')
  const customerNon=by('มีลูกค้า','ไม่ร่วมโรงแรม')
  const noHotel=by('ไม่มีลูกค้า','ร่วมโรงแรม')
  const noNon=by('ไม่มีลูกค้า','ไม่ร่วมโรงแรม')
  return {
    total:list.length,
    customer:customerHotel.length+customerNon.length,
    noCustomer:noHotel.length+noNon.length,
    customerHotel:customerHotel.length,
    customerNon:customerNon.length,
    noHotel:noHotel.length,
    noNon:noNon.length,
    customerHotelChecked:status('มีลูกค้า','ร่วมโรงแรม',GROUP.checked),
    customerHotelHandover:status('มีลูกค้า','ร่วมโรงแรม',GROUP.handover),
    customerHotelAwaiting:status('มีลูกค้า','ร่วมโรงแรม',GROUP.awaiting),
    customerHotelRoomInspection:status('มีลูกค้า','ร่วมโรงแรม',GROUP.roomInspection),
    customerHotelIncomplete:status('มีลูกค้า','ร่วมโรงแรม',GROUP.incomplete),
    customerHotelPending:status('มีลูกค้า','ร่วมโรงแรม',GROUP.pending),
    customerNonHandover:status('มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.handover),
    customerNonPending:status('มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.pending),
    customerNonChecked:status('มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.checked),
    noHotelChecked:status('ไม่มีลูกค้า','ร่วมโรงแรม',GROUP.checked),
    noHotelHandover:status('ไม่มีลูกค้า','ร่วมโรงแรม',GROUP.handover),
    noHotelAwaiting:status('ไม่มีลูกค้า','ร่วมโรงแรม',GROUP.awaiting),
    noHotelPending:status('ไม่มีลูกค้า','ร่วมโรงแรม',GROUP.pending),
    noHotelIncomplete:status('ไม่มีลูกค้า','ร่วมโรงแรม',GROUP.incomplete),
    noNonAwaitingSale:status('ไม่มีลูกค้า','ไม่ร่วมโรงแรม',GROUP.awaitingSale),
  }
}

function hotelStatusItems(data:ReturnType<typeof buildingCounts>,building:'A'|'B',customer:boolean):StatusItem[]{
  // The Hotel Flow must reuse the exact status boxes from the hotel branches of Flow รวม.
  const hotelCustomer:StatusItem[]=[
    {label:'Hotel Checked',lines:['Hotel Engineer','ตรวจแล้ว'],count:data.customerHotelChecked,tone:'good',href:defectHref({filter:'hotel-customer-checked',building})},
    ...(data.customerHotelHandover>0?[{label:'Customer Accepted',lines:['ลูกค้าตรวจรับเรียบร้อยแล้ว'],count:data.customerHotelHandover,tone:'good' as Tone,href:defectHref({filter:'hotel-customer',building,q:'ลูกค้าตรวจรับเรียบร้อยแล้ว'})}]:[]),
    ...(data.customerHotelRoomInspection>0?[{label:'Awaiting Room',lines:['ยังไม่ตรวจห้อง','ยังไม่มี Defect'],count:data.customerHotelRoomInspection,tone:'warn' as Tone,href:defectHref({filter:'hotel-customer',building,q:'ยังไม่ตรวจห้อง'})}]:[]),
    {label:'Awaiting Acceptance',lines:awaitingAcceptanceLines,count:data.customerHotelPending+data.customerHotelAwaiting,tone:'warn',href:defectHref({filter:'hotel-customer-awaiting-receive',building})},
    {label:'New Defect',lines:['เพิ่งได้รับแจ้ง defect','และกำลังดำเนินการ'],count:data.customerHotelIncomplete,tone:'danger',href:defectHref({filter:'hotel-customer-incomplete',building})},
  ]
  const hotelNoCustomer:StatusItem[]=[
    {label:'Hotel Checked',lines:['Hotel Engineer','ตรวจแล้ว'],count:data.noHotelChecked,tone:'good',href:defectHref({filter:'hotel-nocustomer-checked',building})},
    ...(data.noHotelHandover>0?[{label:'Customer Accepted',lines:['ลูกค้าตรวจรับเรียบร้อยแล้ว'],count:data.noHotelHandover,tone:'good' as Tone,href:defectHref({filter:'hotel-nocustomer',building,q:'ลูกค้าตรวจรับเรียบร้อยแล้ว'})}]:[]),
    {label:'Awaiting Acceptance',lines:awaitingAcceptanceLines,count:data.noHotelAwaiting+data.noHotelPending,tone:'warn',href:defectHref({filter:'hotel-nocustomer-awaiting-receive',building})},
    {label:'New Defect',lines:['เพิ่งได้รับแจ้ง defect','และกำลังดำเนินการ'],count:data.noHotelIncomplete,tone:'danger',href:defectHref({filter:'hotel-nocustomer-incomplete',building})},
  ]
  return customer?hotelCustomer:hotelNoCustomer
}

function BuildingFlow({top,building,data,combineMode=false}:{top:number;building:'A'|'B';data:ReturnType<typeof buildingCounts>;combineMode?:boolean}){
  const link=(href:string|undefined)=>withCombineHref(href,combineMode)
  const soldY=top+60,unsoldY=top+220
  const b1=top+52,b2=top+128,b3=top+212,b4=top+288
  const customerHotelHref=link(defectHref({filter:'hotel-customer',building}))
  const customerNonHref=link(defectHref({filter:'nonhotel-customer',building}))
  const noHotelHref=link(defectHref({filter:'hotel-nocustomer',building}))
  const noNonHref=link(defectHref({filter:'nonhotel-no-customer',building}))
  const hotelCustomer=hotelStatusItems(data,building,true).map(item=>({...item,href:link(item.href)}))
  const hotelNoCustomer=hotelStatusItems(data,building,false).map(item=>({...item,href:link(item.href)}))
  const nonHotelCustomer:StatusItem[]=[
    {label:'Customer Accepted',lines:['ลูกค้าตรวจรับเรียบร้อยแล้ว'],count:data.customerNonHandover,tone:'good',href:link(defectHref({filter:'nonhotel-customer-complete',building}))},
    {label:'Awaiting Acceptance',lines:awaitingAcceptanceLines,count:data.customerNonPending+data.customerNonChecked,tone:'warn',href:link(defectHref({filter:'nonhotel-customer-awaiting-receive',building}))},
  ]
  const nonHotelNoCustomer:StatusItem[]=data.noNonAwaitingSale>0?[
    {label:'Awaiting Sale',lines:['Awaiting Sale','ยังไม่มีลูกค้า'],count:data.noNonAwaitingSale,tone:'neutral',href:link(defectHref({filter:'nonhotel-nosale',building}))},
  ]:[
    {label:'Clear',lines:['ไม่มีห้องคงค้าง'],count:0,tone:'good'},
  ]
  return <g>
    <a href={link(defectHref({building}))} className="flow-link" aria-label={`เปิดรายละเอียดตึก ${building}`}>
      <g><rect x={28} y={top} width={330} height={44} rx={12} fill={COLORS.navy}/><text x={48} y={top+29} fontSize={20} fontWeight={900} fill="#fff">ตึก {building} — {data.total} ห้อง</text></g>
    </a>

    <SvgCustomerCard x={44} y={soldY} label="มีลูกค้า (ขายแล้ว)" count={data.customer} formula={`${data.customerHotel} + ${data.customerNon} = ${data.customer}`} customer href={link(defectHref({filter:'customer',building}))}/>
    <SvgCustomerCard x={44} y={unsoldY} label="ไม่มีลูกค้า (ยังไม่ขาย)" count={data.noCustomer} formula={`${data.noHotel} + ${data.noNon} = ${data.noCustomer}`} customer={false} href={link(defectHref({filter:'no-customer',building}))}/>

    <Arrow x1={274} y1={soldY+60} x2={352} y2={b1+30}/><Arrow x1={274} y1={soldY+60} x2={352} y2={b2+30}/>
    <Arrow x1={274} y1={unsoldY+60} x2={352} y2={b3+30}/><Arrow x1={274} y1={unsoldY+60} x2={352} y2={b4+30}/>

    <SvgBranchCard x={356} y={b1} label="ร่วมโรงแรม" count={data.customerHotel} kind="hotel" href={customerHotelHref}/>
    <SvgBranchCard x={356} y={b2} label="ไม่ร่วมโรงแรม" count={data.customerNon} kind="nonhotel" href={customerNonHref}/>
    <SvgBranchCard x={356} y={b3} label="ร่วมโรงแรม" count={data.noHotel} kind="hotel" href={noHotelHref}/>
    <SvgBranchCard x={356} y={b4} label="ไม่ร่วมโรงแรม" count={data.noNon} kind="nonhotel" href={noNonHref}/>

    {[b1,b2,b3,b4].map(y=><Arrow key={`status-${y}`} x1={586} y1={y+30} x2={656} y2={y+30}/>)}
    {statusRow(b1+1,hotelCustomer)}
    {statusRow(b2+1,nonHotelCustomer)}
    {statusRow(b3+1,hotelNoCustomer)}
    {statusRow(b4+1,nonHotelNoCustomer)}
  </g>
}


/**
 * Hotel presentation of the existing canonical Defect Flow.
 * Read-only projection: never writes or modifies the sales Flow or condo_room_status.
 * Unmatched status groups are indicated in coverage text, not converted to invented status boxes.
 */
// Joining the Hotel is independent of the customer's handover lifecycle.
// Hotel-participating rooms can legitimately remain Pending Handover (e.g. B408).
// Keep the canonical status_group unchanged; distinguish the two dimensions here.
const HOTEL_STATUS_KEYS=[GROUP.checked,GROUP.awaiting,GROUP.roomInspection,GROUP.incomplete,GROUP.pending,GROUP.handover,GROUP.awaitingSale] as const

function HotelBuildingFlow({top,building,rows,combineMode=false}:{top:number;building:'A'|'B';rows:FlowRow[];combineMode?:boolean}){
  const list=rows.filter(r=>r.building===building)
  const link=(href:string|undefined)=>withCombineHref(href,combineMode)
  const data=buildingCounts(rows,building)
  const streams=[
    {key:'sold',label:'มีลูกค้า (ขายแล้ว)',customer:true,y:top+62,filter:'hotel-customer',list:list.filter(r=>r.customer_status==='มีลูกค้า')},
    {key:'unsold',label:'ไม่มีลูกค้า (ยังไม่ขาย)',customer:false,y:top+217,filter:'hotel-nocustomer',list:list.filter(r=>r.customer_status==='ไม่มีลูกค้า')},
  ]
  return <g>
    <a href={link(defectHref({filter:'hotel',building}))} className="flow-link" aria-label={`ดูรายการตึก ${building}`}><g><rect x={28} y={top} width={330} height={44} rx={12} fill={COLORS.navy}/><text x={48} y={top+29} fontSize={20} fontWeight={900} fill="#fff">ตึก {building} — {list.length} {combineMode?'ชุดห้อง':'ห้องร่วมโรงแรม'}</text></g></a>
    {streams.map(stream=>{
      return <g key={stream.key}>
        <SvgCustomerCard x={44} y={stream.y} label={stream.label} count={stream.list.length} formula={'ร่วมโรงแรม '+stream.list.length+(combineMode?' ชุดห้อง':' ห้อง')} customer={stream.customer} href={link(defectHref({filter:stream.filter,building}))}/>
        <Arrow x1={274} y1={stream.y+60} x2={352} y2={stream.y+60}/>
        <SvgBranchCard x={356} y={stream.y+30} label="ร่วมโรงแรม" count={stream.list.length} kind="hotel" href={link(defectHref({filter:stream.filter,building}))}/>
        <Arrow x1={586} y1={stream.y+60} x2={656} y2={stream.y+60}/>
        {statusRow(stream.y+31,hotelStatusItems(data,building,stream.customer).map(item=>({...item,href:link(item.href)})))}
      </g>
    })}
  </g>
}

type FlowFooterSummary={
  awaitingSale:number;roomInspection:number;checked:number;handover:number;awaitingAcceptance:number;incomplete:number
}

function flowFooterItems(v:FlowFooterSummary,hotelOnly=false):StatusItem[]{
  // One set of statuses/labels/tones for Flow รวม and Flow โรงแรม.
  return [
    ...(v.awaitingSale>0?[{label:'Awaiting Sale',lines:['Awaiting Sale'],count:v.awaitingSale,tone:'neutral' as Tone,href:defectHref({filter:hotelOnly?'hotel-status-awaiting-sale':'status-awaiting-sale'})}]:[]),
    ...(v.roomInspection>0?[{label:'Awaiting Room',lines:['ยังไม่ตรวจห้อง'],count:v.roomInspection,tone:'warn' as Tone,href:defectHref(hotelOnly?{filter:'hotel-status-awaiting-room'}:{filter:'hotel-customer',q:'ยังไม่ตรวจห้อง'})}]:[]),
    {label:'Hotel Checked',lines:['Hotel Engineer ตรวจแล้ว'],count:v.checked,tone:'good',href:defectHref({filter:'status-hotel-checked'})},
    ...(!hotelOnly?[{label:'Customer Accepted',lines:['ลูกค้าตรวจรับเรียบร้อยแล้ว'],count:v.handover,tone:'good' as Tone,href:defectHref({filter:'status-handover-complete'})}]:[]),
    {label:'Awaiting Acceptance',lines:awaitingAcceptanceLines,count:v.awaitingAcceptance,tone:'warn',href:defectHref({filter:hotelOnly?'hotel-status-awaiting-acceptance':'status-awaiting-acceptance'})},
    {label:'New Defect',lines:['เพิ่งได้รับแจ้ง defect','และกำลังดำเนินการ'],count:v.incomplete,tone:'danger',href:defectHref({filter:hotelOnly?'hotel-status-incomplete':'status-incomplete'})},
  ]
}

function HotelFlowDiagram({rows,synced,combineMode=false}:{rows:FlowRow[];synced:string|null;combineMode?:boolean}){
  const link=(href:string|undefined)=>withCombineHref(href,combineMode)
  const a=rows.filter(r=>r.building==='A')
  const b=rows.filter(r=>r.building==='B')
  const stage=(group:string)=>rows.filter(r=>r.status_group===group).length
  const covered=HOTEL_STATUS_KEYS.reduce((sum,group)=>sum+stage(group),0)
  const review=rows.length-covered
  const customer=rows.filter(r=>r.customer_status==='มีลูกค้า').length
  const noCustomer=rows.filter(r=>r.customer_status==='ไม่มีลูกค้า').length
  const customerReview=rows.length-customer-noCustomer
  const footer=flowFooterItems({
    awaitingSale:stage(GROUP.awaitingSale),
    roomInspection:stage(GROUP.roomInspection),
    checked:stage(GROUP.checked),
    handover:stage(GROUP.handover),
    awaitingAcceptance:stage(GROUP.awaiting)+stage(GROUP.pending),
    incomplete:stage(GROUP.incomplete),
  },true)
  
  return <>
    <text x={28} y={50} fontSize={31} fontWeight={900} fill={COLORS.navy}>{combineMode?'สรุปเส้นทาง Defect — Flow โรงแรม Combine = 1':'สรุปเส้นทาง Handover / Defect — สำหรับโรงแรม'}</text>
    <text x={28} y={81} fontSize={15} fontWeight={700} fill={COLORS.muted}>{combineMode?'เฉพาะร่วมโรงแรม • คู่ Combine นับเป็น 1 ชุดห้อง • คลิกกล่องเพื่อดูรายชื่อใน Defect Report':'เฉพาะห้องร่วมโรงแรม • ตึก A และ B • คำนวณจากข้อมูล Defect ชุดเดียวกับ Flow รวม'}</text>
    <text x={1888} y={36} textAnchor="end" fontSize={12} fontWeight={700} fill={COLORS.muted}>อ้างอิง: Web App / Supabase — condo_room_status</text>
    <text x={1888} y={54} textAnchor="end" fontSize={12} fontWeight={700} fill={COLORS.muted}>Sync ล่าสุด {dateTimeTH(synced)}</text>
    <g fontSize={12} fontWeight={800}>
      <rect x={488} y={101} width={160} height={36} rx={9} fill={COLORS.customer}/><text x={568} y={124} textAnchor="middle" fill="#286e9d">มีลูกค้า = ห้องที่ขายแล้ว</text>
      <rect x={658} y={101} width={180} height={36} rx={9} fill={COLORS.noCustomer}/><text x={748} y={124} textAnchor="middle" fill={COLORS.neutral}>ไม่มีลูกค้า = ห้องที่ยังไม่ขาย</text>
      <rect x={848} y={101} width={292} height={36} rx={9} fill={COLORS.hotel}/><text x={994} y={124} textAnchor="middle" fill="#6b4aa2">ร่วมโรงแรม = เข้าร่วม Hotel</text>

    </g>
    {[[44,230,'1. สถานะลูกค้า'],[356,230,'2. ห้องร่วมโรงแรม'],[670,1204,'3. สถานะปัจจุบัน']].map(([x,w,label])=><g key={String(label)}><rect x={Number(x)} y={149} width={Number(w)} height={34} rx={9} fill={COLORS.navy2}/><text x={Number(x)+Number(w)/2} y={172} textAnchor="middle" fontSize={14} fontWeight={900} fill="#fff">{label}</text></g>)}
    <HotelBuildingFlow top={190} building="A" rows={rows} combineMode={combineMode}/>
    <HotelBuildingFlow top={565} building="B" rows={rows} combineMode={combineMode}/>
    <text x={44} y={999} fontSize={18} fontWeight={900} fill={review===0&&customer+noCustomer===rows.length?COLORS.navy:COLORS.danger}>{combineMode?'ห้องร่วมโรงแรม (Combine = 1)':'ห้องร่วมโรงแรมรวม'} {rows.length} {combineMode?'ชุดห้อง':'ห้อง'} {review>0?'• รอตรวจสอบ '+review+' ห้อง':''}</text>
    <text x={44} y={1026} fontSize={13} fontWeight={800} fill={COLORS.muted}>ตึก A {a.length} + ตึก B {b.length} = {rows.length} {combineMode?'ชุดห้อง':'ห้อง'}</text>
    <text x={44} y={1049} fontSize={12} fontWeight={700} fill={COLORS.muted}>สถานะ Defect ที่ตรงกลุ่ม {covered} {combineMode?'ชุดห้อง':'ห้อง'} • รอตรวจสอบ Defect {review} • มีลูกค้า {customer} / ไม่มีลูกค้า {noCustomer}{combineMode&&customerReview>0?` • สถานะลูกค้าขัดแย้ง ${customerReview} ชุด`:''}</text>
    <text x={706} y={999} fontSize={17} fontWeight={900} fill={COLORS.navy}>สถานะปลายทางเฉพาะห้องร่วมโรงแรม {combineMode?'(Combine = 1)':''}</text>
    {footer.map((item,i)=>{
      const x=706+i*196.2,w=180,c=toneColor(item.tone),multiLine=item.lines.length>1
      const card=<g><rect x={x} y={1009} width={w} height={55} rx={10} fill={c.soft} stroke={c.main} strokeWidth={2}/><text x={x+w/2} y={multiLine?1029:1034} textAnchor="middle" fontSize={24} fontWeight={900} fill={c.main}>{item.count}</text><text x={x+w/2} y={multiLine?1046:1053} textAnchor="middle" fontSize={multiLine?9:10.5} fontWeight={800} fill={COLORS.text}>{item.lines.map((line,j)=><tspan key={item.label+j} x={x+w/2} dy={j===0?0:11}>{line}</tspan>)}</text></g>
      return <a key={item.label} href={link(item.href)} className="flow-link" aria-label={`เปิดรายละเอียด ${item.lines.join(' ')} ${item.count} ${combineMode?'ชุดห้อง':'ห้อง'}`}>{card}</a>
    })}
  </>
}

export default function DefectFlowPage(){
  const {role}=useAccessRole()
  const [view,setView]=useState<'sales'|'hotel'|'combine'|'hotel-combine'>('sales')
  useEffect(()=>{const target=new URLSearchParams(window.location.search).get('view');if(target==='hotel'||target==='combine'||target==='hotel-combine')setView(target)},[])
  const changeView=(next:'sales'|'hotel'|'combine'|'hotel-combine')=>{
    setView(next)
    const params=new URLSearchParams(window.location.search)
    if(next!=='sales')params.set('view',next);else params.delete('view')
    const query=params.toString()
    window.history.replaceState(window.history.state,'',window.location.pathname+(query?'?'+query:'')+window.location.hash)
  }
  const showDashboard=role!==null&&canAccessPath(role,'/')
  const [rows,setRows]=useState<FlowRow[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [roomSearch,setRoomSearch]=useState('')
  const [diagramZoom,setDiagramZoom]=useState(100)
  const svgRef=useRef<SVGSVGElement|null>(null)

  useEffect(()=>{
    let alive=true
    const supabase=getSupabase()
    const load=async()=>{
      const {data,error}=await supabase.from('condo_room_status').select('room_no,building,customer_status,hotel_participation,status_group,synced_at').order('room_no')
      if(!alive)return
      if(error){setError(error.message);setLoading(false);return}
      setRows((data||[]) as FlowRow[]);setError('');setLoading(false)
    }
    void load()
    const channel=supabase.channel('live-defect-flow').on('postgres_changes',{event:'*',schema:'public',table:'condo_room_status'},()=>{void load()}).subscribe()
    const refresh=()=>{void load()}
    const refreshWhenVisible=()=>{if(document.visibilityState==='visible')void load()}
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refreshWhenVisible)
    return()=>{
      alive=false
      window.removeEventListener('focus',refresh)
      document.removeEventListener('visibilitychange',refreshWhenVisible)
      void supabase.removeChannel(channel)
    }
  },[])

  const hotelRows=useMemo(()=>rows.filter(r=>r.hotel_participation==='ร่วมโรงแรม'),[rows])
  // Flow Combine = 1 is exactly Flow รวม with a display-only room-count transform.
  // Hotel groups follow the 16 confirmed Hotel Engineer pairs (144 => 128);
  // non-hotel groups retain the existing Condo Combine mapping.
  const combineGroups=useMemo(()=>{
    const groups=new Map<string,FlowRow[]>()
    for(const row of rows){
      const key=row.hotel_participation+'|'+flowCombineKey(row.room_no,row.hotel_participation)
      groups.set(key,[...(groups.get(key)||[]),row])
    }
    return [...groups.values()]
  },[rows])
  const combineRows=useMemo(()=>combineGroups.map(members=>{
    const first=members[0]
    const statusConflict=members.some(r=>r.status_group!==first.status_group)
    const customerConflict=members.some(r=>r.customer_status!==first.customer_status)
    return {...first,
      status_group:statusConflict?null:first.status_group,
      customer_status:customerConflict?'รอตรวจสอบ':first.customer_status,
    }
  }),[combineGroups])
  const combineWarnings=useMemo(()=>combineGroups.filter(members=>
    members.some(r=>r.status_group!==members[0].status_group||r.customer_status!==members[0].customer_status)
  ).map(members=>members.map(r=>r.room_no).join(' / ')),[combineGroups])
  const hotelCombineRows=useMemo(()=>combineRows.filter(r=>r.hotel_participation==='ร่วมโรงแรม'),[combineRows])
  const hotelCombineWarnings=useMemo(()=>combineGroups.filter(members=>
    members[0].hotel_participation==='ร่วมโรงแรม'&&
    members.some(r=>r.status_group!==members[0].status_group||r.customer_status!==members[0].customer_status)
  ).map(members=>members.map(r=>r.room_no).join(' / ')),[combineGroups])
  const shownCombineWarnings=view==='combine'?combineWarnings:view==='hotel-combine'?hotelCombineWarnings:[]
  const flowRows=view==='combine'?combineRows:rows
  const combineHotelCount=combineRows.filter(r=>r.hotel_participation==='ร่วมโรงแรม').length
  const combineNonHotelCount=combineRows.filter(r=>r.hotel_participation==='ไม่ร่วมโรงแรม').length
  const a=useMemo(()=>buildingCounts(flowRows,'A'),[flowRows])
  const b=useMemo(()=>buildingCounts(flowRows,'B'),[flowRows])
  const synced=useMemo(()=>latestDate(rows),[rows])
  const displayedSync=useMemo(()=>latestDate(view==='hotel'||view==='hotel-combine'?hotelRows:rows),[view,hotelRows,rows])
  const endpoints=useMemo(()=>{
    const checkedRows=flowRows.filter(r=>r.status_group===GROUP.checked)
    const legacyNonHotelChecked=checkedRows.filter(r=>r.hotel_participation==='ไม่ร่วมโรงแรม').length
    return {
      awaitingSale:flowRows.filter(r=>r.status_group===GROUP.awaitingSale).length,
      roomInspection:flowRows.filter(r=>r.status_group===GROUP.roomInspection).length,
      checked:checkedRows.length-legacyNonHotelChecked,
      handover:flowRows.filter(r=>r.status_group===GROUP.handover).length,
      awaitingAcceptance:flowRows.filter(r=>r.status_group===GROUP.awaiting).length+flowRows.filter(r=>r.status_group===GROUP.pending).length+legacyNonHotelChecked,
      incomplete:flowRows.filter(r=>r.status_group===GROUP.incomplete).length,
      legacyNonHotelChecked,
    }
  },[flowRows])
  const coverage=endpoints.awaitingSale+endpoints.roomInspection+endpoints.checked+endpoints.handover+endpoints.awaitingAcceptance+endpoints.incomplete

  const exportPng=async()=>{
    const svg=svgRef.current
    if(!svg)return
    const clone=svg.cloneNode(true) as SVGSVGElement
    // Keep the existing explicit SVG group font assignment for legacy flow regressions.
    clone.querySelector('g[font-family]')?.setAttribute('font-family',window.getComputedStyle(svg).fontFamily)
    try {
      // The display uses next/font; an SVG rasterized as an image cannot
      // otherwise see the page's @font-face rules.
      await embedRenderedSvgFonts(svg,clone)
    } catch (error) {
      console.error('Flow PNG font embedding failed',error)
      window.alert('ส่งออก PNG ไม่สำเร็จ: ไม่สามารถโหลดฟอนต์เดียวกับหน้าเว็บได้ กรุณาลองใหม่')
      return
    }
    clone.style.removeProperty('width') // Export at the fixed 1920×1080 viewBox, regardless of UI zoom.
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg')
    clone.setAttribute('width','1920');clone.setAttribute('height','1080')
    const xml=new XMLSerializer().serializeToString(clone)
    const blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'})
    const url=URL.createObjectURL(blob)
    const img=new Image()
    img.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080
      const ctx=canvas.getContext('2d');if(!ctx){URL.revokeObjectURL(url);return}
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,1920,1080)
      URL.revokeObjectURL(url)
      canvas.toBlob(png=>{
        if(!png)return
        const href=URL.createObjectURL(png);const a=document.createElement('a')
        a.href=href;a.download=(view==='hotel-combine'?'hotel-combine-one-flow-':view==='combine'?'full-combine-one-flow-':view==='hotel'?'hotel-defect-flow-':'handover-defect-flow-')+new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})+'.png';a.click()
        window.setTimeout(()=>URL.revokeObjectURL(href),1000)
      },'image/png',1)
    }
    img.onerror=()=>{
      URL.revokeObjectURL(url)
      window.alert('ส่งออก PNG ไม่สำเร็จ: ไม่สามารถแปลงแผนภาพเป็นรูปภาพได้')
    }
    img.src=url
  }

  const footerItems=flowFooterItems(endpoints).map(item=>({...item,href:withCombineHref(item.href,view==='combine')}))

  return <AppShell>
    <div className="flow-page-header">
      <PageHeader title="Live Handover / Defect Flow" subtitle={view==='hotel-combine'?'Above Condo A + B • เฉพาะห้องร่วมโรงแรม • Combine = 1':view==='combine'?'Above Condo A + B • ร่วมและไม่ร่วมโรงแรม • Combine = 1':view==='hotel'?'Above Condo A + B • เฉพาะห้องร่วมโรงแรม':'Above Condo A + B'} action={<div className="flow-toolbar">
        <div className="sync-meta"><span>Sync ล่าสุด</span><b>{dateTimeTH(displayedSync)}</b></div>
        {showDashboard&&<Link href="/?section=defect#dashboard-defect" className="button flow-dashboard-button" data-defect-flow-dashboard="true" aria-label="กลับไปที่ข้อมูล Defect ใน Dashboard">← Dashboard</Link>}
        <button type="button" className="button flow-export-button" onClick={exportPng} disabled={loading||!!error}>Export PNG</button>
        <button type="button" className="button report-print-button flow-print-button" onClick={()=>window.print()} disabled={loading||!!error}>🖨️ Print</button>
      </div>}/>
    </div>
    <nav className="flow-view-tabs" aria-label="เลือกมุมมอง Defect Flow">
      <button type="button" className={'flow-view-tab '+(view==='sales'?'active':'')} aria-pressed={view==='sales'} onClick={()=>changeView('sales')}>Flow รวม</button>
      <button type="button" className={'flow-view-tab '+(view==='hotel'?'active':'')} aria-pressed={view==='hotel'} onClick={()=>changeView('hotel')}>Flow โรงแรม</button>
      <button type="button" className={'flow-view-tab '+(view==='combine'?'active':'')} aria-pressed={view==='combine'} onClick={()=>changeView('combine')}>Flow Combine = 1</button>
      <button type="button" className={'flow-view-tab '+(view==='hotel-combine'?'active':'')} aria-pressed={view==='hotel-combine'} onClick={()=>changeView('hotel-combine')}>Flow โรงแรม Combine = 1</button>
    </nav>
    {shownCombineWarnings.length>0&&<div className="panel flow-combine-warning" role="status">ข้อมูลสถานะลูกค้าหรือ Defect ของคู่ Combine ไม่ตรงกัน: {shownCombineWarnings.join(', ')} • นับคู่ละ 1 ชุด และคงสถานะ Defect ที่ตรงกันตามฐานข้อมูล • <Link href={withCombineHref(defectHref({filter:view==='hotel-combine'?'hotel':undefined,q:shownCombineWarnings[0].split(' / ')[0]}),true)||'/defects'}>ตรวจสอบรายละเอียดห้อง →</Link></div>}
    <form className="panel filter-panel compact-filter-shell flow-room-search-panel" onSubmit={e=>{e.preventDefault();if(roomSearch.trim())window.location.assign('/defects?'+(view==='hotel'||view==='hotel-combine'?'filter=hotel&':'')+(view==='combine'||view==='hotel-combine'?'combine=1&':'')+'q='+encodeURIComponent(roomSearch.trim())+'#room-list')}}>
      <div className="toolbar detail-toolbar compact-filter flow-room-search-toolbar">
        <input value={roomSearch} onChange={e=>setRoomSearch(e.target.value)} placeholder="ค้นหา เช่น B101, Good01, Good-01, A521" aria-label="ค้นหาเลขห้อง ชื่อเจ้าของ สถานะ หรือรายละเอียดงาน หลายคำคั่นด้วย comma"/>
        <button className="button primary" type="submit" disabled={!roomSearch.trim()}>ค้นหา → Defect Detail</button>
        {roomSearch&&<button className="button" type="button" onClick={()=>setRoomSearch('')}>ล้างคำค้น</button>}
      </div>
    </form>

    <div className="flow-zoom-toolbar" role="group" aria-label="ปรับขนาด Diagram Handover / Defect">
      <span>ขนาดแผนภาพ</span>
      <button className="button" type="button" disabled={diagramZoom<=75} onClick={()=>setDiagramZoom(z=>Math.max(75,z-25))} aria-label="ย่อ Diagram">−</button>
      <button className="button" type="button" onClick={()=>setDiagramZoom(100)} aria-label="แสดง Diagram ให้พอดีหน้าจอ">พอดีหน้าจอ</button>
      <button className="button" type="button" disabled={diagramZoom>=200} onClick={()=>setDiagramZoom(z=>Math.min(200,z+25))} aria-label="ขยาย Diagram">+</button>
      <b aria-live="polite">{diagramZoom}%</b>
    </div>

    {loading?<div className="panel flow-loading">กำลังโหลด Handover / Defect Flow…</div>:error?<div className="panel flow-error">โหลดข้อมูลไม่ได้: {error}</div>:<section className="flow-stage panel">
      <svg ref={svgRef} className="flow-svg" style={{fontFamily:'inherit',width:`${diagramZoom}%`}} viewBox="0 0 1920 1080" role="img" aria-label={view==='hotel-combine'?'Hotel-only Combine-one Defect Flow Building A and B':view==='combine'?'Full Handover Defect Combine-one Flow Building A and B':view==='hotel'?'Hotel-only Handover Defect Flow Building A and B':'Live Handover Defect Flow Building A and B'} xmlns="http://www.w3.org/2000/svg">
        <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#718095"/></marker></defs>
        <rect width="1920" height="1080" fill="#ffffff"/>
        <g fontFamily="inherit">
          {view==='hotel'?<HotelFlowDiagram rows={hotelRows} synced={displayedSync}/>:view==='hotel-combine'?<HotelFlowDiagram rows={hotelCombineRows} synced={displayedSync} combineMode/>:<>
          <text x={28} y={50} fontSize={31} fontWeight={900} fill={COLORS.navy}>{view==='combine'?'สรุปเส้นทาง Handover / Defect — Flow Combine = 1':'สรุปเส้นทาง Handover / Defect — ตึก A และ B'}</text>
          <text x={28} y={81} fontSize={15} fontWeight={700} fill={COLORS.muted}>สถานะลูกค้า → ร่วม/ไม่ร่วมโรงแรม → สถานะปัจจุบัน{view==='combine'?` • ร่วมโรงแรม ${combineHotelCount} ชุด • ไม่ร่วมโรงแรม ${combineNonHotelCount} ชุด`:''}</text>
          <text x={1888} y={36} textAnchor="end" fontSize={12} fontWeight={700} fill={COLORS.muted}>อ้างอิง: Web App / Supabase — condo_room_status</text>
          <text x={1888} y={54} textAnchor="end" fontSize={12} fontWeight={700} fill={COLORS.muted}>Sync ล่าสุด {dateTimeTH(synced)}</text>

          <g fontSize={12} fontWeight={800}>
            <rect x={488} y={101} width={160} height={36} rx={9} fill={COLORS.customer}/><text x={568} y={124} textAnchor="middle" fill="#286e9d">มีลูกค้า = ห้องที่ขายแล้ว</text>
            <rect x={658} y={101} width={180} height={36} rx={9} fill={COLORS.noCustomer}/><text x={748} y={124} textAnchor="middle" fill={COLORS.neutral}>ไม่มีลูกค้า = ห้องที่ยังไม่ขาย</text>
            <rect x={848} y={101} width={292} height={36} rx={9} fill={COLORS.hotel}/><text x={994} y={124} textAnchor="middle" fill="#6b4aa2">ร่วมโรงแรม = เข้าร่วม Hotel</text>
            <rect x={1150} y={101} width={282} height={36} rx={9} fill={COLORS.nonhotel}/><text x={1291} y={124} textAnchor="middle" fill={COLORS.neutral}>ไม่ร่วมโรงแรม = ไม่เข้าร่วม Hotel</text>
          </g>

          {[[44,230,'1. สถานะลูกค้า'],[356,230,'2. ร่วม / ไม่ร่วมโรงแรม'],[670,1204,'3. สถานะปัจจุบัน']].map(([x,w,label])=><g key={String(label)}><rect x={Number(x)} y={149} width={Number(w)} height={34} rx={9} fill={COLORS.navy2}/><text x={Number(x)+Number(w)/2} y={172} textAnchor="middle" fontSize={14} fontWeight={900} fill="#fff">{label}</text></g>)}

          <BuildingFlow top={190} building="A" data={a} combineMode={view==='combine'}/>
          <BuildingFlow top={570} building="B" data={b} combineMode={view==='combine'}/>

          <text x={44} y={1000} fontSize={18} fontWeight={900} fill={coverage===flowRows.length?COLORS.navy:COLORS.danger}>Coverage Check — {coverage===flowRows.length?'ครบ':'ต้องตรวจสอบ'} {coverage} / {flowRows.length} {view==='combine'?'ชุดห้อง':'ห้อง'}</text>
          <text x={44} y={1028} fontSize={13} fontWeight={800} fill={COLORS.muted}>ตึก A {a.total} ห้อง + ตึก B {b.total} ห้อง = {flowRows.length} {view==='combine'?'ชุดห้อง':'ห้อง'}</text>
          {view!=='combine'&&<text x={44} y={1051} fontSize={12} fontWeight={700} fill={COLORS.muted}>{`A: ${a.customerHotel} + ${a.customerNon} + ${a.noHotel} + ${a.noNon} = ${a.total} • B: ${b.customerHotel} + ${b.customerNon} + ${b.noHotel} + ${b.noNon} = ${b.total}`}</text>}
          <text x={706} y={999} fontSize={17} fontWeight={900} fill={COLORS.navy}>สถานะปลายทางรวมทั้งโครงการ</text>
          {footerItems.map((item,i)=>{
            const x=706+i*196.2,w=180,c=toneColor(item.tone),multiLine=item.lines.length>1
            const card=<g><rect x={x} y={1009} width={w} height={55} rx={10} fill={c.soft} stroke={c.main} strokeWidth={2}/><text x={x+w/2} y={multiLine?1029:1034} textAnchor="middle" fontSize={24} fontWeight={900} fill={c.main}>{item.count}</text><text x={x+w/2} y={multiLine?1046:1053} textAnchor="middle" fontSize={multiLine?9:10.5} fontWeight={800} fill={COLORS.text}>{item.lines.map((line,lineIndex)=><tspan key={`${item.label}-${lineIndex}`} x={x+w/2} dy={lineIndex===0?0:11}>{line}</tspan>)}</text></g>
            return <a key={item.label} href={item.href} className="flow-link" aria-label={`เปิดรายละเอียด ${item.lines.join(' ')} ${item.count} ห้อง`}>{card}</a>
          })}
          </>}
        </g>
      </svg>
    </section>}

    <style jsx>{`
      .flow-combine-warning{padding:10px 14px;margin-bottom:10px;border:1px solid #e8c88d;background:#fff9ee;color:#754e16;font-size:12px;font-weight:650}.flow-combine-warning a{font-weight:800;text-decoration:underline}.flow-view-tabs{display:flex;gap:8px;margin:0 0 12px;flex-wrap:wrap}.flow-view-tab{padding:10px 18px;border:1px solid #c7d2df;border-radius:10px;background:#fff;color:var(--navy);font-weight:800;font-size:13px;cursor:pointer}.flow-view-tab.active{background:var(--navy);border-color:var(--navy);color:white}.flow-view-tab:focus-visible{outline:3px solid #84afe4;outline-offset:2px}
      .flow-room-search-panel{margin-bottom:12px!important}.flow-room-search-toolbar{margin-bottom:0}
      .flow-toolbar{display:grid;grid-template-columns:218px 148px;grid-template-rows:38px 38px;align-items:center;justify-content:end;gap:6px 8px;width:auto}.sync-meta{grid-column:1;grid-row:1;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;justify-self:end;line-height:1.25;margin:0}.sync-meta span{font-size:8.5px;color:var(--muted);font-weight:700}.sync-meta b{font-size:10px;color:var(--navy);font-weight:800;white-space:nowrap}.flow-dashboard-button{grid-column:2;grid-row:1;width:148px;min-width:148px;height:38px;white-space:nowrap}.flow-export-button{grid-column:1;grid-row:2;width:218px;min-width:218px;height:38px}.flow-print-button{grid-column:2;grid-row:2;width:148px!important;min-width:148px!important;height:38px!important;margin:0!important;white-space:nowrap}.flow-zoom-toolbar{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin:0 0 9px;font-size:12px;color:var(--muted)}.flow-zoom-toolbar button{padding:6px 11px;min-height:30px}.flow-zoom-toolbar b{min-width:42px;text-align:center;color:var(--navy)}.flow-stage{padding:10px;overflow:auto;max-width:100%;min-width:0;background:#eef2f6}.flow-svg{display:block;min-width:0;height:auto;background:white;border-radius:10px;box-shadow:0 8px 24px rgba(25,42,63,.08)}.flow-loading,.flow-error{padding:24px}.flow-error{color:#9f312d}
      @media(max-width:900px){.flow-toolbar{grid-template-columns:218px 148px;justify-content:end;width:100%}}
      @media(max-width:760px){.flow-stage{padding:6px}.flow-svg{min-width:1050px}}
      @media(max-width:430px){.flow-toolbar{grid-template-columns:1fr;grid-template-rows:auto;width:100%}.sync-meta,.flow-dashboard-button,.flow-export-button,.flow-print-button{grid-column:1;grid-row:auto;width:100%!important;min-width:0!important}.sync-meta{align-items:flex-start;justify-self:stretch}}
      @media print{
        :global(.sidebar),:global(.mobile-nav),:global(.mobile-more-sheet),:global(.mobile-more-backdrop),.flow-page-header,.flow-view-tabs{display:none!important}
        :global(.app-shell){display:block!important;background:#fff!important}
        :global(.main){margin:0!important;padding:0!important;width:100%!important;max-width:none!important}
        .flow-stage{padding:0!important;margin:0!important;border:0!important;box-shadow:none!important;background:#fff!important;overflow:visible!important}
        .flow-svg{width:100%!important;min-width:0!important;box-shadow:none!important;border-radius:0!important;page-break-inside:avoid}
        @page{size:landscape;margin:7mm}
      }
    `}</style>
    <style jsx global>{`
      .flow-svg .flow-link{cursor:pointer;outline:none}
      .flow-svg .flow-link rect{transition:filter .12s ease,stroke-width .12s ease}
      .flow-svg .flow-link:hover rect,.flow-svg .flow-link:focus rect{filter:brightness(.96);stroke-width:3}
    `}</style>
  </AppShell>
}