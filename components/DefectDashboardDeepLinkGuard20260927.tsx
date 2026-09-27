'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function DefectDashboardDeepLinkGuard20260927(){
  const path=usePathname()

  useEffect(()=>{
    if(path!=='/defects')return
    const onClick=(event:MouseEvent)=>{
      const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('.page-header a.button'):null
      if(!link||!link.textContent?.includes('Dashboard'))return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      window.location.assign('/?section=defect')
    }
    document.addEventListener('click',onClick,true)
    return()=>document.removeEventListener('click',onClick,true)
  },[path])

  return null
}
