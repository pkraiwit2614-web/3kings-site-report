'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const DEFECT_TARGET_ID='dashboard-defect'
const DEFECT_TARGET_TITLE='ABOVE CONDO — HANDOVER / DEFECT STATUS'

function findDefectTarget(){
  const byId=document.getElementById(DEFECT_TARGET_ID)
  if(byId)return byId

  const target=[...document.querySelectorAll<HTMLElement>('.dashboard-module')].find(section=>{
    const title=section.querySelector<HTMLElement>('.module-title b')?.textContent?.trim()||''
    return title===DEFECT_TARGET_TITLE
  })||null

  if(target){
    target.id=DEFECT_TARGET_ID
    target.classList.add('dashboard-deep-target')
  }
  return target
}

export default function DefectDashboardDeepLinkGuard20260927(){
  const path=usePathname()

  useEffect(()=>{
    if(path!=='/defects')return

    const patchDashboardLinks=()=>{
      document.querySelectorAll<HTMLAnchorElement>('.page-header a.button').forEach(link=>{
        if(!link.textContent?.includes('Dashboard'))return
        const href='/?section=defect#dashboard-defect'
        if(link.getAttribute('href')!==href)link.setAttribute('href',href)
      })
    }

    const onClick=(event:MouseEvent)=>{
      const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('.page-header a.button'):null
      if(!link||!link.textContent?.includes('Dashboard'))return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      window.location.assign('/?section=defect#dashboard-defect')
    }

    patchDashboardLinks()
    const observer=new MutationObserver(patchDashboardLinks)
    observer.observe(document.body,{subtree:true,childList:true})
    document.addEventListener('click',onClick,true)

    return()=>{
      observer.disconnect()
      document.removeEventListener('click',onClick,true)
    }
  },[path])

  useEffect(()=>{
    if(path!=='/')return

    const params=new URLSearchParams(window.location.search)
    const wantsDefect=params.get('section')==='defect'||window.location.hash==='#dashboard-defect'
    if(!wantsDefect)return

    let stopped=false
    let hasPositioned=false
    let userInterrupted=false
    let resizeObserver:ResizeObserver|null=null
    const timers:number[]=[]

    const stopForUser=()=>{userInterrupted=true}
    window.addEventListener('wheel',stopForUser,{passive:true})
    window.addEventListener('touchstart',stopForUser,{passive:true})
    window.addEventListener('pointerdown',stopForUser,{passive:true})

    const positionTarget=()=>{
      if(stopped||userInterrupted)return
      const target=findDefectTarget()
      if(!target)return

      target.style.scrollMarginTop='18px'
      const top=target.getBoundingClientRect().top
      if(!hasPositioned||Math.abs(top-18)>10){
        target.scrollIntoView({behavior:hasPositioned?'auto':'smooth',block:'start'})
        hasPositioned=true
      }

      if(!resizeObserver&&typeof ResizeObserver!=='undefined'){
        resizeObserver=new ResizeObserver(()=>{
          if(stopped||userInterrupted)return
          window.requestAnimationFrame(positionTarget)
        })
        resizeObserver.observe(document.body)
      }
    }

    const observer=new MutationObserver(()=>{
      if(stopped||userInterrupted)return
      window.requestAnimationFrame(positionTarget)
    })
    observer.observe(document.body,{subtree:true,childList:true})

    ;[0,80,220,500,900,1500,2400,3600,5200].forEach(ms=>{
      timers.push(window.setTimeout(positionTarget,ms))
    })

    const onLoad=()=>positionTarget()
    window.addEventListener('load',onLoad)

    return()=>{
      stopped=true
      observer.disconnect()
      resizeObserver?.disconnect()
      timers.forEach(timer=>window.clearTimeout(timer))
      window.removeEventListener('load',onLoad)
      window.removeEventListener('wheel',stopForUser)
      window.removeEventListener('touchstart',stopForUser)
      window.removeEventListener('pointerdown',stopForUser)
    }
  },[path])

  return null
}
