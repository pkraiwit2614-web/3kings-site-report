'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import useAccessRole from '@/components/useAccessRole'
import {canAccessWorkOrder,canEditDefect} from '@/lib/accessControl'
import {getSupabase} from '@/lib/supabase'
import {hotelRoomLabel,hotelRoomMembers} from '@/lib/hotelRoomGroups'
import './work-order.css'

type WorkOrder={
  work_id:string;room_group:string;building:'A'|'B';contractor:string;
  defect_item:string;next_action:string|null;
  received_date:string|null;due_date:string|null;work_status:string|null;
  evidence_url:string|null;qa_status:string|null;conflict_note:string|null;
  source_sync_note:string|null;source_modified_at:string;imported_at:string;
  web_completed_at:string|null;writeback_state:'pending'|'error'|'synced'|null;writeback_error:string|null;
}
type RoomStatus={room_no:string;status_group:string|null;latest_source:string|null;source_note:string|null}
type Quick='ALL'|'A'|'B'|'OVERDUE'
const HOTEL_NOTICE_DATE_BY_ROOM:Record<string,string>={
 A202:'2026-09-21',A211:'2026-09-24',A313:'2026-09-26',A314:'2026-09-26',A326:'2026-09-26',
 A410:'2026-09-27',A412:'2026-09-27',A501:'2026-09-16',A616:'2026-09-27',B212:'2026-09-22',B214:'2026-09-23'
}
// Match the source and fallback dates already used in Defect Report; never infer from Excel's due_date.
function hotelNoticeISO(r:RoomStatus|undefined):string|null{
 if(!r)return null
 const sourceText=[r.latest_source,r.source_note].filter(Boolean).join(' ')
 const m=sourceText.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/)
 if(m){
  const year=Number(m[3]),month=Number(m[2]),day=Number(m[1])
  const checked=new Date(Date.UTC(year,month-1,day))
  if(checked.getUTCFullYear()===year&&checked.getUTCMonth()===month-1&&checked.getUTCDate()===day)
   return String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')
 }
 return HOTEL_NOTICE_DATE_BY_ROOM[r.room_no]||null
}
const noticeDateTH=(iso:string|null)=>iso?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+String(Number(iso.slice(0,4))+543).slice(-2):'-'
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
const finished=(v:string|null)=>/เสร็จแล้ว|งดแจก|ยกเลิก/.test(v||'')
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
 // Disabled in existing deployments. Enable only after protected original-XLSX E2E QA.
 const completionEnabled=process.env.NEXT_PUBLIC_WORK_ORDER_COMPLETION_ENABLED==='true'
 const canComplete=permitted&&canEditDefect(role)&&completionEnabled
 const [rows,setRows]=useState<WorkOrder[]>([])
 const [rooms,setRooms]=useState<RoomStatus[]>([])
 const [inactiveRows,setInactiveRows]=useState<WorkOrder[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [quick,setQuick]=useState<Quick>('ALL')
 const [query,setQuery]=useState('')
 const [contractor,setContractor]=useState('ALL')
 const [confirmRow,setConfirmRow]=useState<WorkOrder|null>(null)
 const [saving,setSaving]=useState(false)
 const [saveError,setSaveError]=useState('')
 const [completionMessage,setCompletionMessage]=useState('')
 // Allow read-only room-scoped navigation from Defect Report and OOO/OOS.
 // Do not change the existing eligible-work-item or permission rules.
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search)
  const requestedRoom=params.get('room')||params.get('q')
  if(!requestedRoom)return
  setQuery(requestedRoom)
  setQuick('ALL')
  setContractor('ALL')
 },[])

 const reload=useCallback(async()=>{
  const sb=getSupabase()
  const [order,master,inactive]=await Promise.all([
   sb.from('defect_work_order_snapshot').select('work_id,room_group,building,contractor,defect_item,next_action,received_date,due_date,work_status,evidence_url,qa_status,conflict_note,source_sync_note,source_modified_at,imported_at,web_completed_at,writeback_state,writeback_error').eq('source_active',true).order('work_id'),
   sb.from('condo_room_status').select('room_no,status_group,latest_source,source_note'),
   sb.from('defect_work_order_snapshot').select('work_id,room_group,building,contractor,defect_item,next_action,work_status,source_modified_at,imported_at,web_completed_at,writeback_state,writeback_error').eq('source_active',false).order('work_id')
  ])
  if(order.error||master.error||inactive.error)throw new Error(order.error?.message||master.error?.message||inactive.error?.message||'อ่านข้อมูลไม่สำเร็จ')
  setRows((order.data||[]) as WorkOrder[])
  setRooms((master.data||[]) as RoomStatus[])
  setInactiveRows((inactive.data||[]) as WorkOrder[])
 },[])
 const confirmCompletion=async()=>{
  if(!canComplete||!confirmRow||saving)return
  setSaving(true)
  setSaveError('')
  setCompletionMessage('')
  try{
   const {data,error:rpcError}=await getSupabase().rpc('defect_work_order_complete',{p_work_id:confirmRow.work_id})
   const result=data as {ok?:boolean;error?:string}|null
   if(rpcError||!result?.ok)throw new Error(rpcError?.message||result?.error||'ไม่สามารถยืนยันการปิด Work ID')
   const accepted=confirmRow.work_id
   setConfirmRow(null)
   setCompletionMessage('ยืนยันงาน '+accepted+' แล้ว • คิวเขียนกลับ Excel ยังต้องตรวจสอบก่อนถือว่า Synced')
   await reload()
  }catch(e){setSaveError(e instanceof Error?e.message:String(e))}
  finally{setSaving(false)}
 }
 useEffect(()=>{
  let alive=true
  const load=async()=>{try{await reload();if(alive)setError('')}catch(e){if(alive){setError(e instanceof Error?e.message:String(e));setRows([]);setRooms([])}}finally{if(alive)setLoading(false)}}
  void load()
  const onFocus=()=>{void load()}
  window.addEventListener('focus',onFocus)
  const ticker=window.setInterval(()=>{void load()},300000)
  const channel=getSupabase().channel('work-order-viewer-room-status').on('postgres_changes',{event:'*',schema:'public',table:'condo_room_status'},()=>{void load()}).subscribe()
  return()=>{alive=false;window.removeEventListener('focus',onFocus);window.clearInterval(ticker);void getSupabase().removeChannel(channel)}
 },[reload])

 const roomMap=useMemo(()=>new Map(rooms.map(r=>[r.room_no,r.status_group])),[rooms])
 // The server RPC currently permits only Hotel - Incomplete rooms. Keep the
 // read-only Non-Hotel work list, but do not offer its users a write action.
 const canCompleteWorkId=(r:WorkOrder)=>{
  const members=[...new Set(r.room_group.toUpperCase().match(/[AB]\d{3}/g)||[])]
  return members.length>0&&members.every(room=>roomMap.get(room)==='Hotel - Incomplete')
 }
 const completionReceipts=useMemo(()=>rows.filter(r=>r.web_completed_at).sort((a,b)=>
  (b.web_completed_at||'').localeCompare(a.web_completed_at||'')).slice(0,8),[rows])
 const noticeMap=useMemo(()=>new Map(rooms.map(r=>[r.room_no,hotelNoticeISO(r)])),[rooms])
 const todayISO=todayInBangkok()
 const noticeForRow=(r:WorkOrder):string|null=>ids(r.room_group).map(room=>noticeMap.get(room)||null).filter((v):v is string=>Boolean(v)).sort()[0]||null
 const daysForRow=(r:WorkOrder)=>elapsedCalendarDays(noticeForRow(r),todayISO)
 // Dispatch is defined by an active, unfinished Work ID, not by room handover state.
 // The read query already restricts this collection to source_active=true.
 const eligible=useMemo(()=>rows.filter(r=>!finished(r.work_status)&&ids(r.room_group).length>0),[rows])
 const reviewLostFromDispatch=useMemo(()=>inactiveRows.filter(r=>!finished(r.work_status)&&ids(r.room_group).length>0),[inactiveRows])
 // A newly reported Defect may be open after room acceptance. Flag it for
 // access checks but keep it in the screen and printable follow-up list.
 const reviewNeedsRoomRecheck=useMemo(()=>eligible.filter(r=>ids(r.room_group).some(room=>{
  const group=roomMap.get(room)
  return !group||group==='Hotel - Checked Complete'||group==='Non-Hotel - Handover Complete'
 })),[eligible,roomMap])
 const teams=useMemo(()=>[...new Set(eligible.map(r=>r.contractor))].sort((a,b)=>a.localeCompare(b,'th')),[eligible])
 // Search and contractor limit the context for every KPI; the selected KPI
 // then selects the rows that appear in the table and on the printed report.
 const inScope=useMemo(()=>{
  const needle=normalize(query)
  return eligible.filter(r=>{
   if(contractor!=='ALL'&&r.contractor!==contractor)return false
   if(!needle)return true
   return normalize([r.work_id,r.room_group,roomSearchText(r.room_group),r.defect_item,r.next_action,r.contractor].filter(Boolean).join(' ')).includes(needle)
  })
 },[eligible,query,contractor])
 const filtered=useMemo(()=>inScope.filter(r=>{
  if(quick==='A'||quick==='B'){if(r.building!==quick)return false}
  if(quick==='OVERDUE'&&!((daysForRow(r)??0)>7))return false
  return true
 }).sort((a,b)=>a.contractor.localeCompare(b.contractor,'th')||a.room_group.localeCompare(b.room_group)||a.work_id.localeCompare(b.work_id)),[inScope,quick,noticeMap,todayISO])
 const latestWorkDetailSourceAt=rows.map(r=>r.source_modified_at).filter(Boolean).sort().at(-1)||null
 const kpiRows:Record<Quick,WorkOrder[]>={
  ALL:inScope,A:inScope.filter(r=>r.building==='A'),B:inScope.filter(r=>r.building==='B'),
  OVERDUE:inScope.filter(r=>(daysForRow(r)??0)>7)
 }
 const counters:Record<Quick,number>={ALL:kpiRows.ALL.length,A:kpiRows.A.length,B:kpiRows.B.length,OVERDUE:kpiRows.OVERDUE.length}
 const kpiContractors:Record<Quick,[string,number][]>={ALL:contractorCounts(kpiRows.ALL),A:contractorCounts(kpiRows.A),B:contractorCounts(kpiRows.B),OVERDUE:contractorCounts(kpiRows.OVERDUE)}
 const labels:Record<Quick,string>={ALL:'งานที่กำลังดำเนินการทั้งหมด',A:'อาคาร A',B:'อาคาร B',OVERDUE:'งานค้างเกิน 7 วัน'}
 const scope=labels[quick]+' • '+(contractor==='ALL'?'ทุกผู้รับเหมา':contractor)+(query?' • ค้นหา '+query:'')
 if(!permitted)return <AppShell><section className="panel" role="alert">สิทธิ์ Work Order จำกัดสำหรับทีม 3 Kings ที่ได้รับสิทธิ์ Defect เท่านั้น</section></AppShell>
 return <AppShell>
  <PageHeader title="Above Condo — Work Order" subtitle={canComplete?'รายการงานค้างรายจุด • ปิดงานตาม Work ID (รอเขียนกลับ Excel)':'รายการงานค้างรายจุด • สำหรับทีม 3 Kings • อ่านอย่างเดียว'}
   action={<div className="wo-update-meta"><span>ข้อมูลอัปเดต</span><b>{dateTimeTH(latestWorkDetailSourceAt)}</b></div>}/>
  {completionMessage&&<div className="panel wo-completion-notice" role="status">{completionMessage}</div>}
  {canComplete&&completionReceipts.length>0&&<section className="panel wo-completion-receipts" aria-label="สถานะเขียนกลับ Excel">
   <b>สถานะยืนยันงานราย Work ID (ล่าสุด)</b>
   <div>{completionReceipts.map(r=><div key={r.work_id} className="wo-receipt-row">
    <span>{r.work_id}</span><span>{r.writeback_state==='synced'?'Excel Synced':r.writeback_state==='error'?'Excel Error — รอตรวจสอบ':'Pending — รอเขียน Excel'}</span>
    {r.writeback_state==='error'&&r.writeback_error&&<small>{r.writeback_error}</small>}
   </div>)}</div>
  </section>}
  {error&&<div className="panel wo-error" role="alert">ไม่สามารถตรวจข้อมูล Work Order กับ Defect Report ได้: {error} <button type="button" className="button" onClick={()=>{setLoading(true);void reload().then(()=>setError('')).catch(e=>setError(String(e))).finally(()=>setLoading(false))}}>ลองใหม่</button></div>}
  {loading?<div className="panel">กำลังตรวจสอบข้อมูล Work Order ล่าสุด…</div>:!error&&<>
   <section className="wo-kpis" aria-label="กรองรายการตามจำนวนงาน">
    {(['ALL','A','B','OVERDUE'] as Quick[]).map(kind=><button key={kind} type="button" aria-pressed={quick===kind} className={'wo-kpi '+(quick===kind?'selected ':'')+(kind==='OVERDUE'?'late':'')} onClick={()=>setQuick(kind)}>
     <div className="wo-kpi-head"><span>{labels[kind]}</span><b>{counters[kind]}</b></div>
     <small>รายการงาน</small>
     <div className="wo-kpi-team-list" aria-label="จำนวนงานแยกผู้รับเหมา">
      {kpiContractors[kind].map(([name,count])=><span key={name} className="wo-kpi-team"><strong>{name}</strong><b>{count}</b></span>)}
      {!kpiContractors[kind].length&&<small>ไม่มีงานค้าง</small>}
     </div>
    </button>)}
   </section>
   <details className="panel wo-reconciliation">
    <summary>ตรวจความต่าง Excel ↔ Defect: {reviewLostFromDispatch.length} งานค้างไม่อยู่ในชุดแจกงาน · {reviewNeedsRoomRecheck.length} งานค้างในห้องตรวจรับแล้ว/รอตรวจสถานะ</summary>
    <p>งานที่ยังไม่ปิดในทะเบียน Active จะแสดงในรายการและใบพิมพ์เสมอ แม้ห้องส่งมอบแล้ว ข้อมูลส่วนนี้ใช้ตรวจสอบเท่านั้น ไม่เปิดงานหรือปิดงานจากเว็บโดยอัตโนมัติ</p>
    {reviewLostFromDispatch.length>0&&<div><b>ค้างในทะเบียนเดิม แต่ถูกถอดจากรายการ Active ใน Excel</b>
      <ul>{reviewLostFromDispatch.map(r=><li key={r.work_id}><b>{groupLabel(r.room_group)}</b> · {r.work_id} · {r.defect_item} · ตรวจชีตใบแจกงานต้นฉบับก่อนเปิดกลับ</li>)}</ul>
    </div>}
    {reviewNeedsRoomRecheck.length>0&&<div><b>งานค้างในห้องที่ตรวจรับแล้ว หรือยังตรวจสถานะไม่ได้ (ยังแสดงในใบติดตามงาน)</b>
      <ul>{reviewNeedsRoomRecheck.map(r=><li key={r.work_id}><b>{groupLabel(r.room_group)}</b> · {r.work_id} · {r.defect_item} · ยืนยันสิทธิ์เข้าห้องและตรวจรายการก่อนเข้าทำ</li>)}</ul>
    </div>}
   </details>
   <section className="panel wo-filters">
    <label>ค้นหา ห้อง / งาน / ผู้รับเหมา
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="เช่น A524, B102, Good02, ฝักบัว, RSE"/>
    </label>
    <label>ผู้รับเหมา
     <select value={contractor} onChange={e=>setContractor(e.target.value)}>
      <option value="ALL">ทุกผู้รับเหมา</option>{teams.map(t=><option value={t} key={t}>{t}</option>)}
     </select>
    </label>
    {(query||quick!=='ALL'||contractor!=='ALL')&&<button type="button" className="button" onClick={()=>{setQuery('');setQuick('ALL');setContractor('ALL')}}>ล้างตัวกรอง</button>}
   </section>
   <section className="panel wo-sheet">
    <div className="wo-sheet-title"><h2>รายการสำหรับตรวจและแจกงาน</h2><span>แสดง {filtered.length} รายการ</span></div>
    <div className="table-wrap wo-table-wrap"><table className="wo-table"><thead><tr>
     <th>ห้อง / Work ID</th><th>รับแจ้ง</th><th>รายละเอียด Defect</th><th>งานที่ต้องทำต่อ</th><th>ผู้รับเหมา</th>
     <th>สถานะงาน / ตรวจสอบ</th><th className="wo-evidence-col">หลักฐาน</th><th className="wo-print-only">ตรวจงาน / ลงชื่อ</th>
    </tr></thead><tbody>
     {filtered.map(r=>{const notice=noticeForRow(r);const elapsed=elapsedCalendarDays(notice,todayISO);return <tr key={r.work_id}>
      <td><div className="wo-room-label"><b>{groupLabel(r.room_group)}</b>{isCombine(r.room_group)&&<span className="wo-combine-code" title="ห้อง Combine">c</span>}</div>{isCombine(r.room_group)&&<span className="wo-combine-badge" title="ห้อง Combine ใช้งานชุดเดียวกัน">Combine: {ids(r.room_group).join(' + ')}</span>}<small>{r.work_id}</small></td>
      <td><small>วันที่แจ้ง : {noticeDateTH(notice)}</small><small>เหลือเวลา : {elapsed===null?'-':elapsed+' วัน'}</small>{elapsed!==null&&elapsed>7?<small className="wo-overdue">เกินกำหนด</small>:elapsed!==null&&elapsed>4?<small className="wo-warning">{warningText(elapsed)}</small>:null}</td>
      <td>{r.defect_item}</td>
      <td>{r.next_action||'รอระบุรายละเอียด'}</td>
      <td><b>{r.contractor}</b></td>
      <td><b>{displayWorkStatus(r.work_status)}</b><small>{r.qa_status||'รอตรวจรายการ'}</small>{canComplete&&canCompleteWorkId(r)&&<button type="button" className="wo-complete-btn" onClick={()=>{setSaveError('');setConfirmRow(r)}}>ยืนยันงานเสร็จ</button>}</td>
      <td className="wo-evidence-col">{r.evidence_url?.startsWith('https://drive.google.com/')?<a target="_blank" rel="noreferrer" href={r.evidence_url}>เปิดภาพ / PDF</a>:<small>รอหลักฐาน</small>}</td>
      <td className="wo-print-only wo-signoff"><div>□ ตรวจงานแล้ว</div><div>ลงชื่อ ........................</div><div>วันที่ ....../....../......</div></td>
     </tr>})}
     {!filtered.length&&<tr><td colSpan={7} className="wo-empty">ไม่พบรายการงานค้างตามตัวกรอง</td><td className="wo-print-only"/></tr>}
    </tbody></table></div>
   </section>
   <p className="wo-screen-scope">ขอบเขต: {scope} • {filtered.length} รายการ</p>
  </>}
  {canComplete&&confirmRow&&<div className="wo-modal-backdrop" role="presentation"><div className="wo-confirm-panel" role="dialog" aria-modal="true" aria-label="ยืนยันปิด Work ID">
   <h2>ยืนยันงานเสร็จตาม Work ID</h2>
   <p><b>{confirmRow.work_id}</b> · {groupLabel(confirmRow.room_group)} · {confirmRow.defect_item}</p>
   <p>การยืนยันนี้บันทึกคำสั่งปิดงานรายรายการ และเข้าสู่คิวเขียนกลับ Excel เท่านั้น ไม่เปลี่ยนสถานะห้อง Defect หรือยืนยันว่า Excel ซิงก์สำเร็จแล้ว</p>
   {saveError&&<p className="wo-overdue" role="alert">{saveError}</p>}
   <div className="wo-modal-actions"><button type="button" disabled={saving} onClick={()=>setConfirmRow(null)}>ยกเลิก</button><button type="button" disabled={saving} onClick={()=>{void confirmCompletion()}}>{saving?'กำลังบันทึก':'ยืนยันปิดงาน'}</button></div>
  </div></div>}
 </AppShell>
}
