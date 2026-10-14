'use client'

import {useEffect,useMemo,useState} from 'react'
import useAccessRole from '@/components/useAccessRole'
import {canEditCalendar,canEditProcurement} from '@/lib/accessControl'
import {getActivitySessionId} from '@/lib/activityLog'
import {getSupabase} from '@/lib/supabase'
import {logActivity} from '@/lib/activityLog'
import {useI18n} from '@/components/I18nProvider'
import type {AppLanguage} from '@/lib/i18n'
import {WORK_CALENDARS,getWorkCalendar} from '@/lib/workCalendars'
import {canAccessPath} from '@/lib/accessControl'
import {DEFECT_WORK_PLAN_CALENDAR,buildDefectPlanCalendarEvents} from '@/lib/defectWorkPlanCalendar'
import type {DefectPlanDay,DefectPlanRoom} from '@/lib/defectWorkPlanCalendar'
import Link from 'next/link'

type CalendarMode='MONTH'|'WEEK'|'AGENDA'
type ConnectionState='checking'|'shared'|'unconfigured'
type GoogleEventApi={
  id:string
  summary?:string
  description?:string
  status?:string
  recurringEventId?:string
  start:{date?:string;dateTime?:string}
  end:{date?:string;dateTime?:string}
}
type WorkEvent=GoogleEventApi&{calendarId:string;calendarLabel:string;calendarColor:string;managedWorkPlan?:boolean;firstRoom?:string;dayNo?:number}
type LocalCalendar={id:string;name:string;color:string;active:boolean}
type LocalEvent={id:string;calendar_id:string;event_date:string;title:string;detail:string|null}
type ProcurementOption={id:string;vendor:string|null;item_name:string;po_no:string|null;actual_delivery:string|null}
type DeliveryLink={event_key:string;last_item_id:string}
type EventDraft={
  eventId:string|null
  calendarId:string
  title:string
  detail:string
  allDay:boolean
  startDate:string
  endDate:string
  startDateTime:string
  endDateTime:string
  recurring:boolean
  procurementItemId:string
}

const STORAGE_SELECTION='3kings:google-calendar:selected'
const STORAGE_MODE='3kings:google-calendar:mode'
const STORAGE_DEFECT_PLAN_INTRO='3kings:work-plan-defect-calendar:v1'
const MAX_MONTH_EVENTS=3

function todayBangkok(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}
function addDays(dateKey:string,amount:number){
  const d=new Date(dateKey+'T12:00:00Z')
  d.setUTCDate(d.getUTCDate()+amount)
  return d.toISOString().slice(0,10)
}
function firstOfMonth(dateKey:string){return dateKey.slice(0,7)+'-01'}
function shiftMonth(dateKey:string,amount:number){
  const d=new Date(dateKey+'T12:00:00Z')
  d.setUTCMonth(d.getUTCMonth()+amount,1)
  return d.toISOString().slice(0,10)
}
function mondayOf(dateKey:string){
  const d=new Date(dateKey+'T12:00:00Z')
  const offset=(d.getUTCDay()+6)%7
  d.setUTCDate(d.getUTCDate()-offset)
  return d.toISOString().slice(0,10)
}
function monthCells(monthKey:string){
  const start=mondayOf(firstOfMonth(monthKey))
  return Array.from({length:42},(_,index)=>addDays(start,index))
}
function displayLocale(language:AppLanguage){
  if(language==='en')return 'en-GB'
  if(language==='ru')return 'ru-RU'
  return 'th-TH'
}
function monthLabel(dateKey:string,language:AppLanguage){
  return new Intl.DateTimeFormat(displayLocale(language),{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(firstOfMonth(dateKey)+'T12:00:00Z'))
}
function dayLabel(dateKey:string,language:AppLanguage){
  return new Intl.DateTimeFormat(displayLocale(language),{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(new Date(dateKey+'T12:00:00Z'))
}
function weekdayLabels(language:AppLanguage){
  return Array.from({length:7},(_,index)=>new Intl.DateTimeFormat(displayLocale(language),{timeZone:'UTC',weekday:'short'}).format(new Date(Date.UTC(2024,0,1+index))))
}
function bangkokDateFromDateTime(value:string){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
}
function bangkokDateTimeInput(value:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value))
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||''
  return get('year')+'-'+get('month')+'-'+get('day')+'T'+get('hour')+':'+get('minute')
}
function apiTime(dateKey:string){return dateKey+'T00:00:00+07:00'}
function toBangkokRfc3339(value:string){return value.length===16?value+':00+07:00':value+'+07:00'}
function eventDay(event:WorkEvent){
  if(event.start.date)return event.start.date
  if(event.start.dateTime)return bangkokDateFromDateTime(event.start.dateTime)
  return ''
}
function eventTime(event:WorkEvent){
  return event.start.dateTime?bangkokDateTimeInput(event.start.dateTime).slice(11):''
}
function emptyDraft(calendarId:string,dateKey:string):EventDraft{
  return {eventId:null,calendarId,title:'',detail:'',allDay:true,startDate:dateKey,endDate:dateKey,startDateTime:dateKey+'T09:00',endDateTime:dateKey+'T10:00',recurring:false,procurementItemId:''}
}
function draftFromEvent(event:WorkEvent):EventDraft{
  const allDay=!!event.start.date
  if(allDay){
    const start=event.start.date||todayBangkok()
    const apiEnd=event.end.date||addDays(start,1)
    return {eventId:event.id,calendarId:event.calendarId,title:event.summary||'',detail:event.description||'',allDay:true,startDate:start,endDate:addDays(apiEnd,-1),startDateTime:start+'T09:00',endDateTime:start+'T10:00',recurring:!!event.recurringEventId,procurementItemId:''}
  }
  const start=event.start.dateTime||new Date().toISOString()
  const end=event.end.dateTime||start
  return {eventId:event.id,calendarId:event.calendarId,title:event.summary||'',detail:event.description||'',allDay:false,startDate:bangkokDateFromDateTime(start),endDate:bangkokDateFromDateTime(end),startDateTime:bangkokDateTimeInput(start),endDateTime:bangkokDateTimeInput(end),recurring:!!event.recurringEventId,procurementItemId:''}
}
function errorMessage(value:unknown){
  return value instanceof Error?value.message:String(value||'Calendar request failed')
}

export function GoogleCalendarManager(){
  const {language}=useI18n()
  const {role,userId,ready}=useAccessRole()
  const editable=canEditCalendar(role)
  const canLinkProcurement=canEditProcurement(role)
  const canViewDefectPlan=role!==null&&canAccessPath(role,'/hotel-work-plan')
  const [connection,setConnection]=useState<ConnectionState>('checking')
  const [ownerSetupRequired,setOwnerSetupRequired]=useState(false)
  const [appToken,setAppToken]=useState('')
  const [selected,setSelected]=useState<string[]>(()=>[...WORK_CALENDARS.map(row=>row.id),DEFECT_WORK_PLAN_CALENDAR.id])
  const [mode,setMode]=useState<CalendarMode>('MONTH')
  const [focusDate,setFocusDate]=useState(todayBangkok())
  const [events,setEvents]=useState<WorkEvent[]>([])
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [setupBusy,setSetupBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [draft,setDraft]=useState<EventDraft|null>(null)
  const [localCalendars,setLocalCalendars]=useState<LocalCalendar[]>([])
  const [procurementOptions,setProcurementOptions]=useState<ProcurementOption[]>([])
  const [deliveryLinks,setDeliveryLinks]=useState<DeliveryLink[]>([])
  const [procurementQuery,setProcurementQuery]=useState('')
  const [newCalendarOpen,setNewCalendarOpen]=useState(false)
  const [newCalendarName,setNewCalendarName]=useState('')
  const [newCalendarColor,setNewCalendarColor]=useState('#7b61ff')
  const [calendarManageId,setCalendarManageId]=useState('')
  const [calendarManageName,setCalendarManageName]=useState('')
  const [calendarManageColor,setCalendarManageColor]=useState('#7b61ff')
  const allCalendars=useMemo(()=>[
    ...WORK_CALENDARS.map(row=>({...row,source:'google' as const})),
    ...localCalendars.filter(row=>row.active).map(row=>({id:row.id,label:row.name,color:row.color,source:'web' as const})),
    ...(canViewDefectPlan?[{...DEFECT_WORK_PLAN_CALENDAR,source:'managed' as const}]:[]),
  ],[localCalendars,canViewDefectPlan])
  const localCalendarIds=useMemo(()=>new Set(localCalendars.map(row=>row.id)),[localCalendars])
  const managedPlanSelected=canViewDefectPlan&&selected.includes(DEFECT_WORK_PLAN_CALENDAR.id)

  async function refreshLocalCalendars(){
    const {data,error}=await getSupabase().from('work_calendars')
      .select('id,name,color,active').eq('active',true).order('created_at',{ascending:true})
    if(error)throw error
    setLocalCalendars((data||[]) as LocalCalendar[])
  }

  useEffect(()=>{
    if(!ready||!canLinkProcurement)return
    void getSupabase().from('v_procurement_items')
      .select('id,vendor,item_name,po_no,actual_delivery')
      .is('actual_delivery',null).order('item_name').limit(400)
      .then(({data,error})=>{
        if(error)setMessage('โหลดรายการจัดซื้อสำหรับเชื่อมปฏิทินไม่สำเร็จ: '+error.message)
        else setProcurementOptions((data||[]) as ProcurementOption[])
      })
  },[ready,canLinkProcurement])

  useEffect(()=>{
    if(!ready)return
    void refreshLocalCalendars().catch(error=>setMessage('โหลดปฏิทิน Web App ไม่สำเร็จ: '+errorMessage(error)))
  },[ready])

  async function calendarAction(action:'create'|'update'|'delete'){
    if(!editable)return
    setSaving(true);setMessage('')
    try{
      const params={p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent}
      let id=''
      if(action==='create'){
        if(!newCalendarName.trim())return
        const {data,error}=await getSupabase().rpc('work_calendar_create',{...params,p_name:newCalendarName.trim(),p_color:newCalendarColor})
        if(error)throw error
        id=String(data||'')
        setNewCalendarName('');setNewCalendarOpen(false)
      }else if(action==='update'){
        const {error}=await getSupabase().rpc('work_calendar_update',{...params,p_calendar_id:calendarManageId,p_name:calendarManageName.trim(),p_color:calendarManageColor})
        if(error)throw error
        setCalendarManageId('')
      }else{
        if(!window.confirm('ลบปฏิทิน “'+calendarManageName+'” และรายการทั้งหมดอย่างถาวร?'))return
        const {error}=await getSupabase().rpc('work_calendar_delete',{...params,p_calendar_id:calendarManageId})
        if(error)throw error
        setSelected(current=>current.filter(value=>value!==calendarManageId))
        setCalendarManageId('')
      }
      await refreshLocalCalendars()
      if(id)setSelected(current=>[...new Set([...current,id])])
      setMessage(action==='delete'?'ลบปฏิทิน Web App แล้ว':'บันทึกปฏิทิน Web App แล้ว')
    }catch(error){setMessage('จัดการปฏิทินไม่สำเร็จ: '+errorMessage(error))}
    finally{setSaving(false)}
  }

  useEffect(()=>{
    try{
      const savedSelection=window.localStorage.getItem(STORAGE_SELECTION)
      if(savedSelection){
        const parsed=JSON.parse(savedSelection)
        if(Array.isArray(parsed)){
          const allowed=parsed.filter((value):value is string=>typeof value==='string'&&value.length<=250)
          setSelected(!window.localStorage.getItem(STORAGE_DEFECT_PLAN_INTRO)
            ?[...new Set([...allowed,DEFECT_WORK_PLAN_CALENDAR.id])]:allowed)
        }
      }
      window.localStorage.setItem(STORAGE_DEFECT_PLAN_INTRO,'1')
       const params=new URLSearchParams(window.location.search)
       if(params.get('view')==='work-plan-defect'){
         setSelected([DEFECT_WORK_PLAN_CALENDAR.id])
         const chosen=params.get('date')
         if(chosen&&/^\d{4}-\d{2}-\d{2}$/.test(chosen))setFocusDate(chosen)
         setMode('MONTH')
         return
       }
       const savedMode=window.localStorage.getItem(STORAGE_MODE)
      if(savedMode==='MONTH'||savedMode==='WEEK'||savedMode==='AGENDA')setMode(savedMode)
    }catch{}
  },[])
  useEffect(()=>{try{window.localStorage.setItem(STORAGE_SELECTION,JSON.stringify(selected))}catch{}},[selected])
  useEffect(()=>{try{window.localStorage.setItem(STORAGE_MODE,mode)}catch{}},[mode])

  async function apiFetch<T>(path:string,init?:RequestInit):Promise<T>{
    if(!appToken)throw new Error('app_session_missing')
    const headers=new Headers(init?.headers||{})
    headers.set('authorization','Bearer '+appToken)
    if(init?.body)headers.set('content-type','application/json')
    const response=await fetch(path,{...init,headers,cache:'no-store'})
    const body=await response.json().catch(()=>null)
    if(!response.ok){
      const error=new Error(body?.error||('Calendar API HTTP '+response.status)) as Error&{status?:number}
      error.status=response.status
      throw error
    }
    return body as T
  }

  async function refreshConnection(token:string){
    const response=await fetch('/api/google-calendar/status',{headers:{authorization:'Bearer '+token},cache:'no-store'})
    const body=await response.json().catch(()=>null)
    if(!response.ok)throw new Error(body?.error||'calendar_status_failed')
    setConnection(body?.configured?'shared':'unconfigured')
    setOwnerSetupRequired(Boolean(body?.ownerSetupRequired))
  }

  useEffect(()=>{
    if(!ready)return
    let cancelled=false
    void (async()=>{
      const {data:{session}}=await getSupabase().auth.getSession()
      if(cancelled)return
      const token=session?.access_token||''
      setAppToken(token)
      if(!token){setConnection('unconfigured');return}
      try{await refreshConnection(token)}catch{if(!cancelled)setConnection('unconfigured')}
    })()
    return()=>{cancelled=true}
  },[ready])

  useEffect(()=>{
    if(!appToken||role!=='owner')return
    const params=new URLSearchParams(window.location.search)
    const code=params.get('google_oauth_code')
    const state=params.get('google_oauth_state')
    const oauthError=params.get('google_oauth_error')
    if(!code&&!oauthError)return

    window.history.replaceState({},'',window.location.pathname+window.location.hash)

    if(oauthError){
      setMessage('เชื่อม Google Calendar ไม่สำเร็จ: '+oauthError)
      return
    }
    if(!code||!state){
      setMessage('ข้อมูลยืนยัน Google ไม่ครบ กรุณาเริ่มเชื่อมใหม่')
      return
    }

    setSetupBusy(true)
    void (async()=>{
      try{
        await apiFetch('/api/google-calendar/oauth/complete',{method:'POST',body:JSON.stringify({code,state})})
        await refreshConnection(appToken)
        setMessage('เชื่อม Google Calendar ให้ระบบเรียบร้อยแล้ว ผู้ใช้อื่นไม่ต้องกดเชื่อม Google')
      }catch(error){
        setMessage('เชื่อม Google Calendar ไม่สำเร็จ: '+errorMessage(error))
      }finally{setSetupBusy(false)}
    })()
  },[appToken,role])

  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const monthStart=firstOfMonth(focusDate)
  const cells=useMemo(()=>monthCells(monthStart),[monthStart])
  const weekStart=mondayOf(focusDate)
  const weekDays=useMemo(()=>Array.from({length:7},(_,index)=>addDays(weekStart,index)),[weekStart])
  const fetchWindow=useMemo(()=>mode==='WEEK'?{start:weekStart,end:addDays(weekStart,7)}:{start:cells[0],end:addDays(cells[cells.length-1],1)},[mode,weekStart,cells])

  const readOnlyEmbedUrl=useMemo(()=>{
    if(!selected.length)return ''
    const params=new URLSearchParams({hl:language,wkst:'1',bgcolor:'#ffffff',ctz:'Asia/Bangkok',showTitle:'0',showNav:'1',showDate:'1',showPrint:'0',showTabs:'0',showCalendars:'0',showTz:'0',mode})
    for(const calendar of WORK_CALENDARS){
      if(!selectedSet.has(calendar.id))continue
      params.append('src',calendar.id)
      params.append('color',calendar.color)
    }
    return 'https://calendar.google.com/calendar/embed?'+params.toString()
  },[language,mode,selected.length,selectedSet])

  const eventsByDate=useMemo(()=>{
    const map=new Map<string,WorkEvent[]>()
    for(const event of events){
      const key=eventDay(event)
      if(!key)continue
      const list=map.get(key)||[]
      list.push(event)
      map.set(key,list)
    }
    for(const list of map.values())list.sort((a,b)=>(a.start.dateTime||a.start.date||'').localeCompare(b.start.dateTime||b.start.date||''))
    return map
  },[events])
  const agendaEvents=useMemo(()=>events.slice().sort((a,b)=>(a.start.dateTime||a.start.date||'').localeCompare(b.start.dateTime||b.start.date||'')),[events])

  async function loadDefectPlanEvents(){
    const client=getSupabase()
    const [days,rooms]=await Promise.all([
      client.from('hotel_work_plan_days').select('day_no,planned_date,note').order('day_no'),
      client.from('hotel_work_plan_rooms').select('seq_no,day_no,room_no,source_room,planned_date_override').order('seq_no'),
    ])
    if(days.error)throw days.error
    if(rooms.error)throw rooms.error
    if((days.data||[]).length!==9||(rooms.data||[]).length!==267)
      throw Error('Work Plan ไม่ครบ 9 วัน / 267 รายการ — ปฏิทินไม่ถูกแทนที่')
    return buildDefectPlanCalendarEvents(
      (days.data||[]) as DefectPlanDay[],
      (rooms.data||[]) as DefectPlanRoom[],
      fetchWindow.start,fetchWindow.end,
    )
  }

  async function loadEvents(){
    if(connection==='checking'||!appToken)return
    if(!selected.length){setEvents([]);return}
    setLoading(true)
    try{
      const googleSelected=connection==='shared'?selected.filter(id=>WORK_CALENDARS.some(row=>row.id===id)):[]
      const localSelected=selected.filter(id=>localCalendarIds.has(id))
      const googleResults=await Promise.all(googleSelected.map(async calendarId=>{
        const calendar=getWorkCalendar(calendarId)
        const params=new URLSearchParams({calendar_id:calendarId,time_min:apiTime(fetchWindow.start),time_max:apiTime(fetchWindow.end)})
        const data=await apiFetch<{items?:GoogleEventApi[]}>('/api/google-calendar/events?'+params.toString())
        return (data.items||[]).filter(item=>item.status!=='cancelled').map(item=>({
          ...item,calendarId,calendarLabel:calendar?.label||calendarId,calendarColor:calendar?.color||'#7b61ff'
        }))
      }))
      let localEvents:WorkEvent[]=[]
      if(localSelected.length){
        const {data,error}=await getSupabase().from('work_calendar_events')
          .select('id,calendar_id,event_date,title,detail').in('calendar_id',localSelected)
          .gte('event_date',fetchWindow.start).lt('event_date',fetchWindow.end).limit(2000)
        if(error)throw error
        localEvents=((data||[]) as LocalEvent[]).map(row=>{
          const calendar=localCalendars.find(c=>c.id===row.calendar_id)
          return {id:row.id,calendarId:row.calendar_id,calendarLabel:calendar?.name||'Web App',
            calendarColor:calendar?.color||'#7b61ff',summary:row.title,description:row.detail||'',
            start:{date:row.event_date},end:{date:addDays(row.event_date,1)}}
        })
      }
      const {data:links,error:linksError}=await getSupabase().from('procurement_calendar_delivery')
        .select('event_key,last_item_id').limit(1000)
      if(linksError)throw linksError
      setDeliveryLinks((links||[]) as DeliveryLink[])
      const defectPlanEvents=managedPlanSelected?await loadDefectPlanEvents():[]
      setEvents([...googleResults.flat(),...localEvents,...defectPlanEvents])
    }catch(error){setMessage('โหลดปฏิทินไม่สำเร็จ: '+errorMessage(error))}
    finally{setLoading(false)}
  }
  useEffect(()=>{if(connection!=='checking'&&appToken)void loadEvents()},[connection,appToken,selected.join('|'),fetchWindow.start,fetchWindow.end,localCalendars,canViewDefectPlan])

  // Excel imports arrive via Supabase without touching Google Calendar.
  // Refresh only the generated layer every minute / when refocusing; Google events stay untouched.
  useEffect(()=>{
    if(!ready||connection==='checking'||!appToken||!managedPlanSelected)return
    let alive=true
    const refreshPlan=async()=>{
      try{
        const rows=await loadDefectPlanEvents()
        if(alive)setEvents(current=>[
          ...current.filter(event=>event.calendarId!==DEFECT_WORK_PLAN_CALENDAR.id),
          ...rows,
        ])
      }catch(error){if(alive)setMessage('โหลด Work Plan Defect ไม่สำเร็จ: '+errorMessage(error))}
    }
    const onFocus=()=>{void refreshPlan()}
    window.addEventListener('focus',onFocus)
    const interval=window.setInterval(()=>{void refreshPlan()},60_000)
    return()=>{alive=false;window.clearInterval(interval);window.removeEventListener('focus',onFocus)}
  },[ready,connection,appToken,managedPlanSelected,fetchWindow.start,fetchWindow.end])

  async function beginOwnerSetup(){
    if(role!=='owner'||!appToken)return
    setSetupBusy(true);setMessage('')
    try{
      const result=await apiFetch<{url:string}>('/api/google-calendar/oauth/start',{method:'POST'})
      window.location.assign(result.url)
    }catch(error){
      setSetupBusy(false)
      setMessage('เริ่มเชื่อม Google ไม่สำเร็จ: '+errorMessage(error))
    }
  }

  function toggleCalendar(id:string){
    setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])
  }
  function openCreate(dateKey:string){
    if(!editable||(connection!=='shared'&&!localCalendars.length))return
    const first=selected.find(id=>id!==DEFECT_WORK_PLAN_CALENDAR.id&&allCalendars.some(c=>c.id===id))
      ||allCalendars.find(c=>c.id!==DEFECT_WORK_PLAN_CALENDAR.id)?.id
    if(!first)return
    setDraft(emptyDraft(first,dateKey));setMessage('')
  }
  function openEdit(event:WorkEvent){
    const matched=deliveryLinks.find(row=>row.event_key==='g:'+event.calendarId+':'+event.id)
    setDraft({...draftFromEvent(event),procurementItemId:matched?.last_item_id||''});setMessage('')
  }
  function buildEventBody(value:EventDraft){
    if(value.allDay){
      if(!value.startDate||!value.endDate)throw new Error('กรุณาระบุวันที่เริ่มและวันที่สิ้นสุด')
      if(value.endDate<value.startDate)throw new Error('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม')
      return {summary:value.title.trim(),description:value.detail.trim()||undefined,start:{date:value.startDate},end:{date:addDays(value.endDate,1)}}
    }
    if(!value.startDateTime||!value.endDateTime)throw new Error('กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด')
    if(value.endDateTime<=value.startDateTime)throw new Error('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม')
    return {summary:value.title.trim(),description:value.detail.trim()||undefined,start:{dateTime:toBangkokRfc3339(value.startDateTime),timeZone:'Asia/Bangkok'},end:{dateTime:toBangkokRfc3339(value.endDateTime),timeZone:'Asia/Bangkok'}}
  }

  async function saveEvent(){
    if(!draft||!editable||draft.calendarId===DEFECT_WORK_PLAN_CALENDAR.id||!draft.title.trim())return
    if(draft.procurementItemId&&!canLinkProcurement){setMessage('การแก้ไขวันส่งวัสดุต้องใช้สิทธิ์ Purchase/Owner');return}
    if(draft.procurementItemId&&localCalendarIds.has(draft.calendarId)){
      setMessage('รายการผูกวันจัดซื้อให้เลือกปฏิทิน Google เดิม (เช่น กำหนดส่ง-ของเข้าหน้างาน)')
      return
    }
    if(!localCalendarIds.has(draft.calendarId)&&connection!=='shared')return
    setSaving(true);setMessage('')
    try{
      if(localCalendarIds.has(draft.calendarId)){
        if(!draft.allDay||draft.startDate!==draft.endDate)throw new Error('ปฏิทิน Web App รองรับกิจกรรมหนึ่งวันต่อรายการ')
        const {error}=await getSupabase().rpc('work_calendar_save_event',{
          p_event_id:draft.eventId,p_calendar_id:draft.calendarId,p_event_date:draft.startDate,
          p_title:draft.title.trim(),p_detail:draft.detail.trim()||null,
          p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent,
        })
        if(error)throw error
      }else{
        const body=buildEventBody(draft)
        let savedEventId=draft.eventId
        if(draft.eventId){
          await apiFetch('/api/google-calendar/events',{method:'PATCH',body:JSON.stringify({calendarId:draft.calendarId,eventId:draft.eventId,event:body})})
        }else{
          const created=await apiFetch<{id:string}>('/api/google-calendar/events',{method:'POST',body:JSON.stringify({calendarId:draft.calendarId,event:body})})
          if(!created?.id)throw new Error('Google ไม่ส่งเลขรายการกลับมา กรุณาตรวจปฏิทินก่อนบันทึกซ้ำ')
          savedEventId=created.id
          setDraft(current=>current?{...current,eventId:created.id}:current)
        }
        if(draft.procurementItemId){
          const dueDate=draft.allDay?draft.startDate:draft.startDateTime.slice(0,10)
          const {error}=await getSupabase().rpc('procurement_calendar_link_delivery',{
            p_item_id:draft.procurementItemId,
            p_event_key:'g:'+draft.calendarId+':'+savedEventId,
            p_expected_delivery:dueDate,
            p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent,
          })
          if(error)throw new Error('บันทึกกิจกรรมแล้ว แต่เชื่อมวันที่จัดซื้อไม่สำเร็จ: '+error.message)
        }
      }
      await logActivity({userId,eventType:'submit',path:'/calendar',action:draft.eventId?'google_calendar_event_update':'google_calendar_event_create',target:draft.eventId||draft.title,metadata:{calendar_id:draft.calendarId,start:draft.allDay?draft.startDate:draft.startDateTime,transport:localCalendarIds.has(draft.calendarId)?'web_app_rpc':'owner_oauth_shared'}})
      setDraft(null);setMessage(draft.eventId?'แก้ไขรายการเรียบร้อย':'เพิ่มรายการเรียบร้อย')
      await loadEvents()
    }catch(error){setMessage('บันทึกไม่สำเร็จ: '+errorMessage(error))}finally{setSaving(false)}
  }

  async function deleteEvent(){
    if(!draft?.eventId||!editable||draft.calendarId===DEFECT_WORK_PLAN_CALENDAR.id)return
    if(draft.procurementItemId&&!canLinkProcurement)return
    if(!localCalendarIds.has(draft.calendarId)&&connection!=='shared')return
    if(!window.confirm('ลบ “'+(draft.title||'รายการนี้')+'” ออกจากปฏิทินจริงใช่หรือไม่?'+(draft.procurementItemId?' ระบบจะยกเลิกวันที่กำหนดส่งที่เชื่อมโยงด้วย':'')))return
    setSaving(true);setMessage('')
    try{
      if(localCalendarIds.has(draft.calendarId)){
        const {error}=await getSupabase().rpc('work_calendar_delete_event',{
          p_event_id:draft.eventId,p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent,
        })
        if(error)throw error
      }else{
        await apiFetch('/api/google-calendar/events',{method:'DELETE',body:JSON.stringify({calendarId:draft.calendarId,eventId:draft.eventId})})
        if(draft.procurementItemId){
          const {error}=await getSupabase().rpc('procurement_calendar_unlink_delivery',{
            p_event_key:'g:'+draft.calendarId+':'+draft.eventId,
            p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent,
          })
          if(error)throw new Error('ลบกิจกรรมแล้ว แต่ยังยกเลิกวันส่งในจัดซื้อไม่ได้: '+error.message)
        }
      }
      await logActivity({userId,eventType:'submit',path:'/calendar',action:'google_calendar_event_delete',target:draft.eventId,metadata:{calendar_id:draft.calendarId,transport:localCalendarIds.has(draft.calendarId)?'web_app_rpc':'owner_oauth_shared'}})
      setDraft(null);setMessage('ลบรายการเรียบร้อย')
      await loadEvents()
    }catch(error){setMessage('ลบไม่สำเร็จ: '+errorMessage(error))}finally{setSaving(false)}
  }

  const goPrevious=()=>setFocusDate(mode==='WEEK'?addDays(focusDate,-7):shiftMonth(firstOfMonth(focusDate),-1))
  const goNext=()=>setFocusDate(mode==='WEEK'?addDays(focusDate,7):shiftMonth(firstOfMonth(focusDate),1))
  const renderCompactEvent=(event:WorkEvent)=>(
    <button
      type="button"
      key={event.calendarId+':'+event.id}
      className="gcal-event"
      style={{
        borderLeftColor:event.calendarColor,
        maxHeight:'36px',
        padding:'3px 4px',
        fontSize:'10px',
        lineHeight:1.25,
      }}
      onClick={()=>openEdit(event)}
      title={[event.calendarLabel,event.summary,event.description].filter(Boolean).join(' • ')}
    >
      {eventTime(event)&&<span className="gcal-event-time" style={{fontSize:'8px',lineHeight:1.2}}>{eventTime(event)}</span>}
      <span className="gcal-event-title" style={{fontSize:'10px',lineHeight:1.25}}>{event.summary||'(ไม่มีชื่อ)'}</span>
    </button>
  )

  if(!ready)return <section className="panel gcal-loading-card">กำลังตรวจสอบสิทธิ์…</section>

  return <section className="gcal-shell">
    {role==='owner'&&ownerSetupRequired&&<div className="panel gcal-owner-setup">
      <div><b>ตั้งค่าการเชื่อม Google Calendar ของระบบ</b><small>ทำครั้งเดียวโดย Owner หลังจากนั้นผู้ใช้ 3Kings ไม่ต้องเชื่อม Google เอง</small></div>
      <button type="button" className="button primary" disabled={setupBusy} onClick={beginOwnerSetup}>{setupBusy?'กำลังเชื่อม…':'เชื่อม Google ให้ระบบ'}</button>
    </div>}

    <div className="panel gcal-controls">
      <div className="gcal-view-tabs">
        <button type="button" className={mode==='MONTH'?'active':''} onClick={()=>setMode('MONTH')}>เดือน</button>
        <button type="button" className={mode==='WEEK'?'active':''} onClick={()=>setMode('WEEK')}>สัปดาห์</button>
        <button type="button" className={mode==='AGENDA'?'active':''} onClick={()=>setMode('AGENDA')}>กำหนดการ</button>
      </div>
      <div className="gcal-nav">
        <button type="button" className="button" onClick={goPrevious}>‹ ก่อนหน้า</button>
        <button type="button" className="button" onClick={()=>setFocusDate(todayBangkok())}>วันนี้</button>
        <button type="button" className="button" onClick={goNext}>ถัดไป ›</button>
      </div>
      <b className="gcal-period">{mode==='WEEK'?dayLabel(weekStart,language)+' – '+dayLabel(addDays(weekStart,6),language):monthLabel(focusDate,language)}</b>
      <div className="gcal-selection-actions"><button type="button" onClick={()=>setSelected(allCalendars.map(row=>row.id))}>เลือกทั้งหมด</button><button type="button" onClick={()=>setSelected([])}>ล้าง</button></div>
    </div>

    <div className="gcal-layout">
      <aside className="panel gcal-filter">
        <b>ปฏิทินที่แสดง</b><small>{selected.filter(id=>allCalendars.some(c=>c.id===id)).length} / {allCalendars.length} ปฏิทิน</small>
        <div>{allCalendars.map(calendar=><label key={calendar.id} className={selectedSet.has(calendar.id)?'selected':''}>
          <input type="checkbox" checked={selectedSet.has(calendar.id)} onChange={()=>toggleCalendar(calendar.id)}/>
          <i style={{background:calendar.color}}/><span>{calendar.label}</span>
          {calendar.source==='web'&&editable&&<button type="button" className="gcal-manage" onClick={event=>{event.preventDefault();setCalendarManageId(calendar.id);setCalendarManageName(calendar.label);setCalendarManageColor(calendar.color)}}>แก้ไข</button>}
        </label>)}</div>
        {editable&&<>
          <button type="button" className="button gcal-create-calendar" onClick={()=>setNewCalendarOpen(value=>!value)}>+ สร้างปฏิทินใหม่</button>
          {newCalendarOpen&&<div className="gcal-calendar-form">
            <label>ชื่อปฏิทิน<input maxLength={120} value={newCalendarName} onChange={event=>setNewCalendarName(event.target.value)} placeholder="เช่น กำหนดส่งวัสดุ Plot 3"/></label>
            <label>สีประจำปฏิทิน<input type="color" value={newCalendarColor} onChange={event=>setNewCalendarColor(event.target.value)}/></label>
            <button type="button" className="button primary" disabled={saving||!newCalendarName.trim()} onClick={()=>void calendarAction('create')}>สร้างปฏิทิน</button>
          </div>}
          {calendarManageId&&<div className="gcal-calendar-form">
            <label>ชื่อปฏิทิน<input maxLength={120} value={calendarManageName} onChange={event=>setCalendarManageName(event.target.value)}/></label>
            <label>สี<input type="color" value={calendarManageColor} onChange={event=>setCalendarManageColor(event.target.value)}/></label>
            <div className="gcal-calendar-actions">
              <button type="button" className="button primary" disabled={saving||!calendarManageName.trim()} onClick={()=>void calendarAction('update')}>บันทึก</button>
              <button type="button" className="button" onClick={()=>setCalendarManageId('')}>ยกเลิก</button>
              <button type="button" className="button danger" disabled={saving} onClick={()=>void calendarAction('delete')}>ลบ</button>
            </div>
          </div>}
        </>}
        <p>Source: Google Calendar / Web App</p>
      </aside>

      <main className="panel gcal-stage">
        {message&&<div className="notice gcal-message">{message}</div>}
        {loading&&<div className="gcal-loading">กำลังโหลดปฏิทิน…</div>}
        {connection==='checking'?<div className="gcal-empty">กำลังตรวจสอบการเชื่อมต่อ…</div>:connection!=='shared'&&!selected.some(id=>localCalendarIds.has(id))&&!managedPlanSelected?<>
          {readOnlyEmbedUrl?<iframe key={readOnlyEmbedUrl} className="gcal-frame" src={readOnlyEmbedUrl} title="3 Kings Google Calendar" loading="eager" referrerPolicy="strict-origin-when-cross-origin"/>:<div className="gcal-empty">เลือกอย่างน้อย 1 ปฏิทิน</div>}
        </>:<>
          {mode==='MONTH'&&<>
            <div className="gcal-weekdays">{weekdayLabels(language).map(day=><b key={day}>{day}</b>)}</div>
            <div className="gcal-month-grid">{cells.map(dateKey=>{
              const dayEvents=eventsByDate.get(dateKey)||[]
              const visible=dayEvents.slice(0,MAX_MONTH_EVENTS)
              const hidden=Math.max(0,dayEvents.length-visible.length)
              return <div key={dateKey} className={'gcal-day '+(dateKey.slice(0,7)===focusDate.slice(0,7)?'':'outside')+(dateKey===todayBangkok()?' today':'')} onDoubleClick={()=>openCreate(dateKey)}>
                <div className="gcal-day-head"><button type="button" onClick={()=>openCreate(dateKey)}>{Number(dateKey.slice(8,10))}</button>{dateKey===todayBangkok()&&<small>วันนี้</small>}</div>
                <div className="gcal-day-events">{visible.map(renderCompactEvent)}{hidden>0&&<button type="button" className="gcal-more" onClick={()=>{setFocusDate(dateKey);setMode('AGENDA')}}>+{hidden} รายการ</button>}</div>
              </div>
            })}</div>
          </>}
          {mode==='WEEK'&&<div className="gcal-week-grid">{weekDays.map(dateKey=><div key={dateKey} className={'gcal-week-day '+(dateKey===todayBangkok()?'today':'')}>
            <div className="gcal-week-head"><b>{dayLabel(dateKey,language)}</b>{editable&&<button type="button" className="button" onClick={()=>openCreate(dateKey)}>+ เพิ่ม</button>}</div>
            <div className="gcal-week-events">{(eventsByDate.get(dateKey)||[]).map(renderCompactEvent)}{!(eventsByDate.get(dateKey)||[]).length&&<small className="muted">ไม่มีรายการ</small>}</div>
          </div>)}</div>}
          {mode==='AGENDA'&&<div className="gcal-agenda">{agendaEvents.map(event=><article key={event.calendarId+':'+event.id}><i style={{background:event.calendarColor}}/><div><b>{event.summary||'(ไม่มีชื่อ)'}</b><small>{dayLabel(eventDay(event),language)}{eventTime(event)?' · '+eventTime(event):' · ทั้งวัน'} · {event.calendarLabel}</small></div><button type="button" className="button" onClick={()=>openEdit(event)}>{editable?'รายละเอียด / แก้ไข':'รายละเอียด'}</button></article>)}{!agendaEvents.length&&!loading&&<div className="gcal-empty">ไม่มีรายการในช่วงนี้</div>}</div>}
        </>}
      </main>
    </div>

    {draft&&<div className="gcal-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!saving)setDraft(null)}}>
      <section className="gcal-modal" role="dialog" aria-modal="true">
        <div className="gcal-modal-head"><div><b>{!editable?'รายละเอียดรายการ':draft.eventId?'แก้ไขรายการ':'เพิ่มรายการ'}</b><small>{draft.recurring?'รายการซ้ำ • แก้ไข/ลบเฉพาะครั้งที่เลือก':localCalendarIds.has(draft.calendarId)?'ปฏิทิน Web App • 1 วันต่อรายการ':'บันทึกลง Google Calendar ส่วนกลาง'}</small></div><button type="button" className="button" disabled={saving} onClick={()=>setDraft(null)}>ปิด</button></div>
        <div className="gcal-form">
          <label>ปฏิทิน<select value={draft.calendarId} disabled={!!draft.eventId||!editable} onChange={event=>setDraft(current=>current?{...current,calendarId:event.target.value,allDay:localCalendarIds.has(event.target.value)?true:current.allDay,endDate:localCalendarIds.has(event.target.value)?current.startDate:current.endDate}:current)}>{allCalendars.map(calendar=><option key={calendar.id} value={calendar.id}>{calendar.label}</option>)}</select></label>
          <label>รายการ<input disabled={!editable} value={draft.title} onChange={event=>setDraft(current=>current?{...current,title:event.target.value}:current)} placeholder="ชื่องาน / นัดหมาย"/></label>
          <label className="gcal-wide">รายละเอียด<textarea disabled={!editable} value={draft.detail} onChange={event=>setDraft(current=>current?{...current,detail:event.target.value}:current)} placeholder="รายละเอียดเพิ่มเติม"/></label>
          {canLinkProcurement&&!localCalendarIds.has(draft.calendarId)&&<div className="gcal-wide gcal-procurement-link">
            <label>เชื่อมกับวันกำหนดส่งวัสดุ/จัดซื้อ (เฉพาะรายการที่ยังไม่รับของ)
              <input value={procurementQuery} onChange={event=>setProcurementQuery(event.target.value)} placeholder="ค้นหาชื่อวัสดุ / PO / ผู้ขาย"/>
              <select value={draft.procurementItemId} disabled={!editable} onChange={event=>setDraft(current=>current?{...current,procurementItemId:event.target.value}:current)}>
                <option value="">ไม่เชื่อมรายการจัดซื้อ</option>
                {procurementOptions.filter(row=>(row.item_name+' '+(row.vendor||'')+' '+(row.po_no||'')).toLowerCase().includes(procurementQuery.toLowerCase())||row.id===draft.procurementItemId).slice(0,150).map(row=>
                  <option key={row.id} value={row.id}>{[row.po_no,row.item_name,row.vendor].filter(Boolean).join(' • ')}</option>)}
              </select>
            </label>
            <small>เลือกใบสั่งซื้อที่ตรงกันและบันทึก: วันกำหนดส่งในหน้า Materials/Procurement จะอัปเดตผ่านชั้นข้อมูล Web App โดยไม่เขียนทับ PR/PO ต้นฉบับ</small>
          </div>}
          {draft.procurementItemId&&!canLinkProcurement&&<small className="gcal-wide">กิจกรรมนี้เชื่อมวันส่งวัสดุ ผู้มีสิทธิ์ Purchase/Owner เท่านั้นที่แก้ไขได้</small>}
          <label className="gcal-checkbox"><input type="checkbox" disabled={!editable||localCalendarIds.has(draft.calendarId)} checked={draft.allDay} onChange={event=>setDraft(current=>current?{...current,allDay:event.target.checked}:current)}/><span>ทั้งวัน</span></label>
          {draft.allDay?<><label>วันที่เริ่ม<input type="date" disabled={!editable} value={draft.startDate} onChange={event=>setDraft(current=>current?{...current,startDate:event.target.value,endDate:localCalendarIds.has(current.calendarId)?event.target.value:current.endDate}:current)}/></label><label>วันที่สิ้นสุด<input type="date" disabled={!editable||localCalendarIds.has(draft.calendarId)} value={draft.endDate} onChange={event=>setDraft(current=>current?{...current,endDate:event.target.value}:current)}/></label></>:<><label>เริ่ม<input type="datetime-local" disabled={!editable} value={draft.startDateTime} onChange={event=>setDraft(current=>current?{...current,startDateTime:event.target.value}:current)}/></label><label>สิ้นสุด<input type="datetime-local" disabled={!editable} value={draft.endDateTime} onChange={event=>setDraft(current=>current?{...current,endDateTime:event.target.value}:current)}/></label></>}
        </div>
        <div className="gcal-modal-actions">{draft.eventId&&editable&&<button type="button" className="button danger" disabled={saving} onClick={deleteEvent}>ลบรายการ</button>}<div><button type="button" className="button" disabled={saving} onClick={()=>setDraft(null)}>ยกเลิก</button>{editable&&<button type="button" className="button primary" disabled={saving||!draft.title.trim()} onClick={saveEvent}>{saving?'กำลังบันทึก…':'บันทึก'}</button>}</div></div>
      </section>
    </div>}

    <style jsx>{`
      .gcal-shell{display:grid;gap:8px}.gcal-loading-card{padding:12px}
      .gcal-owner-setup{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-color:#ead59a;background:#fffaf0}.gcal-owner-setup>div{display:grid;gap:1px}.gcal-owner-setup b{font-size:10.5px;color:#5f4b12}.gcal-owner-setup small{font-size:8.5px;color:#837347}
      .gcal-controls{display:grid;grid-template-columns:auto auto minmax(130px,1fr) auto;gap:7px;align-items:center;padding:7px 8px}.gcal-view-tabs{display:flex;gap:3px;padding:2px;background:#eef2f6;border-radius:9px}.gcal-view-tabs button,.gcal-selection-actions button{border:0;background:transparent;cursor:pointer;font:inherit}.gcal-view-tabs button{min-height:28px;padding:4px 10px;border-radius:7px;color:#5f6f82;font-size:10px;font-weight:800}.gcal-view-tabs button.active{background:#172a43;color:#fff}.gcal-nav{display:flex;gap:4px}.gcal-nav .button{min-height:30px;padding:5px 9px;font-size:9.5px}.gcal-period{text-align:center;color:#172a43;font-size:11px}.gcal-selection-actions{display:flex;justify-content:flex-end;gap:3px}.gcal-selection-actions button{padding:5px 6px;border-radius:6px;color:#294968;font-size:9px;font-weight:700}
      .gcal-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:8px}.gcal-filter{padding:9px;height:fit-content}.gcal-filter>b{display:block;font-size:10.5px;color:#172a43}.gcal-filter>small{display:block;margin-top:1px;color:var(--muted);font-size:8px}.gcal-filter>div{display:grid;gap:3px;margin-top:7px}.gcal-filter label{display:grid;grid-template-columns:15px 8px minmax(0,1fr);align-items:center;gap:6px;padding:5px 6px;border:1px solid transparent;border-radius:7px;color:#536376;font-size:9.5px;line-height:1.25;cursor:pointer}.gcal-filter label.selected{background:#f6f8fb;border-color:#dfe6ed;color:#172a43;font-weight:700}.gcal-filter input{width:13px;height:13px;margin:0}.gcal-filter i{width:8px;height:8px;border-radius:50%}.gcal-filter p{margin:8px 0 0;padding-top:7px;border-top:1px solid var(--line);color:var(--muted);font-size:8px}
      .gcal-filter .gcal-manage{border:0;background:transparent;color:#426b92;font-size:8.5px;font-weight:800;cursor:pointer}
      .gcal-filter label:has(.gcal-manage){grid-template-columns:15px 8px minmax(0,1fr) auto}
      .gcal-create-calendar{width:100%;margin-top:8px;font-size:10px!important}
      .gcal-calendar-form{display:grid;gap:6px;margin-top:8px;padding:8px;border:1px solid var(--line);border-radius:8px}
      .gcal-calendar-form label{display:grid!important;grid-template-columns:1fr!important;gap:3px;font-size:9px}
      .gcal-calendar-form input{width:100%;min-width:0;border:1px solid var(--line);border-radius:6px;padding:6px;font:inherit;font-size:10px}
      .gcal-calendar-form input[type=color]{height:32px;padding:3px}
      .gcal-calendar-actions{display:flex;flex-wrap:wrap;gap:4px}
      .gcal-procurement-link{display:grid;gap:5px;border-top:1px solid var(--line);padding-top:8px}
      .gcal-procurement-link>label{display:grid;gap:4px}
      .gcal-procurement-link>small{font-size:9px;color:var(--muted);line-height:1.4}
      .gcal-stage{padding:0;overflow:hidden;min-height:560px}.gcal-message{margin:7px;font-size:9px}.gcal-loading{padding:6px 8px;background:#f6f8fb;border-bottom:1px solid var(--line);color:#5d6c7b;font-size:9px}.gcal-frame{display:block;width:100%;height:68vh;min-height:560px;border:0}.gcal-empty{display:grid;place-items:center;min-height:100px;color:var(--muted);font-size:10px}
      .gcal-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));background:#f5f7fa;border-bottom:1px solid var(--line)}.gcal-weekdays b{text-align:center;padding:5px;font-size:8.5px;color:#657789;border-right:1px solid var(--line)}.gcal-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.gcal-day{min-height:94px;padding:4px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff;overflow:hidden}.gcal-day:nth-child(7n){border-right:0}.gcal-day.outside{background:#fafbfc}.gcal-day.today{box-shadow:inset 0 0 0 1.5px #8aa8c7}.gcal-day-head{display:flex;align-items:center;justify-content:space-between;gap:3px;margin-bottom:3px}.gcal-day-head button{width:21px;height:21px;border:0;border-radius:50%;background:transparent;font:inherit;font-size:9px;font-weight:800;cursor:pointer}.gcal-day-head small{font-size:7px;color:#386995}.gcal-day-events{display:grid;gap:2px}
      .gcal-event{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:3px;width:100%;min-width:0;max-height:32px;border:1px solid #e4e9ee;border-left-width:2px;border-left-style:solid;border-radius:4px;background:#fbfcfe;text-align:left;padding:2px 3px;margin:0;cursor:pointer;overflow:hidden;box-shadow:none}.gcal-event-time{font-size:7.5px;line-height:1.25;color:#738294;font-weight:700;white-space:nowrap}.gcal-event-title{min-width:0;font-size:8.5px;line-height:1.2;color:#263b50;font-weight:700;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:normal;word-break:break-word}.gcal-more{border:0;background:transparent;color:#5b7188;text-align:left;padding:1px 3px;font:inherit;font-size:7.5px;font-weight:800;cursor:pointer}
      .gcal-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));min-height:560px}.gcal-week-day{padding:5px;border-right:1px solid var(--line);overflow:hidden}.gcal-week-day.today{background:#fbfdff}.gcal-week-head{display:grid;gap:4px;margin-bottom:6px}.gcal-week-head b{font-size:9px;color:#314b66}.gcal-week-head .button{font-size:8px;min-height:25px;padding:3px 5px}.gcal-week-events{display:grid;gap:3px}.gcal-week-events>.muted{font-size:8px}
      .gcal-agenda{display:grid}.gcal-agenda article{display:grid;grid-template-columns:7px minmax(0,1fr) auto;gap:7px;align-items:start;padding:7px 8px;border-bottom:1px solid var(--line)}.gcal-agenda article>i{width:7px;height:7px;border-radius:50%;margin-top:3px}.gcal-agenda article b{display:block;font-size:9.5px;line-height:1.3;color:#243e59}.gcal-agenda article small{display:block;margin-top:1px;font-size:8px;color:var(--muted)}.gcal-agenda .button{min-height:27px;padding:4px 7px;font-size:8.5px}
      .gcal-modal-backdrop{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:18px;background:rgba(12,27,43,.48)}.gcal-modal{width:min(620px,100%);max-height:92vh;overflow:auto;border-radius:13px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:12px}.gcal-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}.gcal-modal-head>div{display:grid;gap:2px}.gcal-modal-head b{font-size:12px;color:#172a43}.gcal-modal-head small{font-size:8px;color:var(--muted)}.gcal-form{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.gcal-form label{display:grid;gap:3px;color:#667688;font-size:9px;font-weight:800}.gcal-form input,.gcal-form select,.gcal-form textarea{min-height:33px;border:1px solid var(--line);border-radius:7px;padding:7px;background:#fff;font:inherit;font-size:10px}.gcal-form textarea{min-height:70px;resize:vertical}.gcal-wide{grid-column:1/-1}.gcal-checkbox{display:flex!important;grid-column:1/-1;align-items:center;gap:6px}.gcal-checkbox input{width:15px;height:15px;min-height:0}.gcal-modal-actions{display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:9px;padding-top:8px;border-top:1px solid var(--line)}.gcal-modal-actions>div{display:flex;gap:5px;margin-left:auto}.danger{color:#a53232!important;border-color:#efcccc!important;background:#fff8f8!important}
      @media(max-width:900px){.gcal-controls{grid-template-columns:1fr 1fr}.gcal-period{grid-row:1;grid-column:1/-1}.gcal-layout{grid-template-columns:1fr}.gcal-filter>div{display:flex;overflow-x:auto;gap:4px}.gcal-filter label{flex:0 0 auto;white-space:nowrap}.gcal-filter p{display:none}.gcal-month-grid,.gcal-weekdays,.gcal-week-grid{min-width:700px}.gcal-stage{overflow-x:auto}.gcal-owner-setup{align-items:flex-start;flex-direction:column}}
      @media(max-width:620px){.gcal-controls{grid-template-columns:1fr}.gcal-period{grid-column:auto;grid-row:auto;order:-1}.gcal-nav,.gcal-selection-actions{justify-content:space-between}.gcal-view-tabs button{flex:1}.gcal-weekdays,.gcal-month-grid,.gcal-week-grid{min-width:650px}.gcal-form{grid-template-columns:1fr}.gcal-wide{grid-column:auto}.gcal-modal{padding:10px}.gcal-modal-actions{align-items:stretch;flex-direction:column}.gcal-modal-actions>div{margin-left:0}.gcal-modal-actions button{flex:1}}
    `}</style>
  </section>
}
