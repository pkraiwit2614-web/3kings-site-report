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
        s.from('v_schedule_tasks').select('id,project_id,task_name,category,actual_progress,current_plan_progress,current_variance,delay_days,site_status,blocker,next_action,target_close,planned_start,planned_end,area,source_task_no,contractor'),
        s.from('daily_reports').select('id,project_id,report_date,total_manpower,summary,status,created_at').order('report_date',{ascending:false}).limit(8),
        s.from('procurement_items').select('id,project_id,vendor,item_name,current_status,expected_delivery_text').order('created_at',{ascending:false})
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

  const projectStats = useMemo(() => projects.map(p => {
    const list = workTasks.filter(t=>t.project_id===p.id)
    const avgActual = list.length ? list.reduce((a,b)=>a+(b.actual_progress||0),0)/list.length : 0
    const avgPlan = list.length ? list.reduce((a,b)=>a+(b.current_plan_progress||0),0)/list.length : 0
    const delayed = list.filter(t=>(t.delay_days||0)>0 && (t.actual_progress||0)<1).length
    const blockers = list.filter(t=>Boolean(t.blocker?.trim()) && (t.actual_progress||0)<1).length
    return { p, avgActual, avgPlan, delayed, blockers, taskCount:list.length, variance:avgActual-avgPlan }
  }), [projects,workTasks])

  const delayedTotal = delayedTasks.length
  const blockersTotal = blockerTasks.length
  const reportToday = reports.filter(r=>r.report_date===new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'})).length

  const followupTasks = useMemo(() => {
    const list = followupView==='delayed' ? delayedTasks : followupView==='blockers' ? blockerTasks : criticalTasks
    return [...list].sort((a,b)=>(b.delay_days||0)-(a.delay_days||0))
  }, [followupView, delayedTasks, blockerTasks, criticalTasks])

  const followupTitle = followupView==='delayed' ? 'Delayed Tasks' : followupView==='blockers' ? 'Open Blockers' : 'Critical Follow-up'

  function openFollowup(view: FollowupView) {
    setFollowupView(view)
    window.setTimeout(()=>document.getElementById('management-followup')?.scrollIntoView({behavior:'smooth',block:'start'}),60)
  }

  return <AppShell><PageHeader title="Management Dashboard" subtitle="ภาพรวมหน้างานจากกำหนดแผนงาน + รายงานประจำวัน + สถานะจัดซื้อจริง" action={<Link href="/reports/new" className="button primary">+ รายงานประจำวัน</Link>} />
    {loading ? <div className="panel">กำลังโหลดข้อมูล…</div> : <>
      <section className="kpi-grid">
        <div className="kpi"><span>Active Sites</span><b>{projects.length}</b><small>โครงการ / Plot / พื้นที่ส่วนกลางที่เปิดใช้งาน</small></div>
        <div className="kpi"><span>Reports Today</span><b>{reportToday}</b><small>รายงานการทำงานที่ส่งวันนี้</small></div>
        <button type="button" className="kpi" onClick={()=>openFollowup('delayed')} style={{textAlign:'left',width:'100%',outline:followupView==='delayed'?'2px solid var(--amber)':'none',outlineOffset:'-2px'}}>
          <span>Delayed Tasks</span><b>{delayedTotal}</b><small>คลิกเพื่อดูรายละเอียดงานล่าช้าทั้งหมด</small>
        </button>
        <button type="button" className="kpi" onClick={()=>openFollowup('blockers')} style={{textAlign:'left',width:'100%',outline:followupView==='blockers'?'2px solid var(--red)':'none',outlineOffset:'-2px'}}>
          <span>Open Blockers</span><b>{blockersTotal}</b><small>คลิกเพื่อดูปัญหา / เงื่อนไขค้างทั้งหมด</small>
        </button>
      </section>

      <section className="panel" style={{marginBottom:18}}>
        <div className="panel-head">
          <div><h2>Portfolio Status — Plan vs Actual</h2><span className="muted">กราฟเดียวสรุป Progress, งานล่าช้า, Blocker และเป้าส่งมอบของทุก Site / Plot</span></div>
          <div className="row" style={{fontSize:11,color:'var(--muted)',gap:10,flexWrap:'wrap',justifyContent:'flex-end'}}>
            <span><b style={{color:'var(--blue)'}}>■</b> หน้างานจริง</span>
            <span><b style={{color:'var(--gold)'}}>│</b> ตำแหน่งตามแผน</span>
          </div>
        </div>
        <div style={{display:'grid',gap:8}}>
          {projectStats.map(x=>{
            const plan=Math.max(0,Math.min(100,Math.round(x.avgPlan*100)))
            const actual=Math.max(0,Math.min(100,Math.round(x.avgActual*100)))
            const delta=Math.round(x.variance*100)
            return <Link href={`/projects/${x.p.id}`} key={x.p.id} style={{display:'grid',gridTemplateColumns:'minmax(150px,1.25fr) minmax(260px,3fr) minmax(210px,1.65fr)',gap:14,alignItems:'center',padding:'11px 12px',border:'1px solid var(--line)',borderRadius:13,background:'var(--surface-2)'}}>
              <div style={{minWidth:0}}>
                <b style={{fontSize:13,color:'var(--navy-2)'}}>{x.p.code}</b>
                <small style={{display:'block',color:'var(--muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.p.name}</small>
              </div>
              <div>
                {x.taskCount ? <>
                  <div style={{position:'relative',height:20,borderRadius:999,background:'#e9edf2',overflow:'visible'}}>
                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${actual}%`,borderRadius:999,background:'linear-gradient(90deg,var(--blue),#4b92d0)'}} />
                    <div title={`ตามแผน ${plan}%`} style={{position:'absolute',left:`calc(${plan}% - 1px)`,top:-4,bottom:-4,width:2,background:'var(--gold)',borderRadius:2,zIndex:2}} />
                    <span style={{position:'absolute',left:10,top:2,fontSize:11,fontWeight:800,color:actual>=18?'#fff':'var(--navy)',zIndex:3}}>{actual}%</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontSize:10,color:'var(--muted)'}}>
                    <span>แผน {plan}%</span>
                    <span style={{fontWeight:800,color:delta<0?'var(--red)':delta>0?'var(--green)':'var(--muted)'}}>Δ {delta>0?'+':''}{delta}%</span>
                  </div>
                </> : <div style={{fontSize:12,color:'var(--muted)'}}>ยังไม่มี Schedule สำหรับ Site นี้</div>}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,textAlign:'center'}}>
                <div style={{padding:'6px 5px',borderRadius:9,background:'var(--amber-soft)',color:'var(--amber)'}}><b style={{display:'block',fontSize:15}}>{x.delayed}</b><small>Delayed</small></div>
                <div style={{padding:'6px 5px',borderRadius:9,background:'var(--red-soft)',color:'var(--red)'}}><b style={{display:'block',fontSize:15}}>{x.blockers}</b><small>Blocker</small></div>
                <div style={{padding:'6px 5px',borderRadius:9,background:'var(--gold-soft)',color:'#735313'}}><b style={{display:'block',fontSize:11}}>{dateTH(x.p.target_handover)}</b><small>Handover</small></div>
              </div>
            </Link>
          })}
        </div>
        <p className="muted small" style={{marginBottom:0}}>Progress เป็นค่าเฉลี่ยจากรายการงาน ไม่ใช่ Earned Value ตาม BOQ • คลิกแต่ละแถวเพื่อเปิดรายละเอียด Plot</p>
      </section>

      <div className="two-col" id="management-followup">
        <section className="panel">
          <div className="panel-head"><div><h2>{followupTitle} <span className="muted">({followupTasks.length})</span></h2><span className="muted small">รายการที่แสดงตรงกับตัวเลข KPI ด้านบน</span></div><Link href="/schedule">ดู Schedule</Link></div>
          <div className="row" style={{marginBottom:10,flexWrap:'wrap',gap:7}}>
            {(['critical','delayed','blockers'] as FollowupView[]).map(view=><button type="button" key={view} onClick={()=>setFollowupView(view)} className="button" style={{padding:'7px 10px',fontSize:12,background:followupView===view?'var(--navy)':'var(--surface)',color:followupView===view?'#fff':'var(--text)'}}>{view==='critical'?'ทั้งหมดที่ต้องติดตาม':view==='delayed'?`Delayed ${delayedTotal}`:`Blockers ${blockersTotal}`}</button>)}
          </div>
          <div className="stack">{followupTasks.length ? followupTasks.map(t=><div className="list-row" key={t.id}>
            <div style={{minWidth:0}}>
              <b>{t.task_name}</b>
              <small>{projects.find(p=>p.id===t.project_id)?.code} • {t.area||'-'} • จบตามแผน {dateTH(t.planned_end)} • Actual {pct(t.actual_progress)}</small>
              {t.blocker && <p><b style={{display:'inline',fontSize:12,color:'var(--red)'}}>ปัญหา:</b> {t.blocker}</p>}
              {t.next_action && <p><b style={{display:'inline',fontSize:12,color:'var(--blue)'}}>งานถัดไป:</b> {t.next_action}</p>}
              {!t.blocker && !t.next_action && <p>ยังไม่ระบุรายละเอียดติดตาม</p>}
            </div>
            <div className="right"><StatusBadge value={t.site_status}/><small className={(t.delay_days||0)>0?'danger-text':''}>ล่าช้า {t.delay_days||0} วัน</small><Link href={`/projects/${t.project_id}`} style={{fontSize:11,color:'var(--blue)',fontWeight:700}}>เปิด Plot →</Link></div>
          </div>) : <p className="muted">ไม่มีรายการในหมวดนี้</p>}</div>
        </section>

        <section className="panel"><div className="panel-head"><h2>Purchasing Follow-up</h2><Link href="/procurement">ดูทั้งหมด</Link></div>
          <div className="stack">{proc.slice(0,8).map(x=><div className="list-row" key={x.id}><div><b>{x.item_name}</b><small>{x.vendor||'ยังไม่ระบุผู้ขาย'} • กำหนดส่ง: {x.expected_delivery_text||'ยังไม่ระบุ'}</small></div><StatusBadge value={x.current_status}/></div>)}</div>
        </section>
      </div>
    </>}
  </AppShell>
}
