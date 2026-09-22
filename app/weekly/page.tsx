'use client'

import Link from 'next/link'
import {useEffect,useMemo,useState} from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import {getSupabase} from '@/lib/supabase'
import {pct,dateTH} from '@/lib/format'
import type{Project,ScheduleTask} from '@/lib/types'

function clamp(v:number){return Math.max(0,Math.min(100,Math.round(v*100)))}

export default function WeeklyPage(){
  const[projects,setProjects]=useState<Project[]>([])
  const[tasks,setTasks]=useState<ScheduleTask[]>([])
  const[reports,setReports]=useState<any[]>([])
  const[selectedProject,setSelectedProject]=useState('')

  useEffect(()=>{
    const s=getSupabase()
    const since=new Date(Date.now()-7*86400000).toISOString().slice(0,10)
    Promise.all([
      s.from('projects').select('*').eq('active',true).order('sort_order'),
      s.from('v_schedule_tasks').select('*'),
      s.from('daily_reports').select('id,project_id,report_date,total_manpower,summary,status,report_items(id,work_category,work_item,manpower)').gte('report_date',since).order('report_date')
    ]).then(([p,t,r])=>{
      setProjects((p.data||[])as Project[])
      setTasks((t.data||[])as ScheduleTask[])
      setReports(r.data||[])
    })
  },[])

  const workTasks=useMemo(()=>tasks.filter(t=>t.source_task_no!=='1'),[tasks])

  const data=useMemo(()=>projects.map(p=>{
    const list=workTasks.filter(t=>t.project_id===p.id)
    const rs=reports.filter(r=>r.project_id===p.id)
    const a=list.length?list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length:0
    const pl=list.length?list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length:0
    return{
      p,a,pl,
      delay:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length,
      block:list.filter(t=>Boolean(t.blocker?.trim())&&(t.actual_progress||0)<1).length,
      man:rs.reduce((s,r)=>s+(Number(r.total_manpower)||0),0),
      reports:rs,
      taskCount:list.length
    }
  }).filter(x=>x.taskCount>0||x.reports.length>0),[projects,workTasks,reports])

  const visibleSites=useMemo(()=>selectedProject?data.filter(x=>x.p.id===selectedProject):data,[data,selectedProject])
  const selectedTasks=useMemo(()=>selectedProject?workTasks.filter(t=>t.project_id===selectedProject):workTasks,[workTasks,selectedProject])
  const selectedReports=useMemo(()=>selectedProject?reports.filter(r=>r.project_id===selectedProject):reports,[reports,selectedProject])
  const selectedItems=useMemo(()=>selectedReports.flatMap((r:any)=>(r.report_items||[])),[selectedReports])

  const summary=useMemo(()=>{
    const list=selectedTasks
    const plan=list.length?list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length:0
    const actual=list.length?list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length:0
    return{
      plan,actual,
      delayed:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length,
      blockers:list.filter(t=>Boolean(t.blocker?.trim())&&(t.actual_progress||0)<1).length,
      manpower:selectedReports.reduce((s,r)=>s+(Number(r.total_manpower)||0),0)
    }
  },[selectedTasks,selectedReports])

  const disciplineStats=useMemo(()=>{
    const map=new Map<string,ScheduleTask[]>()
    selectedTasks.forEach(t=>{
      const key=t.category?.trim()||'ไม่ระบุหมวด'
      map.set(key,[...(map.get(key)||[]),t])
    })
    return [...map.entries()].map(([category,list])=>{
      const plan=list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length
      const actual=list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length
      const manpower=selectedItems.filter((x:any)=>String(x.work_category||'').trim()===category).reduce((s:number,x:any)=>s+(Number(x.manpower)||0),0)
      return{
        category,count:list.length,plan,actual,
        delayed:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length,
        blockers:list.filter(t=>Boolean(t.blocker?.trim())&&(t.actual_progress||0)<1).length,
        manpower
      }
    }).sort((a,b)=>b.count-a.count)
  },[selectedTasks,selectedItems])

  const selectedName=selectedProject?projects.find(p=>p.id===selectedProject):null

  return <AppShell>
    <PageHeader title="Weekly Management Report" subtitle="ภาพรวม 7 วันล่าสุด • Plan vs Actual • งานล่าช้า • Blocker • กำลังคน • เลือกดูแยกแต่ละ Site / Plot ได้" action={<button className="button primary" onClick={()=>window.print()}>พิมพ์ / บันทึก PDF</button>}/>

    <section className="panel" style={{marginBottom:14,position:'sticky',top:0,zIndex:15}}>
      <div className="toolbar" style={{padding:10,background:'var(--surface)',borderRadius:12}}>
        <select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}>
          <option value="">ทุก Site / Plot (ภาพรวม)</option>
          {data.map(x=><option key={x.p.id} value={x.p.id}>{x.p.code} — {x.p.name}</option>)}
        </select>
        <span className="muted small">{selectedName?`กำลังดูเฉพาะ ${selectedName.code} — ${selectedName.name}`:'กำลังดูภาพรวมทุก Site / Plot'}</span>
      </div>
    </section>

    <section className="schedule-summary-grid" style={{marginBottom:16}}>
      <div className="schedule-summary-card"><span>Plan</span><b>{pct(summary.plan)}</b><small>ค่าเฉลี่ยตามแผน</small></div>
      <div className="schedule-summary-card actual"><span>Actual</span><b>{pct(summary.actual)}</b><small>หน้างานจริงล่าสุด</small></div>
      <div className="schedule-summary-card warn"><span>งานล่าช้า</span><b>{summary.delayed}</b><small>งานที่ยังไม่เสร็จ</small></div>
      <div className="schedule-summary-card danger"><span>งานติดอุปสรรค</span><b>{summary.blockers}</b><small>งานที่มี Blocker</small></div>
      <div className="schedule-summary-card"><span>กำลังคน 7 วัน</span><b>{summary.manpower}</b><small>คน-วัน*</small></div>
    </section>

    <section className="panel dashboard-module" style={{marginBottom:16}}>
      <div className="module-title"><span>•</span><div><b>ภาพรวมราย Site / Plot</b><small>คลิกชื่อหน้างานเพื่อเปิดรายละเอียด • คลิกงานล่าช้าหรือ Blocker เพื่อเปิดรายการนั้นในหน้า Plot</small></div></div>
      <div className="portfolio-bars">
        {visibleSites.map(x=>{
          const plan=clamp(x.pl),actual=clamp(x.a),delta=Math.round((x.a-x.pl)*100)
          return <div key={x.p.id} className="portfolio-bar-row" style={{gridTemplateColumns:'minmax(150px,1.1fr) minmax(190px,2fr) minmax(220px,1.4fr)'}}>
            <Link href={`/projects/${x.p.id}`} style={{minWidth:0}}><b style={{color:'var(--navy-2)'}}>{x.p.code}</b><small style={{display:'block'}}>{x.p.name}</small></Link>
            <Link href={`/projects/${x.p.id}`} className="portfolio-track"><i style={{width:`${actual}%`}}/><em style={{left:`${plan}%`}}/><strong>{actual}%</strong></Link>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,minWidth:0}}>
              <Link href={`/projects/${x.p.id}?view=delayed#task-detail`} style={{background:'var(--amber-soft)',borderRadius:8,padding:'7px 8px',textAlign:'center'}}><small>ล่าช้า</small><b style={{display:'block'}}>{x.delay} งาน</b></Link>
              <Link href={`/projects/${x.p.id}?view=blockers#task-detail`} style={{background:'var(--red-soft)',borderRadius:8,padding:'7px 8px',textAlign:'center'}}><small>Blocker</small><b style={{display:'block'}}>{x.block} งาน</b></Link>
              <Link href={`/projects/${x.p.id}#weekly`} style={{background:'var(--surface-2)',borderRadius:8,padding:'7px 8px',textAlign:'center'}}><small>กำลังคน</small><b style={{display:'block'}}>{x.man}</b></Link>
            </div>
            <small style={{gridColumn:'2',color:'var(--muted)'}}>Plan {plan}% • Δ {delta>0?'+':''}{delta}%</small>
          </div>
        })}
        {!visibleSites.length&&<p className="muted">ยังไม่มีข้อมูลใน Site / Plot ที่เลือก</p>}
      </div>
    </section>

    <section className="panel dashboard-module" style={{marginBottom:16}}>
      <div className="module-title"><span>•</span><div><b>WORK PROGRESS BY DISCIPLINE</b><small>{selectedName?`แยกหมวดงานของ ${selectedName.code}`:'รวมทุก Site / Plot — ใช้ตัวกรองด้านบนเพื่อดูแยกราย Plot'}</small></div></div>
      <div className="discipline-list">{disciplineStats.map(x=>{
        const plan=clamp(x.plan),actual=clamp(x.actual),delta=Math.round((x.actual-x.plan)*100)
        return <div key={x.category} className="discipline-row">
          <div><b>{x.category}</b><small>{x.count} งาน • ล่าช้า {x.delayed} • Blocker {x.blockers}{x.manpower?` • ${x.manpower} คน-วัน`:''}</small></div>
          <div className="discipline-bars"><span><i style={{width:`${plan}%`}}/></span><span className="actual"><i style={{width:`${actual}%`}}/></span></div>
          <div><b>{actual}%</b><small className={delta<0?'danger-text':'good-text'}>Δ {delta>0?'+':''}{delta}%</small></div>
        </div>
      })}</div>
      <div className="module-footnote"><span><i className="plan-key"/>Plan</span><span><i className="actual-key"/>Actual</span></div>
    </section>

    <section className="panel weekly-section">
      <div className="panel-head"><div><h2>Daily Report — 7 วันล่าสุด</h2><span className="muted">{selectedName?selectedName.code:'ทุก Site / Plot'}</span></div><span className="pill">{selectedReports.length} รายงาน</span></div>
      {selectedReports.length?selectedReports.slice().reverse().map((r:any)=>{
        const p=projects.find(x=>x.id===r.project_id)
        return <Link href={`/projects/${r.project_id}#weekly`} className="subitem" key={r.id}><span><b>{p?.code||'-'}</b> • {dateTH(r.report_date)} — {r.summary||'รายงานประจำวัน'}</span><b>{r.total_manpower||0} คน</b></Link>
      }):<p className="muted">ยังไม่มีรายงานประจำวันใน 7 วันล่าสุด</p>}
    </section>

    <p className="muted small">* คน-วัน = ผลรวมกำลังคนที่รายงานในแต่ละวัน ไม่ใช่จำนวนคนแบบไม่ซ้ำ</p>
  </AppShell>
}
