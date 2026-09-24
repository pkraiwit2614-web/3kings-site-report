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
type PhotoRow = {
  id:string; daily_report_id:string; report_item_id:string|null; storage_path:string; phase:string;
  caption:string|null; created_at:string; signed_url?:string|null; project_id?:string; report_date?:string;
  schedule_task_id?:string|null
}
type ProjectStats = {
  project:Project; tasks:PresentationTask[]; plan:number; actual:number; variance:number;
  delayed:number; completed:number; latestPhotoDate:string|null
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
  const today=todayISO()
  const [y,m]=today.split('-').map(Number)
  const end=new Date(Date.UTC(y,m,0)).getUTCDate()
  return {start:`${y}-${String(m).padStart(2,'0')}-01`,end:`${y}-${String(m).padStart(2,'0')}-${String(end).padStart(2,'0')}`}
}

function overlaps(task:PresentationTask,start:string,end:string){
  if(!task.planned_start&&!task.planned_end) return false
  const s=task.planned_start||task.planned_end||''
  const e=task.planned_end||task.planned_start||''
  return s<=end&&e>=start
}

function embeddedFolder(url:string|undefined){
  if(!url) return ''
  const id=url.match(/folders\/([^/?#]+)/)?.[1]
  return id?`https://drive.google.com/embeddedfolderview?id=${id}#grid`:''
}

function shortNote(task:PresentationTask){
  return task.notes?.trim()||task.next_action?.trim()||task.blocker?.trim()||'—'
}

function phaseLabel(phase:string){
  if(phase==='before') return 'ก่อนทำ'
  if(phase==='after') return 'หลังทำ'
  if(phase==='during') return 'ระหว่างทำ'
  return 'รูปหน้างาน'
}

function imageDateLabel(value:string|null|undefined){
  return value?dateTH(value):'-'
}

function fileSafe(value:string){
  return value.replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim()
}

async function urlToDataUri(url:string, cache:Map<string,string>){
  if(cache.has(url)) return cache.get(url)||''
  try{
    const res=await fetch(url)
    if(!res.ok) return ''
    const blob=await res.blob()
    const data=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader()
      reader.onload=()=>resolve(String(reader.result||''))
      reader.onerror=()=>reject(reader.error)
      reader.readAsDataURL(blob)
    })
    cache.set(url,data)
    return data
  }catch{return ''}
}

export default function ExecutivePresentationPage(){
  const bounds=useMemo(()=>monthBounds(),[])
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<PresentationTask[]>([])
  const [photos,setPhotos]=useState<PhotoRow[]>([])
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
  const stageRef=useRef<HTMLDivElement>(null)

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      const s=getSupabase()
      const [p,t,r,i,ph,sync]=await Promise.all([
        s.from('projects').select('*').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('*').order('planned_start'),
        s.from('daily_reports').select('id,project_id,report_date').order('report_date',{ascending:false}),
        s.from('report_items').select('id,daily_report_id,schedule_task_id,work_item'),
        s.from('report_photos').select('id,daily_report_id,report_item_id,storage_path,phase,caption,created_at').order('created_at',{ascending:false}),
        s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','schedule').order('created_at',{ascending:false}).limit(1).maybeSingle(),
      ])
      if(cancelled) return
      const projectRows=(p.data||[]) as Project[]
      const taskRows=((t.data||[]) as PresentationTask[]).filter(x=>x.source_task_no!=='1')
      const reports=(r.data||[]) as DailyReportRow[]
      const items=(i.data||[]) as ReportItemRow[]
      const photoRows=(ph.data||[]) as PhotoRow[]
      const reportMap=new Map(reports.map(x=>[x.id,x]))
      const itemMap=new Map(items.map(x=>[x.id,x]))
      const paths=[...new Set(photoRows.map(x=>x.storage_path).filter(Boolean))]
      const signedMap=new Map<string,string>()
      if(paths.length){
        const {data:signed}=await s.storage.from('site-photos').createSignedUrls(paths,60*60)
        ;(signed||[]).forEach((x:any)=>{if(x?.path&&x?.signedUrl) signedMap.set(x.path,x.signedUrl)})
      }
      const enriched=photoRows.map(photo=>{
        const report=reportMap.get(photo.daily_report_id)
        const item=photo.report_item_id?itemMap.get(photo.report_item_id):undefined
        return {...photo,signed_url:signedMap.get(photo.storage_path)||null,project_id:report?.project_id,report_date:report?.report_date,schedule_task_id:item?.schedule_task_id||null}
      })
      setProjects(projectRows)
      setTasks(taskRows)
      setPhotos(enriched)
      setLatestScheduleSync(sync.data?.created_at||null)
      setLoading(false)
    }
    load().catch(()=>setLoading(false))
    return()=>{cancelled=true}
  },[])

  const periodTasks=useMemo(()=>tasks.filter(t=>overlaps(t,startDate,endDate)),[tasks,startDate,endDate])
  const visibleProjects=useMemo(()=>projects.filter(p=>!projectFilter||p.id===projectFilter),[projects,projectFilter])

  const photosInPeriod=useMemo(()=>photos.filter(p=>{
    if(!p.report_date) return false
    return p.report_date>=startDate&&p.report_date<=endDate
  }),[photos,startDate,endDate])

  const pickPhotos=(projectId:string,taskId?:string)=>{
    const direct=taskId?photosInPeriod.filter(p=>p.project_id===projectId&&p.schedule_task_id===taskId&&p.signed_url):[]
    const pool=(direct.length?direct:photosInPeriod.filter(p=>p.project_id===projectId&&p.signed_url)).sort((a,b)=>`${b.report_date||''}${b.created_at}`.localeCompare(`${a.report_date||''}${a.created_at}`))
    if(photoMode==='latest') return pool.slice(0,4)
    const before=pool.find(p=>p.phase==='before')
    const after=pool.find(p=>p.phase==='after')
    const during=pool.filter(p=>p.phase==='during').slice(0,2)
    const chosen=[before,after,...during].filter(Boolean) as PhotoRow[]
    const seen=new Set<string>()
    return chosen.filter(p=>!seen.has(p.id)&&(seen.add(p.id),true)).slice(0,4)
  }

  const stats=useMemo<ProjectStats[]>(()=>visibleProjects.map(project=>{
    const list=periodTasks.filter(t=>t.project_id===project.id)
    const plan=list.length?list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length:0
    const actual=list.length?list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length:0
    const projectPhotos=photosInPeriod.filter(p=>p.project_id===project.id&&p.report_date)
    const latestPhotoDate=projectPhotos.reduce<string|null>((latest,p)=>!latest||String(p.report_date)>latest?String(p.report_date):latest,null)
    return {
      project,tasks:list,plan,actual,variance:actual-plan,
      delayed:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length,
      completed:list.filter(t=>(t.actual_progress||0)>=1).length,
      latestPhotoDate,
    }
  }),[visibleProjects,periodTasks,photosInPeriod])

  const selectedProject=projects.find(p=>p.id===selectedProjectId)||null
  const selectedTasks=useMemo(()=>periodTasks.filter(t=>t.project_id===selectedProjectId),[periodTasks,selectedProjectId])
  const currentTask=selectedTasks[slideIndex]||null
  const currentPhotos=currentTask?pickPhotos(currentTask.project_id,currentTask.id):[]
  const currentDriveUrl=selectedProject?PHOTO_SOURCES[selectedProject.code]:''

  useEffect(()=>{
    if(slideIndex>=selectedTasks.length) setSlideIndex(Math.max(0,selectedTasks.length-1))
  },[selectedTasks.length,slideIndex])

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(view!=='slides') return
      if(e.key==='ArrowRight'||e.key==='PageDown') setSlideIndex(i=>Math.min(selectedTasks.length-1,i+1))
      if(e.key==='ArrowLeft'||e.key==='PageUp') setSlideIndex(i=>Math.max(0,i-1))
      if(e.key==='Escape'&&!document.fullscreenElement) setView('overview')
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[view,selectedTasks.length])

  const openProject=(id:string)=>{
    setSelectedProjectId(id)
    setSlideIndex(0)
    setView('slides')
    window.scrollTo({top:0,behavior:'smooth'})
  }

  const toggleFullscreen=async()=>{
    if(document.fullscreenElement) await document.exitFullscreen()
    else await stageRef.current?.requestFullscreen()
  }

  const exportProjects=useMemo(()=>{
    if(view==='slides'&&selectedProject) return [selectedProject]
    return visibleProjects
  },[view,selectedProject,visibleProjects])

  const exportPptx=async()=>{
    if(exporting) return
    setExporting('pptx')
    try{
      const mod=await import('pptxgenjs')
      const PptxGenJS=mod.default
      const pptxFile=new PptxGenJS()
      pptxFile.layout='LAYOUT_WIDE'
      pptxFile.author='3 Kings Construction'
      pptxFile.company='3 Kings Construction'
      pptxFile.subject='Executive Presentation View'
      pptxFile.title='3 Kings Construction Executive Presentation'
      const imageCache=new Map<string,string>()

      for(const project of exportProjects){
        const projectTasks=periodTasks.filter(t=>t.project_id===project.id)
        const projectStat=stats.find(x=>x.project.id===project.id)
        const cover=pptxFile.addSlide()
        cover.background={color:'F6F2E9'}
        cover.addText('3 KINGS CONSTRUCTION',{x:.65,y:.45,w:4.2,h:.3,fontSize:11,bold:true,color:'A97920',charSpacing:1.5})
        cover.addText(project.name,{x:.65,y:1.0,w:8.5,h:.65,fontSize:28,bold:true,color:'17243A'})
        cover.addText(`${dateTH(startDate)} – ${dateTH(endDate)}`,{x:.65,y:1.75,w:5,h:.35,fontSize:14,color:'687486'})
        cover.addText(`Actual ${pct(projectStat?.actual||0)}   |   Plan ${pct(projectStat?.plan||0)}   |   งานในช่วง ${projectTasks.length} รายการ`,{x:.65,y:2.35,w:7.7,h:.45,fontSize:17,bold:true,color:'233A5D'})
        cover.addText(`Delayed ${projectStat?.delayed||0}   •   Completed ${projectStat?.completed||0}   •   Latest photo ${imageDateLabel(projectStat?.latestPhotoDate)}`,{x:.65,y:2.95,w:8.7,h:.35,fontSize:13,color:'6D7785'})
        const projectPhotos=pickPhotos(project.id)
        for(let n=0;n<Math.min(2,projectPhotos.length);n++){
          const url=projectPhotos[n].signed_url||''
          const data=url?await urlToDataUri(url,imageCache):''
          if(data) cover.addImage({data,x:8.55+n*2.05,y:1.0,w:1.9,h:3.35})
        }
        if(!projectPhotos.length&&PHOTO_SOURCES[project.code]) cover.addText('Picture Progress available in Google Drive',{x:8.55,y:1.2,w:3.9,h:.6,fontSize:16,bold:true,color:'2F6FB0',hyperlink:{url:PHOTO_SOURCES[project.code]}})

        for(let idx=0;idx<projectTasks.length;idx++){
          const task=projectTasks[idx]
          const slide=pptxFile.addSlide()
          slide.background={color:'FFFDF9'}
          slide.addText(`${project.code}  •  ${task.category||'งานก่อสร้าง'}`,{x:.55,y:.35,w:4.8,h:.3,fontSize:11,bold:true,color:'A97920'})
          slide.addText(task.task_name,{x:.55,y:.75,w:7.2,h:.72,fontSize:23,bold:true,color:'17243A',breakLine:false})
          slide.addText(`${task.area||'-'}   |   Plan ${dateTH(task.planned_start)} → ${dateTH(task.planned_end)}`,{x:.55,y:1.52,w:7.2,h:.35,fontSize:12,color:'687486'})
          slide.addText(`ACTUAL ${pct(task.actual_progress)}   •   ${task.site_status||'ยังไม่ระบุสถานะ'}`,{x:.55,y:2.02,w:4.8,h:.45,fontSize:18,bold:true,color:(task.delay_days||0)>0?'A73530':'1C6A49'})
          slide.addText(shortNote(task),{x:.55,y:2.65,w:5.3,h:1.15,fontSize:14,color:'27364A',valign:'top',margin:.08,fill:{color:'F3F0E8'},line:{color:'DDD5C7',width:1}})
          const taskPhotos=pickPhotos(project.id,task.id)
          const positions=[
            {x:6.15,y:.75,w:3.05,h:2.75},{x:9.35,y:.75,w:3.05,h:2.75},
            {x:6.15,y:3.7,w:3.05,h:2.75},{x:9.35,y:3.7,w:3.05,h:2.75},
          ]
          for(let n=0;n<Math.min(4,taskPhotos.length);n++){
            const url=taskPhotos[n].signed_url||''
            const data=url?await urlToDataUri(url,imageCache):''
            if(data) slide.addImage({data,...positions[n]})
          }
          if(!taskPhotos.length&&PHOTO_SOURCES[project.code]) slide.addText('เปิด Picture Progress ใน Google Drive',{x:7.1,y:2.7,w:4.4,h:.6,fontSize:17,bold:true,color:'2F6FB0',align:'center',hyperlink:{url:PHOTO_SOURCES[project.code]}})
          slide.addText(`${idx+1} / ${projectTasks.length}`,{x:11.5,y:6.95,w:1.1,h:.22,fontSize:9,color:'8A919A',align:'right'})
        }
      }
      await pptxFile.writeFile({fileName:`Executive-Presentation_${fileSafe(startDate)}_${fileSafe(endDate)}.pptx`,compression:true})
    }finally{setExporting('')}
  }

  const exportPdf=()=>{
    if(exporting) return
    setExporting('pdf')
    window.setTimeout(()=>{
      window.print()
      setExporting('')
    },80)
  }

  const dataFreshness=latestScheduleSync?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(latestScheduleSync)):'-'

  return <AppShell>
    <PageHeader title="Executive Presentation" subtitle="มุมมองนำเสนอสำหรับผู้บริหาร • เลือก Site / Plot และช่วงวันที่ แล้วเปิดดูภาพรวมก่อนลงรายละเอียด 1 งานต่อ 1 หน้า" />

    <section className="panel presentation-filter-panel">
      <div className="presentation-filters">
        <label>Site / Plot<select value={projectFilter} onChange={e=>{setProjectFilter(e.target.value);setView('overview')}}><option value="">ทุกโครงการที่มีข้อมูล</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
        <label>เริ่มวันที่<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label>ถึงวันที่<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        <label>รูปประกอบ<select value={photoMode} onChange={e=>setPhotoMode(e.target.value as PhotoMode)}><option value="latest">รูปล่าสุด</option><option value="before_after">Before–After (ถ้ามี)</option></select></label>
      </div>
      <div className="presentation-meta-row">
        <span>Schedule Sync ล่าสุด: <b>{dataFreshness}</b></span>
        <span>ข้อมูลรูปใน Supabase ช่วงที่เลือก: <b>{photosInPeriod.length}</b> รูป</span>
        <span>งานตามแผนในช่วงที่เลือก: <b>{periodTasks.length}</b> รายการ</span>
      </div>
    </section>

    <div className="presentation-actionbar">
      <div>
        {view==='slides'&&<button className="button" onClick={()=>setView('overview')}>← กลับภาพรวม</button>}
      </div>
      <div className="presentation-export-actions">
        <button className="button" onClick={exportPdf} disabled={Boolean(exporting)}>{exporting==='pdf'?'กำลังเตรียม…':'ดาวน์โหลด PDF'}</button>
        <button className="button primary" onClick={exportPptx} disabled={Boolean(exporting)}>{exporting==='pptx'?'กำลังสร้าง PowerPoint…':'ดาวน์โหลด PowerPoint'}</button>
      </div>
    </div>

    {loading?<div className="panel">กำลังเตรียม Executive Presentation…</div>:view==='overview'?<section className="presentation-overview-grid">
      {stats.map(s=>{
        const cover=pickPhotos(s.project.id)[0]
        const driveUrl=PHOTO_SOURCES[s.project.code]
        return <article key={s.project.id} className="presentation-overview-card">
          <div className="presentation-cover">
            {cover?.signed_url?<img src={cover.signed_url} alt={cover.caption||s.project.name}/>:<div className="presentation-cover-empty"><b>{s.project.code}</b><span>{driveUrl?'มี Picture Progress ใน Drive':'ยังไม่มีรูปที่เชื่อมกับระบบ'}</span></div>}
            <div className="presentation-cover-label"><span>{s.project.site_group||'Project'}</span><b>{s.project.name}</b></div>
          </div>
          <div className="presentation-card-body">
            <div className="presentation-kpi-row"><div><span>Actual</span><b>{pct(s.actual)}</b></div><div><span>Plan</span><b>{pct(s.plan)}</b></div><div><span>Variance</span><b className={s.variance<0?'danger-text':''}>{s.variance>0?'+':''}{Math.round(s.variance*100)}%</b></div></div>
            <div className="presentation-card-meta"><span>งานในช่วง <b>{s.tasks.length}</b></span><span>ล่าช้า <b>{s.delayed}</b></span><span>เสร็จ <b>{s.completed}</b></span></div>
            <div className="presentation-card-meta"><span>รูปล่าสุด: <b>{imageDateLabel(s.latestPhotoDate)}</b></span>{s.project.target_handover&&<span>Handover: <b>{dateTH(s.project.target_handover)}</b></span>}</div>
            {s.tasks.length?<button className="button primary presentation-open" onClick={()=>openProject(s.project.id)}>เริ่มนำเสนอ {s.tasks.length} งาน →</button>:<div className="presentation-no-schedule"><b>ยังไม่มี Progress Sheet ใน Supabase สำหรับช่วงนี้</b><span>{driveUrl?'ยังเปิด Picture Progress ของโครงการได้':'ไม่มีข้อมูลแผนงาน/รูปที่เชื่อมไว้'}</span>{driveUrl&&<a href={driveUrl} target="_blank" rel="noreferrer">เปิด Picture Progress ↗</a>}</div>}
          </div>
        </article>
      })}
      {!stats.length&&<div className="panel">ไม่พบโครงการตามตัวกรอง</div>}
    </section>:<div ref={stageRef} className="presentation-stage">
      {currentTask&&selectedProject?<>
        <div className="presentation-stage-controls">
          <div><button className="button" onClick={()=>setSlideIndex(i=>Math.max(0,i-1))} disabled={slideIndex===0}>← Previous</button><span>{slideIndex+1} / {selectedTasks.length}</span><button className="button" onClick={()=>setSlideIndex(i=>Math.min(selectedTasks.length-1,i+1))} disabled={slideIndex>=selectedTasks.length-1}>Next →</button></div>
          <button className="button" onClick={toggleFullscreen}>⛶ Fullscreen</button>
        </div>
        <article className="presentation-slide">
          <header className="presentation-slide-head"><div><span className="presentation-eyebrow">{selectedProject.code} • {currentTask.category||'งานก่อสร้าง'}</span><h2>{currentTask.task_name}</h2><p>{currentTask.area||'-'} • Plan {dateTH(currentTask.planned_start)} → {dateTH(currentTask.planned_end)}</p></div><StatusBadge value={currentTask.site_status}/></header>
          <div className="presentation-slide-body">
            <section className="presentation-task-info">
              <div className="presentation-progress-block"><span>ACTUAL PROGRESS</span><b>{pct(currentTask.actual_progress)}</b><i><em style={{width:`${Math.max(0,Math.min(100,Math.round((currentTask.actual_progress||0)*100)))}%`}}/></i></div>
              <div className="presentation-info-grid"><div><span>Plan Progress</span><b>{pct(currentTask.current_plan_progress)}</b></div><div><span>Variance</span><b className={(currentTask.current_variance||0)<0?'danger-text':''}>{(currentTask.current_variance||0)>0?'+':''}{Math.round((currentTask.current_variance||0)*100)}%</b></div><div><span>Delay</span><b>{(currentTask.delay_days||0)>0?`${currentTask.delay_days} วัน`:'—'}</b></div><div><span>อัปเดตล่าสุด</span><b>{dateTH(currentTask.source_updated_at)}</b></div></div>
              <div className="presentation-note"><span>หมายเหตุ / งานถัดไป</span><p>{shortNote(currentTask)}</p></div>
              {(currentTask.contractor||currentTask.responsible_person)&&<div className="presentation-owner">ผู้รับผิดชอบ: <b>{currentTask.contractor||currentTask.responsible_person}</b></div>}
            </section>
            <section className="presentation-photo-section">
              <div className="presentation-photo-head"><div><b>{photoMode==='latest'?'รูปล่าสุด':'Before–After'}</b><span>วันที่รูปล่าสุด: {imageDateLabel(currentPhotos[0]?.report_date)}</span></div>{currentDriveUrl&&<a href={currentDriveUrl} target="_blank" rel="noreferrer">เปิด Picture Progress ↗</a>}</div>
              {currentPhotos.length?<div className={`presentation-photo-grid count-${currentPhotos.length}`}>{currentPhotos.map(photo=><figure key={photo.id}><img src={photo.signed_url||''} alt={photo.caption||currentTask.task_name}/><figcaption><b>{phaseLabel(photo.phase)}</b><span>{imageDateLabel(photo.report_date)}</span></figcaption></figure>)}</div>:currentDriveUrl?<div className="presentation-drive-fallback"><iframe title={`Picture Progress ${selectedProject.name}`} src={embeddedFolder(currentDriveUrl)} loading="lazy"/><div><b>Picture Progress จาก Google Drive</b><span>ยังไม่มีรูปจาก Drive ที่จับคู่กับ Task นี้ในฐานข้อมูล จึงแสดงโฟลเดอร์รูปของ Plot เป็น fallback</span></div></div>:<div className="presentation-photo-empty"><b>ยังไม่มีรูปประกอบที่เชื่อมกับงานนี้</b><span>เมื่อมีรูปจาก Site Report หรือ Photo Index รูปจะขึ้นในหน้านี้อัตโนมัติ</span></div>}
            </section>
          </div>
          <footer className="presentation-slide-footer"><span>3 Kings Construction • Executive Presentation</span><span>{dateTH(startDate)} – {dateTH(endDate)}</span></footer>
        </article>
      </>:<div className="panel">ไม่มีงานตามช่วงวันที่ที่เลือกสำหรับโครงการนี้</div>}
    </div>}

    <section className="presentation-print-deck" aria-hidden="true">
      {exportProjects.flatMap(project=>{
        const projectTasks=periodTasks.filter(t=>t.project_id===project.id)
        const stat=stats.find(x=>x.project.id===project.id)
        return [<article className="print-slide print-cover" key={`${project.id}-cover`}><h1>{project.name}</h1><p>{dateTH(startDate)} – {dateTH(endDate)}</p><div className="print-kpis"><b>Actual {pct(stat?.actual||0)}</b><b>Plan {pct(stat?.plan||0)}</b><b>{projectTasks.length} งาน</b></div></article>,...projectTasks.map(task=>{const taskPhotos=pickPhotos(project.id,task.id);return <article className="print-slide" key={task.id}><div className="print-task-head"><div><small>{project.code} • {task.category||'-'}</small><h2>{task.task_name}</h2><p>Plan {dateTH(task.planned_start)} → {dateTH(task.planned_end)} • Actual {pct(task.actual_progress)} • {task.site_status||'-'}</p></div></div><div className="print-task-body"><div><h3>หมายเหตุ / งานถัดไป</h3><p>{shortNote(task)}</p><p>อัปเดต: {dateTH(task.source_updated_at)}</p></div><div className="print-photo-grid">{taskPhotos.map(photo=><img key={photo.id} src={photo.signed_url||''} alt=""/>)}{!taskPhotos.length&&<div className="print-photo-placeholder">Picture Progress: {PHOTO_SOURCES[project.code]?'มีข้อมูลใน Google Drive':'ยังไม่มีรูป'}</div>}</div></div></article>})]
      })}
    </section>

    <style jsx global>{`
      .presentation-filter-panel{margin-bottom:14px}.presentation-filters{display:grid;grid-template-columns:2fr 1fr 1fr 1.4fr;gap:12px}.presentation-filters label{display:grid;gap:6px;font-size:12px;font-weight:800;color:#435169}.presentation-filters select,.presentation-filters input{width:100%;padding:10px 11px;border:1px solid #d8d2c7;border-radius:10px;background:#fffdf9;color:#182231}.presentation-meta-row{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}
      .presentation-actionbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:0 0 14px}.presentation-export-actions{display:flex;gap:8px}.presentation-overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.presentation-overview-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:var(--shadow)}.presentation-cover{height:210px;position:relative;background:linear-gradient(135deg,#172a43,#29496e);overflow:hidden}.presentation-cover img{width:100%;height:100%;object-fit:cover;display:block}.presentation-cover:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(10,23,39,.72))}.presentation-cover-empty{height:100%;display:grid;place-content:center;text-align:center;color:#fff;gap:5px}.presentation-cover-empty b{font-size:36px}.presentation-cover-empty span{color:#d6e0ec;font-size:12px}.presentation-cover-label{position:absolute;left:18px;right:18px;bottom:14px;z-index:1;color:#fff}.presentation-cover-label span{font-size:11px;color:#e5bd68;font-weight:800}.presentation-cover-label b{display:block;font-size:21px;margin-top:3px}.presentation-card-body{padding:16px}.presentation-kpi-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.presentation-kpi-row>div{background:#f7f4ed;border:1px solid #ece4d6;border-radius:11px;padding:10px}.presentation-kpi-row span{display:block;color:var(--muted);font-size:10px;font-weight:800}.presentation-kpi-row b{display:block;font-size:19px;margin-top:3px}.presentation-card-meta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--muted);margin-top:11px}.presentation-open{width:100%;margin-top:14px}.presentation-no-schedule{margin-top:14px;padding:11px;border:1px dashed #d9cfbd;border-radius:11px;display:grid;gap:4px}.presentation-no-schedule b{font-size:12px}.presentation-no-schedule span{font-size:11px;color:var(--muted)}.presentation-no-schedule a{font-size:11px;color:var(--blue);font-weight:800;margin-top:3px}
      .presentation-stage{background:#0f1b2c;border-radius:20px;padding:14px}.presentation-stage-controls{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.presentation-stage-controls>div{display:flex;align-items:center;gap:10px}.presentation-stage-controls span{color:#cbd6e4;font-size:12px}.presentation-stage:fullscreen{width:100vw;height:100vh;border-radius:0;padding:18px;background:#0a1422;overflow:auto}.presentation-stage:fullscreen .presentation-slide{min-height:calc(100vh - 82px)}.presentation-stage:fullscreen .presentation-stage-controls{position:sticky;top:0;z-index:10;background:#0a1422;padding:4px 0 10px}
      .presentation-slide{background:#fffdf9;border-radius:16px;min-height:650px;display:flex;flex-direction:column;overflow:hidden}.presentation-slide-head{padding:22px 24px 15px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:1px solid #eee7dc}.presentation-eyebrow{color:#9a701d;font-size:11px;font-weight:900;letter-spacing:.45px}.presentation-slide-head h2{font-size:26px;margin:5px 0;color:#17243a;line-height:1.2}.presentation-slide-head p{margin:0;color:var(--muted);font-size:12px}.presentation-slide-body{display:grid;grid-template-columns:35% 65%;flex:1;min-height:0}.presentation-task-info{padding:22px;border-right:1px solid #eee7dc;background:#fbf8f1}.presentation-progress-block span{font-size:10px;color:var(--muted);font-weight:900;letter-spacing:.5px}.presentation-progress-block>b{display:block;font-size:44px;color:#17243a;margin:4px 0 8px}.presentation-progress-block i{display:block;height:10px;border-radius:999px;background:#e4e8ed;overflow:hidden}.presentation-progress-block em{display:block;height:100%;background:linear-gradient(90deg,#2f6fb0,#4b92d0);border-radius:999px}.presentation-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.presentation-info-grid>div{background:#fff;border:1px solid #e8dfd0;border-radius:10px;padding:9px}.presentation-info-grid span{font-size:9px;color:var(--muted);display:block}.presentation-info-grid b{font-size:14px;display:block;margin-top:3px}.presentation-note{margin-top:14px;border-top:1px solid #e4dccf;padding-top:13px}.presentation-note span{font-size:10px;color:var(--muted);font-weight:900}.presentation-note p{font-size:13px;line-height:1.55;color:#34445b;margin:6px 0}.presentation-owner{font-size:11px;color:var(--muted);margin-top:10px}.presentation-photo-section{padding:18px 20px;display:flex;flex-direction:column;min-width:0}.presentation-photo-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.presentation-photo-head b{display:block;font-size:14px}.presentation-photo-head span{display:block;font-size:10px;color:var(--muted);margin-top:2px}.presentation-photo-head a{font-size:10px;color:var(--blue);font-weight:800}.presentation-photo-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:8px;flex:1;min-height:360px}.presentation-photo-grid.count-1{grid-template-columns:1fr;grid-template-rows:1fr}.presentation-photo-grid.count-2{grid-template-columns:1fr 1fr;grid-template-rows:1fr}.presentation-photo-grid figure{margin:0;position:relative;border-radius:11px;overflow:hidden;background:#eef1f4;border:1px solid #e2ddd3}.presentation-photo-grid img{width:100%;height:100%;object-fit:cover;display:block}.presentation-photo-grid figcaption{position:absolute;left:7px;right:7px;bottom:7px;background:rgba(12,26,43,.76);color:#fff;border-radius:8px;padding:6px 8px;display:flex;justify-content:space-between;font-size:9px}.presentation-drive-fallback{flex:1;min-height:390px;display:grid;grid-template-rows:1fr auto;border:1px solid #e6e0d5;border-radius:12px;overflow:hidden;background:#f7f4ed}.presentation-drive-fallback iframe{border:0;width:100%;height:100%;min-height:330px;background:#fff}.presentation-drive-fallback>div{padding:9px 12px;display:grid;gap:3px}.presentation-drive-fallback b{font-size:11px}.presentation-drive-fallback span,.presentation-photo-empty span{font-size:10px;color:var(--muted)}.presentation-photo-empty{flex:1;min-height:390px;border:1px dashed #d8d2c7;border-radius:12px;display:grid;place-content:center;text-align:center;gap:5px;padding:20px}.presentation-slide-footer{display:flex;justify-content:space-between;padding:9px 22px;border-top:1px solid #eee7dc;color:#8a919a;font-size:9px}
      .presentation-print-deck{display:none}.print-slide{background:#fff;color:#182231}.print-cover{display:grid;place-content:center;text-align:center}.print-cover h1{font-size:30px}.print-kpis{display:flex;gap:18px;justify-content:center;margin-top:18px}.print-task-head h2{font-size:25px;margin:5px 0}.print-task-body{display:grid;grid-template-columns:34% 66%;gap:16px;margin-top:20px}.print-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.print-photo-grid img{width:100%;height:220px;object-fit:cover}.print-photo-placeholder{border:1px dashed #aaa;display:grid;place-content:center;min-height:220px;color:#777}
      @media(max-width:1000px){.presentation-filters{grid-template-columns:1fr 1fr}.presentation-overview-grid{grid-template-columns:1fr}.presentation-slide-body{grid-template-columns:1fr}.presentation-task-info{border-right:0;border-bottom:1px solid #eee7dc}.presentation-slide{min-height:auto}.presentation-photo-grid{min-height:520px}}
      @media(max-width:760px){.presentation-filters{grid-template-columns:1fr}.presentation-actionbar{align-items:stretch;flex-direction:column}.presentation-export-actions{display:grid;grid-template-columns:1fr 1fr}.presentation-stage{padding:8px;border-radius:14px}.presentation-stage-controls{align-items:stretch;flex-direction:column}.presentation-stage-controls>div{display:grid;grid-template-columns:1fr auto 1fr}.presentation-slide-head{padding:16px;flex-direction:column}.presentation-slide-head h2{font-size:21px}.presentation-task-info{padding:16px}.presentation-photo-section{padding:14px}.presentation-photo-grid{grid-template-columns:1fr;grid-template-rows:none;min-height:auto}.presentation-photo-grid figure{min-height:230px}.presentation-drive-fallback{min-height:420px}.presentation-cover{height:170px}}
      @media print{body{background:#fff!important}.main{margin:0!important;padding:0!important}.presentation-filter-panel,.presentation-actionbar,.presentation-overview-grid,.presentation-stage,.page-header{display:none!important}.presentation-print-deck{display:block!important}.print-slide{display:block!important;width:100%;min-height:190mm;padding:14mm;page-break-after:always;break-after:page;box-sizing:border-box}.print-cover{display:grid!important;min-height:190mm}.print-task-body{grid-template-columns:36% 64%}.print-photo-grid img{height:72mm}}
    `}</style>
  </AppShell>
}
