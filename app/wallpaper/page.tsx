'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
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
  return new Intl.DateTimeFormat('th-TH',{timeZone:'UTC',day:'numeric',month:'short'}).format(new Date(ms))
}
function timeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value); if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:TZ,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}
function dueText(days:number|null,date:string|null|undefined){
  if(days===null)return date?shortDate(date):'ไม่มีวันที่'
  if(days<0)return `เกิน ${Math.abs(days)} วัน`
  if(days===0)return 'วันนี้'
  if(days===1)return 'พรุ่งนี้'
  return `อีก ${days} วัน`
}
function projectCode(project:Project|null){return project?.code||'ส่วนกลาง'}

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
  // Old schedule rows without any current signal are not useful as a daily command list.
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
  return <div className="work-row">
    <span className={`priority-dot ${task.blocker?.trim()?'danger':'warn'}`}/>
    <div className="work-copy"><div className="work-title"><b>{projectCode(project)}</b><span>{task.task_name}</span></div><small>{task.next_action?.trim()||task.blocker?.trim()||task.site_status||'ติดตามความคืบหน้า'}</small></div>
    <div className="work-meta"><strong>{pct(task.actual_progress)}</strong><span className={d!==null&&d<=0?'late':''}>{dueText(d,date)}</span></div>
  </div>
}
function ProcurementRow({x}:{x:RankedProc}){
  const {item,project}=x
  return <div className="work-row procurement-row">
    <span className={`priority-dot ${x.dueDays!==null&&x.dueDays<=0?'danger':'blue'}`}/>
    <div className="work-copy"><div className="work-title"><b>{projectCode(project)}</b><span>{item.item_name}</span></div><small>{item.current_status||'ติดตามสถานะ'}{item.po_no?` • ${item.po_no}`:''}</small></div>
    <div className="work-meta"><strong>{item.vendor?.replace(/\s*\(.*$/,'')||'Supplier'}</strong><span className={x.dueDays!==null&&x.dueDays<=0?'late':''}>{dueText(x.dueDays,item.expected_delivery)||item.expected_delivery_text||'-'}</span></div>
  </div>
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
    }catch(e){setError(e instanceof Error?e.message:'โหลดข้อมูลไม่สำเร็จ');setLoading(false)}
  },[router])

  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),5*60*1000);return()=>window.clearInterval(timer)},[load])
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60*1000);return()=>window.clearInterval(timer)},[])

  const today=bangkokDateKey(now)
  const projectMap=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects])
  const rankedTasks=useMemo(()=>tasks
    .filter(t=>t.source_task_no!=='1'&&(Number(t.actual_progress)||0)<0.999)
    .map(t=>scoreTask(t,projectMap.get(t.project_id)||null,today))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||((a.targetDays??a.dueDays??999)-(b.targetDays??b.dueDays??999))),[tasks,projectMap,today])
  const critical=useMemo(()=>rankedTasks.filter(x=>Boolean(x.task.blocker?.trim())||(x.targetDays!==null&&x.targetDays<=1)||(x.dueDays!==null&&x.dueDays<=0&&Boolean(x.task.next_action?.trim()))).slice(0,6),[rankedTasks])
  const criticalIds=useMemo(()=>new Set(critical.map(x=>x.task.id)),[critical])
  const dueSoonTasks=useMemo(()=>rankedTasks.filter(x=>!criticalIds.has(x.task.id)&&((x.targetDays!==null&&x.targetDays>=0&&x.targetDays<=7)||(x.dueDays!==null&&x.dueDays>=0&&x.dueDays<=7))).slice(0,4),[rankedTasks,criticalIds])
  const handovers=useMemo(()=>projects.map(p=>({project:p,days:daysFromToday(p.target_handover,today)})).filter(x=>x.days!==null&&x.days>=0&&x.days<=45).sort((a,b)=>(a.days??999)-(b.days??999)).slice(0,3),[projects,today])
  const rankedProc=useMemo(()=>proc.filter(x=>!CLOSED_PROC.test(x.current_status||'')).map(x=>scoreProc(x,projectMap.get(x.project_id||'')||null,today)).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6),[proc,projectMap,today])

  const defect=useMemo(()=>{
    const count=(group:string)=>rooms.filter(r=>r.status_group===group).length
    return {
      incomplete:count('Hotel - Incomplete'),
      awaitingCheck:count('Hotel - Awaiting Check'),
      pendingHandover:count('Non-Hotel - Pending Handover'),
      hotelDone:count('Hotel - Checked Complete'),
      handoverDone:count('Non-Hotel - Handover Complete'),
      total:rooms.length,
    }
  },[rooms])
  const blockerCount=rankedTasks.filter(x=>Boolean(x.task.blocker?.trim())).length
  const delayedCount=tasks.filter(t=>t.source_task_no!=='1'&&(Number(t.actual_progress)||0)<0.999&&(Number(t.delay_days)||0)>0).length
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'2-digit',hour12:false}).format(now))
  const mode=hour<12?'MORNING CONTROL':hour<17?'AFTERNOON FOLLOW-UP':'CLOSING CHECK'
  const clock=new Intl.DateTimeFormat('th-TH',{timeZone:TZ,weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(now)
  const pageState=loading?'loading':error?'error':'ready'

  return <main className="wallpaper" data-wallpaper-state={pageState}>
    <aside className="icon-gutter"><div className="gutter-brand"><span>3K</span><small>3 KINGS<br/>CONSTRUCTION</small></div><div className="gutter-line"/><p>LIVE<br/>WORK<br/>CONTROL</p></aside>
    <section className="command">
      <header>
        <div><span className="eyebrow">DYNAMIC WORK WALLPAPER · {mode}</span><h1>วันนี้ต้องคุมอะไรบ้าง</h1><p>{clock} · {profileName}</p></div>
        <div className="sync-box"><span>DATA STATUS</span><b>{loading?'LOADING':error?'CHECK REQUIRED':'LIVE'}</b><small>{error?error:`อัปเดตล่าสุด ${timeTH(latestSync)}`}</small></div>
      </header>

      {loading?<div className="center-state"><b>กำลังจัดลำดับงานจากข้อมูลล่าสุด…</b><span>Schedule · Procurement · Defect · Handover</span></div>:error?<div className="center-state error"><b>ยังไม่เปลี่ยน Wallpaper</b><span>{error}</span></div>:<>
        <div className="grid">
          <section className="card critical-card"><div className="card-head"><div><span className="number">01</span><div><b>CRITICAL / BLOCKER</b><small>สิ่งที่ควรตามก่อน เพื่อไม่ให้งานต่อเนื่องติด</small></div></div><strong>{critical.length}</strong></div><div className="rows">{critical.length?critical.map(x=><TaskRow key={x.task.id} x={x}/>):<div className="empty">ไม่มี Critical Item จากข้อมูลปัจจุบัน</div>}</div></section>
          <section className="card"><div className="card-head"><div><span className="number">02</span><div><b>PROCUREMENT FOLLOW-UP</b><small>PO / Supplier / Delivery ที่ยังต้องยืนยัน</small></div></div><strong>{rankedProc.length}</strong></div><div className="rows">{rankedProc.length?rankedProc.map(x=><ProcurementRow key={x.item.id} x={x}/>):<div className="empty">ไม่มีรายการจัดซื้อที่ต้องตาม</div>}</div></section>
          <section className="card"><div className="card-head"><div><span className="number">03</span><div><b>DUE SOON / HANDOVER</b><small>งาน 7 วันข้างหน้า + วันส่งมอบที่กำลังเข้าใกล้</small></div></div><strong>{dueSoonTasks.length+handovers.length}</strong></div><div className="rows compact-rows">{handovers.map(x=><div className="handover-row" key={x.project.id}><span className="priority-dot gold"/><div><b>{x.project.code} · HANDOVER</b><small>{x.project.name}</small></div><strong>{dueText(x.days,x.project.target_handover)}</strong></div>)}{dueSoonTasks.map(x=><TaskRow key={x.task.id} x={x}/>)}{!handovers.length&&!dueSoonTasks.length&&<div className="empty">ไม่มีงาน Due ภายใน 7 วัน</div>}</div></section>
          <section className="card defect-card"><div className="card-head"><div><span className="number">04</span><div><b>CONDO · HANDOVER / DEFECT</b><small>สถานะปลายทางที่ต้องติดตามจากข้อมูลห้องล่าสุด</small></div></div><strong>{defect.incomplete+defect.awaitingCheck+defect.pendingHandover}</strong></div><div className="defect-grid"><div className="defect-kpi danger"><span>Defect ยังไม่เสร็จ</span><b>{defect.incomplete}</b><small>ห้อง</small></div><div className="defect-kpi warn"><span>รอ Hotel ตรวจ</span><b>{defect.awaitingCheck}</b><small>ห้อง</small></div><div className="defect-kpi warn"><span>Pending Handover</span><b>{defect.pendingHandover}</b><small>ห้อง</small></div><div className="defect-kpi good"><span>Hotel ตรวจแล้ว</span><b>{defect.hotelDone}</b><small>ห้อง</small></div><div className="defect-kpi good"><span>Handover แล้ว</span><b>{defect.handoverDone}</b><small>ห้อง</small></div><div className="defect-kpi neutral"><span>Coverage</span><b>{defect.total}</b><small>ห้อง</small></div></div></section>
        </div>
        <footer><div><span>CRITICAL</span><b>{critical.length}</b></div><div><span>OPEN BLOCKERS</span><b>{blockerCount}</b></div><div><span>DELAYED TASKS</span><b>{delayedCount}</b></div><div><span>PURCHASING FOLLOW-UP</span><b>{rankedProc.length}</b></div><div><span>DEFECT INCOMPLETE</span><b>{defect.incomplete}</b></div><p>ระบบจัดลำดับจากข้อมูลจริง · รายการเก่าที่ไม่มี Action / Blocker จะไม่ดันขึ้น Critical</p></footer>
      </>}
    </section>

    <style jsx global>{`
      html,body{margin:0!important;width:100%;height:100%;overflow:hidden!important;background:#071321!important}*{box-sizing:border-box}.wallpaper{position:fixed;inset:0;display:grid;grid-template-columns:235px minmax(0,1fr);font-family:Inter,"Noto Sans Thai","Segoe UI",Tahoma,sans-serif;color:#eaf1f8;background:radial-gradient(circle at 77% 8%,rgba(48,93,132,.34),transparent 29%),linear-gradient(135deg,#071321 0%,#0c1c2d 56%,#081724 100%)}.icon-gutter{position:relative;padding:38px 30px;border-right:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,rgba(5,14,24,.55),rgba(5,14,24,.18));overflow:hidden}.icon-gutter:after{content:"";position:absolute;left:-80px;bottom:-110px;width:260px;height:260px;border:1px solid rgba(224,184,96,.14);border-radius:50%;box-shadow:0 0 0 34px rgba(224,184,96,.025),0 0 0 68px rgba(224,184,96,.018)}.gutter-brand{display:flex;gap:11px;align-items:center}.gutter-brand>span{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;border:1px solid rgba(229,190,107,.55);color:#efc96f;font-weight:900;font-size:17px;letter-spacing:-.04em;background:rgba(225,181,87,.07)}.gutter-brand small{font-size:9px;line-height:1.45;letter-spacing:.15em;color:#a8b8c9;font-weight:800}.gutter-line{height:1px;margin:28px 0;background:linear-gradient(90deg,rgba(229,190,107,.55),transparent)}.icon-gutter p{font-size:10px;line-height:1.75;letter-spacing:.28em;color:#60768c;font-weight:800}.command{height:100vh;padding:30px 34px 24px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:18px;min-width:0}header{display:flex;justify-content:space-between;align-items:flex-end;gap:28px}.eyebrow{font-size:10px;font-weight:850;letter-spacing:.16em;color:#e8c36b}h1{margin:6px 0 2px;font-size:31px;line-height:1.1;letter-spacing:-.035em;color:#fff}header p{margin:0;color:#879db2;font-size:11px}.sync-box{min-width:240px;text-align:right;padding:10px 0}.sync-box span{display:block;font-size:8px;letter-spacing:.18em;color:#71879d;font-weight:800}.sync-box b{display:block;margin:4px 0 2px;font-size:14px;letter-spacing:.08em;color:#66d4a0}.sync-box small{font-size:9px;color:#8196aa}.grid{display:grid;grid-template-columns:minmax(0,1.07fr) minmax(0,.93fr);grid-template-rows:minmax(0,1fr) minmax(0,.78fr);gap:14px;min-height:0}.card{min-height:0;display:flex;flex-direction:column;border:1px solid rgba(151,180,207,.15);border-radius:18px;background:linear-gradient(160deg,rgba(18,40,61,.92),rgba(11,29,45,.92));box-shadow:0 16px 50px rgba(0,0,0,.18);overflow:hidden}.critical-card{border-color:rgba(224,97,83,.26);background:linear-gradient(160deg,rgba(48,32,38,.95),rgba(15,30,44,.94))}.card-head{min-height:68px;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.018)}.card-head>div{display:flex;align-items:center;gap:11px;min-width:0}.number{width:30px;height:30px;flex:0 0 auto;display:grid;place-items:center;border-radius:9px;border:1px solid rgba(232,195,107,.28);color:#e9c46d;font-size:9px;font-weight:900;background:rgba(232,195,107,.05)}.card-head b{display:block;font-size:11px;letter-spacing:.075em;color:#f2f6fa}.card-head small{display:block;margin-top:3px;color:#70869b;font-size:8.5px}.card-head>strong{font-size:25px;line-height:1;color:#f0c86c;font-weight:850}.rows{padding:4px 14px 7px;overflow:hidden;min-height:0}.work-row{display:grid;grid-template-columns:9px minmax(0,1fr) 94px;gap:10px;align-items:center;min-height:47px;padding:7px 2px;border-bottom:1px solid rgba(255,255,255,.055)}.work-row:last-child{border-bottom:0}.priority-dot{width:7px;height:7px;border-radius:50%;background:#e0ac50;box-shadow:0 0 0 4px rgba(224,172,80,.07)}.priority-dot.danger{background:#e36d60;box-shadow:0 0 0 4px rgba(227,109,96,.08)}.priority-dot.blue{background:#65a9db;box-shadow:0 0 0 4px rgba(101,169,219,.07)}.priority-dot.gold{background:#e9c46d}.work-copy{min-width:0}.work-title{display:flex;gap:7px;align-items:baseline;min-width:0}.work-title b{flex:0 0 auto;font-size:9px;color:#e9c46d}.work-title span{font-size:10px;font-weight:750;color:#f2f5f8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.work-copy small{display:block;margin-top:3px;font-size:8.3px;line-height:1.25;color:#71889d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.work-meta{text-align:right;min-width:0}.work-meta strong{display:block;font-size:9px;color:#b9c8d5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.work-meta span{display:block;margin-top:3px;font-size:8px;color:#e1b963;font-weight:800}.work-meta span.late{color:#ee8074}.procurement-row{grid-template-columns:9px minmax(0,1fr) 112px}.compact-rows .work-row{min-height:43px}.handover-row{display:grid;grid-template-columns:9px minmax(0,1fr) 86px;gap:10px;align-items:center;min-height:43px;padding:7px 2px;border-bottom:1px solid rgba(255,255,255,.055)}.handover-row>div b{display:block;font-size:9px;color:#efca72}.handover-row>div small{display:block;margin-top:2px;color:#70869b;font-size:8px}.handover-row>strong{text-align:right;color:#efca72;font-size:9px}.defect-grid{padding:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:9px;min-height:0}.defect-kpi{position:relative;min-height:79px;border-radius:13px;border:1px solid rgba(255,255,255,.08);padding:11px 12px;background:rgba(255,255,255,.025);overflow:hidden}.defect-kpi:after{content:"";position:absolute;right:-14px;bottom:-18px;width:55px;height:55px;border-radius:50%;background:currentColor;opacity:.045}.defect-kpi span{display:block;font-size:8px;color:#8fa1b2;font-weight:700}.defect-kpi b{display:inline-block;margin-top:8px;font-size:25px;line-height:1;color:#fff}.defect-kpi small{margin-left:5px;font-size:8px;color:#6f8498}.defect-kpi.danger{color:#e36d60;border-color:rgba(227,109,96,.2)}.defect-kpi.warn{color:#e2ad52;border-color:rgba(226,173,82,.18)}.defect-kpi.good{color:#59bd88;border-color:rgba(89,189,136,.17)}.defect-kpi.neutral{color:#879bad}.empty{padding:26px 8px;text-align:center;color:#6d8296;font-size:9px}footer{height:62px;display:grid;grid-template-columns:repeat(5,minmax(100px,1fr)) minmax(260px,1.8fr);gap:9px;align-items:stretch}footer>div{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.025);padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:8px}footer span{font-size:7.4px;letter-spacing:.06em;color:#71879a;font-weight:800}footer b{font-size:19px;color:#eaf1f8}footer p{margin:0;display:flex;align-items:center;justify-content:flex-end;text-align:right;font-size:8px;line-height:1.45;color:#60778c}.center-state{align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:rgba(255,255,255,.025)}.center-state b{font-size:16px;color:#e9c46d}.center-state span{margin-top:7px;font-size:10px;color:#788da1}.center-state.error b{color:#eb776b}@media(max-width:1250px){.wallpaper{grid-template-columns:180px minmax(0,1fr)}.command{padding-left:24px;padding-right:24px}.icon-gutter{padding-left:23px}.work-row{grid-template-columns:8px minmax(0,1fr) 82px}.procurement-row{grid-template-columns:8px minmax(0,1fr) 95px}.card-head small{display:none}}`}</style>
  </main>
}
