'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

const PROJECT_PHOTO_FOLDERS: Record<string,string> = {
  'AV-P6':'https://drive.google.com/drive/folders/18WfplWKvZ7DWfjVgO7oVHA4dtlbuuzfr',
  'AV-P7':'https://drive.google.com/drive/folders/1ZmlxctN0yAXamSmXTNzjx0t3GJu_aLiI',
  'AV-P8':'https://drive.google.com/drive/folders/1T1eWjtfuNhtI8hrm-Jac5tKeZNfbJaXY',
  'AV-P9':'https://drive.google.com/drive/folders/1f4YCTjwd8E0dHgbyf8eF7XeC5kSj5j_6',
  'CONDO-A':'https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK',
  'CONDO-B':'https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK',
  'MIRAGE':'https://drive.google.com/drive/folders/1uq_XoSsAZt-bxhRJPhVtpSbdHkygku3h',
  'PROUD-KARON':'https://drive.google.com/drive/folders/1uduc_Zk3AV6ufijjrwNs8Coq_dESC2_p',
}

type PhotoIndexRow = { drive_file_id:string; drive_folder_id:string|null; project_id:string }
type ProjectRow = { id:string; code:string; name:string }

function fileIdFromImage(img:HTMLImageElement){
  try{
    const url=new URL(img.src,window.location.origin)
    if(url.pathname!=='/api/drive-photo') return ''
    return url.searchParams.get('fileId')||''
  }catch{return ''}
}

export default function ExecutivePhotoLinks(){
  useEffect(()=>{
    let disposed=false
    let observer:MutationObserver|null=null
    const clickHandler=(event:MouseEvent)=>{
      const target=event.target
      if(!(target instanceof HTMLImageElement)) return
      if(!target.matches('.ep-photo-grid img,.ep-cover img')) return
      const url=target.dataset.photoFolderUrl
      if(!url) return
      event.preventDefault()
      event.stopPropagation()
      window.open(url,'_blank','noopener,noreferrer')
    }

    const setup=async()=>{
      const s=getSupabase()
      const [photoResult,projectResult]=await Promise.all([
        s.from('drive_photo_index').select('drive_file_id,drive_folder_id,project_id').eq('is_active',true),
        s.from('projects').select('id,code,name').eq('active',true),
      ])
      if(disposed) return

      const photos=(photoResult.data||[]) as PhotoIndexRow[]
      const projects=(projectResult.data||[]) as ProjectRow[]
      const folderByFile=new Map(photos.filter(x=>x.drive_folder_id).map(x=>[x.drive_file_id,`https://drive.google.com/drive/folders/${x.drive_folder_id}`]))
      const projectByName=new Map(projects.map(x=>[x.name.trim(),x]))

      const projectCodeFromImage=(img:HTMLImageElement)=>{
        const slide=img.closest('.ep-slide')
        const eyebrow=slide?.querySelector('.ep-eyebrow')?.textContent||''
        const code=eyebrow.split('•')[0]?.trim()
        if(code) return code

        const card=img.closest('.ep-card')
        const name=card?.querySelector('.ep-cover-title b')?.textContent?.trim()||''
        return projectByName.get(name)?.code||''
      }

      const decorate=()=>{
        document.querySelectorAll<HTMLImageElement>('.ep-photo-grid img,.ep-cover img').forEach(img=>{
          const fileId=fileIdFromImage(img)
          const exactFolder=fileId?folderByFile.get(fileId):''
          const code=projectCodeFromImage(img)
          const fallback=PROJECT_PHOTO_FOLDERS[code]||''
          const link=exactFolder||fallback
          if(!link) return
          img.dataset.photoFolderUrl=link
          img.classList.add('ep-photo-clickable')
          img.title=exactFolder?'เปิดโฟลเดอร์รูปชุดนี้ใน Google Drive':'เปิด Picture Progress ใน Google Drive'
          const host=img.closest('figure')||img.closest('.ep-cover')
          host?.classList.add('ep-photo-clickable-host')
        })
      }

      decorate()
      observer=new MutationObserver(decorate)
      observer.observe(document.body,{childList:true,subtree:true})
      document.addEventListener('click',clickHandler,true)
    }

    setup().catch(()=>{})
    return()=>{
      disposed=true
      observer?.disconnect()
      document.removeEventListener('click',clickHandler,true)
    }
  },[])

  return <style jsx global>{`
    .ep-photo-clickable{cursor:pointer!important;transition:transform .22s ease,filter .22s ease}
    .ep-photo-clickable-host{position:relative}
    .ep-photo-clickable-host::before{content:'เปิดโฟลเดอร์รูป ↗';position:absolute;right:9px;top:9px;z-index:5;padding:6px 9px;border-radius:999px;background:rgba(12,28,48,.78);color:#fff;font-size:10px;font-weight:800;letter-spacing:.1px;opacity:.88;pointer-events:none;backdrop-filter:blur(5px);box-shadow:0 4px 12px rgba(0,0,0,.14)}
    .ep-photo-clickable-host:hover .ep-photo-clickable{transform:scale(1.018);filter:brightness(.94)}
    .ep-photo-clickable-host:hover::before{background:rgba(28,85,139,.94);opacity:1}
    @media(max-width:620px){.ep-photo-clickable-host::before{right:7px;top:7px;padding:5px 7px;font-size:9px}}
    @media print{.ep-photo-clickable-host::before{display:none!important}}
  `}</style>
}
