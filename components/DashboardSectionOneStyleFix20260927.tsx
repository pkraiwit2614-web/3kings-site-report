'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function DashboardSectionOneStyleFix20260927(){
  const path=usePathname()

  useEffect(()=>{
    if(path!=='/')return

    const apply=()=>{
      document.querySelectorAll<HTMLElement>('.executive-section-title').forEach(title=>{
        const number=title.querySelector<HTMLElement>(':scope > span')
        if(number?.textContent?.trim()!=='1')return

        // Section 1 must use exactly the same header class/style as sections 2–9.
        title.classList.remove('executive-section-title')
        title.classList.add('module-title')
      })
    }

    apply()
    const observer=new MutationObserver(apply)
    observer.observe(document.body,{subtree:true,childList:true})
    return()=>observer.disconnect()
  },[path])

  return null
}
