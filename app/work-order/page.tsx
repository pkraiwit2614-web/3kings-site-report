'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import useAccessRole from '@/components/useAccessRole'
import {canAccessWorkOrder} from '@/lib/accessControl'
import {getSupabase} from '@/lib/supabase'
import {hotelRoomLabel,hotelRoomMembers} from '@/lib/hotelRoomGroups'
import './work-order.css'

type WorkOrder={
  work_id:string;room_group:string;building:'A'|'B';contractor:string;
  defect_item:string;next_action:string|null;
  received_date:string|null;due_date:string|null;work_status:string|null;
  evidence_url:string|null;qa_status:string|null;conflict_note:string|null;
  source_sync_note:string|null;source_modified_at:string;imported_at:string;
}
type Quick='ALL'|'A'|'B'|'OVERDUE'
// A verified received date belongs to its Work ID, not to every defect in the room.
// A document date or room-status note must never substitute for a missing Work ID date.
const noticeDateTH=(iso:string|null)=>iso?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+String(Number(iso.slice(0,4))+543).slice(-2):'รอยืนยัน'
function todayInBangkok():string{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date())
 const v=(type:string)=>parts.find(p=>p.type===type)?.value||''
 return v('year')+'-'+v('month')+'-'+v('day')
}
function elapsedCalendarDays(iso:string|null,todayISO:string):number|null{
 if(!iso)return null
 const n=Math.round((Date.parse(todayISO+'T00:00:00Z')-Date.parse(iso+'T00:00:00Z'))/86400000)
 return Number.isFinite(n)&&n>=0?n:null
}
const warningText=(n:number)=>n>=7?'ครบกำหนด 7 วันวันนี้':'อีก '+(7-n)+' วันเกินกำหนด'
function contractorCounts(rows:WorkOrder[]):[string,number][]{
 const counts=new Map<string,number>()
 for(const row of rows)counts.set(row.contractor,(counts.get(row.contractor)||0)+1)
 return [...counts.entries()].sort(([a],[b])=>a.localeCompare(b,'th'))
}

function dateTimeTH(v:string|null|undefined){
 if(!v)return '—'
 const d=new Date(v)
 if(Number.isNaN(d.getTime()))return '—'
 return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}
const ids=(group:string):string[]=>[...new Set((group.toUpperCase().match(/[AB]\d{3}/g)||[]).flatMap(room=>hotelRoomMembers(room)))]
const isCombine=(group:string)=>ids(group).some(room=>hotelRoomMembers(room).length>1)
const finished=(v:string|null)=>/เสร็จแล้ว|เสร็จสิ้น|งดแจก|ยกเลิก/.test(v||'')
// A completed label with an explicit unfinished QA note is tracked internally, not dispatched.
const completionConflict=(r:WorkOrder)=>finished(r.work_status)&&/ยังไม่เสร็จ/.test(r.qa_status||'')
const isHold=(r:WorkOrder)=>completionConflict(r)||/HOLD/i.test(r.work_status||'')||/HOLD/i.test(r.qa_status||'')
// Label-only change: the Excel/source work_status is preserved.
const displayWorkStatus=(v:string|null)=>v||'รอตรวจ'
function roomSearchText(group:string){
 return ids(group).map(room=>{
  const number=Number(room.slice(1))
  return room.startsWith('B')&&number>=101&&number<=105?' Good'+String(number-100).padStart(2,'0')+' Good-'+String(number-100).padStart(2,'0'):''
 }).join(' ')
}
const normalize=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/[\s\-_.]/g,'')
function groupLabel(group:string){
 const members=ids(group)
 return members.length?members.map(hotelRoomLabel).join(' + '):group
}

export default function WorkOrderViewer(){
 const {role}=useAccessRole()
 const permitted=canAccessWorkOrder(role)
 const [rows,setRows]=useState<WorkOrder[]>([])
 // Secondary staff-only review queue. Inactive HOLD never joins dispatch or print.
 const [inactiveHoldRows,setInactiveHoldRows]=useState<WorkOrder[]>([])
 const [inactiveHoldError,setInactiveHoldError]=useState('')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [quick,setQuick]=useState<Quick>('ALL')
 const [query,setQuery]=useState('')
 const [contractor,setContractor]=useState('ALL')
 const [statusFilter,setStatusFilter]=useState('ALL')
 // Allow read-only room-scoped navigation from Defect Report and OOO/OOS.
 // Do not change the existing eligible-work-item or permission rules.
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search)
  const requestedRoom=params.get('room')||params.get('q')
  if(!requestedRoom)return
  setQuery(requestedRoom)
  setQuick('ALL')
  setContractor('ALL')
  setStatusFilter('ALL')
 },[])

 const reload=useCallback(async()=>{
  const sb=getSupabase()
  const order=await sb.from('defect_work_order_snapshot').select('work_id,room_group,building,contractor,defect_item,next_action,received_date,due_date,work_status,evidence_url,qa_status,conflict_note,source_sync_note,source_modified_at,imported_at').eq('source_active',true).order('work_id')
  if(order.error)throw new Error(order.error.message||'อ่านข้อมูลไม่สำเร็จ')
  setRows((order.data||[]) as WorkOrder[])
  const inactive=await sb.from('defect_work_order_snapshot').select('work_id,room_group,building,contractor,defect_item,next_action,received_date,due_date,work_status,evidence_url,qa_status,conflict_note,source_sync_note,source_modified_at,imported_at').eq('source_active',false).ilike('work_status','HOLD%').order('work_id')
  // If inactive HOLD is unreadable, existing active work remains available.
  setInactiveHoldRows(inactive.error?[]:(inactive.data||[]) as WorkOrder[])
  setInactiveHoldError(inactive.error?inactive.error.message:'')
 },[])
 useEffect(()=>{
  let alive=true
  const load=async()=>{try{await reload();if(alive)setError('')}catch(e){if(alive){setError(e instanceof Error?e.message:String(e));setRows([])}}finally{if(alive)setLoading(false)}}
  void load()
  const onFocus=()=>{void load()}
  window.addEventListener('focus',onFocus)
  const ticker=window.setInterval(()=>{void load()},300000)
  const channel=getSupabase().channel('work-order-viewer-room-status').on('postgres_changes',{event:'*',schema:'public',table:'condo_room_status'},()=>{void load()}).subscribe()
  return()=>{alive=false;window.removeEventListener('focus',onFocus);window.clearInterval(ticker);void getSupabase().removeChannel(channel)}
 },[reload])

 const todayISO=todayInBangkok()
 const noticeForRow=(r:WorkOrder):string|null=>r.received_date
 const daysForRow=(r:WorkOrder)=>elapsedCalendarDays(noticeForRow(r),todayISO)
 // Dispatch is defined by an active, unfinished Work ID, not by room handover state.
 // The read query already restricts this collection to source_active=true.
 const eligible=useMemo(()=>rows.filter(r=>(!finished(r.work_status)||completionConflict(r))&&ids(r.room_group).length>0),[rows])
 // Dispatch/Print dataset excludes HOLD items so contractors never receive unverified work automatically.
 const dispatchEligible=useMemo(()=>eligible.filter(r=>!isHold(r)),[eligible])
 // Tracking dataset preserves all HOLD items for staff follow-up and verification.
 const holdEligible=useMemo(()=>eligible.filter(r=>isHold(r)),[eligible])
 const teams=useMemo(()=>[...new Set(eligible.map(r=>r.contractor))].sort((a,b)=>a.localeCompare(b,'th')),[eligible])
 // Status choices follow real unfinished dispatch data; completed and HOLD work remain excluded.
 const statusChoices=useMemo(()=>[...new Set(dispatchEligible.map(r=>displayWorkStatus(r.work_status)))].sort((a,b)=>a.localeCompare(b,'th')),[dispatchEligible])
 // Search and contractor limit the context for every KPI; the selected KPI
 // then selects the rows that appear in the table and on the printed report.
 const inScope=useMemo(()=>{
  const needle=normalize(query)
  return dispatchEligible.filter(r=>{
   if(statusFilter!=='ALL'&&(statusFilter==='HOLD'||displayWorkStatus(r.work_status)!==statusFilter))return false
   if(contractor!=='ALL'&&r.contractor!==contractor)return false
   if(!needle)return true
   return normalize([r.work_id,r.room_group,roomSearchText(r.room_group),r.defect_item,r.next_action,r.contractor].filter(Boolean).join(' ')).includes(needle)
  })
 },[dispatchEligible,query,contractor,statusFilter])
 const holdInScope=useMemo(()=>{
  const needle=normalize(query)
  return holdEligible.filter(r=>{
   if(statusFilter!=='ALL'&&statusFilter!=='HOLD')return false
   if(contractor!=='ALL'&&r.contractor!==contractor)return false
   if(!needle)return true
   return normalize([r.work_id,r.room_group,roomSearchText(r.room_group),r.defect_item,r.next_action,r.contractor].filter(Boolean).join(' ')).includes(needle)
  })
 },[holdEligible,query,contractor,statusFilter])
 // A separate non-active review panel, not a dispatch/print dataset.
 const inactiveHoldInScope=useMemo(()=>{
  const needle=normalize(query)
  return inactiveHoldRows.filter(r=>{
   if(!isHold(r)||finished(r.work_status)||ids(r.room_group).length===0)return false
   if(statusFilter!=='ALL'&&statusFilter!=='HOLD')return false
   if(contractor!=='ALL'&&r.contractor!==contractor)return false
   return !needle||normalize([r.work_id,r.room_group,roomSearchText(r.room_group),r.defect_item,r.next_action,r.contractor].filter(Boolean).join(' ')).includes(needle)
  })
 },[inactiveHoldRows,query,contractor,statusFilter])
 const filtered=useMemo(()=>inScope.filter(r=>{
  if(quick==='A'||quick==='B'){if(r.building!==quick)return false}
  if(quick==='OVERDUE'&&!((daysForRow(r)??0)>7))return false
  return true
 }).sort((a,b)=>a.contractor.localeCompare(b.contractor,'th')||a.room_group.localeCompare(b.room_group)||a.work_id.localeCompare(b.work_id)),[inScope,quick,todayISO])
 const latestWorkDetailSourceAt=rows.map(r=>r.source_modified_at).filter(Boolean).sort().at(-1)||null
 const kpiRows:Record<Quick,WorkOrder[]>={
  ALL:inScope,A:inScope.filter(r=>r.building==='A'),B:inScope.filter(r=>r.building==='B'),
  OVERDUE:inScope.filter(r=>(daysForRow(r)??0)>7)
 }
 const counters:Record<Quick,number>={ALL:kpiRows.ALL.length,A:kpiRows.A.length,B:kpiRows.B.length,OVERDUE:kpiRows.OVERDUE.length}
 const kpiContractors:Record<Quick,[string,number][]>={ALL:contractorCounts(kpiRows.ALL),A:contractorCounts(kpiRows.A),B:contractorCounts(kpiRows.B),OVERDUE:contractorCounts(kpiRows.OVERDUE)}
 const holdContractors=useMemo(()=>contractorCounts(holdInScope),[holdInScope])
 const labels:Record<Quick,string>={ALL:'งานที่กำลังดำเนินการทั้งหมด',A:'อาคาร A',B:'อาคาร B',OVERDUE:'งานค้างเกิน 7 วัน'}
 const scope=labels[quick]+' • '+(contractor==='ALL'?'ทุกผู้รับเหมา':contractor)+(statusFilter==='ALL'?'':' • สถานะ '+(statusFilter==='HOLD'?'HOLD / รอตรวจสอบ':statusFilter))+(query?' • ค้นหา '+query:'')
 if(!permitted)return <AppShell><section className="panel" role="alert">สิทธิ์ Work Order จำกัดสำหรับทีม 3 Kings ที่ได้รับสิทธิ์ Defect เท่านั้น</section></AppShell>
 return <AppShell>
  <PageHeader title="Above Condo — Work Order" subtitle="รายการงานค้างรายจุด • สำหรับทีม 3 Kings • อ่านอย่างเดียว"
   action={<div className="wo-update-meta"><span>ข้อมูลอัปเดต</span><b>{dateTimeTH(latestWorkDetailSourceAt)}</b></div>}/>
  {error&&<div className="panel wo-error" role="alert">ไม่สามารถตรวจข้อมูล Work Order กับ Defect Report ได้: {error} <button type="button" className="button" onClick={()=>{setLoading(true);void reload().then(()=>setError('')).catch(e=>setError(String(e))).finally(()=>setLoading(false))}}>ลองใหม่</button></div>}
  {loading?<div className="panel">กำลังตรวจสอบข้อมูล Work Order ล่าสุด…</div>:!error&&<>
   <section className="wo-kpis" aria-label="กรองรายการตามจำนวนงาน">
    {(['ALL','A','B','OVERDUE'] as Quick[]).map(kind=><button key={kind} type="button" aria-pressed={quick===kind} className={'wo-kpi '+(quick===kind?'selected ':'')+(kind==='OVERDUE'?'late':'')} onClick={()=>setQuick(kind)}>
     <div className="wo-kpi-head"><span>{labels[kind]}</span><b>{counters[kind]}</b></div>
     <small>รายการงานพร้อมแจก</small>
     <div className="wo-kpi-team-list" aria-label="จำนวนงานแยกผู้รับเหมา">
      {kpiContractors[kind].map(([name,count])=><span key={name} className="wo-kpi-team"><strong>{name}</strong><b>{count}</b></span>)}
      {!kpiContractors[kind].length&&<small>ไม่มีงานค้าง</small>}
     </div>
    </button>)}
    <button type="button" className="wo-kpi wo-kpi-hold" onClick={()=>{if(statusFilter!=='HOLD')setStatusFilter('HOLD');else document.getElementById('wo-hold-tracking')?.scrollIntoView({behavior:'smooth'})}} aria-label="งาน HOLD สำหรับเจ้าหน้าที่ติดตามภายใน">
     <div className="wo-kpi-head"><span>งาน HOLD / รอตรวจสอบ</span><b>{holdInScope.length}</b></div>
     <small>ติดตามภายใน (ไม่รวมใบแจกงาน)</small>
     <div className="wo-kpi-team-list" aria-label="จำนวนงาน HOLD แยกผู้รับเหมา">
      {holdContractors.map(([name,count])=><span key={name} className="wo-kpi-team"><strong>{name}</strong><b>{count}</b></span>)}
      {!holdContractors.length&&<small>ไม่มีงาน HOLD</small>}
     </div>
    </button>
   </section>
   <section className="panel wo-filters">
    <label>ค้นหา ห้อง / งาน / ผู้รับเหมา
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="เช่น A524, B102, Good02, ฝักบัว, RSE"/>
    </label>
    <label>ผู้รับเหมา
     <select value={contractor} onChange={e=>setContractor(e.target.value)}>
      <option value="ALL">ทุกผู้รับเหมา</option>{teams.map(t=><option value={t} key={t}>{t}</option>)}
     </select>
    </label>
    <label>สถานะงาน
     <select aria-label="กรองตามสถานะงาน" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
      <option value="ALL">ทุกสถานะงานค้าง</option>
      {statusChoices.map(status=><option value={status} key={status}>{status}</option>)}
      <option value="HOLD">HOLD / รอตรวจสอบ (ภายใน)</option>
     </select>
    </label>
    {(query||quick!=='ALL'||contractor!=='ALL'||statusFilter!=='ALL')&&<button type="button" className="button" onClick={()=>{setQuery('');setQuick('ALL');setContractor('ALL');setStatusFilter('ALL')}}>ล้างตัวกรอง</button>}
   </section>
   <section className="panel wo-sheet">
    <div className="wo-sheet-title"><h2>รายการสำหรับตรวจและแจกงาน</h2><span>แสดง {filtered.length} รายการ</span></div>
    <div className="table-wrap wo-table-wrap"><table className="wo-table"><thead><tr>
     <th>ห้อง / Work ID</th><th>วันที่รับแจ้ง Defect</th><th>รายละเอียด Defect</th><th>งานที่ต้องทำต่อ</th><th>ผู้รับเหมา</th>
     <th>สถานะงาน / ตรวจสอบ</th><th className="wo-evidence-col">หลักฐาน</th><th className="wo-print-only">ตรวจงาน / ลงชื่อ</th>
    </tr></thead><tbody>
     {filtered.map(r=>{const notice=noticeForRow(r);const elapsed=elapsedCalendarDays(notice,todayISO);return <tr key={r.work_id}>
      <td><div className="wo-room-label"><b>{groupLabel(r.room_group)}</b>{isCombine(r.room_group)&&<span className="wo-combine-code" title="ห้อง Combine">c</span>}</div>{isCombine(r.room_group)&&<span className="wo-combine-badge" title="ห้อง Combine ใช้งานชุดเดียวกัน">Combine: {ids(r.room_group).join(' + ')}</span>}<small>{r.work_id}</small></td>
      <td><small>วันที่รับแจ้ง Defect: {noticeDateTH(notice)}</small><small>เหลือเวลา : {elapsed===null?'-':elapsed+' วัน'}</small>{elapsed!==null&&elapsed>7?<small className="wo-overdue">เกินกำหนด</small>:elapsed!==null&&elapsed>4?<small className="wo-warning">{warningText(elapsed)}</small>:null}</td>
      <td>{r.defect_item}</td>
      <td>{r.next_action||'รอระบุรายละเอียด'}</td>
      <td><b>{r.contractor}</b></td>
      <td><b>{displayWorkStatus(r.work_status)}</b><small>{r.qa_status||'รอตรวจรายการ'}</small></td>
      <td className="wo-evidence-col">{r.evidence_url?.startsWith('https://drive.google.com/')?<a target="_blank" rel="noreferrer" href={r.evidence_url}>เปิดภาพ / PDF</a>:<small>รอหลักฐาน</small>}</td>
      <td className="wo-print-only wo-signoff"><div>□ ตรวจงานแล้ว</div><div>ลงชื่อ ........................</div><div>วันที่ ....../....../......</div></td>
     </tr>})}
     {!filtered.length&&<tr><td colSpan={7} className="wo-empty">ไม่พบรายการงานค้างตามตัวกรอง</td><td className="wo-print-only"/></tr>}
    </tbody></table></div>
   </section>
   {holdInScope.length>0&&<section className="panel wo-sheet wo-hold-section" id="wo-hold-tracking" aria-label="รายการ HOLD รอตรวจสอบ">
    <div className="wo-sheet-title">
     <h2>รายการ HOLD / รอตรวจสอบ (ติดตามภายใน)</h2>
     <span>แสดง {holdInScope.length} รายการ (คัดแยกออกจากใบแจกงานผู้รับเหมา)</span>
    </div>
    <div className="table-wrap wo-table-wrap"><table className="wo-table wo-hold-table"><thead><tr>
     <th>ห้อง / Work ID</th><th>วันที่รับแจ้ง Defect</th><th>รายละเอียด Defect</th><th>งานที่ต้องทำต่อ</th><th>ผู้รับเหมา</th>
     <th>สถานะงาน / QA</th><th>สาเหตุที่ติด HOLD</th><th className="wo-evidence-col">หลักฐาน</th>
    </tr></thead><tbody>
     {holdInScope.map(r=>{const notice=noticeForRow(r);const elapsed=elapsedCalendarDays(notice,todayISO);return <tr key={r.work_id} className="wo-hold-row">
      <td><div className="wo-room-label"><b>{groupLabel(r.room_group)}</b>{isCombine(r.room_group)&&<span className="wo-combine-code" title="ห้อง Combine">c</span>}</div>{isCombine(r.room_group)&&<span className="wo-combine-badge" title="ห้อง Combine ใช้งานชุดเดียวกัน">Combine: {ids(r.room_group).join(' + ')}</span>}<small>{r.work_id}</small></td>
      <td><small>วันที่รับแจ้ง Defect: {noticeDateTH(notice)}</small><small>เหลือเวลา : {elapsed===null?'-':elapsed+' วัน'}</small></td>
      <td>{r.defect_item}</td>
      <td>{r.next_action||'รอระบุรายละเอียด'}</td>
      <td><b>{r.contractor}</b></td>
      <td><span className="wo-hold-badge">HOLD</span><b>{completionConflict(r)?'สถานะขัดแย้ง — รอตรวจสอบ':displayWorkStatus(r.work_status)}</b><small>{r.qa_status||'รอตรวจรายการ'}</small></td>
      <td><small className="wo-conflict">{r.conflict_note||r.qa_status||'รอยืนยันหลักฐาน/ชิ้นส่วน'}</small></td>
      <td className="wo-evidence-col">{r.evidence_url?.startsWith('https://drive.google.com/')?<a target="_blank" rel="noreferrer" href={r.evidence_url}>เปิดภาพ / PDF</a>:<small>รอหลักฐาน</small>}</td>
     </tr>})}
    </tbody></table></div>
   </section>}
   {inactiveHoldError&&<div className="panel wo-error" role="status">ตรวจรายการ HOLD ที่ยังไม่ Active ไม่สำเร็จ: {inactiveHoldError} (งานพร้อมแจกยังแสดงตามเดิม)</div>}
   {inactiveHoldInScope.length>0&&<section className="panel wo-sheet wo-hold-section wo-unapproved-hold" aria-label="HOLD ที่ยังไม่ Active สำหรับติดตามภายใน">
    <div className="wo-sheet-title"><h2>HOLD ที่ยังไม่ Active (ติดตามภายในเท่านั้น)</h2>
     <span>{inactiveHoldInScope.length} รายการ • ไม่รวมยอดงานพร้อมแจก / ไม่พิมพ์ใบแจกงาน / ไม่เปลี่ยนสถานะอนุมัติ</span>
    </div>
    <div className="table-wrap wo-table-wrap"><table className="wo-table"><thead><tr>
     <th>ห้อง / Work ID</th><th>วันที่รับแจ้ง</th><th>รายละเอียด Defect</th><th>สิ่งที่ต้องตรวจสอบ</th><th>ทีม / ผู้รับเหมา</th><th>สถานะ / หลักฐาน</th>
    </tr></thead><tbody>
     {inactiveHoldInScope.map(r=><tr key={r.work_id} className="wo-hold-row">
      <td><b>{groupLabel(r.room_group)}</b><small>{r.work_id}</small></td>
      <td>{noticeDateTH(r.received_date)}</td>
      <td>{r.defect_item}</td>
      <td>{r.next_action||'รอระบุรายละเอียด'}</td>
      <td>{r.contractor}</td>
      <td><span className="wo-hold-badge">HOLD — ไม่ Active</span><b>{displayWorkStatus(r.work_status)}</b>
       <small>{r.qa_status||'รอ QA'}</small><small>ตรวจ Master/Approval ก่อนเปิดใช้งาน</small>
       {r.evidence_url?.startsWith('https://drive.google.com/')&&<a target="_blank" rel="noreferrer" href={r.evidence_url}>เปิดหลักฐาน</a>}
      </td>
     </tr>)}
    </tbody></table></div>
   </section>}
   <p className="wo-screen-scope">ขอบเขต: {scope} • {filtered.length} รายการ</p>
  </>}
 </AppShell>
}