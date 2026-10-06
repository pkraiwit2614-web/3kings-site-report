'use client'

import {useEffect,useMemo,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {canEditCalendar} from '@/lib/accessControl'
import useAccessRole from '@/components/useAccessRole'
import {getActivitySessionId} from '@/lib/activityLog'

type CalendarRow={id:string;name:string;color:string;active:boolean;created_at:string}
type EventRow={id:string;calendar_id:string;event_date:string;title:string;detail:string|null;updated_at:string}

function todayBangkok(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}

export default function CalendarEditor(){
  const {role}=useAccessRole()
  const editable=canEditCalendar(role)
  const [calendars,setCalendars]=useState<CalendarRow[]>([])
  const [events,setEvents]=useState<EventRow[]>([])
  const [name,setName]=useState('')
  const [color,setColor]=useState('#7b61ff')
  const [calendarId,setCalendarId]=useState('')
  const [eventId,setEventId]=useState<string|null>(null)
  const [eventDate,setEventDate]=useState(todayBangkok())
  const [title,setTitle]=useState('')
  const [detail,setDetail]=useState('')
  const [message,setMessage]=useState('')
  const [saving,setSaving]=useState(false)
  const [calendarEditId,setCalendarEditId]=useState<string|null>(null)
  const [calendarEditName,setCalendarEditName]=useState('')
  const [calendarEditColor,setCalendarEditColor]=useState('#7b61ff')

  const load=async()=>{
    const s=getSupabase()
    const [c,e]=await Promise.all([
      s.from('work_calendars').select('id,name,color,active,created_at').eq('active',true).order('created_at'),
      s.from('work_calendar_events').select('id,calendar_id,event_date,title,detail,updated_at').order('event_date').limit(1000),
    ])
    setCalendars((c.data||[]) as CalendarRow[])
    setEvents((e.data||[]) as EventRow[])
    if(!calendarId&&c.data?.[0]?.id)setCalendarId(String(c.data[0].id))
  }

  useEffect(()=>{void load()},[])

  const grouped=useMemo(()=>{
    const map=new Map<string,EventRow[]>()
    for(const row of events){const list=map.get(row.event_date)||[];list.push(row);map.set(row.event_date,list)}
    return [...map.entries()].sort(([a],[b])=>a.localeCompare(b))
  },[events])

  const createCalendar=async()=>{
    if(!editable||!name.trim())return
    setSaving(true);setMessage('')
    const {data,error}=await getSupabase().rpc('work_calendar_create',{
      p_name:name.trim(),p_color:color,p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent
    })
    setSaving(false)
    if(error){setMessage(error.message.includes('LIMIT_3')?'สร้างปฏิทินได้ไม่เกิน 3 รายการต่อวัน':error.message);return}
    setName('');setCalendarId(String(data||''));setMessage('สร้างปฏิทินเรียบร้อย — แสดงในรายการปฏิทินด้านล่างแล้ว');await load()
  }

  const saveEvent=async()=>{
    if(!editable||!calendarId||!eventDate||!title.trim())return
    setSaving(true);setMessage('')
    const {error}=await getSupabase().rpc('work_calendar_save_event',{
      p_event_id:eventId,p_calendar_id:calendarId,p_event_date:eventDate,p_title:title.trim(),p_detail:detail.trim()||null,
      p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent
    })
    setSaving(false)
    if(error){setMessage(error.message);return}
    setEventId(null);setTitle('');setDetail('');setMessage(eventId?'แก้ไขรายการเรียบร้อย':'เพิ่มรายการในปฏิทินเรียบร้อย');await load()
  }

  const beginCalendarEdit=(row:CalendarRow)=>{setCalendarEditId(row.id);setCalendarEditName(row.name);setCalendarEditColor(row.color);setMessage('')}
  const cancelCalendarEdit=()=>{setCalendarEditId(null);setCalendarEditName('');setCalendarEditColor('#7b61ff')}

  const saveCalendarEdit=async()=>{
    if(!editable||!calendarEditId||!calendarEditName.trim())return
    setSaving(true);setMessage('')
    const {error}=await getSupabase().rpc('work_calendar_update',{
      p_calendar_id:calendarEditId,p_name:calendarEditName.trim(),p_color:calendarEditColor,
      p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent
    })
    setSaving(false)
    if(error){setMessage(error.message);return}
    cancelCalendarEdit();setMessage('แก้ไขปฏิทินเรียบร้อย');await load()
  }

  const deleteCalendar=async(row:CalendarRow)=>{
    if(!editable||!window.confirm('ลบปฏิทิน "'+row.name+'" และรายการทั้งหมดในปฏิทินนี้ใช่หรือไม่?'))return
    setSaving(true);setMessage('')
    const {error}=await getSupabase().rpc('work_calendar_delete',{
      p_calendar_id:row.id,p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent
    })
    setSaving(false)
    if(error){setMessage(error.message);return}
    if(calendarId===row.id)setCalendarId('')
    if(calendarEditId===row.id)cancelCalendarEdit()
    setMessage('ลบปฏิทินเรียบร้อย');await load()
  }

  const deleteEvent=async(row:EventRow)=>{
    if(!editable||!window.confirm('ลบรายการ "'+row.title+'" วันที่ '+row.event_date+' ใช่หรือไม่?'))return
    setSaving(true);setMessage('')
    const {error}=await getSupabase().rpc('work_calendar_delete_event',{
      p_event_id:row.id,p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent
    })
    setSaving(false)
    if(error){setMessage(error.message);return}
    if(eventId===row.id)cancelEdit()
    setMessage('ลบรายการเรียบร้อย');await load()
  }

  const edit=(row:EventRow)=>{setEventId(row.id);setCalendarId(row.calendar_id);setEventDate(row.event_date);setTitle(row.title);setDetail(row.detail||'');setMessage('')}
  const cancelEdit=()=>{setEventId(null);setTitle('');setDetail('');setMessage('')}

  return <section className="panel calendar-editor">
    <div className="calendar-editor-head"><div><b>Web App Calendar</b><small>สร้างและแก้รายการจาก Web App • Google Calendar ด้านบนยังอ่านจาก Google โดยตรง</small></div><span>{editable?'แก้ไขได้':'Read-only'}</span></div>
    {editable&&<div className="calendar-create-grid">
      <label>ชื่อปฏิทิน<input value={name} onChange={e=>setName(e.target.value)} placeholder="ชื่อปฏิทินใหม่"/></label>
      <label>สี<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
      <button type="button" className="button" disabled={saving||!name.trim()} onClick={createCalendar}>+ สร้างปฏิทิน</button>
      <small>จำกัด 3 ปฏิทินใหม่ / วัน / ผู้ใช้</small>
    </div>}
    {calendars.length>0&&<div className="calendar-manage-list">
      <div className="calendar-manage-title"><b>ปฏิทินที่สร้างใน Web App</b><small>ปฏิทินใหม่จะแสดงตรงนี้ทันที และใช้เลือกตอนเพิ่มรายการ</small></div>
      {calendars.map(row=><div className="calendar-manage-row" key={row.id}>
        {calendarEditId===row.id?<>
          <input value={calendarEditName} onChange={e=>setCalendarEditName(e.target.value)} />
          <input className="calendar-color" type="color" value={calendarEditColor} onChange={e=>setCalendarEditColor(e.target.value)} />
          <button type="button" className="button primary" disabled={saving||!calendarEditName.trim()} onClick={saveCalendarEdit}>บันทึก</button>
          <button type="button" className="button" disabled={saving} onClick={cancelCalendarEdit}>ยกเลิก</button>
        </>:<>
          <div className="calendar-manage-name"><i style={{background:row.color}}/><strong>{row.name}</strong></div>
          {editable&&<div className="row" style={{gap:6}}>
            <button type="button" className="button" disabled={saving} onClick={()=>beginCalendarEdit(row)}>แก้ไขชื่อ/สี</button>
            <button type="button" className="button danger" disabled={saving} onClick={()=>deleteCalendar(row)}>ลบปฏิทิน</button>
          </div>}
        </>}
      </div>)}
    </div>}
    {editable&&calendars.length>0&&<div className="calendar-event-grid">
      <label>ปฏิทิน<select value={calendarId} onChange={e=>setCalendarId(e.target.value)}>{calendars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>วันที่<input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)}/></label>
      <label>รายการ<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="ชื่องาน / นัดหมาย"/></label>
      <label className="detail">รายละเอียด<textarea value={detail} onChange={e=>setDetail(e.target.value)} placeholder="รายละเอียดเพิ่มเติม"/></label>
      <div className="row" style={{gap:6}}><button type="button" className="button primary" disabled={saving||!title.trim()} onClick={saveEvent}>{eventId?'บันทึกการแก้ไข':'บันทึกรายการ'}</button>{eventId&&<button type="button" className="button" onClick={cancelEdit}>ยกเลิก</button>}</div>
    </div>}
    {message&&<div className="notice" style={{marginTop:10}}>{message}</div>}
    <div className="calendar-agenda">
      {grouped.map(([date,list])=><div key={date}><b>{date}</b>{list.map(row=>{
        const cal=calendars.find(c=>c.id===row.calendar_id)
        return <article key={row.id}><i style={{background:cal?.color||'#7b61ff'}}/><div><strong>{row.title}</strong><small>{(cal?.name||'Calendar')+(row.detail?' • '+row.detail:'')}</small></div>{editable&&<div className="row calendar-event-actions" style={{gap:6}}><button type="button" className="button" onClick={()=>edit(row)}>แก้ไข</button><button type="button" className="button danger" onClick={()=>deleteEvent(row)}>ลบ</button></div>}</article>
      })}</div>)}
      {!grouped.length&&<p className="muted small">ยังไม่มีรายการ Web App Calendar</p>}
    </div>
    <style jsx>{`
      .calendar-editor{margin-top:12px;padding:12px}.calendar-editor-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.calendar-editor-head>div{display:grid;gap:3px}.calendar-editor-head small{color:var(--muted);font-size:10px}.calendar-editor-head>span{font-size:9px;font-weight:800;color:var(--muted)}
      .calendar-create-grid,.calendar-event-grid{display:grid;gap:8px;align-items:end;margin-top:12px}.calendar-create-grid{grid-template-columns:minmax(200px,1fr) 90px auto auto}.calendar-event-grid{grid-template-columns:minmax(180px,1fr) 150px minmax(220px,1fr) auto}.calendar-event-grid .detail{grid-column:1/-2}.calendar-manage-list{display:grid;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}.calendar-manage-title{display:flex;align-items:baseline;gap:8px}.calendar-manage-title b{font-size:11px;color:var(--navy)}.calendar-manage-title small{font-size:9px;color:var(--muted)}.calendar-manage-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px;border:1px solid var(--line);border-radius:9px}.calendar-manage-row>input:first-child{flex:1}.calendar-color{width:54px;height:34px;padding:3px!important}.calendar-manage-name{display:flex;align-items:center;gap:7px;min-width:0}.calendar-manage-name i{display:block;width:9px;height:9px;border-radius:50%}.calendar-manage-name strong{font-size:11px;color:var(--navy)}.danger{color:#a53232!important;border-color:#efcccc!important;background:#fff8f8!important}.calendar-editor label{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted)}.calendar-editor input,.calendar-editor select,.calendar-editor textarea{border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;background:#fff}.calendar-editor textarea{min-height:68px;resize:vertical}.calendar-agenda{display:grid;gap:10px;margin-top:14px}.calendar-agenda>div{display:grid;gap:6px}.calendar-agenda>div>b{font-size:11px;color:var(--navy)}.calendar-agenda article{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:start;padding:8px;border:1px solid var(--line);border-radius:9px}.calendar-agenda i{width:8px;height:8px;border-radius:50%;margin-top:4px}.calendar-agenda strong{display:block;font-size:11px}.calendar-agenda small{display:block;margin-top:2px;color:var(--muted);font-size:9.5px}
      @media(max-width:760px){.calendar-create-grid,.calendar-event-grid{grid-template-columns:1fr}.calendar-event-grid .detail{grid-column:auto}}
    `}</style>
  </section>
}