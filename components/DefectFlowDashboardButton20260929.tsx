'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const BUTTON_ATTR='data-defect-flow-dashboard'
const DASHBOARD_HREF='/?section=defect#dashboard-defect'

export default function DefectFlowDashboardButton20260929(){
  const path=usePathname()

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
