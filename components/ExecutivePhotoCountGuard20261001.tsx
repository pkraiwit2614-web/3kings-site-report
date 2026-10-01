'use client'

import {useEffect} from 'react'

const MAX_TASK_PHOTOS=4

export default function ExecutivePhotoCountGuard20261001(){
  useEffect(()=>{
    let disposed=false
    let frame=0
    let observer:MutationObserver|null=null

    const enforce=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if(disposed)return

        document.querySelectorAll<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide) .ep-photo-section').forEach(section=>{
          // Count every figure in the whole Task photo section, not per grid.
          // This also catches stale legacy figures/grids left behind from older decorators.
          const figures=[...section.querySelectorAll<HTMLElement>('.ep-photo-grid figure')]
          figures.forEach((figure,index)=>{
            if(index<MAX_TASK_PHOTOS){
              if(figure.dataset.photoOverflowGuard==='true'){
                delete figure.dataset.photoOverflowGuard
                figure.style.removeProperty('display')
              }
              return
            }
            figure.dataset.photoOverflowGuard='true'
            figure.style.setProperty('display','none','important')
          })

          section.querySelectorAll<HTMLElement>('.ep-photo-grid').forEach(grid=>{
            const visible=[...grid.querySelectorAll<HTMLElement>('figure')].filter(x=>x.dataset.photoOverflowGuard!=='true').length
            grid.dataset.visiblePhotoCount=String(visible)
            grid.classList.toggle('ep-photo-grid-overflow-empty',visible===0)
          })
        })
      })
    }

    enforce()
    const root=document.querySelector('.ep-stage')||document.body
    observer=new MutationObserver(enforce)
    observer.observe(root,{subtree:true,childList:true})
    document.addEventListener('click',enforce,true)
    document.addEventListener('change',enforce,true)
    window.addEventListener('keydown',enforce,true)

    return()=>{
      disposed=true
      observer?.disconnect()
      document.removeEventListener('click',enforce,true)
      document.removeEventListener('change',enforce,true)
      window.removeEventListener('keydown',enforce,true)
      cancelAnimationFrame(frame)
    }
  },[])

  return <style jsx global>{`
    .ep-stage .ep-slide:not(.condo-slide) .ep-photo-section .ep-photo-grid figure[data-photo-overflow-guard="true"]{
      display:none!important;
    }
    .ep-stage .ep-slide:not(.condo-slide) .ep-photo-section .ep-photo-grid.ep-photo-grid-overflow-empty{
      display:none!important;
    }
  `}</style>
}
