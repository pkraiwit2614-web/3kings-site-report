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

type TaskView='all'|'delayed'|'blockers'|'completed'

const pictureProgressFolders:Record<string,string>={
  'AV-P6':'https://drive.google.com/drive/folders/18WfplWKvZ7DWfjVgO7oVHA4dtlbuuzfr',
  'AV-P7':'https://drive.google.com/drive/folders/1ZmlxctN0yAXamSmXTNzjx0t3GJu_aLiI',
  'AV-P8':'https://drive.google.com/drive/folders/1T1eWjtfuNhtI8hrm-Jac5tKeZNfbJaXY',
  'AV-P9':'https://drive.google.com/drive/folders/1f4YCTjwd8E0dHgbyf8eF7XeC5kSj5j_6'
}

function isPlotSummaryTask(t:ScheduleTask){
  return t.category==='งานก่อสร้าง' && /^งานก่อสร้าง\s+Above Villa Plot/i.test(t.task_name||'')
}

function TaskFollowUp({task,compact=false}:{task:ScheduleTask,compact?:boolean}){
  if(!task.blocker&&!task.next_action) return <span className="muted">-</span>
  return <div>
    {task.blocker?<p className={compact?'small':''}><b>ปัญหา:</b> {task.blocker}</p>:null}
    {task.next_action?<p className={compact?'small':''}><b>งานถัดไป:</b> {task.next_action}</p>:null}
  </div>
}

export default function ProjectPage(){
  const{id}=useParams<{id:string}>()
  const[p,setP]=useState<Project|null>(null)
  const[tasks,setTasks]=useState<ScheduleTask[]>([])
  const[reports,setReports]=useState<any[]>([])
  const[taskView,setTaskView]=useState<TaskView>('all')
  const[taskSearch,setTaskSearch]=useState('')
  const[categoryFilter,setCategoryFilter]=useState('')
  const[focusTaskId,setFocusTaskId]=useState('')

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const requested=params.get('view') as TaskView|null
    const requestedTask=params.get('task')||''
    if(requested&&['all','delayed','blockers','completed'].includes(requested)) setTaskView(requested)
    setFocusTaskId(requestedTask)
    if(requested||requestedTask){
      window.setTimeout(()=>document.getElementById('task-detail')?.scrollIntoView({behavior:'smooth',block:'start'}),250)
    }
  },[id])

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

  const workTasks=useMemo(()=>tasks.filter(t=>!isPlotSummaryTask(t)),[tasks])
  const delayedTasks=useMemo(()=>workTasks.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1),[workTasks])
  const blockerTasks=useMemo(()=>workTasks.filter(t=>!!t.blocker&&(t.actual_progress||0)<1),[workTasks])
  const completedTasks=useMemo(()=>workTasks.filter(t=>(t.actual_progress||0)>=1),[workTasks])
  const avgActual=workTasks.length?workTasks.reduce((s,t)=>s+(t.actual_progress||0),0)/workTasks.length:0
  const avgPlan=workTasks.length?workTasks.reduce((s,t)=>s+(t.current_plan_progress||0),0)/workTasks.length:0
  const weeklyMan=reports.reduce((s,r)=>s+(r.total_manpower||0),0)
  const weeklyItems=reports.flatMap((r:any)=>(r.report_items||[]).map((x:any)=>({...x,report_date:r.report_date,report_summary:r.summary})))
  const maxDelay=delayedTasks.reduce((m,t)=>Math.max(m,t.delay_days||0),0)
  const categories=useMemo(()=>[...new Set(workTasks.map(t=>t.category).filter((x):x is string=>Boolean(x?.trim())))].sort((a,b)=>a.localeCompare(b,'th')),[workTasks])
  const drivePhotoUrl=p?.code?pictureProgressFolders[p.code]:undefined

  const viewTasks=useMemo(()=>{
    if(taskView==='delayed') return delayedTasks
    if(taskView==='blockers') return blockerTasks
    if(taskView==='completed') return completedTasks
    return workTasks
  },[taskView,workTasks,delayedTasks,blockerTasks,completedTasks])

  useEffect(()=>{
    if(!focusTaskId||!workTasks.length) return
    const target=workTasks.find(t=>t.id===focusTaskId)
    if(!target) return
    const visibleInCurrentView=viewTasks.some(t=>t.id===focusTaskId)
    if(!visibleInCurrentView){
      setTaskView('all')
      return
    }
    window.setTimeout(()=>document.getElementById(`task-${focusTaskId}`)?.scrollIntoView({behavior:'smooth',block:'center'}),180)
  },[focusTaskId,workTasks,viewTasks])

  const filteredTasks=useMemo(()=>{
    const needle=taskSearch.trim().toLowerCase()
    return viewTasks.filter(t=>{
      if(categoryFilter&&t.category!==categoryFilter) return false
      if(!needle) return true
      return `${t.task_name||''} ${t.category||''} ${t.area||''} ${t.blocker||''} ${t.next_action||''} ${t.contractor||''}`.toLowerCase().includes(needle)
    })
  },[viewTasks,taskSearch,categoryFilter])

  const viewMeta={
    all:{title:'งานทั้งหมด',desc:'งาน Schedule ทั้งหมดของ Plot นี้ ไม่รวมแถวสรุป Plot'},
    delayed:{title:'งานล่าช้า',desc:'งานที่เลยกำหนดตามแผนและยังไม่เสร็จ 100%'},
    blockers:{title:'งานติดอุปสรรค',desc:'งานที่ยังไม่เสร็จและมีปัญหา/เงื่อนไขค้างที่ต้องติดตาม'},
    completed:{title:'งานเสร็จแล้ว',desc:'งานที่ Actual Progress = 100%'}
  }[taskView]

  function openTaskView(view:TaskView){
    setFocusTaskId('')
    setTaskView(view)
    window.setTimeout(()=>document.getElementById('task-detail')?.scrollIntoView({behavior:'smooth',block:'start'}),50)
  }

  return <AppShell>
    <PageHeader
      title={p?`${p.code} — ${p.name}`:'รายละเอียด Plot'}
      subtitle={`เป้าส่งมอบ: ${dateTH(p?.target_handover)} • แผน ${pct(avgPlan)} • หน้างานจริง ${pct(avgActual)}`}
      action={<div className="row">
        <Link className="button" href="/weekly">← รายงานประจำสัปดาห์</Link>
        {drivePhotoUrl&&<Link className="button" href={drivePhotoUrl} target="_blank" rel="noreferrer">รูปความคืบหน้า (Drive) ↗</Link>}
        <button className="button primary" onClick={()=>window.print()}>พิมพ์ PDF Plot</button>
      </div>}
    />

    <section className="kpi-grid plot-kpi-grid">
      <button type="button" className={`kpi kpi-link kpi-all ${taskView==='all'?'active':''}`} onClick={()=>openTaskView('all')}>
        <span>งานทั้งหมด</span><b>{workTasks.length} <em>งาน</em></b><small>คลิกเพื่อดูรายละเอียดงานทั้งหมด</small>
      </button>
      <button type="button" className={`kpi kpi-link kpi-delay ${taskView==='delayed'?'active':''}`} onClick={()=>openTaskView('delayed')}>
        <span>งานล่าช้า</span><b>{delayedTasks.length} <em>งาน</em></b><small>ตัวเลขหลัก = จำนวนงาน • ล่าช้าสูงสุด {maxDelay} วัน</small>
      </button>
      <button type="button" className={`kpi kpi-link kpi-blocker ${taskView==='blockers'?'active':''}`} onClick={()=>openTaskView('blockers')}>
        <span>งานติดอุปสรรค</span><b>{blockerTasks.length} <em>งาน</em></b><small>มีปัญหา/เงื่อนไขค้างและงานยังไม่เสร็จ</small>
      </button>
      <button type="button" className={`kpi kpi-link kpi-complete ${taskView==='completed'?'active':''}`} onClick={()=>openTaskView('completed')}>
        <span>งานเสร็จแล้ว</span><b>{completedTasks.length} <em>งาน</em></b><small>Actual Progress = 100%</small>
      </button>
    </section>

    <section className="panel weekly-section" id="task-detail">
      <div className="schedule-sticky-tools" style={{marginBottom:8}}>
        <div className="panel-head" style={{background:'var(--surface)',border:'1px solid var(--line)',borderBottom:0,borderRadius:'12px 12px 0 0',padding:'10px 12px'}}>
          <div><h2>รายละเอียด — {viewMeta.title}</h2><span className="muted">{viewMeta.desc}</span></div><span className="pill">{filteredTasks.length} งาน</span>
        </div>
        <div className="toolbar schedule-toolbar" style={{borderRadius:'0 0 12px 12px'}}>
          <input value={taskSearch} onChange={e=>setTaskSearch(e.target.value)} placeholder="ค้นหางาน เช่น ฝ้า / กระเบื้อง / ราวกันตก / Air / ปัญหา…" />
          <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
            <option value="">ทุกหมวดหลัก</option>
            {categories.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <span className="schedule-row-count">{filteredTasks.length} รายการ</span>
          {(taskSearch||categoryFilter)&&<button type="button" className="button" onClick={()=>{setTaskSearch('');setCategoryFilter('')}}>ล้างค้นหา</button>}
        </div>
      </div>
      {(taskSearch||categoryFilter)&&<p className="muted small" style={{marginTop:0}}>กำลังแสดง {filteredTasks.length} จาก {viewTasks.length} งานในมุมมองนี้{categoryFilter?` • หมวด: ${categoryFilter}`:''}</p>}
      <div className="schedule-table-panel" style={{border:'1px solid var(--line)',borderRadius:12}}>
        <div className="schedule-table-scroll" style={{maxHeight:'calc(100vh - 250px)'}}>
          <table className="schedule-table" style={{minWidth:1180}}>
            <thead><tr><th>งาน</th><th>พื้นที่</th><th>แผนเริ่ม–จบ</th><th>% แผน</th><th>% จริง</th><th>ล่าช้า</th><th>สถานะ</th><th>ปัญหา / งานถัดไป</th></tr></thead>
            <tbody>{filteredTasks.map(t=><tr id={`task-${t.id}`} key={t.id} style={focusTaskId===t.id?{outline:'3px solid var(--blue)',outlineOffset:'-3px',scrollMarginTop:180}:undefined}><td><b>{t.task_name}</b><small>{t.category||'-'}</small></td><td>{t.area||'-'}</td><td>{dateTH(t.planned_start)} → {dateTH(t.planned_end)}</td><td>{pct(t.current_plan_progress)}</td><td>{pct(t.actual_progress)}</td><td className={(t.delay_days||0)>0?'danger-text':''}>{t.delay_days||0} วัน</td><td><StatusBadge value={t.site_status}/></td><td><TaskFollowUp task={t} compact/></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      {!filteredTasks.length&&<p className="muted" style={{padding:'12px 0 0'}}>ไม่พบงานที่ตรงกับคำค้นหา / หมวดที่เลือก</p>}
    </section>

    <section className="panel weekly-section" id="weekly">
      <div className="panel-head"><div><h2>กิจกรรม 7 วันล่าสุด</h2><span className="muted">ดึงจาก Daily Report ของ Plot นี้โดยตรง</span></div><div className="weekly-kpis"><b>{reports.length}<small>รายงาน</small></b><b>{weeklyItems.length}<small>รายการงาน</small></b><b>{weeklyMan}<small>คน-วัน*</small></b></div></div>
      {reports.length?reports.map((r:any)=><div key={r.id} className="work-card">
        <div className="row between"><div><b>{dateTH(r.report_date)}</b><p>{r.summary||'Daily Report'}</p></div><div className="right"><StatusBadge value={r.status}/><small>{r.total_manpower||0} คน</small></div></div>
        {(r.report_items||[]).length?<div className="stack">{r.report_items.map((x:any)=><div className="list-row" key={x.id}>
          <div><b>{x.work_item}</b><small>Actual {pct(x.actual_progress)} • กำลังคน {x.manpower||0} คน • Target {dateTH(x.target_date)}</small><p>{x.blocker?`ปัญหา: ${x.blocker}`:x.next_action?`งานถัดไป: ${x.next_action}`:x.remarks||'-'}</p></div>
          <StatusBadge value={x.status}/>
        </div>)}</div>:<p className="muted">ไม่มีรายการงานในรายงานนี้</p>}
      </div>):<p className="muted">ยังไม่มี Daily Report ใน 7 วันล่าสุด</p>}
      <p className="muted small">* คน-วัน = ผลรวม manpower ที่รายงานในแต่ละวัน ไม่ใช่จำนวนคนแบบไม่ซ้ำ</p>
    </section>
  </AppShell>
}
