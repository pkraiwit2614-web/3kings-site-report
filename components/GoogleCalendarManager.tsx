'use client'

import Script from 'next/script'
import {useEffect,useMemo,useState} from 'react'
import useAccessRole from '@/components/useAccessRole'
import {canEditCalendar} from '@/lib/accessControl'
import {logActivity} from '@/lib/activityLog'
import {useI18n} from '@/components/I18nProvider'
import type {AppLanguage} from '@/lib/i18n'

type CalendarMode='MONTH'|'WEEK'|'AGENDA'
type WorkCalendar={id:string;label:string;color:string}
type GoogleEventApi={
  id:string
  summary?:string
  description?:string
  htmlLink?:string
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

declare global{
  interface Window{
    google?:{
      accounts?:{
        oauth2?:{
          initTokenClient:(config:{
            client_id:string
            scope:string
            prompt?:string
            callback:(response:{access_token?:string;expires_in?:number;error?:string;error_description?:string})=>void
            error_callback?:(error:{type?:string})=>void
          })=>{requestAccessToken:(options?:{prompt?:string})=>void}
        }
      }
    }
  }
}

export const WORK_CALENDARS:WorkCalendar[]=[
  {id:'family17900518303332507254@group.calendar.google.com',label:'3 Kings – Construction Plan',color:'#b99aff'},
  {id:'9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com',label:'3 Kings – Site / Actual',color:'#ff7537'},
  {id:'6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com',label:'กำหนดส่ง-ของเข้าหน้างาน',color:'#a47ae2'},
  {id:'9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com',label:'3K - Above Villa 6',color:'#c2c2c2'},
  {id:'7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com',label:'3K - Above Villa 7',color:'#ff7537'},
  {id:'d31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com',label:'3K - Above Villa 8',color:'#cca6ac'},
  {id:'958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com',label:'3K - Above Villa 9',color:'#b3dc6c'},
]

const STORAGE_SELECTION='3kings:google-calendar:selected'
const STORAGE_MODE='3kings:google-calendar:mode'
const STORAGE_CLIENT_ID='3kings:google-calendar:oauth-client-id'
const TOKEN_STORAGE='3kings:google-calendar:access-token'
const TOKEN_EXPIRY_STORAGE='3kings:google-calendar:access-token-expiry'
const GOOGLE_SCOPE='https://www.googleapis.com/auth/calendar.events'

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

function apiTime(dateKey:string){
  return dateKey+'T00:00:00+07:00'
}

function toBangkokRfc3339(value:string){
  return value.length===16?value+':00+07:00':value+'+07:00'
}

function eventDay(event:WorkEvent){
  if(event.start.date)return event.start.date
  if(event.start.dateTime)return bangkokDateFromDateTime(event.start.dateTime)
  return ''
}

function emptyDraft(calendarId:string,dateKey:string):EventDraft{
  return {eventId:null,calendarId,title:'',detail:'',allDay:true,startDate:dateKey,endDate:dateKey,startDateTime:dateKey+'T09:00',endDateTime:dateKey+'T10:00',recurring:false}
}

function draftFromEvent(event:WorkEvent):EventDraft{
  const allDay=!!event.start.date
  if(allDay){
    const start=event.start.date||todayBangkok()
    const apiEnd=event.end.date||addDays(start,1)
    return {
      eventId:event.id,calendarId:event.calendarId,title:event.summary||'',detail:event.description||'',allDay:true,
      startDate:start,endDate:addDays(apiEnd,-1),startDateTime:start+'T09:00',endDateTime:start+'T10:00',
      recurring:!!event.recurringEventId,
    }
  }
  const start=event.start.dateTime||new Date().toISOString()
  const end=event.end.dateTime||start
  return {
    eventId:event.id,calendarId:event.calendarId,title:event.summary||'',detail:event.description||'',allDay:false,
    startDate:bangkokDateFromDateTime(start),endDate:bangkokDateFromDateTime(end),
    startDateTime:bangkokDateTimeInput(start),endDateTime:bangkokDateTimeInput(end),
    recurring:!!event.recurringEventId,
  }
}

function googleErrorMessage(value:unknown){
  if(value instanceof Error)return value.message
  return String(value||'Google Calendar request failed')
}

async function googleFetch<T>(token:string,url:string,init?:RequestInit):Promise<T>{
  const headers=new Headers(init?.headers||{})
  headers.set('Authorization','Bearer '+token)
  if(init?.body)headers.set('Content-Type','application/json')
  const response=await fetch(url,{...init,headers})
  if(response.status===204)return null as T
  const body=await response.json().catch(()=>null)
  if(!response.ok){
    const message=body?.error?.message||body?.error_description||('Google Calendar HTTP '+response.status)
    const error=new Error(message) as Error&{status?:number}
    error.status=response.status
    throw error
  }
  return body as T
}

export default function GoogleCalendarManager(){
  const {language}=useI18n()
  const {role,userId,ready}=useAccessRole()
  const editable=canEditCalendar(role)
  const envClientId=process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID||''
  const [clientId,setClientId]=useState(envClientId)
  const [clientIdInput,setClientIdInput]=useState('')
  const [googleReady,setGoogleReady]=useState(false)
  const [token,setToken]=useState('')
  const [tokenExpiry,setTokenExpiry]=useState(0)
  const [selected,setSelected]=useState<string[]>(()=>WORK_CALENDARS.map(row=>row.id))
  const [mode,setMode]=useState<CalendarMode>('MONTH')
  const [focusDate,setFocusDate]=useState(todayBangkok())
  const [events,setEvents]=useState<WorkEvent[]>([])
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [draft,setDraft]=useState<EventDraft|null>(null)

  useEffect(()=>{
    try{
      const savedClient=window.localStorage.getItem(STORAGE_CLIENT_ID)||''
      if(!envClientId&&savedClient){setClientId(savedClient);setClientIdInput(savedClient)}
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
      const savedToken=window.sessionStorage.getItem(TOKEN_STORAGE)||''
      const savedExpiry=Number(window.sessionStorage.getItem(TOKEN_EXPIRY_STORAGE)||0)
      if(savedToken&&savedExpiry>Date.now()+30000){setToken(savedToken);setTokenExpiry(savedExpiry)}
    }catch{}
  },[envClientId])

  useEffect(()=>{try{window.localStorage.setItem(STORAGE_SELECTION,JSON.stringify(selected))}catch{}},[selected])
  useEffect(()=>{try{window.localStorage.setItem(STORAGE_MODE,mode)}catch{}},[mode])

  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const calendarMap=useMemo(()=>new Map(WORK_CALENDARS.map(row=>[row.id,row])),[])
  const monthStart=firstOfMonth(focusDate)
  const cells=useMemo(()=>monthCells(monthStart),[monthStart])
  const weekStart=mondayOf(focusDate)
  const weekDays=useMemo(()=>Array.from({length:7},(_,index)=>addDays(weekStart,index)),[weekStart])

  const fetchWindow=useMemo(()=>{
    if(mode==='WEEK')return {start:weekStart,end:addDays(weekStart,7)}
    return {start:cells[0],end:addDays(cells[cells.length-1],1)}
  },[mode,weekStart,cells])

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

  const disconnectGoogle=()=>{
    setToken('');setTokenExpiry(0);setEvents([]);setDraft(null)
    try{window.sessionStorage.removeItem(TOKEN_STORAGE);window.sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE)}catch{}
    setMessage('ตัดการเชื่อม Google Calendar ในแท็บนี้แล้ว')
  }

  const loadEvents=async(accessToken=token)=>{
    if(!accessToken||!selected.length)return
    setLoading(true);setMessage('')
    try{
      const results=await Promise.all(selected.map(async calendarId=>{
        const calendar=calendarMap.get(calendarId)
        const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin='+encodeURIComponent(apiTime(fetchWindow.start))+'&timeMax='+encodeURIComponent(apiTime(fetchWindow.end))
        const data=await googleFetch<{items?:GoogleEventApi[]}>(accessToken,url)
        return (data.items||[]).filter(item=>item.status!=='cancelled').map(item=>({...item,calendarId,calendarLabel:calendar?.label||calendarId,calendarColor:calendar?.color||'#7b61ff'}))
      }))
      setEvents(results.flat())
    }catch(error){
      const status=(error as Error&{status?:number})?.status
      if(status===401){disconnectGoogle();setMessage('สิทธิ์ Google หมดอายุ กรุณาเชื่อม Google Calendar ใหม่')}
      else setMessage('โหลด Google Calendar ไม่สำเร็จ: '+googleErrorMessage(error))
    }finally{setLoading(false)}
  }

  useEffect(()=>{if(token&&tokenExpiry>Date.now()+30000)void loadEvents(token)},[token,selected.join('|'),fetchWindow.start,fetchWindow.end])

  const connectGoogle=()=>{
    if(!editable)return
    if(!clientId){setMessage('ยังไม่ได้ตั้ง Google OAuth Client ID สำหรับ Web App');return}
    if(!googleReady||!window.google?.accounts?.oauth2){setMessage('Google Identity Services ยังโหลดไม่เสร็จ กรุณาลองอีกครั้ง');return}
    setMessage('')
    const tokenClient=window.google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:GOOGLE_SCOPE,
      prompt:'',
      callback:(response)=>{
        if(response.error||!response.access_token){
          setMessage('เชื่อม Google Calendar ไม่สำเร็จ: '+(response.error_description||response.error||'ไม่ได้รับ Access Token'))
          return
        }
        const expiry=Date.now()+Math.max(60,Number(response.expires_in||3600))*1000
        setToken(response.access_token);setTokenExpiry(expiry)
        try{window.sessionStorage.setItem(TOKEN_STORAGE,response.access_token);window.sessionStorage.setItem(TOKEN_EXPIRY_STORAGE,String(expiry))}catch{}
        setMessage('เชื่อม Google Calendar แล้ว • การเพิ่ม/แก้ไข/ลบจะเขียนกลับ Google จริง')
        void loadEvents(response.access_token)
      },
      error_callback:()=>setMessage('หน้าต่างเชื่อม Google ถูกปิดหรือถูกบล็อก'),
    })
    tokenClient.requestAccessToken({prompt:token?'':'consent'})
  }

  const saveClientId=()=>{
    if(role!=='owner')return
    const value=clientIdInput.trim()
    if(!value){setMessage('กรุณาใส่ Google OAuth Client ID');return}
    try{window.localStorage.setItem(STORAGE_CLIENT_ID,value)}catch{}
    setClientId(value)
    setMessage('บันทึก OAuth Client ID ในเบราว์เซอร์นี้แล้ว กด “เชื่อม Google Calendar” ต่อได้เลย')
  }

  const toggleCalendar=(id:string)=>{
    setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])
  }

  const openCreate=(dateKey:string)=>{
    if(!editable||!token)return
    const target=selected[0]||WORK_CALENDARS[0].id
    setDraft(emptyDraft(target,dateKey));setMessage('')
  }

  const openEdit=(event:WorkEvent)=>{
    if(!editable||!token)return
    setDraft(draftFromEvent(event));setMessage('')
  }

  const buildEventBody=(value:EventDraft)=>{
    if(value.allDay){
      if(!value.startDate||!value.endDate)throw new Error('กรุณาระบุวันที่เริ่มและวันที่สิ้นสุด')
      if(value.endDate<value.startDate)throw new Error('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม')
      return {summary:value.title.trim(),description:value.detail.trim()||undefined,start:{date:value.startDate},end:{date:addDays(value.endDate,1)}}
    }
    if(!value.startDateTime||!value.endDateTime)throw new Error('กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด')
    if(value.endDateTime<=value.startDateTime)throw new Error('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม')
    return {summary:value.title.trim(),description:value.detail.trim()||undefined,start:{dateTime:toBangkokRfc3339(value.startDateTime),timeZone:'Asia/Bangkok'},end:{dateTime:toBangkokRfc3339(value.endDateTime),timeZone:'Asia/Bangkok'}}
  }

  const saveEvent=async()=>{
    if(!draft||!editable||!token||!draft.title.trim())return
    setSaving(true);setMessage('')
    try{
      const body=buildEventBody(draft)
      if(draft.eventId){
        const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(draft.calendarId)+'/events/'+encodeURIComponent(draft.eventId)
        await googleFetch(token,url,{method:'PATCH',body:JSON.stringify(body)})
        await logActivity({userId,eventType:'submit',path:'/calendar',action:'google_calendar_event_update',target:draft.eventId,metadata:{calendar_id:draft.calendarId,start:draft.allDay?draft.startDate:draft.startDateTime}})
        setMessage(draft.recurring?'แก้ไข Event ใน Google Calendar แล้ว • รายการซ้ำแก้เฉพาะครั้งที่เลือก':'แก้ไข Event ใน Google Calendar แล้ว')
      }else{
        const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(draft.calendarId)+'/events'
        const created=await googleFetch<GoogleEventApi>(token,url,{method:'POST',body:JSON.stringify(body)})
        await logActivity({userId,eventType:'submit',path:'/calendar',action:'google_calendar_event_create',target:created.id,metadata:{calendar_id:draft.calendarId,start:draft.allDay?draft.startDate:draft.startDateTime}})
        setMessage('เพิ่ม Event เข้า Google Calendar จริงแล้ว')
      }
      setDraft(null)
      await loadEvents()
    }catch(error){
      const status=(error as Error&{status?:number})?.status
      if(status===401){disconnectGoogle();setMessage('สิทธิ์ Google หมดอายุ กรุณาเชื่อมใหม่')}
      else if(status===403)setMessage('Google ไม่อนุญาตให้แก้ปฏิทินนี้ ตรวจว่าบัญชี Google ที่เชื่อมมีสิทธิ์แก้ไข')
      else setMessage('บันทึกไม่สำเร็จ: '+googleErrorMessage(error))
    }finally{setSaving(false)}
  }

  const deleteEvent=async()=>{
    if(!draft?.eventId||!editable||!token)return
    const label=draft.title||'รายการนี้'
    if(!window.confirm('ลบ “'+label+'” ออกจาก Google Calendar จริงใช่หรือไม่?'))return
    setSaving(true);setMessage('')
    try{
      const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(draft.calendarId)+'/events/'+encodeURIComponent(draft.eventId)
      await googleFetch(token,url,{method:'DELETE'})
      await logActivity({userId,eventType:'submit',path:'/calendar',action:'google_calendar_event_delete',target:draft.eventId,metadata:{calendar_id:draft.calendarId}})
      setDraft(null);setMessage(draft.recurring?'ลบรายการครั้งที่เลือกออกจาก Google Calendar แล้ว':'ลบ Event ออกจาก Google Calendar แล้ว')
      await loadEvents()
    }catch(error){
      setMessage('ลบไม่สำเร็จ: '+googleErrorMessage(error))
    }finally{setSaving(false)}
  }

  const goPrevious=()=>{
    if(mode==='WEEK')setFocusDate(addDays(focusDate,-7))
    else setFocusDate(shiftMonth(firstOfMonth(focusDate),-1))
  }
  const goNext=()=>{
    if(mode==='WEEK')setFocusDate(addDays(focusDate,7))
    else setFocusDate(shiftMonth(firstOfMonth(focusDate),1))
  }

  const renderEvent=(event:WorkEvent)=>(
    <button type="button" key={event.calendarId+':'+event.id} className="gcal-event" style={{borderLeftColor:event.calendarColor}} onClick={()=>openEdit(event)}>
      <strong>{event.summary||'(ไม่มีชื่อ)'}</strong>
      <small>{event.start.dateTime?bangkokDateTimeInput(event.start.dateTime).slice(11):'ทั้งวัน'} • {event.calendarLabel}</small>
    </button>
  )

  const renderReadOnly=()=>(
    <div className="gcal-readonly">
      <div className="gcal-readonly-note">
        <b>Google Calendar — โหมดดูอย่างเดียว</b>
        <span>{editable?'เชื่อม Google Calendar เพื่อเปิดการเพิ่ม/แก้ไข/ลบจากหน้านี้':'สิทธิ์ของบัญชีนี้เป็นโหมดดูข้อมูล'}</span>
      </div>
      {readOnlyEmbedUrl?<iframe key={readOnlyEmbedUrl} className="gcal-frame" src={readOnlyEmbedUrl} title="3 Kings Google Calendar" loading="eager" referrerPolicy="strict-origin-when-cross-origin"/>:<div className="gcal-empty">เลือกอย่างน้อย 1 ปฏิทิน</div>}
    </div>
  )

  if(!ready)return <section className="panel gcal-shell">กำลังตรวจสอบสิทธิ์…</section>

  return <section className="gcal-shell">
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={()=>setGoogleReady(true)}/>

    <div className="panel gcal-top">
      <div>
        <b>Google Calendar</b>
        <small>Source of truth เดียว • Event ที่เพิ่ม/แก้ไข/ลบจากหน้านี้จะเปลี่ยนใน Google Calendar จริง</small>
      </div>
      <div className="gcal-connect-actions">
        {editable&&token&&<span className="gcal-connected">เชื่อมแล้ว</span>}
        {editable&&<button type="button" className="button primary" onClick={connectGoogle}>{token?'ต่ออายุสิทธิ์ Google':'เชื่อม Google Calendar'}</button>}
        {editable&&token&&<button type="button" className="button" onClick={disconnectGoogle}>ตัดการเชื่อม</button>}
        <a className="button" href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noreferrer">เปิดใน Google</a>
      </div>
    </div>

    {editable&&!clientId&&role==='owner'&&<div className="panel gcal-oauth-config">
      <div><b>ตั้งค่า Google OAuth ครั้งเดียว</b><small>ต้องใช้ OAuth Client ID แบบ Web application ของ Google Cloud • Client ID ไม่ใช่รหัสลับ และจะเก็บเฉพาะในเบราว์เซอร์นี้จนกว่าจะย้ายไป Environment Variable</small></div>
      <input value={clientIdInput} onChange={event=>setClientIdInput(event.target.value)} placeholder="xxxxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com"/>
      <button type="button" className="button primary" onClick={saveClientId}>บันทึก Client ID</button>
      <small>Authorized JavaScript origin สำหรับระบบหลัก: https://3kings-site-report.vercel.app</small>
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
      <div className="gcal-selection-actions">
        <button type="button" onClick={()=>setSelected(WORK_CALENDARS.map(row=>row.id))}>เลือกทั้งหมด</button>
        <button type="button" onClick={()=>setSelected([])}>ล้าง</button>
      </div>
    </div>

    <div className="gcal-layout">
      <aside className="panel gcal-filter">
        <b>ปฏิทินที่แสดง</b>
        <small>{selected.length} / {WORK_CALENDARS.length} ปฏิทิน</small>
        <div>
          {WORK_CALENDARS.map(calendar=><label key={calendar.id} className={selectedSet.has(calendar.id)?'selected':''}>
            <input type="checkbox" checked={selectedSet.has(calendar.id)} onChange={()=>toggleCalendar(calendar.id)}/>
            <i style={{background:calendar.color}}/>
            <span>{calendar.label}</span>
          </label>)}
        </div>
        <p>Google Calendar เป็น Source of Truth • ระบบ Web App Calendar เดิมไม่ถูกใช้สร้างข้อมูลใหม่</p>
      </aside>

      <main className="panel gcal-stage">
        {message&&<div className="notice gcal-message">{message}</div>}
        {loading&&<div className="gcal-loading">กำลังโหลด Google Calendar…</div>}
        {!token?renderReadOnly():<>
          {mode==='MONTH'&&<>
            <div className="gcal-weekdays">{weekdayLabels(language).map(day=><b key={day}>{day}</b>)}</div>
            <div className="gcal-month-grid">
              {cells.map(dateKey=><div key={dateKey} className={'gcal-day '+(dateKey.slice(0,7)===focusDate.slice(0,7)?'':'outside')+(dateKey===todayBangkok()?' today':'')} onDoubleClick={()=>openCreate(dateKey)}>
                <div className="gcal-day-head"><button type="button" onClick={()=>openCreate(dateKey)}>{Number(dateKey.slice(8,10))}</button>{dateKey===todayBangkok()&&<small>วันนี้</small>}</div>
                <div className="gcal-day-events">{(eventsByDate.get(dateKey)||[]).map(renderEvent)}</div>
              </div>)}
            </div>
          </>}
          {mode==='WEEK'&&<div className="gcal-week-grid">
            {weekDays.map(dateKey=><div key={dateKey} className={'gcal-week-day '+(dateKey===todayBangkok()?'today':'')}>
              <div className="gcal-week-head"><b>{dayLabel(dateKey,language)}</b>{editable&&<button type="button" className="button" onClick={()=>openCreate(dateKey)}>+ เพิ่ม</button>}</div>
              <div className="gcal-week-events">{(eventsByDate.get(dateKey)||[]).map(renderEvent)}{!(eventsByDate.get(dateKey)||[]).length&&<small className="muted">ไม่มีรายการ</small>}</div>
            </div>)}
          </div>}
          {mode==='AGENDA'&&<div className="gcal-agenda">
            {agendaEvents.map(event=><article key={event.calendarId+':'+event.id}><i style={{background:event.calendarColor}}/><div><b>{event.summary||'(ไม่มีชื่อ)'}</b><small>{dayLabel(eventDay(event),language)} • {event.start.dateTime?bangkokDateTimeInput(event.start.dateTime).slice(11):'ทั้งวัน'} • {event.calendarLabel}</small>{event.description&&<p>{event.description}</p>}</div>{editable&&<button type="button" className="button" onClick={()=>openEdit(event)}>แก้ไข</button>}</article>)}
            {!agendaEvents.length&&!loading&&<div className="gcal-empty">ไม่มีรายการในช่วงนี้</div>}
          </div>}
        </>}
      </main>
    </div>

    {draft&&<div className="gcal-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target&&!saving)setDraft(null)}}>
      <section className="gcal-modal" role="dialog" aria-modal="true" aria-label={draft.eventId?'แก้ไข Google Calendar Event':'เพิ่ม Google Calendar Event'}>
        <div className="gcal-modal-head"><div><b>{draft.eventId?'แก้ไข Event':'เพิ่ม Event'}</b><small>{draft.recurring?'รายการนี้เป็น Event ซ้ำ • การแก้ไข/ลบจะมีผลเฉพาะครั้งที่เลือก':'บันทึกตรงไปยัง Google Calendar'}</small></div><button type="button" className="button" disabled={saving} onClick={()=>setDraft(null)}>ปิด</button></div>
        <div className="gcal-form">
          <label>ปฏิทิน<select value={draft.calendarId} disabled={!!draft.eventId} onChange={event=>setDraft(current=>current?{...current,calendarId:event.target.value}:current)}>{WORK_CALENDARS.map(calendar=><option key={calendar.id} value={calendar.id}>{calendar.label}</option>)}</select></label>
          <label>รายการ<input value={draft.title} onChange={event=>setDraft(current=>current?{...current,title:event.target.value}:current)} placeholder="ชื่องาน / นัดหมาย"/></label>
          <label className="gcal-wide">รายละเอียด<textarea value={draft.detail} onChange={event=>setDraft(current=>current?{...current,detail:event.target.value}:current)} placeholder="รายละเอียดเพิ่มเติม"/></label>
          <label className="gcal-checkbox"><input type="checkbox" checked={draft.allDay} onChange={event=>setDraft(current=>current?{...current,allDay:event.target.checked}:current)}/><span>ทั้งวัน</span></label>
          {draft.allDay?<>
            <label>วันที่เริ่ม<input type="date" value={draft.startDate} onChange={event=>setDraft(current=>current?{...current,startDate:event.target.value}:current)}/></label>
            <label>วันที่สิ้นสุด<input type="date" value={draft.endDate} onChange={event=>setDraft(current=>current?{...current,endDate:event.target.value}:current)}/></label>
          </>:<>
            <label>เริ่ม<input type="datetime-local" value={draft.startDateTime} onChange={event=>setDraft(current=>current?{...current,startDateTime:event.target.value}:current)}/></label>
            <label>สิ้นสุด<input type="datetime-local" value={draft.endDateTime} onChange={event=>setDraft(current=>current?{...current,endDateTime:event.target.value}:current)}/></label>
          </>}
        </div>
        <div className="gcal-modal-actions">
          {draft.eventId&&<button type="button" className="button danger" disabled={saving} onClick={deleteEvent}>ลบ Event</button>}
          <div><button type="button" className="button" disabled={saving} onClick={()=>setDraft(null)}>ยกเลิก</button><button type="button" className="button primary" disabled={saving||!draft.title.trim()} onClick={saveEvent}>{saving?'กำลังบันทึก…':'บันทึก Google Calendar'}</button></div>
        </div>
      </section>
    </div>}

    <style jsx>{`
      .gcal-shell{display:grid;gap:12px}.gcal-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px}.gcal-top>div:first-child{display:grid;gap:3px}.gcal-top b{color:var(--navy);font-size:14px}.gcal-top small{color:var(--muted);font-size:10px}.gcal-connect-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.gcal-connected{padding:5px 8px;border-radius:999px;background:#edf8f0;color:#287b3d;font-size:9px;font-weight:800}
      .gcal-oauth-config{display:grid;grid-template-columns:minmax(260px,1fr) minmax(260px,1.2fr) auto;gap:8px;align-items:end;padding:12px;border-color:#e8c86a;background:#fff9e7}.gcal-oauth-config>div{display:grid;gap:3px}.gcal-oauth-config b{font-size:11px;color:#5d4600}.gcal-oauth-config small{font-size:9px;color:#7b6a31;line-height:1.45}.gcal-oauth-config>small{grid-column:2/-1}.gcal-oauth-config input{min-height:36px;border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit}
      .gcal-controls{display:grid;grid-template-columns:auto auto minmax(160px,1fr) auto;gap:10px;align-items:center;padding:9px 10px}.gcal-view-tabs{display:flex;gap:4px;padding:3px;background:#eef2f6;border-radius:10px}.gcal-view-tabs button,.gcal-selection-actions button{border:0;background:transparent;cursor:pointer;font:inherit}.gcal-view-tabs button{min-height:32px;padding:6px 12px;border-radius:8px;color:#5f6f82;font-size:11px;font-weight:800}.gcal-view-tabs button.active{background:#172a43;color:#fff}.gcal-nav{display:flex;gap:5px}.gcal-period{text-align:center;color:#172a43;font-size:12px}.gcal-selection-actions{display:flex;justify-content:flex-end;gap:5px}.gcal-selection-actions button{padding:6px 8px;border-radius:7px;color:#294968;font-size:10px;font-weight:700}.gcal-selection-actions button:hover{background:#edf2f7}
      .gcal-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px}.gcal-filter{padding:11px;height:fit-content}.gcal-filter>b{display:block;font-size:12px;color:#172a43}.gcal-filter>small{display:block;margin-top:2px;color:var(--muted);font-size:9px}.gcal-filter>div{display:grid;gap:4px;margin-top:9px}.gcal-filter label{display:grid;grid-template-columns:16px 9px minmax(0,1fr);align-items:center;gap:7px;padding:7px;border:1px solid transparent;border-radius:8px;color:#536376;font-size:10.5px;cursor:pointer}.gcal-filter label.selected{background:#f6f8fb;border-color:#dfe6ed;color:#172a43;font-weight:700}.gcal-filter input{width:14px;height:14px;margin:0}.gcal-filter i{width:9px;height:9px;border-radius:50%}.gcal-filter p{margin:10px 0 0;padding-top:9px;border-top:1px solid var(--line);color:var(--muted);font-size:9px;line-height:1.5}
      .gcal-stage{padding:0;overflow:hidden;min-height:650px}.gcal-message{margin:10px}.gcal-loading{padding:8px 10px;background:#f6f8fb;border-bottom:1px solid var(--line);color:#5d6c7b;font-size:10px}.gcal-readonly-note{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;border-bottom:1px solid var(--line);background:#f8fafc}.gcal-readonly-note b{font-size:10.5px;color:#233f5d}.gcal-readonly-note span{font-size:9px;color:var(--muted)}.gcal-frame{display:block;width:100%;height:72vh;min-height:650px;border:0}.gcal-empty{display:grid;place-items:center;min-height:120px;color:var(--muted);font-size:11px}
      .gcal-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));background:#f5f7fa;border-bottom:1px solid var(--line)}.gcal-weekdays b{text-align:center;padding:7px;font-size:10px;color:#657789;border-right:1px solid var(--line)}.gcal-weekdays b:last-child{border-right:0}.gcal-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.gcal-day{min-height:115px;padding:6px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff}.gcal-day:nth-child(7n){border-right:0}.gcal-day.outside{background:#fafbfc}.gcal-day.today{box-shadow:inset 0 0 0 2px #8aa8c7}.gcal-day-head{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:5px}.gcal-day-head button{width:25px;height:25px;border:0;border-radius:50%;background:transparent;font:inherit;font-size:10px;font-weight:800;cursor:pointer}.gcal-day-head button:hover{background:#edf3f8}.gcal-day-head small{font-size:7.5px;color:#386995}.gcal-day-events{display:grid;gap:3px}.gcal-event{display:block;width:100%;min-width:0;border:1px solid #e1e7ee;border-left:4px solid #7b61ff;border-radius:6px;background:#fbfcfe;text-align:left;padding:5px;cursor:pointer}.gcal-event:hover{background:#f2f6fa}.gcal-event strong,.gcal-event small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gcal-event strong{font-size:9px;color:#253b52}.gcal-event small{margin-top:1px;font-size:7.5px;color:#7a8795}
      .gcal-week-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));min-height:650px}.gcal-week-day{padding:7px;border-right:1px solid var(--line)}.gcal-week-day:last-child{border-right:0}.gcal-week-day.today{background:#fbfdff}.gcal-week-head{display:grid;gap:5px;margin-bottom:8px}.gcal-week-head b{font-size:10px;color:#314b66}.gcal-week-head .button{font-size:9px}.gcal-week-events{display:grid;gap:5px}.gcal-week-events>.muted{font-size:9px}
      .gcal-agenda{display:grid}.gcal-agenda article{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:9px;align-items:start;padding:10px 11px;border-bottom:1px solid var(--line)}.gcal-agenda article>i{width:8px;height:8px;border-radius:50%;margin-top:4px}.gcal-agenda article b{display:block;font-size:11px;color:#243e59}.gcal-agenda article small{display:block;margin-top:2px;font-size:9px;color:var(--muted)}.gcal-agenda article p{margin:4px 0 0;font-size:9.5px;color:#526273;line-height:1.45}
      .gcal-modal-backdrop{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:18px;background:rgba(12,27,43,.48)}.gcal-modal{width:min(680px,100%);max-height:92vh;overflow:auto;border-radius:14px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:14px}.gcal-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.gcal-modal-head>div{display:grid;gap:3px}.gcal-modal-head b{font-size:14px;color:#172a43}.gcal-modal-head small{font-size:9px;color:var(--muted)}.gcal-form{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:12px}.gcal-form label{display:grid;gap:4px;color:#667688;font-size:10px;font-weight:800}.gcal-form input,.gcal-form select,.gcal-form textarea{min-height:36px;border:1px solid var(--line);border-radius:8px;padding:8px;background:#fff;font:inherit}.gcal-form textarea{min-height:78px;resize:vertical}.gcal-wide{grid-column:1/-1}.gcal-checkbox{display:flex!important;grid-column:1/-1;align-items:center;gap:7px}.gcal-checkbox input{width:16px;height:16px;min-height:0}.gcal-modal-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}.gcal-modal-actions>div{display:flex;gap:6px;margin-left:auto}.danger{color:#a53232!important;border-color:#efcccc!important;background:#fff8f8!important}
      @media(max-width:900px){.gcal-controls{grid-template-columns:1fr 1fr}.gcal-period{grid-row:1;grid-column:1/-1}.gcal-layout{grid-template-columns:1fr}.gcal-filter>div{display:flex;overflow-x:auto;gap:5px}.gcal-filter label{flex:0 0 auto;white-space:nowrap}.gcal-filter p{display:none}.gcal-month-grid,.gcal-weekdays,.gcal-week-grid{min-width:760px}.gcal-stage{overflow-x:auto}.gcal-oauth-config{grid-template-columns:1fr}.gcal-oauth-config>small{grid-column:auto}}
      @media(max-width:620px){.gcal-top{flex-direction:column}.gcal-connect-actions{justify-content:flex-start}.gcal-controls{grid-template-columns:1fr}.gcal-period{grid-column:auto;grid-row:auto;order:-1}.gcal-nav,.gcal-selection-actions{justify-content:space-between}.gcal-view-tabs button{flex:1}.gcal-weekdays,.gcal-month-grid,.gcal-week-grid{min-width:700px}.gcal-form{grid-template-columns:1fr}.gcal-wide{grid-column:auto}.gcal-modal{padding:12px}.gcal-modal-actions{align-items:stretch;flex-direction:column}.gcal-modal-actions>div{margin-left:0}.gcal-modal-actions button{flex:1}.gcal-readonly-note{align-items:flex-start;flex-direction:column}}
    `}</style>
  </section>
}
