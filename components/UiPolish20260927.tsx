'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

const PRIVATE_PATHS=new Set(['/photo-mapping','/data-health'])

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

function ensureMeta(host:Element,at:string|null,extra?:{label:string;href:string}){
  let wrap=host.querySelector<HTMLElement>(':scope > .ui-polish-header-extra')
  if(!wrap){
    wrap=document.createElement('div')
    wrap.className='ui-polish-header-extra ui-polish-injected'
    const meta=document.createElement('div')
    meta.className='update-meta ui-polish-update-meta'
    const label=document.createElement('span')
    label.textContent='ข้อมูลอัปเดต'
    const value=document.createElement('b')
    value.className='ui-polish-update-value'
    meta.append(label,value)
    wrap.append(meta)
    if(extra){
      const link=document.createElement('a')
      link.className='button ui-polish-action-link'
      link.href=extra.href
      link.textContent=extra.label
      wrap.append(link)
    }
    host.append(wrap)
  }
  const value=wrap.querySelector<HTMLElement>('.ui-polish-update-value')
  const formatted=dateTimeTH(at)
  if(value&&value.textContent!==formatted)value.textContent=formatted
  const action=wrap.querySelector<HTMLAnchorElement>('.ui-polish-action-link')
  if(extra&&action){
    if(action.getAttribute('href')!==extra.href)action.setAttribute('href',extra.href)
    if(action.textContent!==extra.label)action.textContent=extra.label
  }
  return wrap
}

function headerHost(){
  const header=document.querySelector<HTMLElement>('.page-header')
  if(!header)return null
  return header.querySelector<HTMLElement>('.page-header-print-actions')||header
}

function findByText<T extends Element>(selector:string,text:string){
  return [...document.querySelectorAll<T>(selector)].find(el=>el.textContent?.includes(text))||null
}

export default function UiPolish20260927(){
  const path=usePathname()
  const router=useRouter()
  const [metaAt,setMetaAt]=useState<string|null>(null)

  useLayoutEffect(()=>{
    const privateRoute=PRIVATE_PATHS.has(path)
    document.body.classList.toggle('ui-owner-private-route',privateRoute)
    document.body.classList.toggle('ui-executive-page',path==='/presentation')
    document.body.classList.toggle('ui-dashboard-page',path==='/')
    document.body.classList.toggle('ui-weekly-page',path==='/weekly')
    return()=>{
      document.body.classList.remove('ui-owner-private-route','ui-executive-page','ui-dashboard-page','ui-weekly-page')
    }
  },[path])

  useEffect(()=>{
    let cancelled=false
    const checkOwner=async()=>{
      const s=getSupabase()
      const {data}=await s.auth.getUser()
      if(cancelled)return
      if(!data.user){
        document.body.classList.remove('golf-private-access')
        return
      }
      const {data:profile}=await s.from('profiles').select('full_name,role,active').eq('user_id',data.user.id).maybeSingle()
      if(cancelled)return
      const isOwner=Boolean(profile?.active&&profile?.role==='manager'&&String(profile?.full_name||'').trim().toLowerCase()==='golf')
      document.body.classList.toggle('golf-private-access',isOwner)
      if(PRIVATE_PATHS.has(path)&&!isOwner)router.replace('/')
    }
    void checkOwner()
    return()=>{cancelled=true}
  },[path,router])

  useEffect(()=>{
    let cancelled=false
    setMetaAt(null)
    const load=async()=>{
      const s=getSupabase()
      try{
        if(path==='/'){
          const {data}=await s.from('drive_sync_runs').select('created_at').eq('status','success').order('created_at',{ascending:false}).limit(1).maybeSingle()
          if(!cancelled)setMetaAt(data?.created_at||null)
          return
        }
        if(path==='/schedule'){
          const {data}=await s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','schedule').order('created_at',{ascending:false}).limit(1).maybeSingle()
          if(!cancelled)setMetaAt(data?.created_at||null)
          return
        }
        if(path==='/materials'||path==='/procurement'){
          const {data}=await s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','materials').order('created_at',{ascending:false}).limit(1).maybeSingle()
          if(!cancelled)setMetaAt(data?.created_at||null)
          return
        }
        if(path==='/presentation'){
          const {data}=await s.from('drive_sync_runs').select('created_at,sync_type').eq('status','success').in('sync_type',['schedule','photos']).order('created_at',{ascending:false}).limit(4)
          if(!cancelled)setMetaAt(latestValue((data||[]).map((x:any)=>x.created_at)))
          return
        }
        if(path==='/weekly'){
          const [sync,report]=await Promise.all([
            s.from('drive_sync_runs').select('created_at').eq('status','success').order('created_at',{ascending:false}).limit(1).maybeSingle(),
            s.from('daily_reports').select('created_at').order('created_at',{ascending:false}).limit(1).maybeSingle(),
          ])
          if(!cancelled)setMetaAt(latestValue([sync.data?.created_at,report.data?.created_at]))
        }
      }catch{
        if(!cancelled)setMetaAt(null)
      }
    }
    void load()
    return()=>{cancelled=true}
  },[path])

  useEffect(()=>{
    let scrollDone=false

    const tagDashboardSections=()=>{
      if(path!=='/')return
      const map:Record<string,string>={
        'PLAN vs ACTUAL PROGRESS':'dashboard-plan-actual',
        'PURCHASING FOLLOW-UP':'dashboard-purchasing',
        'MATERIALS STATUS':'dashboard-materials',
        'ABOVE CONDO — HANDOVER / DEFECT STATUS':'dashboard-defect',
      }
      document.querySelectorAll<HTMLElement>('.dashboard-module').forEach(section=>{
        const title=section.querySelector<HTMLElement>('.module-title b')?.textContent?.trim()||''
        const id=map[title]
        if(id){section.id=id;section.classList.add('dashboard-deep-target')}
      })
      if(scrollDone)return
      const requested=new URLSearchParams(window.location.search).get('section')
      const targetId=requested?({
        'plan-actual':'dashboard-plan-actual',
        'purchasing-followup':'dashboard-purchasing',
        'materials':'dashboard-materials',
        'defect':'dashboard-defect',
      } as Record<string,string>)[requested]:''
      if(targetId){
        const target=document.getElementById(targetId)
        if(target){
          scrollDone=true
          window.setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),80)
        }
      }
    }

    const polishDashboard=()=>{
      if(path!=='/')return
      tagDashboardSections()
      const source=findByText<HTMLElement>('.panel','ข้อมูล Dashboard จาก Schedule / Materials / Daily Report')
      if(source)source.classList.add('ui-hidden-dashboard-source')
      const header=document.querySelector<HTMLElement>('.page-header')
      if(header&&!header.querySelector('.management-dashboard-actions')){
        header.classList.add('ui-dashboard-header')
        ensureMeta(header,metaAt,{label:'📷 รูปภาพหน้างาน',href:'/site-photos'})
      }
    }

    const polishSchedule=()=>{
      if(path!=='/schedule')return
      const source=findByText<HTMLElement>('.panel','ข้อมูล Schedule จาก Drive Sync')
      if(source)source.classList.add('ui-hidden-schedule-source')
      const host=headerHost()
      if(host&&!host.querySelector('.management-printable-actions'))ensureMeta(host,metaAt,{label:'← Dashboard',href:'/?section=plan-actual'})
    }

    const polishMaterials=()=>{
      if(path!=='/materials')return
      const host=headerHost()
      if(host&&!host.querySelector('.management-printable-actions'))ensureMeta(host,metaAt,{label:'← Dashboard',href:'/?section=materials'})

      const materials=document.querySelector<HTMLElement>('section[aria-labelledby="materials-status-title"]')
      const tools=document.querySelector<HTMLElement>('section[aria-labelledby="tool-machine-title"]')
      materials?.querySelector('h2')?.classList.add('ui-material-subtitle')
      tools?.querySelector('h2')?.classList.add('ui-material-subtitle')

      if(materials){
        const search=materials.querySelector<HTMLInputElement>('input[aria-label="ค้นหาวัสดุ รุ่น สถานะ หรือหมวด"]')
        const searchPanel=search?.closest<HTMLElement>('.panel')
        const toolbar=materials.querySelector<HTMLElement>('.toolbar')
        searchPanel?.classList.add('ui-filter-group-top')
        toolbar?.classList.add('ui-filter-group-bottom')
        searchPanel?.querySelectorAll<HTMLElement>('b.small').forEach(el=>el.classList.add('ui-hidden'))
        toolbar?.querySelectorAll<HTMLElement>('span').forEach(el=>{if(el.textContent?.includes('ข้อมูล Materials จาก Drive Sync'))el.classList.add('ui-hidden')})
      }
      if(tools){
        const description=[...tools.querySelectorAll<HTMLElement>('.small.muted')].find(el=>el.textContent?.includes('ทะเบียนเครื่องมือและเครื่องจักรจากชีท'))
        if(description&&description.textContent!=='ทะเบียนเครื่องมือและเครื่องจักร')description.textContent='ทะเบียนเครื่องมือและเครื่องจักร'
        const search=tools.querySelector<HTMLInputElement>('input[aria-label="ค้นหาเครื่องมือและเครื่องจักร"]')
        const searchPanel=search?.closest<HTMLElement>('.panel')
        const toolbar=tools.querySelector<HTMLElement>('.toolbar')
        searchPanel?.classList.add('ui-filter-group-top')
        toolbar?.classList.add('ui-filter-group-bottom')
        toolbar?.querySelectorAll<HTMLElement>('span').forEach(el=>{if(el.textContent?.includes('ข้อมูลทะเบียนจาก Drive Sync'))el.classList.add('ui-hidden')})
      }
    }

    const polishDefect=()=>{
      if(path!=='/defects')return
      document.querySelectorAll<HTMLAnchorElement>('.page-header a.button').forEach(a=>{
        if(a.textContent?.includes('Dashboard'))a.setAttribute('href','/?section=defect')
      })
    }

    const polishProcurement=()=>{
      if(path!=='/procurement')return
      const host=headerHost()
      if(host&&!host.querySelector('.management-printable-actions'))ensureMeta(host,metaAt,{label:'← Dashboard',href:'/?section=purchasing-followup'})
      document.querySelectorAll<HTMLElement>('.toolbar .muted.small').forEach(el=>{
        if(el.textContent?.includes('ข้อมูลล่าสุด')){
          const clean=(el.textContent||'').split(' • ข้อมูลล่าสุด')[0]
          if(el.textContent!==clean)el.textContent=clean
        }
      })
    }

    const polishWeekly=()=>{
      if(path!=='/weekly')return
      const header=document.querySelector<HTMLElement>('.page-header')
      if(header){
        header.classList.add('ui-weekly-header')
        const action=[...header.children].find(el=>el instanceof HTMLButtonElement) as HTMLButtonElement|undefined
        let wrap=header.querySelector<HTMLElement>(':scope > .ui-polish-header-extra')
        if(!wrap){
          wrap=document.createElement('div')
          wrap.className='ui-polish-header-extra ui-polish-injected'
          const meta=document.createElement('div')
          meta.className='update-meta ui-polish-update-meta'
          const label=document.createElement('span');label.textContent='ข้อมูลอัปเดต'
          const value=document.createElement('b');value.className='ui-polish-update-value'
          meta.append(label,value);wrap.append(meta)
          if(action)header.insertBefore(wrap,action);else header.append(wrap)
        }
        const value=wrap.querySelector<HTMLElement>('.ui-polish-update-value')
        const formatted=dateTimeTH(metaAt)
        if(value&&value.textContent!==formatted)value.textContent=formatted
      }
      const filterSelect=[...document.querySelectorAll<HTMLSelectElement>('select')].find(s=>[...s.options].some(o=>o.textContent?.includes('ทุก Site / Plot (ภาพรวม)')))
      const filterPanel=filterSelect?.closest<HTMLElement>('.panel')
      const kpis=document.querySelector<HTMLElement>('.schedule-summary-grid')
      if(filterPanel&&kpis&&filterPanel.parentElement===kpis.parentElement&&kpis.nextElementSibling!==filterPanel){
        filterPanel.parentElement?.insertBefore(kpis,filterPanel)
      }
      filterPanel?.classList.add('ui-weekly-filter-panel')
    }

    const polishSitePhotos=()=>{
      if(path!=='/site-photos')return
      document.querySelector<HTMLElement>('.site-photo-footnote')?.classList.add('ui-hidden')
    }

    const polishDataHealth=()=>{
      if(path!=='/data-health')return
      const criteria=findByText<HTMLElement>('.notice.small','เกณฑ์ใช้งาน:')
      criteria?.classList.add('ui-hidden')
    }

    const polishExecutive=()=>{
      if(path!=='/presentation')return
      const header=document.querySelector<HTMLElement>('.page-header')
      if(header){
        header.classList.add('ui-executive-header')
        let wrap=header.querySelector<HTMLElement>(':scope > .ui-polish-header-extra')
        if(!wrap){
          wrap=document.createElement('div')
          wrap.className='ui-polish-header-extra ui-polish-injected ui-executive-actions'
          const meta=document.createElement('div')
          meta.className='update-meta ui-polish-update-meta'
          const label=document.createElement('span');label.textContent='ข้อมูลอัปเดต'
          const value=document.createElement('b');value.className='ui-polish-update-value'
          meta.append(label,value);wrap.append(meta)

          const pdf=document.createElement('button')
          pdf.type='button';pdf.className='button';pdf.textContent='ดาวน์โหลด PDF'
          pdf.addEventListener('click',()=>{
            const buttons=document.querySelectorAll<HTMLButtonElement>('.ep-actions > div:last-child button')
            buttons[0]?.click()
          })
          const ppt=document.createElement('button')
          ppt.type='button';ppt.className='button primary';ppt.textContent='ดาวน์โหลด PowerPoint'
          ppt.addEventListener('click',()=>{
            const buttons=document.querySelectorAll<HTMLButtonElement>('.ep-actions > div:last-child button')
            buttons[1]?.click()
          })
          wrap.append(pdf,ppt);header.append(wrap)
        }
        const value=wrap.querySelector<HTMLElement>('.ui-polish-update-value')
        const formatted=dateTimeTH(metaAt)
        if(value&&value.textContent!==formatted)value.textContent=formatted
      }

      const overview=document.querySelector<HTMLElement>('.ep-overview')
      if(overview){
        const cards=[...overview.querySelectorAll<HTMLElement>(':scope > .ep-card')]
        const common=cards.find(card=>card.textContent?.includes('Above Villa - ส่วนกลาง'))
        const condos=cards.filter(card=>card.classList.contains('condo-card'))
        const condoB=condos.find(card=>card.textContent?.includes('Above Condo B')||card.textContent?.includes('CONDO B'))||condos[1]
        if(common&&condoB&&condoB.nextElementSibling!==common){
          overview.insertBefore(common,condoB.nextElementSibling)
        }
      }
    }

    const polish=()=>{
      polishDashboard();polishSchedule();polishMaterials();polishDefect();polishProcurement();polishWeekly();polishSitePhotos();polishDataHealth();polishExecutive()
    }

    polish()
    const observer=new MutationObserver(()=>polish())
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    const timer=window.setInterval(polish,700)
    return()=>{
      observer.disconnect();window.clearInterval(timer)
      document.querySelectorAll('.ui-polish-injected').forEach(el=>el.remove())
    }
  },[path,metaAt])

  return <style jsx global>{`
    body:not(.golf-private-access) .sidebar a[href="/photo-mapping"],
    body:not(.golf-private-access) .sidebar a[href="/data-health"],
    body:not(.golf-private-access) .mobile-more-links a[href="/photo-mapping"],
    body:not(.golf-private-access) .mobile-more-links a[href="/data-health"]{display:none!important}
    body.ui-owner-private-route:not(.golf-private-access) .main{visibility:hidden}

    .ui-hidden,.ui-hidden-dashboard-source,.ui-hidden-schedule-source{display:none!important}
    .dashboard-deep-target{scroll-margin-top:18px}
    .executive-section-title>span{color:#f2cc79!important}

    .ui-polish-header-extra{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
    .ui-polish-update-meta{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;line-height:1.25;margin-right:2px}
    .ui-polish-update-meta span{font-size:8.5px;color:var(--muted);font-weight:700}
    .ui-polish-update-meta b{font-size:10px;color:var(--navy);font-weight:800;white-space:nowrap}

    .ui-dashboard-header{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto;align-items:start!important}
    .ui-dashboard-header>.ui-polish-header-extra{align-self:start}

    .ui-material-subtitle{font-size:18px!important;line-height:1.25!important}
    .ui-filter-group-top{margin-bottom:0!important;border-radius:14px 14px 0 0!important;box-shadow:none!important;border-bottom:0!important;padding-bottom:7px!important}
    .ui-filter-group-bottom{margin-top:0!important;margin-bottom:14px!important;padding:4px 14px 10px!important;border:1px solid var(--line)!important;border-top:0!important;border-radius:0 0 14px 14px!important;background:var(--surface)!important;box-shadow:var(--shadow)}

    body.ui-executive-page .page-header p{font-size:10px!important;line-height:1.45!important;max-width:780px}
    body.ui-executive-page .ep-actions>div:last-child{display:none!important}
    .ui-executive-header{align-items:flex-start!important}
    .ui-executive-actions{max-width:570px}

    .ui-weekly-header{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto;align-items:start!important}
    .ui-weekly-filter-panel{margin-top:0!important}

    @media(max-width:900px){
      .ui-dashboard-header,.ui-weekly-header{grid-template-columns:minmax(0,1fr) auto!important}
      .ui-dashboard-header>.ui-polish-header-extra,.ui-weekly-header>.ui-polish-header-extra{grid-column:1/-1;justify-content:flex-start}
      .ui-polish-update-meta{align-items:flex-start}
      .ui-executive-header{display:grid!important;grid-template-columns:1fr!important}
      .ui-executive-actions{justify-content:flex-start;max-width:none}
    }
    @media(max-width:760px){
      .ui-polish-header-extra{width:100%;justify-content:flex-start}
      .ui-polish-update-meta{width:100%;align-items:flex-start}
      .ui-filter-group-bottom{display:grid!important;grid-template-columns:1fr 1fr!important}
      .ui-filter-group-bottom select{min-width:0!important}
      .ui-executive-actions .button{flex:1 1 160px}
    }
  `}</style>
}
