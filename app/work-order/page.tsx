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
  defect_item:string;next_action:string|null;supervisor:string|null;
  received_date:string|null;due_date:string|null;work_status:string|null;
  evidence_url:string|null;qa_status:string|null;conflict_note:string|null;
  source_sync_note:string|null;source_modified_at:string;imported_at:string;
}
type RoomStatus={room_no:string;status_group:string|null}
type Quick='ALL'|'A'|'B'|'OVERDUE'|'IN_PROGRESS'

const dateTH=(v:string|null|undefined)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'รอยืนยัน'
function dateTimeTH(v:string|null|undefined){
 if(!v)return '—'
 const d=new Date(v)
 if(Number.isNaN(d.getTime()))return '—'
 return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}
const ids=(group:string):string[]=>[...new Set((group.toUpperCase().match(/[AB]\d{3}/g)||[]).flatMap(room=>hotelRoomMembers(room)))]
const isCombine=(group:string)=>ids(group).some(room=>hotelRoomMembers(room).length>1)
const finished=(v:string|null)=>/เสร็จแล้ว|งดแจก|ยกเลิก/.test(v||'')
// Label-only change: the Excel/source work_status is preserved.
const displayWorkStatus=(v:string|null)=>v?.trim()==='ยังไม่เริ่ม'?'กำลังดำเนินงาน':v||'รอตรวจ'
const inProgress=(v:string|null)=>v?.trim()==='ยังไม่เริ่ม'||/กำลัง(ทำ|ดำเนิน)|อยู่ระหว่าง/.test(v||'')
const overdue=(v:string|null)=>Boolean(v&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T23:59:59+07:00').getTime()<Date.now())
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
 const [rooms,setRooms]=useState<RoomStatus[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [quick,setQuick]=useState<Quick>('ALL')
 const [query,setQuery]=useState('')
 const [contractor,setContractor]=useState('ALL')
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
  const [order,master]=await Promise.all([
   sb.from('defect_work_order_snapshot').select('work_id,room_group,building,contractor,defect_item,next_action,supervisor,received_date,due_date,work_status,evidence_url,qa_status,conflict_note,source_sync_note,source_modified_at,imported_at').eq('source_active',true).order('work_id'),
   sb.from('condo_room_status').select('room_no,status_group')
  ])
  if(order.error||master.error)throw new Error(order.error?.message||master.error?.message||'อ่านข้อมูลไม่สำเร็จ')
  setRows((order.data||[]) as WorkOrder[])
  setRooms((master.data||[]) as RoomStatus[])
 },[])
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
 const eligible=useMemo(()=>rows.filter(r=>{
  if(finished(r.work_status))return false
  const members=ids(r.room_group)
  return members.length>0&&members.every(room=>roomMap.get(room)==='Hotel - Incomplete')
 }),[rows,roomMap])
 const teams=useMemo(()=>[...new Set(eligible.map(r=>r.contractor))].sort((a,b)=>a.localeCompare(b,'th')),[eligible])
 // Search and contractor limit the context for every KPI; the selected KPI
 // then selects the rows that appear in the table and on the printed report.
 const inScope=useMemo(()=>{
  const needle=normalize(query)
  return eligible.filter(r=>{
   if(contractor!=='ALL'&&r.contractor!==contractor)return false
   if(!needle)return true
   return normalize([r.work_id,r.room_group,roomSearchText(r.room_group),r.defect_item,r.next_action,r.contractor,r.supervisor].filter(Boolean).join(' ')).includes(needle)
  })
 },[eligible,query,contractor])
 const filtered=useMemo(()=>inScope.filter(r=>{
  if(quick==='A'||quick==='B'){if(r.building!==quick)return false}
  if(quick==='OVERDUE'&&!overdue(r.due_date))return false
  if(quick==='IN_PROGRESS'&&!inProgress(r.work_status))return false
  return true
 }).sort((a,b)=>a.contractor.localeCompare(b.contractor,'th')||a.room_group.localeCompare(b.room_group)||a.work_id.localeCompare(b.work_id)),[inScope,quick])
 const byContractor=useMemo(()=>{
  const counts=new Map<string,number>()
  for(const row of filtered)counts.set(row.contractor,(counts.get(row.contractor)||0)+1)
  return [...counts.entries()].sort(([a],[b])=>a.localeCompare(b,'th'))
 },[filtered])
 const latestImport=rows.map(r=>r.imported_at).filter(Boolean).sort().at(-1)||null
 const counters={
  ALL:inScope.length,
  A:inScope.filter(r=>r.building==='A').length,
  B:inScope.filter(r=>r.building==='B').length,
  OVERDUE:inScope.filter(r=>overdue(r.due_date)).length,
  IN_PROGRESS:inScope.filter(r=>inProgress(r.work_status)).length
 }
 const labels:Record<Quick,string>={ALL:'งานค้างทั้งหมด',A:'อาคาร A',B:'อาคาร B',OVERDUE:'เกินกำหนด 7 วัน',IN_PROGRESS:'กำลังดำเนินการ'}
 const scope=labels[quick]+' • '+(contractor==='ALL'?'ทุกผู้รับเหมา':contractor)+(query?' • ค้นหา '+query:'')
 if(!permitted)return <AppShell><section className="panel" role="alert">สิทธิ์ Work Order จำกัดสำหรับทีม 3 Kings ที่ได้รับสิทธิ์ Defect เท่านั้น</section></AppShell>
 return <AppShell>
  <PageHeader title="Above Condo — Work Order" subtitle="รายการงานค้างรายจุด • สำหรับทีม 3 Kings • อ่านอย่างเดียว"
   action={<div className="update-meta"><span>อัพเดทล่าสุด</span><b>{dateTimeTH(latestImport)}</b></div>}/>
  {error&&<div className="panel wo-error" role="alert">ไม่สามารถตรวจข้อมูล Work Order กับ Defect Report ได้: {error} <button type="button" className="button" onClick={()=>{setLoading(true);void reload().then(()=>setError('')).catch(e=>setError(String(e))).finally(()=>setLoading(false))}}>ลองใหม่</button></div>}
  {loading?<div className="panel">กำลังตรวจสอบข้อมูล Work Order ล่าสุด…</div>:!error&&<>
   <section className="wo-kpis" aria-label="กรองรายการตามจำนวนงาน">
    {(['ALL','A','B','OVERDUE','IN_PROGRESS'] as Quick[]).map(kind=><button key={kind} type="button" aria-pressed={quick===kind} className={'wo-kpi '+(quick===kind?'selected ':'')+(kind==='OVERDUE'?'late':'')} onClick={()=>setQuick(kind)}>
     <span>{labels[kind]}</span><b>{counters[kind]}</b><small>รายการงาน</small>
    </button>)}
    <div className="wo-kpi wo-kpi-contractors" aria-label="จำนวนงานแยกผู้รับเหมาตามตัวกรอง">
     <div><span>รวมตามผู้รับเหมา</span><b>{filtered.length}</b><small>รายการงานตามตัวกรองปัจจุบัน</small></div>
     <div className="wo-kpi-team-list">{byContractor.map(([name,count])=><span key={name} className="wo-kpi-team"><strong>{name}</strong><b>{count}</b></span>)}
      {!byContractor.length&&<small>ไม่พบรายการงานค้าง</small>}
     </div>
    </div>
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
    {(query||quick!=='ALL'||contractor!=='ALL')&&<button type="button" className="button" onClick={()=>{setQuery('');setQuick('ALL');setContractor('ALL')}}>ล้างตัวกรอง</button>}
   </section>
   <section className="panel wo-sheet">
    <div className="wo-sheet-title"><h2>รายการสำหรับตรวจและแจกงาน</h2><span>แสดง {filtered.length} รายการ</span></div>
    <div className="table-wrap wo-table-wrap"><table className="wo-table"><thead><tr>
     <th>ห้อง / Work ID</th><th>รายละเอียด Defect</th><th>งานที่ต้องทำต่อ</th><th>ผู้รับเหมา</th>
     <th>ผู้คุม</th><th>รับแจ้ง / ครบ 7 วัน</th><th>สถานะงาน / ตรวจสอบ</th><th>หลักฐาน</th><th className="wo-print-only">ตรวจงาน / ลงชื่อ</th>
    </tr></thead><tbody>
     {filtered.map(r=><tr key={r.work_id}>
      <td><div className="wo-room-label"><b>{groupLabel(r.room_group)}</b>{isCombine(r.room_group)&&<span className="wo-combine-code" title="ห้อง Combine">c</span>}</div>{isCombine(r.room_group)&&<span className="wo-combine-badge" title="ห้อง Combine ใช้งานชุดเดียวกัน">Combine: {ids(r.room_group).join(' + ')}</span>}<small>{r.work_id}</small></td>
      <td>{r.defect_item}</td>
      <td>{r.next_action||'รอระบุรายละเอียด'}{r.conflict_note&&<small className="wo-conflict">ตรวจข้อขัดแย้ง: {r.conflict_note}</small>}</td>
      <td><b>{r.contractor}</b></td>
      <td>{r.supervisor||'—'}</td>
      <td><small>รับแจ้ง: {dateTH(r.received_date)}</small><small>ครบ 7 วัน: {dateTH(r.due_date)}</small>{overdue(r.due_date)&&<small className="wo-overdue">เกินกำหนด</small>}</td>
      <td><b>{displayWorkStatus(r.work_status)}</b><small>{r.qa_status||'รอตรวจรายการ'}</small></td>
      <td>{r.evidence_url?.startsWith('https://drive.google.com/')?<a target="_blank" rel="noreferrer" href={r.evidence_url}>เปิดภาพ / PDF</a>:<small>รอหลักฐาน</small>}</td>
      <td className="wo-print-only wo-signoff"><div>□ ตรวจงานแล้ว</div><div>ลงชื่อ ........................</div><div>วันที่ ....../....../......</div></td>
     </tr>)}
     {!filtered.length&&<tr><td colSpan={8} className="wo-empty">ไม่พบรายการงานค้างตามตัวกรอง</td><td className="wo-print-only"/></tr>}
    </tbody></table></div>
   </section>
   <p className="wo-screen-scope">ขอบเขต: {scope} • {filtered.length} รายการ • ผู้คุมอาคาร A: พี่ปู / อาคาร B: บังรุน</p>
  </>}
 </AppShell>
}
