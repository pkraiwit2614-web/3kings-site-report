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
  id:string; project_id:string; schedule_task_id:string|null; drive_file_id:string; file_name:string; drive_url:string;
  photo_date:string; phase:string; match_method:string; match_score:number|null; indexed_at:string; is_active:boolean
}
type PresentationPhoto = {
  id:string; project_id:string; task_id:string|null; report_date:string; phase:string; caption:string;
  image_url:string; source:'site-report'|'drive'; matched:boolean; source_url?:string
}
type ProjectStats = {
  project:Project; tasks:PresentationTask[]; plan:number; actual:number; variance:number; delayed:number;
  completed:number; latestPhotoDate:string|null; photoCount:number; matchedPhotoCount:number
}

const PHOTO_SOURCES: Record<string,string> = {
  'AV-P6':'https://drive.google.com/drive/folders/18WfplWKvZ7DWfjVgO7oVHA4dtlbuuzfr',
  'AV-P7':'https://drive.google.com/drive/folders/1ZmlxctN0yAXamSmXTNzjx0t3GJu_aLiI',
  'AV-P8':'https://drive.google.com/drive/folders/1T1eWjtfuNhtI8hrm-Jac5tKeZNfbJaXY',
  'AV-P9':'https://drive.google.com/drive/folders/1f4YCTjwd8E0dHgbyf8eF7XeC5kSj5j_6',
  'CONDO-A':'https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK',
  'CONDO-B':'https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK',
  'MIRAGE':'https://drive.google.com/drive/folders/1uq_XoSsAZt-bxhRJPhVtpSbdHkygku3h',
  'PROUD-KARON':'https://drive.google.com/drive/folders/1uduc_Zk3AV6ufijjrwNs8Coq_dESC2_p',
}

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
  if(!matched) return 'รูปภาพรวม Plot'
  if(phase==='before') return 'ก่อนทำ'; if(phase==='after') return 'หลังทำ'; if(phase==='during') return 'ระหว่างทำ'; return 'รูปหน้างาน'
}
function sourceLabel(source:PresentationPhoto['source']){ return source==='drive'?'Drive Picture Progress':'Site Report' }
function imageDateLabel(value:string|null|undefined){ return value?dateTH(value):'-' }
function fileSafe(value:string){ return value.replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim() }
async function urlToDataUri(url:string,cache:Map<string,string>){
  if(cache.has(url)) return cache.get(url)||''
  try{
    const res=await fetch(url); if(!res.ok) return ''
    const blob=await res.blob(); const data=await new Promise<string>((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=()=>reject(r.error); r.readAsDataURL(blob) })
    cache.set(url,data); return data
  }catch{return ''}
}
function formatDateTime(value:string|null){
  if(!value) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
}

export default function ExecutivePresentationV35(){
  const bounds=useMemo(()=>monthBounds(),[])
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<PresentationTask[]>([])
  const [photos,setPhotos]=useState<PresentationPhoto[]>([])
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
      const [p,t,r,i,rp,dp,ss,ps]=await Promise.all([
        s.from('projects').select('*').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('*').order('planned_start'),
        s.from('daily_reports').select('id,project_id,report_date').order('report_date',{ascending:false}),
        s.from('report_items').select('id,daily_report_id,schedule_task_id,work_item'),
        s.from('report_photos').select('id,daily_report_id,report_item_id,storage_path,phase,caption,created_at').order('created_at',{ascending:false}),
        s.from('drive_photo_index').select('id,project_id,schedule_task_id,drive_file_id,file_name,drive_url,photo_date,phase,match_method,match_score,indexed_at,is_active').eq('is_active',true).order('photo_date',{ascending:false}),
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
      }))
      setProjects(projectRows); setTasks(taskRows); setPhotos([...sitePhotos,...drivePhotos]); setLatestScheduleSync(ss.data?.created_at||null); setLatestPhotoSync(ps.data?.created_at||null); setLoading(false)
    }
    load().catch(()=>setLoading(false)); return()=>{cancelled=true}
  },[])

  const periodTasks=useMemo(()=>tasks.filter(t=>overlaps(t,startDate,endDate)),[tasks,startDate,endDate])
  const visibleProjects=useMemo(()=>projects.filter(p=>!projectFilter||p.id===projectFilter),[projects,projectFilter])
  const photosInPeriod=useMemo(()=>photos.filter(p=>p.report_date>=startDate&&p.report_date<=endDate),[photos,startDate,endDate])

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
      if(chronological[0].report_date!==chronological[chronological.length-1].report_date){ chosen.push(chronological[0],chronological[chronological.length-1]) }
    }
    for(const p of pool){ if(chosen.length>=4) break; if(!chosen.some(x=>x.id===p.id)) chosen.push(p) }
    return chosen.slice(0,4)
  }

  const stats=useMemo<ProjectStats[]>(()=>visibleProjects.map(project=>{
    const list=periodTasks.filter(t=>t.project_id===project.id); const projectPhotos=photosInPeriod.filter(p=>p.project_id===project.id)
    const plan=list.length?list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length:0; const actual=list.length?list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length:0
    const latestPhotoDate=projectPhotos.reduce<string|null>((latest,p)=>!latest||p.report_date>latest?p.report_date:latest,null)
    return {project,tasks:list,plan,actual,variance:actual-plan,delayed:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length,completed:list.filter(t=>(t.actual_progress||0)>=1).length,latestPhotoDate,photoCount:projectPhotos.length,matchedPhotoCount:projectPhotos.filter(p=>p.matched).length}
  }),[visibleProjects,periodTasks,photosInPeriod])

  const selectedProject=projects.find(p=>p.id===selectedProjectId)||null
  const selectedTasks=useMemo(()=>periodTasks.filter(t=>t.project_id===selectedProjectId),[periodTasks,selectedProjectId])
  const currentTask=selectedTasks[slideIndex]||null
  const currentPhotos=currentTask?pickPhotos(currentTask.project_id,currentTask.id):[]
  const taskHasDirectPhotos=currentTask?photosInPeriod.some(p=>p.project_id===currentTask.project_id&&p.task_id===currentTask.id):false
  const currentDriveUrl=selectedProject?PHOTO_SOURCES[selectedProject.code]:''

  useEffect(()=>{ if(slideIndex>=selectedTasks.length) setSlideIndex(Math.max(0,selectedTasks.length-1)) },[selectedTasks.length,slideIndex])
  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(view!=='slides')return; if(e.key==='ArrowRight'||e.key==='PageDown')setSlideIndex(i=>Math.min(selectedTasks.length-1,i+1)); if(e.key==='ArrowLeft'||e.key==='PageUp')setSlideIndex(i=>Math.max(0,i-1)); if(e.key==='Escape'&&!document.fullscreenElement)setView('overview') }; window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey) },[view,selectedTasks.length])

  const openProject=(id:string)=>{ setSelectedProjectId(id); setSlideIndex(0); setView('slides'); window.scrollTo({top:0,behavior:'smooth'}) }
  const toggleFullscreen=async()=>{ if(document.fullscreenElement) await document.exitFullscreen(); else await stageRef.current?.requestFullscreen() }
  const exportProjects=useMemo(()=>view==='slides'&&selectedProject?[selectedProject]:visibleProjects,[view,selectedProject,visibleProjects])

  const exportPptx=async()=>{
    if(exporting)return; setExporting('pptx')
    try{
      const mod=await import('pptxgenjs'); const PptxGenJS=mod.default; const pptxFile=new PptxGenJS(); pptxFile.layout='LAYOUT_WIDE'; pptxFile.author='3 Kings Construction'; pptxFile.company='3 Kings Construction'; pptxFile.subject='Executive Presentation View'; pptxFile.title='3 Kings Construction Executive Presentation'
      const imageCache=new Map<string,string>()
      for(const project of exportProjects){
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
    <PageHeader title="Executive Presentation" subtitle="เลือก Site / Plot และช่วงวันที่ • ภาพรวมก่อน แล้วนำเสนอ 1 งานต่อ 1 หน้า • รูปจาก Site Report + Drive Picture Progress" />
    <section className="panel ep-filter">
      <div className="ep-filters">
        <label>Site / Plot<select value={projectFilter} onChange={e=>{setProjectFilter(e.target.value);setView('overview')}}><option value="">ทุกโครงการที่มีข้อมูล</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
        <label>เริ่มวันที่<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label>ถึงวันที่<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        <label>รูปประกอบ<select value={photoMode} onChange={e=>setPhotoMode(e.target.value as PhotoMode)}><option value="latest">รูปล่าสุด</option><option value="before_after">Before–After (ถ้ามี)</option></select></label>
      </div>
      <div className="ep-meta"><span>Schedule Sync: <b>{formatDateTime(latestScheduleSync)}</b></span><span>Photo Index Sync: <b>{formatDateTime(latestPhotoSync)}</b></span><span>รูปช่วงนี้: <b>{photosInPeriod.length}</b></span><span>จับคู่ Task: <b>{photosInPeriod.filter(p=>p.matched).length}</b></span><span>งานตามแผน: <b>{periodTasks.length}</b></span></div>
    </section>
    <div className="ep-actions"><div>{view==='slides'&&<button className="button" onClick={()=>setView('overview')}>← กลับภาพรวม</button>}</div><div><button className="button" onClick={exportPdf} disabled={Boolean(exporting)}>{exporting==='pdf'?'กำลังเตรียม…':'ดาวน์โหลด PDF'}</button><button className="button primary" onClick={exportPptx} disabled={Boolean(exporting)}>{exporting==='pptx'?'กำลังสร้าง PowerPoint…':'ดาวน์โหลด PowerPoint'}</button></div></div>

    {loading?<div className="panel">กำลังเตรียม Executive Presentation…</div>:view==='overview'?<section className="ep-overview">
      {stats.map(s=>{ const cover=pickPhotos(s.project.id)[0]; const driveUrl=PHOTO_SOURCES[s.project.code]; return <article key={s.project.id} className="ep-card">
        <div className="ep-cover">{cover?<img src={cover.image_url} alt={cover.caption}/>:<div className="ep-cover-empty"><b>{s.project.code}</b><span>{driveUrl?'มี Picture Progress ใน Drive':'ยังไม่มีรูปที่เชื่อม'}</span></div>}<div className="ep-cover-title"><span>{s.project.site_group||'Project'}</span><b>{s.project.name}</b></div></div>
        <div className="ep-card-body"><div className="ep-kpis"><div><span>Actual</span><b>{pct(s.actual)}</b></div><div><span>Plan</span><b>{pct(s.plan)}</b></div><div><span>Variance</span><b className={s.variance<0?'danger-text':''}>{s.variance>0?'+':''}{Math.round(s.variance*100)}%</b></div></div><div className="ep-card-meta"><span>งาน <b>{s.tasks.length}</b></span><span>ล่าช้า <b>{s.delayed}</b></span><span>เสร็จ <b>{s.completed}</b></span><span>รูป <b>{s.photoCount}</b></span><span>จับ Task <b>{s.matchedPhotoCount}</b></span></div><div className="ep-card-meta"><span>รูปล่าสุด <b>{imageDateLabel(s.latestPhotoDate)}</b></span>{s.project.target_handover&&<span>Handover <b>{dateTH(s.project.target_handover)}</b></span>}</div>
        {s.tasks.length?<button className="button primary ep-open" onClick={()=>openProject(s.project.id)}>เริ่มนำเสนอ {s.tasks.length} งาน →</button>:<div className="ep-no-schedule"><b>ยังไม่มี Progress Sheet ใน Supabase สำหรับช่วงนี้</b>{driveUrl&&<a href={driveUrl} target="_blank" rel="noreferrer">เปิด Picture Progress ↗</a>}</div>}</div>
      </article>})}
      {!stats.length&&<div className="panel">ไม่พบโครงการตามตัวกรอง</div>}
    </section>:<div ref={stageRef} className="ep-stage">
      {currentTask&&selectedProject?<><div className="ep-stage-controls"><div><button className="button" onClick={()=>setSlideIndex(i=>Math.max(0,i-1))} disabled={slideIndex===0}>← Previous</button><span>{slideIndex+1} / {selectedTasks.length}</span><button className="button" onClick={()=>setSlideIndex(i=>Math.min(selectedTasks.length-1,i+1))} disabled={slideIndex>=selectedTasks.length-1}>Next →</button></div><button className="button" onClick={toggleFullscreen}>⛶ Fullscreen</button></div>
      <article className="ep-slide"><header><div><span className="ep-eyebrow">{selectedProject.code} • {currentTask.category||'งานก่อสร้าง'}</span><h2>{currentTask.task_name}</h2><p>{currentTask.area||'-'} • Plan {dateTH(currentTask.planned_start)} → {dateTH(currentTask.planned_end)}</p></div><StatusBadge value={currentTask.site_status}/></header><div className="ep-slide-body"><section className="ep-task-info"><div className="ep-progress"><span>ACTUAL PROGRESS</span><b>{pct(currentTask.actual_progress)}</b><i><em style={{width:`${Math.max(0,Math.min(100,Math.round((currentTask.actual_progress||0)*100)))}%`}}/></i></div><div className="ep-info-grid"><div><span>Plan</span><b>{pct(currentTask.current_plan_progress)}</b></div><div><span>Variance</span><b className={(currentTask.current_variance||0)<0?'danger-text':''}>{(currentTask.current_variance||0)>0?'+':''}{Math.round((currentTask.current_variance||0)*100)}%</b></div><div><span>Delay</span><b>{(currentTask.delay_days||0)>0?`${currentTask.delay_days} วัน`:'—'}</b></div><div><span>อัปเดต</span><b>{dateTH(currentTask.source_updated_at)}</b></div></div><div className="ep-note"><span>หมายเหตุ / งานถัดไป</span><p>{shortNote(currentTask)}</p></div>{(currentTask.contractor||currentTask.responsible_person)&&<div className="ep-owner">ผู้รับผิดชอบ: <b>{currentTask.contractor||currentTask.responsible_person}</b></div>}</section>
      <section className="ep-photo-section"><div className="ep-photo-head"><div><b>{photoMode==='latest'?'รูปล่าสุด':'Before–After'}</b><span>วันที่รูปล่าสุด: {imageDateLabel(currentPhotos[0]?.report_date)}</span></div>{currentDriveUrl&&<a href={currentDriveUrl} target="_blank" rel="noreferrer">เปิด Picture Progress ↗</a>}</div>{!taskHasDirectPhotos&&currentPhotos.length>0&&<div className="ep-fallback-note">ยังไม่มีรูปที่จับคู่ตรง Task นี้ — กำลังแสดงรูปล่าสุดระดับ Plot เป็น fallback</div>}{currentPhotos.length?<div className={`ep-photo-grid count-${currentPhotos.length}`}>{currentPhotos.map(photo=><figure key={photo.id}><img src={photo.image_url} alt={photo.caption}/><figcaption><div><b>{phaseLabel(photo.phase,Boolean(photo.task_id))}</b><span>{sourceLabel(photo.source)}</span></div><span>{imageDateLabel(photo.report_date)}</span></figcaption></figure>)}</div>:<div className="ep-photo-empty"><b>ยังไม่มีรูปประกอบในช่วงที่เลือก</b><span>Photo Index จะเติมรูปจาก Picture Progress เมื่อ Sync เข้ามา</span></div>}</section></div></article></>:<div className="panel">ไม่มีงานในช่วงวันที่ที่เลือก</div>}
    </div>}

    <style jsx global>{`
      .ep-filter{margin-bottom:12px}.ep-filters{display:grid;grid-template-columns:2fr 1fr 1fr 1.35fr;gap:10px}.ep-filters label{font-size:12px;font-weight:800;color:var(--muted);display:grid;gap:5px}.ep-filters select,.ep-filters input{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--navy-2)}.ep-meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;font-size:11px;color:var(--muted)}.ep-actions{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:0 0 12px}.ep-actions>div:last-child{display:flex;gap:8px}.ep-overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(285px,1fr));gap:14px}.ep-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(20,31,48,.06)}.ep-cover{height:210px;background:#e9e5dc;position:relative;overflow:hidden}.ep-cover img{width:100%;height:100%;object-fit:cover}.ep-cover:after{content:'';position:absolute;inset:40% 0 0;background:linear-gradient(transparent,rgba(9,21,38,.7))}.ep-cover-empty{height:100%;display:grid;place-content:center;text-align:center;gap:4px;color:var(--muted)}.ep-cover-empty b{font-size:28px;color:var(--navy-2)}.ep-cover-title{position:absolute;left:16px;right:16px;bottom:14px;z-index:2;color:white}.ep-cover-title span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:1.4px;opacity:.78}.ep-cover-title b{display:block;font-size:20px;margin-top:2px}.ep-card-body{padding:14px}.ep-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ep-kpis>div{padding:9px;border-radius:11px;background:var(--surface-2)}.ep-kpis span,.ep-info-grid span{display:block;font-size:10px;color:var(--muted);font-weight:800}.ep-kpis b{display:block;margin-top:2px;font-size:20px}.ep-card-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px;font-size:11px;color:var(--muted)}.ep-open{width:100%;margin-top:12px}.ep-no-schedule{margin-top:12px;padding:10px;border-radius:10px;background:var(--surface-2);display:grid;gap:5px;font-size:11px}.ep-no-schedule a,.ep-photo-head a{color:var(--blue);font-weight:800}.ep-stage{background:#101722;padding:14px;border-radius:18px}.ep-stage:fullscreen{padding:24px;background:#0d1522;overflow:auto}.ep-stage-controls{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;color:#d9e1ee}.ep-stage-controls>div{display:flex;align-items:center;gap:10px}.ep-slide{background:#fffdf9;border-radius:14px;min-height:650px;padding:24px;display:grid;grid-template-rows:auto 1fr}.ep-slide>header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:1px solid #e7e1d6;padding-bottom:14px}.ep-slide h2{font-size:27px;line-height:1.18;margin:6px 0 4px;color:#17243a}.ep-slide header p{margin:0;color:#6b7480;font-size:12px}.ep-eyebrow{font-size:10px;font-weight:900;letter-spacing:1px;color:#a97920}.ep-slide-body{display:grid;grid-template-columns:minmax(280px,.82fr) minmax(0,1.8fr);gap:20px;padding-top:18px}.ep-task-info{display:grid;align-content:start;gap:12px}.ep-progress{border:1px solid #ddd5c7;border-radius:14px;padding:16px;background:#f8f5ed}.ep-progress>span{font-size:10px;font-weight:900;color:#7a705f;letter-spacing:.8px}.ep-progress>b{display:block;font-size:42px;color:#17243a}.ep-progress i{height:8px;display:block;background:#e4ded3;border-radius:99px;overflow:hidden}.ep-progress em{height:100%;display:block;background:#315f9e}.ep-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ep-info-grid>div{padding:10px;border:1px solid #e4ddd1;border-radius:10px}.ep-info-grid b{display:block;font-size:15px;margin-top:2px}.ep-note{padding:12px;border-radius:12px;background:#f3f0e8}.ep-note span{font-size:10px;font-weight:900;color:#756d5e}.ep-note p{margin:5px 0 0;line-height:1.45;font-size:13px}.ep-owner{font-size:11px;color:#6d7480}.ep-photo-section{min-width:0}.ep-photo-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:8px}.ep-photo-head>div{display:grid;gap:2px}.ep-photo-head b{font-size:15px}.ep-photo-head span{font-size:10px;color:#707988}.ep-fallback-note{padding:7px 10px;margin-bottom:8px;border-radius:9px;background:#fff3cd;color:#6d5510;font-size:10px;font-weight:800}.ep-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ep-photo-grid.count-1{grid-template-columns:1fr}.ep-photo-grid figure{margin:0;border:1px solid #e3ddd4;border-radius:12px;overflow:hidden;background:#f2eee6}.ep-photo-grid img{display:block;width:100%;height:235px;object-fit:cover}.ep-photo-grid.count-1 img{height:500px}.ep-photo-grid figcaption{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 9px;background:white;font-size:10px;color:#6f7781}.ep-photo-grid figcaption>div{display:grid;gap:1px}.ep-photo-grid figcaption b{color:#263850}.ep-photo-grid figcaption div span{font-size:8px}.ep-photo-empty{height:480px;border:1px dashed #d8d1c6;border-radius:12px;display:grid;place-content:center;text-align:center;gap:4px;color:#7d8490}.ep-photo-empty b{color:#25364b}.danger-text{color:#a73530!important}
      @media(max-width:950px){.ep-filters{grid-template-columns:1fr 1fr}.ep-slide-body{grid-template-columns:1fr}.ep-photo-grid img{height:260px}.ep-photo-grid.count-1 img{height:360px}}
      @media(max-width:620px){.ep-filters{grid-template-columns:1fr}.ep-actions{align-items:flex-start;flex-direction:column}.ep-stage{padding:6px}.ep-stage-controls{align-items:stretch;flex-direction:column}.ep-slide{padding:14px}.ep-slide h2{font-size:21px}.ep-photo-grid{grid-template-columns:1fr}.ep-photo-grid img,.ep-photo-grid.count-1 img{height:260px}}
      @media print{.sidebar,.mobile-nav,.page-header,.ep-filter,.ep-actions,.ep-stage-controls{display:none!important}.main{margin:0!important;padding:0!important}.ep-overview{display:block}.ep-card{break-after:page;border:none;box-shadow:none}.ep-stage{padding:0;background:white}.ep-slide{min-height:95vh;border-radius:0;break-after:page}.ep-photo-grid img{height:250px}}
    `}</style>
  </AppShell>
}
