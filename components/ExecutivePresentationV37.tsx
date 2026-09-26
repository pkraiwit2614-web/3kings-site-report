'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { dateTH, pct, todayISO } from '@/lib/format'
import type { Project, ScheduleTask } from '@/lib/types'

type PhotoMode = 'latest' | 'before_after'
type PresentationTask = ScheduleTask & {
  notes?: string | null
  source_updated_at?: string | null
  responsible_person?: string | null
  evidence_link?: string | null
  plan_status?: string | null
}
type DailyReportRow = { id:string; project_id:string; report_date:string }
type ReportItemRow = { id:string; daily_report_id:string; schedule_task_id:string|null; work_item:string }
type ReportPhotoRow = { id:string; daily_report_id:string; report_item_id:string|null; storage_path:string; phase:string; caption:string|null; created_at:string }
type DrivePhotoRow = {
  id:string; project_id:string; schedule_task_id:string|null; drive_file_id:string; drive_folder_name:string|null; file_name:string; drive_url:string;
  photo_date:string; phase:string; match_method:string; match_score:number|null; indexed_at:string; is_active:boolean
}
type PresentationPhoto = {
  id:string; project_id:string; task_id:string|null; report_date:string; phase:string; caption:string;
  image_url:string; source:'site-report'|'drive'; matched:boolean; source_url?:string; room_no?:string|null; folder_name?:string|null
}
type CondoRoomRow = {
  room_no:string; building:string; customer_status:string; hotel_participation:string; current_status:string;
  status_group:string|null; next_action:string|null; source_modified_at:string|null
}
type ProjectStats = {
  project:Project; tasks:PresentationTask[]; plan:number; actual:number; variance:number; delayed:number;
  completed:number; latestPhotoDate:string|null; photoCount:number; matchedPhotoCount:number
}
type CondoMetric = {
  building:'A'|'B'; total:number; incomplete:number; awaitingHotel:number; hotelChecked:number; pendingHandover:number;
  handoverComplete:number; awaitingSale:number; red:number; yellow:number; green:number; grey:number; closedRatio:number;
  remaining:number; customerIncomplete:number; noCustomerIncomplete:number; latestUpdate:string|null; incompleteRooms:string[]
}

const DEFECT_DONE_URL='https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK'
const PHOTO_SOURCES: Record<string,string> = {
  'AV-P6':'https://drive.google.com/drive/folders/18WfplWKvZ7DWfjVgO7oVHA4dtlbuuzfr',
  'AV-P7':'https://drive.google.com/drive/folders/1ZmlxctN0yAXamSmXTNzjx0t3GJu_aLiI',
  'AV-P8':'https://drive.google.com/drive/folders/1T1eWjtfuNhtI8hrm-Jac5tKeZNfbJaXY',
  'AV-P9':'https://drive.google.com/drive/folders/1f4YCTjwd8E0dHgbyf8eF7XeC5kSj5j_6',
  'CONDO-A':DEFECT_DONE_URL,
  'CONDO-B':DEFECT_DONE_URL,
  'MIRAGE':'https://drive.google.com/drive/folders/1uq_XoSsAZt-bxhRJPhVtpSbdHkygku3h',
  'PROUD-KARON':'https://drive.google.com/drive/folders/1uduc_Zk3AV6ufijjrwNs8Coq_dESC2_p',
}

const CONDO_STATUS = [
  {group:'Hotel - Incomplete',label:'Defect ยังไม่เสร็จ',tone:'danger',color:'#d84d45',light:'#fff2f1'},
  {group:'Hotel - Awaiting Check',label:'Defect เสร็จ / รอ Hotel ตรวจ',tone:'warn',color:'#e2ad32',light:'#fff8e7'},
  {group:'Hotel - Checked Complete',label:'Hotel ตรวจแล้ว',tone:'good',color:'#2e9a6a',light:'#eef9f3'},
  {group:'Non-Hotel - Pending Handover',label:'Pending Handover',tone:'warn',color:'#e2ad32',light:'#fff8e7'},
  {group:'Non-Hotel - Handover Complete',label:'ส่งมอบแล้ว',tone:'good',color:'#2e9a6a',light:'#eef9f3'},
  {group:'Non-Hotel - Awaiting Sale',label:'Awaiting Sale',tone:'neutral',color:'#7c8794',light:'#f1f3f5'},
] as const

function monthBounds(){
  const today=todayISO(); const [y,m]=today.split('-').map(Number); const end=new Date(Date.UTC(y,m,0)).getUTCDate()
  return {start:`${y}-${String(m).padStart(2,'0')}-01`,end:`${y}-${String(m).padStart(2,'0')}-${String(end).padStart(2,'0')}`}
}
function overlaps(task:PresentationTask,start:string,end:string){
  if(!task.planned_start&&!task.planned_end) return false
  const s=task.planned_start||task.planned_end||''; const e=task.planned_end||task.planned_start||''
  return s<=end&&e>=start
}
function shortNote(task:PresentationTask){ return task.notes?.trim()||task.next_action?.trim()||task.blocker?.trim()||'—' }
function phaseLabel(phase:string,matched=true){
  if(!matched) return 'รูปภาพรวม'
  if(phase==='before') return 'ก่อนทำ'; if(phase==='after') return 'หลังทำ'; if(phase==='during') return 'ระหว่างทำ'; return 'รูปหน้างาน'
}
function sourceLabel(source:PresentationPhoto['source']){ return source==='drive'?'Google Drive':'Site Report' }
function imageDateLabel(value:string|null|undefined){ return value?dateTH(value):'-' }
function fileSafe(value:string){ return value.replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim() }
function formatDateTime(value:string|null){
  if(!value) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
}
function isCondoCode(code:string|undefined|null){ return code==='CONDO-A'||code==='CONDO-B' }
function condoBuilding(code:string|undefined|null):'A'|'B'|null{ return code==='CONDO-A'?'A':code==='CONDO-B'?'B':null }
function extractRoomNo(fileName:string,folderName?:string|null){
  const find=(value:string)=>value.toUpperCase().match(/([AB]\d{3,4})/)?.[1]||null
  return find(fileName)||find(folderName||'')
}
function latestValue(values:(string|null|undefined)[]){
  return values.filter(Boolean).reduce<string|null>((latest,current)=>!latest||String(current)>latest?String(current):latest,null)
}
function condoMetrics(rows:CondoRoomRow[],building:'A'|'B'):CondoMetric{
  const list=rows.filter(r=>r.building===building||r.room_no?.toUpperCase().startsWith(building))
  const n=(group:string)=>list.filter(r=>r.status_group===group).length
  const incomplete=n('Hotel - Incomplete')
  const awaitingHotel=n('Hotel - Awaiting Check')
  const hotelChecked=n('Hotel - Checked Complete')
  const pendingHandover=n('Non-Hotel - Pending Handover')
  const handoverComplete=n('Non-Hotel - Handover Complete')
  const awaitingSale=n('Non-Hotel - Awaiting Sale')
  const green=hotelChecked+handoverComplete
  const yellow=awaitingHotel+pendingHandover
  const total=list.length
  return {
    building,total,incomplete,awaitingHotel,hotelChecked,pendingHandover,handoverComplete,awaitingSale,
    red:incomplete,yellow,green,grey:awaitingSale,closedRatio:total?green/total:0,remaining:incomplete+yellow,
    customerIncomplete:list.filter(r=>r.status_group==='Hotel - Incomplete'&&r.customer_status==='มีลูกค้า').length,
    noCustomerIncomplete:list.filter(r=>r.status_group==='Hotel - Incomplete'&&r.customer_status==='ไม่มีลูกค้า').length,
    latestUpdate:latestValue(list.map(r=>r.source_modified_at)),
    incompleteRooms:list.filter(r=>r.status_group==='Hotel - Incomplete').map(r=>r.room_no).sort(),
  }
}
async function urlToDataUri(url:string,cache:Map<string,string>){
  if(cache.has(url)) return cache.get(url)||''
  try{
    const res=await fetch(url); if(!res.ok) return ''
    const blob=await res.blob(); const data=await new Promise<string>((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=()=>reject(r.error); r.readAsDataURL(blob) })
    cache.set(url,data); return data
  }catch{return ''}
}

export default function ExecutivePresentationV37(){
  const bounds=useMemo(()=>monthBounds(),[])
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<PresentationTask[]>([])
  const [photos,setPhotos]=useState<PresentationPhoto[]>([])
  const [condoRooms,setCondoRooms]=useState<CondoRoomRow[]>([])
  const [projectFilter,setProjectFilter]=useState('')
  const [startDate,setStartDate]=useState(bounds.start)
  const [endDate,setEndDate]=useState(bounds.end)
  const [photoMode,setPhotoMode]=useState<PhotoMode>('latest')
  const [view,setView]=useState<'overview'|'slides'>('overview')
  const [selectedProjectId,setSelectedProjectId]=useState('')
  const [slideIndex,setSlideIndex]=useState(0)
  const [loading,setLoading]=useState(true)
  const [exporting,setExporting]=useState('')
  const [latestScheduleSync,setLatestScheduleSync]=useState<string|null>(null)
  const [latestPhotoSync,setLatestPhotoSync]=useState<string|null>(null)
  const stageRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      const s=getSupabase()
      const [p,t,r,i,rp,dp,cr,ss,ps]=await Promise.all([
        s.from('projects').select('*').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('*').order('planned_start'),
        s.from('daily_reports').select('id,project_id,report_date').order('report_date',{ascending:false}),
        s.from('report_items').select('id,daily_report_id,schedule_task_id,work_item'),
        s.from('report_photos').select('id,daily_report_id,report_item_id,storage_path,phase,caption,created_at').order('created_at',{ascending:false}),
        s.from('drive_photo_index').select('id,project_id,schedule_task_id,drive_file_id,drive_folder_name,file_name,drive_url,photo_date,phase,match_method,match_score,indexed_at,is_active').eq('is_active',true).order('photo_date',{ascending:false}),
        s.from('condo_room_status').select('room_no,building,customer_status,hotel_participation,current_status,status_group,next_action,source_modified_at').order('room_no'),
        s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','schedule').order('created_at',{ascending:false}).limit(1).maybeSingle(),
        s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','photos').order('created_at',{ascending:false}).limit(1).maybeSingle(),
      ])
      if(cancelled) return
      const projectRows=(p.data||[]) as Project[]
      const taskRows=((t.data||[]) as PresentationTask[]).filter(x=>x.source_task_no!=='1')
      const reports=(r.data||[]) as DailyReportRow[]; const items=(i.data||[]) as ReportItemRow[]; const reportPhotos=(rp.data||[]) as ReportPhotoRow[]
      const reportMap=new Map(reports.map(x=>[x.id,x])); const itemMap=new Map(items.map(x=>[x.id,x]))
      const paths=[...new Set(reportPhotos.map(x=>x.storage_path).filter(Boolean))]; const signedMap=new Map<string,string>()
      if(paths.length){ const {data:signed}=await s.storage.from('site-photos').createSignedUrls(paths,60*60); (signed||[]).forEach((x:any)=>{if(x?.path&&x?.signedUrl) signedMap.set(x.path,x.signedUrl)}) }
      const sitePhotos:PresentationPhoto[]=reportPhotos.flatMap(photo=>{
        const report=reportMap.get(photo.daily_report_id); if(!report) return []
        const item=photo.report_item_id?itemMap.get(photo.report_item_id):undefined; const url=signedMap.get(photo.storage_path)||''; if(!url) return []
        return [{id:`report-${photo.id}`,project_id:report.project_id,task_id:item?.schedule_task_id||null,report_date:report.report_date,phase:photo.phase||'other',caption:photo.caption||item?.work_item||'Site photo',image_url:url,source:'site-report' as const,matched:Boolean(item?.schedule_task_id)}]
      })
      const drivePhotos:PresentationPhoto[]=((dp.data||[]) as DrivePhotoRow[]).map(photo=>({
        id:`drive-${photo.id}`,project_id:photo.project_id,task_id:photo.schedule_task_id||null,report_date:photo.photo_date,phase:photo.phase||'other',caption:photo.file_name,
        image_url:`/api/drive-photo?fileId=${encodeURIComponent(photo.drive_file_id)}`,source:'drive' as const,matched:Boolean(photo.schedule_task_id),source_url:photo.drive_url,
        room_no:extractRoomNo(photo.file_name,photo.drive_folder_name),folder_name:photo.drive_folder_name,
      }))
      setProjects(projectRows); setTasks(taskRows); setPhotos([...sitePhotos,...drivePhotos]); setCondoRooms((cr.data||[]) as CondoRoomRow[])
      setLatestScheduleSync(ss.data?.created_at||null); setLatestPhotoSync(ps.data?.created_at||null); setLoading(false)
    }
    load().catch(()=>setLoading(false)); return()=>{cancelled=true}
  },[])

  const periodTasks=useMemo(()=>tasks.filter(t=>overlaps(t,startDate,endDate)),[tasks,startDate,endDate])
  const visibleProjects=useMemo(()=>projects.filter(p=>!projectFilter||p.id===projectFilter),[projects,projectFilter])
  const photosInPeriod=useMemo(()=>photos.filter(p=>p.report_date>=startDate&&p.report_date<=endDate),[photos,startDate,endDate])
  const condoA=useMemo(()=>condoMetrics(condoRooms,'A'),[condoRooms])
  const condoB=useMemo(()=>condoMetrics(condoRooms,'B'),[condoRooms])
  const metricFor=(building:'A'|'B')=>building==='A'?condoA:condoB

  const pickPhotos=(projectId:string,taskId?:string)=>{
    const direct=taskId?photosInPeriod.filter(p=>p.project_id===projectId&&p.task_id===taskId):[]
    const fallback=photosInPeriod.filter(p=>p.project_id===projectId)
    const pool=(direct.length?direct:fallback).slice().sort((a,b)=>b.report_date.localeCompare(a.report_date)||b.id.localeCompare(a.id))
    if(photoMode==='latest') return pool.slice(0,4)
    const before=pool.find(p=>p.phase==='before'); const after=pool.find(p=>p.phase==='after')
    const chosen:PresentationPhoto[]=[]
    if(before) chosen.push(before); if(after&&after.id!==before?.id) chosen.push(after)
    if(!before&&!after&&direct.length>=2){
      const chronological=direct.slice().sort((a,b)=>a.report_date.localeCompare(b.report_date))
      if(chronological[0].report_date!==chronological[chronological.length-1].report_date) chosen.push(chronological[0],chronological[chronological.length-1])
    }
    for(const p of pool){ if(chosen.length>=4) break; if(!chosen.some(x=>x.id===p.id)) chosen.push(p) }
    return chosen.slice(0,4)
  }

  const pickCondoPhotos=(building:'A'|'B',projectId?:string)=>{
    const byRoom=photosInPeriod.filter(p=>p.source==='drive'&&p.room_no?.toUpperCase().startsWith(building))
    const byProject=projectId?photosInPeriod.filter(p=>p.project_id===projectId):[]
    const unique=new Map<string,PresentationPhoto>()
    ;[...byRoom,...byProject].forEach(p=>unique.set(p.id,p))
    return [...unique.values()].sort((a,b)=>b.report_date.localeCompare(a.report_date)||b.id.localeCompare(a.id)).slice(0,4)
  }

  const stats=useMemo<ProjectStats[]>(()=>visibleProjects.filter(p=>!isCondoCode(p.code)).map(project=>{
    const list=periodTasks.filter(t=>t.project_id===project.id); const projectPhotos=photosInPeriod.filter(p=>p.project_id===project.id)
    const plan=list.length?list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length:0; const actual=list.length?list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length:0
    const latestPhotoDate=latestValue(projectPhotos.map(p=>p.report_date))
    return {project,tasks:list,plan,actual,variance:actual-plan,delayed:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length,completed:list.filter(t=>(t.actual_progress||0)>=1).length,latestPhotoDate,photoCount:projectPhotos.length,matchedPhotoCount:projectPhotos.filter(p=>p.matched).length}
  }),[visibleProjects,periodTasks,photosInPeriod])

  const selectedProject=projects.find(p=>p.id===selectedProjectId)||null
  const selectedBuilding=condoBuilding(selectedProject?.code)
  const selectedCondoMetric=selectedBuilding?metricFor(selectedBuilding):null
  const selectedCondoPhotos=selectedBuilding?pickCondoPhotos(selectedBuilding,selectedProject?.id):[]
  const selectedTasks=useMemo(()=>periodTasks.filter(t=>t.project_id===selectedProjectId),[periodTasks,selectedProjectId])
  const currentTask=selectedTasks[slideIndex]||null
  const currentPhotos=currentTask?pickPhotos(currentTask.project_id,currentTask.id):[]
  const taskHasDirectPhotos=currentTask?photosInPeriod.some(p=>p.project_id===currentTask.project_id&&p.task_id===currentTask.id):false
  const currentDriveUrl=selectedProject?PHOTO_SOURCES[selectedProject.code]:''

  useEffect(()=>{ if(slideIndex>=selectedTasks.length&&selectedTasks.length) setSlideIndex(Math.max(0,selectedTasks.length-1)) },[selectedTasks.length,slideIndex])
  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(view!=='slides'||selectedBuilding)return; if(e.key==='ArrowRight'||e.key==='PageDown')setSlideIndex(i=>Math.min(selectedTasks.length-1,i+1)); if(e.key==='ArrowLeft'||e.key==='PageUp')setSlideIndex(i=>Math.max(0,i-1)); if(e.key==='Escape'&&!document.fullscreenElement)setView('overview') }; window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey) },[view,selectedTasks.length,selectedBuilding])

  const openProject=(id:string)=>{ setSelectedProjectId(id); setSlideIndex(0); setView('slides'); window.scrollTo({top:0,behavior:'smooth'}) }
  const toggleFullscreen=async()=>{ if(document.fullscreenElement) await document.exitFullscreen(); else await stageRef.current?.requestFullscreen() }
  const exportProjects=useMemo(()=>view==='slides'&&selectedProject?[selectedProject]:visibleProjects,[view,selectedProject,visibleProjects])

  const exportPptx=async()=>{
    if(exporting)return; setExporting('pptx')
    try{
      const mod=await import('pptxgenjs'); const PptxGenJS=mod.default; const pptxFile=new PptxGenJS(); pptxFile.layout='LAYOUT_WIDE'; pptxFile.author='3 Kings Construction'; pptxFile.company='3 Kings Construction'; pptxFile.subject='Executive Presentation View'; pptxFile.title='3 Kings Construction Executive Presentation'
      const imageCache=new Map<string,string>()
      for(const project of exportProjects){
        const building=condoBuilding(project.code)
        if(building){
          const m=metricFor(building); const cPhotos=pickCondoPhotos(building,project.id); const cover=pptxFile.addSlide(); cover.background={color:'F6F2E9'}
          cover.addText('3 KINGS CONSTRUCTION',{x:.65,y:.45,w:4.2,h:.3,fontSize:11,bold:true,color:'A97920',charSpacing:1.5})
          cover.addText(`Above Condo ${building} — Defect / Handover`,{x:.65,y:1.0,w:7.8,h:.65,fontSize:27,bold:true,color:'17243A'})
          cover.addText(`สถานะล่าสุดจาก Defect Dashboard • ${m.total} ห้อง`,{x:.65,y:1.75,w:6.8,h:.35,fontSize:14,color:'687486'})
          cover.addText(`ปิดแล้ว ${pct(m.closedRatio)}   |   ต้องติดตาม ${m.remaining} ห้อง   |   Defect ยังไม่เสร็จ ${m.incomplete} ห้อง`,{x:.65,y:2.35,w:7.8,h:.55,fontSize:17,bold:true,color:'233A5D'})
          cover.addText(`แดง ${m.red} • เหลือง ${m.yellow} • เขียว ${m.green} • เทา ${m.grey}`,{x:.65,y:3.02,w:6.8,h:.35,fontSize:13,color:'6D7785'})
          for(let n=0;n<Math.min(2,cPhotos.length);n++){ const data=await urlToDataUri(cPhotos[n].image_url,imageCache); if(data) cover.addImage({data,x:8.55+n*2.05,y:1.0,w:1.9,h:3.35}) }
          if(!cPhotos.length) cover.addText('เปิด Picture - Defect Done ใน Google Drive',{x:8.4,y:2.0,w:4.1,h:.55,fontSize:15,bold:true,color:'2F6FB0',align:'center',hyperlink:{url:DEFECT_DONE_URL}})

          const slide=pptxFile.addSlide(); slide.background={color:'FFFDF9'}
          slide.addText(`CONDO ${building} • DEFECT / HANDOVER STATUS`,{x:.55,y:.35,w:5.6,h:.3,fontSize:11,bold:true,color:'A97920'})
          slide.addText(`Above Condo ${building}`,{x:.55,y:.72,w:5.7,h:.55,fontSize:25,bold:true,color:'17243A'})
          slide.addText(`ปิดแล้ว ${pct(m.closedRatio)} • เหลือติดตาม ${m.remaining} ห้อง`,{x:.55,y:1.34,w:5.4,h:.4,fontSize:16,bold:true,color:'233A5D'})
          const items=CONDO_STATUS.map(s=>({s,count:m.total?condoRooms.filter(r=>(r.building===building||r.room_no.startsWith(building))&&r.status_group===s.group).length:0}))
          items.forEach(({s,count},idx)=>{ const x=.55+(idx%2)*2.65; const y=1.95+Math.floor(idx/2)*.78; slide.addText(`${s.label}\n${count} ห้อง (${m.total?Math.round(count/m.total*100):0}%)`,{x,y,w:2.48,h:.62,fontSize:11,bold:true,color:s.color.replace('#',''),fill:{color:s.light.replace('#','')},line:{color:s.color.replace('#',''),width:1.4},margin:.09,breakLine:false}) })
          slide.addText(`Defect ยังไม่เสร็จ: ${m.incompleteRooms.length?m.incompleteRooms.join(', '):'ไม่มี'}`,{x:.55,y:4.45,w:5.35,h:.55,fontSize:11,color:'27364A',fill:{color:'FFF4F2'},line:{color:'E4B5B0',width:1},margin:.09})
          const positions=[{x:6.15,y:.75,w:3.05,h:2.75},{x:9.35,y:.75,w:3.05,h:2.75},{x:6.15,y:3.7,w:3.05,h:2.75},{x:9.35,y:3.7,w:3.05,h:2.75}]
          for(let n=0;n<Math.min(4,cPhotos.length);n++){ const data=await urlToDataUri(cPhotos[n].image_url,imageCache); if(data) slide.addImage({data,...positions[n]}) }
          if(!cPhotos.length) slide.addText('Picture - Defect Done',{x:7.1,y:2.7,w:4.4,h:.6,fontSize:17,bold:true,color:'2F6FB0',align:'center',hyperlink:{url:DEFECT_DONE_URL}})
          continue
        }

        const projectTasks=periodTasks.filter(t=>t.project_id===project.id); const projectStat=stats.find(x=>x.project.id===project.id); const cover=pptxFile.addSlide(); cover.background={color:'F6F2E9'}
        cover.addText('3 KINGS CONSTRUCTION',{x:.65,y:.45,w:4.2,h:.3,fontSize:11,bold:true,color:'A97920',charSpacing:1.5}); cover.addText(project.name,{x:.65,y:1.0,w:8.5,h:.65,fontSize:28,bold:true,color:'17243A'}); cover.addText(`${dateTH(startDate)} – ${dateTH(endDate)}`,{x:.65,y:1.75,w:5,h:.35,fontSize:14,color:'687486'})
        cover.addText(`Actual ${pct(projectStat?.actual||0)}   |   Plan ${pct(projectStat?.plan||0)}   |   งานในช่วง ${projectTasks.length} รายการ`,{x:.65,y:2.35,w:7.7,h:.45,fontSize:17,bold:true,color:'233A5D'}); cover.addText(`Delayed ${projectStat?.delayed||0}   •   Completed ${projectStat?.completed||0}   •   Latest photo ${imageDateLabel(projectStat?.latestPhotoDate)}`,{x:.65,y:2.95,w:8.7,h:.35,fontSize:13,color:'6D7785'})
        const projectPhotos=pickPhotos(project.id); for(let n=0;n<Math.min(2,projectPhotos.length);n++){ const data=await urlToDataUri(projectPhotos[n].image_url,imageCache); if(data) cover.addImage({data,x:8.55+n*2.05,y:1.0,w:1.9,h:3.35}) }
        if(!projectPhotos.length&&PHOTO_SOURCES[project.code]) cover.addText('Picture Progress available in Google Drive',{x:8.55,y:1.2,w:3.9,h:.6,fontSize:16,bold:true,color:'2F6FB0',hyperlink:{url:PHOTO_SOURCES[project.code]}})
        for(let idx=0;idx<projectTasks.length;idx++){
          const task=projectTasks[idx]; const slide=pptxFile.addSlide(); slide.background={color:'FFFDF9'}; slide.addText(`${project.code}  •  ${task.category||'งานก่อสร้าง'}`,{x:.55,y:.35,w:4.8,h:.3,fontSize:11,bold:true,color:'A97920'}); slide.addText(task.task_name,{x:.55,y:.75,w:7.2,h:.72,fontSize:23,bold:true,color:'17243A'}); slide.addText(`${task.area||'-'}   |   Plan ${dateTH(task.planned_start)} → ${dateTH(task.planned_end)}`,{x:.55,y:1.52,w:7.2,h:.35,fontSize:12,color:'687486'}); slide.addText(`ACTUAL ${pct(task.actual_progress)}   •   ${task.site_status||'ยังไม่ระบุสถานะ'}`,{x:.55,y:2.02,w:4.8,h:.45,fontSize:18,bold:true,color:(task.delay_days||0)>0?'A73530':'1C6A49'}); slide.addText(shortNote(task),{x:.55,y:2.65,w:5.3,h:1.15,fontSize:14,color:'27364A',valign:'top',margin:.08,fill:{color:'F3F0E8'},line:{color:'DDD5C7',width:1}})
          const taskPhotos=pickPhotos(project.id,task.id); const positions=[{x:6.15,y:.75,w:3.05,h:2.75},{x:9.35,y:.75,w:3.05,h:2.75},{x:6.15,y:3.7,w:3.05,h:2.75},{x:9.35,y:3.7,w:3.05,h:2.75}]
          for(let n=0;n<Math.min(4,taskPhotos.length);n++){ const data=await urlToDataUri(taskPhotos[n].image_url,imageCache); if(data) slide.addImage({data,...positions[n]}) }
          if(!taskPhotos.length&&PHOTO_SOURCES[project.code]) slide.addText('เปิด Picture Progress ใน Google Drive',{x:7.1,y:2.7,w:4.4,h:.6,fontSize:17,bold:true,color:'2F6FB0',align:'center',hyperlink:{url:PHOTO_SOURCES[project.code]}})
          slide.addText(`${idx+1} / ${projectTasks.length}`,{x:11.5,y:6.95,w:1.1,h:.22,fontSize:9,color:'8A919A',align:'right'})
        }
      }
      await pptxFile.writeFile({fileName:`Executive-Presentation_${fileSafe(startDate)}_${fileSafe(endDate)}.pptx`,compression:true})
    }finally{setExporting('')}
  }
  const exportPdf=()=>{ if(exporting)return; setExporting('pdf'); window.setTimeout(()=>{window.print();setExporting('')},80) }

  return <AppShell>
    <PageHeader title="Executive Presentation" subtitle="Villa / Mirage ใช้ Progress Sheet • Above Condo ใช้ Defect / Handover Status แยกตึก A, B" />
    <section className="panel ep-filter">
      <div className="ep-filters">
        <label>Site / Plot<select value={projectFilter} onChange={e=>{setProjectFilter(e.target.value);setView('overview')}}><option value="">ทุกโครงการที่มีข้อมูล</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
        <label>เริ่มวันที่<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label>ถึงวันที่<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        <label>รูปประกอบ<select value={photoMode} onChange={e=>setPhotoMode(e.target.value as PhotoMode)}><option value="latest">รูปล่าสุด</option><option value="before_after">Before–After (ถ้ามี)</option></select></label>
      </div>
      <div className="ep-meta"><span>Schedule Sync: <b>{formatDateTime(latestScheduleSync)}</b></span><span>Photo Index Sync: <b>{formatDateTime(latestPhotoSync)}</b></span><span>รูปช่วงนี้: <b>{photosInPeriod.length}</b></span><span>งานตามแผน: <b>{periodTasks.length}</b></span><span>Condo Status: <b>{condoRooms.length} ห้อง</b></span></div>
    </section>
    <div className="ep-actions"><div>{view==='slides'&&<button className="button" onClick={()=>setView('overview')}>← กลับภาพรวม</button>}</div><div><button className="button" onClick={exportPdf} disabled={Boolean(exporting)}>{exporting==='pdf'?'กำลังเตรียม…':'ดาวน์โหลด PDF'}</button><button className="button primary" onClick={exportPptx} disabled={Boolean(exporting)}>{exporting==='pptx'?'กำลังสร้าง PowerPoint…':'ดาวน์โหลด PowerPoint'}</button></div></div>

    {loading?<div className="panel">กำลังเตรียม Executive Presentation…</div>:view==='overview'?<section className="ep-overview">
      {visibleProjects.map(project=>{
        const building=condoBuilding(project.code)
        if(building){
          const m=metricFor(building); const cPhotos=pickCondoPhotos(building,project.id); const cover=cPhotos[0]
          return <article key={project.id} className="ep-card condo-card">
            <div className="ep-cover">{cover?<img src={cover.image_url} alt={cover.caption}/>:<div className="ep-cover-empty"><b>CONDO {building}</b><span>รูปจาก Picture - Defect Done</span></div>}<div className="ep-cover-title"><span>Above Condo • Defect / Handover</span><b>{project.name}</b></div></div>
            <div className="ep-card-body">
              <div className="condo-kpis"><div className="good"><span>ปิดแล้ว</span><b>{pct(m.closedRatio)}</b></div><div className="warn"><span>ต้องติดตาม</span><b>{m.remaining}<em>ห้อง</em></b></div><div className="danger"><span>Defect ยังไม่เสร็จ</span><b>{m.incomplete}<em>ห้อง</em></b></div></div>
              <div className="condo-tone-row"><span className="danger">แดง <b>{m.red}</b> ({m.total?Math.round(m.red/m.total*100):0}%)</span><span className="warn">เหลือง <b>{m.yellow}</b> ({m.total?Math.round(m.yellow/m.total*100):0}%)</span><span className="good">เขียว <b>{m.green}</b> ({m.total?Math.round(m.green/m.total*100):0}%)</span><span className="neutral">เทา <b>{m.grey}</b> ({m.total?Math.round(m.grey/m.total*100):0}%)</span></div>
              <div className="ep-card-meta"><span>ห้องทั้งหมด <b>{m.total}</b></span><span>มีลูกค้า Defect ค้าง <b>{m.customerIncomplete}</b></span><span>ไม่มีลูกค้า Defect ค้าง <b>{m.noCustomerIncomplete}</b></span><span>รูป Defect Done <b>{cPhotos.length}</b></span></div>
              <div className="ep-card-meta"><span>อัปเดต Defect ล่าสุด <b>{formatDateTime(m.latestUpdate)}</b></span></div>
              <button className="button primary ep-open" onClick={()=>openProject(project.id)}>นำเสนอ Defect ตึก {building} →</button>
              <a className="ep-drive-link" href={DEFECT_DONE_URL} target="_blank" rel="noreferrer">เปิด Picture - Defect Done ↗</a>
            </div>
          </article>
        }
        const s=stats.find(x=>x.project.id===project.id); if(!s)return null; const cover=pickPhotos(project.id)[0]; const driveUrl=PHOTO_SOURCES[project.code]
        return <article key={project.id} className="ep-card">
          <div className="ep-cover">{cover?<img src={cover.image_url} alt={cover.caption}/>:<div className="ep-cover-empty"><b>{project.code}</b><span>{driveUrl?'มี Picture Progress ใน Drive':'ยังไม่มีรูปที่เชื่อม'}</span></div>}<div className="ep-cover-title"><span>{project.site_group||'Project'}</span><b>{project.name}</b></div></div>
          <div className="ep-card-body"><div className="ep-kpis"><div><span>Actual</span><b>{pct(s.actual)}</b></div><div><span>Plan</span><b>{pct(s.plan)}</b></div><div><span>Variance</span><b className={s.variance<0?'danger-text':''}>{s.variance>0?'+':''}{Math.round(s.variance*100)}%</b></div></div><div className="ep-card-meta"><span>งาน <b>{s.tasks.length}</b></span><span>ล่าช้า <b>{s.delayed}</b></span><span>เสร็จ <b>{s.completed}</b></span><span>รูป <b>{s.photoCount}</b></span></div><div className="ep-card-meta"><span>รูปล่าสุด <b>{imageDateLabel(s.latestPhotoDate)}</b></span>{project.target_handover&&<span>Handover <b>{dateTH(project.target_handover)}</b></span>}</div>
          {s.tasks.length?<button className="button primary ep-open" onClick={()=>openProject(project.id)}>เริ่มนำเสนอ {s.tasks.length} งาน →</button>:<div className="ep-no-schedule"><b>ยังไม่มี Progress Sheet ใน Supabase สำหรับช่วงนี้</b>{driveUrl&&<a href={driveUrl} target="_blank" rel="noreferrer">เปิด Picture Progress ↗</a>}</div>}</div>
        </article>
      })}
      {!visibleProjects.length&&<div className="panel">ไม่พบโครงการตามตัวกรอง</div>}
    </section>:<div ref={stageRef} className="ep-stage">
      {selectedProject&&selectedBuilding&&selectedCondoMetric?<>
        <div className="ep-stage-controls"><div><span>Above Condo {selectedBuilding} • Defect / Handover</span></div><button className="button" onClick={toggleFullscreen}>⛶ Fullscreen</button></div>
        <article className="ep-slide condo-slide">
          <header><div><span className="ep-eyebrow">CONDO {selectedBuilding} • DEFECT / HANDOVER STATUS</span><h2>{selectedProject.name}</h2><p>ข้อมูลสถานะเดียวกับกราฟวงกลมหน้า Dashboard • ห้องขึ้นต้น {selectedBuilding} = ตึก {selectedBuilding}</p></div><a className="button" href={DEFECT_DONE_URL} target="_blank" rel="noreferrer">Picture - Defect Done ↗</a></header>
          <div className="ep-slide-body condo-body">
            <section className="condo-status-panel">
              <div className="condo-progress good"><span>สถานะปิดแล้ว (สีเขียว)</span><b>{pct(selectedCondoMetric.closedRatio)}</b><i><em style={{width:`${Math.round(selectedCondoMetric.closedRatio*100)}%`}}/></i><small>Hotel ตรวจแล้ว + ส่งมอบแล้ว / ห้องทั้งหมด {selectedCondoMetric.total}</small></div>
              <div className="condo-summary-grid"><div><span>ต้องติดตาม</span><b>{selectedCondoMetric.remaining}<em>ห้อง</em></b></div><div><span>Defect ยังไม่เสร็จ</span><b>{selectedCondoMetric.incomplete}<em>ห้อง</em></b></div><div><span>มีลูกค้า</span><b>{selectedCondoMetric.customerIncomplete}<em>ห้อง</em></b></div><div><span>ไม่มีลูกค้า</span><b>{selectedCondoMetric.noCustomerIncomplete}<em>ห้อง</em></b></div></div>
              <div className="condo-six-status">{CONDO_STATUS.map(s=>{ const count=condoRooms.filter(r=>(r.building===selectedBuilding||r.room_no.startsWith(selectedBuilding))&&r.status_group===s.group).length; const percent=selectedCondoMetric.total?Math.round(count/selectedCondoMetric.total*100):0; return <div key={s.group} className={`condo-status-box ${s.tone}`}><span>{s.label}</span><b>{count}<em>ห้อง</em></b><small>{percent}% ของตึก {selectedBuilding}</small></div>})}</div>
              <div className="condo-incomplete-list"><span>ห้อง Defect ยังไม่เสร็จ</span><p>{selectedCondoMetric.incompleteRooms.length?selectedCondoMetric.incompleteRooms.join(', '):'ไม่มี'}</p></div>
              <div className="condo-source-note">อัปเดตสถานะล่าสุด: <b>{formatDateTime(selectedCondoMetric.latestUpdate)}</b> • ใช้ข้อมูล Defect/Handover แทน Progress Sheet สำหรับ Condo</div>
            </section>
            <section className="ep-photo-section"><div className="ep-photo-head"><div><b>Defect Done — ตึก {selectedBuilding}</b><span>ดึงรูปตามเลขห้อง: Axxx = ตึก A, Bxxx = ตึก B</span></div><a href={DEFECT_DONE_URL} target="_blank" rel="noreferrer">เปิดโฟลเดอร์ ↗</a></div>{selectedCondoPhotos.length?<div className={`ep-photo-grid count-${selectedCondoPhotos.length}`}>{selectedCondoPhotos.map(photo=><figure key={photo.id}><img src={photo.image_url} alt={photo.caption}/><figcaption><div><b>{photo.room_no||'Defect Done'}</b><span>{photo.folder_name||sourceLabel(photo.source)}</span></div><span>{imageDateLabel(photo.report_date)}</span></figcaption></figure>)}</div>:<div className="ep-photo-empty"><b>ยังไม่มีรูป Defect Done ใน Photo Index ของตึก {selectedBuilding}</b><span>กด “เปิดโฟลเดอร์” เพื่อดูรูปใน Drive ได้ทันที</span></div>}</section>
          </div>
        </article>
      </>:currentTask&&selectedProject?<><div className="ep-stage-controls"><div><button className="button" onClick={()=>setSlideIndex(i=>Math.max(0,i-1))} disabled={slideIndex===0}>← Previous</button><span>{slideIndex+1} / {selectedTasks.length}</span><button className="button" onClick={()=>setSlideIndex(i=>Math.min(selectedTasks.length-1,i+1))} disabled={slideIndex>=selectedTasks.length-1}>Next →</button></div><button className="button" onClick={toggleFullscreen}>⛶ Fullscreen</button></div>
        <article className="ep-slide"><header><div><span className="ep-eyebrow">{selectedProject.code} • {currentTask.category||'งานก่อสร้าง'}</span><h2>{currentTask.task_name}</h2><p>{currentTask.area||'-'} • Plan {dateTH(currentTask.planned_start)} → {dateTH(currentTask.planned_end)}</p></div><StatusBadge value={currentTask.site_status}/></header><div className="ep-slide-body"><section className="ep-task-info"><div className="ep-progress"><span>ACTUAL PROGRESS</span><b>{pct(currentTask.actual_progress)}</b><i><em style={{width:`${Math.max(0,Math.min(100,Math.round((currentTask.actual_progress||0)*100)))}%`}}/></i></div><div className="ep-info-grid"><div><span>Plan</span><b>{pct(currentTask.current_plan_progress)}</b></div><div><span>Variance</span><b className={(currentTask.current_variance||0)<0?'danger-text':''}>{(currentTask.current_variance||0)>0?'+':''}{Math.round((currentTask.current_variance||0)*100)}%</b></div><div><span>Delay</span><b>{(currentTask.delay_days||0)>0?`${currentTask.delay_days} วัน`:'—'}</b></div><div><span>อัปเดต</span><b>{dateTH(currentTask.source_updated_at)}</b></div></div><div className="ep-note"><span>หมายเหตุ / งานถัดไป</span><p>{shortNote(currentTask)}</p></div>{(currentTask.contractor||currentTask.responsible_person)&&<div className="ep-owner">ผู้รับผิดชอบ: <b>{currentTask.contractor||currentTask.responsible_person}</b></div>}</section>
        <section className="ep-photo-section"><div className="ep-photo-head"><div><b>{photoMode==='latest'?'รูปล่าสุด':'Before–After'}</b><span>วันที่รูปล่าสุด: {imageDateLabel(currentPhotos[0]?.report_date)}</span></div>{currentDriveUrl&&<a href={currentDriveUrl} target="_blank" rel="noreferrer">เปิด Picture Progress ↗</a>}</div>{!taskHasDirectPhotos&&currentPhotos.length>0&&<div className="ep-fallback-note">ยังไม่มีรูปที่จับคู่ตรง Task นี้ — กำลังแสดงรูปล่าสุดระดับ Plot เป็น fallback</div>}{currentPhotos.length?<div className={`ep-photo-grid count-${currentPhotos.length}`}>{currentPhotos.map(photo=><figure key={photo.id}><img src={photo.image_url} alt={photo.caption}/><figcaption><div><b>{phaseLabel(photo.phase,Boolean(photo.task_id))}</b><span>{sourceLabel(photo.source)}</span></div><span>{imageDateLabel(photo.report_date)}</span></figcaption></figure>)}</div>:<div className="ep-photo-empty"><b>ยังไม่มีรูปประกอบในช่วงที่เลือก</b><span>Photo Index จะเติมรูปจาก Picture Progress เมื่อ Sync เข้ามา</span></div>}</section></div></article></>:<div className="panel">ไม่มีงานในช่วงวันที่ที่เลือก</div>}
    </div>}

    <style jsx global>{`
      .ep-filter{margin-bottom:12px}.ep-filters{display:grid;grid-template-columns:2fr 1fr 1fr 1.35fr;gap:10px}.ep-filters label{font-size:12px;font-weight:800;color:var(--muted);display:grid;gap:5px}.ep-filters select,.ep-filters input{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--navy-2)}.ep-meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;font-size:11px;color:var(--muted)}.ep-actions{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:0 0 12px}.ep-actions>div:last-child{display:flex;gap:8px}.ep-overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:14px}.ep-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(20,31,48,.06)}.ep-cover{height:210px;background:#e9e5dc;position:relative;overflow:hidden}.ep-cover img{width:100%;height:100%;object-fit:cover}.ep-cover:after{content:'';position:absolute;inset:40% 0 0;background:linear-gradient(transparent,rgba(9,21,38,.7))}.ep-cover-empty{height:100%;display:grid;place-content:center;text-align:center;gap:4px;color:var(--muted)}.ep-cover-empty b{font-size:28px;color:var(--navy-2)}.ep-cover-title{position:absolute;left:16px;right:16px;bottom:14px;z-index:2;color:white}.ep-cover-title span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:1.4px;opacity:.78}.ep-cover-title b{display:block;font-size:20px;margin-top:2px}.ep-card-body{padding:14px}.ep-kpis,.condo-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ep-kpis>div,.condo-kpis>div{padding:9px;border-radius:11px;background:var(--surface-2);border:1px solid transparent}.ep-kpis span,.ep-info-grid span,.condo-kpis span{display:block;font-size:10px;color:var(--muted);font-weight:800}.ep-kpis b,.condo-kpis b{display:block;margin-top:2px;font-size:20px}.condo-kpis b em{font-size:9px;font-style:normal;margin-left:3px;color:var(--muted)}.condo-kpis .danger{background:#fff2f1;border-color:#edcac6}.condo-kpis .danger b{color:#b23c36}.condo-kpis .warn{background:#fff8e7;border-color:#ead8a4}.condo-kpis .warn b{color:#96630d}.condo-kpis .good{background:#eef9f3;border-color:#cce5d6}.condo-kpis .good b{color:#247951}.condo-tone-row{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:9px}.condo-tone-row span{padding:6px 5px;border-radius:8px;font-size:8.5px;text-align:center;font-weight:800}.condo-tone-row .danger{background:#fff2f1;color:#a93d37}.condo-tone-row .warn{background:#fff8e7;color:#93610d}.condo-tone-row .good{background:#eef9f3;color:#247951}.condo-tone-row .neutral{background:#f1f3f5;color:#606a75}.ep-card-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px;font-size:11px;color:var(--muted)}.ep-open{width:100%;margin-top:12px}.ep-drive-link{display:block;text-align:center;margin-top:7px;color:var(--blue);font-size:10px;font-weight:800}.ep-no-schedule{margin-top:12px;padding:10px;border-radius:10px;background:var(--surface-2);display:grid;gap:5px;font-size:11px}.ep-no-schedule a,.ep-photo-head a{color:var(--blue);font-weight:800}.ep-stage{background:#101722;padding:14px;border-radius:18px}.ep-stage:fullscreen{padding:24px;background:#0d1522;overflow:auto}.ep-stage-controls{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;color:#d9e1ee}.ep-stage-controls>div{display:flex;align-items:center;gap:10px}.ep-slide{background:#fffdf9;border-radius:14px;min-height:650px;padding:24px;display:grid;grid-template-rows:auto 1fr}.ep-slide>header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:1px solid #e7e1d6;padding-bottom:14px}.ep-slide h2{font-size:27px;line-height:1.18;margin:6px 0 4px;color:#17243a}.ep-slide header p{margin:0;color:#6b7480;font-size:12px}.ep-eyebrow{font-size:10px;font-weight:900;letter-spacing:1px;color:#a97920}.ep-slide-body{display:grid;grid-template-columns:minmax(280px,.82fr) minmax(0,1.8fr);gap:20px;padding-top:18px}.ep-task-info{display:grid;align-content:start;gap:12px}.ep-progress,.condo-progress{border:1px solid #ddd5c7;border-radius:14px;padding:16px;background:#f8f5ed}.ep-progress>span,.condo-progress>span{font-size:10px;font-weight:900;color:#7a705f;letter-spacing:.8px}.ep-progress>b,.condo-progress>b{display:block;font-size:42px;color:#17243a}.ep-progress i,.condo-progress i{height:8px;display:block;background:#e4ded3;border-radius:99px;overflow:hidden}.ep-progress em{height:100%;display:block;background:#315f9e}.condo-progress.good{background:#eef9f3;border-color:#cbe5d5}.condo-progress.good>b{color:#247951}.condo-progress.good i{background:#d7e9de}.condo-progress.good i em{display:block;height:100%;background:#2e9a6a}.condo-progress small{display:block;margin-top:7px;font-size:9px;color:#647166}.ep-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ep-info-grid>div{padding:10px;border:1px solid #e4ddd1;border-radius:10px}.ep-info-grid b{display:block;font-size:15px;margin-top:2px}.ep-note{padding:12px;border-radius:12px;background:#f3f0e8}.ep-note span{font-size:10px;font-weight:900;color:#756d5e}.ep-note p{margin:5px 0 0;line-height:1.45;font-size:13px}.ep-owner{font-size:11px;color:#6d7480}.ep-photo-section{min-width:0}.ep-photo-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:8px}.ep-photo-head>div{display:grid;gap:2px}.ep-photo-head b{font-size:15px}.ep-photo-head span{font-size:10px;color:#707988}.ep-fallback-note{padding:7px 10px;margin-bottom:8px;border-radius:9px;background:#fff3cd;color:#6d5510;font-size:10px;font-weight:800}.ep-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ep-photo-grid.count-1{grid-template-columns:1fr}.ep-photo-grid figure{margin:0;border:1px solid #e3ddd4;border-radius:12px;overflow:hidden;background:#f2eee6}.ep-photo-grid img{display:block;width:100%;height:235px;object-fit:cover}.ep-photo-grid.count-1 img{height:500px}.ep-photo-grid figcaption{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 9px;background:white;font-size:10px;color:#6f7781}.ep-photo-grid figcaption>div{display:grid;gap:1px;min-width:0}.ep-photo-grid figcaption b{color:#263850}.ep-photo-grid figcaption div span{font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ep-photo-empty{height:480px;border:1px dashed #d8d1c6;border-radius:12px;display:grid;place-content:center;text-align:center;gap:4px;color:#7d8490}.ep-photo-empty b{color:#25364b}.danger-text{color:#a73530!important}
      .condo-body{grid-template-columns:minmax(360px,1fr) minmax(0,1.45fr)}.condo-status-panel{display:grid;align-content:start;gap:10px}.condo-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.condo-summary-grid>div{border:1px solid #e1ddd5;border-radius:10px;padding:9px;background:#faf8f3}.condo-summary-grid span{display:block;font-size:9px;font-weight:800;color:#747b84}.condo-summary-grid b{display:block;font-size:19px;color:#24364b;margin-top:2px}.condo-summary-grid b em{font-size:8px;font-style:normal;margin-left:3px;color:#858d96}.condo-six-status{display:grid;grid-template-columns:1fr 1fr;gap:7px}.condo-status-box{border:1px solid var(--line);border-left-width:5px;border-radius:10px;padding:8px 9px}.condo-status-box>span{display:block;font-size:9.5px;font-weight:850;line-height:1.3}.condo-status-box>b{display:flex;align-items:baseline;gap:4px;margin-top:4px;font-size:18px}.condo-status-box>b em{font-size:8px;font-style:normal}.condo-status-box>small{display:block;margin-top:3px;font-size:8px}.condo-status-box.danger{background:#fff2f1;border-color:#edcac6;border-left-color:#d84d45;color:#9f3530}.condo-status-box.warn{background:#fff8e7;border-color:#ead8a4;border-left-color:#e2ad32;color:#8b5b0d}.condo-status-box.good{background:#eef9f3;border-color:#cce5d6;border-left-color:#2e9a6a;color:#206d49}.condo-status-box.neutral{background:#f1f3f5;border-color:#d8dde2;border-left-color:#7c8794;color:#59636d}.condo-incomplete-list{padding:10px;border-radius:10px;background:#fff3f1;border:1px solid #ebc9c4}.condo-incomplete-list span{font-size:9px;font-weight:850;color:#9f3530}.condo-incomplete-list p{margin:4px 0 0;font-size:11px;line-height:1.4;color:#573b39}.condo-source-note{font-size:9px;color:#717985;line-height:1.4}
      @media(max-width:950px){.ep-filters{grid-template-columns:1fr 1fr}.ep-slide-body,.condo-body{grid-template-columns:1fr}.ep-photo-grid img{height:260px}.ep-photo-grid.count-1 img{height:360px}}
      @media(max-width:620px){.ep-filters{grid-template-columns:1fr}.ep-actions{align-items:flex-start;flex-direction:column}.ep-stage{padding:6px}.ep-stage-controls{align-items:stretch;flex-direction:column}.ep-slide{padding:14px}.ep-slide h2{font-size:21px}.ep-photo-grid{grid-template-columns:1fr}.ep-photo-grid img,.ep-photo-grid.count-1 img{height:260px}.condo-tone-row{grid-template-columns:1fr 1fr}.condo-kpis{grid-template-columns:1fr}.condo-six-status{grid-template-columns:1fr}}
      @media print{.sidebar,.mobile-nav,.page-header,.ep-filter,.ep-actions,.ep-stage-controls{display:none!important}.main{margin:0!important;padding:0!important}.ep-overview{display:block}.ep-card{break-after:page;border:none;box-shadow:none}.ep-stage{padding:0;background:white}.ep-slide{min-height:95vh;border-radius:0;break-after:page}.ep-photo-grid img{height:250px}}
    `}</style>
  </AppShell>
}
