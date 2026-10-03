'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { createLiveLoader, requireSuccessfulReads } from '@/lib/liveLoader'
import { dateTH } from '@/lib/format'
import type { Project, ScheduleTask } from '@/lib/types'

type ReportItem = {
  id:string
  schedule_task_id:string|null
  work_category:string|null
  work_item:string
  actual_progress:number|null
  manpower:number|null
  contractor:string|null
  status:string
  blocker:string|null
  next_action:string|null
  target_date:string|null
  remarks:string|null
  created_at:string
}

type DailyReport = {
  id:string
  project_id:string
  report_date:string
  weather:string|null
  overall_progress:number|null
  total_manpower:number|null
  summary:string|null
  status:string
  created_at:string
  updated_at:string
  report_items:ReportItem[]
}

type ProcurementRow = {
  id:string
  project_id:string|null
  vendor:string|null
  item_name:string|null
  current_status:string|null
  procurement_status:string|null
  payment_status:string|null
  expected_delivery_text:string|null
  expected_delivery:string|null
  condition_note:string|null
  pr_no:string|null
  po_no:string|null
  source_updated_at:string|null
}

const materialBlockerPattern=/(รอวัสดุ|วัสดุ|รอของ|ของไม่เข้า|ของยังไม่เข้า|สั่งของ|จัดซื้อ|สินค้า|อุปกรณ์|material|procurement|delivery|supplier)/i
const closedProcurementPattern=/(ส่งมอบเรียบร้อย|รับสินค้าเรียบร้อย|รับสินค้าแล้ว|ติดตั้งเรียบร้อย|ส่งครบ|ปิดงาน|ปิดติดตาม|งานเสร็จ|เสร็จสมบูรณ์|completed|done|closed)/i

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{
    timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).format(d)+' น.'
}

function pctText(value:number|null|undefined){
  if(value===null||value===undefined||Number.isNaN(Number(value)))return '-'
  return Math.round(Number(value)*100)+'%'
}

function normalizeText(value:unknown){
  return String(value??'')
    .toLowerCase()
    .replace(/[\n\r\t]+/g,' ')
    .replace(/[.,/#!$%^&*;:{}=_~()\[\]<>?'"|+-]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}

function tokens(value:unknown){
  return new Set(normalizeText(value).split(' ').filter(x=>x.length>=3))
}

function textScore(a:unknown,b:unknown){
  const aa=normalizeText(a), bb=normalizeText(b)
  if(!aa||!bb)return 0
  if(aa===bb)return 1
  if(aa.length>=5&&bb.length>=5&&(aa.includes(bb)||bb.includes(aa)))return .82
  const at=tokens(aa), bt=tokens(bb)
  if(!at.size||!bt.size)return 0
  let hit=0
  at.forEach(x=>{if(bt.has(x))hit++})
  return hit/Math.max(at.size,bt.size)
}

function isOpenProcurement(row:ProcurementRow){
  const status=[row.current_status,row.procurement_status,row.payment_status].filter(Boolean).join(' ')
  return !closedProcurementPattern.test(status)
}

function statusLabel(value:string|null|undefined){
  const map:Record<string,string>={
    not_started:'ยังไม่เริ่ม',
    in_progress:'กำลังดำเนินการ',
    awaiting_inspection:'รอตรวจ',
    blocked:'ติดปัญหา',
    delayed:'ล่าช้า',
    completed:'เสร็จแล้ว',
    on_hold:'พักงาน',
    submitted:'ส่งแล้ว',
    reviewed:'ตรวจแล้ว'
  }
  return map[String(value||'')]||String(value||'-')
}

export default function SiteOperationsPage(){
  const [loadError,setLoadError]=useState(false)
  const [loading,setLoading]=useState(true)
  const [reports,setReports]=useState<DailyReport[]>([])
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<ScheduleTask[]>([])
  const [procurement,setProcurement]=useState<ProcurementRow[]>([])
  const [procurementLinks,setProcurementLinks]=useState<any[]>([])
  const [selectedDate,setSelectedDate]=useState('')
  const [selectedProject,setSelectedProject]=useState('')
  const [q,setQ]=useState('')
  const [latestUpdate,setLatestUpdate]=useState<string|null>(null)

  useEffect(()=>{
    let alive=true
    let refreshTimer:number|null=null
    const s=getSupabase()
    const loader=createLiveLoader({
      load:async(signal)=>{
        const [r,p,t,pr,links]=await Promise.all([
          s.from('daily_reports')
            .select('id,project_id,report_date,weather,overall_progress,total_manpower,summary,status,created_at,updated_at,report_items(id,schedule_task_id,work_category,work_item,actual_progress,manpower,contractor,status,blocker,next_action,target_date,remarks,created_at)')
            .order('report_date',{ascending:false})
            .order('updated_at',{ascending:false})
            .limit(500)
            .abortSignal(signal),
          s.from('projects').select('id,code,name,active,sort_order').eq('active',true).order('sort_order').abortSignal(signal),
          s.from('v_schedule_tasks')
            .select('id,project_id,source_task_no,task_name,category,area,actual_progress,current_plan_progress,current_variance,delay_days,site_status,blocker,next_action,target_close,planned_start,planned_end,contractor')
            .abortSignal(signal),
          s.from('procurement_items')
            .select('id,project_id,vendor,item_name,current_status,procurement_status,payment_status,expected_delivery_text,expected_delivery,condition_note,pr_no,po_no,source_updated_at')
            .abortSignal(signal),
          s.from('procurement_item_projects').select('procurement_item_id,project_id').abortSignal(signal)
        ])
        requireSuccessfulReads([r,p,t,pr,links])
        if(!alive||signal.aborted)return
        const nextReports=(r.data||[]) as DailyReport[]
        setLoadError(false)
        setReports(nextReports)
        setProjects((p.data||[]) as Project[])
        setTasks((t.data||[]) as ScheduleTask[])
        setProcurement((pr.data||[]) as ProcurementRow[])
        setProcurementLinks(links.data||[])
        const newest=nextReports.map(x=>x.updated_at||x.created_at).filter(Boolean).sort().at(-1)||null
        setLatestUpdate(newest)
        setSelectedDate(v=>v||(nextReports[0]?.report_date||''))
      },
      onError:()=>{if(alive)setLoadError(true)},
      onSettled:()=>{if(alive)setLoading(false)}
    })

    const queueLoad=()=>{
      if(refreshTimer)window.clearTimeout(refreshTimer)
      refreshTimer=window.setTimeout(()=>{void loader.refresh().catch(()=>{})},350)
    }

    void loader.refresh().catch(()=>{})
    const channel=s.channel('site-operations-live-refresh')
      .on('postgres_changes',{event:'*',schema:'public',table:'daily_reports'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'report_items'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'schedule_tasks'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'procurement_items'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'procurement_item_projects'},queueLoad)
      .subscribe()

    const onFocus=()=>queueLoad()
    const onVisible=()=>{if(document.visibilityState==='visible')queueLoad()}
    window.addEventListener('focus',onFocus)
    document.addEventListener('visibilitychange',onVisible)
    return()=>{
      alive=false
      loader.dispose()
      if(refreshTimer)window.clearTimeout(refreshTimer)
      window.removeEventListener('focus',onFocus)
      document.removeEventListener('visibilitychange',onVisible)
      void s.removeChannel(channel)
    }
  },[])

  const projectById=useMemo(()=>new Map(projects.map(x=>[x.id,x])),[projects])
  const taskById=useMemo(()=>new Map(tasks.map(x=>[x.id,x])),[tasks])
  const tasksByProject=useMemo(()=>{
    const map=new Map<string,ScheduleTask[]>()
    for(const task of tasks){
      const rows=map.get(task.project_id)||[]
      rows.push(task)
      map.set(task.project_id,rows)
    }
    return map
  },[tasks])

  const procurementProjectIds=useMemo(()=>{
    const map=new Map<string,string[]>()
    for(const link of procurementLinks){
      const itemId=String(link.procurement_item_id||'')
      const projectId=String(link.project_id||'')
      if(!itemId||!projectId)continue
      const ids=map.get(itemId)||[]
      if(!ids.includes(projectId))ids.push(projectId)
      map.set(itemId,ids)
    }
    for(const item of procurement){
      if(!item.project_id)continue
      const ids=map.get(item.id)||[]
      if(!ids.includes(item.project_id))ids.push(item.project_id)
      map.set(item.id,ids)
    }
    return map
  },[procurement,procurementLinks])

  const procurementByProject=useMemo(()=>{
    const map=new Map<string,ProcurementRow[]>()
    for(const item of procurement){
      const ids=procurementProjectIds.get(item.id)||[]
      for(const projectId of ids){
        const rows=map.get(projectId)||[]
        rows.push(item)
        map.set(projectId,rows)
      }
    }
    return map
  },[procurement,procurementProjectIds])

  const availableDates=useMemo(
    ()=>Array.from(new Set(reports.map(x=>x.report_date))).sort((a,b)=>b.localeCompare(a)),
    [reports]
  )

  const latestPerProjectDate=useMemo(()=>{
    const map=new Map<string,DailyReport>()
    for(const report of reports){
      const key=report.project_id+'|'+report.report_date
      const current=map.get(key)
      if(!current||String(report.updated_at||report.created_at)>String(current.updated_at||current.created_at)){
        map.set(key,report)
      }
    }
    return Array.from(map.values())
  },[reports])

  const filteredReports=useMemo(()=>{
    const needle=normalizeText(q)
    return latestPerProjectDate
      .filter(report=>{
        if(selectedDate&&report.report_date!==selectedDate)return false
        if(selectedProject&&report.project_id!==selectedProject)return false
        if(!needle)return true
        const project=projectById.get(report.project_id)
        const hay=normalizeText([
          project?.code,project?.name,report.summary,report.weather,
          ...(report.report_items||[]).flatMap(x=>[x.work_item,x.contractor,x.blocker,x.next_action])
        ].join(' '))
        return hay.includes(needle)
      })
      .sort((a,b)=>b.report_date.localeCompare(a.report_date)||(projectById.get(a.project_id)?.sort_order??999)-(projectById.get(b.project_id)?.sort_order??999))
  },[latestPerProjectDate,selectedDate,selectedProject,q,projectById])

  const findScheduleCandidate=(projectId:string,workItem:string)=>{
    let best:ScheduleTask|null=null
    let bestScore=0
    for(const task of tasksByProject.get(projectId)||[]){
      if(task.source_task_no==='1')continue
      const score=textScore(workItem,task.task_name)
      if(score>bestScore){best=task;bestScore=score}
    }
    return bestScore>=.7?{task:best,score:bestScore}:null
  }

  const relatedProcurement=(report:DailyReport,item:ReportItem)=>{
    const rows=(procurementByProject.get(report.project_id)||[]).filter(isOpenProcurement)
    const signalText=[item.work_item,item.blocker,item.next_action].filter(Boolean).join(' ')
    const materialSignal=materialBlockerPattern.test(signalText)
    const ranked=rows
      .map(row=>({row,score:textScore(signalText,[row.item_name,row.condition_note,row.vendor].filter(Boolean).join(' '))}))
      .filter(x=>materialSignal?true:x.score>=.45)
      .sort((a,b)=>b.score-a.score)
    return {materialSignal,rows:ranked.slice(0,3).map(x=>x.row)}
  }

  const flatItems=useMemo(
    ()=>filteredReports.flatMap(report=>(report.report_items||[]).map(item=>({report,item}))),
    [filteredReports]
  )

  const linkedCount=flatItems.filter(({item})=>item.schedule_task_id&&taskById.has(item.schedule_task_id)).length
  const procurementFlagCount=flatItems.filter(({report,item})=>relatedProcurement(report,item).materialSignal).length
  const progressVarianceCount=flatItems.filter(({item})=>{
    if(!item.schedule_task_id)return false
    const task=taskById.get(item.schedule_task_id)
    if(!task||item.actual_progress===null||item.actual_progress===undefined||task.actual_progress===null||task.actual_progress===undefined)return false
    return Math.abs(Number(item.actual_progress)-Number(task.actual_progress))>=.1
  }).length
  const labourMismatchCount=filteredReports.filter(report=>{
    const itemTotal=(report.report_items||[]).reduce((sum,x)=>sum+Number(x.manpower||0),0)
    const reportTotal=Number(report.total_manpower||0)
    return itemTotal>0&&reportTotal>0&&itemTotal!==reportTotal
  }).length
  const activeProjects=new Set(filteredReports.map(x=>x.project_id)).size
  const manpowerTotal=filteredReports.reduce((sum,x)=>sum+Number(x.total_manpower||0),0)

  return <AppShell>
    {loadError&&<div className="panel" role="alert" style={{marginBottom:10}}>
      โหลดข้อมูล Site Operations ไม่สำเร็จบางส่วน ข้อมูลที่เห็นอาจเป็น snapshot เดิม
      <button type="button" className="button" style={{marginLeft:8}} onClick={()=>window.dispatchEvent(new Event('focus'))}>ลองใหม่</button>
    </div>}

    <PageHeader
      title="Site Operations"
      subtitle="Daily Report เป็นหลักฐานหน้างานแบบ Read-only • เช็คต่อกับ Schedule, Procurement, Progress และ Labour โดยไม่เขียนทับ Source of Truth"
      action={<div className="siteops-header-actions">
        <span><small>ข้อมูล Daily Report ล่าสุด</small><b>{dateTimeTH(latestUpdate)}</b></span>
        <Link href="/schedule" className="button">เปิด Schedule</Link>
      </div>}
    />

    <section className="panel siteops-filter">
      <label>วันที่
        <select value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}>
          <option value="">ทุกวันที่</option>
          {availableDates.map(d=><option key={d} value={d}>{dateTH(d)}</option>)}
        </select>
      </label>
      <label>Site / Plot
        <select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}>
          <option value="">ทุกหน้างาน</option>
          {projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
      </label>
      <label className="siteops-search">ค้นหา
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="งาน / ผู้รับเหมา / blocker / next action"/>
      </label>
      {(selectedDate||selectedProject||q)&&<button type="button" className="button" onClick={()=>{setSelectedDate('');setSelectedProject('');setQ('')}}>ล้าง Filter</button>}
    </section>

    <section className="siteops-kpis" aria-label="Site Operations summary">
      <div><span>รายงาน</span><b>{filteredReports.length}</b><small>project-day ล่าสุด</small></div>
      <div><span>หน้างาน Active</span><b>{activeProjects}</b><small>ตาม Filter ปัจจุบัน</small></div>
      <div><span>กำลังคนรายงาน</span><b>{manpowerTotal}</b><small>คน • จาก Daily Report</small></div>
      <div><span>รายการงาน</span><b>{flatItems.length}</b><small>รายการที่บันทึก</small></div>
    </section>

    <section className="siteops-cross-grid" aria-label="Daily Report cross checks">
      <article className="panel siteops-cross-card">
        <div className="siteops-cross-head"><span>S</span><div><b>Daily Report × Schedule</b><small>เชื่อมเฉพาะ Task ID ที่ยืนยันแล้ว</small></div></div>
        <strong>{linkedCount} / {flatItems.length}</strong>
        <p>รายการผูก Schedule โดยตรง • รายการที่ชื่อใกล้เคียงจะแสดงเป็น “แนะนำให้ตรวจ” แต่ไม่ถือว่าเชื่อมแล้ว</p>
        <Link href="/schedule">ตรวจ Schedule →</Link>
      </article>

      <article className="panel siteops-cross-card">
        <div className="siteops-cross-head"><span>P</span><div><b>Daily Report × Procurement</b><small>จับสัญญาณรอวัสดุ/รอของจากรายงาน</small></div></div>
        <strong>{procurementFlagCount}</strong>
        <p>รายการงานที่มีข้อความเข้าข่าย Material / Procurement blocker และจะแสดงรายการจัดซื้อเปิดของ Plot เดียวกันเพื่อไล่ตามต่อ</p>
        <Link href="/procurement">เปิด Procurement →</Link>
      </article>

      <article className="panel siteops-cross-card">
        <div className="siteops-cross-head"><span>%</span><div><b>Daily Report × Progress</b><small>Evidence เท่านั้น ไม่เขียนทับ Schedule %</small></div></div>
        <strong>{progressVarianceCount}</strong>
        <p>รายการที่ % ใน Daily Report ต่างจาก Schedule ล่าสุดตั้งแต่ 10 จุดเปอร์เซ็นต์ขึ้นไป เพื่อให้ตรวจหลักฐานก่อนยืนยัน Actual</p>
        <Link href="/schedule">ตรวจ Plan vs Actual →</Link>
      </article>

      <article className="panel siteops-cross-card">
        <div className="siteops-cross-head"><span>L</span><div><b>Daily Report × Labour</b><small>ตรวจยอดคนในรายงานก่อนเชื่อม Labour Cost</small></div></div>
        <strong>{labourMismatchCount}</strong>
        <p>รายงานที่ยอดกำลังคนรวมต่างจากผลรวมกำลังคนระดับรายการงาน • Labour Cost database ยังไม่เชื่อมเข้าหน้านี้ จึงยังไม่สรุปค่าแรง</p>
        <span className="muted small">สถานะ: Read-only verification</span>
      </article>
    </section>

    <div className="siteops-source-note">
      <b>หลักการข้อมูล:</b> Daily Report ใช้เป็นหลักฐานกิจกรรมหน้างาน • Schedule/Progress ยังคงใช้ข้อมูลแผนและ Actual ที่ยืนยันแล้ว • Procurement ใช้รายการจัดซื้อจริงของ Plot • Labour Cost จะแยกเชื่อมภายหลัง
    </div>

    {loading?<div className="panel">กำลังโหลด Site Operations…</div>:
    filteredReports.length===0?<div className="panel siteops-empty">
      <b>ยังไม่มี Daily Report ตาม Filter นี้</b>
      <span>หลังยกเลิกการกรอกผ่าน Web App ข้อมูลใหม่ต้องถูก Sync จาก Google Form / Daily Site Report เข้าชุดข้อมูล Site Operations ก่อนจึงจะแสดงที่นี่</span>
    </div>:
    <div className="siteops-report-stack">
      {filteredReports.map(report=>{
        const project=projectById.get(report.project_id)
        const itemManpower=(report.report_items||[]).reduce((sum,x)=>sum+Number(x.manpower||0),0)
        const labourMismatch=itemManpower>0&&Number(report.total_manpower||0)>0&&itemManpower!==Number(report.total_manpower||0)
        return <section className="panel siteops-report" key={report.id}>
          <header className="siteops-report-head">
            <div>
              <div className="siteops-report-title"><b>{project?.code||'-'}</b><span>{project?.name||''}</span></div>
              <small>{dateTH(report.report_date)}{report.weather?' • '+report.weather:''} • Daily Report Evidence</small>
            </div>
            <div className="siteops-report-meta">
              <StatusBadge value={report.status}/>
              <span>กำลังคน <b>{Number(report.total_manpower||0)}</b> คน</span>
              <span>งาน <b>{report.report_items?.length||0}</b> รายการ</span>
            </div>
          </header>

          {report.summary&&<div className="siteops-summary"><b>สรุปหน้างาน</b><span>{report.summary}</span></div>}

          <div className="siteops-labour-line">
            <span>Labour check:</span>
            {itemManpower>0
              ? <b className={labourMismatch?'warn':''}>รายงานรวม {Number(report.total_manpower||0)} คน • รวมระดับงาน {itemManpower} คน {labourMismatch?'• ต้องตรวจ':'• ตรงกัน'}</b>
              : <b>รายงานรวม {Number(report.total_manpower||0)} คน • ยังไม่มีจำนวนคนระดับรายการงานสำหรับเทียบ</b>}
          </div>

          <div className="siteops-items">
            {(report.report_items||[]).map((item,index)=>{
              const linkedTask=item.schedule_task_id?taskById.get(item.schedule_task_id)||null:null
              const candidate=!linkedTask?findScheduleCandidate(report.project_id,item.work_item):null
              const procurementCheck=relatedProcurement(report,item)
              const reportProgress=item.actual_progress
              const scheduleProgress=linkedTask?.actual_progress
              const hasProgressPair=reportProgress!==null&&reportProgress!==undefined&&scheduleProgress!==null&&scheduleProgress!==undefined
              const delta=hasProgressPair?Math.round((Number(reportProgress)-Number(scheduleProgress))*100):null
              const varianceAlert=delta!==null&&Math.abs(delta)>=10

              return <article className="siteops-item" key={item.id}>
                <div className="siteops-item-main">
                  <div className="siteops-index">{index+1}</div>
                  <div>
                    <b>{item.work_item}</b>
                    <small>{[item.work_category,item.contractor].filter(Boolean).join(' • ')||'ยังไม่ระบุหมวด/ผู้รับเหมา'}</small>
                  </div>
                  <StatusBadge value={item.status}/>
                </div>

                <div className="siteops-item-grid">
                  <div>
                    <span className="siteops-label">Schedule</span>
                    {linkedTask?<><b>✓ Linked</b><small>{linkedTask.source_task_no?linkedTask.source_task_no+'. ':''}{linkedTask.task_name}</small><small>{linkedTask.area||''}</small></>:
                    candidate?.task?<><b className="warn">แนะนำให้ตรวจ</b><small>ชื่อใกล้เคียง: {candidate.task.task_name}</small><small>ยังไม่ถือว่าเชื่อม Task</small></>:
                    <><b className="muted">ยังไม่ผูก</b><small>ต้อง Mapping กับ Schedule ก่อนใช้เทียบ Actual</small></>}
                  </div>

                  <div>
                    <span className="siteops-label">Procurement</span>
                    {procurementCheck.materialSignal
                      ? procurementCheck.rows.length
                        ? <><b className="warn">พบ Material blocker</b>{procurementCheck.rows.slice(0,2).map(row=><small key={row.id}>{row.item_name||'-'} • {row.current_status||row.procurement_status||'ต้องติดตาม'}{row.expected_delivery_text?' • '+row.expected_delivery_text:''}</small>)}</>
                        : <><b className="warn">พบ Material blocker</b><small>แต่ยังไม่พบรายการจัดซื้อเปิดที่ผูกกับ Plot นี้</small></>
                      : procurementCheck.rows.length
                        ? <><b>มีรายการที่อาจเกี่ยวข้อง</b>{procurementCheck.rows.slice(0,2).map(row=><small key={row.id}>{row.item_name||'-'} • {row.current_status||row.procurement_status||'-'}</small>)}</>
                        : <><b className="muted">ไม่พบสัญญาณ</b><small>ไม่มี blocker จัดซื้อจากข้อความใน Daily Report</small></>}
                  </div>

                  <div>
                    <span className="siteops-label">Progress evidence</span>
                    {linkedTask&&hasProgressPair?<>
                      <b className={varianceAlert?'warn':''}>Report {pctText(reportProgress)} • Schedule {pctText(scheduleProgress)}</b>
                      <small>{delta===0?'ตัวเลขตรงกัน':delta!==null?'Δ '+(delta>0?'+':'')+delta+' จุดเปอร์เซ็นต์':'-'}</small>
                      <small>Evidence only — ไม่อัปเดต Schedule อัตโนมัติ</small>
                    </>:<>
                      <b className="muted">ยังเทียบไม่ได้</b>
                      <small>{linkedTask?'Daily Report ไม่มี % สำหรับรายการนี้':'ยังไม่มี Schedule link ที่ยืนยันแล้ว'}</small>
                    </>}
                  </div>

                  <div>
                    <span className="siteops-label">Labour / Next action</span>
                    <b>{Number(item.manpower||0)>0?Number(item.manpower||0)+' คน':'ไม่ระบุคนระดับงาน'}</b>
                    {item.blocker&&<small className="warn">Blocker: {item.blocker}</small>}
                    {item.next_action&&<small>Next: {item.next_action}</small>}
                    {item.target_date&&<small>Target: {dateTH(item.target_date)}</small>}
                  </div>
                </div>
              </article>
            })}
          </div>
        </section>
      })}
    </div>}

    <style jsx>{`
      .siteops-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      .siteops-header-actions>span{display:flex;flex-direction:column;align-items:flex-end;line-height:1.25}
      .siteops-header-actions small{font-size:10px;color:var(--muted)}
      .siteops-header-actions b{font-size:11px}
      .siteops-filter{display:grid;grid-template-columns:180px minmax(210px,270px) minmax(260px,1fr) auto;gap:8px;align-items:end;padding:10px;margin-bottom:10px;position:sticky;top:0;z-index:16}
      .siteops-filter label{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted)}
      .siteops-filter select,.siteops-filter input{min-height:36px;border:1px solid var(--line);border-radius:9px;background:#fff;padding:7px 9px;color:var(--text);font:inherit;font-size:12px}
      .siteops-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}
      .siteops-kpis>div{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;box-shadow:0 4px 14px rgba(23,42,67,.04)}
      .siteops-kpis span{display:block;font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
      .siteops-kpis b{display:block;margin:5px 0 1px;font-size:23px;color:var(--navy)}
      .siteops-kpis small{font-size:10px;color:var(--muted)}
      .siteops-cross-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}
      .siteops-cross-card{padding:12px;min-height:178px;display:flex;flex-direction:column}
      .siteops-cross-head{display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px;align-items:center}
      .siteops-cross-head>span{width:30px;height:30px;border-radius:9px;background:#172a43;color:#f2cc79;display:grid;place-items:center;font-size:11px;font-weight:900}
      .siteops-cross-head b{display:block;font-size:11px}
      .siteops-cross-head small{display:block;font-size:9.5px;color:var(--muted);margin-top:2px}
      .siteops-cross-card>strong{font-size:28px;color:var(--navy);margin:12px 0 4px}
      .siteops-cross-card>p{font-size:10.5px;line-height:1.5;color:var(--muted);margin:0 0 8px}
      .siteops-cross-card>a{margin-top:auto;font-size:10.5px;font-weight:800}
      .siteops-source-note{padding:8px 10px;margin:0 0 10px;border-radius:10px;background:#f5f7fa;border:1px solid var(--line);font-size:10.5px;line-height:1.5;color:var(--muted)}
      .siteops-source-note b{color:var(--text)}
      .siteops-report-stack{display:grid;gap:10px}
      .siteops-report{padding:0;overflow:hidden}
      .siteops-report-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;background:linear-gradient(135deg,#172a43,#213d5e);color:#fff}
      .siteops-report-title{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
      .siteops-report-title b{font-size:16px}
      .siteops-report-title span{font-size:11px;color:#c7d2df}
      .siteops-report-head small{display:block;margin-top:3px;color:#c7d2df;font-size:9.5px}
      .siteops-report-meta{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .siteops-report-meta>span{padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);font-size:9.5px;color:#dfe7ef}
      .siteops-report-meta>span b{color:#fff}
      .siteops-summary{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);font-size:10.5px;line-height:1.5}
      .siteops-summary b{color:var(--navy)}
      .siteops-labour-line{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:8px 14px;background:#fafbfc;border-bottom:1px solid var(--line);font-size:10px}
      .siteops-labour-line>span{color:var(--muted);font-weight:800}
      .siteops-items{display:grid}
      .siteops-item{padding:11px 14px;border-bottom:1px solid var(--line)}
      .siteops-item:last-child{border-bottom:0}
      .siteops-item-main{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:8px;align-items:center;margin-bottom:9px}
      .siteops-index{width:24px;height:24px;border-radius:8px;background:#eef2f6;color:var(--navy);display:grid;place-items:center;font-size:10px;font-weight:900}
      .siteops-item-main b{display:block;font-size:11.5px;line-height:1.35}
      .siteops-item-main small{display:block;margin-top:2px;color:var(--muted);font-size:9.5px}
      .siteops-item-grid{display:grid;grid-template-columns:1.05fr 1.15fr 1fr 1fr;gap:7px;margin-left:34px}
      .siteops-item-grid>div{min-width:0;padding:8px;border:1px solid var(--line);border-radius:10px;background:#fbfcfd}
      .siteops-item-grid b{display:block;font-size:10.5px;line-height:1.35;color:var(--text)}
      .siteops-item-grid small{display:block;font-size:9.5px;line-height:1.4;color:var(--muted);margin-top:3px;overflow-wrap:anywhere}
      .siteops-label{display:block;margin-bottom:4px;font-size:8.5px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#718096}
      .warn{color:#9b5f00!important}
      .siteops-empty{display:grid;gap:5px;text-align:center;padding:28px}
      .siteops-empty span{font-size:11px;color:var(--muted);line-height:1.5}
      @media(max-width:1100px){
        .siteops-cross-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .siteops-item-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(max-width:760px){
        .siteops-header-actions{justify-content:flex-start}
        .siteops-header-actions>span{align-items:flex-start}
        .siteops-filter{position:static;grid-template-columns:1fr 1fr}
        .siteops-search{grid-column:1/-1}
        .siteops-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
        .siteops-cross-grid{grid-template-columns:1fr}
        .siteops-report-head{align-items:flex-start;flex-direction:column}
        .siteops-report-meta{justify-content:flex-start}
        .siteops-summary{grid-template-columns:1fr}
        .siteops-item-grid{grid-template-columns:1fr;margin-left:0}
      }
      @media print{
        .siteops-filter,.siteops-header-actions .button{display:none!important}
        .siteops-cross-card,.siteops-report{break-inside:avoid}
      }
    `}</style>
  </AppShell>
}
