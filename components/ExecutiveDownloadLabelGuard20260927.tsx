'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function ExecutiveDownloadLabelGuard20260927(){
  const path=usePathname()

  useEffect(()=>{
    if(path!=='/presentation')return
    let stopped=false

    const patch=()=>{
      if(stopped)return
      const wrap=document.querySelector<HTMLElement>('.ui-request-exec-ready')
      if(!wrap)return

      const ppt=wrap.querySelector<HTMLButtonElement>('[data-ui-request="presentation-ppt"]')
      const pdf=wrap.querySelector<HTMLButtonElement>('[data-ui-request="presentation-print"]')
      if(ppt&&ppt.textContent!=='ดาวน์โหลด PowerPoint')ppt.textContent='ดาวน์โหลด PowerPoint'
      if(pdf&&pdf.textContent!=='ดาวน์โหลด PDF')pdf.textContent='ดาวน์โหลด PDF'

      const meta=wrap.querySelector<HTMLElement>('.ui-polish-update-meta')
      if(meta&&ppt&&meta.nextElementSibling!==ppt)wrap.insertBefore(ppt,meta.nextElementSibling)
      if(ppt&&pdf&&ppt.nextElementSibling!==pdf)wrap.insertBefore(pdf,ppt.nextElementSibling)
    }

    patch()
    const observer=new MutationObserver(patch)
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    const timer=window.setInterval(patch,700)
    return()=>{stopped=true;observer.disconnect();window.clearInterval(timer)}
  },[path])

  return null
}
