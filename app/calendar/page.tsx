'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import CalendarEditor from '@/components/CalendarEditor'

type CalendarMode = 'MONTH' | 'WEEK' | 'AGENDA'

type WorkCalendar = {
  id: string
  label: string
  color: string
}

const WORK_CALENDARS: WorkCalendar[] = [
  { id: 'family17900518303332507254@group.calendar.google.com', label: '3 Kings – Construction Plan', color: '#b99aff' },
  { id: '9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com', label: '3 Kings – Site / Actual', color: '#ff7537' },
  { id: '6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com', label: 'กำหนดส่ง-ของเข้าหน้างาน', color: '#a47ae2' },
  { id: '9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com', label: '3K - Above Villa 6', color: '#c2c2c2' },
  { id: '7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com', label: '3K - Above Villa 7', color: '#ff7537' },
  { id: 'd31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com', label: '3K - Above Villa 8', color: '#cca6ac' },
  { id: '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com', label: '3K - Above Villa 9', color: '#b3dc6c' },
]

const STORAGE_SELECTION='3kings:work-calendar:selected'
const STORAGE_MODE='3kings:work-calendar:mode'

function validMode(value:string|null): value is CalendarMode {
  return value==='MONTH'||value==='WEEK'||value==='AGENDA'
}

export default function WorkCalendarPage(){
  const [selected,setSelected]=useState<string[]>(()=>WORK_CALENDARS.map(x=>x.id))
  const [mode,setMode]=useState<CalendarMode>('MONTH')
  const [loadedPrefs,setLoadedPrefs]=useState(false)

  useEffect(()=>{
    try{
      const saved=window.localStorage.getItem(STORAGE_SELECTION)
      if(saved){
        const parsed=JSON.parse(saved)
        if(Array.isArray(parsed)){
          const allowed=new Set(WORK_CALENDARS.map(x=>x.id))
          const valid=parsed.filter((x):x is string=>typeof x==='string'&&allowed.has(x))
          if(valid.length)setSelected(valid)
        }
      }
      const savedMode=window.localStorage.getItem(STORAGE_MODE)
      if(validMode(savedMode))setMode(savedMode)
    }catch{}
    setLoadedPrefs(true)
  },[])

  useEffect(()=>{
    if(!loadedPrefs)return
    try{window.localStorage.setItem(STORAGE_SELECTION,JSON.stringify(selected))}catch{}
  },[loadedPrefs,selected])

  useEffect(()=>{
    if(!loadedPrefs)return
    try{window.localStorage.setItem(STORAGE_MODE,mode)}catch{}
  },[loadedPrefs,mode])

  const selectedSet=useMemo(()=>new Set(selected),[selected])
  const embedUrl=useMemo(()=>{
    if(!selected.length)return ''
    const params=new URLSearchParams({
      hl:'th',
      wkst:'1',
      bgcolor:'#ffffff',
      ctz:'Asia/Bangkok',
      showTitle:'0',
      showNav:'1',
      showDate:'1',
      showPrint:'0',
      showTabs:'0',
      showCalendars:'0',
      showTz:'0',
      mode,
    })
    for(const calendar of WORK_CALENDARS){
      if(!selectedSet.has(calendar.id))continue
      params.append('src',calendar.id)
      params.append('color',calendar.color)
    }
    return `https://calendar.google.com/calendar/embed?${params.toString()}`
  },[mode,selected.length,selectedSet])

  const toggle=(id:string)=>{
    setSelected(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id])
  }

  return <AppShell>
    <PageHeader
      title="ปฏิทินงาน"
      subtitle="เพิ่ม / แก้ไข / ลบปฏิทินงานใน Web App และดูข้อมูล Google Calendar เดิมในหน้าเดียวกัน"
      action={<a className="button" href="https://calendar.google.com/calendar/u/0/r" target="_blank" rel="noreferrer">เปิด Google Calendar</a>}
    />

    <CalendarEditor/>

    <div className="work-calendar-google-head"><b>Google Calendar</b><small>ข้อมูล Google เดิม · อ่านอย่างเดียวจากหน้านี้</small></div>
    <section className="work-calendar-controls panel" aria-label="ตัวเลือกปฏิทินงาน">
      <div className="work-calendar-view-tabs" role="group" aria-label="รูปแบบการแสดงผล">
        <button type="button" className={mode==='MONTH'?'active':''} onClick={()=>setMode('MONTH')}>เดือน</button>
        <button type="button" className={mode==='WEEK'?'active':''} onClick={()=>setMode('WEEK')}>สัปดาห์</button>
        <button type="button" className={mode==='AGENDA'?'active':''} onClick={()=>setMode('AGENDA')}>กำหนดการ</button>
      </div>
      <div className="work-calendar-selection-actions">
        <span>{selected.length} / {WORK_CALENDARS.length} ปฏิทิน</span>
        <button type="button" onClick={()=>setSelected(WORK_CALENDARS.map(x=>x.id))}>เลือกทั้งหมด</button>
        <button type="button" onClick={()=>setSelected([])}>ล้าง</button>
      </div>
    </section>

    <div className="work-calendar-layout">
      <aside className="work-calendar-filter panel" aria-label="เลือกปฏิทิน">
        <div className="work-calendar-filter-title">
          <b>ปฏิทินที่แสดง</b>
          <small>เลือกหลายรายการพร้อมกันได้</small>
        </div>
        <div className="work-calendar-list">
          {WORK_CALENDARS.map(calendar=><label key={calendar.id} className={selectedSet.has(calendar.id)?'selected':''}>
            <input type="checkbox" checked={selectedSet.has(calendar.id)} onChange={()=>toggle(calendar.id)} />
            <span className="work-calendar-dot" style={{background:calendar.color}} aria-hidden="true" />
            <span>{calendar.label}</span>
          </label>)}
        </div>
        <p className="work-calendar-source">Source of truth: Google Calendar · Read-only</p>
      </aside>

      <section className="work-calendar-stage panel" aria-label="Google Calendar">
        {embedUrl
          ? <iframe
              key={embedUrl}
              className="work-calendar-frame"
              src={embedUrl}
              title="3 Kings Work Calendar"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          : <div className="work-calendar-empty"><b>ยังไม่ได้เลือกปฏิทิน</b><span>เลือกอย่างน้อย 1 รายการเพื่อแสดงตารางงาน</span></div>}
      </section>
    </div>

    <p className="work-calendar-note">
      ปฏิทิน Google ด้านบนอ่านข้อมูลจาก Google Calendar โดยตรง หากรายการไม่แสดง ให้ตรวจว่าบัญชี Google ที่เปิดอยู่ในเบราว์เซอร์มีสิทธิ์ดูปฏิทิน 3 Kings นั้น
    </p>
    <style jsx>{`
      .work-calendar-google-head{display:flex;align-items:baseline;gap:8px;margin:16px 2px 8px}.work-calendar-google-head b{font-size:13px;color:#172a43}.work-calendar-google-head small{font-size:10px;color:#7a8795}.work-calendar-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;margin-bottom:12px}
      .work-calendar-view-tabs{display:flex;gap:4px;padding:3px;background:#eef2f6;border-radius:10px}
      .work-calendar-view-tabs button,.work-calendar-selection-actions button{border:0;background:transparent;cursor:pointer;font:inherit}
      .work-calendar-view-tabs button{min-height:34px;padding:6px 13px;border-radius:8px;color:#5f6f82;font-size:12px;font-weight:800}
      .work-calendar-view-tabs button.active{background:#172a43;color:#fff;box-shadow:0 2px 7px rgba(23,42,67,.18)}
      .work-calendar-selection-actions{display:flex;align-items:center;gap:7px;font-size:11px;color:#6a7888}
      .work-calendar-selection-actions span{font-weight:700;margin-right:2px}
      .work-calendar-selection-actions button{padding:6px 8px;border-radius:7px;color:#294968;font-weight:700}
      .work-calendar-selection-actions button:hover{background:#edf2f7}
      .work-calendar-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px;align-items:stretch}
      .work-calendar-filter{padding:12px;height:fit-content}
      .work-calendar-filter-title{display:flex;flex-direction:column;gap:3px;margin-bottom:10px}
      .work-calendar-filter-title b{font-size:13px;color:#172a43}
      .work-calendar-filter-title small{font-size:10.5px;color:#7a8795}
      .work-calendar-list{display:flex;flex-direction:column;gap:5px}
      .work-calendar-list label{display:grid;grid-template-columns:18px 10px minmax(0,1fr);align-items:center;gap:8px;padding:8px;border:1px solid transparent;border-radius:9px;cursor:pointer;font-size:11.5px;line-height:1.35;color:#4d5d6f}
      .work-calendar-list label:hover{background:#f5f8fb}
      .work-calendar-list label.selected{background:#f7f9fc;border-color:#e0e7ee;color:#172a43;font-weight:700}
      .work-calendar-list input{width:15px;height:15px;margin:0}
      .work-calendar-dot{width:9px;height:9px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
      .work-calendar-source{margin:12px 0 0;padding-top:10px;border-top:1px solid #e5eaf0;color:#8190a0;font-size:10px}
      .work-calendar-stage{overflow:hidden;padding:0;min-height:720px}
      .work-calendar-frame{display:block;width:100%;height:78vh;min-height:720px;border:0;background:#fff}
      .work-calendar-empty{min-height:720px;display:grid;place-content:center;text-align:center;gap:6px;color:#7b8896}
      .work-calendar-empty b{color:#304a64;font-size:15px}
      .work-calendar-empty span{font-size:12px}
      .work-calendar-note{margin:9px 2px 0;color:#7b8896;font-size:10.5px;line-height:1.55}
      @media(max-width:900px){
        .work-calendar-layout{grid-template-columns:1fr}
        .work-calendar-filter{padding:9px}
        .work-calendar-list{display:flex;flex-direction:row;overflow-x:auto;padding-bottom:2px;gap:6px}
        .work-calendar-list label{flex:0 0 auto;grid-template-columns:16px 9px auto;padding:7px 9px;white-space:nowrap}
        .work-calendar-source{display:none}
        .work-calendar-stage{min-height:650px}
        .work-calendar-frame{height:72vh;min-height:650px}
      }
      @media(max-width:620px){
        .work-calendar-controls{align-items:stretch;flex-direction:column}
        .work-calendar-view-tabs{width:100%}
        .work-calendar-view-tabs button{flex:1}
        .work-calendar-selection-actions{justify-content:space-between}
        .work-calendar-stage{min-height:600px;border-radius:10px}
        .work-calendar-frame{height:70vh;min-height:600px}
        .work-calendar-note{font-size:10px}
      }
    `}</style>
  </AppShell>
}
