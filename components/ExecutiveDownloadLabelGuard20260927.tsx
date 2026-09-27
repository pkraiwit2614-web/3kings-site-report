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
      const headerPpt=wrap?.querySelector<HTMLButtonElement>(':scope > [data-ui-request="presentation-ppt"]')||null
      const printButton=wrap?.querySelector<HTMLButtonElement>(':scope > [data-ui-request="presentation-print"]')||null
      const meta=wrap?.querySelector<HTMLElement>(':scope > .ui-polish-update-meta')||null

      if(headerPpt){
        headerPpt.classList.add('executive-header-ppt-hidden')
        headerPpt.setAttribute('aria-hidden','true')
        headerPpt.tabIndex=-1
      }

      if(printButton){
        printButton.classList.remove('executive-pdf-download-label','primary')
        printButton.classList.add('report-print-button')
        if(printButton.textContent!=='🖨️ Print')printButton.textContent='🖨️ Print'
        if(meta&&meta.nextElementSibling!==printButton)wrap?.insertBefore(printButton,meta.nextElementSibling)
        if(headerPpt&&printButton.nextElementSibling!==headerPpt)wrap?.insertBefore(headerPpt,printButton.nextElementSibling)
      }

      const stage=document.querySelector<HTMLElement>('.ep-stage')
      const controls=stage?.querySelector<HTMLElement>(':scope > .ep-stage-controls')||null
      if(!controls)return

      const fullscreen=[...controls.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('Fullscreen'))||null
      if(!fullscreen)return

      let actions=controls.querySelector<HTMLElement>(':scope > .executive-stage-actions')
      if(!actions){
        actions=document.createElement('div')
        actions.className='executive-stage-actions'
        controls.insertBefore(actions,fullscreen)
        actions.append(fullscreen)
      }else if(fullscreen.parentElement!==actions){
        actions.append(fullscreen)
      }

      let stagePpt=actions.querySelector<HTMLButtonElement>(':scope > .executive-stage-ppt')
      if(!stagePpt){
        stagePpt=document.createElement('button')
        stagePpt.type='button'
        stagePpt.className='button primary executive-stage-ppt'
        stagePpt.textContent='ดาวน์โหลด PowerPoint'
        stagePpt.addEventListener('click',()=>{
          const source=document.querySelector<HTMLButtonElement>('.ui-request-exec-ready > [data-ui-request="presentation-ppt"]')
          if(source){
            source.click()
            return
          }
          const buttons=document.querySelectorAll<HTMLButtonElement>('.ep-actions > div:last-child button')
          buttons[1]?.click()
        })
        actions.insertBefore(stagePpt,fullscreen)
      }else if(stagePpt.nextElementSibling!==fullscreen){
        actions.insertBefore(stagePpt,fullscreen)
      }

      const source=document.querySelector<HTMLButtonElement>('.ui-request-exec-ready > [data-ui-request="presentation-ppt"]')
      const busy=Boolean(source?.disabled)||Boolean(source?.textContent?.includes('กำลังสร้าง'))
      stagePpt.disabled=busy
      const nextLabel=busy?'กำลังสร้าง PowerPoint…':'ดาวน์โหลด PowerPoint'
      if(stagePpt.textContent!==nextLabel)stagePpt.textContent=nextLabel
    }

    patch()
    const observer=new MutationObserver(patch)
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled']})
    const timer=window.setInterval(patch,700)
    return()=>{
      stopped=true
      observer.disconnect()
      window.clearInterval(timer)
    }
  },[path])

  return <style jsx global>{`
    /* Keep the header PowerPoint source button available for the export handler,
       but remove it completely from the visible/focusable header UI.
       This selector is intentionally more specific than HeaderActionPattern. */
    body.ui-executive-page .page-header .ui-request-exec-ready > [data-ui-request="presentation-ppt"],
    body.ui-executive-page .page-header .ui-request-exec-ready > .executive-header-ppt-hidden{
      display:none!important;
    }
    body.ui-executive-page .executive-stage-actions{
      display:flex!important;
      align-items:center!important;
      justify-content:flex-end!important;
      gap:8px!important;
    }
    body.ui-executive-page .ep-stage:fullscreen .executive-stage-ppt{
      display:none!important;
    }
    @media print{
      body.ui-executive-page .executive-stage-ppt{
        display:none!important;
      }
    }
  `}</style>
}
