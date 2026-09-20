'use client'

import Link from 'next/link'
import {useEffect,useMemo,useState} from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import {getSupabase} from '@/lib/supabase'
import {pct} from '@/lib/format'
import type{Project,ScheduleTask} from '@/lib/types'

export default function WeeklyPage(){
  const[projects,setProjects]=useState<Project[]>([])
  const[tasks,setTasks]=useState<ScheduleTask[]>([])
  const[reports,setReports]=useState<any[]>([])

  useEffect(()=>{
    const s=getSupabase()
    const since=new Date(Date.now()-7*86400000).toISOString().slice(0,10)
    Promise.all([
      s.from('projects').select('*').eq('active',true).order('sort_order'),
      s.from('v_schedule_tasks').select('*'),
      s.from('daily_reports').select('*').gte('report_date',since).order('report_date')
    ]).then(([p,t,r])=>{
      setProjects((p.data||[])as Project[])
      setTasks((t.data||[])as ScheduleTask[])
      setReports(r.data||[])
    })
  },[])

  const data=useMemo(()=>projects.map(p=>{
    const list=tasks.filter(t=>t.project_id===p.id&&t.source_task_no!=='1')
    const rs=reports.filter(r=>r.project_id===p.id)
    const a=list.length?list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length:0
    const pl=list.length?list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length:0
    return{
      p,a,pl,
      delay:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length,
      block:list.filter(t=>!!t.blocker).length,
      man:rs.reduce((s,r)=>s+(r.total_manpower||0),0),
      reports:rs
    }
  }),[projects,tasks,reports])

  return <AppShell>
    <PageHeader title="Weekly Management Report" subtitle="สรุป 7 วันล่าสุด • คลิกแต่ละ Plot เพื่อดูรายละเอียดงาน • กด Print เพื่อ Save PDF" action={<button className="button primary" onClick={()=>window.print()}>Print / Save PDF</button>}/>
    <div className="weekly-cover panel"><h2>3 Kings Construction — Site Progress Weekly</h2><p>Generated from live Daily Reports + Schedule database</p></div>
    {data.map(x=><section className="panel weekly-section" key={x.p.id}>
      <div className="row between">
        <div><h2>{x.p.code} — {x.p.name}</h2><p>Plan {pct(x.pl)} • Actual {pct(x.a)}</p></div>
        <div className="row">
          <div className="weekly-kpis"><b>{x.delay}<small>Delayed</small></b><b>{x.block}<small>Blockers</small></b><b>{x.man}<small>Man-days*</small></b></div>
          <Link className="button" href={`/projects/${x.p.id}#weekly`}>ดูรายละเอียด Plot →</Link>
        </div>
      </div>
      <div className="bar"><i style={{width:pct(x.a)}}/></div>
      <h3>Reports this week</h3>
      {x.reports.length?x.reports.map((r:any)=><div className="subitem" key={r.id}><span>{r.report_date} — {r.summary||'Daily Report'}</span><b>{r.total_manpower||0} คน</b></div>):<p className="muted">ยังไม่มี Daily Report ใน 7 วันล่าสุด</p>}
    </section>)}
    <p className="muted small">* เป็นผลรวม manpower ที่รายงานรายวัน ไม่ใช่จำนวนคน unique</p>
  </AppShell>
}
