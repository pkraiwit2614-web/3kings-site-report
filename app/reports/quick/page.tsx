'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import { todayISO } from '@/lib/format'
import { compressSitePhoto } from '@/lib/imageCompression'

type Project={id:string;code:string;name:string;active?:boolean}
type Task={id:string;project_id:string;source_task_no:string|null;task_name:string;area:string|null;category:string|null;actual_progress:number|null;contractor:string|null;target_close:string|null;planned_start:string|null;planned_end:string|null}
type QuickItem={
  key:string;schedule_task_id:string;work_item:string;work_category:string;actual_progress:number;status:string;next_action:string;blocker:string;
  contractor:string;target_date:string;phase:'before'|'during'|'after'|'other';files:File[]
}
type QuickDraft={version:number;savedAt:string;date:string;projectId:string;manpower:number;weather:string;summary:string;items:Array<Omit<QuickItem,'files'>>}

const LOCAL_KEY='3kings:v40:daily-report-quick'
const statusOptions=[
  ['in_progress','กำลังทำ'],['awaiting_inspection','รอตรวจ'],['blocked','ติดปัญหา'],['delayed','ล่าช้า'],['completed','เสร็จแล้ว']
]
const phaseOptions=[['before','ก่อนทำ'],['during','ระหว่างทำ'],['after','หลังทำ']] as const
const newKey=()=>typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`
const emptyItem=():QuickItem=>({key:newKey(),schedule_task_id:'',work_item:'',work_category:'',actual_progress:0,status:'in_progress',next_action:'',blocker:'',contractor:'',target_date:'',phase:'during',files:[]})
const safeFileName=(name:string)=>name.replace(/[\\/:*?"<>|#%{}[\]~]/g,'-').replace(/\s+/g,'-').slice(0,120)||'site-photo'

function statusLabel(value:string){return statusOptions.find(x=>x[0]===value)?.[1]||value}
function itemHasWork(x:QuickItem){return Boolean(x.schedule_task_id||x.work_item.trim())}

export default function DailyReportQuickPage(){
  const router=useRouter()
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<Task[]>([])
  const [date,setDate]=useState(todayISO())
  const [projectId,setProjectId]=useState('')
  const [manpower,setManpower]=useState(0)
  const [weather,setWeather]=useState('')
  const [summary,setSummary]=useState('')
  const [items,setItems]=useState<QuickItem[]>([emptyItem()])
  const [draftKey,setDraftKey]=useState(newKey())
  const [draftStatus,setDraftStatus]=useState('กำลังเตรียมร่าง…')
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const submitLock=useRef(false)

  useEffect(()=>{
    let alive=true
    const load=async()=>{
      const s=getSupabase()
      const [p,t]=await Promise.all([
        s.from('projects').select('id,code,name,active').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('id,project_id,source_task_no,task_name,area,category,actual_progress,contractor,target_close,planned_start,planned_end').order('planned_start')
      ])
      if(!alive)return
      if(p.error)throw p.error
      if(t.error)throw t.error
      const ps=(p.data||[]) as Project[]
      setProjects(ps);setTasks((t.data||[]) as Task[])
      let restored:QuickDraft|null=null
      try{restored=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null')}catch{}
      if(restored?.version===40){
        setDate(restored.date||todayISO());setProjectId(restored.projectId||ps[0]?.id||'');setManpower(Number(restored.manpower)||0)
        setWeather(restored.weather||'');setSummary(restored.summary||'')
        setItems(Array.isArray(restored.items)&&restored.items.length?restored.items.map(x=>({...x,key:x.key||newKey(),files:[]})):[emptyItem()])
        setDraftStatus(`กู้ร่างล่าสุดแล้ว • ${new Date(restored.savedAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`)
      }else{
        setProjectId(ps[0]?.id||'');setDraftStatus('พร้อม Auto-save ในเครื่อง')
      }
    }
    load().catch(e=>{if(alive){setMessage(`โหลดข้อมูลไม่สำเร็จ: ${e?.message||'unknown error'}`);setDraftStatus('ยังไม่พร้อม')}})
    return()=>{alive=false}
  },[])

  useEffect(()=>{
    if(!projectId)return
    const timer=window.setTimeout(()=>{
      const payload:QuickDraft={version:40,savedAt:new Date().toISOString(),date,projectId,manpower,weather,summary,items:items.map(({files,...rest})=>rest)}
      try{localStorage.setItem(LOCAL_KEY,JSON.stringify(payload));setDraftStatus(`บันทึกร่างแล้ว • ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`)}catch{setDraftStatus('บันทึกร่างในเครื่องไม่สำเร็จ')}
    },500)
    return()=>window.clearTimeout(timer)
  },[date,projectId,manpower,weather,summary,items])

  const availableTasks=useMemo(()=>tasks.filter(t=>t.project_id===projectId&&t.source_task_no!=='1').sort((a,b)=>{
    const ad=(a.actual_progress||0)>=1?1:0,bd=(b.actual_progress||0)>=1?1:0
    if(ad!==bd)return ad-bd
    return String(a.source_task_no||'').localeCompare(String(b.source_task_no||''),undefined,{numeric:true})
  }),[tasks,projectId])
  const selectedProject=projects.find(p=>p.id===projectId)||null
  const validItems=items.filter(itemHasWork)
  const photoCount=items.reduce((sum,x)=>sum+x.files.length,0)

  const updateItem=(key:string,patch:Partial<QuickItem>)=>setItems(v=>v.map(x=>x.key===key?{...x,...patch}:x))
  const chooseTask=(item:QuickItem,taskId:string)=>{
    const t=tasks.find(x=>x.id===taskId)
    updateItem(item.key,{
      schedule_task_id:taskId,
      work_item:t?.task_name||'',
      work_category:t?.category||'',
      actual_progress:Math.round((t?.actual_progress||0)*100),
      contractor:t?.contractor||'',
      target_date:t?.target_close||''
    })
  }
  const changeProject=(id:string)=>{setProjectId(id);setItems([emptyItem()]);setSummary('');setMessage('')}
  const addItem=()=>setItems(v=>[...v,emptyItem()])
  const removeItem=(key:string)=>setItems(v=>v.length===1?v:v.filter(x=>x.key!==key))

  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    if(submitLock.current||saving)return
    setMessage('')
    if(!projectId){setMessage('กรุณาเลือก Site / Plot');return}
    if(!validItems.length){setMessage('กรุณาเลือกหรือกรอกงานอย่างน้อย 1 งาน');return}
    const noName=validItems.find(x=>!x.work_item.trim())
    if(noName){setMessage('มีรายการที่ยังไม่มีชื่องาน กรุณาเลือกงานจาก Schedule หรือกรอกชื่องาน');return}
    if(validItems.some(x=>(x.status==='blocked'||x.status==='delayed')&&!x.blocker.trim())){setMessage('งานที่ติดปัญหา/ล่าช้า กรุณาระบุสาเหตุสั้น ๆ');return}

    submitLock.current=true;setSaving(true)
    const s=getSupabase()
    try{
      const [{data:{user},error:userError},{data:{session}}]=await Promise.all([s.auth.getUser(),s.auth.getSession()])
      if(userError||!user)throw new Error('กรุณาเข้าสู่ระบบใหม่')
      if(!session?.access_token)throw new Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่')
      const project=selectedProject
      if(!project)throw new Error('ไม่พบข้อมูล Site / Plot')

      const scheduleActual=availableTasks.length?availableTasks.reduce((sum,t)=>sum+Number(t.actual_progress||0),0)/availableTasks.length:0
      const submissionKey=`quick-v40:${draftKey}:${projectId}`
      const {data:reportId,error:reportError}=await s.rpc('daily_report_submit_v34',{
        p_submission_key:submissionKey,
        p_project_id:projectId,
        p_report_date:date,
        p_reporter_id:user.id,
        p_weather:weather||null,
        p_overall_progress:scheduleActual,
        p_total_manpower:Number(manpower)||0,
        p_summary:summary||null,
        p_items:validItems.map(x=>({
          schedule_task_id:x.schedule_task_id||'',work_category:x.work_category||'',work_item:x.work_item,
          actual_progress:Number(x.actual_progress)/100,manpower:0,contractor:x.contractor||'',status:x.status,
          blocker:x.blocker||'',next_action:x.next_action||'',target_date:x.target_date||'',remarks:'Quick Mode V4.0'
        }))
      })
      if(reportError||!reportId)throw new Error(`บันทึกรายงานไม่สำเร็จ: ${reportError?.message||'unknown error'}`)
      const reportIdText=String(reportId)
      const {data:reportRows,error:itemError}=await s.from('report_items').select('id,schedule_task_id,work_item').eq('daily_report_id',reportIdText)
      if(itemError)throw new Error(`บันทึกรายงานแล้ว แต่จับคู่ Task Photo ไม่สำเร็จ: ${itemError.message}`)
      const rows=(reportRows||[]) as Array<{id:string;schedule_task_id:string|null;work_item:string}>
      const used=new Set<string>()
      const rowFor=(item:QuickItem)=>{
        const row=rows.find(r=>!used.has(r.id)&&item.schedule_task_id&&r.schedule_task_id===item.schedule_task_id)
          ||rows.find(r=>!used.has(r.id)&&r.work_item===item.work_item)
        if(row)used.add(row.id)
        return row||null
      }

      let uploaded=0,queued=0,archiveFailed=0
      for(const item of validItems){
        const reportItem=rowFor(item)
        for(let i=0;i<item.files.length;i++){
          const original=item.files[i]
          const photoKey=`${submissionKey}:${item.key}:photo:${i}:${original.name}:${original.size}:${original.lastModified}`
          const {data:existing}=await s.from('report_photos').select('id,archive_status,archive_staging_path').eq('client_photo_key',photoKey).maybeSingle()
          let photoRow:any=existing||null
          if(photoRow?.archive_status==='archived'||photoRow?.archive_status==='processing'){queued++;continue}

          if(!photoRow){
            const compressed=await compressSitePhoto(original)
            const ext=(compressed.file.name.split('.').pop()||'jpg').toLowerCase()
            const path=`${projectId}/${date}/${reportIdText}/${reportItem?.id||item.key}/${i}-${original.lastModified}-${safeFileName(original.name.replace(/\.[^.]+$/,''))}.${ext}`
            const {error:up}=await s.storage.from('site-photos').upload(path,compressed.file,{upsert:true,contentType:compressed.file.type||undefined})
            if(up)throw new Error(`อัปโหลดรูป Dashboard ไม่สำเร็จ: ${up.message}`)
            const {data:inserted,error:pe}=await s.from('report_photos').insert({
              daily_report_id:reportIdText,report_item_id:reportItem?.id||null,storage_path:path,phase:item.phase,caption:original.name,
              uploaded_by:user.id,archive_status:'pending',original_size_bytes:original.size,compressed_size_bytes:compressed.compressedSize,client_photo_key:photoKey
            }).select('id,archive_status,archive_staging_path').single()
            if(pe||!inserted)throw new Error(`บันทึกข้อมูลรูปไม่สำเร็จ: ${pe?.message||'unknown error'}`)
            photoRow=inserted;uploaded++
          }

          const stagingPath=photoRow.archive_staging_path||`${user.id}/${date}/${reportIdText}/${photoRow.id}/${safeFileName(original.name)}`
          const {error:stageError}=await s.storage.from('photo-archive-staging').upload(stagingPath,original,{upsert:true,contentType:original.type||'application/octet-stream'})
          if(stageError){archiveFailed++;await s.from('report_photos').update({archive_status:'failed',archive_error:`Staging upload: ${stageError.message}`,archive_staging_path:stagingPath}).eq('id',photoRow.id);continue}
          const {data:signed,error:signedError}=await s.storage.from('photo-archive-staging').createSignedUrl(stagingPath,1800)
          if(signedError||!signed?.signedUrl){archiveFailed++;continue}
          const archive=await fetch('/api/archive/photo',{
            method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${session.access_token}`},
            body:JSON.stringify({photo_id:photoRow.id,report_id:reportIdText,project_id:projectId,project_code:project.code,project_name:project.name,report_date:date,phase:item.phase,original_file_name:original.name,staging_path:stagingPath,signed_url:signed.signedUrl})
          })
          if(archive.ok)queued++;else archiveFailed++
        }
      }

      try{localStorage.removeItem(LOCAL_KEY)}catch{}
      setDraftKey(newKey());setMessage(`ส่งรายงานแล้ว ${validItems.length} งาน • ${manpower||0} คน${photoCount?` • รูป ${photoCount} รูป`:''}${archiveFailed?` • Archive รอตรวจ ${archiveFailed} รูป`:''}`)
      window.setTimeout(()=>router.push('/reports'),1200)
    }catch(err:any){setMessage(`${err?.message||'ส่งรายงานไม่สำเร็จ'} • ร่างข้อความยังอยู่ในเครื่อง`)}
    finally{setSaving(false);submitLock.current=false}
  }

  return <AppShell>
    <PageHeader title="Daily Report — Quick Mode" subtitle="สำหรับโฟร์แมน • เลือก Plot → งาน → % → สถานะ → รูป → งานถัดไป" action={<Link href="/reports/new" className="button">แบบละเอียด</Link>}/>
    <form onSubmit={submit} className="quick-report stack-lg">
      <section className="panel quick-head">
        <div className="quick-step"><span>1</span><div><b>เลือก Site / Plot</b><small>รายงาน 1 Plot ต่อครั้ง เพื่อลดการกรอกผิด</small></div><em>{draftStatus}</em></div>
        <div className="quick-grid">
          <label className="quick-plot">Site / Plot<select value={projectId} onChange={e=>changeProject(e.target.value)} required>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
          <label>วันที่<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
          <label>กำลังคนรวมวันนี้<input type="number" inputMode="numeric" min="0" value={manpower||''} onChange={e=>setManpower(Number(e.target.value))} placeholder="เช่น 8"/><small>นับคนจริงของ Plot วันนี้ ไม่ต้องบวกรายงานซ้ำตามงาน</small></label>
        </div>
      </section>

      <section className="panel">
        <div className="quick-step"><span>2</span><div><b>งานที่ทำวันนี้</b><small>เลือกจาก Schedule แล้วอัปเดตเฉพาะข้อมูลที่เห็นหน้างานจริง</small></div><em>{validItems.length} งาน • {photoCount} รูป</em></div>
        <div className="quick-items">
          {items.map((item,index)=>{
            const blocked=item.status==='blocked'||item.status==='delayed'
            return <article className="quick-item" key={item.key}>
              <div className="quick-item-title"><b>งาน #{index+1}</b>{items.length>1&&<button type="button" className="link-danger" onClick={()=>removeItem(item.key)}>ลบ</button>}</div>
              <label className="quick-task">เลือกงานจาก Schedule<select value={item.schedule_task_id} onChange={e=>chooseTask(item,e.target.value)}><option value="">— งานนอก Schedule / กรอกเอง —</option>{availableTasks.map(t=><option key={t.id} value={t.id}>{t.source_task_no||'-'}. {t.task_name} — {t.area||'-'} ({Math.round(Number(t.actual_progress||0)*100)}%)</option>)}</select></label>
              {!item.schedule_task_id&&<label>ชื่องาน<input value={item.work_item} onChange={e=>updateItem(item.key,{work_item:e.target.value})} placeholder="เช่น เก็บสีผนังหน้าบ้าน"/></label>}

              <div className="quick-progress-row">
                <label>ความคืบหน้าล่าสุด<div className="percent-input"><input type="number" inputMode="numeric" min="0" max="100" value={item.actual_progress} onChange={e=>updateItem(item.key,{actual_progress:Math.max(0,Math.min(100,Number(e.target.value)))})}/><span>%</span></div></label>
                <div className="quick-status"><span>สถานะ</span><div>{statusOptions.map(([value,label])=><button key={value} type="button" className={item.status===value?'active':''} onClick={()=>updateItem(item.key,{status:value})}>{label}</button>)}</div></div>
              </div>

              {blocked&&<label className="quick-alert">สาเหตุที่ติด / ล่าช้า<input value={item.blocker} onChange={e=>updateItem(item.key,{blocker:e.target.value})} placeholder="เช่น รอวัสดุ / รอแบบ / รอทีมงาน" required/></label>}
              <label>งานถัดไป / สิ่งที่ต้องทำต่อ<input value={item.next_action} onChange={e=>updateItem(item.key,{next_action:e.target.value})} placeholder="เช่น พรุ่งนี้ติดตั้งต่อ / รอตรวจ / ตามของ"/></label>

              <div className="quick-photo-box">
                <div><b>รูปของงานนี้</b><span>รูปจะผูกกับ Task นี้โดยตรง</span></div>
                <div className="phase-buttons">{phaseOptions.map(([value,label])=><button type="button" key={value} className={item.phase===value?'active':''} onClick={()=>updateItem(item.key,{phase:value})}>{label}</button>)}</div>
                <label className="photo-picker">📷 ถ่ายรูป / เลือกรูป<input type="file" accept="image/*" multiple onChange={e=>updateItem(item.key,{files:Array.from(e.target.files||[])})}/><span>{item.files.length?`${item.files.length} รูปที่เลือก`:'ยังไม่ได้เลือกรูป'}</span></label>
              </div>
            </article>
          })}
        </div>
        <button type="button" className="button add-quick-item" onClick={addItem}>+ เพิ่มงานอีก 1 งาน</button>
      </section>

      <details className="panel quick-more"><summary>ข้อมูลเพิ่มเติม (ไม่จำเป็นต้องกรอกทุกวัน)</summary><div className="quick-grid more-grid">
        <label>สภาพอากาศ<input value={weather} onChange={e=>setWeather(e.target.value)} placeholder="แดด / ฝน / ครึ้ม"/></label>
        <label className="span-2">สรุปภาพรวม / หมายเหตุ<textarea rows={3} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="มีเรื่องสำคัญที่หัวหน้าควรรู้ ให้ใส่ตรงนี้"/></label>
      </div></details>

      {message&&<div className="notice">{message}</div>}
      <section className="panel quick-review">
        <div className="quick-step"><span>3</span><div><b>ตรวจแล้วส่ง</b><small>{selectedProject?`${selectedProject.code} — ${selectedProject.name}`:'ยังไม่ได้เลือก Plot'} • {validItems.length} งาน • {manpower||0} คน • {photoCount} รูป</small></div></div>
        <div className="quick-review-list">{validItems.map((x,i)=><div key={x.key}><b>{i+1}. {x.work_item||'ยังไม่ได้ระบุงาน'}</b><span>{x.actual_progress}% • {statusLabel(x.status)}{x.files.length?` • ${x.files.length} รูป`:''}</span></div>)}</div>
        <button className="primary big quick-submit" disabled={saving||!projectId}>{saving?'กำลังบันทึกและส่งรูป…':'ส่ง Daily Report'}</button>
        <small className="muted">ข้อความจะ Auto-save ในเครื่อง • รูปเริ่มอัปโหลดเมื่อกดส่ง • ถ้าส่งไม่สำเร็จสามารถกดส่งซ้ำได้</small>
      </section>
    </form>

    <style jsx global>{`
      .quick-report{max-width:980px;margin:0 auto}.quick-head{border-top:4px solid var(--navy)}.quick-step{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;align-items:center;margin-bottom:14px}.quick-step>span{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:900}.quick-step>div b{display:block;font-size:16px;color:var(--navy-2)}.quick-step>div small{display:block;margin-top:2px;color:var(--muted);line-height:1.4}.quick-step>em{font-style:normal;font-size:10px;color:var(--muted);text-align:right}.quick-grid{display:grid;grid-template-columns:2fr 1fr 1.2fr;gap:10px}.quick-grid label,.quick-item>label,.quick-progress-row label,.quick-more label{font-size:11px;font-weight:800;color:var(--muted);display:grid;gap:5px}.quick-grid input,.quick-grid select,.quick-item input,.quick-item select,.quick-more textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:11px;background:var(--surface);color:var(--navy-2);font-size:14px}.quick-plot select{font-weight:800;font-size:15px}.quick-grid small{font-weight:500;line-height:1.35}.quick-items{display:grid;gap:12px}.quick-item{border:1px solid var(--line);border-radius:16px;padding:14px;background:var(--surface-2)}.quick-item-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.quick-item-title>b{font-size:14px;color:var(--navy-2)}.quick-task select{font-size:14px!important;font-weight:750}.quick-progress-row{display:grid;grid-template-columns:180px minmax(0,1fr);gap:12px;margin-top:10px;align-items:end}.percent-input{display:flex;align-items:center;border:1px solid var(--line);border-radius:12px;background:#fff;overflow:hidden}.percent-input input{border:0!important;border-radius:0!important;font-size:24px!important;font-weight:900;padding:8px 10px!important;text-align:center}.percent-input span{padding:0 12px;font-weight:900;color:var(--navy)}.quick-status>span{display:block;font-size:11px;font-weight:800;color:var(--muted);margin-bottom:5px}.quick-status>div{display:flex;flex-wrap:wrap;gap:6px}.quick-status button,.phase-buttons button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 10px;font-size:11px;font-weight:800;color:var(--muted)}.quick-status button.active,.phase-buttons button.active{background:var(--navy);border-color:var(--navy);color:#fff}.quick-alert{margin-top:10px;color:#9b433e!important}.quick-alert input{border-color:#e3b9b5!important;background:#fff7f6!important}.quick-item>label{margin-top:10px}.quick-photo-box{display:grid;gap:9px;margin-top:12px;padding:11px;border-radius:12px;border:1px dashed #c9d2dc;background:#fff}.quick-photo-box>div:first-child b{display:block;font-size:12px}.quick-photo-box>div:first-child span{font-size:10px;color:var(--muted)}.phase-buttons{display:flex;gap:6px;flex-wrap:wrap}.photo-picker{display:grid!important;grid-template-columns:auto 1fr;gap:6px 10px!important;align-items:center;border:1px solid var(--line);border-radius:11px;padding:10px 12px;background:var(--surface-2);color:var(--navy-2)!important;cursor:pointer}.photo-picker input{grid-column:1/-1;padding:0!important;border:0!important;background:transparent!important;font-size:12px!important}.photo-picker>span{font-size:10px;color:var(--muted);font-weight:600}.add-quick-item{width:100%;margin-top:12px}.quick-more summary{cursor:pointer;font-weight:850;color:var(--navy-2)}.more-grid{margin-top:12px}.quick-review{border:2px solid #cbd6e3}.quick-review .quick-step{margin-bottom:10px}.quick-review-list{display:grid;gap:6px;margin-bottom:12px}.quick-review-list>div{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:9px;background:var(--surface-2);font-size:11px}.quick-review-list span{color:var(--muted);white-space:nowrap}.quick-submit{width:100%;min-height:50px;font-size:16px}.quick-review>small{display:block;text-align:center;margin-top:8px;line-height:1.4}
      @media(max-width:760px){.quick-report{margin-bottom:72px}.quick-step{grid-template-columns:34px minmax(0,1fr)}.quick-step>em{grid-column:2;text-align:left}.quick-grid,.quick-progress-row{grid-template-columns:1fr}.quick-item{padding:12px}.quick-status button{flex:1 1 calc(33% - 6px);padding:10px 6px}.quick-review-list>div{align-items:flex-start;flex-direction:column}.quick-review-list span{white-space:normal}.photo-picker{font-size:13px}.more-grid .span-2{grid-column:auto}}
    `}</style>
  </AppShell>
}
