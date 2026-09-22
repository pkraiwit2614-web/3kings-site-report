'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { pct, dateTH } from '@/lib/format'
import type { Project, ScheduleTask } from '@/lib/types'

type StatusFilter = 'all' | 'delayed' | 'blockers' | 'in_progress' | 'completed'

export default function SchedulePage(){
  const router=useRouter()
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<ScheduleTask[]>([])
  const [project,setProject]=useState('')
  const [q,setQ]=useState('')
  const [status,setStatus]=useState<StatusFilter>('all')
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const urlStatus=params.get('status') as StatusFilter|null
    setProject(params.get('project')||'')
    setQ(params.get('q')||'')
    if(urlStatus&&['all','delayed','blockers','in_progress','completed'].includes(urlStatus)) setStatus(urlStatus)

    const s=getSupabase()
    Promise.all([
      s.from('projects').select('*').eq('active',true).order('sort_order'),
      s.from('v_schedule_tasks').select('*').order('planned_start')
    ]).then(([p,t])=>{
      setProjects((p.data||[]) as Project[])
      setTasks((t.data||[]) as ScheduleTask[])
      setLoading(false)
    }).catch(()=>setLoading(false))
  },[])

  const workTasks=useMemo(()=>tasks.filter(t=>t.source_task_no!=='1'),[tasks])
  const rows=useMemo(()=>workTasks.filter(t=>{
    if(project&&t.project_id!==project) return false
    if(q&&!`${t.task_name} ${t.category||''} ${t.area||''} ${t.blocker||''} ${t.next_action||''}`.toLowerCase().includes(q.toLowerCase())) return false
    if(status==='delayed'&&!((t.delay_days||0)>0&&(t.actual_progress||0)<1)) return false
    if(status==='blockers'&&!(Boolean(t.blocker?.trim())&&(t.actual_progress||0)<1)) return false
    if(status==='in_progress'&&!((t.actual_progress||0)>0&&(t.actual_progress||0)<1)) return false
    if(status==='completed'&&!((t.actual_progress||0)>=1)) return false
    return true
  }),[workTasks,project,q,status])

  const avgPlan=rows.length?rows.reduce((s,t)=>s+(t.current_plan_progress||0),0)/rows.length:0
  const avgActual=rows.length?rows.reduce((s,t)=>s+(t.actual_progress||0),0)/rows.length:0
  const variance=avgActual-avgPlan
  const delayed=rows.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length
  const blockers=rows.filter(t=>Boolean(t.blocker?.trim())&&(t.actual_progress||0)<1).length

  const projectStats=useMemo(()=>projects.map(p=>{
    const list=rows.filter(t=>t.project_id===p.id)
    if(!list.length) return null
    const plan=list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length
    const actual=list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length
    return {p,plan,actual,delta:actual-plan,delayed:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length,blockers:list.filter(t=>Boolean(t.blocker?.trim())&&(t.actual_progress||0)<1).length}
  }).filter(Boolean) as {p:Project;plan:number;actual:number;delta:number;delayed:number;blockers:number}[],[projects,rows])

  const handlePlotClick=(projectId:string)=>{
    if(project===projectId){
      router.push(`/projects/${projectId}`)
      return
    }
    setProject(projectId)
    window.setTimeout(()=>document.querySelector('.schedule-sticky-tools')?.scrollIntoView({behavior:'smooth',block:'start'}),60)
  }

  return <AppShell>
    <PageHeader title="Schedule / Plan vs Actual" subtitle="เห็นภาพรวมแผนเทียบหน้างานจริงก่อน แล้วค่อยลงรายละเอียดเฉพาะงานที่ต้องติดตาม"/>

    <section className="schedule-summary-grid">
      <div className="schedule-summary-card"><span>Plan</span><b>{pct(avgPlan)}</b><small>ค่าเฉลี่ยตามแผนของรายการที่กำลังดู</small></div>
      <div className="schedule-summary-card actual"><span>Actual</span><b>{pct(avgActual)}</b><small>ความคืบหน้าหน้างานจริงล่าสุด</small></div>
      <div className={`schedule-summary-card ${variance<0?'bad':'good'}`}><span>Variance</span><b>{variance>0?'+':''}{Math.round(variance*100)}%</b><small>Actual เทียบ Plan</small></div>
      <button className="schedule-summary-card warn" onClick={()=>setStatus('delayed')}><span>Delayed</span><b>{delayed}</b><small>คลิกเพื่อกรองงานล่าช้า</small></button>
      <button className="schedule-summary-card danger" onClick={()=>setStatus('blockers')}><span>Blockers</span><b>{blockers}</b><small>คลิกเพื่อกรองงานติดอุปสรรค</small></button>
    </section>

    <section className="panel schedule-overview-panel">
      <div className="panel-head schedule-panel-head">
        <div><h2>Plan vs Actual by Site / Plot</h2><span className="muted small">คลิก Plot = ดูรายละเอียดด้านล่าง • คลิก Plot เดิมอีกครั้ง = เปิดหน้ารายละเอียด Plot • แถบสีน้ำเงิน = Actual • เส้นทอง = Plan</span></div>
        <span className="pill">{projectStats.length} Site / Plot</span>
      </div>
      <div className="schedule-portfolio-list">
        {projectStats.map(x=>{
          const plan=Math.max(0,Math.min(100,Math.round(x.plan*100)))
          const actual=Math.max(0,Math.min(100,Math.round(x.actual*100)))
          const delta=Math.round(x.delta*100)
          const selected=project===x.p.id
          return <button
            key={x.p.id}
            className={`schedule-portfolio-row${selected?' selected':''}`}
            onClick={()=>handlePlotClick(x.p.id)}
            title={selected?'คลิกอีกครั้งเพื่อเปิดหน้ารายละเอียด Plot':'คลิกเพื่อดูงานของ Plot นี้ด้านล่าง'}
            aria-label={selected?`${x.p.code} เลือกอยู่ คลิกอีกครั้งเพื่อเปิดหน้ารายละเอียด Plot`:`${x.p.code} คลิกเพื่อดูงานด้านล่าง`}
          >
            <div className="schedule-site-name"><b>{x.p.code}</b><span>{x.p.name}</span>{selected&&<small style={{display:'block',marginTop:4,color:'var(--blue)',fontWeight:800}}>เลือกแล้ว • คลิกอีกครั้งเพื่อเปิด Plot →</small>}</div>
            <div className="schedule-comparison">
              <div className="schedule-comparison-track">
                <i style={{width:`${actual}%`}} />
                <em style={{left:`${plan}%`}} title={`Plan ${plan}%`} />
                <strong>{actual}%</strong>
              </div>
              <div className="schedule-comparison-meta"><span>Plan {plan}%</span><span className={delta<0?'danger-text':delta>0?'good-text':''}>Δ {delta>0?'+':''}{delta}%</span></div>
            </div>
            <div className="schedule-site-flags"><span className="warn-box"><b>{x.delayed}</b> Delayed</span><span className="danger-box"><b>{x.blockers}</b> Blocker</span></div>
          </button>
        })}
        {!projectStats.length&&<p className="muted">ไม่พบข้อมูลตามตัวกรอง</p>}
      </div>
    </section>

    <div className="schedule-sticky-tools">
      <div className="toolbar schedule-toolbar">
        <select value={project} onChange={e=>setProject(e.target.value)}><option value="">ทุก Site / Plot</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>
        <select value={status} onChange={e=>setStatus(e.target.value as StatusFilter)}>
          <option value="all">ทุกสถานะ</option>
          <option value="delayed">งานล่าช้า</option>
          <option value="blockers">มี Blocker</option>
          <option value="in_progress">กำลังดำเนินการ</option>
          <option value="completed">เสร็จแล้ว</option>
        </select>
        <input placeholder="ค้นหา งาน / พื้นที่ / ปัญหา / งานถัดไป…" value={q} onChange={e=>setQ(e.target.value)}/>
        <span className="schedule-row-count">{rows.length} รายการ</span>
        {(project||q||status!=='all')&&<button className="button" onClick={()=>{setProject('');setQ('');setStatus('all')}}>ล้างตัวกรอง</button>}
      </div>
    </div>

    {loading?<div className="panel">กำลังโหลดข้อมูล…</div>:<div className="panel schedule-table-panel">
      <div className="schedule-table-scroll">
        <table className="schedule-table">
          <thead><tr><th>Site / Plot</th><th>งาน / แผน</th><th>พื้นที่</th><th>Plan</th><th>Actual</th><th>Variance</th><th>ล่าช้า</th><th>สถานะ</th><th>ปัญหา / งานถัดไป</th></tr></thead>
          <tbody>{rows.map(t=>{
            const plan=Math.round((t.current_plan_progress||0)*100)
            const actual=Math.round((t.actual_progress||0)*100)
            const delta=actual-plan
            const isDelayed=(t.delay_days||0)>0&&(t.actual_progress||0)<1
            const hasBlocker=Boolean(t.blocker?.trim())&&(t.actual_progress||0)<1
            return <tr key={t.id} className={hasBlocker?'row-blocker':isDelayed?'row-delayed':''}>
              <td className="sticky-site"><b>{projects.find(p=>p.id===t.project_id)?.code||'-'}</b></td>
              <td><b>{t.task_name}</b><small>{t.category||'-'} • {dateTH(t.planned_start)} → {dateTH(t.planned_end)}</small></td>
              <td>{t.area||'-'}</td>
              <td><div className="cell-progress"><span>{plan}%</span><i><em style={{width:`${Math.max(0,Math.min(100,plan))}%`}} /></i></div></td>
              <td><div className="cell-progress actual"><span>{actual}%</span><i><em style={{width:`${Math.max(0,Math.min(100,actual))}%`}} /></i></div></td>
              <td className={delta<0?'danger-text':delta>0?'good-text':''}><b>{delta>0?'+':''}{delta}%</b></td>
              <td>{isDelayed?<span className="delay-chip">{t.delay_days} วัน</span>:<span className="muted">—</span>}</td>
              <td><StatusBadge value={t.site_status}/></td>
              <td className="schedule-detail-cell">
                {t.blocker&&<p><b>ปัญหา:</b> {t.blocker}</p>}
                {t.next_action&&<small><b>งานถัดไป:</b> {t.next_action}</small>}
                {!t.blocker&&!t.next_action&&<span className="muted">ยังไม่ระบุ</span>}
              </td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </div>}
  </AppShell>
}
