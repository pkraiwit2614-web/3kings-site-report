'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import useAccessRole from '@/components/useAccessRole'
import {getSupabase} from '@/lib/supabase'
import {hotelRoomLabel,hotelRoomMembers,normalizeHotelRoom} from '@/lib/hotelRoomGroups'

type Day={day_no:number;planned_date:string|null;note:string|null;revision:number;sync_state:string;updated_by_name:string|null;updated_at:string|null}
type Room={seq_no:number;day_no:number;source_room:string;room_no:string;planned_date_override:string|null;actual_date:string|null;work_status:string;note:string|null;revision:number;sync_state:string;updated_by_name:string|null;updated_at:string|null}
type Defect={room_no:string;defect_detail:string|null;status_group:string|null;current_status:string|null;next_action:string|null;follow_up:string|null}
type Hotel={room_no:string;availability_status:string;start_date:string|null;end_date:string|null}
const LABELS:Record<string,string>={pending:'รอกำหนด / รอดำเนินการ',confirmed:'ยืนยันนัดหมาย',in_progress:'กำลังทำ',completed:'ทำงานตามแผนแล้ว',postponed:'เลื่อนแผน'}
const HOTEL:Record<string,string>={AVAILABLE:'พร้อมให้บริการ',OOO:'OOO',OOS:'OOS',UNKNOWN:'รอตรวจสอบ'}
const SOURCE_URL='https://docs.google.com/spreadsheets/d/1KZ-VMDssYeMmTE-TNLYU0d8fwQkSUtuS/edit'
const dateTH=(v:string|null|undefined)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—'
function contractorFor(defect:string|null,building:string){
 const tasks=(defect||'').split(/[\n;|]+/).map(v=>v.trim()).filter(Boolean)
 const check=(part:string)=>{
  const labels:string[]=[]
  if(/เฟอร์นิเจอร์|furniture|บานตู้|ตู้เสื้อผ้า|ลิ้นชัก|โต๊ะ|เตียง|บานพับตู้/i.test(part))labels.push('Pre Fur.')
  if(/อลูมิเนียม|alumini|alumin|กรอบหน้าต่าง|บานเลื่อน|กระจกกั้น|กระจกแตก/i.test(part))labels.push('ทองทวี')
  if(/ก่อ|ฉาบ|ยาแนว|ทาสี|เก็บสี|ผนัง|กระเบื้อง|ซิลิโคน|กันซึม|water leakage|น้ำซึม|พื้นห้อง/i.test(part))labels.push(building==='B'?'หมู่ 8':'3 Kings')
  if(/ระบบ|ไฟฟ้า|ไฟไม่|สวิตช์|switch|rcu|คีย์การ์ด|กริ่ง|แอร์|remote|รีโมท|boiler|น้ำไหล|น้ำลง|ท่อ|drain|p-trap|trap|water pressure|stop valve|น้ำรั่ว/i.test(part))labels.push(building==='B'?'RSE':'ขอพงษ์')
  return {part,labels:[...new Set(labels)]}
 }
 return tasks.map(check)
}
export default function HotelWorkPlanPage(){
 const {role}=useAccessRole()
 const editable=role==='owner'||role==='defect_editor'
 const [days,setDays]=useState<Day[]>([])
 const [rooms,setRooms]=useState<Room[]>([])
 const [defects,setDefects]=useState<Defect[]>([])
 const [hotels,setHotels]=useState<Hotel[]>([])
 const [selectedDay,setSelectedDay]=useState(1)
 const [selectedSeq,setSelectedSeq]=useState<number|null>(null)
 const [roomSearch,setRoomSearch]=useState('')
 const [building,setBuilding]=useState('ALL')
 const [dayDate,setDayDate]=useState('')
 const [dayNote,setDayNote]=useState('')
 const [roomDay,setRoomDay]=useState(1)
 const [roomDate,setRoomDate]=useState('')
 const [roomActual,setRoomActual]=useState('')
 const [roomStatus,setRoomStatus]=useState('pending')
 const [roomNote,setRoomNote]=useState('')
 const [saving,setSaving]=useState(false)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const refresh=useCallback(async()=>{
  const s=getSupabase()
  const result=await Promise.all([
   s.from('hotel_work_plan_days').select('day_no,planned_date,note,revision,sync_state,updated_by_name,updated_at').order('day_no'),
   s.from('hotel_work_plan_rooms').select('seq_no,day_no,source_room,room_no,planned_date_override,actual_date,work_status,note,revision,sync_state,updated_by_name,updated_at').order('seq_no'),
   s.from('condo_room_status').select('room_no,defect_detail,status_group,current_status,next_action,follow_up').order('room_no'),
   s.from('hotel_room_availability').select('room_no,availability_status,start_date,end_date')
  ])
  const failed=result.find(r=>r.error)
  if(failed?.error)throw Error(failed.error.message)
  setDays((result[0].data||[]) as Day[])
  setRooms((result[1].data||[]) as Room[])
  setDefects((result[2].data||[]) as Defect[])
  setHotels((result[3].data||[]) as Hotel[])
 },[])
 useEffect(()=>{
  let alive=true
  const load=async()=>{try{await refresh();if(alive)setError('')}catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}finally{if(alive)setLoading(false)}}
  void load()
  const onFocus=()=>{void load()}
  window.addEventListener('focus',onFocus)
  return()=>{alive=false;window.removeEventListener('focus',onFocus)}
 },[refresh])
 const day=days.find(d=>d.day_no===selectedDay)
 const selected=rooms.find(r=>r.seq_no===selectedSeq)
 useEffect(()=>{setDayDate(day?.planned_date||'');setDayNote(day?.note||'')},[day?.day_no,day?.revision,day?.planned_date,day?.note])
 useEffect(()=>{
  setRoomDay(selected?.day_no||selectedDay);setRoomDate(selected?.planned_date_override||'')
  setRoomActual(selected?.actual_date||'');setRoomStatus(selected?.work_status||'pending');setRoomNote(selected?.note||'')
 },[selected?.seq_no,selected?.revision])
 const defectMap=useMemo(()=>new Map(defects.map(d=>[d.room_no,d])),[defects])
 const hotelMap=useMemo(()=>new Map(hotels.map(d=>[d.room_no,d])),[hotels])
 const planDate=(r:Room)=>r.planned_date_override||days.find(d=>d.day_no===r.day_no)?.planned_date||null
 const statusFor=(room:string)=>hotelRoomMembers(room).map(member=>hotelMap.get(member)).find(Boolean)
 const filtered=useMemo(()=>{
  const query=roomSearch.trim().toUpperCase()
  const normalized=normalizeHotelRoom(query)
  return rooms.filter(r=>r.day_no===selectedDay&&(building==='ALL'||r.room_no.startsWith(building))&&(!query||[r.room_no,r.source_room,hotelRoomLabel(r.room_no)].some(s=>s.toUpperCase().includes(query))||r.room_no.includes(normalized)))
 },[rooms,selectedDay,building,roomSearch])
 const duplicates=useMemo(()=>{const count=new Map<string,number>();rooms.forEach(r=>count.set(r.room_no,(count.get(r.room_no)||0)+1));return count},[rooms])
 const saveDay=async()=>{
  if(!editable||!day)return
  setSaving(true);setError('');setMessage('')
  const {error:e}=await getSupabase().rpc('hotel_work_plan_save_day',{p_day:selectedDay,p_planned_date:dayDate||null,p_note:dayNote,p_expected_revision:day.revision})
  if(e)setError(e.message);else {setMessage('บันทึกแผนแล้ว • รอการซิงก์กลับ Excel ต้นฉบับ');try{await refresh()}catch(ex){setError(String(ex))}}
  setSaving(false)
 }
 const saveRoom=async()=>{
  if(!editable||!selected)return
  setSaving(true);setError('');setMessage('')
  const {error:e}=await getSupabase().rpc('hotel_work_plan_save_room',{p_seq:selected.seq_no,p_day:roomDay,p_override_date:roomDate||null,p_actual_date:roomActual||null,p_status:roomStatus,p_note:roomNote,p_expected_revision:selected.revision})
  if(e)setError(e.message);else {setMessage('บันทึกรายห้องแล้ว • รอการซิงก์กลับ Excel ต้นฉบับ');try{await refresh()}catch(ex){setError(String(ex))}}
  setSaving(false)
 }
 const selectedDefect=selected?defectMap.get(selected.room_no):undefined
 const workItems=selected?contractorFor(selectedDefect?.defect_detail||null,selected.room_no[0]):[]
 return <AppShell>
  <PageHeader title="Hotel Work Plan | Day 1–9" subtitle="Above Element · คิวโรงแรม 267 รายการ · วันที่จริงยังไม่กำหนดในไฟล์ต้นฉบับ"
   action={<div className="work-head"><a href={SOURCE_URL} target="_blank" rel="noreferrer" className="button">Excel ต้นฉบับ</a><Link className="button" href="/calendar">Work Calendar</Link></div>}/>
  {error&&<div className="panel" role="alert" style={{color:'#9e312d'}}>โหลด/บันทึกข้อมูลไม่ได้: {error} <button className="button" onClick={()=>{void refresh().then(()=>setError('')).catch(e=>setError(String(e)))}}>ลองใหม่</button></div>}
  {message&&<div className="panel" role="status">{message}</div>}
  {loading?<div className="panel">กำลังโหลดแผนโรงแรม…</div>:<>
   <section className="work-days" aria-label="เลือกแผน Day 1 ถึง Day 9">
    {days.map(d=>{
     const records=rooms.filter(r=>r.day_no===d.day_no)
     const open=records.filter(r=>defectMap.get(r.room_no)?.status_group==='Hotel - Incomplete').length
     const review=records.filter(r=>defectMap.get(r.room_no)?.status_group==='Hotel - Awaiting Check').length
     return <button type="button" key={d.day_no} onClick={()=>{setSelectedDay(d.day_no);setSelectedSeq(null)}} className={'work-day '+(selectedDay===d.day_no?'current':'')}>
      <strong>Day {d.day_no}</strong><span>{records.length} รายการ</span>
      <small>ค้าง {open} · รอตรวจ {review}</small>
      <small className="work-date">{dateTH(d.planned_date)}</small>
     </button>
    })}
   </section>
   <section className="panel work-day-editor">
    <div><h2>Day {selectedDay} <small>({rooms.filter(r=>r.day_no===selectedDay).length} รายการ)</small></h2>
     <p className="muted small">วันที่กลางของ Day ใช้กับทุกห้องที่ไม่มีวันที่เฉพาะ · เปลี่ยนแผนไม่เปลี่ยนสถานะ Defect หรือ OOO/OOS</p></div>
    <label>วันที่เข้าทำงาน<input type="date" value={dayDate} disabled={!editable||saving} onChange={e=>setDayDate(e.target.value)}/></label>
    <label>หมายเหตุการนัดหมาย<input value={dayNote} maxLength={2000} disabled={!editable||saving} onChange={e=>setDayNote(e.target.value)} placeholder="รอโรงแรมยืนยัน / ข้อจำกัด"/></label>
    {editable&&<button className="button" disabled={saving} onClick={()=>{void saveDay()}}>บันทึก Day {selectedDay}</button>}
    {day?.updated_at&&<small className="work-history">แก้ไขล่าสุด {day.updated_by_name||'ผู้ใช้'} · {new Date(day.updated_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · {day.sync_state==='pending'?'รอซิงก์ Excel':day.sync_state==='conflict'?'ข้อมูลขัดแย้ง':'ซิงก์แล้ว'}</small>}
   </section>
   <section className="panel work-table">
    <div className="work-filter"><div><h2>รายการห้อง · Day {selectedDay}</h2><small>คลิกเลขห้องเพื่อดูรายละเอียดและผู้รับเหมา</small></div>
     <input aria-label="ค้นหาเลขห้อง" placeholder="ค้นหาห้อง เช่น A212, Good02" value={roomSearch} onChange={e=>setRoomSearch(e.target.value)}/>
     <select aria-label="กรองอาคาร" value={building} onChange={e=>setBuilding(e.target.value)}><option value="ALL">อาคาร A + B</option><option value="A">อาคาร A</option><option value="B">อาคาร B</option></select>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Seq.</th><th>ห้อง</th><th>วันที่แผน</th><th>วันที่จริง</th><th>สถานะแผน</th><th>Defect ปัจจุบัน</th><th>OOO/OOS</th><th>รายละเอียด</th></tr></thead><tbody>
    {filtered.map(r=>{
     const df=defectMap.get(r.room_no),hotel=statusFor(r.room_no)
     return <tr key={r.seq_no}><td>{r.seq_no}</td><td><button className="work-room-link" onClick={()=>setSelectedSeq(r.seq_no)}>{hotelRoomLabel(r.room_no)}</button>{duplicates.get(r.room_no)!>1&&<small className="work-duplicate">มีมากกว่า 1 คิว</small>}</td>
      <td>{dateTH(planDate(r))}</td><td>{dateTH(r.actual_date)}</td><td>{LABELS[r.work_status]||r.work_status}</td>
      <td>{df?.status_group||'—'}</td><td>{HOTEL[hotel?.availability_status||'UNKNOWN']}</td>
      <td><button className="button" onClick={()=>setSelectedSeq(r.seq_no)}>ดู{editable?' / แก้ไข':''}</button></td></tr>
    })}
    {!filtered.length&&<tr><td colSpan={8}>ไม่พบห้องตามตัวกรอง</td></tr>}
    </tbody></table></div>
   </section>
   {selected&&<section className="panel work-room-detail" id="work-room-detail">
    <div className="work-room-heading"><div><h2>ห้อง {hotelRoomLabel(selected.room_no)}</h2><small>Seq. {selected.seq_no} · Day {selected.day_no} · Room ID หลัก {selected.room_no}</small></div>
     <button className="button" onClick={()=>setSelectedSeq(null)}>ปิดรายละเอียด</button></div>
    <div className="work-facts"><span>วันตามแผน: <b>{dateTH(planDate(selected))}</b></span><span>สถานะห้อง: <b>{HOTEL[statusFor(selected.room_no)?.availability_status||'UNKNOWN']}</b></span>
     <span>สถานะ Defect: <b>{selectedDefect?.status_group||'—'}</b></span></div>
    <h3>รายละเอียด Defect / ผู้รับเหมาที่รับผิดชอบ</h3>
    {workItems.length? <div className="work-tasks">{workItems.map((item,i)=><div key={i}><span>{item.part}</span><strong>{item.labels.join(' / ')||'รอจำแนกผู้รับผิดชอบ'}</strong></div>)}</div>
     :<p className="muted small">ไม่มีรายละเอียดงาน Defect ให้จำแนกผู้รับเหมาในขณะนี้</p>}
    {(selectedDefect?.next_action||selectedDefect?.follow_up)&&<p className="muted small">ต้องติดตาม: {selectedDefect.next_action||selectedDefect.follow_up}</p>}
    <p className="muted small">ระบบเสนอผู้รับเหมาจากประเภทงานและอาคารเท่านั้น ต้องตรวจความถูกต้องกับรายการจริงก่อนมอบหมาย</p>
    <div className="work-room-editor">
      <label>Day<select disabled={!editable||saving} value={roomDay} onChange={e=>setRoomDay(Number(e.target.value))}>{days.map(d=><option key={d.day_no} value={d.day_no}>Day {d.day_no}</option>)}</select></label>
      <label>วันที่เฉพาะห้อง<input disabled={!editable||saving} type="date" value={roomDate} onChange={e=>setRoomDate(e.target.value)}/></label>
      <label>วันเข้าจริง<input disabled={!editable||saving} type="date" value={roomActual} onChange={e=>setRoomActual(e.target.value)}/></label>
      <label>สถานะแผน<select disabled={!editable||saving} value={roomStatus} onChange={e=>setRoomStatus(e.target.value)}>{Object.entries(LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="work-note">หมายเหตุ<input disabled={!editable||saving} value={roomNote} maxLength={2000} onChange={e=>setRoomNote(e.target.value)}/></label>
    </div>
    {editable&&<button type="button" className="button" disabled={saving} onClick={()=>{void saveRoom()}}>บันทึกรายห้อง</button>}
    {selected.updated_at&&<p className="work-history">แก้ไขล่าสุด {selected.updated_by_name||'ผู้ใช้'} · {new Date(selected.updated_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · Revision {selected.revision} · {selected.sync_state==='pending'?'รอซิงก์ Excel':selected.sync_state==='conflict'?'ข้อมูลขัดแย้ง':'ซิงก์แล้ว'}</p>}
    <p><Link href={'/defects?q='+encodeURIComponent(selected.room_no)+'#room-list'}>เปิด Defect Report ของห้องนี้</Link></p>
   </section>}
   <p className="muted small">อ้างอิงลำดับ 267 รายการจาก Hotel Day 1–9 Snapshot 13/10/2026 · สถานะ Defect/OOO/OOS อ้างอิงจากระบบล่าสุด ไม่ใช่ Snapshot · ประวัติการแก้ไขแผนเก็บใน Activity Log</p>
  </>}
  <style jsx>{`
    .work-head{display:flex;flex-wrap:wrap;gap:6px}.work-days{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:6px;margin:0 0 12px}
    .work-day{min-width:0;display:flex;flex-direction:column;text-align:left;gap:2px;border:1px solid #d9e0e7;border-radius:10px;padding:9px;background:#fff;cursor:pointer;color:#172a43;font:inherit}
    .work-day.current{border-color:#172a43;box-shadow:inset 0 0 0 1px #172a43;background:#f0f6ff}.work-day strong{font-size:13px}.work-day span,.work-day small{font-size:10px}.work-day small{color:#69798a}
    .work-date{white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:700}.work-day-editor{display:grid;grid-template-columns:minmax(170px,1.4fr) minmax(140px,.8fr) minmax(180px,1.5fr) auto;align-items:end;gap:10px;margin-bottom:12px}
    .work-day-editor h2,.work-table h2,.work-room-detail h2{margin:0;font-size:16px}.work-day-editor p{margin:3px 0 0}.work-day-editor label,.work-room-editor label{display:grid;gap:4px;font-size:10.5px;font-weight:700;min-width:0}
    .work-day-editor input,.work-room-editor input,.work-room-editor select,.work-filter input,.work-filter select{font:inherit;font-size:11px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;min-width:0;max-width:100%;background:#fff}
    .work-history{font-size:10px;color:#64748b;grid-column:1/-1}.work-table{padding-bottom:0}.work-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}.work-filter>div{flex:1}.work-filter input{flex:0 1 230px}.work-filter select{flex:0 1 125px}
    .work-table .table-wrap{max-height:65vh;overflow:auto}.work-table table{width:100%;min-width:780px}.work-table th{position:sticky;top:0;z-index:2}.work-table td{font-size:10.5px;vertical-align:middle}.work-table td .button{font-size:10px;padding:5px 8px}
    .work-room-link{background:none;border:0;text-decoration:underline;color:#175187;font-weight:800;font-size:11px;cursor:pointer}.work-duplicate{display:block;color:#935513;font-size:9px}
    .work-room-detail{margin-top:12px}.work-room-heading{display:flex;justify-content:space-between;align-items:center}.work-facts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.work-facts span{background:#f2f5f9;border-radius:8px;padding:8px;font-size:10px}
    .work-room-detail h3{font-size:13px;margin:12px 0 7px}.work-tasks{display:grid;gap:6px}.work-tasks>div{display:flex;gap:12px;justify-content:space-between;align-items:start;border:1px solid #e1e6ec;padding:7px 9px;border-radius:8px;font-size:11px}.work-tasks strong{flex:0 0 130px;color:#365979;text-align:right}
    .work-room-editor{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:15px 0 10px}.work-note{grid-column:1/-1}
    @media(max-width:1200px){.work-days{grid-template-columns:repeat(5,minmax(0,1fr))}.work-day-editor{grid-template-columns:1fr 1fr}.work-day-editor>div{grid-column:1/-1}}
    @media(max-width:650px){.work-days{grid-template-columns:repeat(3,minmax(0,1fr))}.work-day-editor,.work-room-editor{grid-template-columns:1fr}.work-note{grid-column:auto}.work-filter input,.work-filter select{flex:1 1 100%}.work-tasks>div{flex-direction:column}.work-tasks strong{flex:auto;text-align:left}}
    @media print{.work-days button{break-inside:avoid}.work-day-editor button,.work-room-editor,.work-filter,.work-room-detail button{display:none!important}.work-table .table-wrap{max-height:none;overflow:visible}}
  `}</style>
 </AppShell>
}
