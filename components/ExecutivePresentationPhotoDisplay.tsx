'use client'

import { useEffect } from 'react'

type FitMode='white'|'blur'

const STORAGE_KEY='3kings:executive-photo-fit-mode'

function savedMode():FitMode{
  if(typeof window==='undefined')return'white'
  return window.localStorage.getItem(STORAGE_KEY)==='blur'?'blur':'white'
}

function setText(el:Element|null,value:string){
  if(el&&el.textContent!==value)el.textContent=value
}

function phaseFrom(value:string){
  const first=value.split('•')[0]?.trim()||''
  if(['ก่อนทำ','หลังทำ','ระหว่างทำ','รูปหน้างาน','รูปภาพรวม'].includes(first))return first
  return'รูปหน้างาน'
}

export default function ExecutivePresentationPhotoDisplay(){
  useEffect(()=>{
    let dead=false
    let scheduled=false
    let observer:MutationObserver|null=null
    let fitMode:FitMode=savedMode()

    const schedule=()=>{
      if(dead||scheduled)return
      scheduled=true
      requestAnimationFrame(()=>{
        scheduled=false
        applyAll()
      })
    }

    const applyMode=()=>{
      document.querySelectorAll<HTMLElement>('.ep-stage').forEach(stage=>stage.dataset.photoFit=fitMode)
      document.querySelectorAll<HTMLSelectElement>('.ep-fit-mode-select').forEach(select=>{
        if(select.value!==fitMode)select.value=fitMode
      })
    }

    const ensureMedia=(figure:HTMLElement)=>{
      const img=figure.querySelector<HTMLImageElement>(':scope > img, :scope > .ep-photo-media > img')
      if(!img)return
      let media=img.closest<HTMLElement>('.ep-photo-media')
      if(!media){
        media=document.createElement('div')
        media.className='ep-photo-media'
        const blur=document.createElement('div')
        blur.className='ep-photo-blur'
        blur.setAttribute('aria-hidden','true')
        img.before(media)
        media.appendChild(blur)
        media.appendChild(img)
      }
      const blur=media.querySelector<HTMLElement>('.ep-photo-blur')
      const source=img.currentSrc||img.src
      if(blur&&source&&blur.dataset.source!==source){
        blur.style.backgroundImage=`url("${source.replace(/"/g,'\\"')}")`
        blur.dataset.source=source
      }
    }

    const normalizeTaskCaption=(figure:HTMLElement)=>{
      const slide=figure.closest<HTMLElement>('.ep-slide')
      if(!slide||slide.classList.contains('condo-slide'))return
      const taskName=slide.querySelector('h2')?.textContent?.trim()||''
      if(!taskName)return
      const caption=figure.querySelector<HTMLElement>('figcaption')
      if(!caption)return
      const title=caption.querySelector<HTMLElement>('div b')
      const meta=caption.querySelector<HTMLElement>('div span')
      const legacyDate=caption.querySelector<HTMLElement>(':scope > span:last-child')
      if(!title||!meta)return

      const currentTitle=title.textContent?.trim()||''
      if(currentTitle&&currentTitle!==taskName)figure.dataset.photoPhase=phaseFrom(currentTitle)
      if(!figure.dataset.photoPhase)figure.dataset.photoPhase='รูปหน้างาน'

      const currentDate=legacyDate?.textContent?.trim()||''
      if(currentDate)figure.dataset.photoDate=currentDate
      const date=figure.dataset.photoDate||'-'

      title.classList.add('ep-task-photo-title')
      meta.classList.add('ep-task-photo-meta')
      legacyDate?.classList.add('ep-task-photo-legacy-date')
      setText(title,taskName)
      setText(meta,`${figure.dataset.photoPhase} • ${date}`)
      setText(legacyDate,'')
    }

    const ensureControl=(head:HTMLElement)=>{
      if(head.querySelector('.ep-fit-mode-control'))return
      const control=document.createElement('label')
      control.className='ep-fit-mode-control'
      control.innerHTML='<span>การแสดงรูป</span><select class="ep-fit-mode-select" aria-label="การแสดงรูป"><option value="white">Fit / White</option><option value="blur">Fit / Blur Side Fill</option></select>'
      const link=head.querySelector(':scope > a')
      if(link)head.insertBefore(control,link)
      else head.appendChild(control)
      const select=control.querySelector<HTMLSelectElement>('select')
      if(select)select.value=fitMode
    }

    function applyAll(){
      applyMode()
      document.querySelectorAll<HTMLElement>('.ep-stage .ep-photo-head').forEach(ensureControl)
      document.querySelectorAll<HTMLElement>('.ep-stage .ep-photo-grid figure').forEach(figure=>{
        ensureMedia(figure)
        normalizeTaskCaption(figure)
      })
    }

    const change=(event:Event)=>{
      const select=(event.target as Element|null)?.closest<HTMLSelectElement>('.ep-fit-mode-select')
      if(!select)return
      fitMode=select.value==='blur'?'blur':'white'
      try{window.localStorage.setItem(STORAGE_KEY,fitMode)}catch{}
      applyMode()
    }

    applyAll()
    const root=document.querySelector('.ep-stage')||document.body
    observer=new MutationObserver(schedule)
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['src']})
    document.addEventListener('change',change,true)

    return()=>{
      dead=true
      observer?.disconnect()
      document.removeEventListener('change',change,true)
    }
  },[])

  return <style jsx global>{`
    .ep-photo-media{position:relative;isolation:isolate;display:grid;place-items:center;width:100%;height:235px;overflow:hidden;background:#fff}
    .ep-photo-grid.count-1 .ep-photo-media{height:500px}
    .ep-photo-media>img{position:relative;z-index:2;display:block!important;width:100%!important;height:100%!important;object-fit:contain!important;object-position:center center!important;background:transparent!important}
    .ep-photo-blur{position:absolute;z-index:1;inset:-24px;background-position:center;background-size:cover;background-repeat:no-repeat;filter:blur(18px);transform:scale(1.06);opacity:0;transition:opacity .18s ease;pointer-events:none}
    .ep-stage[data-photo-fit="white"] .ep-photo-media{background:#fff}
    .ep-stage[data-photo-fit="white"] .ep-photo-blur{opacity:0}
    .ep-stage[data-photo-fit="blur"] .ep-photo-media{background:#f5f5f3}
    .ep-stage[data-photo-fit="blur"] .ep-photo-blur{opacity:.42}
    .ep-slide:not(.condo-slide) .ep-photo-grid figcaption{align-items:flex-start}
    .ep-slide:not(.condo-slide) .ep-photo-grid figcaption>div{width:100%;min-width:0;gap:2px}
    .ep-slide:not(.condo-slide) .ep-task-photo-title{display:block;font-size:10.5px!important;line-height:1.3;color:#263850!important;font-weight:900!important;white-space:normal;overflow:visible;text-overflow:clip}
    .ep-slide:not(.condo-slide) .ep-task-photo-meta{display:block;font-size:8.5px!important;line-height:1.3;color:#6f7781!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    .ep-task-photo-legacy-date{display:none!important}
    .ep-fit-mode-control{display:flex;align-items:center;gap:6px;margin-left:auto;font-size:9px!important;color:#707988;font-weight:800;white-space:nowrap}
    .ep-fit-mode-control>span{font-size:9px!important}
    .ep-fit-mode-control select{border:1px solid #d8d1c6;border-radius:8px;background:#fff;color:#33475e;padding:5px 7px;font-size:9px;font-weight:800;outline:none}
    .ep-fit-mode-control select:focus{border-color:#5d87ae;box-shadow:0 0 0 2px rgba(93,135,174,.12)}
    @media(max-width:900px){.ep-fit-mode-control>span{display:none}.ep-photo-media{height:220px}.ep-photo-grid.count-1 .ep-photo-media{height:430px}}
    @media print{.ep-fit-mode-control{display:none!important}.ep-photo-blur{display:none!important}.ep-photo-media{background:#fff!important}}
  `}</style>
}
