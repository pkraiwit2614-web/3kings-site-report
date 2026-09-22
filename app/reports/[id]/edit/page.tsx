'use client'

import Link from 'next/link'
import { FormEvent,useEffect,useRef,useState } from 'react'
import { useParams,useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import { dateTH } from '@/lib/format'
import type { Project,ScheduleTask } from '@/lib/types'

type Item={schedule_task_id:string;work_item:string;work_category:string;actual_progress:number;manpower:number;contractor:string;status:string;blocker:string;next_action:string;target_date:string;remarks:string}
const emptyItem=():Item=>({schedule_task_id:'',work_item:'',work_category:'',actual_progress:0,manpower:0,contractor:'',status:'in_progress',blocker:'',next_action:'',target_date:'',remarks:''})
const statusOptions=[['not_started','ยังไม่เริ่ม'],['in_progress','กำลังดำเนินการ'],['awaiting_inspection','รอตรวจ'],['blocked','ติดปัญหา/อุปสรรค'],['delayed','ล่าช้า'],['completed','เสร็จแล้ว'],['on_hold','พักงาน']]

export default function EditReportPage(){
  const params=useParams<{id:string}>()
  const router=useRouter()
  const reportId=String(params?.id||'')
  const[project,setProject]=useState<Project|null>(null)
  const[tasks,setTasks]=useState<ScheduleTask[]>([])
  const[date,setDate]=useState('')
  const[weather,setWeather]=useState('')
  const[overall,setOverall]=useState(0)
  const[manpower,setManpower]=useState(0)
  const[summary,setSummary]=useState('')
  const[items,setItems]=useState<Item[]>([emptyItem()])
  const[revisionNo,setRevisionNo]=useState(1)
  const[reason,setReason]=useState('')
  const[history,setHistory]=useState<any[]>([])
  const[loading,setLoading]=useState(true)
  const[saving,setSaving]=useState(false)
  const[message,setMessage]=useState('')
  const saveLock=useRef(false)

  useEffect(()=>{
    if(!reportId) return
    let cancelled=false
    const load=async()=>{
      const s=getSupabase()
      const {data:report,error}=await s.from('daily_reports').select('*').eq('id',reportId).single()
      if(error||!report) throw new Error(error?.message||'ไม่พบรายงาน')
      const [p,i,t,h]=await Promise.all([
        s.from('projects').select('*').eq('id',report.project_id).single(),
        s.from('report_items').select('*').eq('daily_report_id',reportId).order('created_at'),
        s.from('v_schedule_tasks').select('*').eq('project_id',report.project_id).order('planned_start'),
        s.from('daily_report_revisions').select('id,revision_no,reason,created_at,edited_by').eq('daily_report_id',reportId).order('revision_no',{ascending:false})
      ])
      if(cancelled) return
      setProject((p.data||null) as Project|null)
      setTasks((t.data||[]) as ScheduleTask[])
      setDate(report.report_date||'')
      setWeather(report.weather||'')
      setOverall(Math.round((Number(report.overall_progress)||0)*100))
      setManpower(Number(report.total_manpower)||0)
      setSummary(report.summary||'')
      setRevisionNo(Number(report.revision_no)||1)
      setHistory(h.data||[])
      setItems((i.data||[]).length?(i.data||[]).map((x:any)=>({
        schedule_task_id:x.schedule_task_id||'',work_item:x.work_item||'',work_category:x.work_category||'',
        actual_progress:Math.round((Number(x.actual_progress)||0)*100),manpower:Number(x.manpower)||0,
        contractor:x.contractor||'',status:x.status||'in_progress',blocker:x.blocker||'',next_action:x.next_action||'',
        target_date:x.target_date||'',remarks:x.remarks||''
      })):[emptyItem()])
      setLoading(false)
    }
    load().catch((e:any)=>{if(!cancelled){setMessage(e?.message||'โหลดรายงานไม่สำเร็จ');setLoading(false)}})
    return()=>{cancelled=true}
  },[reportId])

  const updateItem=(index:number,patch:Partial<Item>)=>setItems(v=>v.map((x,i)=>i===index?{...x,...patch}:x))
  const chooseTask=(index:number,id:string)=>{
    const t=tasks.find(x=>x.id===id)
    updateItem(index,{schedule_task_id:id,work_item:t?.task_name||'',work_category:t?.category||'',actual_progress:Math.round((t?.actual_progress||0)*100),contractor:t?.contractor||'',target_date:t?.target_close||''})
  }

  const save=async(e:FormEvent)=>{
    e.preventDefault()
    if(saveLock.current||saving) return
    saveLock.current=true
    setSaving(true)
    setMessage('')
    try{
      const valid=items.filter(x=>x.work_item.trim())
      if(!valid.length) throw new Error('กรุณามีรายการงานอย่างน้อย 1 งาน')
      const s=getSupabase()
      const {data,error}=await s.rpc('daily_report_apply_revision_v34',{
        p_report_id:reportId,
        p_reason:reason.trim()||'แก้ไขข้อมูลรายงาน',
        p_report_date:date,
        p_weather:weather||null,
        p_overall_progress:Number(overall)/100,
        p_total_manpower:Number(manpower)||0,
        p_summary:summary||null,
        p_items:valid.map(x=>({
          schedule_task_id:x.schedule_task_id||'',work_category:x.work_category||'',work_item:x.work_item,
          actual_progress:Number(x.actual_progress)/100,manpower:Number(x.manpower)||0,contractor:x.contractor||'',status:x.status,
          blocker:x.blocker||'',next_action:x.next_action||'',target_date:x.target_date||'',remarks:x.remarks||''
        }))
      })
      if(error) throw new Error(error.message)
      setRevisionNo(Number(data)||revisionNo+1)
      setMessage(`บันทึก Revision ${Number(data)||revisionNo+1} แล้ว • เก็บข้อมูลเวอร์ชันก่อนหน้าไว้ใน Revision History`)
      window.setTimeout(()=>router.push('/reports'),1000)
    }catch(err:any){
      setMessage(err?.message||'บันทึก Revision ไม่สำเร็จ')
    }finally{
      setSaving(false)
      saveLock.current=false
    }
  }

  return <AppShell>
    <PageHeader title="Edit / Revision Daily Report" subtitle={project?`${project.code} — ${project.name} • Current Rev. ${revisionNo}`:'V3.4 Revision History'} action={<Link href="/reports" className="button">← กลับประวัติรายงาน</Link>}/>
    {loading?<div className="panel">กำลังโหลดรายงาน…</div>:<form onSubmit={save} className="stack-lg">
      <section className="panel">
        <div className="row between"><div><h2>{project?.code||'-'} • {project?.name||'-'}</h2><p className="muted">การบันทึกจะสร้าง Revision ใหม่ โดยไม่เขียนทับประวัติเดิม</p></div><span className="pill">Rev. {revisionNo}</span></div>
        <div className="form-grid">
          <label>วันที่รายงาน<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/><small className="muted">ถ้าแก้วันที่ รูป Original ที่ Archive ไปแล้วจะไม่ถูกเปลี่ยนชื่อย้อนหลัง</small></label>
          <label>สภาพอากาศ<input value={weather} onChange={e=>setWeather(e.target.value)}/></label>
          <label>Progress ภาพรวม (%)<input type="number" min="0" max="100" value={overall} onChange={e=>setOverall(Number(e.target.value))}/></label>
          <label>กำลังคนรวม<input type="number" min="0" value={manpower} onChange={e=>setManpower(Number(e.target.value))}/></label>
          <label className="span-2">สรุปงาน<textarea rows={3} value={summary} onChange={e=>setSummary(e.target.value)}/></label>
          <label className="span-2">เหตุผล Revision<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="เช่น แก้ % หน้างาน / เพิ่มรายละเอียดปัญหา / แก้จำนวนแรงงาน"/></label>
        </div>
      </section>

      <section className="panel">
        <div className="subsection-head"><h3>รายการงาน</h3><button type="button" className="button" onClick={()=>setItems(v=>[...v,emptyItem()])}>+ เพิ่มงาน</button></div>
        {items.map((x,i)=><div className="work-card" key={i}><div className="row between"><b>งาน #{i+1}</b>{items.length>1&&<button type="button" className="link-danger" onClick={()=>setItems(v=>v.filter((_,idx)=>idx!==i))}>ลบ</button>}</div><div className="form-grid">
          <label className="span-2">เลือกจากกำหนดแผนงาน<select value={x.schedule_task_id} onChange={e=>chooseTask(i,e.target.value)}><option value="">-- เลือกงาน หรือกรอกเอง --</option>{tasks.filter(t=>t.source_task_no!=='1').map(t=><option key={t.id} value={t.id}>{t.source_task_no}. {t.task_name} — {t.area||'-'}</option>)}</select></label>
          <label>งาน<input value={x.work_item} onChange={e=>updateItem(i,{work_item:e.target.value})} required/></label>
          <label>หมวดงาน<input value={x.work_category} onChange={e=>updateItem(i,{work_category:e.target.value})}/></label>
          <label>ความคืบหน้าจริง (%)<input type="number" min="0" max="100" value={x.actual_progress} onChange={e=>updateItem(i,{actual_progress:Number(e.target.value)})}/></label>
          <label>สถานะ<select value={x.status} onChange={e=>updateItem(i,{status:e.target.value})}>{statusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>กำลังคน<input type="number" min="0" value={x.manpower} onChange={e=>updateItem(i,{manpower:Number(e.target.value)})}/></label>
          <label>ผู้รับเหมา / ทีมงาน<input value={x.contractor} onChange={e=>updateItem(i,{contractor:e.target.value})}/></label>
          <label>Target<input type="date" value={x.target_date} onChange={e=>updateItem(i,{target_date:e.target.value})}/></label>
          <label className="span-2">ปัญหา / อุปสรรค<input value={x.blocker} onChange={e=>updateItem(i,{blocker:e.target.value})}/></label>
          <label className="span-2">งานถัดไป / วิธีดำเนินการ<input value={x.next_action} onChange={e=>updateItem(i,{next_action:e.target.value})}/></label>
          <label className="span-2">หมายเหตุ<input value={x.remarks} onChange={e=>updateItem(i,{remarks:e.target.value})}/></label>
        </div></div>)}
      </section>

      <section className="panel">
        <h3>Revision History</h3>
        <div className="stack" style={{marginTop:10}}>{history.length?history.map(h=><div className="subitem" key={h.id}><span>Rev. {h.revision_no} • {h.reason||'แก้ไขข้อมูลรายงาน'} • {new Date(h.created_at).toLocaleString('th-TH')}</span><b>เก็บ Snapshot แล้ว</b></div>):<p className="muted">ยังไม่มี Revision ก่อนหน้า — รายงานนี้เป็นเวอร์ชันแรก</p>}</div>
      </section>

      {message&&<div className="notice">{message}</div>}
      <div className="sticky-actions"><button className="primary big" disabled={saving}>{saving?'กำลังบันทึก Revision…':`บันทึกเป็น Rev. ${revisionNo+1}`}</button></div>
    </form>}
  </AppShell>
}
