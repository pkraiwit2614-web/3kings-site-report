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

function normalize(value:string|null|undefined){
  return (value||'').replace(/\s+/g,' ').trim().toLowerCase()
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

  useEffect(()=>{
    let frame=0
    const sync=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')
        const grid=slide?.querySelector<HTMLElement>('.ep-info-grid')||null
        if(!slide||!grid)return

        const code=(slide.querySelector<HTMLElement>('.ep-eyebrow')?.textContent||'').split('•')[0].trim()
        const taskName=slide.querySelector<HTMLElement>('h2')?.textContent?.trim()||''
        const headerLine=slide.querySelector<HTMLElement>('header p')?.textContent?.trim()||''
        const areaText=headerLine.split(/\s*[•|]\s*Plan\s+/i)[0]?.trim()||''
        const projectId=projectByCode.get(code)||''

        let candidates=tasks.filter(t=>t.project_id===projectId&&normalize(t.task_name)===normalize(taskName))
        if(candidates.length>1&&areaText){
          const byArea=candidates.filter(t=>normalize(t.area)===normalize(areaText))
          if(byArea.length)candidates=byArea
        }
        if(candidates.length>1){
          candidates=candidates.slice().sort((a,b)=>Number(a.source_row||99999)-Number(b.source_row||99999))
        }
        const task=candidates[0]||null

        // Primary source: planned_start / planned_end synced directly from each Plot's Progress sheet.
        // Header parsing is only a fallback while data is loading or if a task cannot be matched.
        const headerMatch=headerLine.match(/(?:•|\|)\s*Plan\s+(.+?)\s*(?:→|->|–)\s*(.+?)\s*$/i)
        const fallbackStart=headerMatch?.[1]?.trim()||''
        const fallbackEnd=headerMatch?.[2]?.trim()||''
        const start=task?.planned_start?dateTH(task.planned_start):(fallbackStart||(!loaded?'กำลังโหลด…':'ไม่พบวันที่'))
        const end=task?.planned_end?dateTH(task.planned_end):(fallbackEnd||(!loaded?'กำลังโหลด…':'ไม่พบวันที่'))

        const startBox=ensureDateField(grid,'start','เริ่มในแผน',start)
        const endBox=ensureDateField(grid,'end','จบในแผน',end)

        if(task){
          startBox.dataset.progressSource=task.source_file||''
          endBox.dataset.progressSource=task.source_file||''
          startBox.title=`Progress: ${task.source_file||'-'} • ${task.source_sheet||'-'}${task.source_row?` • Row ${task.source_row}`:''}`
          endBox.title=startBox.title
        }

        if(grid.firstElementChild!==startBox)grid.prepend(startBox)
        if(startBox.nextElementSibling!==endBox)startBox.after(endBox)
      })
    }

    sync()
    const observer=new MutationObserver(sync)
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    window.addEventListener('resize',sync)
    return()=>{
      observer.disconnect()
      window.removeEventListener('resize',sync)
      cancelAnimationFrame(frame)
    }
  },[tasks,projectByCode,loaded])

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
      white-space:nowrap!important;
    }
  `}</style>
}
