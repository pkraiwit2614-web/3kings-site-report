'use client'

import {useEffect,useMemo,useState} from 'react'
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
        const taskInfo=slide?.querySelector<HTMLElement>('.ep-task-info')||null
        if(!slide||!taskInfo)return

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

        // The main slide is already rendered from the same Progress task row.
        // Use its header dates as a fallback if the lookup has not settled yet.
        const headerLine=slide.querySelector<HTMLElement>('header p')?.textContent?.trim()||''
        const headerPlan=headerLine.match(/Plan\s+(.+?)\s*(?:→|->|–)\s*(.+?)\s*$/i)
        const fallbackStart=headerPlan?.[1]?.trim()||''
        const fallbackEnd=headerPlan?.[2]?.trim()||''

        const start=matchedTask?.planned_start
          ? dateTH(matchedTask.planned_start)
          : (fallbackStart||(!loaded?'กำลังโหลด…':'ไม่พบวันที่ใน Progress'))
        const end=matchedTask?.planned_end
          ? dateTH(matchedTask.planned_end)
          : (fallbackEnd||(!loaded?'กำลังโหลด…':'ไม่พบวันที่ใน Progress'))

        // Do not inject child nodes into React-owned DOM. React reconciliation can
        // remove those nodes. Persist the values as unmanaged data attributes and
        // render the two visible cards with CSS pseudo-elements instead.
        taskInfo.dataset.planStart=start
        taskInfo.dataset.planEnd=end
        taskInfo.dataset.planTaskId=matchedTask?.id||''
        taskInfo.dataset.planSource=matchedTask?.source_file||'Progress'
        taskInfo.title=matchedTask
          ? `Plan dates: ${matchedTask.source_file||'-'} • ${matchedTask.source_sheet||'-'}${matchedTask.source_row?` • Row ${matchedTask.source_row}`:''}`
          : `Plan dates: ${code} • Slide ${slideIndex+1}`
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
  },[orderedTasks,projectByCode,loaded])

  return <style jsx global>{`
    /* Persistent plan dates. Values live on .ep-task-info data attributes so a
       subsequent React render cannot delete the visible cards. */
    .ep-task-info[data-plan-start]{
      grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
    }
    .ep-task-info[data-plan-start]>.ep-progress{
      grid-column:1 / -1!important;
      order:1!important;
    }
    .ep-task-info[data-plan-start]::before,
    .ep-task-info[data-plan-start]::after{
      min-width:0;
      min-height:64px;
      padding:10px 12px;
      box-sizing:border-box;
      border:1px solid #e5cc8e;
      border-left:4px solid #b8872e;
      border-radius:10px;
      background:#fff8e8;
      color:#17243a;
      font-size:15px;
      line-height:1.25;
      font-weight:900;
      white-space:pre-line;
      display:flex;
      align-items:center;
      order:2!important;
    }
    .ep-task-info[data-plan-start]::before{
      content:'เริ่มในแผน\\A' attr(data-plan-start);
      grid-column:1!important;
    }
    .ep-task-info[data-plan-start]::after{
      content:'จบในแผน\\A' attr(data-plan-end);
      grid-column:2!important;
    }
    .ep-task-info[data-plan-start]>.ep-info-grid{
      grid-column:1 / -1!important;
      order:3!important;
    }
    .ep-task-info[data-plan-start]>.ep-note{
      grid-column:1 / -1!important;
      order:4!important;
    }
    .ep-task-info[data-plan-start]>.ep-owner{
      grid-column:1 / -1!important;
      order:5!important;
    }
    @media(max-width:620px){
      .ep-task-info[data-plan-start]::before,
      .ep-task-info[data-plan-start]::after{
        min-height:58px;
        padding:9px 10px;
        font-size:14px;
      }
    }
    @media print{
      .ep-task-info[data-plan-start]::before,
      .ep-task-info[data-plan-start]::after{break-inside:avoid}
    }
  `}</style>
}
