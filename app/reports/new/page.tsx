'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import { todayISO } from '@/lib/format'
import type { Project, ScheduleTask } from '@/lib/types'

type Item = { schedule_task_id:string; work_item:string; work_category:string; actual_progress:number; manpower:number; contractor:string; status:string; blocker:string; next_action:string; target_date:string; remarks:string }
const emptyItem = ():Item => ({schedule_task_id:'',work_item:'',work_category:'',actual_progress:0,manpower:0,contractor:'',status:'in_progress',blocker:'',next_action:'',target_date:'',remarks:''})

export default function NewReportPage(){
 const router=useRouter()
 const [projects,setProjects]=useState<Project[]>([])
 const [tasks,setTasks]=useState<ScheduleTask[]>([])
 const [projectId,setProjectId]=useState('')
 const [date,setDate]=useState(todayISO())
 const [weather,setWeather]=useState('')
 const [summary,setSummary]=useState('')
 const [overall,setOverall]=useState(0)
 const [manpower,setManpower]=useState(0)
 const [items,setItems]=useState<Item[]>([emptyItem()])
 const [files,setFiles]=useState<File[]>([])
 const [phase,setPhase]=useState('during')
 const [saving,setSaving]=useState(false)
 const [message,setMessage]=useState('')

 useEffect(()=>{
   const s=getSupabase()
   s.from('projects').select('*').eq('active',true).order('sort_order').then(({data})=>{
     const p=(data||[]) as Project[]
     setProjects(p)
     if(p[0]) setProjectId(p[0].id)
   })
 },[])

 useEffect(()=>{
   if(!projectId)return
   getSupabase().from('v_schedule_tasks').select('*').eq('project_id',projectId).order('planned_start').then(({data})=>setTasks((data||[]) as ScheduleTask[]))
 },[projectId])

 const updateItem=(i:number,patch:Partial<Item>)=>setItems(v=>v.map((x,idx)=>idx===i?{...x,...patch}:x))
 const chooseTask=(i:number,id:string)=>{
   const t=tasks.find(x=>x.id===id)
   updateItem(i,{schedule_task_id:id,work_item:t?.task_name||'',work_category:t?.category||'',actual_progress:Math.round((t?.actual_progress||0)*100),contractor:t?.contractor||'',target_date:t?.target_close||''})
 }
 const totalItemManpower=useMemo(()=>items.reduce((a,b)=>a+(Number(b.manpower)||0),0),[items])

 const submit=async(e:FormEvent)=>{
   e.preventDefault()
   setSaving(true)
   setMessage('')
   const s=getSupabase()
   try{
     const {data:{user},error:userError}=await s.auth.getUser()
     if(userError||!user) throw new Error('กรุณา Login ใหม่')
     const {data:report,error}=await s.from('daily_reports').insert({project_id:projectId,report_date:date,reporter_id:user.id,weather:weather||null,overall_progress:Number(overall)/100,total_manpower:Number(manpower)||totalItemManpower,summary:summary||null,status:'submitted'}).select('id').single()
     if(error) throw error

     const valid=items.filter(x=>x.work_item.trim())
     let firstItemId:string|null=null
     if(valid.length){
       const {data:itemRows,error:itemError}=await s.from('report_items').insert(valid.map(x=>({daily_report_id:report.id,schedule_task_id:x.schedule_task_id||null,work_category:x.work_category||null,work_item:x.work_item,actual_progress:Number(x.actual_progress)/100,manpower:Number(x.manpower)||0,contractor:x.contractor||null,status:x.status,blocker:x.blocker||null,next_action:x.next_action||null,target_date:x.target_date||null,remarks:x.remarks||null}))).select('id')
       if(itemError) throw itemError
       firstItemId=itemRows?.[0]?.id||null
     }

     for(let i=0;i<files.length;i++){
       const f=files[i]
       const ext=(f.name.split('.').pop()||'jpg').toLowerCase()
       const path=`${projectId}/${date}/${report.id}/${Date.now()}-${i}.${ext}`
       const {error:up}=await s.storage.from('site-photos').upload(path,f,{upsert:false,contentType:f.type||undefined})
       if(up) throw up
       const {error:pe}=await s.from('report_photos').insert({daily_report_id:report.id,report_item_id:firstItemId,storage_path:path,phase,caption:f.name,uploaded_by:user.id})
       if(pe) throw pe
     }

     setMessage('บันทึกรายงานเรียบร้อย')
     setTimeout(()=>router.push('/reports'),600)
   }catch(err:any){
     setMessage(err.message||'บันทึกไม่สำเร็จ')
   }finally{
     setSaving(false)
   }
 }

 return <AppShell>
   <PageHeader title="Daily Site Report" subtitle="เลือกงานจาก Schedule แล้ว Actual / Status / Blocker จะ Sync กลับ Schedule อัตโนมัติ"/>
   <form onSubmit={submit} className="stack-lg">
     <section className="panel"><h2>ข้อมูลรายงาน</h2><div className="form-grid">
       <label>Site / Plot<select value={projectId} onChange={e=>setProjectId(e.target.value)} required>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
       <label>วันที่<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
       <label>Weather<input value={weather} onChange={e=>setWeather(e.target.value)} placeholder="แดด / ฝน / ครึ้ม"/></label>
       <label>Overall Progress %<input type="number" min="0" max="100" value={overall} onChange={e=>setOverall(Number(e.target.value))}/></label>
       <label>Manpower รวม<input type="number" min="0" value={manpower} onChange={e=>setManpower(Number(e.target.value))} placeholder={`${totalItemManpower}`}/></label>
       <label className="span-2">สรุปภาพรวม<textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={3} placeholder="วันนี้ทำอะไรสำเร็จ / มีอะไรต้องติดตาม"/></label>
     </div></section>

     <section className="panel"><div className="panel-head"><h2>รายการงาน</h2><button type="button" className="button" onClick={()=>setItems(v=>[...v,emptyItem()])}>+ เพิ่มงาน</button></div>
       {items.map((x,i)=><div className="work-card" key={i}><div className="row between"><b>งาน #{i+1}</b>{items.length>1&&<button type="button" className="link-danger" onClick={()=>setItems(v=>v.filter((_,idx)=>idx!==i))}>ลบ</button>}</div><div className="form-grid">
         <label className="span-2">เลือกจาก Schedule<select value={x.schedule_task_id} onChange={e=>chooseTask(i,e.target.value)}><option value="">-- เลือกงาน หรือกรอกเอง --</option>{tasks.map(t=><option key={t.id} value={t.id}>{t.source_task_no}. {t.task_name} — {t.area||'-'}</option>)}</select></label>
         <label>งาน<input value={x.work_item} onChange={e=>updateItem(i,{work_item:e.target.value})} required/></label>
         <label>หมวด<input value={x.work_category} onChange={e=>updateItem(i,{work_category:e.target.value})}/></label>
         <label>Actual %<input type="number" min="0" max="100" value={x.actual_progress} onChange={e=>updateItem(i,{actual_progress:Number(e.target.value)})}/></label>
         <label>Status<select value={x.status} onChange={e=>updateItem(i,{status:e.target.value})}><option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="awaiting_inspection">Awaiting Inspection</option><option value="blocked">Blocked</option><option value="delayed">Delayed</option><option value="completed">Completed</option><option value="on_hold">On Hold</option></select></label>
         <label>Manpower<input type="number" min="0" value={x.manpower} onChange={e=>updateItem(i,{manpower:Number(e.target.value)})}/></label>
         <label>Contractor<input value={x.contractor} onChange={e=>updateItem(i,{contractor:e.target.value})}/></label>
         <label>Target<input type="date" value={x.target_date} onChange={e=>updateItem(i,{target_date:e.target.value})}/></label>
         <label className="span-2">Blocker<input value={x.blocker} onChange={e=>updateItem(i,{blocker:e.target.value})} placeholder="ติดอะไร / ใครต้องปลดล็อก"/></label>
         <label className="span-2">Next Action<input value={x.next_action} onChange={e=>updateItem(i,{next_action:e.target.value})} placeholder="งานถัดไป / วิธีแก้"/></label>
       </div></div>)}
     </section>

     <section className="panel"><h2>Photo Evidence</h2><div className="form-grid">
       <label>ประเภทภาพ<select value={phase} onChange={e=>setPhase(e.target.value)}><option value="before">Before</option><option value="during">During</option><option value="after">After</option><option value="other">Other</option></select></label>
       <label className="span-2">เลือกรูปจากมือถือ<input type="file" accept="image/*" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))}/><small>{files.length} รูป</small></label>
     </div></section>

     {message&&<div className="notice">{message}</div>}
     <div className="sticky-actions"><button className="primary big" disabled={saving}>{saving?'กำลังบันทึก…':'บันทึก Daily Report'}</button></div>
   </form>
 </AppShell>
}
