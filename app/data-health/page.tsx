'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'

function dateTimeTH(value:string|null|undefined){
  if(!value) return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)
}

function dateTH(value:string|null|undefined){
  if(!value) return '-'
  const d=new Date(`${value}T00:00:00+07:00`)
  if(Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).format(d)
}

function ageDays(value:string|null|undefined){
  if(!value) return null
  const t=new Date(value.length<=10?`${value}T00:00:00+07:00`:value).getTime()
  if(Number.isNaN(t)) return null
  return Math.max(0,Math.floor((Date.now()-t)/86400000))
}

function ageHours(value:string|null|undefined){
  if(!value) return null
  const t=new Date(value).getTime()
  if(Number.isNaN(t)) return null
  return Math.max(0,(Date.now()-t)/3600000)
}

type HealthTone='ok'|'warn'|'bad'|'neutral'
function HealthBadge({tone,label}:{tone:HealthTone;label:string}){
  const styles:Record<HealthTone,{background:string;color:string;border:string}>={
    ok:{background:'#eef9f3',color:'#247b55',border:'#b9e3ce'},
    warn:{background:'#fff8e7',color:'#8a6712',border:'#ead394'},
    bad:{background:'#fff1f0',color:'#ad3832',border:'#edbbb7'},
    neutral:{background:'#f2f4f6',color:'#687482',border:'#d9dfe5'},
  }
  return <span style={{...styles[tone],display:'inline-flex',alignItems:'center',borderStyle:'solid',borderWidth:1,borderRadius:999,padding:'4px 8px',fontSize:10,fontWeight:800,whiteSpace:'nowrap'}}>{label}</span>
}

export default function DataHealthPage(){
  const [projects,setProjects]=useState<any[]>([])
  const [tasks,setTasks]=useState<any[]>([])
  const [syncRuns,setSyncRuns]=useState<any[]>([])
  const [photos,setPhotos]=useState<any[]>([])
  const [condo,setCondo]=useState<any[]>([])
  const [reports,setReports]=useState<any[]>([])
  const [tools,setTools]=useState<any[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  useEffect(()=>{
    let alive=true
    const load=async()=>{
      const s=getSupabase()
      const [p,t,sr,ph,c,r,tm]=await Promise.all([
        s.from('projects').select('id,code,name,active,sort_order').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('project_id,source_updated_at,source_file,updated_at'),
        s.from('drive_sync_runs').select('sync_type,project_code,source_file,source_sheet,status,message,created_at').order('created_at',{ascending:false}).limit(200),
        s.from('drive_photo_index').select('project_id,schedule_task_id,match_method,is_active,indexed_at').eq('is_active',true),
        s.from('condo_room_status').select('source_modified_at'),
        s.from('daily_reports').select('project_id,report_date,status,created_at').order('created_at',{ascending:false}).limit(200),
        s.from('tool_machine').select('source_updated_at')
      ])
      if(!alive) return
      const firstError=[p,t,sr,ph,c,r,tm].find(x=>x.error)?.error
      if(firstError) setError(firstError.message)
      setProjects(p.data||[]); setTasks(t.data||[]); setSyncRuns(sr.data||[]); setPhotos(ph.data||[])
      setCondo(c.data||[]); setReports(r.data||[]); setTools(tm.data||[]); setLoading(false)
    }
    load().catch(e=>{if(alive){setError(e?.message||'โหลดข้อมูลไม่สำเร็จ');setLoading(false)}})
    return()=>{alive=false}
  },[])

  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})
  const latestSync=(type:string,projectCode?:string)=>syncRuns.find(x=>x.sync_type===type&&x.status==='success'&&(!projectCode||x.project_code===projectCode))||null

  const scheduleHealth=useMemo(()=>projects.filter(p=>/^AV-P[6-9]$/.test(p.code)).map(p=>{
    const list=tasks.filter(t=>t.project_id===p.id)
    const sourceDates=list.map(t=>t.source_updated_at).filter(Boolean).sort().reverse()
    const sourceDate=sourceDates[0]||null
    const sync=latestSync('schedule',p.code)
    const sourceAge=ageDays(sourceDate)
    const syncAge=ageHours(sync?.created_at)
    let tone:HealthTone='ok', label='พร้อมใช้'
    if(!sourceDate||!sync){tone='bad';label='ข้อมูลไม่ครบ'}
    else if((sourceAge??99)>2){tone='warn';label='Source เก่า'}
    else if((syncAge??99)>2){tone='warn';label='Sync เก่า'}
    return {p,sourceDate,sourceFile:list.find(t=>t.source_updated_at===sourceDate)?.source_file||sync?.source_file||'-',sync,tone,label,sourceAge,syncAge}
  }),[projects,tasks,syncRuns])

  const photoHealth=useMemo(()=>{
    const villaIds=new Set(projects.filter(p=>/^AV-P[6-9]$/.test(p.code)).map(p=>p.id))
    const list=photos.filter(x=>villaIds.has(x.project_id))
    const matched=list.filter(x=>Boolean(x.schedule_task_id)).length
    const manual=list.filter(x=>x.match_method==='manual').length
    const latest=latestSync('photos')
    return {total:list.length,matched,unmatched:list.length-matched,manual,ratio:list.length?matched/list.length:0,latest}
  },[photos,projects,syncRuns])

  const materialsSync=latestSync('materials')
  const toolSource=useMemo(()=>tools.map(x=>x.source_updated_at).filter(Boolean).sort().reverse()[0]||null,[tools])
  const condoLatest=useMemo(()=>condo.map(x=>x.source_modified_at).filter(Boolean).sort().reverse()[0]||null,[condo])
  const reportsToday=reports.filter(x=>x.report_date===today&&x.status==='submitted')
  const reportedProjectIds=new Set(reportsToday.map(x=>x.project_id))
  const villaProjects=projects.filter(p=>/^AV-P[6-9]$/.test(p.code))
  const missingToday=villaProjects.filter(p=>!reportedProjectIds.has(p.id))

  return <AppShell>
    <PageHeader title="Data Health" subtitle="ตรวจความสดและความพร้อมของข้อมูลก่อนใช้ Dashboard / Executive Presentation" action={<Link href="/" className="button">← Dashboard</Link>} />

    <div className="notice small" style={{marginBottom:14}}>
      เกณฑ์ V4 เบื้องต้น: Schedule Source เกิน 2 วันหรือ Last Sync เกิน 2 ชั่วโมง = ต้องตรวจสอบ • เกณฑ์นี้เป็น operational default และปรับได้ตามรอบอัปเดตจริงของหน้างาน
    </div>

    {error&&<div className="notice" style={{marginBottom:14}}>บางชุดข้อมูลโหลดไม่สำเร็จ: {error}</div>}
    {loading?<div className="panel">กำลังตรวจ Data Health…</div>:<div className="stack-lg">
      <section className="panel" style={{padding:0,overflow:'hidden'}}>
        <div className="panel-head" style={{padding:'12px 14px'}}><div><h2>Schedule — Above Villa P6–P9</h2><span className="muted small">แยก Source Modified ออกจาก Last Successful Sync</span></div></div>
        <div className="table-wrap"><table><thead><tr><th>Plot</th><th>Health</th><th>Source Updated</th><th>Last Sync</th><th>Source File</th><th>Action</th></tr></thead><tbody>
          {scheduleHealth.map(x=><tr key={x.p.id}><td><b>{x.p.code}</b><small>{x.p.name}</small></td><td><HealthBadge tone={x.tone} label={x.label}/></td><td>{dateTH(x.sourceDate)}<small>{x.sourceAge===null?'ไม่ทราบอายุข้อมูล':`${x.sourceAge} วัน`}</small></td><td>{dateTimeTH(x.sync?.created_at)}<small>{x.syncAge===null?'ไม่พบ sync':`${x.syncAge.toFixed(1)} ชม.`}</small></td><td>{x.sourceFile}</td><td><Link className="button" href={`/schedule?project=${encodeURIComponent(x.p.id)}`}>เปิด Schedule</Link></td></tr>)}
        </tbody></table></div>
      </section>

      <section className="dashboard-grid two-main">
        <div className="panel"><div className="panel-head"><div><h2>Picture Progress Mapping</h2><span className="muted small">รูป P6–P9 ที่ผูกกับ Schedule Task</span></div><HealthBadge tone={photoHealth.ratio>=0.8?'ok':photoHealth.ratio>=0.5?'warn':'bad'} label={`${Math.round(photoHealth.ratio*100)}% matched`}/></div>
          <div className="resource-kpis"><div><span>Active photos</span><b>{photoHealth.total}</b></div><div><span>Matched</span><b>{photoHealth.matched}</b></div><div><span>Unmatched</span><b>{photoHealth.unmatched}</b></div></div>
          <p className="small muted">Manual/verified-style mapping ปัจจุบัน {photoHealth.manual} รูป • Sync ล่าสุด {dateTimeTH(photoHealth.latest?.created_at)}</p>
          <Link className="button" href="/presentation">ตรวจผลใน Executive Presentation</Link>
        </div>

        <div className="panel"><div className="panel-head"><div><h2>Materials / Tools</h2><span className="muted small">ความสดของ master data จาก Drive</span></div><HealthBadge tone={materialsSync?'ok':'bad'} label={materialsSync?'Sync ทำงาน':'ไม่พบ Sync'}/></div>
          <p><b>Materials sync:</b> {dateTimeTH(materialsSync?.created_at)}</p>
          <p><b>Source file:</b> {materialsSync?.source_file||'-'}</p>
          <p><b>Tool source updated:</b> {dateTH(toolSource)}</p>
          <Link className="button" href="/materials">เปิดวัสดุ / เครื่องมือ</Link>
        </div>
      </section>

      <section className="dashboard-grid two-main">
        <div className="panel"><div className="panel-head"><div><h2>Above Condo Status</h2><span className="muted small">ล่าสุดจาก condo_room_status</span></div><HealthBadge tone={condoLatest?'ok':'bad'} label={condoLatest?'มีข้อมูล':'ไม่พบข้อมูล'}/></div>
          <p><b>Source updated:</b> {dateTimeTH(condoLatest)}</p>
          <p><b>Rows:</b> {condo.length} ห้อง</p>
          <Link className="button" href="/defects">เปิด Defect Report</Link>
        </div>

        <div className="panel"><div className="panel-head"><div><h2>Daily Report วันนี้</h2><span className="muted small">ใช้ตรวจ adoption และไซต์ที่ยังไม่มีรายงาน</span></div><HealthBadge tone={reportsToday.length?'ok':'warn'} label={`${reportsToday.length} submitted`}/></div>
          <p><b>Villa P6–P9 ที่ยังไม่มีรายงานวันนี้:</b> {missingToday.length?missingToday.map(p=>p.code).join(', '):'ครบแล้ว'}</p>
          <Link className="button" href="/reports/new">+ รายงานประจำวัน</Link>
        </div>
      </section>
    </div>}
  </AppShell>
}
