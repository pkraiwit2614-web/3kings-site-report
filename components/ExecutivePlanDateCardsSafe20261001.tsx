'use client'

import {useEffect} from 'react'

function readPlanDates(line:string){
  const match=line.match(/Plan\s+(.+?)\s*(?:→|->|–)\s*(.+?)\s*$/i)
  return {start:match?.[1]?.trim()||'',end:match?.[2]?.trim()||''}
}

export default function ExecutivePlanDateCardsSafe20261001(){
  useEffect(()=>{
    let disposed=false
    let frame=0
    const timers:number[]=[]

    const apply=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if(disposed)return
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')
        const info=slide?.querySelector<HTMLElement>('.ep-task-info')||null
        if(!slide||!info)return
        const line=slide.querySelector<HTMLElement>('header p')?.textContent?.trim()||''
        const dates=readPlanDates(line)
        if(!dates.start||!dates.end)return
        info.dataset.planStart=dates.start
        info.dataset.planEnd=dates.end
      })
    }

    const schedule=()=>{
      apply()
      timers.push(window.setTimeout(apply,60))
      timers.push(window.setTimeout(apply,180))
    }

    schedule()
    document.addEventListener('click',schedule,true)
    document.addEventListener('change',schedule,true)
    window.addEventListener('keydown',schedule,true)

    return()=>{
      disposed=true
      document.removeEventListener('click',schedule,true)
      document.removeEventListener('change',schedule,true)
      window.removeEventListener('keydown',schedule,true)
      cancelAnimationFrame(frame)
      timers.forEach(id=>window.clearTimeout(id))
    }
  },[])

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
