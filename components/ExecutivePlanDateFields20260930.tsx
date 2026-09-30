'use client'

import {useEffect} from 'react'

function ensureDateField(grid:HTMLElement,key:'start'|'end',label:string,value:string){
  let box=grid.querySelector<HTMLElement>(`[data-plan-date-field="${key}"]`)
  if(!box){
    box=document.createElement('div')
    box.className='ep-plan-date-field'
    box.dataset.planDateField=key
    const span=document.createElement('span')
    const strong=document.createElement('b')
    box.append(span,strong)
    grid.prepend(box)
  }
  const span=box.querySelector('span')
  const strong=box.querySelector('b')
  if(span&&span.textContent!==label)span.textContent=label
  if(strong&&strong.textContent!==value)strong.textContent=value
  return box
}

export default function ExecutivePlanDateFields20260930(){
  useEffect(()=>{
    let frame=0
    const sync=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')
        const grid=slide?.querySelector<HTMLElement>('.ep-info-grid')||null
        if(!slide||!grid)return

        const headerLine=slide.querySelector<HTMLElement>('header p')?.textContent?.trim()||''
        const match=headerLine.match(/(?:•|\|)\s*Plan\s+(.+?)\s*(?:→|->|–)\s*(.+?)\s*$/i)
        const start=match?.[1]?.trim()||'—'
        const end=match?.[2]?.trim()||'—'

        const startBox=ensureDateField(grid,'start','เริ่มในแผน',start)
        const endBox=ensureDateField(grid,'end','จบในแผน',end)

        // Keep the requested order at the beginning of the always-visible info grid.
        if(grid.firstElementChild!==startBox)grid.prepend(startBox)
        if(startBox.nextElementSibling!==endBox)startBox.after(endBox)
      })
    }

    sync()
    const observer=new MutationObserver(sync)
    observer.observe(document.body,{subtree:true,childList:true,characterData:true})
    window.addEventListener('resize',sync)
    return()=>{
      observer.disconnect()
      window.removeEventListener('resize',sync)
      cancelAnimationFrame(frame)
    }
  },[])

  return <style jsx global>{`
    .ep-info-grid>.ep-plan-date-field{
      background:#fff8e8!important;
      border-color:#e5cc8e!important;
      border-left:4px solid #b8872e!important;
    }
    .ep-info-grid>.ep-plan-date-field span{
      color:#746d61!important;
      font-weight:900!important;
    }
    .ep-info-grid>.ep-plan-date-field b{
      color:#17243a!important;
      white-space:nowrap!important;
    }
  `}</style>
}
