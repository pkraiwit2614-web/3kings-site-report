'use client'

import {useEffect,useRef} from 'react'
import {usePathname} from 'next/navigation'
import {getSupabase} from '@/lib/supabase'
import {pct} from '@/lib/format'

type ProjectRow={id:string;code:string;name:string}
type TaskRow={
  id:string
  project_id:string
  planned_duration_days:number|null
  planned_start:string|null
  planned_end:string|null
  imported_plan_progress:number|null
  actual_progress:number|null
}
type Metric={plan:number;actual:number;variance:number;count:number}

function weightOf(task:TaskRow){
  const n=Number(task.planned_duration_days)||0
  if(n>0)return n
  if(task.planned_start&&task.planned_end){
    const a=Date.parse(`${task.planned_start}T00:00:00Z`)
    const b=Date.parse(`${task.planned_end}T00:00:00Z`)
    if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a)return Math.max(1,Math.round((b-a)/86400000)+1)
  }
  return 1
}

function metric(rows:TaskRow[]):Metric{
  if(!rows.length)return{plan:0,actual:0,variance:0,count:0}
  let totalWeight=0,planSum=0,actualSum=0
  for(const task of rows){
    const w=weightOf(task)
    totalWeight+=w
    planSum+=w*(Number(task.imported_plan_progress)||0)
    actualSum+=w*(Number(task.actual_progress)||0)
  }
  const plan=totalWeight?planSum/totalWeight:0
  const actual=totalWeight?actualSum/totalWeight:0
  return{plan,actual,variance:actual-plan,count:rows.length}
}

function pctInt(value:number){return Math.max(0,Math.min(100,Math.round(value*100)))}
function setText(el:HTMLElement|null,value:string){if(el&&el.textContent!==value)el.textContent=value}
function setDeltaClass(el:HTMLElement|null,value:number){
  if(!el)return
  el.classList.toggle('danger-text',value<0)
  el.classList.toggle('good-text',value>=0)
}
function setFirstTextNode(el:HTMLElement|null,value:string){
  if(!el)return
  const node=[...el.childNodes].find(n=>n.nodeType===Node.TEXT_NODE)
  if(node){if(node.textContent!==value)node.textContent=value}
  else el.prepend(document.createTextNode(value))
}

export default function ProgressSourceAccuracy20260930(){
  const path=usePathname()
  const dataRef=useRef<{projects:ProjectRow[];tasks:TaskRow[]}>({projects:[],tasks:[]})

  useEffect(()=>{
    // Dashboard only. Presentation now renders one task truth source without any
    // post-render DOM text mutation to avoid React reconciliation crashes.
    if(path!=='/')return
    let cancelled=false
    let observer:MutationObserver|null=null
    let frame=0
    let dashboardApplied=false

    const applyDashboard=()=>{
      const {projects,tasks}=dataRef.current
      if(!projects.length||!tasks.length)return
      const projectMetrics=new Map<string,Metric>()
      projects.forEach(project=>projectMetrics.set(project.id,metric(tasks.filter(t=>t.project_id===project.id))))
      const portfolio=metric(tasks)

      const hero=document.querySelector<HTMLElement>('.executive-kpi.hero')
      if(hero){
        const actual=hero.querySelector<HTMLElement>('b')
        const plan=hero.querySelector<HTMLElement>('small')
        const variance=hero.querySelector<HTMLElement>('em')
        setText(actual,pct(portfolio.actual))
        setText(plan,`Plan ${pct(portfolio.plan)}`)
        if(variance){
          const delta=Math.round(portfolio.variance*100)
          setText(variance,`${delta>0?'+':''}${delta}% variance`)
          setDeltaClass(variance,portfolio.variance)
        }
      }

      document.querySelectorAll<HTMLElement>('.portfolio-bar-row').forEach(row=>{
        const code=row.querySelector<HTMLElement>('div:first-child > b')?.textContent?.trim()||''
        const project=projects.find(p=>p.code===code)
        const m=project?projectMetrics.get(project.id):null
        if(!m)return
        const plan=pctInt(m.plan),actual=pctInt(m.actual),delta=Math.round(m.variance*100)
        const actualBar=row.querySelector<HTMLElement>('.portfolio-track > i')
        const planMark=row.querySelector<HTMLElement>('.portfolio-track > em')
        const actualText=row.querySelector<HTMLElement>('.portfolio-track > strong')
        const meta=row.querySelector<HTMLElement>('.portfolio-bar-meta')
        if(actualBar&&actualBar.style.width!==`${actual}%`)actualBar.style.width=`${actual}%`
        if(planMark&&planMark.style.left!==`${plan}%`)planMark.style.left=`${plan}%`
        setText(actualText,`${actual}%`)
        setText(meta?.querySelector<HTMLElement>('span')||null,`Plan ${plan}%`)
        const deltaText=meta?.querySelector<HTMLElement>('b')||null
        if(deltaText){setText(deltaText,`${delta>0?'+':''}${delta}%`);setDeltaClass(deltaText,m.variance)}
        row.dataset.progressSource='current-file-duration-weighted'
      })

      const projectStatus=[...projectMetrics.entries()].filter(([,m])=>m.count>0).map(([id,m])=>({id,m,status:m.variance>=-.03?'ontrack':m.variance>=-.10?'atrisk':'delayed'}))
      const strip=document.querySelector<HTMLElement>('.portfolio-status-strip')
      if(strip){
        const counts={ontrack:projectStatus.filter(x=>x.status==='ontrack').length,atrisk:projectStatus.filter(x=>x.status==='atrisk').length,delayed:projectStatus.filter(x=>x.status==='delayed').length}
        const buttons=[...strip.querySelectorAll<HTMLElement>('button')]
        const values=[counts.ontrack,counts.atrisk,counts.delayed]
        buttons.slice(0,3).forEach((button,index)=>setFirstTextNode(button.querySelector<HTMLElement>('strong'),`${values[index]} `))
      }
    }

    const apply=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if(cancelled||dashboardApplied)return
        applyDashboard()
        if(document.querySelector('.executive-kpi.hero')){
          dashboardApplied=true
          observer?.disconnect()
        }
      })
    }

    const load=async()=>{
      const s=getSupabase()
      const [p,t]=await Promise.all([
        s.from('projects').select('id,code,name').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('id,project_id,planned_duration_days,planned_start,planned_end,imported_plan_progress,actual_progress')
      ])
      if(cancelled)return
      dataRef.current={projects:(p.data||[]) as ProjectRow[],tasks:(t.data||[]) as TaskRow[]}
      apply()
      if(dashboardApplied)return
      observer=new MutationObserver(apply)
      observer.observe(document.body,{subtree:true,childList:true})
    }

    void load()
    return()=>{
      cancelled=true
      observer?.disconnect()
      cancelAnimationFrame(frame)
    }
  },[path])

  return null
}
