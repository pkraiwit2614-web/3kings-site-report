'use client'

import { useEffect, useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'

const STANDARD_PRINTABLE_PATHS=new Set<string>()
const NATIVE_PRINTABLE_PATHS=new Set(['/schedule','/materials','/procurement'])

export default function HeaderLayoutFix20260927(){
  const path=usePathname()

  useLayoutEffect(()=>{
    document.body.classList.toggle('ui-standard-printable-header-fix',STANDARD_PRINTABLE_PATHS.has(path))
    document.body.classList.toggle('ui-native-printable-header-fix',NATIVE_PRINTABLE_PATHS.has(path))
    document.body.classList.toggle('ui-native-dashboard-header-fix',path==='/')
    document.body.classList.toggle('ui-project-header-fix',path.startsWith('/projects/'))
    document.body.classList.toggle('ui-defect-header-fix',path==='/defects')
    return()=>{
      document.body.classList.remove('ui-standard-printable-header-fix','ui-native-printable-header-fix','ui-native-dashboard-header-fix','ui-project-header-fix','ui-defect-header-fix')
    }
  },[path])

  useEffect(()=>{
    let stopped=false

    const patchProjectHeader=()=>{
      if(!path.startsWith('/projects/'))return
      const row=document.querySelector<HTMLElement>('.page-header > .row')
      if(!row)return
      row.classList.add('ui-project-header-actions')

      row.querySelectorAll<HTMLAnchorElement>('a').forEach(link=>{
        const text=(link.textContent||'').trim()
        link.classList.toggle('ui-project-weekly-action',text.includes('รายงานประจำสัปดาห์'))
        link.classList.toggle('ui-project-photo-action',text.includes('รูปภาพหน้างาน')||text.includes('รูปความคืบหน้า'))
      })

      row.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{
        const text=(button.textContent||'').trim()
        button.classList.toggle('ui-project-print-action',/Print|พิมพ์ PDF Plot/.test(text))
      })
    }

    const patch=()=>{
      if(stopped)return
      patchProjectHeader()
    }

    patch()
    const observer=new MutationObserver(()=>patch())
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    const timer=window.setInterval(patch,700)

    return()=>{
      stopped=true
      observer.disconnect()
      window.clearInterval(timer)
      document.querySelectorAll('.ui-project-header-actions').forEach(el=>el.classList.remove('ui-project-header-actions'))
      document.querySelectorAll('.ui-project-weekly-action').forEach(el=>el.classList.remove('ui-project-weekly-action'))
      document.querySelectorAll('.ui-project-photo-action').forEach(el=>el.classList.remove('ui-project-photo-action'))
      document.querySelectorAll('.ui-project-print-action').forEach(el=>el.classList.remove('ui-project-print-action'))
    }
  },[path])

  return <style jsx global>{`
    /* Schedule / Materials / Procurement: keep only the Print inside the right action stack. */
    body.ui-standard-printable-header-fix .page-header-print-actions > .report-print-button{
      display:none!important;
    }

    /* Source-native management headers: same 2x2 visual grammar as Defect Detail. */
    body.ui-native-dashboard-header-fix .page-header{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      align-items:start!important;
      gap:18px!important;
    }
    body.ui-native-dashboard-header-fix .page-header > .management-dashboard-actions{
      display:grid!important;
      grid-template-columns:218px 148px!important;
      grid-template-rows:38px 38px!important;
      align-items:center!important;
      justify-content:end!important;
      gap:6px 8px!important;
    }
    .management-action-meta{
      grid-column:1!important;
      grid-row:1!important;
      display:flex!important;
      flex-direction:column!important;
      align-items:flex-end!important;
      justify-content:center!important;
      justify-self:end!important;
      line-height:1.25!important;
    }
    .management-action-meta span{font-size:8.5px!important;color:var(--muted)!important;font-weight:700!important}
    .management-action-meta b{font-size:10px!important;color:var(--navy)!important;font-weight:800!important;white-space:nowrap!important}
    .management-dashboard-actions > .management-action-primary{
      grid-column:2!important;
      grid-row:1!important;
      width:148px!important;
      min-width:148px!important;
      height:38px!important;
      padding:8px 12px!important;
      white-space:nowrap!important;
    }
    .management-dashboard-actions > .management-action-secondary{
      grid-column:1!important;
      grid-row:2!important;
      width:218px!important;
      min-width:218px!important;
      height:38px!important;
      padding:8px 12px!important;
      white-space:nowrap!important;
    }

    .management-dashboard-actions > .report-print-button{
      grid-column:2!important;
      grid-row:2!important;
      width:148px!important;
      min-width:148px!important;
      height:38px!important;
      margin:0!important;
      padding:8px 12px!important;
      white-space:nowrap!important;
    }

    body.ui-native-printable-header-fix .page-header-print-actions{
      display:grid!important;
      grid-template-columns:218px 148px!important;
      grid-template-rows:38px 38px!important;
      align-items:center!important;
      justify-content:end!important;
      gap:6px 8px!important;
      width:auto!important;
    }
    body.ui-native-printable-header-fix .page-header-print-actions > .management-printable-actions{
      display:contents!important;
    }
    body.ui-native-printable-header-fix .management-printable-actions > .management-action-dashboard{
      grid-column:2!important;
      grid-row:1!important;
      width:148px!important;
      min-width:148px!important;
      height:38px!important;
      padding:8px 12px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:nowrap!important;
    }
    body.ui-native-printable-header-fix .page-header-print-actions > .report-print-button{
      grid-column:2!important;
      grid-row:2!important;
      width:148px!important;
      min-width:148px!important;
      height:38px!important;
      margin:0!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:nowrap!important;
    }

    /* Plot detail: same two-row action grammar as Defect Detail.
       Row 1 = update metadata | Weekly Report
       Row 2 = site photos | Print */
    body.ui-project-header-fix .page-header > .ui-project-header-actions{
      display:grid!important;
      grid-template-columns:218px 190px!important;
      grid-template-rows:38px 38px!important;
      align-items:center!important;
      justify-content:end!important;
      gap:6px 8px!important;
      flex-wrap:nowrap!important;
      width:auto!important;
      max-width:none!important;
    }
    body.ui-project-header-fix .ui-project-header-actions > .ui-request-project-meta{
      grid-column:1!important;
      grid-row:1!important;
      margin:0!important;
      align-items:flex-end!important;
      justify-self:end!important;
    }
    body.ui-project-header-fix .ui-project-header-actions > .ui-project-weekly-action{
      grid-column:2!important;
      grid-row:1!important;
      width:190px!important;
      min-width:190px!important;
      height:38px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:nowrap!important;
    }
    body.ui-project-header-fix .ui-project-header-actions > .ui-project-photo-action{
      grid-column:1!important;
      grid-row:2!important;
      width:218px!important;
      min-width:218px!important;
      height:38px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:nowrap!important;
    }
    body.ui-project-header-fix .ui-project-header-actions > .ui-project-print-action{
      grid-column:2!important;
      grid-row:2!important;
      width:190px!important;
      min-width:190px!important;
      height:38px!important;
      margin:0!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:nowrap!important;
    }

    /* Above Condo Defect: compact 2x2 action block.
       Row 1 = update metadata | Dashboard
       Row 2 = Picture - Defect Done | Print */
    body.ui-defect-header-fix .page-header-print-actions{
      display:grid!important;
      grid-template-columns:218px 148px!important;
      grid-template-rows:38px 38px!important;
      align-items:center!important;
      justify-content:end!important;
      gap:6px 8px!important;
      width:auto!important;
    }
    body.ui-defect-header-fix .page-header-print-actions > .header-actions{
      display:contents!important;
    }
    body.ui-defect-header-fix .header-actions .update-meta{
      grid-column:1!important;
      grid-row:1!important;
      align-items:flex-end!important;
      justify-self:end!important;
      margin:0!important;
    }
    body.ui-defect-header-fix .header-actions .drive-button{
      grid-column:1!important;
      grid-row:2!important;
      width:218px!important;
      min-width:218px!important;
      height:38px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:nowrap!important;
    }
    body.ui-defect-header-fix .header-actions a.button:not(.drive-button){
      grid-column:2!important;
      grid-row:1!important;
      width:148px!important;
      min-width:148px!important;
      height:38px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:nowrap!important;
    }
    body.ui-defect-header-fix .page-header-print-actions > .report-print-button{
      grid-column:2!important;
      grid-row:2!important;
      width:148px!important;
      min-width:148px!important;
      height:38px!important;
      margin:0!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      text-align:center!important;
      white-space:nowrap!important;
    }

    @media(max-width:900px){
      body.ui-project-header-fix .page-header > .ui-project-header-actions{
        grid-template-columns:218px 190px!important;
        grid-template-rows:38px 38px!important;
        justify-content:end!important;
        width:100%!important;
      }

      body.ui-defect-header-fix .page-header-print-actions{
        grid-template-columns:218px 148px!important;
        justify-content:end!important;
        width:100%!important;
      }
    }

    @media(max-width:900px){
      body.ui-native-dashboard-header-fix .page-header{
        grid-template-columns:1fr auto!important;
      }
      body.ui-native-printable-header-fix .page-header-print-actions{
        justify-content:end!important;
        width:100%!important;
      }
    }

    @media(max-width:430px){
      body.ui-native-dashboard-header-fix .page-header{
        grid-template-columns:1fr!important;
      }
      body.ui-native-dashboard-header-fix .page-header > .management-dashboard-actions,
      body.ui-native-printable-header-fix .page-header-print-actions,
      body.ui-project-header-fix .page-header > .ui-project-header-actions,
      body.ui-defect-header-fix .page-header-print-actions{
        grid-template-columns:1fr!important;
        grid-template-rows:auto!important;
        width:100%!important;
      }
      body.ui-native-dashboard-header-fix .management-action-meta,
      body.ui-native-dashboard-header-fix .management-action-primary,
      body.ui-native-dashboard-header-fix .management-action-secondary,
      body.ui-native-dashboard-header-fix .report-print-button,
      body.ui-native-printable-header-fix .management-action-meta,
      body.ui-native-printable-header-fix .management-action-dashboard,
      body.ui-native-printable-header-fix .page-header-print-actions > .report-print-button,
      body.ui-project-header-fix .ui-project-header-actions > .ui-request-project-meta,
      body.ui-project-header-fix .ui-project-header-actions > .ui-project-weekly-action,
      body.ui-project-header-fix .ui-project-header-actions > .ui-project-photo-action,
      body.ui-project-header-fix .ui-project-header-actions > .ui-project-print-action,
      body.ui-defect-header-fix .header-actions .update-meta,
      body.ui-defect-header-fix .header-actions .drive-button,
      body.ui-defect-header-fix .header-actions a.button:not(.drive-button),
      body.ui-defect-header-fix .page-header-print-actions > .report-print-button{
        grid-column:1!important;
        grid-row:auto!important;
        width:100%!important;
        min-width:0!important;
      }
      body.ui-native-dashboard-header-fix .management-action-meta,
      body.ui-native-printable-header-fix .management-action-meta,
      body.ui-defect-header-fix .header-actions .update-meta,
      body.ui-project-header-fix .ui-project-header-actions > .ui-request-project-meta{
        align-items:flex-start!important;
        justify-self:stretch!important;
      }
    }
  `}</style>
}
