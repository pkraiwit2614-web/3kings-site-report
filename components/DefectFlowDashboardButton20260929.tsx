'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

function swapSidebarItemsForViewerAndAdmin(){
  const body=document.body
  const isViewer=body.classList.contains('role-viewer')
  const isAdmin=body.classList.contains('role-manager')
  if(!isViewer&&!isAdmin)return

  const nav=document.querySelector<HTMLElement>('.sidebar nav')
  if(!nav)return

  // Viewer has read-only report history; Admin has the daily report entry.
  // Report User/foreman is intentionally excluded so its daily-report position stays unchanged.
  const reportHref=isAdmin?'/reports/quick':'/reports'
  const report=nav.querySelector<HTMLAnchorElement>(`a[href="${reportHref}"]`)
  const flow=nav.querySelector<HTMLAnchorElement>('a[href="/defect-flow"]')
  if(!report||!flow)return

  const links=[...nav.querySelectorAll<HTMLAnchorElement>('a')]
  const reportIndex=links.indexOf(report)
  const flowIndex=links.indexOf(flow)
  if(reportIndex<0||flowIndex<0||reportIndex>flowIndex)return

  const reportMarker=document.createComment('sidebar-report-position')
  const flowMarker=document.createComment('sidebar-flow-position')
  nav.insertBefore(reportMarker,report)
  nav.insertBefore(flowMarker,flow)
  nav.replaceChild(flow,reportMarker)
  nav.replaceChild(report,flowMarker)
}

export default function DefectFlowDashboardButton20260929(){
  const path=usePathname()

  useEffect(()=>{
    const applyOrder=()=>swapSidebarItemsForViewerAndAdmin()
    applyOrder()

    const observer=new MutationObserver(applyOrder)
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']})
    return()=>observer.disconnect()
  },[path])

  // The page renders its Dashboard link through canAccessPath.
  // Do not recreate a hidden/absent link via DOM mutation.

  return null
}
