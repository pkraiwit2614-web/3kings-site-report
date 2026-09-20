'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { pct, dateTH } from '@/lib/format'
import type { Project, ScheduleTask } from '@/lib/types'

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<ScheduleTask[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [proc, setProc] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const s = getSupabase()
      const [p,t,r,pr] = await Promise.all([
        s.from('projects').select('*').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('id,project_id,task_name,category,actual_progress,current_plan_progress,current_variance,delay_days,site_status,blocker,next_action,target_close,planned_start,planned_end,area,source_task_no,contractor'),
        s.from('daily_reports').select('id,project_id,report_date,total_manpower,summary,status,created_at').order('report_date',{ascending:false}).limit(8),
        s.from('procurement_items').select('id,project_id,vendor,item_name,current_status,expected_delivery_text').order('created_at',{ascending:false})
      ])
      if (p.error) throw p.error
      if (t.error) throw t.error
      setProjects((p.data||[]) as Project[])
      setTasks((t.data||[]) as ScheduleTask[])
      setReports(r.data||[])
      setProc(pr.data||[])
      setLoading(false)
    }
    load().catch(()=>setLoading(false))
  }, [])

  const projectStats = useMemo(() => projects.map(p => {
    const list = tasks.filter(t=>t.project_id===p.id && t.source_task_no!=='1')
    const avgActual = list.length ? list.reduce((a,b)=>a+(b.actual_progress||0),0)/list.length : 0
    const avgPlan = list.length ? list.reduce((a,b)=>a+(b.current_plan_progress||0),0)/list.length : 0
    const delayed = list.filter(t=>(t.delay_days||0)>0 && (t.actual_progress||0)<1).length
    const blockers = list.filter(t=>Boolean(t.blocker?.trim())).length
    return { p, avgActual, avgPlan, delayed, blockers, taskCount:list.length }
  }), [projects,tasks])

  const delayedTotal = tasks.filter(t=>(t.delay_days||0)>0 && (t.actual_progress||0)<1).length
  const blockersTotal = tasks.filter(t=>Boolean(t.blocker?.trim())).length
  const reportToday = reports.filter(r=>r.report_date===new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})).length

  return <AppShell><PageHeader title="Management Dashboard" subtitle="ภาพรวมหน้างานจาก Schedule + Daily Report + Purchasing จริง" action={<Link href="/reports/new" className="button primary">+ Daily Report</Link>} />
    {loading ? <div className="panel">กำลังโหลดข้อมูล…</div> : <>
      <section className="kpi-grid">
        <div className="kpi"><span>Active Sites</span><b>{projects.length}</b><small>โครงการ/Plot ที่เปิดใช้งาน</small></div>
        <div className="kpi"><span>Reports Today</span><b>{reportToday}</b><small>รายงานประจำวันนี้</small></div>
        <div className="kpi"><span>Delayed Tasks</span><b>{delayedTotal}</b><small>งานเลย Planned End และยังไม่ครบ 100%</small></div>
        <div className="kpi"><span>Open Blockers</span><b>{blockersTotal}</b><small>รายการที่ระบุปัญหา/อุปสรรค</small></div>
      </section>
      <section className="panel"><div className="panel-head"><h2>Site / Plot Status</h2><span className="muted">Progress เป็น Task Average เพื่อไม่อ้างเป็น Earned Value</span></div>
        <div className="project-grid">{projectStats.map(x=><Link href={`/projects/${x.p.id}`} key={x.p.id} className="project-card">
          <div className="row between"><div><b>{x.p.code}</b><h3>{x.p.name}</h3></div><span className="pill">{x.taskCount} tasks</span></div>
          <div className="progress-row"><span>Plan {pct(x.avgPlan)}</span><span>Actual {pct(x.avgActual)}</span></div>
          <div className="bar"><i style={{width:pct(x.avgActual)}} /></div>
          <div className="mini-grid"><span><b>{x.delayed}</b> Delayed</span><span><b>{x.blockers}</b> Blockers</span><span><b>{dateTH(x.p.target_handover)}</b> Handover</span></div>
        </Link>)}</div>
      </section>
      <div className="two-col">
        <section className="panel"><div className="panel-head"><h2>Critical Follow-up</h2><Link href="/schedule">ดูทั้งหมด</Link></div>
          <div className="stack">{tasks.filter(t=>((t.delay_days||0)>0 || t.blocker) && (t.actual_progress||0)<1).sort((a,b)=>(b.delay_days||0)-(a.delay_days||0)).slice(0,8).map(t=><div className="list-row" key={t.id}><div><b>{t.task_name}</b><small>{projects.find(p=>p.id===t.project_id)?.code} • {t.area||'-'}</small></div><div className="right"><StatusBadge value={t.site_status}/><small>{t.delay_days||0} วัน</small></div></div>)}</div>
        </section>
        <section className="panel"><div className="panel-head"><h2>Purchasing Follow-up</h2><Link href="/procurement">ดูทั้งหมด</Link></div>
          <div className="stack">{proc.slice(0,8).map(x=><div className="list-row" key={x.id}><div><b>{x.item_name}</b><small>{x.vendor||'-'} • {x.expected_delivery_text||'ยังไม่ระบุ ETA'}</small></div><StatusBadge value={x.current_status}/></div>)}</div>
        </section>
      </div>
    </>}
  </AppShell>
}
