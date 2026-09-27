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
      pdf?.classList.add('executive-pdf-download-label')

      const meta=wrap.querySelector<HTMLElement>('.ui-polish-update-meta')
      if(meta&&ppt&&meta.nextElementSibling!==ppt)wrap.insertBefore(ppt,meta.nextElementSibling)
      if(ppt&&pdf&&ppt.nextElementSibling!==pdf)wrap.insertBefore(pdf,ppt.nextElementSibling)
    }

    patch()
    const observer=new MutationObserver(patch)
    observer.observe(document.body,{subtree:true,childList:true})
    const timer=window.setInterval(patch,700)
    return()=>{stopped=true;observer.disconnect();window.clearInterval(timer)}
  },[path])

  return <style jsx global>{`
    body.ui-executive-page .executive-pdf-download-label{
      font-size:0!important;
    }
    body.ui-executive-page .executive-pdf-download-label::after{
      content:'ดาวน์โหลด PDF';
      font-size:12px;
      font-weight:700;
      line-height:1;
    }
  `}</style>
}
