'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {getSupabase} from '@/lib/supabase'
import {OWNER_USER_ID} from '@/lib/accessControl'

type ProjectRow={id:string;code:string;name:string}
type TaskRow={id:string;project_id:string;source_task_no:string|null;task_name:string;area:string|null}
type PhotoRow={id:string;drive_file_id:string;project_id:string;file_name:string;photo_date:string;verified_at:string|null}
type FeedbackStatus='approved'|'rejected'
type FeedbackRow={photo_id:string;task_id:string;status:FeedbackStatus;note:string|null;reviewed_by:string|null;reviewed_at:string}
type ReviewTarget={host:HTMLElement;photoId:string;taskId:string;key:string}
type CoverTarget={host:HTMLElement;projectId:string;url:string;alt:string;date:string;key:string}

const PAGE=500

function norm(value:string|null|undefined){
  return String(value||'').toLowerCase().replace(/[._()\-–—/\\,:;]+/g,' ').replace(/\s+/g,' ').trim()
}
function pairKey(photoId:string,taskId:string){return `${photoId}|${taskId}`}
function fileIdFromImage(img:HTMLImageElement){
  try{
    const url=new URL(img.currentSrc||img.src,window.location.origin)
    return url.pathname==='/api/drive-photo'?url.searchParams.get('fileId')||'':''
  }catch{return ''}
}
function codeFromSlide(slide:Element){
  return (slide.querySelector('.ep-eyebrow')?.textContent||'').split('•')[0]?.trim()||''
}
function taskFromSlide(slide:Element,project:ProjectRow,tasks:TaskRow[]){
  const name=slide.querySelector('h2')?.textContent?.trim()||''
  if(!name)return null
  const area=(slide.querySelector('header p')?.textContent||'').split('•')[0]?.trim()||''
  const matches=tasks.filter(t=>t.project_id===project.id&&norm(t.task_name)===norm(name))
  if(matches.length<=1)return matches[0]||null
  return matches.find(t=>t.area&&norm(area).includes(norm(t.area)))||matches[0]
}
function sameReviews(a:ReviewTarget[],b:ReviewTarget[]){
  return a.length===b.length&&a.every((x,i)=>x.host===b[i]?.host&&x.key===b[i]?.key)
}
function sameCovers(a:CoverTarget[],b:CoverTarget[]){
  return a.length===b.length&&a.every((x,i)=>x.host===b[i]?.host&&x.key===b[i]?.key)
}
async function loadAllPhotos(s:any){
  let rows:PhotoRow[]=[]
  for(let from=0;;from+=PAGE){
    const result=await s.from('drive_photo_index')
      .select('id,drive_file_id,project_id,file_name,photo_date,verified_at')
      .eq('is_active',true)
      .order('photo_date',{ascending:false})
      .order('indexed_at',{ascending:false})
      .range(from,from+PAGE-1)
    if(result.error)throw result.error
    const batch=(result.data||[]) as PhotoRow[]
    rows=rows.concat(batch)
    if(batch.length<PAGE)break
  }
  return rows
}
function thaiDate(value:string){
  const [y,m,d]=value.split('-').map(Number)
  if(!y||!m||!d)return value
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y+543}`
}

export default function ExecutivePhotoReviewSafe20261001(){
  const [projects,setProjects]=useState<ProjectRow[]>([])
  const [tasks,setTasks]=useState<TaskRow[]>([])
  const [photos,setPhotos]=useState<PhotoRow[]>([])
  const [feedback,setFeedback]=useState<Map<string,FeedbackRow>>(()=>new Map())
  const [editable,setEditable]=useState(false)
  const [userId,setUserId]=useState('')
  const [reviews,setReviews]=useState<ReviewTarget[]>([])
  const [covers,setCovers]=useState<CoverTarget[]>([])
  const [saving,setSaving]=useState('')
  const [toast,setToast]=useState('')
  const dataRef=useRef({projects:[] as ProjectRow[],tasks:[] as TaskRow[],photos:[] as PhotoRow[]})

  useEffect(()=>{
    let dead=false
    const load=async()=>{
      const s=getSupabase()
      const [p,t,ph,f,auth]=await Promise.all([
        s.from('projects').select('id,code,name').eq('active',true),
        s.from('v_schedule_tasks').select('id,project_id,source_task_no,task_name,area'),
        loadAllPhotos(s),
        s.from('photo_task_feedback').select('photo_id,task_id,status,note,reviewed_by,reviewed_at'),
        s.auth.getUser(),
      ])
      if(dead)return
      const projectRows=(p.data||[]) as ProjectRow[]
      const taskRows=((t.data||[]) as TaskRow[]).filter(x=>String(x.source_task_no||'').trim()!=='1')
      const photoRows=ph as PhotoRow[]
      setProjects(projectRows);setTasks(taskRows);setPhotos(photoRows)
      dataRef.current={projects:projectRows,tasks:taskRows,photos:photoRows}
      setFeedback(new Map(((f.data||[]) as FeedbackRow[]).map(row=>[pairKey(row.photo_id,row.task_id),row])))
      const user=auth.data.user
      setUserId(user?.id||'')
      if(user){
        const profile=await s.from('profiles').select('role').eq('user_id',user.id).maybeSingle()
        if(!dead)setEditable(user.id===OWNER_USER_ID&&String(profile.data?.role||'')==='manager')
      }
    }
    void load().catch(()=>{})
    return()=>{dead=true}
  },[])

  const latestByProject=useMemo(()=>{
    const map=new Map<string,PhotoRow>()
    photos.forEach(photo=>{if(!map.has(photo.project_id))map.set(photo.project_id,photo)})
    return map
  },[photos])

  useEffect(()=>{
    dataRef.current={projects,tasks,photos}
  },[projects,tasks,photos])

  useEffect(()=>{
    if(!projects.length||!photos.length)return
    let dead=false
    let frame=0
    let observer:MutationObserver|null=null

    const scan=()=>{
      cancelAnimationFrame(frame)
      frame=requestAnimationFrame(()=>{
        if(dead)return
        const {projects:projectRows,tasks:taskRows,photos:photoRows}=dataRef.current
        const projectByCode=new Map(projectRows.map(p=>[p.code,p]))
        const projectByName=new Map(projectRows.map(p=>[p.name.trim(),p]))
        const photoByFile=new Map(photoRows.map(p=>[p.drive_file_id,p]))

        const nextReviews:ReviewTarget[]=[]
        const slide=document.querySelector<HTMLElement>('.ep-stage .ep-slide:not(.condo-slide)')
        if(slide){
          const project=projectByCode.get(codeFromSlide(slide))
          const task=project?taskFromSlide(slide,project,taskRows):null
          if(task){
            slide.querySelectorAll<HTMLElement>('.ep-photo-grid figure').forEach(figure=>{
              const img=figure.querySelector<HTMLImageElement>('img')
              const fileId=img?fileIdFromImage(img):''
              const photo=fileId?photoByFile.get(fileId):undefined
              if(!photo)return
              nextReviews.push({host:figure,photoId:photo.id,taskId:task.id,key:`${photo.id}|${task.id}`})
            })
          }
        }
        setReviews(prev=>sameReviews(prev,nextReviews)?prev:nextReviews)

        const nextCovers:CoverTarget[]=[]
        document.querySelectorAll<HTMLElement>('.ep-overview .ep-card').forEach(card=>{
          const cover=card.querySelector<HTMLElement>('.ep-cover')
          if(!cover||cover.querySelector(':scope > img'))return
          const name=card.querySelector('.ep-cover-title b')?.textContent?.trim()||''
          const project=projectByName.get(name)
          if(!project||project.code.startsWith('CONDO-'))return
          const latest=latestByProject.get(project.id)
          if(!latest)return
          nextCovers.push({host:cover,projectId:project.id,url:`/api/drive-photo?fileId=${encodeURIComponent(latest.drive_file_id)}`,alt:latest.file_name,date:latest.photo_date,key:`${project.id}|${latest.id}`})
        })
        setCovers(prev=>sameCovers(prev,nextCovers)?prev:nextCovers)
      })
    }

    scan()
    observer=new MutationObserver(scan)
    observer.observe(document.body,{subtree:true,childList:true})
    document.addEventListener('click',scan,true)
    document.addEventListener('change',scan,true)
    window.addEventListener('keydown',scan,true)
    window.addEventListener('resize',scan)
    return()=>{
      dead=true
      observer?.disconnect()
      document.removeEventListener('click',scan,true)
      document.removeEventListener('change',scan,true)
      window.removeEventListener('keydown',scan,true)
      window.removeEventListener('resize',scan)
      cancelAnimationFrame(frame)
    }
  },[projects.length,photos.length,latestByProject])

  const saveFeedback=async(photoId:string,taskId:string,status:FeedbackStatus)=>{
    if(!editable||!userId)return
    const key=pairKey(photoId,taskId)
    setSaving(`${key}|${status}`)
    try{
      const s=getSupabase()
      const now=new Date().toISOString()
      const row={photo_id:photoId,task_id:taskId,status,note:status==='approved'?'ยืนยันจาก Executive Presentation':'ไม่ตรงงานจาก Executive Presentation',reviewed_by:userId,reviewed_at:now,updated_at:now}
      const result=await s.from('photo_task_feedback').upsert(row,{onConflict:'photo_id,task_id'})
      if(result.error)throw result.error
      setFeedback(prev=>{
        const next=new Map(prev)
        next.set(key,{photo_id:photoId,task_id:taskId,status,note:row.note,reviewed_by:userId,reviewed_at:now})
        return next
      })
      setToast(status==='approved'?'บันทึกแล้ว ✓ ใช้รูปนี้กับงานนี้':'บันทึกแล้ว ✕ รูปนี้ไม่ตรงกับงานนี้')
      window.setTimeout(()=>setToast(''),1800)
    }catch(error){
      setToast(`บันทึกไม่สำเร็จ: ${error instanceof Error?error.message:'unknown error'}`)
      window.setTimeout(()=>setToast(''),2600)
    }finally{setSaving('')}
  }

  return <>
    {covers.map(target=>createPortal(
      <div className="ep-safe-cover-preview" aria-label={`รูปล่าสุด ${thaiDate(target.date)}`}>
        <img src={target.url} alt={target.alt}/>
        <span>รูปล่าสุด {thaiDate(target.date)}</span>
      </div>,target.host,target.key
    ))}
    {editable&&reviews.map(target=>{
      const status=feedback.get(pairKey(target.photoId,target.taskId))?.status
      const base=pairKey(target.photoId,target.taskId)
      return createPortal(
        <div className="ep-safe-reviewbar" onClick={event=>event.stopPropagation()}>
          <button type="button" className={status==='approved'?'active':''} disabled={saving.startsWith(base)} onClick={()=>void saveFeedback(target.photoId,target.taskId,'approved')}>{status==='approved'?'✓ ใช้อยู่':'✓ ใช้'}</button>
          <button type="button" className={status==='rejected'?'active-reject':''} disabled={saving.startsWith(base)} onClick={()=>void saveFeedback(target.photoId,target.taskId,'rejected')}>✕ ไม่ตรง</button>
        </div>,target.host,target.key
      )
    })}
    {toast&&<div className="ep-safe-toast">{toast}</div>}
    <style jsx global>{`
      .ep-cover:has(.ep-safe-cover-preview) .ep-cover-empty{visibility:hidden!important}
      .ep-safe-cover-preview{position:absolute;inset:0;z-index:0;overflow:hidden;background:#e9e5dc}
      .ep-safe-cover-preview>img{display:block;width:100%;height:100%;object-fit:cover}
      .ep-safe-cover-preview>span{position:absolute;left:9px;top:9px;z-index:1;padding:4px 7px;border-radius:7px;background:rgba(10,23,39,.76);color:#fff;font-size:8px;font-weight:800}
      .ep-stage .ep-photo-grid figure{position:relative}
      .ep-safe-reviewbar{position:absolute;right:7px;bottom:38px;z-index:8;display:flex;gap:5px;padding:4px;border-radius:9px;background:rgba(255,255,255,.94);box-shadow:0 2px 9px rgba(18,30,46,.16)}
      .ep-safe-reviewbar button{appearance:none;border:1px solid #d5dbe2;border-radius:7px;background:#fff;color:#33475e;padding:5px 7px;font:800 9px/1.1 inherit;cursor:pointer;white-space:nowrap}
      .ep-safe-reviewbar button.active{border-color:#79b694;background:#edf8f1;color:#206d49}
      .ep-safe-reviewbar button.active-reject{border-color:#e0aaa6;background:#fff1f0;color:#a43c36}
      .ep-safe-reviewbar button:disabled{opacity:.55;cursor:wait}
      .ep-safe-toast{position:fixed;left:50%;bottom:82px;z-index:9999;transform:translateX(-50%);max-width:min(88vw,520px);padding:9px 13px;border-radius:10px;background:#17243a;color:white;font-size:11px;font-weight:800;box-shadow:0 8px 26px rgba(0,0,0,.22)}
      @media(max-width:620px){.ep-safe-reviewbar{right:5px;bottom:36px}.ep-safe-reviewbar button{padding:5px 6px;font-size:8px}.ep-safe-cover-preview>span{font-size:7.5px}}
      @media print{.ep-safe-reviewbar,.ep-safe-toast,.ep-safe-cover-preview>span{display:none!important}}
    `}</style>
  </>
}
