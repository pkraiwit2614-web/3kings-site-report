'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

type CompactOptions={shell?:boolean;labelled?:boolean}

function addCompact(selector:string,{shell=false,labelled=false}:CompactOptions={}){
  document.querySelectorAll<HTMLElement>(selector).forEach(el=>{
    el.classList.add('compact-filter')
    if(labelled) el.classList.add('compact-filter-labelled')
    if(shell){
      const panel=el.closest('.panel') as HTMLElement|null
      panel?.classList.add('compact-filter-shell')
    }
  })
}

function addControl(selector:string){
  document.querySelectorAll<HTMLElement>(selector).forEach(el=>el.classList.add('compact-filter-control'))
}

function addInlineFromControl(selector:string){
  const control=document.querySelector<HTMLElement>(selector)
  const row=control?.parentElement
  if(row) row.classList.add('compact-filter','compact-filter-inline')
}

export default function CompactFilterStandard20260929(){
  const pathname=usePathname()

  useEffect(()=>{
    const mark=()=>{
      if(pathname==='/'){
        addControl('.module-title select')
        addInlineFromControl('#site-performance select')
        addInlineFromControl('#management-followup select')
        return
      }
      if(pathname==='/schedule'){
        addCompact('.schedule-sticky-tools .schedule-toolbar')
        return
      }
      if(/^\/projects\/[^/]+$/.test(pathname)){
        addCompact('.schedule-sticky-tools .schedule-toolbar')
        return
      }
      if(pathname==='/weekly'){
        addCompact('section.panel > .toolbar',{shell:true})
        return
      }
      if(pathname==='/defects'){
        addCompact('.filter-panel .detail-toolbar',{shell:true})
        return
      }
      if(pathname==='/photo-mapping'){
        addCompact('section.panel > .toolbar',{shell:true})
        return
      }
      if(pathname==='/procurement'){
        addCompact('section.panel > .toolbar',{shell:true})
        return
      }
      if(pathname==='/materials'){
        addCompact('section[aria-labelledby="materials-status-title"] .toolbar, section[aria-labelledby="tool-machine-title"] .toolbar',{shell:true})
        return
      }
      if(pathname==='/presentation'){
        addCompact('.ep-filters',{shell:true,labelled:true})
      }
    }

    mark()
    const frame=requestAnimationFrame(mark)
    const timer=window.setTimeout(mark,120)
    return()=>{
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  },[pathname])

  return null
}
