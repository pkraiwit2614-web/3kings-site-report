'use client'

import { useEffect,useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import {getSupabase} from '@/lib/supabase'
import {dateTH,pct} from '@/lib/format'
import type {Project} from '@/lib/types'

export default function ReportsPage(){
  const[rows,setRows]=useState<any[]>([])
  const[projects,setProjects]=useState<Project[]>([])

  useEffect(()=>{
    const s=getSupabase()
    Promise.all([
      s.from('daily_reports').select('*,report_items(*)').order('report_date',{ascending:false}).limit(100),
      s.from('projects').select('*')
    ]).then(([r,p])=>{
      setRows(r.data||[])
      setProjects((p.data||[]) as Project[])
    })
  },[])

  return <AppShell>
    <PageHeader title="Report History" subtitle="Daily Reports ล่าสุดจากทุก Site"/>
    <div className="stack">{rows.map(r=><div className="panel report-card" key={r.id}><div className="row between"><div><h2>{projects.find(p=>p.id===r.project_id)?.code||'-'} • {dateTH(r.report_date)}</h2><p>{r.summary||'ไม่มีสรุปเพิ่มเติม'}</p></div><div className="right"><StatusBadge value={r.status}/><b>{pct(r.overall_progress)}</b></div></div><div className="mini-grid"><span>Manpower <b>{r.total_manpower||0}</b></span><span>Work items <b>{r.report_items?.length||0}</b></span><span>Weather <b>{r.weather||'-'}</b></span></div>{(r.report_items||[]).slice(0,4).map((x:any)=><div className="subitem" key={x.id}><span>{x.work_item}</span><b>{Math.round((x.actual_progress||0)*100)}%</b></div>)}</div>)}</div>
  </AppShell>
}
