'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import { todayISO } from '@/lib/format'
import type { Project, ScheduleTask } from '@/lib/types'

type Item = { schedule_task_id:string; work_item:string; work_category:string; actual_progress:number; manpower:number; contractor:string; status:string; blocker:string; next_action:string; target_date:string; remarks:string }
type ReportSection = { id:string; projectId:string; overall:number; manpower:number; summary:string; items:Item[]; files:File[]; phase:string }

const emptyItem = ():Item => ({schedule_task_id:'',work_item:'',work_category:'',actual_progress:0,manpower:0,contractor:'',status:'in_progress',blocker:'',next_action:'',target_date:'',remarks:''})
const emptySection = (projectId=''):ReportSection => ({id:`section-${Date.now()}-${Math.random().toString(36).slice(2)}`,projectId,overall:0,manpower:0,summary:'',items:[emptyItem()],files:[],phase:'during'})

const statusOptions = [
  ['not_started','ยังไม่เริ่ม'],['in_progress','กำลังดำเนินการ'],['awaiting_inspection','รอตรวจ'],['blocked','ติดปัญหา/อุปสรรค'],['delayed','ล่าช้า'],['completed','เสร็จแล้ว'],['on_hold','พักงาน']
]

export default function NewReportPage(){
 const router=useRouter()
 const [projects,setProjects]=useState<Project[]>([])
 const [tasks,setTasks]=useState<ScheduleTask[]>([])
 const [date,setDate]=useState(todayISO())
 const [weather,setWeather]=useState('')
 const [sections,setSections]=useState<ReportSection[]>([emptySection()])
 const [saving,setSaving]=useState(false)
 const [message,setMessage]=useState('')

 useEffect(()=>{
   const s=getSupabase()
   Promise.all([
     s.from('projects').select('*').eq('active',true).order('sort_order'),
     s.from('v_schedule_tasks').select('*').order('planned_start')
   ]).then(([p,t])=>{
     const ps=(p.data||[]) as Project[]
     setProjects(ps)
     setTasks((t.data||[]) as ScheduleTask[])
     if(ps[0]) setSections([emptySection(ps[0].id)])
   })
 },[])

 const updateSection=(id:string,patch:Partial<ReportSection>)=>setSections(v=>v.map(s=>s.id===id?{...s,...patch}:s))
 const updateItem=(sectionId:string,i:number,patch:Partial<Item>)=>setSections(v=>v.map(s=>s.id===sectionId?{...s,items:s.items.map((x,idx)=>idx===i?{...x,...patch}:x)}:s))
 const chooseTask=(section:ReportSection,i:number,id:string)=>{
   const t=tasks.find(x=>x.id===id)
   updateItem(section.id,i,{schedule_task_id:id,work_item:t?.task_name||'',work_category:t?.category||'',actual_progress:Math.round((t?.actual_progress||0)*100),contractor:t?.contractor||'',target_date:t?.target_close||''})
 }
 const sectionTasks=(projectId:string)=>tasks.filter(t=>t.project_id===projectId&&t.source_task_no!=='1')
 const totalReports=sections.filter(s=>s.projectId&&s.items.some(x=>x.work_item.trim())).length
 const grandManpower=useMemo(()=>sections.reduce((sum,s)=>sum+(Number(s.manpower)||s.items.reduce((a,b)=>a+(Number(b.manpower)||0),0)),0),[sections])

 const addSection=()=>setSections(v=>[...v,emptySection(projects[0]?.id||'')])
 const removeSection=(id:string)=>setSections(v=>v.filter(s=>s.id!==id))
 const changeProject=(section:ReportSection,projectId:string)=>updateSection(section.id,{projectId,items:[emptyItem()],overall:0,manpower:0,summary:'',files:[]})

 const submit=async(e:FormEvent)=>{
   e.preventDefault()
   setSaving(true)
   setMessage('')
   const s=getSupabase()
   try{
     const {data:{user},error:userError}=await s.auth.getUser()
     if(userError||!user) throw new Error('กรุณาเข้าสู่ระบบใหม่')

     const validSections=sections.filter(sec=>sec.projectId&&sec.items.some(x=>x.work_item.trim()))
     if(!validSections.length) throw new Error('กรุณากรอกรายการงานอย่างน้อย 1 Site / Plot')
     const ids=validSections.map(sec=>sec.projectId)
     if(new Set(ids).size!==ids.length) throw new Error('Site / Plot ซ้ำกัน กรุณารวมงานของ Plot เดียวกันไว้ในส่วนเดียว')

     let saved=0
     for(const sec of validSections){
       const valid=sec.items.filter(x=>x.work_item.trim())
       const itemManpower=valid.reduce((a,b)=>a+(Number(b.manpower)||0),0)
       const {data:report,error}=await s.from('daily_reports').insert({
         project_id:sec.projectId,report_date:date,reporter_id:user.id,weather:weather||null,
         overall_progress:Number(sec.overall)/100,total_manpower:Number(sec.manpower)||itemManpower,
         summary:sec.summary||null,status:'submitted'
       }).select('id').single()
       if(error) throw new Error(`บันทึกรายงานลำดับที่ ${saved+1} ไม่สำเร็จ: ${error.message}`)

       let firstItemId:string|null=null
       const {data:itemRows,error:itemError}=await s.from('report_items').insert(valid.map(x=>({
         daily_report_id:report.id,schedule_task_id:x.schedule_task_id||null,work_category:x.work_category||null,
         work_item:x.work_item,actual_progress:Number(x.actual_progress)/100,manpower:Number(x.manpower)||0,
         contractor:x.contractor||null,status:x.status,blocker:x.blocker||null,next_action:x.next_action||null,
         target_date:x.target_date||null,remarks:x.remarks||null
       }))).select('id')
       if(itemError) throw new Error(`บันทึกรายการงานไม่สำเร็จ: ${itemError.message}`)
       firstItemId=itemRows?.[0]?.id||null

       for(let i=0;i<sec.files.length;i++){
         const f=sec.files[i]
         const ext=(f.name.split('.').pop()||'jpg').toLowerCase()
         const path=`${sec.projectId}/${date}/${report.id}/${Date.now()}-${i}.${ext}`
         const {error:up}=await s.storage.from('site-photos').upload(path,f,{upsert:false,contentType:f.type||undefined})
         if(up) throw new Error(`อัปโหลดรูปไม่สำเร็จ: ${up.message}`)
         const {error:pe}=await s.from('report_photos').insert({daily_report_id:report.id,report_item_id:firstItemId,storage_path:path,phase:sec.phase,caption:f.name,uploaded_by:user.id})
         if(pe) throw new Error(`บันทึกข้อมูลรูปไม่สำเร็จ: ${pe.message}`)
       }
       saved++
     }

     setMessage(`บันทึกรายงานเรียบร้อย ${saved} Site / Plot`)
     setTimeout(()=>router.push('/reports'),700)
   }catch(err:any){
     setMessage(err.message||'บันทึกไม่สำเร็จ')
   }finally{
     setSaving(false)
   }
 }

 return <AppShell>
   <PageHeader title="Daily Site Report" subtitle="กรอกครั้งเดียวได้หลาย Site / Plot • ระบบจะแยกบันทึกและ Sync งานกลับ Schedule ของแต่ละ Plot อัตโนมัติ"/>
   <form onSubmit={submit} className="stack-lg">
     <section className="panel"><h2>ข้อมูลประจำวัน</h2><div className="form-grid">
       <label>วันที่<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
       <label>สภาพอากาศ<input value={weather} onChange={e=>setWeather(e.target.value)} placeholder="แดด / ฝน / ครึ้ม"/></label>
       <div className="report-summary-box"><b>{sections.length}</b><span>Site / Plot ในฟอร์ม</span><b>{grandManpower}</b><span>คน (รวมตามที่กรอก)</span></div>
     </div>
     <div className="notice small">กรณีคุมหลาย Plot ให้กด “+ เพิ่ม Site / Plot” แล้วกรอกงานของแต่ละ Plot ในฟอร์มเดียวได้เลย ถ้าคนชุดเดียวทำหลาย Plot ให้แบ่งจำนวนคนตามที่ทำจริงในแต่ละ Plot เพื่อไม่ให้กำลังคนถูกนับซ้ำ</div></section>

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
           <label className="span-2">เลือกรูปจากมือถือ<input type="file" accept="image/*" multiple onChange={e=>updateSection(sec.id,{files:Array.from(e.target.files||[])})}/><small>{sec.files.length} รูป</small></label>
         </div>
       </section>
     })}

     <button type="button" className="button add-site-button" onClick={addSection}>+ เพิ่ม Site / Plot ที่คุมในวันนี้</button>
     {message&&<div className="notice">{message}</div>}
     <div className="sticky-actions"><button className="primary big" disabled={saving}>{saving?'กำลังบันทึก…':`บันทึกรายงาน ${totalReports||sections.length} Site / Plot`}</button></div>
   </form>
 </AppShell>
}
