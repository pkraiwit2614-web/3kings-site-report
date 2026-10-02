'use client'

import {useEffect,useRef} from 'react'
import {getSupabase} from '@/lib/supabase'

type ProjectRow={id:string;code:string}
type TaskRow={
  project_id:string
  planned_start:string|null
  planned_end:string|null
  actual_progress:number|null
  source_task_no:string|null
}

function bangkokMonthStart(){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date())
  const year=parts.find(p=>p.type==='year')?.value||''
  const month=parts.find(p=>p.type==='month')?.value||''
  return `${year}-${month}-01`
}

function setReactInputValue(input:HTMLInputElement,value:string){
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set
  if(setter)setter.call(input,value)
  else input.value=value
  input.dispatchEvent(new Event('input',{bubbles:true}))
  input.dispatchEvent(new Event('change',{bubbles:true}))
}

export default function ExecutivePresentationCarryoverGuard(){
  const lastApplied=useRef('')

  useEffect(()=>{
    let cancelled=false
    let frame=0
    const timers:number[]=[]
    let projects:ProjectRow[]=[]
    let tasks:TaskRow[]=[]
    const autoStart=bangkokMonthStart()

    const apply=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if(cancelled)return
        const filter=document.querySelector<HTMLElement>('.ep-filter')
        const inputs=[...document.querySelectorAll<HTMLInputElement>('.ep-filter input[type="date"]')]
        if(!filter||inputs.length<2)return

        const overdueAll=tasks.filter(t=>
          String(t.source_task_no||'').trim()!=='1'&&
          (Number(t.actual_progress)||0)<1&&
          Boolean(t.planned_end)&&
          String(t.planned_end)<autoStart
        )
        const countByProject=new Map<string,number>()
        overdueAll.forEach(t=>countByProject.set(t.project_id,(countByProject.get(t.project_id)||0)+1))
        const labels=projects
          .map(p=>({code:p.code,count:countByProject.get(p.id)||0}))
          .filter(x=>x.count>0&&/^AV-P[6-9]$/.test(x.code))
          .map(x=>`${x.code.replace('AV-','P')} ${x.count}`)
        filter.dataset.carryoverNote=labels.length
          ? `Carryover งานค้างก่อนช่วงเดือน: ${labels.join(' • ')} — เปิด Plot แล้วระบบจะรวมงานค้างให้อัตโนมัติ`
          : ''

        const startInput=inputs[0]
        const currentStart=startInput.value
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')

        if(!slide){
          delete filter.dataset.carryoverActive
          if(currentStart===lastApplied.current&&currentStart!==autoStart){
            lastApplied.current=autoStart
            setReactInputValue(startInput,autoStart)
          }
          return
        }

        const code=(slide.querySelector<HTMLElement>('.ep-eyebrow')?.textContent||'').split('•')[0].trim()
        const project=projects.find(p=>p.code===code)
        if(!project)return

        const canAutoAdjust=currentStart===autoStart||currentStart===lastApplied.current
        if(!canAutoAdjust){
          delete filter.dataset.carryoverActive
          return
        }

        const overdue=overdueAll.filter(t=>t.project_id===project.id)
        if(!overdue.length){
          delete filter.dataset.carryoverActive
          if(currentStart===lastApplied.current&&currentStart!==autoStart){
            lastApplied.current=autoStart
            setReactInputValue(startInput,autoStart)
          }
          return
        }

        const earliest=overdue
          .map(t=>t.planned_start||t.planned_end)
          .filter((v):v is string=>Boolean(v))
          .sort()[0]
        if(!earliest||earliest>=autoStart)return

        filter.dataset.carryoverActive=`${code}: รวม ${overdue.length} งานค้างจากแผนก่อน ${autoStart}`
        if(currentStart===earliest)return

        lastApplied.current=earliest
        setReactInputValue(startInput,earliest)
      })
    }

    const schedule=()=>{
      apply()
      timers.push(window.setTimeout(apply,60))
      timers.push(window.setTimeout(apply,180))
    }

    const load=async()=>{
      const s=getSupabase()
      const [p,t]=await Promise.all([
        s.from('projects').select('id,code').eq('active',true),
        s.from('v_schedule_tasks').select('project_id,planned_start,planned_end,actual_progress,source_task_no')
      ])
      if(cancelled)return
      projects=(p.data||[]) as ProjectRow[]
      tasks=(t.data||[]) as TaskRow[]
      schedule()
      document.addEventListener('click',schedule,true)
      document.addEventListener('change',schedule,true)
    }

    void load()
    return()=>{
      cancelled=true
      document.removeEventListener('click',schedule,true)
      document.removeEventListener('change',schedule,true)
      cancelAnimationFrame(frame)
      timers.forEach(id=>window.clearTimeout(id))
    }
  },[])

  return <style jsx global>{`
    /* Keep carryover date logic, but do not show the overview carryover banner. */
    .ep-filter[data-carryover-note]:not([data-carryover-note=''])::after{
      display:none!important;
    }
    .ep-filter[data-carryover-active]::before{
      content:attr(data-carryover-active);
      display:block;
      margin-bottom:10px;
      padding:8px 10px;
      border-radius:9px;
      border:1px solid #cfdced;
      background:#f2f7fc;
      color:#264b78;
      font-size:11px;
      font-weight:800;
      line-height:1.35;
    }
  `}</style>
}
