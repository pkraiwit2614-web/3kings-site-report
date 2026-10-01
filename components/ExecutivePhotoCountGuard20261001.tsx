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
        document.querySelectorAll<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide) .ep-photo-grid').forEach(grid=>{
          const figures=[...grid.querySelectorAll<HTMLElement>('figure')]
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
          grid.dataset.visiblePhotoCount=String(Math.min(MAX_TASK_PHOTOS,figures.length))
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
    .ep-stage .ep-slide:not(.condo-slide) .ep-photo-grid figure[data-photo-overflow-guard="true"]{
      display:none!important;
    }
  `}</style>
}
