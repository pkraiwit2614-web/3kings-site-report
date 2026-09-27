'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{
    timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false
  }).format(d)+' น.'
}

function latestValue(values:(string|null|undefined)[]){
  return values.filter(Boolean).reduce<string|null>((latest,current)=>{
    const value=String(current)
    return !latest||new Date(value)>new Date(latest)?value:latest
  },null)
}

function findDashboardModule(title:string){
  return [...document.querySelectorAll<HTMLElement>('.dashboard-module')].find(section=>{
    const text=section.querySelector<HTMLElement>('.module-title b')?.textContent?.trim()||''
    return text===title
  })||null
}

export default function RequestedFixes20260927V2(){
  const path=usePathname()
  const [weeklyUpdatedAt,setWeeklyUpdatedAt]=useState<string|null>(null)

  useEffect(()=>{
    document.body.classList.toggle('ui-weekly-v2',path==='/weekly')
    document.body.classList.toggle('ui-defect-v2',path==='/defects')
    return()=>document.body.classList.remove('ui-weekly-v2','ui-defect-v2')
  },[path])

  useEffect(()=>{
    let cancelled=false
    setWeeklyUpdatedAt(null)
    if(path!=='/weekly')return()=>{cancelled=true}
    const load=async()=>{
      try{
        const s=getSupabase()
        const [schedule,report]=await Promise.all([
          s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','schedule').order('created_at',{ascending:false}).limit(1).maybeSingle(),
          s.from('daily_reports').select('created_at').order('created_at',{ascending:false}).limit(1).maybeSingle(),
        ])
        if(!cancelled)setWeeklyUpdatedAt(latestValue([schedule.data?.created_at,report.data?.created_at]))
      }catch{
        if(!cancelled)setWeeklyUpdatedAt(null)
      }
    }
    void load()
    return()=>{cancelled=true}
  },[path])

  useEffect(()=>{
    let stopped=false
    let scrollCompleted=false
    const cleanups:(()=>void)[]=[]

    const patchDashboardTargets=()=>{
      if(path!=='/')return
      const work=findDashboardModule('WORK PROGRESS BY DISCIPLINE')
      if(work){work.id='dashboard-work-progress';work.classList.add('dashboard-deep-target')}
      const defect=findDashboardModule('ABOVE CONDO — HANDOVER / DEFECT STATUS')
      if(defect){defect.id='dashboard-defect';defect.classList.add('dashboard-deep-target')}
    }

    const scrollToRequestedSection=()=>{
      if(path!=='/'||scrollCompleted)return
      patchDashboardTargets()
      const requested=new URLSearchParams(window.location.search).get('section')
      const targetId=requested==='work-progress'?'dashboard-work-progress':requested==='defect'?'dashboard-defect':''
      if(!targetId)return
      const target=document.getElementById(targetId)
      if(!target)return
      scrollCompleted=true
      window.requestAnimationFrame(()=>{
        target.scrollIntoView({behavior:'smooth',block:'start'})
        window.setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),260)
      })
    }

    const patchDefectDashboardLink=()=>{
      if(path!=='/defects')return
      document.querySelectorAll<HTMLAnchorElement>('.page-header a.button').forEach(link=>{
        if(link.textContent?.includes('Dashboard'))link.setAttribute('href','/?section=defect')
      })
    }

    const patchWeeklyHeader=()=>{
      if(path!=='/weekly')return
      const header=document.querySelector<HTMLElement>('.page-header')
      if(!header)return

      ;[...header.children].forEach(el=>{
        if(el instanceof HTMLButtonElement&&!el.closest('.requested-weekly-actions-v2'))el.classList.add('requested-v2-hide')
      })

      let wrap=header.querySelector<HTMLElement>(':scope > .requested-weekly-actions-v2')
      if(!wrap){
        wrap=document.createElement('div')
        wrap.className='requested-weekly-actions-v2'
        wrap.innerHTML=`
          <div class="requested-v2-primary-row">
            <div class="requested-v2-update-meta"><span>ข้อมูลอัปเดต</span><b class="requested-v2-update-value">-</b></div>
            <a class="button requested-v2-main-button" href="/?section=work-progress">Dashboard</a>
          </div>
          <a class="button requested-v2-secondary-button" href="/reports/new">Daily report</a>
          <button type="button" class="button report-print-button requested-v2-print">🖨️ Print</button>
        `
        const print=wrap.querySelector<HTMLButtonElement>('.requested-v2-print')
        print?.addEventListener('click',()=>window.print())
        header.append(wrap)
      }
      const value=wrap.querySelector<HTMLElement>('.requested-v2-update-value')
      const formatted=dateTimeTH(weeklyUpdatedAt)
      if(value&&value.textContent!==formatted)value.textContent=formatted
      const dashboard=wrap.querySelector<HTMLAnchorElement>('a[href*="section=work-progress"]')
      if(dashboard&&dashboard.getAttribute('href')!=='/?section=work-progress')dashboard.setAttribute('href','/?section=work-progress')
    }

    const patch=()=>{
      if(stopped)return
      patchDashboardTargets()
      scrollToRequestedSection()
      patchDefectDashboardLink()
      patchWeeklyHeader()
    }

    patch()
    const observer=new MutationObserver(()=>patch())
    observer.observe(document.body,{subtree:true,childList:true})
    cleanups.push(()=>observer.disconnect())
    ;[80,220,500,900,1500,2400].forEach(ms=>{
      const timer=window.setTimeout(patch,ms)
      cleanups.push(()=>window.clearTimeout(timer))
    })

    return()=>{
      stopped=true
      cleanups.forEach(fn=>fn())
      document.querySelectorAll('.requested-weekly-actions-v2').forEach(el=>el.remove())
      document.querySelectorAll('.requested-v2-hide').forEach(el=>el.classList.remove('requested-v2-hide'))
    }
  },[path,weeklyUpdatedAt])

  return <style jsx global>{`
    .requested-v2-hide{display:none!important}
    .dashboard-deep-target{scroll-margin-top:18px}

    .report-print-button,
    button[data-ui-request$="-print"],
    button[data-ui-request="presentation-print"]{
      min-width:148px!important;
      min-height:38px!important;
      height:38px!important;
      padding:8px 12px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      box-sizing:border-box!important;
      white-space:nowrap!important;
    }

    body.ui-weekly-v2 .weekly-truthful-freshness{display:none!important}
    body.ui-weekly-v2 .ui-polish-header-extra{display:none!important}
    body.ui-weekly-v2 .page-header{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      align-items:start!important;
      gap:12px!important;
    }
    .requested-weekly-actions-v2{
      min-width:166px;
      display:flex;
      flex-direction:column;
      align-items:stretch;
      justify-content:flex-start;
      gap:6px;
    }
    .requested-v2-primary-row{
      display:grid;
      grid-template-columns:auto minmax(148px,1fr);
      align-items:center;
      justify-content:end;
      gap:8px;
    }
    .requested-v2-update-meta{
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      justify-content:center;
      line-height:1.25;
    }
    .requested-v2-update-meta span{font-size:8.5px;color:var(--muted);font-weight:700}
    .requested-v2-update-meta b{font-size:10px;color:var(--navy);font-weight:800;white-space:nowrap}
    .requested-weekly-actions-v2>.button,
    .requested-v2-primary-row>.button{width:100%;text-align:center;justify-content:center;white-space:nowrap}
    .requested-v2-secondary-button,.requested-v2-print{margin-left:auto;width:148px!important}

    body.ui-defect-v2 .page-header-print-actions{
      display:flex!important;
      flex-direction:column!important;
      align-items:flex-end!important;
      gap:6px!important;
    }
    body.ui-defect-v2 .header-actions{
      display:grid!important;
      grid-template-columns:auto minmax(148px,auto)!important;
      gap:6px 8px!important;
      align-items:center!important;
      justify-content:end!important;
    }
    body.ui-defect-v2 .header-actions .update-meta{grid-column:1;grid-row:1;align-items:flex-end!important}
    body.ui-defect-v2 .header-actions .drive-button{grid-column:2;grid-row:1;min-width:148px;text-align:center;justify-content:center}
    body.ui-defect-v2 .header-actions a.button:not(.drive-button){grid-column:2;grid-row:2;min-width:148px;text-align:center;justify-content:center}
    body.ui-defect-v2 .page-header-print-actions>.report-print-button{width:148px!important}

    @media(max-width:900px){
      body.ui-weekly-v2 .page-header{grid-template-columns:1fr!important}
      .requested-weekly-actions-v2{align-items:flex-start;min-width:0}
      .requested-v2-primary-row{grid-template-columns:auto minmax(148px,auto)}
      .requested-v2-update-meta{align-items:flex-start}
      .requested-v2-secondary-button,.requested-v2-print{margin-left:0}
      body.ui-defect-v2 .page-header-print-actions{align-items:flex-start!important}
      body.ui-defect-v2 .header-actions{justify-content:start!important}
      body.ui-defect-v2 .header-actions .update-meta{align-items:flex-start!important}
    }
    @media(max-width:560px){
      .requested-v2-primary-row{grid-template-columns:1fr}
      .requested-v2-update-meta{grid-row:1}
      .requested-v2-main-button{grid-row:2}
      .requested-v2-secondary-button,.requested-v2-print{width:100%!important}
      body.ui-defect-v2 .header-actions{grid-template-columns:1fr!important;width:100%}
      body.ui-defect-v2 .header-actions .update-meta,
      body.ui-defect-v2 .header-actions .drive-button,
      body.ui-defect-v2 .header-actions a.button:not(.drive-button){grid-column:1!important;grid-row:auto!important;width:100%}
    }
  `}</style>
}
