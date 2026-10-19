'use client'

import Link from 'next/link'
import useAccessRole from '@/components/useAccessRole'
import {canAccessPath,canAccessWorkOrder} from '@/lib/accessControl'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import DefectCombineRoomEnhancer from '@/components/DefectCombineRoomEnhancer'
import DefectReportTabs from '@/components/DefectReportTabs'
import {hotelRoomLabel,hotelRoomMembers,normalizeHotelRoom} from '@/lib/hotelRoomGroups'
import {flowCombineKey} from '@/lib/flowCombineOne'
import {DEFECT_AWAITING_ACCEPTANCE_LABEL,statusLabel,statusTone} from '@/lib/defectStatusPresentation'
import {summarizeDefectDetail} from '@/lib/defectDetailSummary'
import DefectInputPanel from '@/components/DefectInputPanel'
import { getSupabase } from '@/lib/supabase'
import { createLiveLoader, requireSuccessfulReads } from '@/lib/liveLoader'

type RoomRow={
  room_no:string
  building:string
  floor:number|null
  owner_name:string|null
  hotel_participation:string
  customer_status:string
  current_status:string
  status_group:string|null
  follow_up:string|null
  priority:string|null
  next_action:string|null
  defect_detail:string|null
  latest_source:string|null
  source_note:string|null
  source_modified_at:string|null
}

type Category={
  id:string
  label:string
  tone:'neutral'|'danger'|'warn'|'good'|'hotel'
  predicate:(r:RoomRow)=>boolean
}

type CustomerFilter='ALL'|'CUSTOMER'|'NO_CUSTOMER'

const isAwaitingAcceptance=(r:RoomRow)=>
  r.status_group==='Hotel - Awaiting Check'||
  r.status_group==='Non-Hotel - Pending Handover'||
  (r.status_group==='Hotel - Checked Complete'&&r.hotel_participation==='ไม่ร่วมโรงแรม')

const categories:Category[]=[
  {id:'customer',label:'มีลูกค้า',tone:'hotel',predicate:r=>r.customer_status==='มีลูกค้า'},
  {id:'no-customer',label:'ไม่มีลูกค้า',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'},
  {id:'hotel',label:'ร่วมโรงแรม',tone:'hotel',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'},
  {id:'nonhotel',label:'ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'hotel-customer',label:'มีลูกค้า • ร่วมโรงแรม',tone:'hotel',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'},
  {id:'hotel-nocustomer',label:'ไม่มีลูกค้า • ร่วมโรงแรม',tone:'hotel',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'},
  {id:'nonhotel-customer',label:'มีลูกค้า • ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'nonhotel-no-customer',label:'ไม่มีลูกค้า • ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'status-incomplete',label:'เพิ่งได้รับแจ้ง Defect',tone:'danger',predicate:r=>r.status_group==='Hotel - Incomplete'},
  {id:'status-awaiting-hotel',label:DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.status_group==='Hotel - Awaiting Check'},
  {id:'status-awaiting-acceptance',label:DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:isAwaitingAcceptance},
  {id:'status-hotel-checked',label:'Hotel Engineer ตรวจแล้ว',tone:'good',predicate:r=>r.status_group==='Hotel - Checked Complete'&&r.hotel_participation==='ร่วมโรงแรม'},
  {id:'status-pending-handover',label:DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.status_group==='Non-Hotel - Pending Handover'},
  {id:'status-handover-complete',label:'ลูกค้าตรวจรับเรียบร้อยแล้ว',tone:'good',predicate:r=>r.status_group==='Non-Hotel - Handover Complete'},
  {id:'status-awaiting-sale',label:'Awaiting Sale / ยังไม่มีลูกค้า',tone:'neutral',predicate:r=>r.status_group==='Non-Hotel - Awaiting Sale'},
  // Hotel-only status filters used by the shared Flow footer.
  {id:'hotel-status-awaiting-sale',label:'ร่วมโรงแรม • Awaiting Sale',tone:'neutral',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Awaiting Sale'},
  {id:'hotel-status-awaiting-room',label:'ร่วมโรงแรม • ยังไม่ตรวจห้อง',tone:'warn',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Awaiting Room Inspection'},
  {id:'hotel-status-handover-complete',label:'ร่วมโรงแรม • ลูกค้าตรวจรับเรียบร้อยแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Handover Complete'},
  {id:'hotel-status-awaiting-acceptance',label:'ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&(r.status_group==='Hotel - Awaiting Check'||r.status_group==='Non-Hotel - Pending Handover')},
  {id:'hotel-status-incomplete',label:'ร่วมโรงแรม • เพิ่งได้รับแจ้ง Defect',tone:'danger',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Incomplete'},
  {id:'hotel-customer-incomplete',label:'มีลูกค้า • ร่วมโรงแรม • เพิ่งได้รับแจ้ง Defect',tone:'danger',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Incomplete'},
  {id:'hotel-customer-awaiting',label:'มีลูกค้า • ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Awaiting Check'},
  {id:'hotel-customer-awaiting-receive',label:'มีลูกค้า • ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&(r.status_group==='Hotel - Awaiting Check'||r.status_group==='Non-Hotel - Pending Handover')},
  {id:'hotel-customer-checked',label:'มีลูกค้า • ร่วมโรงแรม • Hotel Engineer ตรวจแล้ว',tone:'good',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Checked Complete'},
  {id:'hotel-customer-pending',label:'มีลูกค้า • ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Pending Handover'},
  {id:'hotel-nocustomer-incomplete',label:'ไม่มีลูกค้า • ร่วมโรงแรม • เพิ่งได้รับแจ้ง Defect',tone:'danger',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Incomplete'},
  {id:'hotel-nocustomer-awaiting',label:'ไม่มีลูกค้า • ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Awaiting Check'},
  {id:'hotel-nocustomer-awaiting-receive',label:'ไม่มีลูกค้า • ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&(r.status_group==='Hotel - Awaiting Check'||r.status_group==='Non-Hotel - Pending Handover')},
  {id:'hotel-nocustomer-checked',label:'ไม่มีลูกค้า • ร่วมโรงแรม • Hotel Engineer ตรวจแล้ว',tone:'good',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Checked Complete'},
  {id:'hotel-nocustomer-pending',label:'ไม่มีลูกค้า • ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Pending Handover'},
  {id:'nonhotel-customer-complete',label:'มีลูกค้า • ไม่ร่วมโรงแรม • ลูกค้าตรวจรับเรียบร้อยแล้ว',tone:'good',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Handover Complete'},
  {id:'nonhotel-customer-pending',label:'มีลูกค้า • ไม่ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Pending Handover'},
  {id:'nonhotel-customer-awaiting-receive',label:'มีลูกค้า • ไม่ร่วมโรงแรม • '+DEFECT_AWAITING_ACCEPTANCE_LABEL,tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&(r.status_group==='Non-Hotel - Pending Handover'||r.status_group==='Hotel - Checked Complete')},
  {id:'nonhotel-nosale',label:'ไม่มีลูกค้า • ไม่ร่วมโรงแรม • Awaiting Sale',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Awaiting Sale'},
]

const DEFECT_DONE_FOLDER='https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK'

const HOTEL_NOTICE_DATE_BY_ROOM:Record<string,string>={
  A202:'2026-09-21',
  A211:'2026-09-24',
  A313:'2026-09-26',
  A314:'2026-09-26',
  A326:'2026-09-26',
  A410:'2026-09-27',
  A412:'2026-09-27',
  A501:'2026-09-16',
  A616:'2026-09-27',
  B212:'2026-09-22',
  B214:'2026-09-23',
}

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}

function hotelNoticeDateTH(r:RoomRow){
  const sourceText=[r.latest_source,r.source_note].filter(Boolean).join(' ')
  const sourceDate=sourceText.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/)
  if(sourceDate){
    const day=sourceDate[1].padStart(2,'0')
    const month=sourceDate[2].padStart(2,'0')
    const buddhistYear=Number(sourceDate[3])+543
    return `${day}/${month}/${String(buddhistYear).slice(-2)}`
  }
  const value=HOTEL_NOTICE_DATE_BY_ROOM[r.room_no]
  if(!value)return '—'
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if(!m)return '—'
  const buddhistYear=Number(m[1])+543
  return `${m[3]}/${m[2]}/${String(buddhistYear).slice(-2)}`
}

function isLongDefectDetail(text:string){
  return text.length>110||text.split(/\r?\n/).length>3
}

export default function DefectDetailPage(){
  const {role}=useAccessRole()
  const showDashboard=role!==null&&canAccessPath(role,'/')
  const [loadError,setLoadError]=useState(false)
  const [rows,setRows]=useState<RoomRow[]>([])
  const [workOrders,setWorkOrders]=useState<{room_group:string;work_status:string|null}[]>([])
  const [workOrderReadState,setWorkOrderReadState]=useState<'loading'|'ready'|'error'>('loading')
  const [latestDefectChangeAt,setLatestDefectChangeAt]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('')
  const [building,setBuilding]=useState('ALL')
  const [customerFilter,setCustomerFilter]=useState<CustomerFilter>('ALL')
  const [q,setQ]=useState('')
  const [combineMode,setCombineMode]=useState(false)
  const [expandedDetails,setExpandedDetails]=useState<Record<string,boolean>>({})
  const [hotelPlanDays,setHotelPlanDays]=useState<{day_no:number;planned_date:string|null}[]>([])
  const [hotelPlanRooms,setHotelPlanRooms]=useState<{seq_no:number;day_no:number;room_no:string;planned_date_override:string|null}[]>([])
  const [hotelAvailability,setHotelAvailability]=useState<{room_no:string;availability_status:string;start_date:string|null;end_date:string|null}[]>([])

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const initial=params.get('filter')||''
    const initialBuilding=params.get('building')||'ALL'
    const initialQuery=params.get('q')||''
    const initialCombine=params.get('combine')==='1'
    setCombineMode(initialCombine)
    if(categories.some(c=>c.id===initial))setFilter(initial)
    if(['ALL','A','B'].includes(initialBuilding))setBuilding(initialBuilding)
    if(initialQuery)setQ(initialQuery)

    let alive=true
    const supabase=getSupabase()
    const loader=createLiveLoader({
      load:async(signal)=>{
        const [roomRead,latestChangeRead]=await Promise.all([
          supabase.from('condo_room_status').select('room_no,building,floor,owner_name,hotel_participation,customer_status,current_status,status_group,follow_up,priority,next_action,defect_detail,latest_source,source_note,source_modified_at').order('building').order('floor').order('room_no').abortSignal(signal),
          supabase.rpc('defect_report_latest_change_at').abortSignal(signal),
        ])
        requireSuccessfulReads([{error:roomRead.error}])
        if(!alive||signal.aborted)return
        setRows((roomRead.data||[]) as RoomRow[])
        // A failed timestamp read must not substitute a stale source-file date.
        setLatestDefectChangeAt(!latestChangeRead.error && typeof latestChangeRead.data==='string'?latestChangeRead.data:null)
        setLoadError(false)
      },
      onError:()=>{if(alive)setLoadError(true)},
      onSettled:()=>{if(alive)setLoading(false)},
    })
    const load=loader.refresh

    void load()
    const channel=supabase.channel('defect-report-status').on('postgres_changes',{event:'*',schema:'public',table:'condo_room_status'},()=>{void load()}).subscribe()
    const refresh=()=>{void load()}
    const refreshWhenVisible=()=>{if(document.visibilityState==='visible')void load()}
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refreshWhenVisible)

    return()=>{
      alive=false
      loader.dispose()
      window.removeEventListener('focus',refresh)
      document.removeEventListener('visibilitychange',refreshWhenVisible)
      void supabase.removeChannel(channel)
    }
  },[])

  // Supplemental Hotel Work Plan and OOO/OOS reads are deliberately independent of
  // the canonical Defect loader; failure here never hides or alters Defect data.
  useEffect(()=>{
    let alive=true
    const supabase=getSupabase()
    const loadExtras=async()=>{
      const [dayData,roomData,hotelData]=await Promise.all([
        supabase.from('hotel_work_plan_days').select('day_no,planned_date'),
        supabase.from('hotel_work_plan_rooms').select('seq_no,day_no,room_no,planned_date_override'),
        supabase.from('hotel_room_availability').select('room_no,availability_status,start_date,end_date')
      ])
      if(!alive)return
      if(!dayData.error)setHotelPlanDays(dayData.data||[])
      if(!roomData.error)setHotelPlanRooms(roomData.data||[])
      if(!hotelData.error)setHotelAvailability(hotelData.data||[])
    }
    void loadExtras()
    const reload=()=>{void loadExtras()}
    window.addEventListener('focus',reload)
    const channel=supabase.channel('defect-related-hotel-live')
     .on('postgres_changes',{event:'*',schema:'public',table:'hotel_work_plan_days'},reload)
     .on('postgres_changes',{event:'*',schema:'public',table:'hotel_work_plan_rooms'},reload)
     .on('postgres_changes',{event:'*',schema:'public',table:'hotel_room_availability'},reload)
     .subscribe()
    return()=>{alive=false;window.removeEventListener('focus',reload);void supabase.removeChannel(channel)}
  },[])
  // Work Order links remain visible for authorized users. Highlight only items that
  // the Work Order viewer would actually show as outstanding, including Combine rooms.
  useEffect(()=>{
    if(!canAccessWorkOrder(role)){setWorkOrders([]);setWorkOrderReadState('ready');return}
    let active=true
    const supabase=getSupabase()
    const loadOrders=async()=>{
      const {data,error}=await supabase.from('defect_work_order_snapshot')
        .select('room_group,work_status').eq('source_active',true)
      if(active){
        setWorkOrders(error?[]:(data||[]) as {room_group:string;work_status:string|null}[])
        setWorkOrderReadState(error?'error':'ready')
      }
    }
    void loadOrders()
    const reload=()=>{void loadOrders()}
    window.addEventListener('focus',reload)
    const timer=window.setInterval(reload,300_000)
    const channel=supabase.channel('defect-report-work-order-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'defect_work_order_snapshot'},reload)
      .subscribe()
    return()=>{active=false;window.removeEventListener('focus',reload);window.clearInterval(timer);void supabase.removeChannel(channel)}
  },[role])
  const workOpenByRoom=useMemo(()=>{
    const roomStatus=new Map(rows.map(r=>[r.room_no,r.status_group]))
    const open=new Set<string>()
    for(const item of workOrders){
      if(/เสร็จแล้ว|งดแจก|ยกเลิก/.test(item.work_status||''))continue
      const members=[...new Set((item.room_group.toUpperCase().match(/[AB]\d{3}/g)||[])
        .flatMap(room=>hotelRoomMembers(room)))]
      if(members.length&&(members.every(room=>roomStatus.get(room)==='Hotel - Incomplete') ||
        (members.length===1&&members.every(room=>roomStatus.get(room)?.startsWith('Non-Hotel -')))))
        members.forEach(room=>open.add(room))
    }
    return open
  },[rows,workOrders])

  const workPlanContext=useMemo(()=>{
    const dates=new Map(hotelPlanDays.map(d=>[d.day_no,d.planned_date]))
    const result=new Map<string,string[]>()
    for(const item of hotelPlanRooms){
      const date=item.planned_date_override||dates.get(item.day_no)
      const label='Day '+item.day_no+(date?' · '+date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):' · ยังไม่กำหนดวัน')
      result.set(item.room_no,[...(result.get(item.room_no)||[]),label])
    }
    return result
  },[hotelPlanDays,hotelPlanRooms])
  const roomHotelContext=useMemo(()=>{
    const map=new Map(hotelAvailability.map(h=>[h.room_no,h]))
    const result=new Map<string,string>()
    for(const row of rows){
      const record=hotelRoomMembers(row.room_no).map(member=>map.get(member)).find(Boolean)
      if(!record)continue
      const date=(v:string|null)=>v?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):''
      const period=[date(record.start_date),date(record.end_date)].filter(Boolean).join(' – ')
      result.set(row.room_no,record.availability_status+(period?' · '+period:''))
    }
    return result
  },[hotelAvailability,rows])

  // The Flow diagram arrives before async room data. Scroll only after the requested
  // filtered results are rendered; keep the legacy #room-list deep link intact.
  useEffect(()=>{
    if(loading)return
    const target=window.location.hash.slice(1)
    if(target!=='room-list'&&target!=='report-results')return
    const frame=window.requestAnimationFrame(()=>{
      document.getElementById(target)?.scrollIntoView({behavior:'auto',block:'start'})
    })
    return()=>window.cancelAnimationFrame(frame)
  },[loading,filter,building,q,rows.length])

  const active=useMemo(()=>categories.find(c=>c.id===filter)||null,[filter])
  const sourceDate=latestDefectChangeAt
  const summaryByRoom=useMemo(()=>new Map(rows.map(r=>[r.room_no,summarizeDefectDetail(r.defect_detail)])),[rows])
  // Combine=1 preserves all Flow รวม categories and changes only room counts.
  // Hotel uses engineer-confirmed 16 pairs, non-hotel uses existing Combine data.
  const scopedRows=rows
  const unitKey=(r:RoomRow)=>r.hotel_participation+'|'+flowCombineKey(r.room_no,r.hotel_participation)
  const uniqueUnits=(list:RoomRow[])=>{
    const seen=new Set<string>()
    return list.filter(r=>{const key=unitKey(r);if(seen.has(key))return false;seen.add(key);return true})
  }
  const baseRows=useMemo(()=>{
    const selected=active?scopedRows.filter(active.predicate):scopedRows
    return combineMode?uniqueUnits(selected):selected
  },[scopedRows,active,combineMode])
  const groupCustomerStatus=(unit:RoomRow)=>{
    const statuses=new Set(scopedRows.filter(r=>unitKey(r)===unitKey(unit)).map(r=>r.customer_status))
    return statuses.size===1?[...statuses][0]:'รอตรวจสอบ'
  }
  const customerCount=baseRows.filter(r=>combineMode?groupCustomerStatus(r)==='มีลูกค้า':r.customer_status==='มีลูกค้า').length
  const noCustomerCount=baseRows.filter(r=>combineMode?groupCustomerStatus(r)==='ไม่มีลูกค้า':r.customer_status==='ไม่มีลูกค้า').length
  const customerReviewCount=combineMode?baseRows.length-customerCount-noCustomerCount:0
  const aCount=baseRows.filter(r=>r.building==='A').length
  const bCount=baseRows.filter(r=>r.building==='B').length
  const totalCount=baseRows.length

  const filtered=useMemo(()=>{
    const needles=Array.from(new Set(q.split(/[,，]+/).map(x=>normalizeHotelRoom(x.trim()).toLowerCase()).filter(Boolean)))
    const matched=scopedRows.filter(r=>{
      const paired=combineMode?scopedRows.filter(other=>unitKey(other)===unitKey(r)):scopedRows.filter(other=>hotelRoomMembers(r.room_no).includes(other.room_no))
      if(building!=='ALL'&&!paired.some(other=>other.building===building))return false
      if(customerFilter==='CUSTOMER'&&!paired.some(other=>other.customer_status==='มีลูกค้า'))return false
      if(customerFilter==='NO_CUSTOMER'&&!paired.some(other=>other.customer_status==='ไม่มีลูกค้า'))return false
      if(active&&!paired.some(active.predicate))return false
      if(!needles.length)return true
      const searchable=paired.flatMap(other=>[other.room_no,other.owner_name,other.customer_status,other.hotel_participation,other.defect_detail,statusLabel(other),other.next_action,other.follow_up]).filter(Boolean).join(' ').toLowerCase()
      return needles.some(needle=>searchable.includes(needle))
    })
    return combineMode?uniqueUnits(matched):matched
  },[scopedRows,building,customerFilter,active,q,combineMode])

  const combinedMembers=(room:string)=>{
    if(!combineMode)return []
    const current=scopedRows.find(row=>row.room_no===room)
    return current?scopedRows.filter(other=>unitKey(other)===unitKey(current)):[]
  }
  const memberLabel=(room:string)=>combinedMembers(room).map(r=>hotelRoomLabel(r.room_no)).join(' / ')
  const customerScopeLabel=customerFilter==='CUSTOMER'?'มีลูกค้า':customerFilter==='NO_CUSTOMER'?'ไม่มีลูกค้า':'ทุกประเภทลูกค้า'

  return <AppShell>
    {loadError&&<div className="panel" role="alert">โหลดข้อมูลไม่สำเร็จ ข้อมูลที่แสดงอาจเป็นข้อมูลเดิม กรุณาลองใหม่ <button type="button" className="button" onClick={()=>window.dispatchEvent(new Event('focus'))}>ลองใหม่</button></div>}
    <DefectCombineRoomEnhancer />
    <PageHeader
      title="Above Condo — Defect Report"
      subtitle={combineMode?"รายละเอียดย่อย Above Condo A, B • ร่วมและไม่ร่วมโรงแรม • Flow Combine = 1":"รายละเอียดย่อย Above Condo A, B"}
      action={<div className="header-actions">
        <div className="update-meta"><span>ข้อมูลอัปเดต</span><b>{dateTimeTH(sourceDate)}</b></div>
        <a className="button drive-button" href={DEFECT_DONE_FOLDER} target="_blank" rel="noreferrer">📷 Picture - Defect Done</a>
        {showDashboard&&<Link href="/?section=defect#dashboard-defect" className="button">← Dashboard</Link>}
      </div>}
    />
    <DefectReportTabs active="condo" />
    <section className="panel filter-panel compact-filter-shell">
        <div className="toolbar detail-toolbar compact-filter">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหา เช่น B101, Good01, Good-01, A521" aria-label="ค้นหาเลขห้อง ชื่อเจ้าของ สถานะ หรือรายละเอียดงาน หลายคำคั่นด้วย comma"/>
          <select value={building} onChange={e=>setBuilding(e.target.value)} aria-label="กรองอาคาร"><option value="ALL">ตึก A + B</option><option value="A">ตึก A</option><option value="B">ตึก B</option></select>
          <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="กรองสถานะ"><option value="">ทุกสถานะ</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
          {(q||building!=='ALL'||filter||customerFilter!=='ALL')&&<button type="button" className="button" onClick={()=>{setQ('');setBuilding('ALL');setFilter('');setCustomerFilter('ALL')}}>ล้างตัวกรอง</button>}
        </div>
      </section>

    <DefectInputPanel />

    {loading?<div className="panel">กำลังโหลดข้อมูลห้อง…</div>:<>
      {combineMode&&customerReviewCount>0&&<div className="panel" role="status" style={{padding:'10px 14px',border:'1px solid #e8c88d',background:'#fff9ee',marginBottom:10,fontSize:12}}>มีชุดห้องที่สถานะลูกค้าในคู่ Combine ไม่ตรงกัน {customerReviewCount} ชุด — แสดงเป็นหนึ่งชุดตามสถานะ Defect จริง โดยไม่ปรับฐานข้อมูลต้นฉบับ</div>}
      <section className={`selected-status ${active?.tone||'neutral'}`} id="room-list">
        <div className="selected-copy">
          <span>{active?'รายการที่เลือก':'รายละเอียดทุกห้อง'}</span>
          <h2>{active?.label||'Above Condo — ทุกสถานะ'}</h2>
          <p>{building==='ALL'?'ตึก A + B':`ตึก ${building}`} • {customerScopeLabel} • แสดง {filtered.length} {combineMode?'ชุดห้อง (Combine = 1)':'ห้อง'}</p>
        </div>
        <div className="selected-breakdown">
          <button type="button" onClick={()=>setCustomerFilter(v=>v==='CUSTOMER'?'ALL':'CUSTOMER')} className={`break-card customer ${customerFilter==='CUSTOMER'?'active':''}`}><span>มีลูกค้า</span><b>{customerCount}</b><small>ห้อง</small></button>
          <button type="button" onClick={()=>setCustomerFilter(v=>v==='NO_CUSTOMER'?'ALL':'NO_CUSTOMER')} className={`break-card no-customer ${customerFilter==='NO_CUSTOMER'?'active':''}`}><span>ไม่มีลูกค้า</span><b>{noCustomerCount}</b><small>ห้อง</small></button>
          <button type="button" onClick={()=>setBuilding('A')} className={`break-card building ${building==='A'?'active':''}`}><span>ตึก A</span><b>{aCount}</b><small>ห้อง</small></button>
          <button type="button" onClick={()=>setBuilding('B')} className={`break-card building ${building==='B'?'active':''}`}><span>ตึก B</span><b>{bCount}</b><small>ห้อง</small></button>
          <button type="button" onClick={()=>{setBuilding('ALL');setCustomerFilter('ALL')}} className={`break-card total ${building==='ALL'&&customerFilter==='ALL'?'active':''}`}><span>รวม</span><b>{totalCount}</b><small>ห้อง</small></button>
        </div>
      </section>

      <section className="panel detail-panel" id="report-results">
        <div className="detail-head">
          <div><h2>รายชื่อห้อง {combineMode?'— Flow Combine = 1':''}</h2><p>แสดง {filtered.length} {combineMode?'ชุดห้อง (ร่วมและไม่ร่วมโรงแรม)':'ห้อง'}</p></div>
          <div className="legend"><span><i className="customer-dot"/>มีลูกค้า</span><span><i className="no-customer-dot"/>ไม่มีลูกค้า</span><span><i className="bad-dot"/>เพิ่งได้รับแจ้ง Defect</span><span><i className="warn-dot"/>{DEFECT_AWAITING_ACCEPTANCE_LABEL}</span><span><i className="good-dot"/>ตรวจรับแล้ว / Hotel ตรวจแล้ว</span></div>
        </div>
        <div className="table-wrap defect-table"><table><thead><tr><th>ห้อง</th><th className="center">อาคาร</th><th className="center">วันที่ Hotel แจ้ง</th><th>ชื่อลูกค้า/เจ้าของ</th><th className="center">ลูกค้า</th><th className="center">โรงแรม</th><th>รายละเอียดงาน/Work Order</th><th className="center">สถานะ</th><th>Work Plan / Hotel Status</th><th>ต้องทำต่อ</th></tr></thead><tbody>
          {filtered.map(r=><tr key={r.room_no}>
            <td className="room-cell"><b>{combineMode?memberLabel(r.room_no):hotelRoomLabel(r.room_no)}</b><small>ชั้น {r.floor??'-'}{combineMode&&combinedMembers(r.room_no).length>1?' • Combine = 1':''}</small></td>
            <td className="center"><b>{r.building}</b></td>
            <td className="center"><span className="notice-date" title="วันที่ตาม Hotel Defect Notice">{hotelNoticeDateTH(r)}</span></td>
            <td>{r.owner_name||<span className="muted">—</span>}</td>
            <td className="center">{combineMode&&groupCustomerStatus(r)==='รอตรวจสอบ'?<span className="customer-badge no-customer">รอตรวจสอบ ({combinedMembers(r.room_no).map(other=>other.room_no+': '+other.customer_status).join(' / ')})</span>:<span className={`customer-badge ${r.customer_status==='มีลูกค้า'?'customer':'no-customer'}`}>{r.customer_status}</span>}</td>
            <td className="center"><span className={`program-badge ${r.hotel_participation==='ร่วมโรงแรม'?'hotel':'nonhotel'}`}>{r.hotel_participation}</span></td>
            <td className="defect-detail">
              {combineMode&&combinedMembers(r.room_no).length>1&&<div className="defect-summary-work-label">ห้อง {r.room_no}</div>}
              <div className="defect-summary-work-label">งานทั้งหมด :</div>
              {r.defect_detail?.trim()?<>
                <div className={`defect-detail-text ${isLongDefectDetail(summaryByRoom.get(r.room_no)?.work||'')&&!expandedDetails[r.room_no]?'is-collapsed':''}`}>{summaryByRoom.get(r.room_no)?.work||'-'}</div>
                {isLongDefectDetail(summaryByRoom.get(r.room_no)?.work||'')&&<button type="button" className="defect-detail-toggle" aria-expanded={!!expandedDetails[r.room_no]} aria-label={`${expandedDetails[r.room_no]?'ย่อรายละเอียด':'ดูรายละเอียดทั้งหมด'} ห้อง ${r.room_no}`} onClick={()=>setExpandedDetails(previous=>({...previous,[r.room_no]:!previous[r.room_no]}))}>{expandedDetails[r.room_no]?'ย่อรายละเอียด':'ดูทั้งหมด'}</button>}
              </>:<div className="defect-detail-text muted">-</div>}
              <div className="defect-summary-meta"><b>วันที่งาน/อัพเดท :</b> {r.defect_detail?.trim()?summaryByRoom.get(r.room_no)?.dates||'-':'-'}</div>
              <div className="defect-summary-meta"><b>ดู Work Order :</b>{' '}
                {r.defect_detail?.trim()&&canAccessWorkOrder(role)
                  ?(workOpenByRoom.has(r.room_no)
                    ?<Link className="defect-work-order-link" data-has-open-work={workOpenByRoom.has(r.room_no)?'true':'false'} href={'/work-order?room='+encodeURIComponent(r.room_no)}>ดู Work Order →</Link>
                    :<button type="button" className="defect-work-order-link" data-has-open-work="false" onClick={()=>window.alert(workOrderReadState==='ready'?'Work Order ไม่มี\nห้อง '+hotelRoomLabel(r.room_no):'ยังไม่สามารถตรวจสอบ Work Order ได้ กรุณาลองใหม่')}>ดู Work Order →</button>)
                  :'-'}
              </div>
              {combineMode&&combinedMembers(r.room_no).filter(other=>other.room_no!==r.room_no).map(other=><div key={other.room_no} className="combine-member-detail">
                <div className="defect-summary-work-label">ห้อง {other.room_no} — งานทั้งหมด :</div>
                <div className="defect-detail-text">{summaryByRoom.get(other.room_no)?.work||'-'}</div>
                <div className="defect-summary-meta"><b>วันที่งาน/อัพเดท :</b> {summaryByRoom.get(other.room_no)?.dates||'-'}</div>
                <div className="defect-summary-meta"><b>ดู Work Order :</b>{' '}{canAccessWorkOrder(role)?<Link className="defect-work-order-link" href={'/work-order?room='+encodeURIComponent(other.room_no)}>ดู Work Order →</Link>:'-'}</div>
              </div>)}
            </td>
            <td className="center"><span className={`state-badge ${statusTone(r)}`}>{statusLabel(r)}</span></td>
            <td className="work-plan-cell">{(workPlanContext.get(r.room_no)||[]).map((label,i)=><small key={i}>{label}</small>)}<small>{roomHotelContext.get(r.room_no)||'สถานะโรงแรม: —'}</small><Link href={'/hotel-work-plan?room='+encodeURIComponent(r.room_no)}>ดูแผน</Link>{combineMode&&combinedMembers(r.room_no).filter(other=>other.room_no!==r.room_no).map(other=><div key={other.room_no} className="combine-member-detail"><small>{other.room_no}: {(workPlanContext.get(other.room_no)||[]).join(', ')||'ไม่ระบุแผน'}</small><Link href={'/hotel-work-plan?room='+encodeURIComponent(other.room_no)}>ดูแผน {other.room_no}</Link></div>)}</td>
            <td>{r.next_action||r.follow_up||'-'}{combineMode&&combinedMembers(r.room_no).filter(other=>other.room_no!==r.room_no).map(other=><div key={other.room_no} className="combine-member-detail"><b>{other.room_no}: </b>{other.next_action||other.follow_up||'-'}</div>)}</td>
          </tr>)}
          {!filtered.length&&<tr><td colSpan={10} className="muted" style={{padding:28,textAlign:'center'}}>ไม่พบห้องตามเงื่อนไข</td></tr>}
        </tbody></table></div>
      </section>
    </>}

    <style jsx>{`
      .defect-work-order-link{display:inline-block;margin:0;padding:0;border:0;background:none;color:var(--blue);font:inherit;font-size:10px;font-weight:700;text-decoration:underline;text-underline-offset:2px;cursor:pointer}.defect-work-order-link[data-has-open-work="true"]{color:#b42318!important}
      .header-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.update-meta{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;line-height:1.25;margin-right:2px}.update-meta span{font-size:8.5px;color:var(--muted);font-weight:700}.update-meta b{font-size:10px;color:var(--navy);font-weight:800;white-space:nowrap}.drive-button{background:#f3f8ff;border-color:#bfd7ec;color:#245e8b;white-space:nowrap}
      .detail-panel#report-results{scroll-margin-top:16px}.selected-status{scroll-margin-top:16px;display:grid;grid-template-columns:minmax(230px,1fr) minmax(570px,1.9fr);align-items:center;gap:16px;padding:15px 17px;border:1px solid var(--line);border-left:6px solid #8b949e;border-radius:14px;background:var(--surface);margin-bottom:12px}.selected-status.hotel{border-left-color:#2f6fb0;background:#f5f9fe}.selected-status.danger{border-left-color:#d84d45;background:#fff8f7}.selected-status.warn{border-left-color:#e2ad32;background:#fffaf0}.selected-status.good{border-left-color:#2e9a6a;background:#f6fbf8}.selected-copy>span{font-size:9px;font-weight:800;color:var(--muted)}.selected-copy h2{margin:3px 0;font-size:18px;color:var(--navy);line-height:1.3}.selected-copy p{margin:0;font-size:10px;color:var(--muted)}
      .selected-breakdown{display:grid;grid-template-columns:repeat(5,minmax(92px,1fr));gap:7px}.break-card{min-height:66px;border:1px solid var(--line);border-radius:11px;background:#fff;padding:8px 9px;text-align:center;display:flex;flex-direction:column;justify-content:center;color:var(--text);font:inherit;cursor:pointer;transition:.15s ease}.break-card:hover{transform:translateY(-1px);box-shadow:0 5px 14px rgba(25,42,63,.08)}.break-card span{display:block;font-size:8.5px;font-weight:800;color:var(--muted)}.break-card b{display:block;margin-top:2px;font-size:21px;line-height:1;color:var(--navy);font-variant-numeric:tabular-nums}.break-card small{display:block;margin-top:3px;font-size:8px;color:var(--muted)}.break-card.customer{background:#edf7ff;border:2px solid #bad9ef}.break-card.customer span,.break-card.customer b{color:#2a6997}.break-card.customer.active{border-color:#4b9bd3;box-shadow:inset 0 0 0 1px #4b9bd3,0 5px 14px rgba(75,155,211,.12)}.break-card.no-customer{background:#f1f3f5;border:2px solid #d4dae0}.break-card.no-customer span,.break-card.no-customer b{color:#606a76}.break-card.no-customer.active{border-color:#7f8790;box-shadow:inset 0 0 0 1px #7f8790,0 5px 14px rgba(95,104,115,.12)}.break-card.building.active{background:#eef6fc;border-color:#8bbbdc;box-shadow:inset 0 0 0 1px #8bbbdc}.break-card.total{background:#17243a;border:2px solid #17243a}.break-card.total span,.break-card.total b,.break-card.total small{color:#fff}.break-card.total.active{border-color:#d5a94b;box-shadow:inset 0 0 0 1px #d5a94b,0 5px 16px rgba(23,36,58,.16)}
      .filter-panel{padding:12px;margin-bottom:12px}.detail-toolbar{margin:0}.detail-toolbar input{min-width:320px}.detail-toolbar select{max-width:320px}.detail-panel{padding-bottom:0}.detail-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}.detail-head h2{margin:0;font-size:17px}.detail-head p{margin:3px 0 0;font-size:10px;color:var(--muted)}
      .legend{display:flex;gap:9px;flex-wrap:wrap;font-size:8.5px;color:var(--muted)}.legend span{display:flex;align-items:center;gap:4px}.legend i{width:8px;height:8px;border-radius:50%}.customer-dot{background:#4b9bd3}.no-customer-dot{background:#7f8790}.bad-dot{background:#d84d45}.warn-dot{background:#e2ad32}.good-dot{background:#2e9a6a}
      .defect-table{max-height:680px;margin:0 -19px}.defect-table table{min-width:1500px}.defect-table th,.defect-table td{vertical-align:middle}.defect-table th.center,.defect-table td.center{text-align:center}.defect-table td{font-size:11.5px}.room-cell b{display:inline-block;color:var(--navy);font-size:12.5px}.room-cell small{display:block;font-size:8.5px;color:var(--muted)}.notice-date{font-size:10px;font-weight:800;color:var(--navy);white-space:nowrap;font-variant-numeric:tabular-nums}.defect-detail{min-width:240px;max-width:360px;white-space:normal;line-height:1.45}.defect-detail-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}.defect-detail-text.is-collapsed{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.defect-detail-toggle{display:inline-block;margin-top:4px;padding:0;border:0;background:none;color:var(--blue);font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}.defect-detail-toggle:focus-visible{outline:2px solid var(--blue);outline-offset:3px;border-radius:2px}.combine-member-detail{margin-top:8px;padding-top:7px;border-top:1px dashed var(--line);font-size:10px}.combine-member-detail .defect-detail-text{white-space:pre-wrap;overflow-wrap:anywhere}.defect-summary-work-label{display:block;margin-bottom:2px;font-size:9px;font-weight:800;color:var(--navy)}.defect-summary-meta{display:block;font-size:9px;line-height:1.35;color:var(--muted);margin-top:3px}.defect-summary-meta b{font-weight:750;color:var(--navy)}.work-plan-cell{min-width:140px;max-width:200px;white-space:normal}.work-plan-cell small{display:block;font-size:9px;line-height:1.5}.work-plan-cell a{font-size:9px}
       .customer-badge,.program-badge,.state-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:750;border:1px solid transparent;white-space:nowrap}.customer-badge.customer{background:#edf7ff;border-color:#c5dfef;color:#2b6994}.customer-badge.no-customer{background:#f0f2f4;border-color:#d7dce1;color:#606a75}.program-badge.hotel{background:#f2edfb;border-color:#dacdf0;color:#5d3d9d}.program-badge.nonhotel{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}.state-badge.danger{background:#fdeceb;border-color:#f1cdca;color:#9e312d}.state-badge.warn{background:#fff3dc;border-color:#f0dfb8;color:#85570d}.state-badge.good{background:#e9f6ef;border-color:#cfe9da;color:#196645}.state-badge.neutral{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}
      @media print{.defect-detail .defect-detail-text,.defect-detail .defect-detail-text.is-collapsed{display:block!important;-webkit-line-clamp:unset!important;max-height:none!important;overflow:visible!important;white-space:pre-wrap!important}.defect-detail-toggle{display:none!important}}
       @media(max-width:1050px){.selected-status{grid-template-columns:1fr}.selected-breakdown{grid-template-columns:repeat(5,1fr)}}
      @media(max-width:760px){.header-actions{justify-content:flex-start}.update-meta{width:100%;align-items:flex-start}.selected-breakdown{grid-template-columns:repeat(2,1fr)}.break-card.total{grid-column:1/-1}.detail-toolbar input{min-width:0}.detail-toolbar select{max-width:none}.detail-head{align-items:flex-start;flex-direction:column}}
      @media(max-width:480px){.selected-breakdown{grid-template-columns:1fr 1fr}.drive-button{width:100%;text-align:center}}
    `}</style>
  </AppShell>
}