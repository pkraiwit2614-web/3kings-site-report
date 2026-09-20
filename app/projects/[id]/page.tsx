'use client'

import Link from 'next/link'
import {useEffect,useMemo,useState} from 'react'
import {useParams} from 'next/navigation'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import {getSupabase} from '@/lib/supabase'
import {pct,dateTH} from '@/lib/format'
import type{Project,ScheduleTask} from '@/lib/types'

export default function ProjectPage(){
  const{id}=useParams<{id:string}>()
  const[p,setP]=useState<Project|null>(null)
  const[tasks,setTasks]=useState<ScheduleTask[]>([])
  const[reports,setReports]=useState<any[]>([])

  useEffect(()=>{
    const s=getSupabase()
    const since=new Date(Date.now()-7*86400000).toISOString().slice(0,10)
    Promise.all([
      s.from('projects').select('*').eq('id',id).single(),
      s.from('v_schedule_tasks').select('*').eq('project_id',id).order('planned_start'),
      s.from('daily_reports').select('id,report_date,total_manpower,summary,status,report_items(id,schedule_task_id,work_item,actual_progress,manpower,status,blocker,next_action,target_date,remarks)').eq('project_id',id).gte('report_date',since).order('report_date',{ascending:false})
    ]).then(([pr,t,r])=>{
      setP(pr.data as Project)
      setTasks((t.data||[])as ScheduleTask[])
      setReports(r.data||[])
    })
  },[id])

  const workTasks=useMemo(()=>tasks.filter(t=>t.source_task_no!=='1'),[tasks])
  const critical=useMemo(()=>workTasks.filter(t=>((t.delay_days||0)>0||t.blocker)&&(t.actual_progress||0)<1),[workTasks])
  const avgActual=workTasks.length?workTasks.reduce((s,t)=>s+(t.actual_progress||0),0)/workTasks.length:0
  const avgPlan=workTasks.length?workTasks.reduce((s,t)=>s+(t.current_plan_progress||0),0)/workTasks.length:0
  const weeklyMan=reports.reduce((s,r)=>s+(r.total_manpower||0),0)
  const weeklyItems=reports.flatMap((r:any)=>(r.report_items||[]).map((x:any)=>({...x,report_date:r.report_date,report_summary:r.summary})))

  return <AppShell>
    <PageHeader
      title={p?`${p.code} — ${p.name}`:'Project Detail'}
      subtitle={`Target handover: ${dateTH(p?.target_handover)} • Plan ${pct(avgPlan)} • Actual ${pct(avgActual)}`}
      action={<div className="row"><Link className="button" href="/weekly">← Weekly Report</Link><button className="button primary" onClick={()=>window.print()}>Print Plot PDF</button></div>}
    />

    <section className="kpi-grid">
      <div className="kpi"><span>Tasks</span><b>{workTasks.length}</b><small>ไม่รวม Plot Summary</small></div>
      <div className="kpi"><span>Delayed</span><b>{workTasks.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length}</b></div>
      <div className="kpi"><span>Blockers</span><b>{workTasks.filter(t=>!!t.blocker).length}</b></div>
      <div className="kpi"><span>Completed</span><b>{workTasks.filter(t=>(t.actual_progress||0)>=1).length}</b></div>
    </section>

    <section className="panel weekly-section" id="weekly">
      <div className="panel-head"><div><h2>Weekly Activity — 7 วันล่าสุด</h2><span className="muted">ดึงจาก Daily Report ของ Plot นี้โดยตรง</span></div><div className="weekly-kpis"><b>{reports.length}<small>Reports</small></b><b>{weeklyItems.length}<small>Work items</small></b><b>{weeklyMan}<small>Man-days*</small></b></div></div>
      {reports.length?reports.map((r:any)=><div key={r.id} className="work-card">
        <div className="row between"><div><b>{dateTH(r.report_date)}</b><p>{r.summary||'Daily Report'}</p></div><div className="right"><StatusBadge value={r.status}/><small>{r.total_manpower||0} คน</small></div></div>
        {(r.report_items||[]).length?<div className="stack">{r.report_items.map((x:any)=><div className="list-row" key={x.id}>
          <div><b>{x.work_item}</b><small>Actual {pct(x.actual_progress)} • Manpower {x.manpower||0} • Target {dateTH(x.target_date)}</small><p>{x.blocker?`Blocker: ${x.blocker}`:x.next_action?`Next: ${x.next_action}`:x.remarks||'-'}</p></div>
          <StatusBadge value={x.status}/>
        </div>)}</div>:<p className="muted">ไม่มี Work Item ในรายงานนี้</p>}
      </div>):<p className="muted">ยังไม่มี Daily Report ใน 7 วันล่าสุด</p>}
      <p className="muted small">* เป็นผลรวม manpower ที่รายงานรายวัน ไม่ใช่จำนวนคน unique</p>
    </section>

    <section className="panel weekly-section"><div className="panel-head"><h2>Critical Tasks</h2><span className="muted">งานล่าช้า / มี Blocker และยังไม่เสร็จ 100%</span></div><div className="stack">{critical.length?critical.slice(0,30).map(t=><div className="list-row" key={t.id}><div><b>{t.task_name}</b><small>{t.area||'-'} • Plan End {dateTH(t.planned_end)} • Actual {pct(t.actual_progress)}</small><p>{t.blocker||t.next_action||'-'}</p></div><div className="right"><StatusBadge value={t.site_status}/><small>{t.delay_days||0} วัน</small></div></div>):<p className="muted">ไม่มี Critical Task</p>}</div></section>

    <section className="panel weekly-section"><div className="panel-head"><h2>All Schedule Tasks</h2><span className="muted">รายละเอียดงานทั้งหมดของ Plot นี้</span></div><div className="table-wrap"><table><thead><tr><th>งาน</th><th>พื้นที่</th><th>Planned</th><th>Plan</th><th>Actual</th><th>Delay</th><th>Status</th><th>Blocker / Next Action</th></tr></thead><tbody>{workTasks.map(t=><tr key={t.id}><td><b>{t.task_name}</b><small>{t.category||'-'}</small></td><td>{t.area||'-'}</td><td>{dateTH(t.planned_start)} → {dateTH(t.planned_end)}</td><td>{pct(t.current_plan_progress)}</td><td>{pct(t.actual_progress)}</td><td className={(t.delay_days||0)>0?'danger-text':''}>{t.delay_days||0} วัน</td><td><StatusBadge value={t.site_status}/></td><td>{t.blocker||t.next_action||'-'}</td></tr>)}</tbody></table></div></section>
  </AppShell>
}
