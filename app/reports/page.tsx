'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { createLiveLoader } from '@/lib/liveLoader'
import { readAllPages, requireCompletePagedReads } from '@/lib/pagedRead'
import { dateTH } from '@/lib/format'
import { bangkokToday, isUsableActualWorkDate, latestUsableDate } from '@/lib/workDateIntegrity'
import { confirmedHeadcount, countLabel, headcountSourceStatus, isHeadcountConfirmed, isHeadcountReviewCase, maleFemaleHeadcount } from '@/lib/headcountReconciliation'
import { canUseCanonicalDownstream, canonicalFlowState, type CanonicalStateRow } from '@/lib/siteOperationsCanonical'
import type { Project, ScheduleTask } from '@/lib/types'

type SiteEntry={id:string;source_row:number;source_timestamp:string|null;work_date:string;project_name_raw:string|null;area_raw:string|null;supervisor_raw:string|null;male_count:number|null;female_count:number|null;total_manpower:number|null;work_detail:string|null;status_text:string|null;next_plan:string|null;afternoon_detail:string|null;specific_area:string|null;supervisor_worker_id:string|null;mapping_status:string;synced_at:string;work_date_validation_status?:string|null;work_date_validation_reason?:string|null}
type EntryProject={entry_id:string;project_id:string;mapping_method:string}
type LabourBatch={id:string;site_operations_entry_id:string;verification_status:string;verified_at:string|null;confirmed_headcount:number|null;headcount_source_status:'matched'|'mismatch'|'unknown'|null;headcount_confirmation_status:'confirmed'|'unconfirmed'|null;confirmed_headcount_basis:string|null}
type LabourWorker={worker_id:string;full_name:string;display_label:string|null;default_team:string|null}
type ProcurementRow={id:string;project_id:string|null;vendor:string|null;item_name:string|null;current_status:string|null;procurement_status:string|null;payment_status:string|null;expected_delivery_text:string|null;condition_note:string|null;po_no:string|null;pr_no:string|null}
type ProcurementLink={procurement_item_id:string;project_id:string}

const materialPattern=/(รอวัสดุ|วัสดุ|รอของ|ของไม่เข้า|ของยังไม่เข้า|สั่งของ|จัดซื้อ|สินค้า|อุปกรณ์|รอpo|รอ po|material|procurement|delivery|supplier)/i
const closedProcurementPattern=/(ส่งมอบเรียบร้อย|รับสินค้าเรียบร้อย|รับสินค้าแล้ว|ติดตั้งเรียบร้อย|ส่งครบ|ปิดงาน|ปิดติดตาม|งานเสร็จ|เสร็จสมบูรณ์|completed|done|closed)/i

function normalizeText(value:unknown){
  return String(value??'').toLowerCase().replace(/[\n\r\t]+/g,' ')
    .replace(/[.,/#!$%^&*;:{}=_~()\[\]<>?'"|+-]+/g,' ')
    .replace(/\s+/g,' ').trim()
}
function wordSet(value:unknown){return new Set(normalizeText(value).split(' ').filter(x=>x.length>=2))}
function textScore(a:unknown,b:unknown){
  const aa=normalizeText(a),bb=normalizeText(b)
  if(!aa||!bb)return 0
  if(aa===bb)return 1
  if(aa.length>=5&&bb.length>=5&&(aa.includes(bb)||bb.includes(aa)))return .82
  const at=wordSet(aa),bt=wordSet(bb)
  if(!at.size||!bt.size)return 0
  let hit=0
  at.forEach(x=>{if(bt.has(x))hit++})
  return hit/Math.max(at.size,bt.size)
}
function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}
function pct(v:number|null|undefined){return v===null||v===undefined?'-':Math.round(Number(v)*100)+'%'}
function isOpenProcurement(row:ProcurementRow){return !closedProcurementPattern.test([row.current_status,row.procurement_status,row.payment_status].filter(Boolean).join(' '))}

export default function SiteOperationsPage(){
  const [loading,setLoading]=useState(true)
  const [loadError,setLoadError]=useState(false)
  const [entries,setEntries]=useState<SiteEntry[]>([])
  const [entryProjects,setEntryProjects]=useState<EntryProject[]>([])
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<ScheduleTask[]>([])
  const [procurement,setProcurement]=useState<ProcurementRow[]>([])
  const [procurementLinks,setProcurementLinks]=useState<ProcurementLink[]>([])
  const [workers,setWorkers]=useState<LabourWorker[]>([])
  const [batches,setBatches]=useState<LabourBatch[]>([])
  const [canonicalStates,setCanonicalStates]=useState<CanonicalStateRow[]>([])
  const [selectedDate,setSelectedDate]=useState('')
  const [selectedProject,setSelectedProject]=useState('')
  const [q,setQ]=useState('')
  const [readSignals,setReadSignals]=useState<Array<{label:string;loaded:number;count:number;truncated:boolean}>>([])

  useEffect(()=>{
    let alive=true
    let refreshTimer:number|null=null
    const s=getSupabase()
    const loader=createLiveLoader({
      load:async(signal)=>{
        const [e,ep,p,t,pr,pl,w,b]=await Promise.all([
          readAllPages<SiteEntry>({label:'site_operations_entries',signal,keyOf:x=>x.id,fetchPage:(from,to)=>
            s.from('site_operations_entries').select('*',{count:'exact'}).order('work_date',{ascending:false}).order('source_row',{ascending:false}).order('id',{ascending:false}).range(from,to).abortSignal(signal)}),
          readAllPages<EntryProject>({label:'site_operations_entry_projects',signal,keyOf:x=>x.entry_id+':'+x.project_id,fetchPage:(from,to)=>
            s.from('site_operations_entry_projects').select('entry_id,project_id,mapping_method',{count:'exact'}).order('entry_id').order('project_id').range(from,to).abortSignal(signal)}),
          readAllPages<Project>({label:'projects',signal,keyOf:x=>x.id,fetchPage:(from,to)=>
            s.from('projects').select('id,code,name,site_group,target_handover,active,sort_order',{count:'exact'}).order('sort_order').order('id').range(from,to).abortSignal(signal)}),
          readAllPages<ScheduleTask>({label:'v_schedule_tasks',signal,keyOf:x=>x.id,fetchPage:(from,to)=>
            s.from('v_schedule_tasks').select('id,project_id,source_task_no,category,task_name,area,planned_start,planned_end,current_plan_progress,actual_progress,current_variance,delay_days,site_status,blocker,next_action,target_close,contractor',{count:'exact'}).order('id').range(from,to).abortSignal(signal)}),
          readAllPages<ProcurementRow>({label:'procurement_items',signal,keyOf:x=>x.id,fetchPage:(from,to)=>
            s.from('procurement_items').select('id,project_id,vendor,item_name,current_status,procurement_status,payment_status,expected_delivery_text,condition_note,po_no,pr_no',{count:'exact'}).order('id').range(from,to).abortSignal(signal)}),
          readAllPages<ProcurementLink>({label:'procurement_item_projects',signal,keyOf:x=>x.procurement_item_id+':'+x.project_id,fetchPage:(from,to)=>
            s.from('procurement_item_projects').select('procurement_item_id,project_id',{count:'exact'}).order('procurement_item_id').order('project_id').range(from,to).abortSignal(signal)}),
          readAllPages<LabourWorker>({label:'labour_workers',signal,keyOf:x=>x.worker_id,fetchPage:(from,to)=>
            s.from('labour_workers').select('worker_id,full_name,display_label,default_team',{count:'exact'}).order('worker_id').range(from,to).abortSignal(signal)}),
          readAllPages<LabourBatch>({label:'labour_verification_batches',signal,keyOf:x=>x.id,fetchPage:(from,to)=>
            s.from('labour_verification_batches').select('*',{count:'exact'}).order('id').range(from,to).abortSignal(signal)})
        ])
        const paged=[e,ep,p,t,pr,pl,w,b]
        setReadSignals(paged.map(({label,loaded,count,truncated})=>({label,loaded,count,truncated})))
        requireCompletePagedReads(paged)
        let nextCanonical:CanonicalStateRow[]=[]
        try{
          const canonical=await readAllPages<CanonicalStateRow>({label:'v_site_operations_canonical_state',signal,keyOf:x=>x.entry_id,fetchPage:(from,to)=>
            s.from('v_site_operations_canonical_state').select('entry_id,source_row,group_id,group_state,canonical_entry_id,flow_state,decision_evidence,decided_at',{count:'exact'}).order('source_row',{ascending:false}).range(from,to).abortSignal(signal)})
          nextCanonical=canonical.data
        }catch{/* Migration not active yet: preserve pre-Prompt-13 read behavior in Preview. */}
        if(!alive||signal.aborted)return
        const nextEntries=e.data
        setLoadError(false);setEntries(nextEntries);setEntryProjects(ep.data)
        setProjects(p.data);setTasks(t.data)
        setProcurement(pr.data);setProcurementLinks(pl.data)
        setWorkers(w.data);setBatches(b.data);setCanonicalStates(nextCanonical)
        setSelectedDate(v=>v||latestUsableDate(nextEntries))
      },
      onError:()=>{if(alive)setLoadError(true)},
      onSettled:()=>{if(alive)setLoading(false)}
    })
    const queueLoad=()=>{
      if(refreshTimer)window.clearTimeout(refreshTimer)
      refreshTimer=window.setTimeout(()=>{void loader.refresh().catch(()=>{})},350)
    }
    void loader.refresh().catch(()=>{})
    const channel=s.channel('site-operations-source-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'site_operations_entries'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'site_operations_entry_projects'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'labour_verification_batches'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'procurement_items'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'schedule_tasks'},queueLoad)
      .subscribe()
    const onFocus=()=>queueLoad()
    const onVisible=()=>{if(document.visibilityState==='visible')queueLoad()}
    const pollTimer=window.setInterval(()=>{if(document.visibilityState==='visible')queueLoad()},60000)
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onVisible)
    return()=>{alive=false;loader.dispose();if(refreshTimer)window.clearTimeout(refreshTimer);window.clearInterval(pollTimer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisible);void s.removeChannel(channel)}
  },[])

  const projectById=useMemo(()=>new Map(projects.map(x=>[x.id,x])),[projects])
  const workerById=useMemo(()=>new Map(workers.map(x=>[x.worker_id,x])),[workers])
  const batchByEntry=useMemo(()=>new Map(batches.map(x=>[x.site_operations_entry_id,x])),[batches])
  const canonicalByEntry=useMemo(()=>new Map(canonicalStates.map(x=>[x.entry_id,x])),[canonicalStates])
  const projectIdsByEntry=useMemo(()=>{
    const map=new Map<string,string[]>()
    for(const link of entryProjects){const list=map.get(link.entry_id)||[];if(!list.includes(link.project_id))list.push(link.project_id);map.set(link.entry_id,list)}
    return map
  },[entryProjects])
  const tasksByProject=useMemo(()=>{
    const map=new Map<string,ScheduleTask[]>()
    for(const task of tasks){const list=map.get(task.project_id)||[];list.push(task);map.set(task.project_id,list)}
    return map
  },[tasks])
  const procurementProjectIds=useMemo(()=>{
    const map=new Map<string,string[]>()
    for(const link of procurementLinks){const list=map.get(link.procurement_item_id)||[];if(!list.includes(link.project_id))list.push(link.project_id);map.set(link.procurement_item_id,list)}
    for(const row of procurement){if(!row.project_id)continue;const list=map.get(row.id)||[];if(!list.includes(row.project_id))list.push(row.project_id);map.set(row.id,list)}
    return map
  },[procurement,procurementLinks])
  const procurementByProject=useMemo(()=>{
    const map=new Map<string,ProcurementRow[]>()
    for(const row of procurement){for(const projectId of procurementProjectIds.get(row.id)||[]){const list=map.get(projectId)||[];list.push(row);map.set(projectId,list)}}
    return map
  },[procurement,procurementProjectIds])

  const today=bangkokToday()
  const actualEntries=useMemo(()=>entries.filter(entry=>isUsableActualWorkDate(entry,today)&&canUseCanonicalDownstream(canonicalByEntry.get(entry.id))),[entries,today,canonicalByEntry])
  const duplicateReviewEntries=useMemo(()=>entries.filter(entry=>canonicalFlowState(canonicalByEntry.get(entry.id))==='suspected'),[entries,canonicalByEntry])
  const availableDates=useMemo(()=>Array.from(new Set(actualEntries.map(x=>x.work_date))).sort((a,b)=>b.localeCompare(a)),[actualEntries])
  const mappedProjectIds=useMemo(()=>new Set(entryProjects.map(x=>x.project_id)),[entryProjects])
  const projectFilterOptions=useMemo(()=>projects.filter(p=>p.active||mappedProjectIds.has(p.id)),[projects,mappedProjectIds])
  const filtered=useMemo(()=>{
    const needle=normalizeText(q)
    return actualEntries.filter(entry=>{
      if(selectedDate&&entry.work_date!==selectedDate)return false
      const pids=projectIdsByEntry.get(entry.id)||[]
      if(selectedProject&&!pids.includes(selectedProject))return false
      if(!needle)return true
      const projectText=pids.flatMap(id=>[projectById.get(id)?.code,projectById.get(id)?.name])
      return normalizeText([entry.supervisor_raw,entry.project_name_raw,entry.area_raw,entry.work_detail,entry.status_text,entry.next_plan,entry.afternoon_detail,entry.specific_area,...projectText].join(' ')).includes(needle)
    })
  },[actualEntries,selectedDate,selectedProject,q,projectIdsByEntry,projectById])

  const scheduleCandidate=(entry:SiteEntry)=>{
    const source=[entry.work_detail,entry.afternoon_detail,entry.specific_area,entry.area_raw].filter(Boolean).join(' ')
    let best:ScheduleTask|null=null,score=0
    for(const projectId of projectIdsByEntry.get(entry.id)||[]){
      for(const task of tasksByProject.get(projectId)||[]){
        if(task.source_task_no==='1')continue
        const s=textScore(source,[task.task_name,task.area,task.category].filter(Boolean).join(' '))
        if(s>score){score=s;best=task}
      }
    }
    return best&&score>=.35?{task:best,score}:null
  }
  const procurementCheck=(entry:SiteEntry)=>{
    const source=[entry.work_detail,entry.next_plan,entry.afternoon_detail].filter(Boolean).join(' ')
    const signal=materialPattern.test(source)
    const rows=new Map<string,ProcurementRow>()
    for(const id of projectIdsByEntry.get(entry.id)||[])for(const row of procurementByProject.get(id)||[])if(isOpenProcurement(row))rows.set(row.id,row)
    const ranked=Array.from(rows.values()).map(row=>({row,score:textScore(source,[row.item_name,row.condition_note,row.vendor,row.po_no,row.pr_no].filter(Boolean).join(' '))})).filter(x=>x.score>=.28).sort((a,b)=>b.score-a.score)
    return {signal,openCount:rows.size,rows:ranked.slice(0,2).map(x=>x.row)}
  }

  const scheduleReadyCount=filtered.filter(x=>scheduleCandidate(x)?.task).length
  const materialSignalCount=filtered.filter(x=>procurementCheck(x).signal).length
  const verifiedCount=filtered.filter(x=>{const b=batchByEntry.get(x.id);return b?.verification_status==='verified'&&isHeadcountConfirmed(b)}).length
  const needsReviewCount=filtered.filter(x=>{const b=batchByEntry.get(x.id);return b?.verification_status==='needs_review'||x.mapping_status==='needs_review'||isHeadcountReviewCase(b,x)}).length
  const manpowerKnown=filtered.filter(x=>x.total_manpower!==null&&x.total_manpower!==undefined)
  const manpowerUnknownCount=filtered.length-manpowerKnown.length
  const manpowerTotal=manpowerKnown.reduce((sum,x)=>sum+Number(x.total_manpower),0)
  const linkedProjectIds=new Set(filtered.flatMap(x=>projectIdsByEntry.get(x.id)||[]))
  const latestSynced=entries.map(x=>x.synced_at).filter(Boolean).sort().at(-1)||null

  return <AppShell>
    {readSignals.some(x=>x.truncated)&&<div className="panel" role="alert" style={{marginBottom:10}}>โหลดข้อมูลไม่ครบ • {readSignals.filter(x=>x.truncated).map(x=>x.label+' '+x.loaded+'/'+x.count).join(' • ')}</div>}
    {loadError&&<div className="panel" role="alert" style={{marginBottom:10}}>โหลดข้อมูล Site Operations ไม่สำเร็จบางส่วน • ระบบคงข้อมูลเดิมไว้ก่อน <button type="button" className="button" style={{marginLeft:8}} onClick={()=>window.dispatchEvent(new Event('focus'))}>ลองใหม่</button></div>}
    <PageHeader title="Site Operations" subtitle="ข้อมูลจาก Google Form / Daily Site Report แบบ Read-only • ใช้ข้อมูลที่หน้างานรายงานแล้วต่อยอดทันทีโดยไม่กรอกซ้ำ" action={<div className="siteops-actions"><span><small>Source Sync ล่าสุด</small><b>{dateTimeTH(latestSynced)}</b></span><Link href="/reports/labour" className="button">Labour Verification</Link><Link href="/#dashboard-site-operations" className="button">← Dashboard</Link></div>}/>

    <section className="panel siteops-filter">
      <label>วันที่<select value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}><option value="">ทุกวันที่</option>{availableDates.map(d=><option key={d} value={d}>{dateTH(d)}</option>)}</select></label>
      <label>Site / Plot<select value={selectedProject} onChange={e=>setSelectedProject(e.target.value)}><option value="">ทุกหน้างาน</option>{projectFilterOptions.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}{p.active?'':' (inactive)'}</option>)}</select></label>
      <label className="siteops-search">ค้นหา<input value={q} onChange={e=>setQ(e.target.value)} placeholder="งาน / หัวหน้าทีม / พื้นที่ / blocker / next plan"/></label>
      {(selectedDate||selectedProject||q)&&<button type="button" className="button" onClick={()=>{setSelectedDate('');setSelectedProject('');setQ('')}}>ล้าง Filter</button>}
    </section>

    <section className="siteops-kpis">
      <div><span>Daily Entries</span><b>{filtered.length}</b><small>รายการจาก Form</small></div>
      <div><span>หน้างาน</span><b>{linkedProjectIds.size}</b><small>Project ที่ map แบบ explicit</small></div>
      <div><span>กำลังคน</span><b>{manpowerKnown.length?manpowerTotal:'ไม่ระบุ'}</b><small>Raw source{manpowerUnknownCount?' • '+manpowerUnknownCount+' รายการไม่ระบุ (ไม่คิดเป็น 0)':''}</small></div>
      <div><span>Labour Verified</span><b>{verifiedCount}</b><small>ยืนยันทีมแล้ว</small></div>
    </section>

    <section className="siteops-cross-grid">
      <article className="panel siteops-cross"><b>Daily Report × Schedule</b><strong>{scheduleReadyCount}</strong><p>Schedule candidate จาก Project + รายละเอียดงาน ใช้ช่วยตรวจเท่านั้น ไม่เขียน Task ID หรือ Actual อัตโนมัติ</p><Link href="/schedule">เปิด Schedule →</Link></article>
      <article className="panel siteops-cross"><b>Daily Report × Procurement</b><strong>{materialSignalCount}</strong><p>จับคำรอของ / รอวัสดุ / PO แล้วเทียบ Procurement ที่ยังเปิดอยู่ของ Project เดียวกัน</p><Link href="/procurement">เปิด Procurement →</Link></article>
      <article className="panel siteops-cross"><b>Daily Report × Progress</b><strong>{scheduleReadyCount}</strong><p>Daily Report เป็น evidence ของกิจกรรม/สถานะ/Next plan ส่วน % Actual ยังยึด Schedule Source of Truth</p><Link href="/schedule">ตรวจ Plan vs Actual →</Link></article>
      <article className="panel siteops-cross"><b>Daily Report × Labour</b><strong>{needsReviewCount}</strong><p>รายการที่ยังต้องตรวจ identity หรือทีมคนงานก่อนใช้เป็น Labour Cost • ยืนยันแล้ว {verifiedCount}</p><Link href="/reports/labour">ยืนยันทีมคนงาน →</Link></article>
    </section>

    <div className="siteops-source-note"><b>Data lineage:</b> Google Form → Daily Site Report → Site Operations Raw Dataset → Cross-check • Labour Cost อ่านเฉพาะข้อมูลที่ผ่าน Labour Verification แล้ว</div>

    {duplicateReviewEntries.length>0&&<section className="panel siteops-duplicate-review">
      <b>Duplicate candidates รอตรวจ {duplicateReviewEntries.length} raw rows</b>
      <p>รายการเหล่านี้ยังคง raw evidence ครบ แต่ถูกกักออกจาก Site Operations totals / Labour / Payroll จนกว่าจะมีหลักฐานยืนยันว่าเป็นรายการซ้ำหรือเป็นงานคนละรายการ</p>
      <div>{duplicateReviewEntries.map(entry=><span key={entry.id}>Form row {entry.source_row} • {dateTH(entry.work_date)} • {entry.supervisor_raw||'-'} • {entry.project_name_raw||'-'} • {entry.work_detail||'-'}</span>)}</div>
      <Link href="/reports/labour" className="button">เปิด Duplicate Review →</Link>
    </section>}

    {loading?<div className="panel">กำลังโหลด Site Operations…</div>:!filtered.length?<div className="panel siteops-empty"><b>ไม่พบรายงานตาม Filter</b><span>ข้อมูลใหม่จะเข้าหน้านี้จากระบบ Sync โดยไม่ต้องกรอกใน Web App ซ้ำ</span></div>:<div className="siteops-list">
      {filtered.map(entry=>{
        const pids=projectIdsByEntry.get(entry.id)||[]
        const projectList=pids.map(id=>projectById.get(id)).filter(Boolean) as Project[]
        const worker=entry.supervisor_worker_id?workerById.get(entry.supervisor_worker_id):null
        const batch=batchByEntry.get(entry.id)
        const schedule=scheduleCandidate(entry)
        const proc=procurementCheck(entry)
        const authority=confirmedHeadcount(batch)
        const sourceHeadcountStatus=headcountSourceStatus(batch,entry)
        const sexTotal=maleFemaleHeadcount(entry)
        const headcountReview=isHeadcountReviewCase(batch,entry)
        const labourVerified=batch?.verification_status==='verified'&&authority!==null
        return <article className="panel siteops-entry" key={entry.id}>
          <header><div><div className="siteops-title"><b>{entry.supervisor_raw||'ไม่ระบุผู้ควบคุมงาน'}</b>{worker&&<span>→ {worker.display_label||worker.full_name}</span>}</div><small>{dateTH(entry.work_date)} • Form row {entry.source_row} • {entry.area_raw||entry.project_name_raw||'ไม่ระบุพื้นที่'}</small></div><div className="siteops-entry-meta"><StatusBadge value={entry.status_text||'pending'} multiline/><span>Raw {countLabel(entry.total_manpower)} คน</span><span className={labourVerified?'verified':headcountReview||batch?.verification_status==='needs_review'?'review':''}>Labour: {labourVerified?'Verified':headcountReview||batch?.verification_status==='needs_review'?'Needs review':'Pending'}</span></div></header>
          <div className="siteops-projects"><span>Project</span>{projectList.length?projectList.map(p=><b key={p.id}>{p.code}</b>):<b className="warn">ยังไม่ map Project</b>}<small>Source: {entry.project_name_raw||'-'} • {entry.area_raw||'-'}</small></div>
          <div className="siteops-work"><div><span>งานที่รายงาน</span><b>{entry.work_detail||'ไม่ระบุรายละเอียดงาน'}</b></div>{entry.afternoon_detail&&<div><span>ช่วงบ่าย</span><b>{entry.afternoon_detail}</b></div>}{entry.next_plan&&<div><span>Next plan</span><b>{entry.next_plan}</b></div>}{entry.specific_area&&<div><span>Specific area</span><b>{entry.specific_area}</b></div>}</div>
          <div className="siteops-checks">
            <div><span>Schedule</span>{schedule?<><b>Candidate: {schedule.task.task_name}</b><small>{projectById.get(schedule.task.project_id)?.code||'-'} • Plan {pct(schedule.task.current_plan_progress)} • Actual {pct(schedule.task.actual_progress)}</small><small>Candidate only — ไม่เขียนกลับ Schedule</small></>:<><b className="muted">ยังไม่มี candidate ชัดเจน</b><small>คง Daily Report เป็น evidence โดยไม่เดา Task</small></>}</div>
            <div><span>Procurement</span>{proc.signal?<><b className="warn">พบข้อความที่เกี่ยวกับวัสดุ/ของ/PO</b>{proc.rows.length?proc.rows.map(r=><small key={r.id}>{r.item_name||'-'} • {r.current_status||r.procurement_status||'ต้องติดตาม'}{r.expected_delivery_text?' • '+r.expected_delivery_text:''}</small>):<small>มี Procurement เปิด {proc.openCount} รายการใน Project แต่ยังจับคู่รายการไม่ได้ชัดเจน</small>}</>:<><b>ไม่พบ Material blocker จากรายงาน</b><small>รายการจัดซื้อเปิดใน Project: {proc.openCount}</small></>}</div>
            <div><span>Progress evidence</span><b>{entry.status_text||'ไม่ระบุสถานะ'}</b><small>ใช้รายละเอียดงาน + สถานะ + Next plan เป็น evidence</small><small>% Actual ยังคงมาจาก Schedule เท่านั้น</small></div>
            <div><span>Labour</span><b>Raw {countLabel(entry.total_manpower)} • ชาย {countLabel(entry.male_count)} / หญิง {countLabel(entry.female_count)} • ชาย+หญิง {countLabel(sexTotal)}</b><small className={sourceHeadcountStatus==='mismatch'?'warn':''}>{sourceHeadcountStatus==='mismatch'?'Source discrepancy — ต้องตรวจ':sourceHeadcountStatus==='unknown'?'Source ไม่ครบ — Unknown ไม่ใช่ 0':'Raw source สอดคล้อง'}</small><small>{authority===null?'Confirmed headcount: ยังไม่มีผู้ยืนยัน':'Confirmed headcount: '+authority+' คน • ใช้ downstream'}</small><small>{worker?'Home team: '+(worker.default_team||'ยังไม่ระบุ'):'Supervisor identity ยังไม่ยืนยัน'}</small><Link href={'/reports/labour?date='+entry.work_date+'&entry='+entry.id}>เปิด Labour Verification →</Link></div>
          </div>
        </article>
      })}
    </div>}

    <style jsx>{`
      .siteops-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.siteops-actions>span{display:grid;text-align:right}.siteops-actions small{font-size:9.5px;color:var(--muted)}.siteops-actions b{font-size:11px}
      .siteops-filter{display:grid;grid-template-columns:170px minmax(220px,280px) minmax(260px,1fr) auto;gap:8px;align-items:end;padding:10px;margin-bottom:10px;position:sticky;top:0;z-index:16}.siteops-filter label{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted)}.siteops-filter select,.siteops-filter input{min-height:36px;border:1px solid var(--line);border-radius:9px;background:#fff;padding:7px 9px;color:var(--text);font:inherit;font-size:12px}
      .siteops-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}.siteops-kpis>div{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px}.siteops-kpis span{display:block;font-size:9px;font-weight:900;color:var(--muted);letter-spacing:.05em;text-transform:uppercase}.siteops-kpis b{display:block;margin:4px 0 1px;font-size:23px;color:var(--navy)}.siteops-kpis small{font-size:9.5px;color:var(--muted)}
      .siteops-cross-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}.siteops-cross{padding:12px;display:flex;flex-direction:column;min-height:158px}.siteops-cross>b{font-size:11px;color:var(--navy)}.siteops-cross>strong{font-size:28px;margin:10px 0 2px;color:var(--navy)}.siteops-cross p{font-size:10px;line-height:1.5;color:var(--muted);margin:0 0 8px}.siteops-cross a{margin-top:auto;font-size:10px;font-weight:800}
      .siteops-source-note{padding:8px 10px;margin-bottom:10px;border:1px solid var(--line);border-radius:10px;background:#f5f7fa;font-size:10px;line-height:1.5;color:var(--muted)}.siteops-source-note b{color:var(--text)}
      .siteops-duplicate-review{display:grid;gap:7px;margin-bottom:10px;padding:12px;border-color:#e5b76a;background:#fff9ed}.siteops-duplicate-review>b{font-size:11px;color:#765300}.siteops-duplicate-review p{margin:0;font-size:9px;line-height:1.5;color:#765300}.siteops-duplicate-review>div{display:grid;gap:4px}.siteops-duplicate-review span{font-size:9px;line-height:1.45;color:var(--text)}.siteops-duplicate-review .button{justify-self:start}
      .siteops-list{display:grid;gap:10px}.siteops-entry{padding:0;overflow:hidden}.siteops-entry>header{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 13px;background:linear-gradient(135deg,#172a43,#213d5e);color:#fff}.siteops-title{display:flex;gap:7px;align-items:baseline;flex-wrap:wrap}.siteops-title>b{font-size:14px}.siteops-title span{font-size:10px;color:#c9d5e1}.siteops-entry header small{display:block;margin-top:3px;font-size:9px;color:#c9d5e1}.siteops-entry-meta{display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.siteops-entry-meta>span{padding:5px 7px;border:1px solid rgba(255,255,255,.18);border-radius:8px;font-size:9px}.siteops-entry-meta>span.verified{background:rgba(64,170,104,.18);color:#d8f5e3}.siteops-entry-meta>span.review{background:rgba(226,164,50,.18);color:#ffe7b3}
      .siteops-projects{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 13px;background:#f8fafc;border-bottom:1px solid var(--line);font-size:9.5px}.siteops-projects>span{font-weight:900;color:var(--muted)}.siteops-projects>b{padding:3px 7px;border-radius:999px;background:#e9eef4;color:var(--navy)}.siteops-projects>small{margin-left:auto;color:var(--muted)}
      .siteops-work{display:grid;gap:7px;padding:10px 13px;border-bottom:1px solid var(--line)}.siteops-work>div{display:grid;grid-template-columns:85px minmax(0,1fr);gap:8px}.siteops-work span{font-size:9px;font-weight:900;color:var(--muted);text-transform:uppercase}.siteops-work b{font-size:10.5px;line-height:1.55;font-weight:650}
      .siteops-checks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;padding:10px 13px}.siteops-checks>div{min-width:0;padding:8px;border:1px solid var(--line);border-radius:10px;background:#fbfcfd}.siteops-checks>div>span{display:block;margin-bottom:4px;font-size:8.5px;font-weight:900;color:#708095;text-transform:uppercase;letter-spacing:.04em}.siteops-checks b{display:block;font-size:10px;line-height:1.4}.siteops-checks small{display:block;font-size:9px;line-height:1.4;color:var(--muted);margin-top:3px;overflow-wrap:anywhere}.siteops-checks a{display:inline-block;margin-top:5px;font-size:9px;font-weight:800}.warn{color:#9b5f00!important}.siteops-empty{display:grid;gap:5px;text-align:center;padding:28px}.siteops-empty span{font-size:10px;color:var(--muted)}
      @media(max-width:1100px){.siteops-cross-grid,.siteops-checks{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.siteops-actions{justify-content:flex-start}.siteops-actions>span{text-align:left}.siteops-filter{position:static;grid-template-columns:1fr 1fr}.siteops-search{grid-column:1/-1}.siteops-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.siteops-cross-grid,.siteops-checks{grid-template-columns:1fr}.siteops-entry>header{align-items:flex-start;flex-direction:column}.siteops-entry-meta{justify-content:flex-start}.siteops-projects>small{width:100%;margin-left:0}.siteops-work>div{grid-template-columns:1fr}}@media print{.siteops-filter,.siteops-actions .button{display:none!important}.siteops-entry,.siteops-cross{break-inside:avoid}}
    `}</style>
  </AppShell>
}
