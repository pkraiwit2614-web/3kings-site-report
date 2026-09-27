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

function directChild<T extends Element>(host:Element,selector:string){
  return [...host.children].find(el=>el.matches(selector)) as T|undefined
}

function ensureActionLink(wrap:HTMLElement,key:string,label:string,href:string,className='button'){
  let link=wrap.querySelector<HTMLAnchorElement>(`:scope > [data-ui-request="${key}"]`)
  if(!link){
    link=document.createElement('a')
    link.dataset.uiRequest=key
    link.className=className
    wrap.append(link)
  }
  if(link.textContent!==label)link.textContent=label
  if(link.getAttribute('href')!==href)link.setAttribute('href',href)
  return link
}

function ensurePrintButton(wrap:HTMLElement,key:string,onPrint:()=>void){
  let button=wrap.querySelector<HTMLButtonElement>(`:scope > [data-ui-request="${key}"]`)
  if(!button){
    button=document.createElement('button')
    button.type='button'
    button.dataset.uiRequest=key
    button.className='button report-print-button'
    button.addEventListener('click',onPrint)
    wrap.append(button)
  }
  if(button.textContent!=='🖨️ Print')button.textContent='🖨️ Print'
  return button
}

function existingPolishWrap(){
  return document.querySelector<HTMLElement>('.page-header > .ui-polish-header-extra, .page-header-print-actions > .ui-polish-header-extra')
}

export default function UiRequestedChanges20260927(){
  const path=usePathname()
  const [projectMetaAt,setProjectMetaAt]=useState<string|null>(null)

  useEffect(()=>{
    let cancelled=false
    setProjectMetaAt(null)
    if(!path.startsWith('/projects/'))return()=>{cancelled=true}
    const projectId=decodeURIComponent(path.split('/')[2]||'')
    if(!projectId)return()=>{cancelled=true}

    const load=async()=>{
      try{
        const s=getSupabase()
        const {data:project}=await s.from('projects').select('code').eq('id',projectId).maybeSingle()
        const code=project?.code||''
        const [schedule,report,photo]=await Promise.all([
          code?s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','schedule').eq('project_code',code).order('created_at',{ascending:false}).limit(1).maybeSingle():Promise.resolve({data:null}),
          s.from('daily_reports').select('created_at').eq('project_id',projectId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
          code?s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','photos').eq('project_code',code).order('created_at',{ascending:false}).limit(1).maybeSingle():Promise.resolve({data:null}),
        ])
        if(!cancelled)setProjectMetaAt(latestValue([schedule.data?.created_at,report.data?.created_at,photo.data?.created_at]))
      }catch{
        if(!cancelled)setProjectMetaAt(null)
      }
    }
    void load()
    return()=>{cancelled=true}
  },[path])

  useEffect(()=>{
    const polishDashboard=()=>{
      if(path!=='/')return
      const header=document.querySelector<HTMLElement>('.page-header')
      const wrap=header?.querySelector<HTMLElement>(':scope > .ui-polish-header-extra')
      if(!header||!wrap)return

      wrap.classList.add('ui-request-vertical')
      const originalDaily=[...header.children].find(el=>el instanceof HTMLAnchorElement&&el.getAttribute('href')==='/reports/new') as HTMLAnchorElement|undefined
      if(originalDaily)originalDaily.classList.add('ui-request-hidden')

      const photo=wrap.querySelector<HTMLAnchorElement>(':scope > a[href="/site-photos"]')
      const daily=ensureActionLink(wrap,'dashboard-daily','+ รายงานประจำวัน','/reports/new','button primary')
      if(photo&&daily.nextElementSibling!==photo)wrap.insertBefore(daily,photo)
    }

    const polishStandardPrintable=()=>{
      const routeMap:Record<string,string>={
        '/schedule':'/?section=plan-actual',
        '/materials':'/?section=materials',
        '/procurement':'/?section=purchasing-followup',
      }
      const href=routeMap[path]
      if(!href)return
      const host=document.querySelector<HTMLElement>('.page-header-print-actions')
      const wrap=host?.querySelector<HTMLElement>(':scope > .ui-polish-header-extra')
      if(!host||!wrap)return

      wrap.classList.add('ui-request-vertical')
      directChild<HTMLButtonElement>(host,'.report-print-button')?.classList.add('ui-request-hidden')
      const dashboard=wrap.querySelector<HTMLAnchorElement>(':scope > .ui-polish-action-link')
      if(dashboard&&dashboard.getAttribute('href')!==href)dashboard.setAttribute('href',href)
      ensurePrintButton(wrap,`${path}-print`,()=>window.print())
    }

    const polishDefect=()=>{
      if(path!=='/defects')return
      document.querySelectorAll<HTMLAnchorElement>('.page-header a.button').forEach(link=>{
        if(link.textContent?.includes('Dashboard')&&link.getAttribute('href')!=='/?section=defect')link.setAttribute('href','/?section=defect')
      })
    }

    const polishWeekly=()=>{
      if(path!=='/weekly')return
      const header=document.querySelector<HTMLElement>('.page-header')
      const wrap=header?.querySelector<HTMLElement>(':scope > .ui-polish-header-extra')
      if(!header||!wrap)return
      wrap.classList.add('ui-request-vertical')

      const oldPrint=[...header.children].find(el=>el instanceof HTMLButtonElement) as HTMLButtonElement|undefined
      if(oldPrint)oldPrint.classList.add('ui-request-hidden')
      ensureActionLink(wrap,'weekly-daily','Daily report','/reports/new','button')
      ensurePrintButton(wrap,'weekly-print',()=>window.print())
    }

    const polishProject=()=>{
      if(!path.startsWith('/projects/'))return
      const header=document.querySelector<HTMLElement>('.page-header')
      const row=header?.querySelector<HTMLElement>(':scope > .row')
      if(!header||!row)return

      let meta=row.querySelector<HTMLElement>(':scope > .ui-request-project-meta')
      if(!meta){
        meta=document.createElement('div')
        meta.className='update-meta ui-request-project-meta'
        const label=document.createElement('span');label.textContent='ข้อมูลอัปเดต'
        const value=document.createElement('b');value.className='ui-request-project-update-value'
        meta.append(label,value)
        row.insertBefore(meta,row.firstChild)
      }
      const value=meta.querySelector<HTMLElement>('.ui-request-project-update-value')
      const formatted=dateTimeTH(projectMetaAt)
      if(value&&value.textContent!==formatted)value.textContent=formatted

      row.querySelectorAll<HTMLAnchorElement>('a').forEach(link=>{
        if(link.textContent?.includes('รูปความคืบหน้า')&&link.textContent!=='รูปภาพหน้างาน ↗')link.textContent='รูปภาพหน้างาน ↗'
      })
      const print=[...row.querySelectorAll<HTMLButtonElement>('button')].find(button=>/พิมพ์ PDF Plot|Print/.test(button.textContent||''))
      if(print){
        if(print.textContent!=='🖨️ Print')print.textContent='🖨️ Print'
        print.classList.add('report-print-button')
        print.classList.remove('primary')
      }
    }

    const polishExecutiveHeader=()=>{
      if(path!=='/presentation')return
      const wrap=document.querySelector<HTMLElement>('.page-header > .ui-polish-header-extra')||existingPolishWrap()
      if(!wrap)return
      wrap.classList.add('ui-request-exec-ready')

      const oldButtons=[...wrap.querySelectorAll<HTMLButtonElement>(':scope > button')].filter(button=>!button.dataset.uiRequest)
      oldButtons.forEach(button=>button.remove())

      let ppt=wrap.querySelector<HTMLButtonElement>(':scope > [data-ui-request="presentation-ppt"]')
      if(!ppt){
        ppt=document.createElement('button')
        ppt.type='button';ppt.dataset.uiRequest='presentation-ppt';ppt.className='button primary';ppt.textContent='ดาวน์โหลด PowerPoint'
        ppt.addEventListener('click',()=>{
          const buttons=document.querySelectorAll<HTMLButtonElement>('.ep-actions > div:last-child button')
          buttons[1]?.click()
        })
        wrap.append(ppt)
      }
      ensurePrintButton(wrap,'presentation-print',()=>{
        const buttons=document.querySelectorAll<HTMLButtonElement>('.ep-actions > div:last-child button')
        if(buttons[0])buttons[0].click();else window.print()
      })
    }

    const polishExecutiveCards=()=>{
      if(path!=='/presentation')return
      document.querySelectorAll<HTMLElement>('.ep-overview > .ep-card').forEach(card=>{
        const name=card.querySelector<HTMLElement>('.ep-cover-title b')?.textContent||''
        if(!name.includes('ส่วนกลาง')&&!/proud/i.test(name))return
        const noSchedule=card.querySelector<HTMLElement>('.ep-no-schedule')
        const message=noSchedule?.querySelector<HTMLElement>(':scope > b')
        message?.classList.add('ui-request-hidden')
        if(noSchedule&&!noSchedule.querySelector('a'))noSchedule.classList.add('ui-request-hidden')
      })
    }

    const polishExecutiveSlide=()=>{
      if(path!=='/presentation')return
      const slide=document.querySelector<HTMLElement>('.ep-slide')
      if(!slide)return

      const subtitle=slide.querySelector<HTMLElement>(':scope > header p')
      if(subtitle?.textContent?.includes(' • Plan ')){
        const clean=subtitle.textContent.split(' • Plan ')[0]
        if(subtitle.textContent!==clean)subtitle.textContent=clean
      }

      const progress=slide.querySelector<HTMLElement>('.ep-progress')
      const grid=slide.querySelector<HTMLElement>('.ep-info-grid')
      if(!progress||!grid)return
      const cells=[...grid.children].filter(el=>el instanceof HTMLElement) as HTMLElement[]
      if(cells.length<4)return

      cells[0].classList.add('ui-ep-moved-metric')
      cells[1].classList.add('ui-ep-moved-metric')
      let primary=progress.querySelector<HTMLElement>(':scope > .ui-ep-primary-metrics')
      if(!primary){
        primary=document.createElement('div')
        primary.className='ui-ep-primary-metrics'
        progress.append(primary)
      }
      const metrics=[cells[0],cells[1]].map(cell=>({
        label:cell.querySelector('span')?.textContent||'',
        value:cell.querySelector('b')?.textContent||'—',
        danger:cell.querySelector('b')?.classList.contains('danger-text')||false,
      }))
      const signature=metrics.map(x=>`${x.label}:${x.value}:${x.danger}`).join('|')
      if(primary.dataset.signature!==signature){
        primary.dataset.signature=signature
        primary.replaceChildren(...metrics.map(metric=>{
          const item=document.createElement('div')
          const label=document.createElement('span');label.textContent=metric.label
          const value=document.createElement('b');value.textContent=metric.value
          if(metric.danger)value.classList.add('danger-text')
          item.append(label,value)
          return item
        }))
      }

      const delayCell=cells[2]
      const delayText=delayCell.querySelector('b')?.textContent||''
      const delay=Number.parseInt(delayText,10)
      delayCell.classList.toggle('ui-delay-red',Number.isFinite(delay)&&delay>7)
      delayCell.classList.toggle('ui-delay-yellow',Number.isFinite(delay)&&delay>=1&&delay<=6)
    }

    const polish=()=>{
      polishDashboard()
      polishStandardPrintable()
      polishDefect()
      polishWeekly()
      polishProject()
      polishExecutiveHeader()
      polishExecutiveCards()
      polishExecutiveSlide()
    }

    polish()
    const observer=new MutationObserver(()=>polish())
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    const timer=window.setInterval(polish,700)
    return()=>{
      observer.disconnect()
      window.clearInterval(timer)
      document.querySelectorAll('[data-ui-request], .ui-request-project-meta').forEach(el=>el.remove())
      document.querySelectorAll('.ui-request-hidden').forEach(el=>el.classList.remove('ui-request-hidden'))
      document.querySelectorAll('.ui-request-vertical,.ui-request-exec-ready,.ui-ep-moved-metric,.ui-delay-red,.ui-delay-yellow').forEach(el=>el.classList.remove('ui-request-vertical','ui-request-exec-ready','ui-ep-moved-metric','ui-delay-red','ui-delay-yellow'))
    }
  },[path,projectMetaAt])

  return <style jsx global>{`
    .ui-request-hidden{display:none!important}

    body.ui-dashboard-page .executive-section-title>span{
      width:28px!important;height:28px!important;font-size:14px!important;
      color:#1f5f9c!important;background:#fff!important
    }

    .ui-request-vertical{
      display:flex!important;flex-direction:column!important;align-items:stretch!important;
      justify-content:flex-start!important;gap:6px!important;min-width:148px
    }
    .ui-request-vertical .ui-polish-update-meta{align-items:flex-end!important;margin:0 0 1px!important}
    .ui-request-vertical>.button{width:100%;text-align:center;justify-content:center;white-space:nowrap}

    .ui-request-project-meta{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;line-height:1.25;margin-right:2px}
    .ui-request-project-meta span{font-size:8.5px;color:var(--muted);font-weight:700}
    .ui-request-project-meta b{font-size:10px;color:var(--navy);font-weight:800;white-space:nowrap}

    .ui-request-exec-ready{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important}
    .ui-request-exec-ready .ui-polish-update-meta{align-items:flex-end!important}

    body.ui-executive-page .ep-slide h2{font-size:38px!important;line-height:1.12!important}
    body.ui-executive-page .ep-progress>b{font-size:32px!important;line-height:1.1!important;margin-top:3px}
    body.ui-executive-page .ep-note span{font-size:11px!important}
    body.ui-executive-page .ep-note p{font-size:15px!important;line-height:1.48!important}

    .ui-ep-primary-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}
    .ui-ep-primary-metrics>div{padding:8px 9px;border:1px solid #ddd5c7;border-radius:9px;background:#fffdf8}
    .ui-ep-primary-metrics span{display:block;font-size:9px;color:#7a705f;font-weight:900}
    .ui-ep-primary-metrics b{display:block;font-size:14px;color:#17243a;margin-top:2px}
    .ui-ep-moved-metric{display:none!important}

    .ep-info-grid>div.ui-delay-red{background:#fff2f1!important;border-color:#edcac6!important}
    .ep-info-grid>div.ui-delay-red span,.ep-info-grid>div.ui-delay-red b{color:#b23c36!important}
    .ep-info-grid>div.ui-delay-yellow{background:#fff8e7!important;border-color:#ead8a4!important}
    .ep-info-grid>div.ui-delay-yellow span,.ep-info-grid>div.ui-delay-yellow b{color:#96630d!important}

    @media(min-width:821px){
      .ep-stage:fullscreen .ep-slide h2{font-size:clamp(30px,4.2vh,42px)!important}
      .ep-stage:fullscreen .ep-progress>b{font-size:clamp(24px,3.15vh,32px)!important}
      .ep-stage:fullscreen .ep-note span{font-size:clamp(10px,1.15vh,12px)!important}
      .ep-stage:fullscreen .ep-note p{font-size:clamp(12px,1.55vh,15px)!important;line-height:1.36!important}
      .ep-stage:fullscreen .ui-ep-primary-metrics{margin-top:7px;gap:5px}
      .ep-stage:fullscreen .ui-ep-primary-metrics>div{padding:5px 7px}
      .ep-stage:fullscreen .ui-ep-primary-metrics b{font-size:clamp(11px,1.45vh,14px)}
    }

    @media(max-width:900px){
      .ui-request-vertical{min-width:0;align-items:flex-start!important}
      .ui-request-vertical .ui-polish-update-meta,.ui-request-project-meta{align-items:flex-start!important}
      .ui-request-exec-ready{justify-content:flex-start!important;flex-wrap:wrap}
    }
    @media(max-width:760px){
      .ui-request-project-meta{width:100%}
      body.ui-executive-page .ep-slide h2{font-size:30px!important}
      body.ui-executive-page .ep-progress>b{font-size:27px!important}
    }
  `}</style>
}
