'use client'

import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {getSupabase} from '@/lib/supabase'

function fmt(value:string|null){
  if(!value)return '—'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '—'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}
function dateFmt(value:string|null){
  if(!value)return '—'
  const d=new Date(`${value}T00:00:00+07:00`)
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric'}).format(d)
}

export default function WeeklyTruthfulFreshness(){
  const [host,setHost]=useState<HTMLElement|null>(null)
  const [scheduleAt,setScheduleAt]=useState<string|null>(null)
  const [reportDate,setReportDate]=useState<string|null>(null)
  const [reportAt,setReportAt]=useState<string|null>(null)

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      const s=getSupabase()
      const [sync,report]=await Promise.all([
        s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','schedule').order('created_at',{ascending:false}).limit(1).maybeSingle(),
        s.from('daily_reports').select('report_date,created_at').order('report_date',{ascending:false}).limit(1).maybeSingle()
      ])
      if(cancelled)return
      setScheduleAt(sync.data?.created_at||null)
      setReportDate(report.data?.report_date||null)
      setReportAt(report.data?.created_at||null)
    }
    void load()
    const findHost=()=>setHost(document.querySelector<HTMLElement>('.page-header'))
    findHost()
    const observer=new MutationObserver(findHost)
    observer.observe(document.body,{subtree:true,childList:true})
    return()=>{cancelled=true;observer.disconnect()}
  },[])

  if(!host)return null
  return createPortal(<>
    <div className="weekly-truthful-freshness">
      <span>Schedule <b>{fmt(scheduleAt)}</b></span>
      <span>Daily Report <b>{reportDate?`${dateFmt(reportDate)} • ${fmt(reportAt)}`:'ยังไม่มีข้อมูล'}</b></span>
    </div>
    <style jsx global>{`
      body.ui-weekly-page .ui-polish-header-extra{display:none!important}
      .weekly-truthful-freshness{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:flex-start}
      .weekly-truthful-freshness>span{display:grid;gap:1px;padding:6px 9px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);font-size:8.5px;color:var(--muted);font-weight:800;line-height:1.25}
      .weekly-truthful-freshness b{font-size:10px;color:var(--navy);white-space:nowrap}
      @media(max-width:900px){.weekly-truthful-freshness{width:100%;margin-left:0;justify-content:flex-start}}
    `}</style>
  </>,host)
}
