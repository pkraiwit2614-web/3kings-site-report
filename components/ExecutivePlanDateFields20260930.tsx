'use client'

import {useEffect,useMemo,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {dateTH} from '@/lib/format'

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

function clean(value:string|null|undefined){return String(value||'').trim()}

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
      setTasks(((t.data||[]) as TaskRow[]).filter(t=>String(t.source_task_no||'').trim()!=='1'))
      setLoaded(true)
    }
    void load()
    return()=>{cancelled=true}
  },[])

  const projectByCode=useMemo(()=>new Map(projects.map(p=>[p.code,p.id])),[projects])

  useEffect(()=>{
    let frame=0
    const sync=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')
        const taskInfo=slide?.querySelector<HTMLElement>('.ep-task-info')||null
        if(!slide||!taskInfo)return

        const code=clean(slide.querySelector<HTMLElement>('.ep-eyebrow')?.textContent).split('•')[0].trim()
        const projectId=projectByCode.get(code)||''
        const taskName=clean(slide.querySelector<HTMLElement>('h2')?.textContent)
        const headerLine=clean(slide.querySelector<HTMLElement>('header p')?.textContent)
        const headerPlan=headerLine.match(/Plan\s+(.+?)\s*(?:→|->|–)\s*(.+?)\s*$/i)
        const visibleStart=clean(headerPlan?.[1])
        const visibleEnd=clean(headerPlan?.[2])
        const visibleArea=clean(headerLine.split(/\s+•\s+Plan\s+/i)[0])

        const candidates=tasks.filter(t=>t.project_id===projectId&&clean(t.task_name)===taskName)
        const exact=candidates.find(t=>
          (!visibleArea||clean(t.area)===visibleArea)&&
          (!visibleStart||dateTH(t.planned_start)===visibleStart)&&
          (!visibleEnd||dateTH(t.planned_end)===visibleEnd)
        )||null
        const areaMatches=visibleArea?candidates.filter(t=>clean(t.area)===visibleArea):[]
        const matchedTask=exact||(areaMatches.length===1?areaMatches[0]:candidates.length===1?candidates[0]:null)

        // The slide header is rendered directly from currentTask by React, so use
        // those visible dates first. This guarantees the cards cannot drift to a
        // different task when navigating deep into a Plot presentation.
        const start=visibleStart||(matchedTask?.planned_start?dateTH(matchedTask.planned_start):(!loaded?'กำลังโหลด…':'ไม่พบวันที่ใน Progress'))
        const end=visibleEnd||(matchedTask?.planned_end?dateTH(matchedTask.planned_end):(!loaded?'กำลังโหลด…':'ไม่พบวันที่ใน Progress'))

        taskInfo.dataset.planStart=start
        taskInfo.dataset.planEnd=end
        taskInfo.dataset.planTaskId=matchedTask?.id||''
        taskInfo.dataset.planSource=matchedTask?.source_file||'Current Progress slide'
        taskInfo.title=matchedTask
          ? `Plan dates: ${matchedTask.source_file||'-'} • ${matchedTask.source_sheet||'-'}${matchedTask.source_row?` • Row ${matchedTask.source_row}`:''}`
          : `Plan dates: ${code} • ${taskName}`
      })
    }

    sync()
    const observer=new MutationObserver(sync)
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    document.addEventListener('change',sync,true)
    document.addEventListener('click',sync,true)
    return()=>{
      observer.disconnect()
      document.removeEventListener('change',sync,true)
      document.removeEventListener('click',sync,true)
      cancelAnimationFrame(frame)
    }
  },[tasks,projectByCode,loaded])

  return <style jsx global>{`
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
