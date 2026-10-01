'use client'

import {useEffect,useRef} from 'react'
import {getSupabase} from '@/lib/supabase'
import {dateTH,pct} from '@/lib/format'

type ProjectRow={id:string;code:string}
type TaskRow={
  id:string
  project_id:string
  task_name:string
  area:string|null
  planned_start:string|null
  planned_end:string|null
  imported_plan_progress:number|null
  current_plan_progress:number|null
  actual_progress:number|null
  source_task_no:string|null
}

function norm(value:string|null|undefined){
  return String(value||'').replace(/\s+/g,' ').trim().toLowerCase()
}

function parseHeaderDates(line:string){
  const m=line.match(/Plan\s+(.+?)\s*(?:→|->|–)\s*(.+?)\s*$/i)
  return {start:m?.[1]?.trim()||'',end:m?.[2]?.trim()||''}
}

function parseHeaderArea(line:string){
  const idx=line.indexOf('• Plan')
  return norm(idx>=0?line.slice(0,idx):line)
}

function percentageLabel(value:number){
  const n=Math.round(value*100)
  return `${n>0?'+':''}${n}%`
}

export default function ExecutiveTaskTruthOverlay20261001(){
  const dataRef=useRef<{projects:ProjectRow[];tasks:TaskRow[]}>({projects:[],tasks:[]})

  useEffect(()=>{
    let cancelled=false
    let observer:MutationObserver|null=null
    let frame=0

    const apply=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if(cancelled)return
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')
        const info=slide?.querySelector<HTMLElement>('.ep-task-info')||null
        if(!slide||!info)return

        const code=(slide.querySelector<HTMLElement>('.ep-eyebrow')?.textContent||'').split('•')[0].trim()
        const project=dataRef.current.projects.find(p=>p.code===code)
        if(!project)return

        const taskName=norm(slide.querySelector<HTMLElement>('h2')?.textContent)
        const headerLine=slide.querySelector<HTMLElement>('header p')?.textContent?.trim()||''
        const headerArea=parseHeaderArea(headerLine)
        const headerDates=parseHeaderDates(headerLine)

        let candidates=dataRef.current.tasks.filter(t=>
          t.project_id===project.id&&
          String(t.source_task_no||'').trim()!=='1'&&
          norm(t.task_name)===taskName
        )
        if(candidates.length>1&&headerArea){
          const exactArea=candidates.filter(t=>norm(t.area)===headerArea)
          if(exactArea.length)candidates=exactArea
        }
        if(candidates.length>1&&(headerDates.start||headerDates.end)){
          const exactDates=candidates.filter(t=>
            (!headerDates.start||dateTH(t.planned_start)===headerDates.start)&&
            (!headerDates.end||dateTH(t.planned_end)===headerDates.end)
          )
          if(exactDates.length)candidates=exactDates
        }
        const task=candidates[0]
        if(!task)return

        const plan=Number(task.imported_plan_progress??task.current_plan_progress??0)
        const actual=Number(task.actual_progress??0)
        const variance=actual-plan

        info.dataset.truthTaskId=task.id
        info.dataset.planStart=dateTH(task.planned_start)
        info.dataset.planEnd=dateTH(task.planned_end)

        const cells=[...info.querySelectorAll<HTMLElement>('.ep-info-grid > div')]
        const planCell=cells.find(cell=>norm(cell.querySelector<HTMLElement>('span')?.textContent)==='plan')
        const varianceCell=cells.find(cell=>norm(cell.querySelector<HTMLElement>('span')?.textContent)==='variance')
        if(planCell)planCell.dataset.truthValue=pct(plan)
        if(varianceCell){
          varianceCell.dataset.truthValue=percentageLabel(variance)
          varianceCell.dataset.truthTone=variance<0?'danger':'good'
        }
      })
    }

    const load=async()=>{
      const s=getSupabase()
      const [p,t]=await Promise.all([
        s.from('projects').select('id,code').eq('active',true),
        s.from('v_schedule_tasks').select('id,project_id,task_name,area,planned_start,planned_end,imported_plan_progress,current_plan_progress,actual_progress,source_task_no')
      ])
      if(cancelled)return
      dataRef.current={projects:(p.data||[]) as ProjectRow[],tasks:(t.data||[]) as TaskRow[]}
      apply()
      observer=new MutationObserver(apply)
      observer.observe(document.body,{subtree:true,childList:true,characterData:true})
      document.addEventListener('click',apply,true)
      document.addEventListener('change',apply,true)
    }

    void load()
    return()=>{
      cancelled=true
      observer?.disconnect()
      document.removeEventListener('click',apply,true)
      document.removeEventListener('change',apply,true)
      cancelAnimationFrame(frame)
    }
  },[])

  return <style jsx global>{`
    /* Values below are rendered from one matched Progress task row. We only set
       data attributes; React-owned text nodes are never rewritten. */
    .ep-info-grid>div[data-truth-value]>b{display:none!important}
    .ep-info-grid>div[data-truth-value]::after{
      content:attr(data-truth-value);
      display:block;
      margin-top:2px;
      font-size:15px;
      font-weight:900;
      color:#17243a;
    }
    .ep-info-grid>div[data-truth-tone='danger']::after{color:#a73530!important}
    .ep-info-grid>div[data-truth-tone='good']::after{color:#247951!important}

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
      font-size:14px;
      line-height:1.3;
      font-weight:900;
      display:flex;
      align-items:center;
      order:2!important;
    }
    .ep-task-info[data-plan-start]::before{
      content:'เริ่มในแผน: ' attr(data-plan-start);
      grid-column:1!important;
    }
    .ep-task-info[data-plan-start]::after{
      content:'จบในแผน: ' attr(data-plan-end);
      grid-column:2!important;
    }
    .ep-task-info[data-plan-start]>.ep-info-grid{grid-column:1 / -1!important;order:3!important}
    .ep-task-info[data-plan-start]>.ep-note{grid-column:1 / -1!important;order:4!important}
    .ep-task-info[data-plan-start]>.ep-owner{grid-column:1 / -1!important;order:5!important}

    @media(max-width:620px){
      .ep-task-info[data-plan-start]::before,
      .ep-task-info[data-plan-start]::after{
        min-height:58px;
        padding:9px 10px;
        font-size:13px;
      }
    }
  `}</style>
}
