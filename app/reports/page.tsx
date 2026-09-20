'use client'

import Image from 'next/image'
import { useEffect,useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import {getSupabase} from '@/lib/supabase'
import {dateTH,pct} from '@/lib/format'
import type {Project} from '@/lib/types'

export default function ReportsPage(){
  const[rows,setRows]=useState<any[]>([])
  const[projects,setProjects]=useState<Project[]>([])

  useEffect(()=>{
    const load = async () => {
      const s=getSupabase()
      const [r,p] = await Promise.all([
        s.from('daily_reports').select('*,report_items(*),report_photos(*)').order('report_date',{ascending:false}).limit(100),
        s.from('projects').select('*')
      ])
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

  return <AppShell>
    <PageHeader title="Report History" subtitle="Daily Reports + Photo Evidence ล่าสุดจากทุก Site"/>
    <div className="stack">{rows.map(r=><div className="panel report-card" key={r.id}>
      <div className="row between"><div><h2>{projects.find(p=>p.id===r.project_id)?.code||'-'} • {dateTH(r.report_date)}</h2><p>{r.summary||'ไม่มีสรุปเพิ่มเติม'}</p></div><div className="right"><StatusBadge value={r.status}/><b>{pct(r.overall_progress)}</b></div></div>
      <div className="mini-grid"><span>Manpower <b>{r.total_manpower||0}</b></span><span>Work items <b>{r.report_items?.length||0}</b></span><span>Photos <b>{r.report_photos?.length||0}</b></span></div>
      {(r.report_items||[]).slice(0,6).map((x:any)=><div className="subitem" key={x.id}><span>{x.work_item}</span><b>{Math.round((x.actual_progress||0)*100)}%</b></div>)}
      {!!r.report_photos?.length && <div className="photo-grid">{r.report_photos.map((photo:any)=>photo.signed_url && <figure key={photo.id}><Image src={photo.signed_url} alt={photo.caption||'Site photo'} width={640} height={480} sizes="(max-width: 760px) 50vw, 220px"/><figcaption><b>{photo.phase}</b>{photo.caption ? ` • ${photo.caption}` : ''}</figcaption></figure>)}</div>}
    </div>)}</div>
  </AppShell>
}
