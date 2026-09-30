'use client'

import {useEffect,useMemo,useState} from 'react'
import {createPortal} from 'react-dom'
import {getSupabase} from '@/lib/supabase'
import {dateTH} from '@/lib/format'
import {sortTasksByNumber} from '@/lib/taskOrder'

type ProjectRow={id:string;code:string}
type TaskRow={
  id:string
  project_id:string
  task_name:string
  area:string|null
  planned_start:string|null
  planned_end:string|null
  source_task_no:string|null
  source_file:string|null
  source_sheet:string|null
  source_row:number|null
}

function overlaps(task:TaskRow,start:string,end:string){
  if(!task.planned_start&&!task.planned_end)return false
  const s=task.planned_start||task.planned_end||''
  const e=task.planned_end||task.planned_start||''
  return s<=end&&e>=start
}

export default function ExecutivePlanDateFields20260930(){
  const [projects,setProjects]=useState<ProjectRow[]>([])
  const [tasks,setTasks]=useState<TaskRow[]>([])
  const [loaded,setLoaded]=useState(false)
  const [host,setHost]=useState<HTMLElement|null>(null)
  const [task,setTask]=useState<TaskRow|null>(null)
  const [fallbackStart,setFallbackStart]=useState('')
  const [fallbackEnd,setFallbackEnd]=useState('')
  const [debugLabel,setDebugLabel]=useState('')

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      const s=getSupabase()
      const [p,t]=await Promise.all([
        s.from('projects').select('id,code').eq('active',true),
        s.from('v_schedule_tasks').select('id,project_id,task_name,area,planned_start,planned_end,source_task_no,source_file,source_sheet,source_row')
      ])
      if(cancelled)return
      setProjects((p.data||[]) as ProjectRow[])
      setTasks((t.data||[]) as TaskRow[])
      setLoaded(true)
    }
    void load()
    return()=>{cancelled=true}
  },[])

  const projectByCode=useMemo(()=>new Map(projects.map(p=>[p.code,p.id])),[projects])
  const orderedTasks=useMemo(
    ()=>sortTasksByNumber(tasks.filter(t=>String(t.source_task_no||'').trim()!=='1')),
    [tasks]
  )

  useEffect(()=>{
    let frame=0
    const sync=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')
        const nextHost=slide?.querySelector<HTMLElement>('.ep-task-info')||null
        if(!slide||!nextHost){
          setHost(null)
          setTask(null)
          setFallbackStart('')
          setFallbackEnd('')
          setDebugLabel('')
          return
        }

        const code=(slide.querySelector<HTMLElement>('.ep-eyebrow')?.textContent||'').split('•')[0].trim()
        const projectId=projectByCode.get(code)||''
        const dateInputs=[...document.querySelectorAll<HTMLInputElement>('.ep-filter input[type="date"]')]
        const startDate=dateInputs[0]?.value||'0000-01-01'
        const endDate=dateInputs[1]?.value||'9999-12-31'
        const counter=slide.closest('.ep-stage')?.querySelector<HTMLElement>('.ep-stage-controls span')?.textContent||''
        const counterMatch=counter.match(/(\d+)\s*\/\s*(\d+)/)
        const slideIndex=Math.max(0,Number(counterMatch?.[1]||1)-1)
        const projectTasks=orderedTasks.filter(t=>t.project_id===projectId&&overlaps(t,startDate,endDate))
        const matchedTask=projectTasks[slideIndex]||null

        const headerLine=slide.querySelector<HTMLElement>('header p')?.textContent?.trim()||''
        const headerPlan=headerLine.match(/Plan\s+(.+?)\s*(?:→|->|–)\s*(.+?)\s*$/i)

        setHost(nextHost)
        setTask(matchedTask)
        setFallbackStart(headerPlan?.[1]?.trim()||'')
        setFallbackEnd(headerPlan?.[2]?.trim()||'')
        setDebugLabel(`${code} • Slide ${slideIndex+1}`)
      })
    }

    sync()
    const observer=new MutationObserver(sync)
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    document.addEventListener('change',sync,true)
    document.addEventListener('click',sync,true)
    window.addEventListener('resize',sync)
    return()=>{
      observer.disconnect()
      document.removeEventListener('change',sync,true)
      document.removeEventListener('click',sync,true)
      window.removeEventListener('resize',sync)
      cancelAnimationFrame(frame)
    }
  },[orderedTasks,projectByCode])

  if(!host)return null

  const start=task?.planned_start?dateTH(task.planned_start):(fallbackStart||(!loaded?'กำลังโหลด…':'ไม่พบวันที่ใน Progress'))
  const end=task?.planned_end?dateTH(task.planned_end):(fallbackEnd||(!loaded?'กำลังโหลด…':'ไม่พบวันที่ใน Progress'))
  const source=task
    ? `Progress: ${task.source_file||'-'} • ${task.source_sheet||'-'}${task.source_row?` • Row ${task.source_row}`:''}`
    : `Progress lookup: ${debugLabel}`

  return createPortal(<>
    <div className="ep-plan-date-grid" data-plan-task-id={task?.id||''} title={source}>
      <div className="ep-plan-date-card">
        <span>เริ่มในแผน</span>
        <b>{start}</b>
      </div>
      <div className="ep-plan-date-card">
        <span>จบในแผน</span>
        <b>{end}</b>
      </div>
    </div>
    <style jsx global>{`
      .ep-task-info>.ep-progress{order:1}
      .ep-task-info>.ep-plan-date-grid{order:2}
      .ep-task-info>.ep-info-grid{order:3}
      .ep-task-info>.ep-note{order:4}
      .ep-task-info>.ep-owner{order:5}
      .ep-plan-date-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
        width:100%;
      }
      .ep-plan-date-card{
        min-width:0;
        min-height:68px;
        padding:11px 12px;
        border:1px solid #e5cc8e;
        border-left:4px solid #b8872e;
        border-radius:10px;
        background:#fff8e8;
        display:grid;
        align-content:center;
      }
      .ep-plan-date-card span{
        display:block;
        font-size:10px;
        color:#746d61;
        font-weight:900;
      }
      .ep-plan-date-card b{
        display:block;
        margin-top:4px;
        color:#17243a;
        font-size:16px;
        line-height:1.2;
        white-space:normal;
        overflow-wrap:anywhere;
      }
      @media(max-width:620px){
        .ep-plan-date-card{min-height:60px;padding:9px 10px}
        .ep-plan-date-card b{font-size:14px}
      }
      @media print{
        .ep-plan-date-grid{break-inside:avoid}
      }
    `}</style>
  </>,host)
}
