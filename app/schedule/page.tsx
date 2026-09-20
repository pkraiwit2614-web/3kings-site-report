'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { pct, dateTH } from '@/lib/format'
import type { Project, ScheduleTask } from '@/lib/types'

export default function SchedulePage(){
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<ScheduleTask[]>([])
  const [project,setProject]=useState('')
  const [q,setQ]=useState('')

  useEffect(()=>{
    const s=getSupabase()
    Promise.all([
      s.from('projects').select('*').eq('active',true).order('sort_order'),
      s.from('v_schedule_tasks').select('*').order('planned_start')
    ]).then(([p,t])=>{
      setProjects((p.data||[]) as Project[])
      setTasks((t.data||[]) as ScheduleTask[])
    })
  },[])

  const rows=useMemo(()=>tasks.filter(t=>(!project||t.project_id===project)&&(!q||`${t.task_name} ${t.category||''} ${t.area||''} ${t.blocker||''}`.toLowerCase().includes(q.toLowerCase()))),[tasks,project,q])

  return <AppShell>
    <PageHeader title="Schedule / Plan vs Actual" subtitle="กำหนดแผนงานพร้อมเปรียบเทียบแผนกับหน้างานจริง จำนวนวันล่าช้า และปัญหา/อุปสรรค"/>
    <div className="toolbar">
      <select value={project} onChange={e=>setProject(e.target.value)}><option value="">ทุก Site / Plot</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>
      <input placeholder="ค้นหา เช่น งานฝ้า / ราวกันตก / Air / ปัญหา…" value={q} onChange={e=>setQ(e.target.value)}/>
      <span>{rows.length} รายการ</span>
    </div>
    <div className="panel table-wrap"><table><thead><tr><th>Site / Plot</th><th>งาน</th><th>พื้นที่</th><th>% ตามแผน</th><th>% หน้างานจริง</th><th>ล่าช้า</th><th>สถานะ</th><th>ปัญหา / งานถัดไป</th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td>{projects.find(p=>p.id===t.project_id)?.code}</td><td><b>{t.task_name}</b><small>แผน {dateTH(t.planned_start)} → {dateTH(t.planned_end)}</small></td><td>{t.area||'-'}</td><td>{pct(t.current_plan_progress)}</td><td>{pct(t.actual_progress)}</td><td className={(t.delay_days||0)>0?'danger-text':''}>{t.delay_days||0} วัน</td><td><StatusBadge value={t.site_status}/></td><td><b className="danger-text">{t.blocker||''}</b><small>{t.next_action||'ยังไม่ระบุงานถัดไป'}</small></td></tr>)}</tbody></table></div>
  </AppShell>
}
