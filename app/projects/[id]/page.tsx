'use client'

import {useEffect,useState} from 'react'
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

  useEffect(()=>{
    const s=getSupabase()
    Promise.all([
      s.from('projects').select('*').eq('id',id).single(),
      s.from('v_schedule_tasks').select('*').eq('project_id',id).order('planned_start')
    ]).then(([pr,t])=>{
      setP(pr.data as Project)
      setTasks((t.data||[])as ScheduleTask[])
    })
  },[id])

  const critical=tasks.filter(t=>((t.delay_days||0)>0||t.blocker)&&(t.actual_progress||0)<1)

  return <AppShell>
    <PageHeader title={p?`${p.code} — ${p.name}`:'Project Detail'} subtitle={`Target handover: ${dateTH(p?.target_handover)}`}/>
    <section className="kpi-grid"><div className="kpi"><span>Tasks</span><b>{tasks.length}</b></div><div className="kpi"><span>Delayed</span><b>{tasks.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length}</b></div><div className="kpi"><span>Blockers</span><b>{tasks.filter(t=>!!t.blocker).length}</b></div><div className="kpi"><span>Completed</span><b>{tasks.filter(t=>(t.actual_progress||0)>=1).length}</b></div></section>
    <section className="panel"><h2>Critical Tasks</h2><div className="stack">{critical.slice(0,20).map(t=><div className="list-row" key={t.id}><div><b>{t.task_name}</b><small>{t.area||'-'} • {dateTH(t.planned_end)} • Actual {pct(t.actual_progress)}</small><p>{t.blocker||t.next_action||'-'}</p></div><div className="right"><StatusBadge value={t.site_status}/><small>{t.delay_days||0} วัน</small></div></div>)}</div></section>
  </AppShell>
}
