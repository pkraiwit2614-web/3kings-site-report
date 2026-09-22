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
type CurvePoint = { label:string; plan:number; actual:number }

function clampPct(v:number){ return Math.max(0,Math.min(100,Math.round(v*100))) }

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

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<ScheduleTask[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [proc, setProc] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [followupView, setFollowupView] = useState<FollowupView>('critical')

  useEffect(() => {
    const load = async () => {
      const s = getSupabase()
      const [p,t,r,pr] = await Promise.all([
        s.from('projects').select('*').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('id,project_id,task_name,category,actual_progress,current_plan_progress,current_variance,delay_days,site_status,blocker,next_action,target_close,planned_start,planned_end,actual_start,actual_end,area,source_task_no,contractor'),
        s.from('daily_reports').select('id,project_id,report_date,total_manpower,summary,status,created_at').order('report_date',{ascending:false}).order('created_at',{ascending:false}).limit(100),
        s.from('procurement_items').select('id,project_id,vendor,item_name,current_status,expected_delivery_text,expected_delivery').order('created_at',{ascending:false})
      ])
      if (p.error) throw p.error
      if (t.error) throw t.error
      setProjects((p.data||[]) as Project[])
      setTasks((t.data||[]) as ScheduleTask[])
      setReports(r.data||[])
      setProc(pr.data||[])
      setLoading(false)
    }
    load().catch(()=>setLoading(false))
  }, [])

  const workTasks = useMemo(() => tasks.filter(t=>t.source_task_no!=='1'), [tasks])
  const delayedTasks = useMemo(() => workTasks.filter(t=>(t.delay_days||0)>0 && (t.actual_progress||0)<1), [workTasks])
  const blockerTasks = useMemo(() => workTasks.filter(t=>Boolean(t.blocker?.trim()) && (t.actual_progress||0)<1), [workTasks])
  const criticalTasks = useMemo(() => workTasks.filter(t=>((t.delay_days||0)>0 || Boolean(t.blocker?.trim())) && (t.actual_progress||0)<1), [workTasks])

  const portfolioActual=workTasks.length?workTasks.reduce((s,t)=>s+(t.actual_progress||0),0)/workTasks.length:0
  const portfolioPlan=workTasks.length?workTasks.reduce((s,t)=>s+(t.current_plan_progress||0),0)/workTasks.length:0
  const portfolioVariance=portfolioActual-portfolioPlan

  const projectStats = useMemo(() => projects.map(p => {
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
      onTrack:active.filter(x=>x.variance>=-0.03).length,
      atRisk:active.filter(x=>x.variance<-0.03&&x.variance>=-0.10).length,
      delayed:active.filter(x=>x.variance<-0.10).length,
      total:active.length
    }
  },[projectStats])

  const disciplineStats=useMemo(()=>{
    const map=new Map<string,ScheduleTask[]>()
    workTasks.forEach(t=>{ const key=t.category||'ไม่ระบุหมวด'; map.set(key,[...(map.get(key)||[]),t]) })
    return [...map.entries()].map(([category,list])=>({
      category,
      count:list.length,
      plan:list.reduce((s,t)=>s+(t.current_plan_progress||0),0)/list.length,
      actual:list.reduce((s,t)=>s+(t.actual_progress||0),0)/list.length,
      delayed:list.filter(t=>(t.delay_days||0)>0&&(t.actual_progress||0)<1).length
    })).sort((a,b)=>b.count-a.count).slice(0,7)
  },[workTasks])

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

  function openFollowup(view: FollowupView) {
    setFollowupView(view)
    window.setTimeout(()=>document.getElementById('management-followup')?.scrollIntoView({behavior:'smooth',block:'start'}),60)
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
          <div className="executive-kpi"><span>Latest Manpower</span><b>{latestManpower}</b><small>รวมจากรายงานล่าสุดของแต่ละ Site</small></div>
        </div>
        <div className="portfolio-status-strip">
          <div><span className="status-dot good-dot"/><b>On Track</b><strong>{statusSummary.onTrack}</strong><small>Δ ≥ -3%</small></div>
          <div><span className="status-dot warn-dot"/><b>At Risk</b><strong>{statusSummary.atRisk}</strong><small>Δ -3% ถึง -10%</small></div>
          <div><span className="status-dot bad-dot"/><b>Delayed</b><strong>{statusSummary.delayed}</strong><small>Δ ต่ำกว่า -10%</small></div>
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

      <div className="dashboard-grid two-main">
        <section className="panel dashboard-module">
          <div className="module-title"><span>4</span><div><b>WORK PROGRESS BY DISCIPLINE</b><small>มองหมวดงานเดียวรู้ว่าหมวดไหนตกแผน</small></div></div>
          <div className="discipline-list">{disciplineStats.map(x=>{
            const plan=clampPct(x.plan), actual=clampPct(x.actual), delta=Math.round((x.actual-x.plan)*100)
            return <Link href={`/schedule?q=${encodeURIComponent(x.category)}`} key={x.category} className="discipline-row">
              <div><b>{x.category}</b><small>{x.count} งาน • Delayed {x.delayed}</small></div>
              <div className="discipline-bars"><span><i style={{width:`${plan}%`}}/></span><span className="actual"><i style={{width:`${actual}%`}}/></span></div>
              <div><b>{actual}%</b><small className={delta<0?'danger-text':'good-text'}>Δ {delta>0?'+':''}{delta}%</small></div>
            </Link>
          })}</div>
          <div className="module-footnote"><span><i className="plan-key"/>Plan</span><span><i className="actual-key"/>Actual</span></div>
        </section>

        <section className="panel dashboard-module">
          <div className="module-title"><span>6</span><div><b>SITE PERFORMANCE</b><small>ใช้ Site / Plot แทน Contractor เพราะข้อมูลผู้รับเหมายังไม่ได้ระบุครบใน Progress</small></div></div>
          <div className="site-performance-table"><div className="site-performance-head"><span>Site</span><span>Plan</span><span>Actual</span><span>Delayed</span><span>Blocker</span></div>
            {projectStats.filter(x=>x.taskCount>0).map(x=><Link href={`/projects/${x.p.id}`} key={x.p.id} className="site-performance-row"><b>{x.p.code}</b><span>{clampPct(x.avgPlan)}%</span><strong>{clampPct(x.avgActual)}%</strong><span className={x.delayed?'danger-text':''}>{x.delayed}</span><span className={x.blockers?'danger-text':''}>{x.blockers}</span></Link>)}
          </div>
        </section>
      </div>

      <div className="dashboard-grid resources-alerts">
        <section className="panel dashboard-module">
          <div className="module-title"><span>9</span><div><b>MANPOWER / MATERIAL / PURCHASING</b><small>ทรัพยากรหน้างานและรายการจัดซื้อที่ต้องตาม</small></div><Link href="/procurement">เปิดจัดซื้อ →</Link></div>
          <div className="resource-kpis"><div><span>แรงงานล่าสุด</span><b>{latestManpower}</b><small>คน จาก {latestReports.length} Site ที่มีรายงาน</small></div><div><span>Purchasing Follow-up</span><b>{openProc.length}</b><small>รายการที่ยังไม่ปิด</small></div><div><span>Reports Today</span><b>{reportToday}</b><small>รายงานประจำวัน</small></div></div>
          <div className="resource-list">{openProc.slice(0,6).map(x=><div key={x.id}><div><b>{x.item_name}</b><small>{projects.find(p=>p.id===x.project_id)?.code||'-'} • {x.vendor||'ยังไม่ระบุผู้ขาย'}</small></div><span>{x.expected_delivery_text||'ยังไม่ระบุกำหนด'}</span></div>)}{!openProc.length&&<p className="muted">ไม่มีรายการจัดซื้อค้างในข้อมูลปัจจุบัน</p>}</div>
        </section>

        <section className="panel dashboard-module" id="management-followup">
          <div className="module-title alert"><span>10</span><div><b>{followupTitle.toUpperCase()}</b><small>รายการที่ต้องตามต่อจาก Schedule</small></div><Link href="/schedule">ดู Schedule →</Link></div>
          <div className="followup-tabs">{(['critical','delayed','blockers'] as FollowupView[]).map(view=><button type="button" key={view} onClick={()=>setFollowupView(view)} className={followupView===view?'active':''}>{view==='critical'?`ทั้งหมด ${criticalTasks.length}`:view==='delayed'?`Delayed ${delayedTotal}`:`Blockers ${blockersTotal}`}</button>)}</div>
          <div className="alert-list">{followupTasks.slice(0,10).map(t=><div key={t.id} className="alert-row"><span className={(t.delay_days||0)>0?'alert-icon bad':'alert-icon warn'}>!</span><div><b>{t.task_name}</b><small>{projects.find(p=>p.id===t.project_id)?.code} • {t.area||'-'} • จบตามแผน {dateTH(t.planned_end)}</small>{t.blocker&&<p><strong>ปัญหา:</strong> {t.blocker}</p>}{t.next_action&&<p><strong>งานถัดไป:</strong> {t.next_action}</p>}</div><div className="right"><StatusBadge value={t.site_status}/><small className={(t.delay_days||0)>0?'danger-text':''}>{t.delay_days||0} วัน</small></div></div>)}{!followupTasks.length&&<p className="muted">ไม่มีรายการในหมวดนี้</p>}</div>
        </section>
      </div>
    </>}
  </AppShell>
}
