'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import { todayISO } from '@/lib/format'
import { compressSitePhoto } from '@/lib/imageCompression'
import type { Project, ScheduleTask } from '@/lib/types'

type Item = { schedule_task_id:string; work_item:string; work_category:string; actual_progress:number; manpower:number; contractor:string; status:string; blocker:string; next_action:string; target_date:string; remarks:string }
type ReportSection = { id:string; projectId:string; overall:number; manpower:number; summary:string; items:Item[]; files:File[]; phase:string }
type DraftPayload = { version:number; savedAt:string; date:string; weather:string; sections:Array<Omit<ReportSection,'files'>> }

const LOCAL_DRAFT_KEY='3kings:v34:daily-report-draft'
const emptyItem = ():Item => ({schedule_task_id:'',work_item:'',work_category:'',actual_progress:0,manpower:0,contractor:'',status:'in_progress',blocker:'',next_action:'',target_date:'',remarks:''})
const emptySection = (projectId=''):ReportSection => ({id:`section-${Date.now()}-${Math.random().toString(36).slice(2)}`,projectId,overall:0,manpower:0,summary:'',items:[emptyItem()],files:[],phase:'during'})
const newDraftKey=()=>typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():`draft-${Date.now()}-${Math.random().toString(36).slice(2)}`

const statusOptions = [
  ['not_started','ยังไม่เริ่ม'],['in_progress','กำลังดำเนินการ'],['awaiting_inspection','รอตรวจ'],['blocked','ติดปัญหา/อุปสรรค'],['delayed','ล่าช้า'],['completed','เสร็จแล้ว'],['on_hold','พักงาน']
]

const safeFileName = (name:string) => name.replace(/[\\/:*?"<>|#%{}[\]~]/g,'-').replace(/\s+/g,'-').slice(0,120) || 'site-photo'

function restoreSections(raw:any,fallbackProjectId=''):ReportSection[]{
  if(!Array.isArray(raw)||!raw.length) return [emptySection(fallbackProjectId)]
  return raw.map((sec:any)=>({
    id:sec?.id||`section-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    projectId:sec?.projectId||fallbackProjectId,
    overall:Number(sec?.overall)||0,
    manpower:Number(sec?.manpower)||0,
    summary:String(sec?.summary||''),
    phase:['before','during','after','other'].includes(sec?.phase)?sec.phase:'during',
    files:[],
    items:Array.isArray(sec?.items)&&sec.items.length?sec.items.map((x:any)=>({
      ...emptyItem(),...x,
      actual_progress:Number(x?.actual_progress)||0,
      manpower:Number(x?.manpower)||0,
    })):[emptyItem()]
  }))
}

function draftPayload(date:string,weather:string,sections:ReportSection[]):DraftPayload{
  return {
    version:34,
    savedAt:new Date().toISOString(),
    date,
    weather,
    sections:sections.map(({files,...rest})=>rest),
  }
}

export default function NewReportPage(){
 const router=useRouter()
 const [projects,setProjects]=useState<Project[]>([])
 const [tasks,setTasks]=useState<ScheduleTask[]>([])
 const [date,setDate]=useState(todayISO())
 const [weather,setWeather]=useState('')
 const [sections,setSections]=useState<ReportSection[]>([emptySection()])
 const [saving,setSaving]=useState(false)
 const [message,setMessage]=useState('')
 const [draftKey,setDraftKey]=useState('')
 const [draftReady,setDraftReady]=useState(false)
 const [draftStatus,setDraftStatus]=useState('กำลังตรวจ Draft…')
 const submitLock=useRef(false)
 const submittedRef=useRef(false)

 useEffect(()=>{
   let cancelled=false
   const load=async()=>{
     const s=getSupabase()
     const [p,t,u]=await Promise.all([
       s.from('projects').select('*').eq('active',true).order('sort_order'),
       s.from('v_schedule_tasks').select('*').order('planned_start'),
       s.auth.getUser()
     ])
     if(cancelled) return
     const ps=(p.data||[]) as Project[]
     setProjects(ps)
     setTasks((t.data||[]) as ScheduleTask[])

     let local:any=null
     try{ local=JSON.parse(localStorage.getItem(LOCAL_DRAFT_KEY)||'null') }catch{}
     let cloud:any=null
     if(u.data.user){
       const {data}=await s.from('report_drafts').select('draft_key,payload,updated_at').eq('user_id',u.data.user.id).order('updated_at',{ascending:false}).limit(1).maybeSingle()
       cloud=data||null
     }

     const localTime=local?.savedAt?new Date(local.savedAt).getTime():0
     const cloudTime=cloud?.updated_at?new Date(cloud.updated_at).getTime():0
     const chosen=cloudTime>=localTime&&cloud?.payload
       ? {draftKey:cloud.draft_key,payload:cloud.payload,savedAt:cloud.updated_at}
       : local?.payload?local:null

     if(chosen?.payload){
       const payload=chosen.payload as Partial<DraftPayload>
       setDate(payload.date||todayISO())
       setWeather(payload.weather||'')
       setSections(restoreSections(payload.sections,ps[0]?.id||''))
       setDraftKey(chosen.draftKey||newDraftKey())
       setDraftStatus(`กู้ Draft ล่าสุดแล้ว${chosen.savedAt?` • ${new Date(chosen.savedAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`:''}`)
     }else{
       setSections([emptySection(ps[0]?.id||'')])
       setDraftKey(newDraftKey())
       setDraftStatus('พร้อม Auto-save Draft')
     }
     setDraftReady(true)
   }
   load().catch(()=>{
     if(cancelled) return
     setDraftKey(newDraftKey())
     setDraftReady(true)
     setDraftStatus('Draft ในเครื่องพร้อมใช้งาน')
   })
   return()=>{cancelled=true}
 },[])

 useEffect(()=>{
   if(!draftReady||!draftKey||saving||submittedRef.current) return
   const payload=draftPayload(date,weather,sections)
   try{ localStorage.setItem(LOCAL_DRAFT_KEY,JSON.stringify({draftKey,savedAt:payload.savedAt,payload})) }catch{}
   setDraftStatus('กำลัง Auto-save Draft…')
   const timer=window.setTimeout(async()=>{
     const s=getSupabase()
     const {data:{user}}=await s.auth.getUser()
     if(!user){ setDraftStatus('Draft เก็บในเครื่องแล้ว'); return }
     const {error}=await s.from('report_drafts').upsert({
       user_id:user.id,draft_key:draftKey,report_date:date,payload
     },{onConflict:'user_id,draft_key'})
     if(error) setDraftStatus('Draft เก็บในเครื่องแล้ว • Cloud save ไม่สำเร็จ')
     else setDraftStatus(`บันทึก Draft อัตโนมัติแล้ว • ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`)
   },900)
   return()=>window.clearTimeout(timer)
 },[draftReady,draftKey,date,weather,sections,saving])

 const updateSection=(id:string,patch:Partial<ReportSection>)=>setSections(v=>v.map(s=>s.id===id?{...s,...patch}:s))
 const updateItem=(sectionId:string,i:number,patch:Partial<Item>)=>setSections(v=>v.map(s=>s.id===sectionId?{...s,items:s.items.map((x,idx)=>idx===i?{...x,...patch}:x)}:s))
 const chooseTask=(section:ReportSection,i:number,id:string)=>{
   const t=tasks.find(x=>x.id===id)
   updateItem(section.id,i,{schedule_task_id:id,work_item:t?.task_name||'',work_category:t?.category||'',actual_progress:Math.round((t?.actual_progress||0)*100),contractor:t?.contractor||'',target_date:t?.target_close||''})
 }
 const sectionTasks=(projectId:string)=>tasks.filter(t=>t.project_id===projectId&&t.source_task_no!=='1')
 const totalReports=sections.filter(s=>s.projectId&&s.items.some(x=>x.work_item.trim())).length
 const grandManpower=useMemo(()=>sections.reduce((sum,s)=>sum+(Number(s.manpower)||s.items.reduce((a,b)=>a+(Number(b.manpower)||0),0)),0),[sections])
 const selectedPhotoCount=useMemo(()=>sections.reduce((sum,s)=>sum+s.files.length,0),[sections])

 const addSection=()=>setSections(v=>[...v,emptySection(projects[0]?.id||'')])
 const removeSection=(id:string)=>setSections(v=>v.filter(s=>s.id!==id))
 const changeProject=(section:ReportSection,projectId:string)=>updateSection(section.id,{projectId,items:[emptyItem()],overall:0,manpower:0,summary:'',files:[]})

 const submit=async(e:FormEvent)=>{
   e.preventDefault()
   if(submitLock.current||saving) return
   submitLock.current=true
   setSaving(true)
   setMessage('')
   const s=getSupabase()
   try{
     const {data:{user},error:userError}=await s.auth.getUser()
     if(userError||!user) throw new Error('กรุณาเข้าสู่ระบบใหม่')
     const {data:{session}}=await s.auth.getSession()
     if(!session?.access_token) throw new Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่')
     if(!draftKey) throw new Error('Draft key ยังไม่พร้อม กรุณาลองอีกครั้ง')

     const validSections=sections.filter(sec=>sec.projectId&&sec.items.some(x=>x.work_item.trim()))
     if(!validSections.length) throw new Error('กรุณากรอกรายการงานอย่างน้อย 1 Site / Plot')
     const ids=validSections.map(sec=>sec.projectId)
     if(new Set(ids).size!==ids.length) throw new Error('Site / Plot ซ้ำกัน กรุณารวมงานของ Plot เดียวกันไว้ในส่วนเดียว')

     let saved=0
     let archiveFailures=0
     let queuedPhotos=0
     let alreadyArchived=0

     for(const sec of validSections){
       const project=projects.find(p=>p.id===sec.projectId)
       if(!project) throw new Error('ไม่พบข้อมูล Site / Plot')
       const valid=sec.items.filter(x=>x.work_item.trim())
       const itemManpower=valid.reduce((a,b)=>a+(Number(b.manpower)||0),0)
       const submissionKey=`${draftKey}:${sec.projectId}`

       const {data:reportId,error:reportError}=await s.rpc('daily_report_submit_v34',{
         p_submission_key:submissionKey,
         p_project_id:sec.projectId,
         p_report_date:date,
         p_reporter_id:user.id,
         p_weather:weather||null,
         p_overall_progress:Number(sec.overall)/100,
         p_total_manpower:Number(sec.manpower)||itemManpower,
         p_summary:sec.summary||null,
         p_items:valid.map(x=>({
           schedule_task_id:x.schedule_task_id||'',work_category:x.work_category||'',work_item:x.work_item,
           actual_progress:Number(x.actual_progress)/100,manpower:Number(x.manpower)||0,contractor:x.contractor||'',
           status:x.status,blocker:x.blocker||'',next_action:x.next_action||'',target_date:x.target_date||'',remarks:x.remarks||''
         }))
       })
       if(reportError||!reportId) throw new Error(`บันทึกรายงานลำดับที่ ${saved+1} ไม่สำเร็จ: ${reportError?.message||'unknown error'}`)
       const reportIdText=String(reportId)

       for(let i=0;i<sec.files.length;i++){
         const original=sec.files[i]
         const photoKey=`${submissionKey}:photo:${i}:${original.name}:${original.size}:${original.lastModified}`
         const {data:existing}=await s.from('report_photos').select('id,storage_path,archive_status,archive_staging_path').eq('client_photo_key',photoKey).maybeSingle()
         let photoRow:any=existing||null

         if(photoRow?.archive_status==='archived'){
           alreadyArchived++
           continue
         }
         if(photoRow?.archive_status==='processing'){
           queuedPhotos++
           continue
         }

         if(!photoRow){
           const compressed=await compressSitePhoto(original)
           const compressedExt=(compressed.file.name.split('.').pop()||'jpg').toLowerCase()
           const finalPath=`${sec.projectId}/${date}/${reportIdText}/${i}-${original.lastModified}-${safeFileName(original.name.replace(/\.[^.]+$/,''))}.${compressedExt}`
           const {error:up}=await s.storage.from('site-photos').upload(finalPath,compressed.file,{upsert:true,contentType:compressed.file.type||undefined})
           if(up) throw new Error(`อัปโหลดรูปสำหรับ Dashboard ไม่สำเร็จ: ${up.message}`)

           const {data:inserted,error:pe}=await s.from('report_photos').insert({
             daily_report_id:reportIdText,
             report_item_id:null,
             storage_path:finalPath,
             phase:sec.phase,
             caption:original.name,
             uploaded_by:user.id,
             archive_status:'pending',
             original_size_bytes:original.size,
             compressed_size_bytes:compressed.compressedSize,
             client_photo_key:photoKey,
           }).select('id,storage_path,archive_status,archive_staging_path').single()
           if(pe||!inserted){
             const {data:raceRow}=await s.from('report_photos').select('id,storage_path,archive_status,archive_staging_path').eq('client_photo_key',photoKey).maybeSingle()
             if(!raceRow) throw new Error(`บันทึกข้อมูลรูปไม่สำเร็จ: ${pe?.message||'unknown error'}`)
             photoRow=raceRow
           }else photoRow=inserted
         }

         const originalName=safeFileName(original.name)
         const stagingPath=photoRow.archive_staging_path||`${user.id}/${date}/${reportIdText}/${photoRow.id}/${originalName}`
         const {error:stageError}=await s.storage.from('photo-archive-staging').upload(stagingPath,original,{upsert:true,contentType:original.type||'application/octet-stream'})
         if(stageError){
           archiveFailures++
           await s.from('report_photos').update({archive_status:'failed',archive_error:`Staging upload: ${stageError.message}`,archive_staging_path:stagingPath}).eq('id',photoRow.id)
           continue
         }

         const {data:signed,error:signedError}=await s.storage.from('photo-archive-staging').createSignedUrl(stagingPath,1800)
         if(signedError||!signed?.signedUrl){
           archiveFailures++
           await s.from('report_photos').update({archive_status:'failed',archive_error:`Create signed URL: ${signedError?.message||'failed'}`,archive_staging_path:stagingPath}).eq('id',photoRow.id)
           continue
         }

         const archiveResponse=await fetch('/api/archive/photo',{
           method:'POST',
           headers:{'content-type':'application/json','authorization':`Bearer ${session.access_token}`},
           body:JSON.stringify({
             photo_id:photoRow.id,
             report_id:reportIdText,
             project_id:sec.projectId,
             project_code:project.code,
             project_name:project.name,
             report_date:date,
             phase:sec.phase,
             original_file_name:original.name,
             staging_path:stagingPath,
             signed_url:signed.signedUrl,
           })
         })

         if(archiveResponse.ok) queuedPhotos++
         else archiveFailures++
       }
       saved++
     }

     submittedRef.current=true
     try{ localStorage.removeItem(LOCAL_DRAFT_KEY) }catch{}
     await s.from('report_drafts').delete().eq('user_id',user.id).eq('draft_key',draftKey)
     setDraftStatus('ส่งรายงานแล้ว • Draft ถูกปิด')

     const photoSummary=selectedPhotoCount?` • Archive: เข้าคิว ${queuedPhotos} รูป${alreadyArchived?` • มีใน Drive แล้ว ${alreadyArchived} รูป`:''}${archiveFailures?` • Retry ได้ ${archiveFailures} รูป`:''}`:''
     setMessage(`บันทึกรายงานเรียบร้อย ${saved} Site / Plot${photoSummary}`)
     window.setTimeout(()=>router.push('/reports'),1200)
   }catch(err:any){
     setMessage(`${err.message||'บันทึกไม่สำเร็จ'} • Draft ยังอยู่ และกดส่งซ้ำได้อย่างปลอดภัย`)
   }finally{
     setSaving(false)
     submitLock.current=false
   }
 }

 return <AppShell>
   <PageHeader title="Daily Site Report" subtitle="V3.4 • Auto-save Draft • กันส่งซ้ำ • รูป Original Archive เข้า Google Drive"/>
   <form onSubmit={submit} className="stack-lg">
     <section className="panel"><div className="row between"><h2>ข้อมูลประจำวัน</h2><span className="pill">{draftStatus}</span></div><div className="form-grid">
       <label>วันที่<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
       <label>สภาพอากาศ<input value={weather} onChange={e=>setWeather(e.target.value)} placeholder="แดด / ฝน / ครึ้ม"/></label>
       <div className="report-summary-box"><b>{sections.length}</b><span>Site / Plot ในฟอร์ม</span><b>{grandManpower}</b><span>คน (รวมตามที่กรอก)</span></div>
     </div>
     <div className="notice small">ข้อมูลข้อความจะ Auto-save ทั้งในเครื่องและ Cloud เพื่อกลับมากรอกต่อได้ • รูปที่เลือกจะยังอยู่เฉพาะในหน้าปัจจุบันและเริ่มอัปโหลดเมื่อกดส่งรายงาน</div></section>

     {sections.map((sec,si)=>{
       const availableTasks=sectionTasks(sec.projectId)
       const itemManpower=sec.items.reduce((a,b)=>a+(Number(b.manpower)||0),0)
       return <section className="panel site-report-section" key={sec.id}>
         <div className="panel-head"><div><span className="pill">Site / Plot #{si+1}</span><h2>{projects.find(p=>p.id===sec.projectId)?.name||'เลือก Site / Plot'}</h2></div>{sections.length>1&&<button type="button" className="link-danger" onClick={()=>removeSection(sec.id)}>ลบ Site / Plot นี้</button>}</div>
         <div className="form-grid">
           <label>Site / Plot<select value={sec.projectId} onChange={e=>changeProject(sec,e.target.value)} required>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
           <label>Progress ภาพรวม Plot นี้ (%)<input type="number" min="0" max="100" value={sec.overall} onChange={e=>updateSection(sec.id,{overall:Number(e.target.value)})}/></label>
           <label>กำลังคนรวม Plot นี้<input type="number" min="0" value={sec.manpower} onChange={e=>updateSection(sec.id,{manpower:Number(e.target.value)})} placeholder={`${itemManpower}`}/><small className="muted">ถ้าเว้นว่าง ระบบรวมจากรายการงานด้านล่าง</small></label>
           <label className="span-2">สรุปงานของ Site / Plot นี้<textarea value={sec.summary} onChange={e=>updateSection(sec.id,{summary:e.target.value})} rows={3} placeholder="วันนี้ทำอะไรเสร็จ / งานเด่น / สิ่งที่ต้องติดตาม"/></label>
         </div>

         <div className="subsection-head"><h3>รายการงาน</h3><button type="button" className="button" onClick={()=>updateSection(sec.id,{items:[...sec.items,emptyItem()]})}>+ เพิ่มงาน</button></div>
         {sec.items.map((x,i)=><div className="work-card" key={i}><div className="row between"><b>งาน #{i+1}</b>{sec.items.length>1&&<button type="button" className="link-danger" onClick={()=>updateSection(sec.id,{items:sec.items.filter((_,idx)=>idx!==i)})}>ลบ</button>}</div><div className="form-grid">
           <label className="span-2">เลือกจากกำหนดแผนงาน<select value={x.schedule_task_id} onChange={e=>chooseTask(sec,i,e.target.value)}><option value="">-- เลือกงาน หรือกรอกเอง --</option>{availableTasks.map(t=><option key={t.id} value={t.id}>{t.source_task_no}. {t.task_name} — {t.area||'-'}</option>)}</select><small className="muted">หากเป็นงานส่วนกลางหรือไม่มีใน Schedule สามารถกรอกชื่อ “งาน” เองได้</small></label>
           <label>งาน<input value={x.work_item} onChange={e=>updateItem(sec.id,i,{work_item:e.target.value})} placeholder="ชื่องานที่ทำวันนี้" required/></label>
           <label>หมวดงาน<input value={x.work_category} onChange={e=>updateItem(sec.id,i,{work_category:e.target.value})}/></label>
           <label>ความคืบหน้าจริง (%)<input type="number" min="0" max="100" value={x.actual_progress} onChange={e=>updateItem(sec.id,i,{actual_progress:Number(e.target.value)})}/></label>
           <label>สถานะ<select value={x.status} onChange={e=>updateItem(sec.id,i,{status:e.target.value})}>{statusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
           <label>กำลังคน<input type="number" min="0" value={x.manpower} onChange={e=>updateItem(sec.id,i,{manpower:Number(e.target.value)})}/></label>
           <label>ผู้รับเหมา / ทีมงาน<input value={x.contractor} onChange={e=>updateItem(sec.id,i,{contractor:e.target.value})} placeholder="ถ้ามี"/></label>
           <label>Target วันที่ต้องเสร็จ<input type="date" value={x.target_date} onChange={e=>updateItem(sec.id,i,{target_date:e.target.value})}/></label>
           <label className="span-2">ปัญหา / อุปสรรค<input value={x.blocker} onChange={e=>updateItem(sec.id,i,{blocker:e.target.value})} placeholder="ติดอะไร / รอใคร / รอวัสดุอะไร"/></label>
           <label className="span-2">งานถัดไป / วิธีดำเนินการ<input value={x.next_action} onChange={e=>updateItem(sec.id,i,{next_action:e.target.value})} placeholder="จะทำอะไรต่อ / ใครต้องดำเนินการ"/></label>
         </div></div>)}

         <div className="subsection-head"><h3>รูปประกอบหน้างาน</h3></div><div className="form-grid">
           <label>ประเภทภาพ<select value={sec.phase} onChange={e=>updateSection(sec.id,{phase:e.target.value})}><option value="before">ก่อนทำ</option><option value="during">ระหว่างทำ</option><option value="after">หลังทำ</option><option value="other">อื่น ๆ</option></select></label>
           <label className="span-2">เลือกรูปจากมือถือ<input type="file" accept="image/*" multiple onChange={e=>updateSection(sec.id,{files:Array.from(e.target.files||[])})}/><small>{sec.files.length} รูป • ระบบบีบรูปสำหรับ Dashboard อัตโนมัติ และเก็บ Original เข้า Drive</small></label>
         </div>
       </section>
     })}

     <button type="button" className="button add-site-button" onClick={addSection}>+ เพิ่ม Site / Plot ที่คุมในวันนี้</button>
     {message&&<div className="notice">{message}</div>}
     <div className="sticky-actions"><button className="primary big" disabled={saving||!draftReady}>{saving?'กำลังบันทึกและส่งรูปเข้า Archive…':`บันทึกรายงาน ${totalReports||sections.length} Site / Plot`}</button></div>
   </form>
 </AppShell>
}
