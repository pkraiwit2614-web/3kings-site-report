'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const BUTTON_ATTR='data-defect-flow-dashboard'
const DASHBOARD_HREF='/?section=defect#dashboard-defect'

function swapViewerSidebarItems(){
  if(!document.body.classList.contains('role-viewer'))return
  const nav=document.querySelector<HTMLElement>('.sidebar nav')
  if(!nav)return

  const reports=nav.querySelector<HTMLAnchorElement>('a[href="/reports"]')
  const flow=nav.querySelector<HTMLAnchorElement>('a[href="/defect-flow"]')
  if(!reports||!flow)return

  const links=[...nav.querySelectorAll<HTMLAnchorElement>('a')]
  const reportsIndex=links.indexOf(reports)
  const flowIndex=links.indexOf(flow)
  if(reportsIndex<0||flowIndex<0||reportsIndex<flowIndex)return

  const reportsMarker=document.createComment('viewer-reports-position')
  const flowMarker=document.createComment('viewer-flow-position')
  nav.insertBefore(reportsMarker,reports)
  nav.insertBefore(flowMarker,flow)
  nav.replaceChild(flow,reportsMarker)
  nav.replaceChild(reports,flowMarker)
}

export default function DefectFlowDashboardButton20260929(){
  const path=usePathname()

  useEffect(()=>{
    const applyOrder=()=>swapViewerSidebarItems()
    applyOrder()

    const observer=new MutationObserver(applyOrder)
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})
    return()=>observer.disconnect()
  },[path])

  useEffect(()=>{
    if(path!=='/defect-flow')return

    const ensureButton=()=>{
      const toolbar=document.querySelector<HTMLElement>('.flow-toolbar')
      if(!toolbar)return
      if(toolbar.querySelector(`[${BUTTON_ATTR}]`))return

      const button=document.createElement('a')
      button.setAttribute(BUTTON_ATTR,'true')
      button.className='button'
      button.href=DASHBOARD_HREF
      button.textContent='Dashboard'
      button.setAttribute('aria-label','ไปที่ Defect ในหน้า Dashboard')

      const syncMeta=toolbar.querySelector('.sync-meta')
      if(syncMeta?.nextSibling)toolbar.insertBefore(button,syncMeta.nextSibling)
      else toolbar.appendChild(button)
    }

    ensureButton()
    const observer=new MutationObserver(ensureButton)
    observer.observe(document.body,{subtree:true,childList:true})

    return()=>{
      observer.disconnect()
      document.querySelector(`[${BUTTON_ATTR}]`)?.remove()
    }
  },[path])

  return null
}
