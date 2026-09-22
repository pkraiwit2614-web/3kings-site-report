'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect,useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import {getSupabase} from '@/lib/supabase'
import {dateTH,pct} from '@/lib/format'
import type {Project} from '@/lib/types'

const phaseLabel:Record<string,string>={before:'ก่อนทำ',during:'ระหว่างทำ',after:'หลังทำ',other:'อื่น ๆ'}
const archiveLabel:Record<string,string>={pending:'รอ Archive',processing:'กำลัง Archive',archived:'Archive แล้ว',failed:'Archive ไม่สำเร็จ',skipped:'ข้าม Archive'}

export default function ReportsPage(){
  const[rows,setRows]=useState<any[]>([])
  const[projects,setProjects]=useState<Project[]>([])
  const[userId,setUserId]=useState('')
  const[retrying,setRetrying]=useState<Record<string,boolean>>({})
  const[retryMessage,setRetryMessage]=useState('')

  useEffect(()=>{
    const load = async () => {
      const s=getSupabase()
      const [{data:{user}},r,p] = await Promise.all([
        s.auth.getUser(),
        s.from('daily_reports').select('*,report_items(*),report_photos(*)').order('report_date',{ascending:false}).order('created_at',{ascending:false}).limit(100),
        s.from('projects').select('*')
      ])
      setUserId(user?.id||'')
      const reports = await Promise.all((r.data||[]).map(async (report:any) => {
        const photos = await Promise.all((report.report_photos||[]).map(async (photo:any) => {
          const { data } = await s.storage.from('site-photos').createSignedUrl(photo.storage_path, 3600)
          return { ...photo, signed_url: data?.signedUrl || null }
        }))
        return { ...report, report_photos: photos }
      }))
      setRows(reports)
      setProjects((p.data||[]) as Project[])
    }
    load()
  },[])

  const retryPhoto=async(photo:any)=>{
    if(retrying[photo.id]) return
    setRetrying(v=>({...v,[photo.id]:true}))
    setRetryMessage('')
    try{
      const s=getSupabase()
      const {data:{session}}=await s.auth.getSession()
      if(!session?.access_token) throw new Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่')
      const response=await fetch('/api/archive/photo/retry',{
        method:'POST',
        headers:{'content-type':'application/json','authorization':`Bearer ${session.access_token}`},
        body:JSON.stringify({photo_id:photo.id})
      })
      const result=await response.json().catch(()=>({}))
      if(!response.ok) throw new Error(result?.error||'Retry ไม่สำเร็จ')
      setRows(prev=>prev.map(r=>({...r,report_photos:(r.report_photos||[]).map((p:any)=>p.id===photo.id?{...p,archive_status:result.status||'processing',archive_error:null,archive_retry_count:result.retry_count??p.archive_retry_count}:p)})))
      setRetryMessage('ส่งรูปเข้า Archive ใหม่แล้ว ระบบจะทำงานต่อในพื้นหลัง')
    }catch(err:any){
      setRetryMessage(err?.message||'Retry ไม่สำเร็จ')
    }finally{
      setRetrying(v=>({...v,[photo.id]:false}))
    }
  }

  return <AppShell>
    <PageHeader title="Report History" subtitle="V3.4 • ประวัติรายงาน • Edit/Revision • Photo Archive Retry"/>
    {retryMessage&&<div className="notice" style={{marginBottom:12}}>{retryMessage}</div>}
    <div className="stack">{rows.map(r=><div className="panel report-card" key={r.id}>
      <div className="row between"><div><h2>{projects.find(p=>p.id===r.project_id)?.code||'-'} • {dateTH(r.report_date)}</h2><p>{r.summary||'ไม่มีสรุปเพิ่มเติม'}</p></div><div className="right"><StatusBadge value={r.status}/><b>Progress {pct(r.overall_progress)}</b><small className="muted">Rev. {r.revision_no||1}</small><Link href={`/reports/${r.id}/edit`} className="button" style={{fontSize:11,padding:'7px 10px'}}>แก้ไข / Revision</Link></div></div>
      <div className="mini-grid"><span>กำลังคน <b>{r.total_manpower||0} คน</b></span><span>รายการงาน <b>{r.report_items?.length||0} งาน</b></span><span>รูปประกอบ <b>{r.report_photos?.length||0} รูป</b></span></div>
      {(r.report_items||[]).slice(0,6).map((x:any)=><div className="subitem" key={x.id}><span>{x.work_item}</span><b>{Math.round((x.actual_progress||0)*100)}%</b></div>)}
      {!!r.report_photos?.length && <div className="photo-grid">{r.report_photos.map((photo:any)=>photo.signed_url && <figure key={photo.id} style={{position:'relative'}}><Image src={photo.signed_url} alt={photo.caption||'รูปหน้างาน'} width={640} height={480} sizes="(max-width: 760px) 50vw, 220px"/><figcaption><b>{phaseLabel[photo.phase]||photo.phase||'รูปหน้างาน'}</b>{photo.caption ? ` • ${photo.caption}` : ''}<small style={{display:'block',marginTop:4,color:photo.archive_status==='failed'?'var(--red)':'var(--muted)'}}>{archiveLabel[photo.archive_status]||photo.archive_status||'-'}{photo.archive_retry_count?` • Retry ${photo.archive_retry_count} ครั้ง`:''}</small>{photo.archive_error&&photo.archive_status==='failed'&&<small style={{display:'block',marginTop:3,color:'var(--red)'}}>{photo.archive_error}</small>}<span style={{display:'flex',gap:6,marginTop:6,flexWrap:'wrap'}}>{photo.archive_drive_url&&<a href={photo.archive_drive_url} target="_blank" rel="noreferrer" className="button" style={{fontSize:10,padding:'5px 8px'}}>เปิด Original ใน Drive ↗</a>}{photo.archive_status==='failed'&&photo.uploaded_by===userId&&<button type="button" className="button" disabled={retrying[photo.id]} onClick={()=>retryPhoto(photo)} style={{fontSize:10,padding:'5px 8px'}}>{retrying[photo.id]?'กำลัง Retry…':'Retry Archive'}</button>}</span></figcaption></figure>)}</div>}
    </div>)}</div>
  </AppShell>
}
