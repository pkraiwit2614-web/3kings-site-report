'use client'

import {useEffect,useRef} from 'react'
import {usePathname} from 'next/navigation'
import {getSupabase} from '@/lib/supabase'
import {dateTH,pct} from '@/lib/format'

type ProjectRow={id:string;code:string;name:string}
type TaskRow={
  id:string
  project_id:string
  source_task_no:string|null
  category:string|null
  task_name:string
  area:string|null
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
function overlaps(task:TaskRow,start:string,end:string){
  if(!task.planned_start&&!task.planned_end)return false
  const s=task.planned_start||task.planned_end||''
  const e=task.planned_end||task.planned_start||''
  return s<=end&&e>=start
}
function setText(el:HTMLElement|null,value:string){
  if(el&&el.textContent!==value)el.textContent=value
}
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
    if(path!=='/'&&path!=='/presentation')return
    let cancelled=false
    let observer:MutationObserver|null=null
    let frame=0

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
        const planText=meta?.querySelector<HTMLElement>('span')||null
        const deltaText=meta?.querySelector<HTMLElement>('b')||null
        setText(planText,`Plan ${plan}%`)
        if(deltaText){setText(deltaText,`${delta>0?'+':''}${delta}%`);setDeltaClass(deltaText,m.variance)}
        if(row.dataset.progressSource!=='current-file-duration-weighted')row.dataset.progressSource='current-file-duration-weighted'
      })

      const projectStatus=[...projectMetrics.entries()].filter(([,m])=>m.count>0).map(([id,m])=>({id,m,status:m.variance>=-.03?'ontrack':m.variance>=-.10?'atrisk':'delayed'}))
      const strip=document.querySelector<HTMLElement>('.portfolio-status-strip')
      if(strip){
        const counts={ontrack:projectStatus.filter(x=>x.status==='ontrack').length,atrisk:projectStatus.filter(x=>x.status==='atrisk').length,delayed:projectStatus.filter(x=>x.status==='delayed').length}
        const buttons=[...strip.querySelectorAll<HTMLElement>('button')]
        const values=[counts.ontrack,counts.atrisk,counts.delayed]
        buttons.slice(0,3).forEach((button,index)=>setFirstTextNode(button.querySelector<HTMLElement>('strong'),`${values[index]} `))
      }

      const modules=[...document.querySelectorAll<HTMLElement>('.dashboard-module')]
      const discipline=modules.find(module=>module.querySelector<HTMLElement>('.module-title b')?.textContent?.includes('WORK PROGRESS BY DISCIPLINE'))
      if(discipline){
        const projectId=discipline.querySelector<HTMLSelectElement>('select')?.value||''
        const base=tasks.filter(t=>String(t.source_task_no||'').trim()!=='1'&&(!projectId||t.project_id===projectId))
        discipline.querySelectorAll<HTMLElement>('.discipline-row').forEach(row=>{
          const category=row.querySelector<HTMLElement>('div:first-child > b')?.textContent?.trim()||''
          const m=metric(base.filter(t=>(t.category||'ไม่ระบุหมวด')===category))
          if(!m.count)return
          const plan=pctInt(m.plan),actual=pctInt(m.actual),delta=Math.round(m.variance*100)
          const bars=[...row.querySelectorAll<HTMLElement>('.discipline-bars span > i')]
          if(bars[0]&&bars[0].style.width!==`${plan}%`)bars[0].style.width=`${plan}%`
          if(bars[1]&&bars[1].style.width!==`${actual}%`)bars[1].style.width=`${actual}%`
          const value=row.querySelector<HTMLElement>('div:last-child > b')
          const deltaEl=row.querySelector<HTMLElement>('div:last-child > small')
          setText(value,`${actual}%`)
          if(deltaEl){setText(deltaEl,`Δ ${delta>0?'+':''}${delta}%`);setDeltaClass(deltaEl,m.variance)}
        })
      }
    }

    const applyPresentation=()=>{
      const {projects,tasks}=dataRef.current
      if(!projects.length||!tasks.length)return
      const dateInputs=[...document.querySelectorAll<HTMLInputElement>('.ep-filter input[type="date"]')]
      const start=dateInputs[0]?.value||'0000-01-01'
      const end=dateInputs[1]?.value||'9999-12-31'
      const period=tasks.filter(t=>String(t.source_task_no||'').trim()!=='1'&&overlaps(t,start,end))

      document.querySelectorAll<HTMLElement>('.ep-overview .ep-card:not(.condo-card)').forEach(card=>{
        const name=card.querySelector<HTMLElement>('.ep-cover-title b')?.textContent?.trim()||''
        const project=projects.find(p=>p.name===name)
        if(!project)return
        const m=metric(period.filter(t=>t.project_id===project.id))
        if(!m.count)return
        const values=[...card.querySelectorAll<HTMLElement>('.ep-kpis > div > b')]
        setText(values[0]||null,pct(m.actual))
        setText(values[1]||null,pct(m.plan))
        if(values[2]){
          const delta=Math.round(m.variance*100)
          setText(values[2],`${delta>0?'+':''}${delta}%`)
          setDeltaClass(values[2],m.variance)
        }
        if(card.dataset.progressSource!=='current-file-duration-weighted')card.dataset.progressSource='current-file-duration-weighted'
      })

      const info=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide) .ep-task-info')
      if(!info)return
      const taskId=info.dataset.planTaskId||''
      let task=tasks.find(t=>t.id===taskId)
      if(!task){
        const slide=info.closest<HTMLElement>('.ep-slide')
        const code=(slide?.querySelector<HTMLElement>('.ep-eyebrow')?.textContent||'').split('•')[0].trim()
        const project=projects.find(p=>p.code===code)
        const taskName=slide?.querySelector<HTMLElement>('h2')?.textContent?.trim()||''
        task=tasks.find(t=>t.project_id===project?.id&&t.task_name===taskName)
      }
      if(!task)return

      const startLabel=dateTH(task.planned_start)
      const endLabel=dateTH(task.planned_end)
      if(info.dataset.planStart!==startLabel)info.dataset.planStart=startLabel
      if(info.dataset.planEnd!==endLabel)info.dataset.planEnd=endLabel
      if(info.dataset.planTaskId!==task.id)info.dataset.planTaskId=task.id
      if(info.dataset.planSource!=='Current Progress file')info.dataset.planSource='Current Progress file'

      const cells=[...info.querySelectorAll<HTMLElement>('.ep-info-grid > div')]
      const planCell=cells.find(cell=>cell.querySelector<HTMLElement>('span')?.textContent?.trim()==='Plan')
      const varianceCell=cells.find(cell=>cell.querySelector<HTMLElement>('span')?.textContent?.trim()==='Variance')
      const plan=Number(task.imported_plan_progress)||0
      const actual=Number(task.actual_progress)||0
      const variance=actual-plan
      const planValue=planCell?.querySelector<HTMLElement>('b')||null
      const varianceValue=varianceCell?.querySelector<HTMLElement>('b')||null
      setText(planValue,pct(plan))
      if(varianceValue){
        const delta=Math.round(variance*100)
        setText(varianceValue,`${delta>0?'+':''}${delta}%`)
        setDeltaClass(varianceValue,variance)
      }
    }

    const apply=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if(cancelled)return
        if(path==='/')applyDashboard()
        if(path==='/presentation')applyPresentation()
      })
    }

    const load=async()=>{
      const s=getSupabase()
      const [p,t]=await Promise.all([
        s.from('projects').select('id,code,name').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('id,project_id,source_task_no,category,task_name,area,planned_duration_days,planned_start,planned_end,imported_plan_progress,actual_progress')
      ])
      if(cancelled)return
      dataRef.current={projects:(p.data||[]) as ProjectRow[],tasks:(t.data||[]) as TaskRow[]}
      apply()
      observer=new MutationObserver(apply)
      observer.observe(document.body,{subtree:true,childList:true})
      document.addEventListener('change',apply,true)
      document.addEventListener('click',apply,true)
    }

    void load()
    return()=>{
      cancelled=true
      observer?.disconnect()
      document.removeEventListener('change',apply,true)
      document.removeEventListener('click',apply,true)
      cancelAnimationFrame(frame)
    }
  },[path])

  return null
}
