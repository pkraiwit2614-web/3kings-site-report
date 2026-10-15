'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import useAccessRole from '@/components/useAccessRole'
import {canEditWorkPlan} from '@/lib/accessControl'
import {getSupabase} from '@/lib/supabase'
import {hotelRoomKey,hotelRoomLabel,hotelRoomMembers,normalizeHotelRoom} from '@/lib/hotelRoomGroups'
import {statusLabel,statusTone} from '@/lib/defectStatusPresentation'

type Day={day_no:number;planned_date:string|null;note:string|null;revision:number;sync_state:string;updated_by_name:string|null;updated_at:string|null}
type Room={seq_no:number;day_no:number;source_room:string;room_no:string;planned_date_override:string|null;actual_date:string|null;work_status:string;note:string|null;revision:number;sync_state:string;updated_by_name:string|null;updated_at:string|null}
type Defect={room_no:string;defect_detail:string|null;status_group:string|null;current_status:string|null;hotel_participation:string|null;next_action:string|null;follow_up:string|null}
type Hotel={room_no:string;availability_status:string;start_date:string|null;end_date:string|null}
type SaveChange={label:string;before:string;after:string}
type DaySaveValues={p_day:number;p_planned_date:string|null;p_note:string;p_expected_revision:number}
type RoomSaveValues={p_seq:number;p_day:number;p_override_date:string|null;p_actual_date:string|null;p_status:string;p_note:string;p_expected_revision:number;p_group_expected?:{seq:number;revision:number}[]}
type SaveIntent=
 |{kind:'day';target:string;changes:SaveChange[];values:DaySaveValues}
 |{kind:'room';target:string;changes:SaveChange[];values:RoomSaveValues;affectedRows?:string[]}
type SaveDialog={phase:'confirm'|'saving'|'success'|'error';intent:SaveIntent;returnedRevision?:number;feedback?:string}
type DiffField={label:string;before:string|null|undefined;after:string|null|undefined;format?:(value:string)=>string}
function buildSaveChanges(fields:DiffField[]):SaveChange[]{
 return fields.filter(field=>(field.before||'')!==(field.after||'')).map(field=>({
  label:field.label,
  before:field.format?field.format(field.before||''):field.before||'—',
  after:field.format?field.format(field.after||''):field.after||'—',
 }))
}
const LABELS:Record<string,string>={pending:'รอกำหนด / รอดำเนินการ',confirmed:'ยืนยันนัดหมาย',in_progress:'กำลังทำ',completed:'ทำงานตามแผนแล้ว',postponed:'เลื่อนแผน'}
const HOTEL:Record<string,string>={AVAILABLE:'พร้อมให้บริการ',OOO:'OOO',OOS:'OOS',UNKNOWN:'รอตรวจสอบ'}
const dateTH=(v:string|null|undefined)=>v&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—'
const verifiedSyncTimeTH=(iso:string)=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso))+' น.'
function contractorFor(defect:string|null,building:string){
 // Show only trade-level classification supported by the agreed contractor rules.
 // Do not treat an unconfirmed defect item as a work order.
 const tasks=(defect||'').split(/[\n;|]+/).map(v=>v.trim()).filter(Boolean)
 return tasks.map(part=>{
  const labels:string[]=[]
  if(/เฟอร์นิเจอร์|furniture/i.test(part))labels.push('Pre Fur.')
  if(/อลูมิเนียม|alumini|alumin/i.test(part))labels.push('ทองทวี')
  if(/ก่อ|ฉาบ|ยาแนว|ทาสี|เก็บสี|งานสี/i.test(part))labels.push(building==='B'?'หมู่ 8':'3 Kings')
  if(/ระบบ|ไฟฟ้า|ไฟไม่|สวิตช์|switch|rcu|คีย์การ์ด|กริ่ง|แอร์|รีโมทแอร์|boiler|ท่อน้ำ|drain|p-trap|ไฟเส้น|ท่อระบายน้ำ/i.test(part))labels.push(building==='B'?'RSE':'ขอพงษ์')
  return {part,labels:[...new Set(labels)]}
 })
}
export default function HotelWorkPlanPage(){
 const {role}=useAccessRole()
 const editable=canEditWorkPlan(role)
 const [days,setDays]=useState<Day[]>([])
 const [rooms,setRooms]=useState<Room[]>([])
 const [defects,setDefects]=useState<Defect[]>([])
 const [hotels,setHotels]=useState<Hotel[]>([])
 const [selectedDay,setSelectedDay]=useState(0)
 const [selectedSeq,setSelectedSeq]=useState<number|null>(null)
 const [roomSearch,setRoomSearch]=useState('')
 const [defectStatusFilter,setDefectStatusFilter]=useState('ALL')
 const [initialRoom,setInitialRoom]=useState<string|null>(null)
 useEffect(()=>{const room=new URLSearchParams(window.location.search).get('room');if(room){setRoomSearch(room);setInitialRoom(room)}},[])
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
 const [excelVerifiedAt,setExcelVerifiedAt]=useState<string|null>(null)
 const [saveDialog,setSaveDialog]=useState<SaveDialog|null>(null)
 const refresh=useCallback(async()=>{
  const s=getSupabase()
  const result=await Promise.all([
   s.from('hotel_work_plan_days').select('day_no,planned_date,note,revision,sync_state,updated_by_name,updated_at').order('day_no'),
   s.from('hotel_work_plan_rooms').select('seq_no,day_no,source_room,room_no,planned_date_override,actual_date,work_status,note,revision,sync_state,updated_by_name,updated_at').order('seq_no'),
   s.from('condo_room_status').select('room_no,defect_detail,status_group,current_status,hotel_participation,next_action,follow_up').order('room_no'),
   s.from('hotel_room_availability').select('room_no,availability_status,start_date,end_date'),
   s.from('hotel_work_plan_sync_control').select('last_verified_at').eq('id',true).maybeSingle()
  ])
  const failed=result.find(r=>r.error)
  if(failed?.error)throw Error(failed.error.message)
  setDays((result[0].data||[]) as Day[])
  setRooms((result[1].data||[]) as Room[])
  setDefects((result[2].data||[]) as Defect[])
  setHotels((result[3].data||[]) as Hotel[])
  setExcelVerifiedAt((result[4].data as {last_verified_at:string|null}|null)?.last_verified_at||null)
 },[])
 useEffect(()=>{
  let alive=true
  const load=async()=>{try{await refresh();if(alive)setError('')}catch(e){if(alive)setError(e instanceof Error?e.message:String(e))}finally{if(alive)setLoading(false)}}
  void load()
  const onFocus=()=>{void load()}
  window.addEventListener('focus',onFocus)
  return()=>{alive=false;window.removeEventListener('focus',onFocus)}
 },[refresh])
 // Keep the read-only Defect presentation current without resetting unsaved Work Plan forms.
 useEffect(()=>{
  const s=getSupabase()
  const channel=s.channel('hotel-work-plan-defect-status').on('postgres_changes',
   {event:'*',schema:'public',table:'condo_room_status'},()=>{
    void s.from('condo_room_status').select('room_no,defect_detail,status_group,current_status,hotel_participation,next_action,follow_up').order('room_no')
     .then(({data,error})=>{if(!error)setDefects((data||[]) as Defect[])})
   }).subscribe()
  return()=>{void s.removeChannel(channel)}
 },[])
 // Refresh Hotel OOO/OOS presentation independently of any unsaved plan-date input.
 useEffect(()=>{
  const s=getSupabase()
  const channel=s.channel('hotel-work-plan-ooo-live').on('postgres_changes',
   {event:'*',schema:'public',table:'hotel_room_availability'},()=>{
    void s.from('hotel_room_availability').select('room_no,availability_status,start_date,end_date')
      .then(({data,error})=>{if(!error)setHotels((data||[]) as Hotel[])})
   }).subscribe()
  return()=>{void s.removeChannel(channel)}
 },[])
 // Keep the verified Excel readback timestamp fresh while this page remains open.
 // This reads only sync metadata and never touches Work Plan edits or source files.
 useEffect(()=>{
  let active=true
  const checkVerifiedSync=async()=>{
   const {data,error}=await getSupabase().from('hotel_work_plan_sync_control').select('last_verified_at').eq('id',true).maybeSingle()
   if(active&&!error)setExcelVerifiedAt((data as {last_verified_at:string|null}|null)?.last_verified_at||null)
  }
  const interval=window.setInterval(()=>{void checkVerifiedSync()},60_000)
  return()=>{active=false;window.clearInterval(interval)}
 },[])
 useEffect(()=>{
  if(!initialRoom||!rooms.length)return
  const room=normalizeHotelRoom(initialRoom)
  const match=rooms.find(r=>r.room_no===room)
  if(match)setSelectedDay(match.day_no)
  setInitialRoom(null)
 },[initialRoom,rooms])
 useEffect(()=>{
  if(selectedSeq!==null)window.requestAnimationFrame(()=>document.getElementById('work-room-detail')?.scrollIntoView({behavior:'smooth',block:'start'}))
 },[selectedSeq])
 const day=days.find(d=>d.day_no===selectedDay)
 const selected=rooms.find(r=>r.seq_no===selectedSeq)
 useEffect(()=>{setDayDate(day?.planned_date||'');setDayNote(day?.note||'')},[day?.day_no,day?.revision,day?.planned_date,day?.note])
 useEffect(()=>{
  setRoomDay(selected?.day_no||selectedDay);setRoomDate(selected?.planned_date_override||'')
  setRoomActual(selected?.actual_date||'');setRoomStatus(selected?.work_status||'pending');setRoomNote(selected?.note||'')
 },[selected?.seq_no,selected?.revision])
 const defectMap=useMemo(()=>new Map(defects.map(d=>[d.room_no,d])),[defects])
 const hotelMap=useMemo(()=>new Map(hotels.map(d=>[d.room_no,d])),[hotels])
 // Preserve every original Seq./Day row; Combine affects lookup and explicitly confirmed edits only.
 const defectFor=(room:string)=>defectMap.get(room)||hotelRoomMembers(room).map(member=>defectMap.get(member)).find(Boolean)
 const planDate=(r:Room)=>r.planned_date_override||days.find(d=>d.day_no===r.day_no)?.planned_date||null
 const statusFor=(room:string)=>hotelRoomMembers(room).map(member=>hotelMap.get(member)).find(Boolean)
 // Excel retains all 267 original rows; only the live view is filtered.
 const activePlanRooms=useMemo(()=>{
  const seen=new Set<string>()
  return rooms.filter(row=>{
   const members=hotelRoomMembers(row.room_no)
   if(!members.every(member=>['Hotel - Incomplete','Hotel - Awaiting Check'].includes(defectMap.get(member)?.status_group||'')&&hotelMap.get(member)?.availability_status==='OOO'))return false
   const key=hotelRoomKey(row.room_no)
   if(seen.has(key))return false
   seen.add(key)
   return true
  })
 },[rooms,defectMap,hotelMap])
 const pendingOosCount=useMemo(()=>new Set(rooms.filter(row=>
  hotelRoomMembers(row.room_no).some(member=>['Hotel - Incomplete','Hotel - Awaiting Check'].includes(defectMap.get(member)?.status_group||'')&&hotelMap.get(member)?.availability_status==='OOS')
 ).map(row=>hotelRoomKey(row.room_no))).size,[rooms,defectMap,hotelMap])
 const dateWithinOOO=(row:Room,date:string)=>hotelRoomMembers(row.room_no).every(member=>{
  const h=hotelMap.get(member)
  return h?.availability_status==='OOO'&&Boolean(h.start_date)&&date>=String(h.start_date)&&(!h.end_date||date<=h.end_date)
 })
 const defectStatusOptions=useMemo(()=>[...new Set(activePlanRooms.flatMap(r=>hotelRoomMembers(r.room_no).map(member=>defectMap.get(member)).filter((d):d is Defect=>!!d).map(statusLabel)))].sort((a,b)=>a.localeCompare(b,'th')),[activePlanRooms,defectMap])
 const filtered=useMemo(()=>{
  const query=roomSearch.trim().toUpperCase()
  const normalized=normalizeHotelRoom(query)
  return activePlanRooms.filter(r=>{
   if((selectedDay!==0&&r.day_no!==selectedDay)||(building!=='ALL'&&!r.room_no.startsWith(building)))return false
   const members=hotelRoomMembers(r.room_no)
   if(query&&!([r.source_room,...members.flatMap(member=>[member,hotelRoomLabel(member)])].some(value=>value.toUpperCase().includes(query))||members.some(member=>member.includes(normalized))))return false
   if(defectStatusFilter!=='ALL'&&!members.some(member=>{
    const d=defectMap.get(member)
    return d&&statusLabel(d)===defectStatusFilter
   }))return false
   return true
  })
 },[activePlanRooms,selectedDay,building,roomSearch,defectStatusFilter,defectMap])
 const duplicates=useMemo(()=>{const count=new Map<string,number>();rooms.forEach(r=>count.set(r.room_no,(count.get(r.room_no)||0)+1));return count},[rooms])
 // All is a read-only aggregate of the exact Day 1–9 card counts.
 // Keep the existing Combine-room deduplication and OOO/Defect eligibility unchanged.
 const dayCounts=days.map(d=>{
  const records=activePlanRooms.filter(r=>r.day_no===d.day_no)
  return {day_no:d.day_no,rooms:records.length,
   open:records.filter(r=>defectFor(r.room_no)?.status_group==='Hotel - Incomplete').length,
   review:records.filter(r=>defectFor(r.room_no)?.status_group==='Hotel - Awaiting Check').length}
 })
 const allTotals=dayCounts.reduce((total,d)=>({
  rooms:total.rooms+d.rooms,open:total.open+d.open,review:total.review+d.review,
 }),{rooms:0,open:0,review:0})
 const openDaySaveReview=()=>{
  if(!editable||!day||saving||saveDialog)return
  const values:DaySaveValues={
   p_day:day.day_no,p_planned_date:dayDate||null,p_note:day.note||'',p_expected_revision:day.revision,
  }
  const changes=buildSaveChanges([
   {label:'วันที่เข้าทำงาน',before:day.planned_date,after:values.p_planned_date,format:v=>dateTH(v)},
   {label:'หมายเหตุการนัดหมาย',before:day.note,after:values.p_note},
  ])
  const count=activePlanRooms.filter(r=>r.day_no===day.day_no).length
  if(dayDate&&activePlanRooms.filter(r=>r.day_no===day.day_no&&!r.planned_date_override).some(r=>!dateWithinOOO(r,dayDate))){
   window.alert('วันที่ Day ต้องอยู่ในช่วง OOO ที่โรงแรมยืนยัน กรุณาตรวจข้อมูลช่วงวันที่ในหน้า OOO/OOS')
   return
  }
  setSaveDialog({phase:'confirm',intent:{kind:'day',target:'Day '+day.day_no+' · '+count+' รายการ',changes,values}})
 }
 const openRoomSaveReview=()=>{
  if(!editable||!selected||saving||saveDialog)return
  const values:RoomSaveValues={
   p_seq:selected.seq_no,p_day:selected.day_no,p_override_date:roomDate||null,p_actual_date:selected.actual_date,
   p_status:selected.work_status,p_note:selected.note||'',p_expected_revision:selected.revision,
  }
  const groupRows=rooms.filter(r=>hotelRoomMembers(selected.room_no).includes(r.room_no))
  if(roomDate&&groupRows.some(r=>!dateWithinOOO(r,roomDate))){
   window.alert('วันที่เฉพาะห้องต้องอยู่ในช่วง OOO ที่โรงแรมยืนยันสำหรับทุกห้อง Combine')
   return
  }
  if(groupRows.length>1)values.p_group_expected=groupRows.map(r=>({seq:r.seq_no,revision:r.revision}))
  const changes=buildSaveChanges([
   {label:'Day',before:String(selected.day_no),after:String(values.p_day),format:v=>'Day '+v},
   {label:'วันที่เฉพาะห้อง',before:selected.planned_date_override,after:values.p_override_date,format:v=>v?dateTH(v):'ตามวันที่ของ Day'},
   {label:'วันเข้าจริง',before:selected.actual_date,after:values.p_actual_date,format:v=>dateTH(v)},
   {label:'สถานะแผน',before:selected.work_status,after:values.p_status,format:v=>LABELS[v]||v||'—'},
   {label:'หมายเหตุ',before:selected.note,after:values.p_note},
  ])
  setSaveDialog({phase:'confirm',intent:{kind:'room',target:'ห้อง '+hotelRoomLabel(selected.room_no)+' · Seq. '+selected.seq_no,changes,values,affectedRows:groupRows.length>1?groupRows.map(r=>hotelRoomLabel(r.room_no)+' · Seq. '+r.seq_no+' · Day '+r.day_no):undefined}})
 }
 const confirmSave=async()=>{
  if(!editable||saving||!saveDialog||saveDialog.phase!=='confirm'||!saveDialog.intent.changes.length)return
  const intent=saveDialog.intent
  setSaveDialog({phase:'saving',intent})
  setSaving(true)
  try{
   const response=intent.kind==='day'
    ?await getSupabase().rpc('hotel_work_plan_save_day',intent.values)
    :await getSupabase().rpc(intent.values.p_group_expected?'hotel_work_plan_save_combine_room':'hotel_work_plan_save_room',intent.values)
   if(response.error)throw Error(response.error.message)
   const receipt=response.data as {ok?:boolean;revision?:number}|null
   if(receipt?.ok!==true||typeof receipt.revision!=='number')throw Error('ไม่ได้รับผลยืนยันจากเซิร์ฟเวอร์ กรุณาตรวจสอบข้อมูลก่อนบันทึกซ้ำ')
   // The Work Plan RPC confirms the Web DB write only. Excel writeback is asynchronous.
   setSaveDialog({phase:'success',intent,returnedRevision:receipt.revision})
   if(intent.kind==='room')setSelectedDay(intent.values.p_day)
   try{await refresh()}
   catch(ex){setSaveDialog({phase:'success',intent,returnedRevision:receipt.revision,feedback:'บันทึกในฐานข้อมูลแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ: '+String(ex)})}
  }catch(ex){
   // An ambiguous transport error is not proof that the server never received the request.
   setSaveDialog({phase:'error',intent,feedback:ex instanceof Error?ex.message:String(ex)})
  }finally{setSaving(false)}
 }
 useEffect(()=>{
  if(!saveDialog)return
  const onEscape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&saveDialog.phase!=='saving'&&!saving)setSaveDialog(null)
  }
  window.addEventListener('keydown',onEscape)
  window.requestAnimationFrame(()=>{
   document.getElementById(saveDialog.phase==='confirm'?'work-save-confirm':'work-save-close')?.focus()
  })
  return()=>window.removeEventListener('keydown',onEscape)
 },[saveDialog?.phase,saving])
 const selectedDefect=selected?defectFor(selected.room_no):undefined
 const combineRows=selected?rooms.filter(r=>hotelRoomMembers(selected.room_no).includes(r.room_no)):[]
 const combineStatusConflict=selected&&new Set(hotelRoomMembers(selected.room_no).map(member=>defectMap.get(member)).filter((d):d is Defect=>!!d).map(statusLabel)).size>1
 const workItems=selected?contractorFor(selectedDefect?.defect_detail||null,selected.room_no[0]):[]
 return <AppShell>
  <PageHeader title="Hotel Work Plan | Day 1–9" subtitle="Above Element · คัดเฉพาะ Defect ค้าง/รอตรวจและห้องที่โรงแรมยืนยัน OOO · Day 1–9 ตามต้นฉบับ"
   action={<div className="work-head">
    <div className="work-update-meta" role="status" aria-label="ข้อมูลอัปเดตไฟล์ Defect Work Plan" title="เวลาซิงก์ Excel ที่ยืนยันอ่านกลับจาก Google Drive">
     <span>อัพเดทล่าสุด</span>
     <b className={!excelVerifiedAt?'work-update-unverified':undefined}>{excelVerifiedAt?<time dateTime={excelVerifiedAt}>{verifiedSyncTimeTH(excelVerifiedAt)}</time>:'ยังไม่ยืนยันการซิงก์ Excel'}</b>
    </div>
    <Link className="button" href="/calendar">Work Calendar</Link>
   </div>}/> 
  {error&&<div className="panel" role="alert" style={{color:'#9e312d'}}>โหลด/บันทึกข้อมูลไม่ได้: {error} <button className="button" onClick={()=>{void refresh().then(()=>setError('')).catch(e=>setError(String(e)))}}>ลองใหม่</button></div>}
  {loading?<div className="panel">กำลังโหลดแผนโรงแรม…</div>:<>
   <div className="work-plan-top">
    <section className="work-days" aria-label="เลือกแผน Day 1 ถึง Day 9 หรือ All">
     {days.map(d=>{
      const counts=dayCounts.find(item=>item.day_no===d.day_no)!
      return <button type="button" key={d.day_no} onClick={()=>{setSelectedDay(d.day_no);setSelectedSeq(null)}} className={'work-day '+(selectedDay===d.day_no?'current':'')}>
       <strong>Day {d.day_no}</strong><span>{counts.rooms} ชุดห้อง</span>
       <small>กำลังดำเนินการ {counts.open} · Defect เสร็จแล้ว/รอตรวจ {counts.review}</small>
       <small className="work-date">{dateTH(d.planned_date)}</small>
      </button>
     })}
     <button type="button" onClick={()=>{setSelectedDay(0);setSelectedSeq(null)}} className={'work-day '+(selectedDay===0?'current':'')}>
      <strong>All</strong><span>{allTotals.rooms} ชุดห้อง</span>
      <small>กำลังดำเนินการ {allTotals.open} · Defect เสร็จแล้ว/รอตรวจ {allTotals.review}</small>
      <small className="work-date">Day 1–9</small>
     </button>
    </section>
    <section className="panel work-day-editor">
     {selectedDay===0?<div className="work-editor-all">
      <h2>All <small>({allTotals.rooms} ชุดห้อง)</small></h2>
      <p className="muted small">ภาพรวม Day 1–9 · เลือก Day ที่ต้องการเพื่อกรอกหรือแก้ไขวันที่เข้าทำงาน</p>
     </div>:<>
      <div><h2>Day {selectedDay} <small>({activePlanRooms.filter(r=>r.day_no===selectedDay).length} ชุดห้อง)</small></h2>
       <p className="muted small">วันที่กลางของ Day ใช้กับทุกห้องที่ไม่มีวันที่เฉพาะ</p></div>
      <label>วันที่เข้าทำงาน<input type="date" value={dayDate} disabled={!editable||saving} onChange={e=>setDayDate(e.target.value)}/></label>
      <label>หมายเหตุแผนเดิม<input value={dayNote} readOnly disabled title="อ้างอิงอย่างเดียว • หน้านี้แก้เฉพาะวันตามแผน"/></label>
      {editable&&<button type="button" className="button" disabled={saving||!!saveDialog} onClick={openDaySaveReview}>บันทึก Day {selectedDay}</button>}
      {day?.updated_at&&<small className="work-history">แก้ไขล่าสุด {day.updated_by_name||'ผู้ใช้'} · {new Date(day.updated_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · {day.sync_state==='pending'?'รอซิงก์ Excel':day.sync_state==='conflict'?'ข้อมูลขัดแย้ง':'ซิงก์แล้ว'}</small>}
     </>}
    </section>
   </div>
   <section className="panel work-table">
    <div className="work-filter"><div><h2>รายการห้อง · {selectedDay===0?'All':'Day '+selectedDay}</h2><small>คลิกเลขห้องเพื่อดูรายละเอียดและผู้รับเหมา</small></div>
     <input aria-label="ค้นหาเลขห้อง" placeholder="ค้นหาห้อง เช่น A212, Good02" value={roomSearch} onChange={e=>setRoomSearch(e.target.value)}/>
     <select aria-label="กรองอาคาร" value={building} onChange={e=>setBuilding(e.target.value)}><option value="ALL">อาคาร A + B</option><option value="A">อาคาร A</option><option value="B">อาคาร B</option></select>
     <select className="work-defect-filter" aria-label="กรองสถานะ Defect ปัจจุบัน" value={defectStatusFilter} onChange={e=>setDefectStatusFilter(e.target.value)}><option value="ALL">ทุกสถานะ Defect</option>{defectStatusOptions.map(label=><option key={label} value={label}>{label}</option>)}</select>
    </div>
    <div className="table-wrap"><table><thead><tr><th>ลำดับ</th><th>ห้อง</th><th>วันที่แผน</th><th>วันที่จริง</th><th>สถานะแผน</th><th>สถานะ Defect</th><th>OOO/OOS</th><th>รายละเอียด</th></tr></thead><tbody>
    {filtered.map((r,index)=>{
     const df=defectFor(r.room_no),hotel=statusFor(r.room_no)
     const peers=hotelRoomMembers(r.room_no).filter(member=>member!==r.room_no)
     return <tr key={r.seq_no}><td>{index+1}</td><td><button className="work-room-link" onClick={()=>setSelectedSeq(r.seq_no)}>{hotelRoomLabel(r.room_no)}</button>{peers.length>0&&<sup className="work-combine-symbol" title="ห้อง Combine">c</sup>}{peers.length>0&&<small className="work-combine">Combine: {peers.map(hotelRoomLabel).join(', ')}</small>}{duplicates.get(r.room_no)!>1&&<small className="work-duplicate">มีมากกว่า 1 คิว</small>}</td>
      <td>{selectedDay===0&&<small className="work-row-day">Day {r.day_no} · </small>}{dateTH(planDate(r))}</td><td>{dateTH(r.actual_date)}</td><td>{LABELS[r.work_status]||r.work_status}</td>
      <td><span className={'work-defect-badge '+(df?statusTone(df):'neutral')}>{df?statusLabel(df):'—'}</span></td><td>{hotel?.availability_status==='OOO'?<><b>OOO</b><small>{hotel.start_date?dateTH(hotel.start_date):'ไม่ระบุวันเริ่ม'} – {hotel.end_date?dateTH(hotel.end_date):'ไม่ระบุวันสิ้นสุด'}</small></>:hotel?.availability_status==='OOS'?'OOS':'—'}</td>
      <td><button className="button" onClick={()=>setSelectedSeq(r.seq_no)}>ดู{editable?' / แก้ไข':''}</button></td></tr>
    })}
    {!filtered.length&&<tr><td colSpan={8}>ไม่พบห้องตามตัวกรอง</td></tr>}
    </tbody></table></div>
   </section>
   {selected&&<section className="panel work-room-detail" id="work-room-detail">
    <div className="work-room-heading"><div><h2>ห้อง {hotelRoomLabel(selected.room_no)}</h2><small>รหัสอ้างอิง Excel {selected.seq_no} · Day {selected.day_no} · Room ID หลัก {selected.room_no}</small>{hotelRoomMembers(selected.room_no).length>1&&<sup className="work-combine-symbol" title="ห้อง Combine">c</sup>}</div>
     <button className="button" onClick={()=>setSelectedSeq(null)}>ปิดรายละเอียด</button></div>
    <div className="work-facts"><span>วันตามแผน: <b>{dateTH(planDate(selected))}</b></span><span>สถานะห้อง: <b>{HOTEL[statusFor(selected.room_no)?.availability_status||'UNKNOWN']}</b></span>
     <span>สถานะ Defect: <b className={'work-defect-badge '+(selectedDefect?statusTone(selectedDefect):'neutral')}>{selectedDefect?statusLabel(selectedDefect):'—'}</b></span></div>
    {combineRows.length>1&&<div className="work-combine-detail"><b>ห้อง Combine · กฎห้องคู่</b><div>{combineRows.map(r=><button key={r.seq_no} type="button" onClick={()=>{setSelectedDay(r.day_no);setSelectedSeq(r.seq_no)}}>{hotelRoomLabel(r.room_no)} · Seq. {r.seq_no} · Day {r.day_no}</button>)}</div><small>คิว Seq. ของแต่ละห้องยังแยกตามแผนโรงแรม การบันทึกการเปลี่ยนแปลงจะใช้กับทุกห้องในกลุ่ม โดยต้องยืนยันก่อน</small>{combineStatusConflict&&<small className="work-combine-conflict">สถานะ Defect ของห้องในกลุ่มไม่ตรงกัน โปรดตรวจสอบใน Defect Report</small>}</div>}
    <h3>รายละเอียด Defect / ผู้รับเหมาที่รับผิดชอบ</h3>
    {workItems.length? <div className="work-tasks">{workItems.map((item,i)=><div key={i}><span>{item.part}</span><strong>{item.labels.join(' / ')||'รอจำแนกผู้รับผิดชอบ'}</strong></div>)}</div>
     :<p className="muted small">ไม่มีรายละเอียดงาน Defect ให้จำแนกผู้รับเหมาในขณะนี้</p>}
    {(selectedDefect?.next_action||selectedDefect?.follow_up)&&<p className="muted small">ต้องติดตาม: {selectedDefect.next_action||selectedDefect.follow_up}</p>}
    <p className="muted small">แสดงทีมตามกฎประเภทงานและอาคารเฉพาะรายการที่มีคำระบุประเภทงานชัดเจน · รายการที่ไม่ชัดเจนคง “รอจำแนกผู้รับผิดชอบ” และต้องตรวจยืนยัน Defect ก่อนสั่งงาน</p>
    <div className="work-room-editor">
      <label>กลุ่มคิวตามต้นฉบับ<input value={"Day "+selected.day_no} disabled readOnly/></label>
      <label>วันที่เฉพาะห้อง<input disabled={!editable||saving} type="date" value={roomDate} onChange={e=>setRoomDate(e.target.value)}/></label>
      <label>วันเข้าจริง (ข้อมูลเดิม)<input disabled readOnly type="date" value={selected.actual_date||""}/></label>
      <label>สถานะแผนเดิม<input disabled readOnly value={LABELS[selected.work_status]||selected.work_status}/></label>
      <label className="work-note">หมายเหตุเดิม<input disabled readOnly value={selected.note||""}/></label>
    </div>
    {editable&&<button type="button" className="button" disabled={saving||!!saveDialog} onClick={openRoomSaveReview}>บันทึกรายห้อง</button>}
    {selected.updated_at&&<p className="work-history">แก้ไขล่าสุด {selected.updated_by_name||'ผู้ใช้'} · {new Date(selected.updated_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · Revision {selected.revision} · {selected.sync_state==='pending'?'รอซิงก์ Excel':selected.sync_state==='conflict'?'ข้อมูลขัดแย้ง':'ซิงก์แล้ว'}</p>}
    <p><Link href={'/defects?q='+encodeURIComponent(selected.room_no)+'#room-list'}>เปิด Defect Report ของห้องนี้</Link></p>
   </section>}
  </>}
  {saveDialog&&<div className="work-save-overlay" role="presentation"
    onMouseDown={e=>{if(e.target===e.currentTarget&&saveDialog.phase!=='saving'&&!saving)setSaveDialog(null)}}>
   <section className="work-save-dialog" role="dialog" aria-modal="true" aria-labelledby="work-save-title" aria-describedby="work-save-description">
    <div className="work-save-titlebar">
     <div>
      <small className={'work-save-state '+saveDialog.phase}>
       {saveDialog.phase==='confirm'?'ก่อนบันทึก · ยังไม่ส่งข้อมูล':
        saveDialog.phase==='saving'?'กำลังส่งข้อมูลไปยังระบบ':
        saveDialog.phase==='success'?'บันทึกเข้า Web App สำเร็จ':'ไม่สามารถยืนยันผลการบันทึก'}
      </small>
      <h2 id="work-save-title">{saveDialog.phase==='confirm'?'ตรวจสอบก่อนยืนยัน':
       saveDialog.phase==='saving'?'กำลังบันทึก…':
       saveDialog.phase==='success'?'บันทึกข้อมูลเรียบร้อย':'บันทึกไม่สำเร็จ / ต้องตรวจสอบ'}</h2>
     </div>
     {saveDialog.phase!=='saving'&&<button type="button" className="work-save-x" onClick={()=>setSaveDialog(null)} aria-label="ปิดหน้าต่าง">×</button>}
    </div>
    <p id="work-save-description" className="work-save-target">{saveDialog.intent.target}</p>
    {saveDialog.intent.kind==='room'&&saveDialog.intent.affectedRows&&<div className="work-combine-warning"><b>การแก้ไขจะมีผลกับทุกห้อง Combine:</b><p>{saveDialog.intent.affectedRows.join(' | ')}</p><p>Day / วันที่ / สถานะแผน / หมายเหตุจะถูกบันทึกให้ทุก Seq. ที่เกี่ยวข้อง และซิงก์ Excel ตามแต่ละรายการ</p></div>}
    {saveDialog.intent.changes.length>0?<div className="work-save-diffs">
     <b>สรุปการเปลี่ยนแปลง ({saveDialog.intent.changes.length} ช่อง)</b>
     {saveDialog.intent.changes.map(change=><div className="work-save-diff" key={change.label}>
      <strong>{change.label}</strong>
      <div><small>ก่อนบันทึก</small><span>{change.before}</span></div>
      <div><small>ค่าที่ส่งบันทึก</small><span>{change.after}</span></div>
     </div>)}
    </div>:<p className="work-save-nochange">ยังไม่มีข้อมูลเปลี่ยนแปลง จึงไม่จำเป็นต้องส่งบันทึก</p>}
    {saveDialog.phase==='success'&&<div className="work-save-feedback" role="status">
     <b>บันทึกใน Web App แล้ว · Revision {saveDialog.returnedRevision}</b>
     <p>ข้อมูลถูกยืนยันจากฐานข้อมูลแล้ว ส่วนการเขียนกลับไฟล์ Excel รอการซิงก์ตามรอบ ไม่ได้ยืนยันว่าไฟล์ Excel อัปเดตแล้ว</p>
     {saveDialog.feedback&&<p>{saveDialog.feedback}</p>}
    </div>}
    {saveDialog.phase==='error'&&<div className="work-save-failure" role="alert">
     <b>ยังยืนยันการบันทึกไม่ได้</b>
     <p>{saveDialog.feedback}</p>
     <p>หากพบ REVISION_CONFLICT_RELOAD หรือการเชื่อมต่อขัดข้อง ให้โหลดข้อมูลล่าสุดตรวจสอบก่อนส่งซ้ำ</p>
    </div>}
    <div className="work-save-actions">
     {saveDialog.phase==='confirm'?<>
      <button type="button" className="button" onClick={()=>setSaveDialog(null)}>ยกเลิก</button>
      <button type="button" id="work-save-confirm" className="button primary" disabled={saving||!saveDialog.intent.changes.length}
       onClick={()=>{void confirmSave()}}>ยืนยันบันทึก</button>
     </>:saveDialog.phase==='saving'?<button type="button" className="button" disabled>กำลังบันทึก…</button>:<>
      <button type="button" className="button primary" id="work-save-close" onClick={()=>setSaveDialog(null)}>ปิดหน้าต่าง</button>
     </>}
    </div>
   </section>
  </div>}
  <style jsx>{`
    .work-combine-symbol{font-size:10px;font-weight:800;margin-left:3px;color:#a45d12;vertical-align:super}

    .work-save-overlay{position:fixed;inset:0;z-index:1300;background:rgba(12,25,43,.46);display:grid;place-items:center;padding:16px}
    .work-save-dialog{width:min(510px,100%);max-height:calc(100dvh - 32px);overflow:auto;background:#fff;border:1px solid #d7dee8;border-radius:14px;padding:18px;box-shadow:0 18px 50px rgba(13,31,53,.23)}
    .work-save-titlebar{display:flex;align-items:start;justify-content:space-between;gap:12px}.work-save-titlebar h2{font-size:18px;margin:5px 0 0;color:#172a43}.work-save-state{font-size:11px;font-weight:800;color:#526779}.work-save-state.success{color:#217449}.work-save-state.error{color:#9d3030}.work-save-state.saving{color:#8b6b2b}
    .work-save-x{font-size:24px;background:none;border:0;color:#526779;cursor:pointer;padding:0 5px}.work-save-target{font-size:12px;color:#526779;margin:9px 0 14px}
    .work-save-diffs{display:grid;gap:9px}.work-save-diffs>b{font-size:12px;color:#172a43}
    .work-save-diff{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:5px 9px;border:1px solid #e3e8ef;border-radius:9px;padding:10px}
    .work-save-diff>strong{grid-column:1/-1;font-size:12px}.work-save-diff>div{display:grid;gap:4px;min-width:0}.work-save-diff small{font-size:10px;color:#69798a}.work-save-diff span{font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap;max-height:110px;overflow:auto}.work-save-diff>div:last-child span{color:#155888;font-weight:700}
    .work-save-nochange{padding:12px;border:1px solid #e3e8ef;border-radius:8px;font-size:12px}.work-save-feedback,.work-save-failure{margin-top:12px;padding:11px;border-radius:9px;font-size:11px;background:#f5f8fb;border:1px solid #dce5ef}.work-save-feedback b{color:#217449}.work-save-failure{background:#fff7f7;border-color:#edcaca}.work-save-failure b{color:#9d3030}.work-save-feedback p,.work-save-failure p{margin:5px 0 0;line-height:1.6}
    .work-save-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:15px;flex-wrap:wrap}
    .work-head{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px}.work-update-meta{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;gap:2px;line-height:1.25;text-align:right;margin-right:4px}.work-update-meta span{font-size:9px;color:var(--muted);font-weight:700}.work-update-meta b{font-size:11px;color:var(--navy);font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}.work-update-meta .work-update-unverified{color:#935513}.work-plan-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,32%);align-items:stretch;gap:10px;margin:0 0 12px}.work-days{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:7px;margin:0}
    .work-day{min-width:0;display:flex;flex-direction:column;text-align:left;gap:2px;border:1px solid #d9e0e7;border-radius:10px;padding:9px;background:#fff;cursor:pointer;color:#172a43;font:inherit}
    .work-day.current{border-color:#172a43;box-shadow:inset 0 0 0 1px #172a43;background:#f0f6ff}.work-day strong{font-size:13px}.work-day span,.work-day small{font-size:10px}.work-day small{color:#69798a;line-height:1.35}.work-editor-all{display:grid;align-content:start;gap:8px}.work-row-day{font-size:9px;font-weight:750;color:#425c78}
    .work-date{white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:700}.work-day-editor{display:flex;flex-direction:column;align-items:stretch;gap:10px;margin:0;padding:12px}.work-day-editor>.button{align-self:flex-end}
    .work-day-editor h2,.work-table h2,.work-room-detail h2{margin:0;font-size:16px}.work-day-editor p{margin:3px 0 0}.work-day-editor label,.work-room-editor label{display:grid;gap:4px;font-size:10.5px;font-weight:700;min-width:0}
    .work-day-editor input,.work-room-editor input,.work-room-editor select,.work-filter input,.work-filter select{font:inherit;font-size:11px;padding:8px;border:1px solid #cbd5e1;border-radius:8px;min-width:0;max-width:100%;background:#fff}
    .work-history{font-size:10px;color:#64748b;overflow-wrap:anywhere}.work-table{padding-bottom:0}.work-filter{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}.work-filter>div{flex:1}.work-filter input{flex:0 1 230px}.work-filter select{flex:0 1 125px}.work-filter select.work-defect-filter{flex:0 1 270px}
    .work-table .table-wrap{max-height:65vh;overflow:auto}.work-table table{width:100%;min-width:780px}.work-table th{position:sticky;top:0;z-index:2}.work-table td{font-size:10.5px;vertical-align:middle}.work-table td .button{font-size:10px;padding:5px 8px}
    .work-room-link{background:none;border:0;text-decoration:underline;color:#175187;font-weight:800;font-size:11px;cursor:pointer}.work-duplicate{display:block;color:#935513;font-size:9px}
    .work-room-detail{margin-top:12px}.work-room-heading{display:flex;justify-content:space-between;align-items:center}.work-facts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.work-facts span{background:#f2f5f9;border-radius:8px;padding:8px;font-size:10px}
    .work-room-detail h3{font-size:13px;margin:12px 0 7px}.work-tasks{display:grid;gap:6px}.work-tasks>div{display:flex;gap:12px;justify-content:space-between;align-items:start;border:1px solid #e1e6ec;padding:7px 9px;border-radius:8px;font-size:11px}.work-tasks strong{flex:0 0 130px;color:#365979;text-align:right}
    .work-room-editor{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:15px 0 10px}.work-note{grid-column:1/-1}
.work-defect-badge{display:inline-flex;align-items:center;justify-content:center;max-width:230px;white-space:normal;text-align:center;border:1px solid transparent;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:750;line-height:1.35}
    .work-defect-badge.danger{background:#fdeceb;border-color:#f1cdca;color:#9e312d}.work-defect-badge.warn{background:#fff3dc;border-color:#f0dfb8;color:#85570d}.work-defect-badge.good{background:#e9f6ef;border-color:#cfe9da;color:#196645}.work-defect-badge.neutral{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}
    .work-combine{display:block;color:#406a83;font-size:9px}.work-combine-detail{border:1px solid #d6e4f0;background:#f5f9fc;padding:10px;border-radius:8px;font-size:11px}.work-combine-detail>div{display:flex;flex-wrap:wrap;gap:6px;margin:7px 0}.work-combine-detail button{border:1px solid #bad0df;background:white;border-radius:7px;padding:5px 8px;cursor:pointer;font:inherit;font-weight:700;color:#1b567d}.work-combine-detail small{display:block;color:#52697f;margin-top:4px}.work-combine-detail .work-combine-conflict{color:#9e312d;font-weight:800}
    .work-combine-warning{border:1px solid #ead6ab;background:#fff9ea;padding:10px;border-radius:8px;font-size:11px;margin-bottom:10px}.work-combine-warning p{margin:5px 0;line-height:1.4}
    @media(max-width:1100px){.work-plan-top{grid-template-columns:minmax(0,1fr)}.work-day-editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:end}.work-day-editor>div{grid-column:1/-1}}
    @media(max-width:650px){.work-days{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:auto}.work-day-editor,.work-room-editor{grid-template-columns:1fr}.work-note{grid-column:auto}.work-filter input,.work-filter select{flex:1 1 100%}.work-tasks>div{flex-direction:column}.work-tasks strong{flex:auto;text-align:left}}
    @media print{
      /* Work Plan only: keep the selected Day table visible in report-print mode.
         The shared print rule otherwise hides panels containing filter inputs. */
      :global(body.report-print-mode .main) .panel.work-table{display:block!important;break-inside:auto!important;page-break-inside:auto!important;padding:0!important;margin:0!important;border:0!important}
      .work-day-editor,.work-room-detail{display:none!important}
      :global(body.report-print-mode[data-print-report="Hotel Work Plan | Day 1–9"] .report-print-filters){display:none!important}
      .work-plan-top{display:block!important;margin:0 0 5mm!important}
      .work-days{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;grid-template-rows:repeat(2,auto)!important;gap:2mm!important;margin:0!important}
      .work-day{display:flex!important;padding:2.5mm!important;min-height:19mm!important;break-inside:avoid!important;page-break-inside:avoid!important;cursor:default!important}
      .work-day strong{font-size:10px!important}.work-day span,.work-day small{font-size:7px!important}.work-day .work-date{font-size:7px!important}
      .work-table .work-filter{display:flex!important;margin:0 0 5px!important}
      .work-filter input,.work-filter select,.work-filter small{display:none!important}
      .work-table .table-wrap{max-height:none!important;overflow:visible!important}
      .work-table table{width:100%!important;min-width:0!important;table-layout:fixed!important}
      .work-table thead{display:table-header-group!important}
      .work-table tbody tr{break-inside:avoid!important;page-break-inside:avoid!important}
      .work-table th:last-child,.work-table td:last-child{display:none!important}
      .work-room-link{text-decoration:none!important;color:inherit!important;cursor:default!important}
    }
  `}</style>
 </AppShell>
}
