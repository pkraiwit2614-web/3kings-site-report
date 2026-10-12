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

    /* Scoped to the Presentation task slides: render heading and date at distinct sizes.
       The legacy pseudo-cards are suppressed only where the real cards are present. */
    .ep-task-info:has(>.ep-plan-pair){
      grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
    }
    .ep-task-info:has(>.ep-plan-pair)::before,
    .ep-task-info:has(>.ep-plan-pair)::after{content:none!important;display:none!important}
    .ep-task-info>.ep-plan-pair{
      grid-column:1 / -1!important;order:2!important;
      display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0;
    }
    .ep-task-info .ep-plan-card{
      display:flex;flex-direction:column;justify-content:center;gap:3px;
      min-width:0;min-height:58px;box-sizing:border-box;
      padding:9px 11px;border:1px solid #e5cc8e;border-left:4px solid #b8872e;
      border-radius:10px;background:#fff8e8;color:#17243a;
    }
    .ep-task-info .ep-plan-card>span{
      display:block;font-size:12px;line-height:1.25;font-weight:900;
    }
    .ep-task-info .ep-plan-card>time{
      display:block;font-size:11px;line-height:1.3;font-weight:700;overflow-wrap:anywhere;
    }

    @media(max-width:620px){
      .ep-task-info .ep-plan-card{min-height:52px;padding:8px 9px}
      .ep-task-info .ep-plan-card>span{font-size:11.5px}
      .ep-task-info .ep-plan-card>time{font-size:10.5px}
      .ep-task-info[data-plan-start]::before,
      .ep-task-info[data-plan-start]::after{
        min-height:58px;
        padding:9px 10px;
        font-size:13px;
      }
    }
  `}</style>
}
