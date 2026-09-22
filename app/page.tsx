'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { pct, dateTH } from '@/lib/format'
import type { Project, ScheduleTask } from '@/lib/types'

type FollowupView = 'critical' | 'delayed' | 'blockers'
type SiteStatusFilter = 'all' | 'ontrack' | 'atrisk' | 'delayed'
type CurvePoint = { label:string; plan:number; actual:number }
type ProjectStat = { p:Project; avgActual:number; avgPlan:number; delayed:number; blockers:number; taskCount:number; variance:number; syncedAt?:string|null }

function clampPct(v:number){ return Math.max(0,Math.min(100,Math.round(v*100))) }

function dateTimeTH(value:string|null|undefined){
  if(!value) return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d)
}

function CompletionCurve({data}:{data:CurvePoint[]}){
  const width=760, height=245, left=42, right=14, top=12, bottom=34
  const plotW=width-left-right, plotH=height-top-bottom
  const x=(i:number)=>left+(data.length<=1?0:(i/(data.length-1))*plotW)
  const y=(v:number)=>top+plotH-(Math.max(0,Math.min(100,v))/100)*plotH
  const planPoints=data.map((d,i)=>`${x(i)},${y(d.plan)}`).join(' ')
  const actualPoints=data.map((d,i)=>`${x(i)},${y(d.actual)}`).join(' ')
  return <div className="curve-chart-wrap"><svg className="curve-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Task completion curve plan versus actual">
    {[0,25,50,75,100].map(v=><g key={v}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} className="curve-grid"/><text x={left-8} y={y(v)+4} textAnchor="end" className="curve-axis-text">{v}%</text></g>)}
    <polyline points={planPoints} fill="none" className="curve-line plan"/>
    <polyline points={actualPoints} fill="none" className="curve-line actual"/>
    {data.map((d,i)=><g key={d.label}><text x={x(i)} y={height-10} textAnchor="middle" className="curve-axis-text">{d.label}</text>{i<data.length-1&&<circle cx={x(i)} cy={y(d.actual)} r="2.5" className="curve-dot"/>}</g>)}
  </svg></div>
}

function SiteAlertRings({delayed,blockers,total}:{delayed:number;blockers:number;total:number}){
  const safe=Math.max(1,total)
  const outer=2*Math.PI*34, inner=2*Math.PI*25
  const delayedLen=Math.min(outer,(delayed/safe)*outer)
  const blockerLen=Math.min(inner,(blockers/safe)*inner)
  return <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={`${delayed} delayed, ${blockers} blockers จาก ${total} งาน`}>
    <g transform="rotate(-90 46 46)">
      <circle cx="46" cy="46" r="34" fill="none" stroke="#edf0f3" strokeWidth="8"/>
      <circle cx="46" cy="46" r="34" fill="none" stroke="var(--amber)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${delayedLen} ${outer-delayedLen}`} />
      <circle cx="46" cy="46" r="25" fill="none" stroke="#f1eeee" strokeWidth="7"/>
      <circle cx="46" cy="46" r="25" fill="none" stroke="var(--red)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${blockerLen} ${inner-blockerLen}`} />
    </g>
    <text x="46" y="43" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--navy)">{total}</text>
    <text x="46" y="56" textAnchor="middle" fontSize="8" fill="var(--muted)">งานทั้งหมด</text>
  </svg>
}

function siteStatusOf(x:{variance:number}){
  if(x.variance>=-0.03) return 'ontrack' as const
  if(x.variance>=-0.10) return 'atrisk' as const
  return 'delayed' as const
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<ScheduleTask[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [proc, setProc] = useState<any[]>([])
  const [syncRuns, setSyncRuns] = useState<any[]>([])
  const [snapshotDays, setSnapshotDays] = useState<any[]>([])
  const [snapshotRows, setSnapshotRows] = useState<any[]>([])
  const [snapshotDate, setSnapshotDate] = useState('')
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [disciplineProject, setDisciplineProject] = useState('')
  const [siteStatusFilter, setSiteStatusFilter] = useState<SiteStatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [followupView, setFollowupView] = useState<FollowupView>('critical')

  useEffect(() => {
    const load = async () => {
      const s = getSupabase()
      const [p,t,r,pr,sr,sd] = await Promise.all([
        s.from('projects').select('*').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('id,project_id,task_name,category,actual_progress,current_plan_progress,current_variance,delay_days,site_status,blocker,next_action,target_close,planned_start,planned_end,actual_start,actual_end,area,source_task_no,contractor'),
        s.from('daily_reports').select('id,project_id,report_date,total_manpower,summary,status,created_at').order('report_date',{ascending:false}).order('created_at',{ascending:false}).limit(100),
        s.from('procurement_items').select('id,project_id,vendor,item_name,current_status,expected_delivery_text,expected_delivery').order('created_at',{ascending:false}),
        s.from('drive_sync_runs').select('id,sync_type,project_code,source_file,status,created_at').eq('status','success').order('created_at',{ascending:false}).limit(100),
        s.from('v_schedule_snapshot_days').select('*').order('snapshot_date',{ascending:false}).limit(60)
      ])
      if (p.error) throw p.error
      if (t.error) throw t.error
      setProjects((p.data||[]) as Project[])
      setTasks((t.data||[]) as ScheduleTask[])
      setReports(r.data||[])
      setProc(pr.data||[])
      setSyncRuns(sr.data||[])
      setSnapshotDays(sd.data||[])
      if((sd.data||[]).length) setSnapshotDate((sd.data||[])[0].snapshot_date)
      setLoading(false)
    }
    load().catch(()=>setLoading(false))
  }, [])

  useEffect(()=>{
    if(!snapshotDate) return
    setSnapshotLoading(true)
    getSupabase().from('schedule_task_daily_snapshots').select('snapshot_date,synced_at,project_id,source_identity,source_task_no,category,task_name,area,planned_start,planned_end,actual_progress,current_plan_progress,current_variance,delay_days,site_status,blocker,next_action,source_file').eq('snapshot_date',snapshotDate).then(({data})=>{
      setSnapshotRows(data||[])
      setSnapshotLoading(false)
    })
  },[snapshotDate])

  const workTasks = useMemo(() => tasks.filter(t=>t.source_task_no!=='1'), [tasks])
  const delayedTasks = useMemo(() => workTasks.filter(t=>(t.delay_days||0)>0 && (t.actual_progress||0)<1), [workTasks])
  const blockerTasks = useMemo(() => workTasks.filter(t=>Boolean(t.blocker?.trim()) && (t.actual_progress||0)<1), [workTasks])
  const criticalTasks = useMemo(() => workTasks.filter(t=>((t.delay_days||0)>0 || Boolean(t.blocker?.trim())) && (t.actual_progress||0)<1), [workTasks])

  const portfolioActual=workTasks.length?workTasks.reduce((s,t)=>s+(t.actual_progress||0),0)/workTasks.length:0
  const portfolioPlan=workTasks.length?workTasks.reduce((s,t)=>s+(t.current_plan_progress||0),0)/workTasks.length:0
  const portfolioVariance=portfolioActual-portfolioPlan

  const projectStats = useMemo<ProjectStat[]>(() => projects.map(p => {
    const list = workTasks.filter(t=>t.project_id===p.id)
    const avgActual = list.length ? list.reduce((a,b)=>a+(b.actual_progress||0),0)/list.length : 0
    const avgPlan = list.length ? list.reduce((a,b)=>a+(b.current_plan_progress||0),0)/list.length : 0
    const delayed = list.filter(t=>(t.delay_days||0)>0 && (t.actual_progress||0)<1).length
    const blockers = list.filter(t=>Boolean(t.blocker?.trim()) && (t.actual_progress||0)<1).length
    return { p, avgActual, avgPlan, delayed, blockers, taskCount:list.length, variance:avgActual-avgPlan }
  }), [projects,workTasks])

  const statusSummary=useMemo(()=>{
    const active=projectStats.filter(x=>x.taskCount>0)
    return {
      onTrack:active.filter(x=>siteStatusOf(x)==='ontrack').length,
      atRisk:active.filter(x=>siteStatusOf(x)==='atrisk').length,
      delayed:active.filter(x=>siteStatusOf(x)==='delayed').length,
      total:active.length
    }
  },[projectStats])

  const disciplineTasks=useMemo(()=>disciplineProject?workTasks.filter(t=>t.project_id===disciplineProject):workTasks,[workTasks,disciplineProject])
  const disciplineStats=useMemo(()=>{
    const map=new Map<string,ScheduleTask[]>()
    disciplineTasks.forEach(t=>{ const key=t.category||'ไม่ระบุหมวด'; map.set(key,[...(map.get(key)||[]),t]) })
    return [...map.entries()].map(([category,list])=>({
      category,
      count:list.length,
      plan:list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length,
      actual:list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length,
      delayed:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length
    })).sort((a,b)=>b.count-a.count).slice(0,8)
  },[disciplineTasks])

  const curveData=useMemo(()=>{
    const year=2026
    const labels=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
    const denominator=Math.max(1,workTasks.length)
    return labels.map((label,month)=>{
      const end=new Date(Date.UTC(year,month+1,0,23,59,59))
      const planned=workTasks.filter(t=>t.planned_end&&new Date(`${t.planned_end}T00:00:00Z`)<=end).length
      const actual=workTasks.filter(t=>t.actual_end&&new Date(`${t.actual_end}T00:00:00Z`)<=end).length
      return {label,plan:Math.round(planned/denominator*100),actual:Math.round(actual/denominator*100)}
    })
  },[workTasks])

  const delayedTotal = delayedTasks.length
  const blockersTotal = blockerTasks.length
  const today = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})
  const reportToday = reports.filter(r=>r.report_date===today).length

  const latestReports=useMemo(()=>{
    const seen=new Set<string>(); const out:any[]=[]
    for(const r of reports){ if(!seen.has(r.project_id)){seen.add(r.project_id);out.push(r)} }
    return out
  },[reports])
  const latestManpower=latestReports.reduce((s,r)=>s+(Number(r.total_manpower)||0),0)

  const openProc=useMemo(()=>proc.filter(x=>!/(ส่งครบ|delivered|closed|complete|completed|เสร็จ|รับของแล้ว)/i.test(`${x.current_status||''}`)),[proc])

  const followupTasks = useMemo(() => {
    const list = followupView==='delayed' ? delayedTasks : followupView==='blockers' ? blockerTasks : criticalTasks
    return [...list].sort((a,b)=>(b.delay_days||0)-(a.delay_days||0))
  }, [followupView, delayedTasks, blockerTasks, criticalTasks])

  const followupTitle = followupView==='delayed' ? 'Delayed Tasks' : followupView==='blockers' ? 'Open Blockers' : 'Construction Alert & Action'

  const snapshotStats=useMemo<ProjectStat[]>(()=>projects.map(p=>{
    const list=snapshotRows.filter(x=>x.project_id===p.id&&x.source_task_no!=='1')
    if(!list.length) return {p,avgActual:0,avgPlan:0,delayed:0,blockers:0,taskCount:0,variance:0,syncedAt:null}
    const avgActual=list.reduce((s,x)=>s+(Number(x.actual_progress)||0),0)/list.length
    const avgPlan=list.reduce((s,x)=>s+(Number(x.current_plan_progress)||0),0)/list.length
    const syncedAt=[...list].map(x=>x.synced_at).filter(Boolean).sort().at(-1)||null
    return {
      p,avgActual,avgPlan,
      delayed:list.filter(x=>(Number(x.delay_days)||0)>0&&(Number(x.actual_progress)||0)<1).length,
      blockers:list.filter(x=>Boolean(`${x.blocker||''}`.trim())&&(Number(x.actual_progress)||0)<1).length,
      taskCount:list.length,variance:avgActual-avgPlan,syncedAt
    }
  }),[projects,snapshotRows])

  const sitePerformanceStats=useMemo(()=>snapshotDate?snapshotStats:projectStats,[snapshotDate,snapshotStats,projectStats])
  const sitePerformanceFiltered=useMemo(()=>sitePerformanceStats.filter(x=>x.taskCount>0&&(siteStatusFilter==='all'||siteStatusOf(x)===siteStatusFilter)),[sitePerformanceStats,siteStatusFilter])
  const latestSyncAt=syncRuns.map(x=>x.created_at).filter(Boolean).sort().at(-1)||null
  const latestSnapshotDate=snapshotDays[0]?.snapshot_date||''
  const earliestSnapshotDate=snapshotDays.at(-1)?.snapshot_date||''

  function openFollowup(view: FollowupView) {
    setFollowupView(view)
    window.setTimeout(()=>document.getElementById('management-followup')?.scrollIntoView({behavior:'smooth',block:'start'}),60)
  }

  function openSiteStatus(view:Exclude<SiteStatusFilter,'all'>){
    setSiteStatusFilter(view)
    if(latestSnapshotDate) setSnapshotDate(latestSnapshotDate)
    window.setTimeout(()=>document.getElementById('site-performance')?.scrollIntoView({behavior:'smooth',block:'start'}),60)
  }

  return <AppShell><PageHeader title="Management Dashboard" subtitle="Construction supervision overview — เห็นความคืบหน้า ความเสี่ยง ทรัพยากร และรายการต้องติดตามจากหน้าเดียว" action={<Link href="/reports/new" className="button primary">+ รายงานประจำวัน</Link>} />
    {loading ? <div className="panel">กำลังโหลดข้อมูล…</div> : <>
      <section className="executive-section">
        <div className="executive-section-title"><span>1</span><div><b>PROJECT KPI SUMMARY</b><small>ภาพรวมโครงการจาก Schedule และข้อมูลหน้างานล่าสุด</small></div></div>
        <div className="executive-kpi-grid">
          <div className="executive-kpi hero"><span>ความคืบหน้ารวม</span><b>{pct(portfolioActual)}</b><small>Plan {pct(portfolioPlan)}</small><em className={portfolioVariance<0?'danger-text':'good-text'}>{portfolioVariance>0?'+':''}{Math.round(portfolioVariance*100)}% variance</em></div>
          <div className="executive-kpi"><span>Active Sites</span><b>{projects.length}</b><small>{statusSummary.total} Site / Plot มี Schedule</small></div>
          <button className="executive-kpi warn" onClick={()=>openFollowup('delayed')}><span>Delayed Tasks</span><b>{delayedTotal}</b><small>คลิกดูรายการงานล่าช้า</small></button>
          <button className="executive-kpi danger" onClick={()=>openFollowup('blockers')}><span>Open Blockers</span><b>{blockersTotal}</b><small>คลิกดูปัญหาที่ยังค้าง</small></button>
          <div className="executive-kpi"><span>Reports Today</span><b>{reportToday}</b><small>รายงานประจำวันที่ส่งวันนี้</small></div>
          <div className="executive-kpi"><span>Latest Manpower</span><b>{latestManpower}</b><small>คน • รวมจากรายงานล่าสุดของแต่ละ Site</small></div>
        </div>
        <div className="portfolio-status-strip">
          <button type="button" onClick={()=>openSiteStatus('ontrack')} style={{border:'1px solid var(--line)',background:'var(--surface)',borderRadius:11,padding:'9px 12px',display:'grid',gridTemplateColumns:'auto 1fr auto',alignItems:'center',gap:8,textAlign:'left',color:'var(--text)'}}><span className="status-dot good-dot"/><b>On Track</b><strong>{statusSummary.onTrack} <span style={{fontSize:10,fontWeight:700}}>Site / Plot</span></strong><small style={{gridColumn:'2/-1',color:'var(--muted)'}}>Δ ≥ -3% • คลิกดูรายละเอียด</small></button>
          <button type="button" onClick={()=>openSiteStatus('atrisk')} style={{border:'1px solid var(--line)',background:'var(--surface)',borderRadius:11,padding:'9px 12px',display:'grid',gridTemplateColumns:'auto 1fr auto',alignItems:'center',gap:8,textAlign:'left',color:'var(--text)'}}><span className="status-dot warn-dot"/><b>At Risk</b><strong>{statusSummary.atRisk} <span style={{fontSize:10,fontWeight:700}}>Site / Plot</span></strong><small style={{gridColumn:'2/-1',color:'var(--muted)'}}>Δ -3% ถึง -10% • คลิกดูรายละเอียด</small></button>
          <button type="button" onClick={()=>openSiteStatus('delayed')} style={{border:'1px solid var(--line)',background:'var(--surface)',borderRadius:11,padding:'9px 12px',display:'grid',gridTemplateColumns:'auto 1fr auto',alignItems:'center',gap:8,textAlign:'left',color:'var(--text)'}}><span className="status-dot bad-dot"/><b>Delayed</b><strong>{statusSummary.delayed} <span style={{fontSize:10,fontWeight:700}}>Site / Plot</span></strong><small style={{gridColumn:'2/-1',color:'var(--muted)'}}>Δ ต่ำกว่า -10% • คลิกดูรายละเอียด</small></button>
        </div>
      </section>

      <div className="dashboard-grid two-main">
        <section className="panel dashboard-module">
          <div className="module-title"><span>2</span><div><b>PLAN vs ACTUAL PROGRESS</b><small>เทียบความคืบหน้าราย Site / Plot</small></div><Link href="/schedule">เปิด Schedule →</Link></div>
          <div className="portfolio-bars">
            {projectStats.filter(x=>x.taskCount>0).map(x=>{
              const plan=clampPct(x.avgPlan), actual=clampPct(x.avgActual), delta=Math.round(x.variance*100)
              return <Link href={`/projects/${x.p.id}`} key={x.p.id} className="portfolio-bar-row">
                <div><b>{x.p.code}</b><small>{x.p.name}</small></div>
                <div className="portfolio-track"><i style={{width:`${actual}%`}}/><em style={{left:`${plan}%`}}/><strong>{actual}%</strong></div>
                <div className="portfolio-bar-meta"><span>Plan {plan}%</span><b className={delta<0?'danger-text':'good-text'}>{delta>0?'+':''}{delta}%</b></div>
              </Link>
            })}
          </div>
        </section>

        <section className="panel dashboard-module">
          <div className="module-title"><span>3</span><div><b>COMPLETION CURVE</b><small>สะสมจำนวนงานที่ควรจบ เทียบวันที่จบจริงที่บันทึก</small></div></div>
          <CompletionCurve data={curveData}/>
          <div className="curve-legend"><span><i className="legend-plan"/>Planned completion</span><span><i className="legend-actual"/>Actual completion</span></div>
          <p className="muted small">กราฟนี้นับตามจำนวน Task และ Actual ใช้วันที่จบจริงที่บันทึก ไม่ใช่ Earned Value ตาม BOQ</p>
        </section>
      </div>

      <section className="panel dashboard-module" style={{marginBottom:18}}>
        <div className="module-title"><span>4</span><div><b>WORK PROGRESS BY DISCIPLINE</b><small>{disciplineProject?`เฉพาะ ${projects.find(p=>p.id===disciplineProject)?.code||'Site ที่เลือก'}`:'ภาพรวมรวมทุก Site / Plot — เลือก Site เพื่อดูแยกหน้างาน'}</small></div><select value={disciplineProject} onChange={e=>setDisciplineProject(e.target.value)} style={{maxWidth:230,padding:'7px 9px',borderRadius:8,border:'1px solid rgba(255,255,255,.5)',background:'#fff',color:'var(--text)',fontSize:11}}><option value="">ทุก Site / Plot (รวม)</option>{projects.filter(p=>workTasks.some(t=>t.project_id===p.id)).map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></div>
        <div className="discipline-list">{disciplineStats.map(x=>{
          const plan=clampPct(x.plan), actual=clampPct(x.actual), delta=Math.round((x.actual-x.plan)*100)
          return <Link href={`/schedule?q=${encodeURIComponent(x.category)}${disciplineProject?`&project=${encodeURIComponent(disciplineProject)}`:''}`} key={x.category} className="discipline-row">
            <div><b>{x.category}</b><small>{x.count} งาน • Delayed {x.delayed}</small></div>
            <div className="discipline-bars"><span><i style={{width:`${plan}%`}}/></span><span className="actual"><i style={{width:`${actual}%`}}/></span></div>
            <div><b>{actual}%</b><small className={delta<0?'danger-text':'good-text'}>Δ {delta>0?'+':''}{delta}%</small></div>
          </Link>
        })}</div>
        <div className="module-footnote"><span><i className="plan-key"/>Plan</span><span><i className="actual-key"/>Actual</span></div>
      </section>

      <section className="panel dashboard-module" id="site-performance" style={{marginBottom:18}}>
        <div className="module-title"><span>5</span><div><b>SITE PERFORMANCE — DELAYED / BLOCKER</b><small>วงนอก = Delayed ต่อจำนวนงาน • วงใน = Blocker ต่อจำนวนงาน</small></div></div>
        <div style={{padding:'12px 14px',display:'flex',gap:10,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',borderBottom:'1px solid var(--line)'}}>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <label className="small" style={{fontWeight:800}}>ข้อมูล ณ วันที่</label>
            <select value={snapshotDate} onChange={e=>setSnapshotDate(e.target.value)} style={{padding:'8px 10px',border:'1px solid var(--line)',borderRadius:9,background:'var(--surface)'}}>
              {snapshotDays.map(d=><option key={d.snapshot_date} value={d.snapshot_date}>{dateTH(d.snapshot_date)}</option>)}
            </select>
            <select value={siteStatusFilter} onChange={e=>setSiteStatusFilter(e.target.value as SiteStatusFilter)} style={{padding:'8px 10px',border:'1px solid var(--line)',borderRadius:9,background:'var(--surface)'}}>
              <option value="all">ทุกสถานะ Site</option><option value="ontrack">On Track</option><option value="atrisk">At Risk</option><option value="delayed">Delayed</option>
            </select>
            {siteStatusFilter!=='all'&&<button type="button" className="button" style={{padding:'7px 10px',fontSize:11}} onClick={()=>setSiteStatusFilter('all')}>แสดงทุก Site</button>}
          </div>
          <div className="small" style={{color:'var(--muted)',textAlign:'right'}}><b style={{color:'var(--text)'}}>Sync ล่าสุด:</b> {dateTimeTH(latestSyncAt)}{earliestSnapshotDate&&<><br/>ประวัติเลือกดูรายวันเริ่มเก็บ: {dateTH(earliestSnapshotDate)}</>}</div>
        </div>
        {snapshotLoading?<p className="muted" style={{padding:'14px'}}>กำลังโหลดข้อมูล ณ วันที่เลือก…</p>:<div style={{padding:14,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(245px,1fr))',gap:10}}>
          {sitePerformanceFiltered.map(x=><Link href={`/projects/${x.p.id}`} key={x.p.id} style={{border:'1px solid var(--line)',borderRadius:13,padding:12,display:'grid',gridTemplateColumns:'92px 1fr',gap:12,alignItems:'center',background:'var(--surface-2)'}}>
            <SiteAlertRings delayed={x.delayed} blockers={x.blockers} total={x.taskCount}/>
            <div><div className="row between"><div><b style={{color:'var(--navy-2)'}}>{x.p.code}</b><small style={{display:'block',color:'var(--muted)',marginTop:2}}>{x.p.name}</small></div><StatusBadge value={siteStatusOf(x)==='ontrack'?'On Track':siteStatusOf(x)==='atrisk'?'At Risk':'Delayed'}/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:10}}><div style={{background:'var(--amber-soft)',borderRadius:8,padding:'7px 8px'}}><small>Delayed</small><b style={{display:'block'}}>{x.delayed} งาน</b></div><div style={{background:'var(--red-soft)',borderRadius:8,padding:'7px 8px'}}><small>Blocker</small><b style={{display:'block'}}>{x.blockers} งาน</b></div></div>
              <small style={{display:'block',marginTop:7,color:'var(--muted)'}}>ข้อมูล Sync: {dateTimeTH(x.syncedAt||latestSyncAt)}</small>
            </div>
          </Link>)}
          {!sitePerformanceFiltered.length&&<p className="muted">ไม่มี Site / Plot ในสถานะที่เลือกสำหรับวันที่นี้</p>}
        </div>}
      </section>

      <div className="dashboard-grid two-main">
        <section className="panel dashboard-module">
          <div className="module-title"><span>6</span><div><b>MANPOWER / DAILY REPORT</b><small>กำลังคนจากรายงานล่าสุดของแต่ละ Site และสถานะการส่งรายงานวันนี้</small></div><Link href="/reports">ดูรายงาน →</Link></div>
          <div className="resource-kpis"><div><span>แรงงานล่าสุด</span><b>{latestManpower}</b><small>คน จาก {latestReports.length} Site ที่มีรายงาน</small></div><div><span>Reports Today</span><b>{reportToday}</b><small>รายงานประจำวัน</small></div><div><span>Active Sites</span><b>{projects.length}</b><small>Site / Plot ที่เปิดใช้งาน</small></div></div>
          <div className="resource-list">{latestReports.slice(0,8).map(r=><div key={r.id}><div><b>{projects.find(p=>p.id===r.project_id)?.code||'-'}</b><small>{r.summary||'Daily Report'} • {dateTH(r.report_date)}</small></div><span>{Number(r.total_manpower)||0} คน</span></div>)}{!latestReports.length&&<p className="muted">ยังไม่มี Daily Report</p>}</div>
        </section>

        <section className="panel dashboard-module">
          <div className="module-title"><span>7</span><div><b>PURCHASING FOLLOW-UP</b><small>สถานะรายการจัดซื้อ/จัดจ้าง</small></div><Link href="/procurement">เปิดจัดซื้อ →</Link></div>
          <div className="resource-kpis" style={{gridTemplateColumns:'repeat(2,1fr)'}}><div><span>รายการต้องติดตาม</span><b>{openProc.length}</b><small>รายการที่ยังไม่ปิด</small></div><div><span>มีข้อมูลทั้งหมด</span><b>{proc.length}</b><small>รายการใน Procurement</small></div></div>
          <div className="resource-list">{openProc.slice(0,8).map(x=><div key={x.id}><div><b>{x.item_name}</b><small>{projects.find(p=>p.id===x.project_id)?.code||'-'} • {x.vendor||'ยังไม่ระบุผู้ขาย'}</small></div><span>{x.expected_delivery_text||'ยังไม่ระบุกำหนด'}</span></div>)}{!openProc.length&&<p className="muted">ไม่มีรายการจัดซื้อค้างในข้อมูลปัจจุบัน</p>}</div>
        </section>
      </div>

      <section className="panel dashboard-module" id="management-followup" style={{marginBottom:18}}>
        <div className="module-title alert"><span>8</span><div><b>{followupTitle.toUpperCase()}</b><small>รายการที่ต้องตามต่อจาก Schedule</small></div><Link href="/schedule">ดู Schedule →</Link></div>
        <div className="followup-tabs">{(['critical','delayed','blockers'] as FollowupView[]).map(view=><button type="button" key={view} onClick={()=>setFollowupView(view)} className={followupView===view?'active':''}>{view==='critical'?`ทั้งหมด ${criticalTasks.length}`:view==='delayed'?`Delayed ${delayedTotal}`:`Blockers ${blockersTotal}`}</button>)}</div>
        <div className="alert-list">{followupTasks.slice(0,15).map(t=><div key={t.id} className="alert-row"><span className={(t.delay_days||0)>0?'alert-icon bad':'alert-icon warn'}>!</span><div><b>{t.task_name}</b><small>{projects.find(p=>p.id===t.project_id)?.code} • {t.area||'-'} • จบตามแผน {dateTH(t.planned_end)}</small>{t.blocker&&<p><strong>ปัญหา:</strong> {t.blocker}</p>}{t.next_action&&<p><strong>งานถัดไป:</strong> {t.next_action}</p>}</div><div className="right"><StatusBadge value={t.site_status}/><small className={(t.delay_days||0)>0?'danger-text':''}>{t.delay_days||0} วัน</small><Link href={`/projects/${t.project_id}`} style={{fontSize:10,color:'var(--blue)',fontWeight:800}}>เปิด Plot →</Link></div></div>)}{!followupTasks.length&&<p className="muted">ไม่มีรายการในหมวดนี้</p>}</div>
      </section>
    </>}
  </AppShell>
}
