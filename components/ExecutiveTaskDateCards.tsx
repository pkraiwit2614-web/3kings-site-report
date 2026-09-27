'use client'

import {useEffect,useMemo,useState} from 'react'
import {createPortal} from 'react-dom'
import {getSupabase} from '@/lib/supabase'
import {dateTH} from '@/lib/format'

type Row={id:string;project_id:string;task_name:string;area:string|null;planned_start:string|null;planned_end:string|null;actual_start:string|null;actual_end:string|null}
type Project={id:string;code:string}

function blankDate(value:string|null|undefined){return value?dateTH(value):'\u00a0'}

export default function ExecutiveTaskDateCards(){
  const [rows,setRows]=useState<Row[]>([])
  const [projects,setProjects]=useState<Project[]>([])
  const [host,setHost]=useState<HTMLElement|null>(null)
  const [task,setTask]=useState<Row|null>(null)

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      const s=getSupabase()
      const [p,t]=await Promise.all([
        s.from('projects').select('id,code').eq('active',true),
        s.from('v_schedule_tasks').select('id,project_id,task_name,area,planned_start,planned_end,actual_start,actual_end')
      ])
      if(cancelled)return
      setProjects((p.data||[]) as Project[])
      setRows((t.data||[]) as Row[])
    }
    void load()
    return()=>{cancelled=true}
  },[])

  const projectByCode=useMemo(()=>new Map(projects.map(p=>[p.code,p.id])),[projects])

  useEffect(()=>{
    if(!rows.length||!projects.length)return
    let frame=0
    const sync=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')
        const nextHost=slide?.querySelector<HTMLElement>('.ep-task-info')||null
        if(!slide||!nextHost){setHost(null);setTask(null);return}
        const code=(slide.querySelector<HTMLElement>('.ep-eyebrow')?.textContent||'').split('•')[0].trim()
        const name=slide.querySelector<HTMLElement>('h2')?.textContent?.trim()||''
        const headerLine=slide.querySelector<HTMLElement>('header p')?.textContent||''
        const area=headerLine.split('• Plan')[0].trim()
        const projectId=projectByCode.get(code)||''
        let candidates=rows.filter(r=>r.project_id===projectId&&r.task_name.trim()===name)
        if(candidates.length>1)candidates=candidates.filter(r=>(r.area||'-').trim()===area)
        if(candidates.length>1)candidates=candidates.filter(r=>headerLine.includes(dateTH(r.planned_start))&&headerLine.includes(dateTH(r.planned_end)))
        setHost(nextHost)
        setTask(candidates[0]||null)
      })
    }
    sync()
    const observer=new MutationObserver(sync)
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    return()=>{observer.disconnect();cancelAnimationFrame(frame)}
  },[rows,projects,projectByCode])

  if(!host||!task)return null
  return createPortal(<>
    <div className="ep-date-grid" aria-label="Plan and actual task dates">
      <div className="plan-date"><span>เริ่มตามแผน</span><b>{blankDate(task.planned_start)}</b></div>
      <div className="plan-date"><span>จบตามแผน</span><b>{blankDate(task.planned_end)}</b></div>
      <div className="actual-date"><span>เริ่มจริง</span><b>{blankDate(task.actual_start)}</b></div>
      <div className="actual-date"><span>จบจริง</span><b>{blankDate(task.actual_end)}</b></div>
    </div>
    <style jsx global>{`
      .ep-task-info>.ep-progress{order:1}.ep-task-info>.ep-date-grid{order:2}.ep-task-info>.ep-info-grid{order:3}.ep-task-info>.ep-note{order:4}.ep-task-info>.ep-owner{order:5}
      .ep-date-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .ep-date-grid>div{min-height:58px;padding:8px 10px;border-radius:10px;border:1px solid #ddd5c7;background:#fff;display:grid;align-content:center}
      .ep-date-grid span{display:block;font-size:9px;font-weight:900;letter-spacing:.35px;color:#746d61}
      .ep-date-grid b{display:block;margin-top:3px;font-size:15px;line-height:1.18;color:#17243a;white-space:nowrap}
      .ep-date-grid .plan-date{background:#fff8e8;border-color:#e5cc8e;border-left:4px solid #b8872e}
      .ep-date-grid .actual-date{background:#eef5fb;border-color:#bed0e3;border-left:4px solid #315f9e}
      @media(max-width:620px){.ep-date-grid b{font-size:14px}}
      @media print{.ep-date-grid>div{break-inside:avoid}}
    `}</style>
  </>,host)
}
