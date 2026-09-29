'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import BrandLogo from '@/components/BrandLogo'
import type { Project, ScheduleTask } from '@/lib/types'

type ProcurementItem={
  id:string; project_id:string|null; vendor:string|null; item_name:string; current_status:string|null;
  po_no:string|null; expected_delivery:string|null; expected_delivery_text:string|null; created_at:string|null
}
type CondoRoom={room_no:string;building:string;customer_status:string;status_group:string|null;source_modified_at:string|null}
type RankedTask={task:ScheduleTask;project:Project|null;score:number;dueDays:number|null;targetDays:number|null}
type RankedProc={item:ProcurementItem;project:Project|null;score:number;dueDays:number|null}

const TZ='Asia/Bangkok'
const CLOSED_PROC=/(ส่งของแล้ว|รับของแล้ว|ปิดงาน|เสร็จสมบูรณ์|complete|completed|closed)/i
const FOLLOW_PROC=/(ขอ ETA|ขอวัน|ยืนยัน|รอยืนยัน|รอเช็ก|ต้องยืนยัน|รอสินค้า|รอส่ง|รอผลิต|นัดเข้า|มัดจำ|รอวัสดุ)/i

function bangkokDateKey(d=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d)
  const value=(type:string)=>parts.find(x=>x.type===type)?.value||''
  return `${value('year')}-${value('month')}-${value('day')}`
}
function parseDateKey(value:string|null|undefined){
  if(!value)return null
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if(!m)return null
  return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]))
}
function daysFromToday(value:string|null|undefined,today=bangkokDateKey()){
  const a=parseDateKey(today),b=parseDateKey(value)
  if(a===null||b===null)return null
  return Math.round((b-a)/86400000)
}
function pct(value:number|null|undefined){return `${Math.round((Number(value)||0)*100)}%`}
function shortDate(value:string|null|undefined){
  const ms=parseDateKey(value); if(ms===null)return '-'
  return new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'2-digit',month:'short'}).format(new Date(ms))
}
function dateTimeEN(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value); if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)
}
function dueText(days:number|null,date:string|null|undefined,fallback?:string|null){
  if(days===null)return fallback?.trim()|| (date?shortDate(date):'DATE TBC')
  if(days<0)return `${Math.abs(days)}D OVERDUE`
  if(days===0)return 'DUE TODAY'
  if(days===1)return 'DUE TOMORROW'
  return `IN ${days} DAYS`
}
function projectCode(project:Project|null){return project?.code||'COMMON'}
function compact(value:string|null|undefined,max=62){
  const text=(value||'').replace(/\s+/g,' ').trim()
  return text.length>max?`${text.slice(0,max-1)}…`:text
}

function scoreTask(task:ScheduleTask,project:Project|null,today:string):RankedTask{
  const dueDays=daysFromToday(task.planned_end,today)
  const targetDays=daysFromToday(task.target_close,today)
  const handoverDays=daysFromToday(project?.target_handover,today)
  const startDays=daysFromToday(task.planned_start,today)
  const hasBlocker=Boolean(task.blocker?.trim())
  const hasAction=Boolean(task.next_action?.trim())
  let score=0
  if(hasBlocker)score+=55
  if(hasAction)score+=12
  if(targetDays!==null){
    if(targetDays<0)score+=55
    else if(targetDays===0)score+=50
    else if(targetDays<=3)score+=38
    else if(targetDays<=7)score+=24
  }
  if(dueDays!==null){
    if(dueDays<0)score+=Math.min(35,18+Math.min(17,Math.abs(dueDays)))
    else if(dueDays===0)score+=30
    else if(dueDays<=3)score+=20
    else if(dueDays<=7)score+=12
  }
  if(startDays===0)score+=18
  if(handoverDays!==null&&handoverDays>=0&&handoverDays<=35)score+=15
  if(dueDays!==null&&dueDays < -60&&!hasBlocker&&!hasAction&&targetDays===null)score-=80
  return {task,project,score,dueDays,targetDays}
}

function scoreProc(item:ProcurementItem,project:Project|null,today:string):RankedProc{
  const dueDays=daysFromToday(item.expected_delivery,today)
  const handoverDays=daysFromToday(project?.target_handover,today)
  const status=`${item.current_status||''} ${item.expected_delivery_text||''}`
  let score=0
  if(dueDays!==null){
    if(dueDays<0)score+=55
    else if(dueDays===0)score+=50
    else if(dueDays<=3)score+=40
    else if(dueDays<=7)score+=28
    else if(dueDays<=14)score+=12
  }
  if(FOLLOW_PROC.test(status))score+=30
  if(!item.expected_delivery&&/(ขอ ETA|ขอวัน|ยืนยัน|รอยืนยัน|รอเช็ก|ต้องยืนยัน)/i.test(status))score+=18
  if(handoverDays!==null&&handoverDays>=0&&handoverDays<=35)score+=10
  return {item,project,score,dueDays}
}

function TaskRow({x}:{x:RankedTask}){
  const {task,project}=x
  const date=task.target_close||task.planned_end
  const d=task.target_close?x.targetDays:x.dueDays
  const signal=task.next_action?.trim()||task.blocker?.trim()||task.site_status||'Follow up progress'
  return <div className="work-row">
    <span className={`signal ${task.blocker?.trim()?'red':'amber'}`}/>
    <b className="code">{projectCode(project)}</b>
    <div className="row-copy"><strong>{compact(task.task_name,48)}</strong><small>{compact(signal,72)}</small></div>
    <div className="row-status"><b>{pct(task.actual_progress)}</b><span className={d!==null&&d<=0?'late':''}>{dueText(d,date)}</span></div>
  </div>
}

function ProcurementRow({x}:{x:RankedProc}){
  const {item,project}=x
  return <div className="work-row">
    <span className={`signal ${x.dueDays!==null&&x.dueDays<=0?'red':'blue'}`}/>
    <b className="code">{projectCode(project)}</b>
    <div className="row-copy"><strong>{compact(item.item_name,48)}</strong><small>{compact(item.current_status||'Follow up procurement status',72)}{item.po_no?` · ${item.po_no}`:''}</small></div>
    <div className="row-status"><b>{compact(item.vendor?.replace(/\s*\(.*$/,'')||'SUPPLIER',18)}</b><span className={x.dueDays!==null&&x.dueDays<=0?'late':''}>{dueText(x.dueDays,item.expected_delivery,item.expected_delivery_text)}</span></div>
  </div>
}

function DefectTile({label,value,tone,sub}:{label:string;value:number;tone:string;sub:string}){
  return <div className={`defect-tile ${tone}`}><span>{label}</span><b>{value}</b><small>{sub}</small></div>
}

export default function WallpaperPage(){
  const router=useRouter()
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<ScheduleTask[]>([])
  const [proc,setProc]=useState<ProcurementItem[]>([])
  const [rooms,setRooms]=useState<CondoRoom[]>([])
  const [latestSync,setLatestSync]=useState<string|null>(null)
  const [profileName,setProfileName]=useState('Golf')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [now,setNow]=useState(new Date())

  const load=useCallback(async()=>{
    setError('')
    try{
      const s=getSupabase()
      const {data:{user}}=await s.auth.getUser()
      if(!user){router.replace('/login');return}
      const profile=await s.from('profiles').select('full_name,active').eq('user_id',user.id).maybeSingle()
      if(profile.error||!profile.data?.active){router.replace('/login');return}
      setProfileName(profile.data.full_name||'Golf')
      const [p,t,pr,r,sync]=await Promise.all([
        s.from('projects').select('id,code,name,site_group,target_handover,active,sort_order').eq('active',true).order('sort_order'),
        s.from('v_schedule_tasks').select('id,project_id,source_task_no,category,task_name,area,planned_start,planned_end,current_plan_progress,actual_progress,current_variance,delay_days,site_status,actual_start,actual_end,blocker,next_action,target_close,contractor'),
        s.from('procurement_items').select('id,project_id,vendor,item_name,current_status,po_no,expected_delivery,expected_delivery_text,created_at').order('created_at',{ascending:false}),
        s.from('condo_room_status').select('room_no,building,customer_status,status_group,source_modified_at').order('room_no'),
        s.from('drive_sync_runs').select('created_at').eq('status','success').order('created_at',{ascending:false}).limit(1).maybeSingle(),
      ])
      if(p.error)throw p.error
      if(t.error)throw t.error
      if(pr.error)throw pr.error
      if(r.error)throw r.error
      setProjects((p.data||[]) as Project[])
      setTasks((t.data||[]) as ScheduleTask[])
      setProc((pr.data||[]) as ProcurementItem[])
      setRooms((r.data||[]) as CondoRoom[])
      const roomLatest=(r.data||[]).map(x=>x.source_modified_at).filter(Boolean).sort().at(-1)||null
      const syncLatest=sync.data?.created_at||null
      setLatestSync([roomLatest,syncLatest].filter(Boolean).sort().at(-1)||null)
      setLoading(false)
    }catch(e){setError(e instanceof Error?e.message:'Data load failed');setLoading(false)}
  },[router])

  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),5*60*1000);return()=>window.clearInterval(timer)},[load])
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60*1000);return()=>window.clearInterval(timer)},[])

  const today=bangkokDateKey(now)
  const projectMap=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects])
  const rankedTasks=useMemo(()=>tasks.filter(t=>t.source_task_no!=='1'&&(Number(t.actual_progress)||0)<0.999).map(t=>scoreTask(t,projectMap.get(t.project_id)||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||((a.targetDays??a.dueDays??999)-(b.targetDays??b.dueDays??999))),[tasks,projectMap,today])
  const critical=useMemo(()=>rankedTasks.filter(x=>Boolean(x.task.blocker?.trim())||(x.targetDays!==null&&x.targetDays<=1)||(x.dueDays!==null&&x.dueDays<=0&&Boolean(x.task.next_action?.trim()))).slice(0,4),[rankedTasks])
  const criticalIds=useMemo(()=>new Set(critical.map(x=>x.task.id)),[critical])
  const dueSoon=useMemo(()=>rankedTasks.filter(x=>!criticalIds.has(x.task.id)&&((x.targetDays!==null&&x.targetDays>=0&&x.targetDays<=7)||(x.dueDays!==null&&x.dueDays>=0&&x.dueDays<=7))).slice(0,5),[rankedTasks,criticalIds])
  const rankedProc=useMemo(()=>proc.filter(x=>!CLOSED_PROC.test(x.current_status||'')).map(x=>scoreProc(x,projectMap.get(x.project_id||'')||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,4),[proc,projectMap,today])
  const handovers=useMemo(()=>projects.map(p=>({project:p,days:daysFromToday(p.target_handover,today)})).filter(x=>x.days!==null&&x.days>=0&&x.days<=45).sort((a,b)=>(a.days??999)-(b.days??999)).slice(0,3),[projects,today])

  const defect=useMemo(()=>{
    const count=(group:string)=>rooms.filter(r=>r.status_group===group).length
    return {
      incomplete:count('Hotel - Incomplete'),
      awaitingCheck:count('Hotel - Awaiting Check'),
      pendingHandover:count('Non-Hotel - Pending Handover'),
      hotelDone:count('Hotel - Checked Complete'),
      handoverDone:count('Non-Hotel - Handover Complete'),
    }
  },[rooms])

  const blockerCount=rankedTasks.filter(x=>Boolean(x.task.blocker?.trim())).length
  const delayedCount=tasks.filter(t=>t.source_task_no!=='1'&&(Number(t.actual_progress)||0)<0.999&&(Number(t.delay_days)||0)>0).length
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'2-digit',hour12:false}).format(now))
  const mode=hour<12?'MORNING CONTROL':hour<17?'AFTERNOON FOLLOW-UP':'CLOSING CHECK'
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,weekday:'short',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(now)
  const pageState=loading?'loading':error?'error':'ready'

  return <main className="wallpaper" data-wallpaper-state={pageState}>
    <aside className="brand-rail">
      <div className="brand-lockup"><BrandLogo className="brand-logo"/><div><b>3 Kings<br/>Construction</b><span>Site Report V3.4</span></div></div>
      <div className="rail-rule"/>
      <div className="rail-copy"><span>DESKTOP</span><span>COMMAND</span><span>WORKSPACE</span></div>
      <div className="rail-footer">PEOPLE · PLAN · EXECUTE · DELIVER</div>
    </aside>

    <section className="command">
      <header className="hero">
        <div className="hero-copy"><span className="eyebrow">LIVE SITE COMMAND · {mode}</span><h1>TODAY&apos;S <em>COMMAND CENTER</em></h1><p>Priority control for schedule, procurement, handover and defect follow-up · {profileName}</p></div>
        <div className="hero-right"><div className="live"><i/><span>DATA STATUS</span><b>{loading?'LOADING':error?'CHECK':'LIVE'}</b><small>{error?compact(error,34):`Updated ${dateTimeEN(latestSync)}`}</small></div><div className="clock"><span>{clock.split(',')[0]}</span><b>{new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(now)}</b><small>{clock.split(',').slice(1).join(',').trim()}</small></div></div>
      </header>

      {loading?<div className="center-state"><b>BUILDING TODAY&apos;S PRIORITY LIST…</b><span>Schedule · Procurement · Handover · Defect</span></div>:error?<div className="center-state error"><b>WALLPAPER UPDATE PAUSED</b><span>{error}</span></div>:<>
        <section className="kpi-strip">
          <div className="kpi danger"><span>CRITICAL</span><b>{critical.length}</b><small>Need action first</small></div>
          <div className="kpi amber"><span>OPEN BLOCKERS</span><b>{blockerCount}</b><small>Active dependencies</small></div>
          <div className="kpi gold"><span>DUE THIS WEEK</span><b>{dueSoon.length}</b><small>Next 7 days</small></div>
          <div className="kpi blue"><span>PROCUREMENT</span><b>{rankedProc.length}</b><small>Priority follow-up</small></div>
          <div className="kpi green"><span>DELAYED TASKS</span><b>{delayedCount}</b><small>Open schedule delay</small></div>
        </section>

        <div className="dashboard-grid">
          <section className="panel critical-panel"><div className="panel-head"><div><span>01</span><b>CRITICAL FOLLOW-UP / BLOCKERS</b></div><small>{critical.length} ITEMS</small></div><div className="rows">{critical.length?critical.map(x=><TaskRow key={x.task.id} x={x}/>):<div className="empty">NO CRITICAL ITEMS</div>}</div></section>
          <section className="panel procurement-panel"><div className="panel-head"><div><span>02</span><b>PROCUREMENT FOLLOW-UP</b></div><small>{rankedProc.length} ITEMS</small></div><div className="rows">{rankedProc.length?rankedProc.map(x=><ProcurementRow key={x.item.id} x={x}/>):<div className="empty">NO PRIORITY PROCUREMENT</div>}</div></section>

          <section className="panel due-panel"><div className="panel-head"><div><span>03</span><b>DUE SOON / KEY WORKS</b></div><small>NEXT 7 DAYS</small></div><div className="rows compact-rows">{dueSoon.length?dueSoon.map(x=><TaskRow key={x.task.id} x={x}/>):<div className="empty">NO DUE-SOON ITEMS</div>}</div>{handovers.length>0&&<div className="handover-line"><b>HANDOVER COUNTDOWN</b>{handovers.map(x=><span key={x.project.id}><strong>{x.project.code}</strong> {x.days}D · {shortDate(x.project.target_handover)}</span>)}</div>}</section>

          <section className="panel defect-panel"><div className="panel-head"><div><span>04</span><b>CONDO HANDOVER / DEFECT</b></div><small>LIVE ROOM STATUS</small></div><div className="defect-grid"><DefectTile label="DEFECT INCOMPLETE" value={defect.incomplete} tone="red" sub="ROOMS"/><DefectTile label="AWAITING HOTEL CHECK" value={defect.awaitingCheck} tone="amber" sub="ROOMS"/><DefectTile label="PENDING HANDOVER" value={defect.pendingHandover} tone="blue" sub="ROOMS"/><DefectTile label="HOTEL CHECKED" value={defect.hotelDone} tone="teal" sub="ROOMS"/><DefectTile label="HANDOVER COMPLETE" value={defect.handoverDone} tone="green" sub="ROOMS"/></div><div className="defect-note"><span>Compact status view — all five categories remain visible on one screen.</span><b>{rooms.length} TOTAL ROOMS</b></div></section>
        </div>
      </>}

      <footer><span>DISCIPLINE · PROGRESS · QUALITY · SAFETY · ON TIME</span><b>3 KINGS CONSTRUCTION</b><small>Auto refresh every 5 min · Desktop image sync every 15 min</small></footer>
    </section>

    <style jsx global>{`
      html,body{margin:0!important;width:100%;height:100%;overflow:hidden;background:#07111f!important}.wallpaper{width:100vw;height:100vh;min-width:1280px;min-height:720px;display:grid;grid-template-columns:290px minmax(0,1fr);overflow:hidden;color:#eef5ff;background:radial-gradient(circle at 75% 0%,rgba(32,88,137,.28),transparent 38%),linear-gradient(135deg,#07111f 0%,#09182b 44%,#06101c 100%);font-family:inherit}.brand-rail{position:relative;padding:28px 24px 22px;border-right:1px solid rgba(230,188,91,.45);background:linear-gradient(180deg,rgba(5,14,27,.98),rgba(7,20,35,.92));display:flex;flex-direction:column}.brand-rail:after{content:'';position:absolute;inset:0;background:radial-gradient(circle at 0 55%,rgba(22,104,166,.18),transparent 43%);pointer-events:none}.brand-lockup{display:flex;align-items:center;gap:14px;position:relative;z-index:1}.brand-logo{width:74px!important;height:74px!important;object-fit:contain;display:block;border-radius:50%;flex:0 0 auto}.brand-lockup b{font-size:20px;line-height:1.08;color:#fff;letter-spacing:.01em}.brand-lockup span{display:block;margin-top:7px;font-size:13px;color:#9caabc}.rail-rule{height:1px;background:linear-gradient(90deg,rgba(229,189,104,.9),transparent);margin:26px 0 36px}.rail-copy{margin-top:120px;display:grid;gap:14px;color:#8497ac;letter-spacing:.38em;font-size:11px}.rail-footer{margin-top:auto;color:#b4975d;font-size:8px;letter-spacing:.18em;line-height:1.7;position:relative;z-index:1}.command{min-width:0;padding:26px 30px 20px;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:12px}.hero{display:flex;justify-content:space-between;gap:22px;align-items:flex-start}.hero-copy{min-width:0}.eyebrow{font-size:11px;letter-spacing:.34em;color:#dfb85d;font-weight:800}.hero h1{font-size:42px;line-height:.98;margin:9px 0 8px;letter-spacing:-.035em;color:#fff}.hero h1 em{font-style:normal;color:#edc66d}.hero p{margin:0;color:#a9b8ca;font-size:13px}.hero-right{display:flex;gap:12px;align-items:stretch}.live,.clock{border:1px solid rgba(226,188,101,.35);border-radius:13px;background:rgba(10,26,44,.82);min-width:196px;padding:10px 14px}.live{display:grid;grid-template-columns:14px 1fr;column-gap:9px;align-items:center}.live i{width:11px;height:11px;border-radius:50%;background:#3ce69a;box-shadow:0 0 18px rgba(60,230,154,.65);grid-row:1/4}.live span,.clock span{font-size:9px;letter-spacing:.16em;color:#9caec2}.live b{font-size:22px;color:#55e5a7}.live small,.clock small{font-size:9px;color:#b7c2cf}.clock{text-align:right;min-width:164px}.clock b{display:block;font-size:30px;line-height:1;color:#fff;margin:3px 0}.kpi-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.kpi{min-width:0;border:1px solid rgba(100,132,164,.32);border-radius:13px;padding:10px 14px;background:linear-gradient(180deg,rgba(16,38,61,.9),rgba(9,25,43,.86));box-shadow:inset 0 3px 0 var(--tone);display:grid;grid-template-columns:1fr auto;align-items:end}.kpi span{font-size:10px;letter-spacing:.09em;font-weight:800;color:#cad5e0}.kpi b{font-size:28px;color:var(--tone);line-height:1;grid-row:1/3;grid-column:2}.kpi small{font-size:9px;color:#7f93a9;margin-top:5px}.kpi.danger{--tone:#ff5d68}.kpi.amber{--tone:#ff9d43}.kpi.gold{--tone:#e9c05f}.kpi.blue{--tone:#3caef1}.kpi.green{--tone:#3bd08a}.dashboard-grid{min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:12px}.panel{min-height:0;border:1px solid rgba(83,126,167,.45);border-radius:14px;background:linear-gradient(180deg,rgba(10,30,50,.91),rgba(6,20,35,.94));overflow:hidden;display:flex;flex-direction:column;box-shadow:0 14px 38px rgba(0,0,0,.18)}.critical-panel{border-color:rgba(255,91,103,.55)}.procurement-panel{border-color:rgba(57,169,241,.55)}.due-panel{border-color:rgba(230,190,86,.55)}.defect-panel{border-color:rgba(54,200,137,.5)}.panel-head{height:44px;flex:0 0 44px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(119,148,177,.2);background:rgba(5,19,33,.6)}.panel-head>div{display:flex;align-items:center;gap:10px}.panel-head span{font-size:13px;color:#e6bf61;font-weight:900}.panel-head b{font-size:13px;letter-spacing:.055em;color:#f8fbff}.panel-head small{font-size:8px;letter-spacing:.16em;color:#8da1b8}.rows{min-height:0;overflow:hidden;display:flex;flex-direction:column}.work-row{min-height:48px;flex:1;display:grid;grid-template-columns:8px 60px minmax(0,1fr) 122px;gap:9px;align-items:center;padding:6px 13px;border-bottom:1px solid rgba(119,148,177,.13)}.work-row:last-child{border-bottom:0}.signal{width:6px;height:26px;border-radius:999px}.signal.red{background:#ff5b67;box-shadow:0 0 12px rgba(255,91,103,.45)}.signal.amber{background:#e7bd57}.signal.blue{background:#3caef1}.code{font-size:11px;color:#fff;border:1px solid rgba(100,132,164,.4);border-radius:7px;padding:5px 6px;text-align:center;background:rgba(255,255,255,.035)}.row-copy{min-width:0}.row-copy strong{font-size:11px;color:#ecf4fb;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-copy small{font-size:9px;color:#8ea3b7;display:block;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-status{text-align:right;min-width:0}.row-status b{display:block;font-size:8.5px;color:#b6c3d0;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-status span{display:inline-block;margin-top:4px;padding:3px 6px;border-radius:6px;background:rgba(232,189,82,.12);color:#e8c464;font-size:8px;font-weight:800;white-space:nowrap}.row-status span.late{background:rgba(255,77,91,.12);color:#ff7780}.compact-rows .work-row{min-height:40px}.handover-line{margin-top:auto;min-height:34px;padding:6px 13px;display:flex;align-items:center;gap:10px;border-top:1px solid rgba(230,190,86,.23);background:rgba(229,189,104,.055);font-size:8.5px;color:#aebac7}.handover-line>b{color:#e6c268;letter-spacing:.08em;margin-right:auto}.handover-line span{white-space:nowrap}.handover-line strong{color:#fff}.defect-grid{padding:13px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;min-height:0;flex:1;align-items:stretch}.defect-tile{--tone:#7b91a8;min-width:0;border:1px solid color-mix(in srgb,var(--tone) 62%,transparent);border-radius:10px;padding:11px 10px;background:linear-gradient(180deg,color-mix(in srgb,var(--tone) 18%,rgba(10,25,42,.95)),rgba(7,21,37,.95));display:flex;flex-direction:column;justify-content:center;overflow:hidden}.defect-tile span{font-size:8.5px;line-height:1.18;min-height:21px;color:#dbe5ef;font-weight:800;letter-spacing:.03em}.defect-tile b{font-size:30px;line-height:1;color:var(--tone);margin:7px 0 5px}.defect-tile small{font-size:8px;color:#8599ad;letter-spacing:.12em}.defect-tile.red{--tone:#ff5b67}.defect-tile.amber{--tone:#e9ac45}.defect-tile.blue{--tone:#42aef1}.defect-tile.teal{--tone:#36c6ba}.defect-tile.green{--tone:#3bd08a}.defect-note{height:28px;flex:0 0 28px;padding:0 13px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(119,148,177,.16);font-size:8px;color:#8195aa}.defect-note b{color:#b7c7d5;letter-spacing:.08em}.empty{height:100%;display:grid;place-items:center;color:#668096;font-size:10px;letter-spacing:.18em}.center-state{grid-row:2/4;display:grid;place-content:center;text-align:center;gap:9px;color:#91a6ba}.center-state b{font-size:18px;color:#fff}.center-state.error b{color:#ff7c84}footer{height:20px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;font-size:7.5px;letter-spacing:.12em;color:#687f95}footer b{color:#c6a95f;letter-spacing:.16em}footer small{text-align:right;font-size:7.5px}@media(max-width:1500px){.wallpaper{grid-template-columns:230px minmax(0,1fr)}.brand-logo{width:60px!important;height:60px!important}.brand-lockup b{font-size:17px}.brand-lockup span{font-size:11px}.command{padding:20px 22px 14px}.hero h1{font-size:34px}.hero p{font-size:11px}.live,.clock{min-width:150px;padding:8px 10px}.kpi{padding:8px 10px}.kpi b{font-size:24px}.panel-head b{font-size:11px}.work-row{grid-template-columns:7px 52px minmax(0,1fr) 105px;padding:4px 9px}.defect-grid{padding:9px;gap:6px}.defect-tile{padding:8px}.defect-tile b{font-size:24px}.rail-copy{margin-top:90px}}`}</style>
  </main>
}
