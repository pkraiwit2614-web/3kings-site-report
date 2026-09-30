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

function ensureDateField(grid:HTMLElement,key:'start'|'end',label:string,value:string){
  let box=grid.querySelector<HTMLElement>(`[data-plan-date-field="${key}"]`)
  if(!box){
    box=document.createElement('div')
    box.className='ep-plan-date-field'
    box.dataset.planDateField=key
    const span=document.createElement('span')
    const strong=document.createElement('b')
    box.append(span,strong)
    grid.prepend(box)
  }
  const span=box.querySelector('span')
  const strong=box.querySelector('b')
  if(span&&span.textContent!==label)span.textContent=label
  if(strong&&strong.textContent!==value)strong.textContent=value
  return box
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
        const grid=slide?.querySelector<HTMLElement>('.ep-info-grid')||null
        if(!slide||!grid)return

        const code=(slide.querySelector<HTMLElement>('.ep-eyebrow')?.textContent||'').split('•')[0].trim()
        const projectId=projectByCode.get(code)||''

        // Use the exact same date range and task ordering as ExecutivePresentationV41.
        // This avoids fragile matching by task name/area and binds the visible slide 1:1
        // to the same Progress row used to build the presentation.
        const dateInputs=[...document.querySelectorAll<HTMLInputElement>('.ep-filter input[type="date"]')]
        const startDate=dateInputs[0]?.value||'0000-01-01'
        const endDate=dateInputs[1]?.value||'9999-12-31'
        const counter=slide.closest('.ep-stage')?.querySelector<HTMLElement>('.ep-stage-controls span')?.textContent||''
        const counterMatch=counter.match(/(\d+)\s*\/\s*(\d+)/)
        const slideIndex=Math.max(0,(Number(counterMatch?.[1]||1)-1))

        const projectTasks=orderedTasks.filter(t=>t.project_id===projectId&&overlaps(t,startDate,endDate))
        const task=projectTasks[slideIndex]||null

        // The header itself is rendered by ExecutivePresentationV41 from the same
        // currentTask.planned_start / planned_end fields. Keep it as a display fallback
        // so these cards can never remain visually blank while the extra lookup settles.
        const headerLine=slide.querySelector<HTMLElement>('header p')?.textContent?.trim()||''
        const headerPlan=headerLine.match(/Plan\s+(.+?)\s*(?:→|->|–)\s*(.+?)\s*$/i)
        const headerStart=headerPlan?.[1]?.trim()||''
        const headerEnd=headerPlan?.[2]?.trim()||''

        const start=task?.planned_start?dateTH(task.planned_start):(headerStart||(!loaded?'กำลังโหลด…':'ไม่พบวันที่ใน Progress'))
        const end=task?.planned_end?dateTH(task.planned_end):(headerEnd||(!loaded?'กำลังโหลด…':'ไม่พบวันที่ใน Progress'))

        const startBox=ensureDateField(grid,'start','เริ่มในแผน',start)
        const endBox=ensureDateField(grid,'end','จบในแผน',end)

        if(task){
          const source=`Progress: ${task.source_file||'-'} • ${task.source_sheet||'-'}${task.source_row?` • Row ${task.source_row}`:''}`
          startBox.dataset.taskId=task.id
          endBox.dataset.taskId=task.id
          startBox.dataset.progressSource=task.source_file||''
          endBox.dataset.progressSource=task.source_file||''
          startBox.title=source
          endBox.title=source
        }else{
          delete startBox.dataset.taskId
          delete endBox.dataset.taskId
          startBox.title=`ใช้วันที่จาก current Progress slide • ${code} • Slide ${slideIndex+1}`
          endBox.title=startBox.title
        }

        if(grid.firstElementChild!==startBox)grid.prepend(startBox)
        if(startBox.nextElementSibling!==endBox)startBox.after(endBox)
      })
    }

    sync()
    const observer=new MutationObserver(sync)
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    document.addEventListener('change',sync,true)
    window.addEventListener('resize',sync)
    return()=>{
      observer.disconnect()
      document.removeEventListener('change',sync,true)
      window.removeEventListener('resize',sync)
      cancelAnimationFrame(frame)
    }
  },[orderedTasks,projectByCode,loaded])

  return <style jsx global>{`
    .ep-info-grid>.ep-plan-date-field{
      background:#fff8e8!important;
      border-color:#e5cc8e!important;
      border-left:4px solid #b8872e!important;
    }
    .ep-info-grid>.ep-plan-date-field span{
      color:#746d61!important;
      font-weight:900!important;
    }
    .ep-info-grid>.ep-plan-date-field b{
      color:#17243a!important;
      white-space:normal!important;
      overflow-wrap:anywhere!important;
      min-height:18px!important;
    }
  `}</style>
}
