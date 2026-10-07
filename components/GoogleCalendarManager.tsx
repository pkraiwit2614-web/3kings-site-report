'use client'

import {useEffect,useMemo,useState} from 'react'
import useAccessRole from '@/components/useAccessRole'
import {canEditCalendar} from '@/lib/accessControl'
import {getSupabase} from '@/lib/supabase'
import {logActivity} from '@/lib/activityLog'
import {useI18n} from '@/components/I18nProvider'
import type {AppLanguage} from '@/lib/i18n'
import {WORK_CALENDARS,getWorkCalendar} from '@/lib/workCalendars'

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
type WorkEvent=GoogleEventApi&{calendarId:string;calendarLabel:string;calendarColor:string}
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
}

const STORAGE_SELECTION='3kings:google-calendar:selected'
const STORAGE_MODE='3kings:google-calendar:mode'
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
  return {eventId:null,calendarId,title:'',detail:'',allDay:true,startDate:dateKey,endDate:dateKey,startDateTime:dateKey+'T09:00',endDateTime:dateKey+'T10:00',recurring:false}
}
function draftFromEvent(event:WorkEvent):EventDraft{
  const allDay=!!event.start.date
  if(allDay){
    const start=event.start.date||todayBangkok()
    const apiEnd=event.end.date||addDays(start,1)
    return {eventId:event.id,calendarId:event.calendarId,title:event.summary||'',detail:event.description||'',allDay:true,startDate:start,endDate:addDays(apiEnd,-1),startDateTime:start+'T09:00',endDateTime:start+'T10:00',recurring:!!event.recurringEventId}
  }
  const start=event.start.dateTime||new Date().toISOString()
  const end=event.end.dateTime||start
  return {eventId:event.id,calendarId:event.calendarId,title:event.summary||'',detail:event.description||'',allDay:false,startDate:bangkokDateFromDateTime(start),endDate:bangkokDateFromDateTime(end),startDateTime:bangkokDateTimeInput(start),endDateTime:bangkokDateTimeInput(end),recurring:!!event.recurringEventId}
}
function errorMessage(value:unknown){
  return value instanceof Error?value.message:String(value||'Calendar request failed')
}

export function GoogleCalendarManager(){
  const {language}=useI18n()
  const {role,userId,ready}=useAccessRole()
  const editable=canEditCalendar(role)
  const [connection,setConnection]=useState<ConnectionState>('checking')
  const [ownerSetupRequired,setOwnerSetupRequired]=useState(false)
  const [appToken,setAppToken]=useState('')
  const [selected,setSelected]=useState<string[]>(()=>WORK_CALENDARS.map(row=>row.id))
  const [mode,setMode]=useState<CalendarMode>('MONTH')
  const [focusDate,setFocusDate]=useState(todayBangkok())
  const [events,setEvents]=useState<WorkEvent[]>([])
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [setupBusy,setSetupBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [draft,setDraft]=useState<EventDraft|null>(null)

  useEffect(()=>{
    try{
      const savedSelection=window.localStorage.getItem(STORAGE_SELECTION)
      if(savedSelection){
        const parsed=JSON.parse(savedSelection)
        const allowed=new Set(WORK_CALENDARS.map(row=>row.id))
        if(Array.isArray(parsed)){
          const valid=parsed.filter((value):value is string=>typeof value==='string'&&allowed.has(value))
          if(valid.length)setSelected(valid)
        }
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

  async function loadEvents(){
    if(connection!=='shared'||!appToken)return
    if(!selected.length){setEvents([]);return}
    setLoading(true)
    try{
      const results=await Promise.all(selected.map(async calendarId=>{
        const calendar=getWorkCalendar(calendarId)
        const params=new URLSearchParams({calendar_id:calendarId,time_min:apiTime(fetchWindow.start),time_max:apiTime(fetchWindow.end)})
        const data=await apiFetch<{items?:GoogleEventApi[]}>('/api/google-calendar/events?'+params.toString())
        return (data.items||[]).filter(item=>item.status!=='cancelled').map(item=>({...item,calendarId,calendarLabel:calendar?.label||calendarId,calendarColor:calendar?.color||'#7b61ff'}))
      }))
      setEvents(results.flat())
    }catch(error){
      setMessage('โหลดปฏิทินไม่สำเร็จ: '+errorMessage(error))
    }finally{setLoading(false)}
  }
  useEffect(()=>{if(connection==='shared'&&appToken)void loadEvents()},[connection,appToken,selected.join('|'),fetchWindow.start,fetchWindow.end])

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
    if(!editable||connection!=='shared')return
    setDraft(emptyDraft(selected[0]||WORK_CALENDARS[0].id,dateKey));setMessage('')
  }
  function openEdit(event:WorkEvent){
    if(!editable||connection!=='shared')return
    setDraft(draftFromEvent(event));setMessage('')
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
    if(!draft||!editable||connection!=='shared'||!draft.title.trim())return
    setSaving(true);setMessage('')
    try{
      const body=buildEventBody(draft)
      if(draft.eventId){
        await apiFetch('/api/google-calendar/events',{method:'PATCH',body:JSON.stringify({calendarId:draft.calendarId,eventId:draft.eventId,event:body})})
      }else{
        await apiFetch('/api/google-calendar/events',{method:'POST',body:JSON.stringify({calendarId:draft.calendarId,event:body})})
      }
      await logActivity({userId,eventType:'submit',path:'/calendar',action:draft.eventId?'google_calendar_event_update':'google_calendar_event_create',target:draft.eventId||draft.title,metadata:{calendar_id:draft.calendarId,start:draft.allDay?draft.startDate:draft.startDateTime,transport:'owner_oauth_shared'}})
      setDraft(null);setMessage(draft.eventId?'แก้ไขรายการเรียบร้อย':'เพิ่มรายการเรียบร้อย')
      await loadEvents()
    }catch(error){setMessage('บันทึกไม่สำเร็จ: '+errorMessage(error))}finally{setSaving(false)}
  }

  async function deleteEvent(){
    if(!draft?.eventId||!editable||connection!=='shared')return
    if(!window.confirm('ลบ “'+(draft.title||'รายการนี้')+'” ออกจาก Google Calendar จริงใช่หรือไม่?'))return
    setSaving(true);setMessage('')
    try{
      await apiFetch('/api/google-calendar/events',{method:'DELETE',body:JSON.stringify({calendarId:draft.calendarId,eventId:draft.eventId})})
      await logActivity({userId,eventType:'submit',path:'/calendar',action:'google_calendar_event_delete',target:draft.eventId,metadata:{calendar_id:draft.calendarId,transport:'owner_oauth_shared'}})
      setDraft(null);setMessage('ลบรายการเรียบร้อย')
      await loadEvents()
    }catch(error){setMessage('ลบไม่สำเร็จ: '+errorMessage(error))}finally{setSaving(false)}
  }

  const goPrevious=()=>setFocusDate(mode==='WEEK'?addDays(focusDate,-7):shiftMonth(firstOfMonth(focusDate),-1))
  const goNext=()=>setFocusDate(mode==='WEEK'?addDays(focusDate,7):shiftMonth(firstOfMonth(focusDate),1))
  const renderCompactEvent=(event:WorkEvent)=>(
    <button type="button" key={event.calendarId+':'+event.id} className="gcal-event" style={{borderLeftColor:event.calendarColor}} onClick={()=>openEdit(event)} title={event.summary||'(ไม่มีชื่อ)'}>
      {eventTime(event)&&<span className="gcal-event-time">{eventTime(event)}</span>}
      <span className="gcal-event-title">{event.summary||'(ไม่มีชื่อ)'}</span>
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
      <div className="gcal-selection-actions"><button type="button" onClick={()=>setSelected(WORK_CALENDARS.map(row=>row.id))}>เลือกทั้งหมด</button><button type="button" onClick={()=>setSelected([])}>ล้าง</button></div>
    </div>

    <div className="gcal-layout">
      <aside className="panel gcal-filter">
        <b>ปฏิทินที่แสดง</b><small>{selected.length} / {WORK_CALENDARS.length} ปฏิทิน</small>
        <div>{WORK_CALENDARS.map(calendar=><label key={calendar.id} className={selectedSet.has(calendar.id)?'selected':''}><input type="checkbox" checked={selectedSet.has(calendar.id)} onChange={()=>toggleCalendar(calendar.id)}/><i style={{background:calendar.color}}/><span>{calendar.label}</span></label>)}</div>
        <p>Source: Google Calendar</p>
      </aside>

      <main className="panel gcal-stage">
        {message&&<div className="notice gcal-message">{message}</div>}
        {loading&&<div className="gcal-loading">กำลังโหลดปฏิทิน…</div>}
        {connection==='checking'?<div className="gcal-empty">กำลังตรวจสอบการเชื่อมต่อ…</div>:connection!=='shared'?<>
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
          {mode==='AGENDA'&&<div className="gcal-agenda">{agendaEvents.map(event=><article key={event.calendarId+':'+event.id}><i style={{background:event.calendarColor}}/><div><b>{event.summary||'(ไม่มีชื่อ)'}</b><small>{dayLabel(eventDay(event),language)}{eventTime(event)?' · '+eventTime(event):' · ทั้งวัน'} · {event.calendarLabel}</small></div>{editable&&<button type="button" className="button" onClick={()=>openEdit(event)}>แก้ไข</button>}</article>)}{!agendaEvents.length&&!loading&&<div className="gcal-empty">ไม่มีรายการในช่วงนี้</div>}</div>}
        </>}
      </main>
    </div>

    {draft&&<div className="gcal-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!saving)setDraft(null)}}>
      <section className="gcal-modal" role="dialog" aria-modal="true">
        <div className="gcal-modal-head"><div><b>{draft.eventId?'แก้ไขรายการ':'เพิ่มรายการ'}</b><small>{draft.recurring?'รายการซ้ำ • แก้ไข/ลบเฉพาะครั้งที่เลือก':'บันทึกลง Google Calendar'}</small></div><button type="button" className="button" disabled={saving} onClick={()=>setDraft(null)}>ปิด</button></div>
        <div className="gcal-form">
          <label>ปฏิทิน<select value={draft.calendarId} disabled={!!draft.eventId} onChange={event=>setDraft(current=>current?{...current,calendarId:event.target.value}:current)}>{WORK_CALENDARS.map(calendar=><option key={calendar.id} value={calendar.id}>{calendar.label}</option>)}</select></label>
          <label>รายการ<input value={draft.title} onChange={event=>setDraft(current=>current?{...current,title:event.target.value}:current)} placeholder="ชื่องาน / นัดหมาย"/></label>
          <label className="gcal-wide">รายละเอียด<textarea value={draft.detail} onChange={event=>setDraft(current=>current?{...current,detail:event.target.value}:current)} placeholder="รายละเอียดเพิ่มเติม"/></label>
          <label className="gcal-checkbox"><input type="checkbox" checked={draft.allDay} onChange={event=>setDraft(current=>current?{...current,allDay:event.target.checked}:current)}/><span>ทั้งวัน</span></label>
          {draft.allDay?<><label>วันที่เริ่ม<input type="date" value={draft.startDate} onChange={event=>setDraft(current=>current?{...current,startDate:event.target.value}:current)}/></label><label>วันที่สิ้นสุด<input type="date" value={draft.endDate} onChange={event=>setDraft(current=>current?{...current,endDate:event.target.value}:current)}/></label></>:<><label>เริ่ม<input type="datetime-local" value={draft.startDateTime} onChange={event=>setDraft(current=>current?{...current,startDateTime:event.target.value}:current)}/></label><label>สิ้นสุด<input type="datetime-local" value={draft.endDateTime} onChange={event=>setDraft(current=>current?{...current,endDateTime:event.target.value}:current)}/></label></>}
        </div>
        <div className="gcal-modal-actions">{draft.eventId&&<button type="button" className="button danger" disabled={saving} onClick={deleteEvent}>ลบรายการ</button>}<div><button type="button" className="button" disabled={saving} onClick={()=>setDraft(null)}>ยกเลิก</button><button type="button" className="button primary" disabled={saving||!draft.title.trim()} onClick={saveEvent}>{saving?'กำลังบันทึก…':'บันทึก'}</button></div></div>
      </section>
    </div>}

    <style jsx>{`
      .gcal-shell{display:grid;gap:8px}.gcal-loading-card{padding:12px}
      .gcal-owner-setup{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-color:#ead59a;background:#fffaf0}.gcal-owner-setup>div{display:grid;gap:1px}.gcal-owner-setup b{font-size:10.5px;color:#5f4b12}.gcal-owner-setup small{font-size:8.5px;color:#837347}
      .gcal-controls{display:grid;grid-template-columns:auto auto minmax(130px,1fr) auto;gap:7px;align-items:center;padding:7px 8px}.gcal-view-tabs{display:flex;gap:3px;padding:2px;background:#eef2f6;border-radius:9px}.gcal-view-tabs button,.gcal-selection-actions button{border:0;background:transparent;cursor:pointer;font:inherit}.gcal-view-tabs button{min-height:28px;padding:4px 10px;border-radius:7px;color:#5f6f82;font-size:10px;font-weight:800}.gcal-view-tabs button.active{background:#172a43;color:#fff}.gcal-nav{display:flex;gap:4px}.gcal-nav .button{min-height:30px;padding:5px 9px;font-size:9.5px}.gcal-period{text-align:center;color:#172a43;font-size:11px}.gcal-selection-actions{display:flex;justify-content:flex-end;gap:3px}.gcal-selection-actions button{padding:5px 6px;border-radius:6px;color:#294968;font-size:9px;font-weight:700}
      .gcal-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:8px}.gcal-filter{padding:9px;height:fit-content}.gcal-filter>b{display:block;font-size:10.5px;color:#172a43}.gcal-filter>small{display:block;margin-top:1px;color:var(--muted);font-size:8px}.gcal-filter>div{display:grid;gap:3px;margin-top:7px}.gcal-filter label{display:grid;grid-template-columns:15px 8px minmax(0,1fr);align-items:center;gap:6px;padding:5px 6px;border:1px solid transparent;border-radius:7px;color:#536376;font-size:9.5px;line-height:1.25;cursor:pointer}.gcal-filter label.selected{background:#f6f8fb;border-color:#dfe6ed;color:#172a43;font-weight:700}.gcal-filter input{width:13px;height:13px;margin:0}.gcal-filter i{width:8px;height:8px;border-radius:50%}.gcal-filter p{margin:8px 0 0;padding-top:7px;border-top:1px solid var(--line);color:var(--muted);font-size:8px}
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
