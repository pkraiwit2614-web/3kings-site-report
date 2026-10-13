'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import DefectInputPanel from '@/components/DefectInputPanel'
import useAccessRole from '@/components/useAccessRole'
import {getSupabase} from '@/lib/supabase'
import {hotelRoomKey,hotelRoomMembers,normalizeHotelRoom} from '@/lib/hotelRoomGroups'

type Room={
  room_no:string;building:string;floor:number|null;hotel_participation:string;
  defect_detail:string|null;status_group:string|null;current_status:string|null;next_action:string|null
}
type HotelStatus={
  room_no:string;availability_status:'AVAILABLE'|'OOO'|'OOS';
  start_date:string|null;end_date:string|null;reason:string|null;
  updated_by_name:string;updated_at:string;revision:number
}
type RoomGroup={key:string;members:Room[];hotel:HotelStatus|null;inHotel:boolean}
const pending=(r:Room)=>(
  ['Hotel - Incomplete','Hotel - Awaiting Check','Hotel - Awaiting Room Inspection','Non-Hotel - Pending Handover'].includes(r.status_group||'')
)
const dateTH=(value:string|null)=>value?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—'
const statusText=(s:HotelStatus|null)=>!s?'ยังไม่ระบุ':s.availability_status==='AVAILABLE'?'พร้อมให้บริการ':s.availability_status

export default function HotelRoomStatusPage(){
  const {role,ready}=useAccessRole()
  const canEdit=role==='owner'||role==='defect_editor'
  const [rooms,setRooms]=useState<Room[]>([])
  const [statuses,setStatuses]=useState<HotelStatus[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [building,setBuilding]=useState('ALL')
  const [stateFilter,setStateFilter]=useState('ALL')
  const [selected,setSelected]=useState('')
  const [formStatus,setFormStatus]=useState<'AVAILABLE'|'OOO'|'OOS'>('OOS')
  const [fromDate,setFromDate]=useState('')
  const [toDate,setToDate]=useState('')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  const refresh=useCallback(async()=>{
    const s=getSupabase()
    const [a,b]=await Promise.all([
      s.from('condo_room_status').select('room_no,building,floor,hotel_participation,defect_detail,status_group,current_status,next_action').order('room_no'),
      s.from('hotel_room_availability').select('room_no,availability_status,start_date,end_date,reason,updated_by_name,updated_at,revision').order('room_no')
    ])
    if(a.error||b.error)throw new Error(a.error?.message||b.error?.message||'โหลดสถานะห้องไม่สำเร็จ')
    setRooms((a.data||[]) as Room[]);setStatuses((b.data||[]) as HotelStatus[])
  },[])
  useEffect(()=>{
    let active=true
    const q=new URLSearchParams(window.location.search).get('q')
    if(q)setQuery(q)
    const load=async()=>{try{await refresh();if(active)setError('')}catch(e){if(active)setError(e instanceof Error?e.message:String(e))}finally{if(active)setLoading(false)}}
    void load()
    const onFocus=()=>{void load()}
    window.addEventListener('focus',onFocus)
    return()=>{active=false;window.removeEventListener('focus',onFocus)}
  },[refresh])

  const groups=useMemo(()=>{
    const lookup=new Map<string,Room[]>()
    for(const room of rooms){const key=hotelRoomKey(room.room_no);lookup.set(key,[...(lookup.get(key)||[]),room])}
    const statusMap=new Map(statuses.map(row=>[row.room_no,row]))
    return [...lookup.entries()].map(([key,members]):RoomGroup=>({
      key,members:members.sort((a,b)=>a.room_no.localeCompare(b.room_no)),
      hotel:statusMap.get(key)||null,inHotel:members.some(x=>x.hotel_participation==='ร่วมโรงแรม')
    })).sort((a,b)=>a.key.localeCompare(b.key))
  },[rooms,statuses])
  const filtered=useMemo(()=>{
    const terms=query.split(/[,，\s]+/).map(normalizeHotelRoom).filter(Boolean)
    return groups.filter(g=>
      (building==='ALL'||g.members.some(r=>r.building===building)) &&
      (stateFilter==='ALL'||(g.hotel?.availability_status||'UNKNOWN')===stateFilter) &&
      (!terms.length||terms.some(t=>g.members.some(r=>r.room_no.includes(t))||
        hotelRoomMembers(g.key).some(r=>r.includes(t))||
        (g.hotel?.reason||'').toUpperCase().includes(t)))
    )
  },[groups,query,building,stateFilter])
  const chosen=groups.find(x=>x.key===selected)||null
  const currentlyPending=chosen?.members.filter(pending)||[]
  const count=(status:string)=>groups.filter(g=>(g.hotel?.availability_status||'UNKNOWN')===status).length
  const choose=(g:RoomGroup)=>{
    setSelected(g.key);setFormStatus(g.hotel?.availability_status||'OOS')
    setFromDate(g.hotel?.start_date||'');setToDate(g.hotel?.end_date||'')
    setReason(g.hotel?.reason||'');setMessage('')
  }
  const save=async()=>{
    if(!chosen||!canEdit)return
    if(formStatus!=='AVAILABLE'&&(!fromDate||!reason.trim())){setMessage('กรุณาระบุวันที่เริ่มและเหตุผล');return}
    if(toDate&&fromDate&&toDate<fromDate){setMessage('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');return}
    if(!window.confirm('ยืนยันบันทึก '+chosen.members.map(r=>r.room_no).join(' + ')+' เป็น '+formStatus+' โดยไม่เปลี่ยนสถานะ Defect?'))return
    setBusy(true);setMessage('')
    const {error:saveError}=await getSupabase().rpc('hotel_room_availability_save',{
      p_room_no:chosen.key,p_status:formStatus,
      p_start_date:formStatus==='AVAILABLE'?null:fromDate,
      p_end_date:formStatus==='AVAILABLE'||!toDate?null:toDate,
      p_reason:reason.trim()||null,p_expected_revision:chosen.hotel?.revision??null
    })
    if(saveError){setMessage(saveError.message);setBusy(false);return}
    try{await refresh();setMessage('บันทึกสถานะโรงแรมเรียบร้อย • รอตรวจสอบใน Data Reconciliation')}
    catch(e){setMessage('บันทึกแล้ว แต่โหลดผลล่าสุดไม่สำเร็จ: '+String(e))}
    setBusy(false)
  }

  return <AppShell>
    <PageHeader title="Room Status | OOO/OOS" subtitle="สถานะความพร้อมให้บริการของโรงแรม • แยกจาก Defect และ Handover Flow"
      action={<Link className="button" href="/defects">เปิด Defect Detail</Link>}/>
    <section className="panel" style={{padding:14,marginBottom:12}}>
      <div className="hotel-kpis">
        {([['AVAILABLE','พร้อมให้บริการ'],['OOO','Out of Order'],['OOS','Out of Service'],['UNKNOWN','ยังไม่ระบุ']] as const)
          .map(([key,label])=><button key={key} className={'hotel-kpi '+(stateFilter===key?'chosen':'')} onClick={()=>setStateFilter(stateFilter===key?'ALL':key)}
            type="button"><span>{label}</span><b>{count(key)}</b><small>ชุดห้อง</small></button>)}
      </div>
      <div className="toolbar" style={{marginTop:12,display:'flex',gap:8,flexWrap:'wrap'}}>
        <input aria-label="ค้นหาห้องพัก" value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="ค้นหาห้อง / Combine เช่น B614, GOOD01, A313, A314" style={{flex:'1 1 260px',minHeight:36}}/>
        <select aria-label="เลือกอาคาร" value={building} onChange={e=>setBuilding(e.target.value)}>
          <option value="ALL">อาคาร A+B</option><option value="A">อาคาร A</option><option value="B">อาคาร B</option>
        </select>
        <select aria-label="สถานะห้อง" value={stateFilter} onChange={e=>setStateFilter(e.target.value)}>
          <option value="ALL">ทุกสถานะ</option><option value="AVAILABLE">พร้อมให้บริการ</option><option value="OOO">OOO</option><option value="OOS">OOS</option><option value="UNKNOWN">ยังไม่ระบุ</option>
        </select>
        <button type="button" className="button" onClick={()=>{setQuery('');setBuilding('ALL');setStateFilter('ALL')}}>ล้างตัวกรอง</button>
      </div>
      <p className="small muted" style={{marginTop:8}}>สถานะที่ยังไม่ระบุไม่ใช่ห้องพร้อมให้บริการ • แสดงหนึ่งรายการต่อหนึ่งชุด Combine และใช้ Room ID เดิมทั้งหมด</p>
    </section>
    {error&&<div className="panel" role="alert" style={{color:'#a63329',marginBottom:12}}>โหลดข้อมูลล้มเหลว: {error}</div>}
    {loading?<div className="panel">กำลังโหลดสถานะห้อง…</div>:!error&&<>
      <section className="panel" style={{padding:12}}>
        <h2>รายการสถานะห้องพัก • {filtered.length} ชุดห้อง</h2>
        <div className="table-wrap"><table><thead><tr>
          <th>ห้อง / Combine</th><th>สถานะ Hotel</th><th>ช่วงวันที่</th><th>สาเหตุ</th><th>Defect ค้าง / รอตรวจรับ</th><th>แก้ไขล่าสุด</th><th>จัดการ</th>
        </tr></thead><tbody>
          {filtered.map(g=><tr key={g.key}>
            <td><b>{g.members.map(r=>r.room_no).join(' + ')}</b>
              {g.members.length>1&&<small>⌁ Combine • แก้ไขร่วมกัน {g.members.length} ห้อง</small>}
              {!g.inHotel&&<small>ไม่ร่วมโรงแรม</small>}
              {g.members.some(r=>['B101','B102','B103','B104','B105'].includes(r.room_no))&&<small>{g.members.map(r=>r.room_no.replace(/^B10([1-5])$/,'Good0$1')).join(' / ')}</small>}</td>
            <td><b>{statusText(g.hotel)}</b></td>
            <td>{g.hotel?.start_date||'—'}{g.hotel?.end_date?' ถึง '+g.hotel.end_date:''}</td>
            <td>{g.hotel?.reason||'—'}</td>
            <td>{g.members.filter(pending).length?g.members.filter(pending).map(r=>r.room_no).join(', '):'—'}</td>
            <td>{g.hotel? <>{g.hotel.updated_by_name}<small>{dateTH(g.hotel.updated_at)}</small></>:'—'}</td>
            <td><button type="button" className="button" onClick={()=>choose(g)}>ดู{canEdit?' / แก้ไข':''}</button></td>
          </tr>)}
          {!filtered.length&&<tr><td colSpan={7} style={{textAlign:'center'}}>ไม่พบห้องตามเงื่อนไข</td></tr>}
        </tbody></table></div>
      </section>
      {chosen&&<section className="panel" style={{padding:16,marginTop:12}} aria-label="รายละเอียดสถานะห้องที่เลือก">
        <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <h2>ชุดห้อง {chosen.members.map(x=>x.room_no).join(' + ')} {chosen.members.length>1?'⌁ Combine':''}</h2>
          <button type="button" className="button" onClick={()=>setSelected('')}>ปิด</button>
        </div>
        <p className="muted small">สถานะห้องโรงแรมแยกอิสระจากงานซ่อม • เปลี่ยนแล้วไม่ทำให้ Defect เป็น Done หรือแก้ไขประวัติ 3 Kings</p>
        {currentlyPending.length>0?<div className="hotel-pending">
          <b>Defect ที่ยังค้างหรือรอตรวจรับ ({currentlyPending.length} ห้อง)</b>
          {currentlyPending.map(r=><p key={r.room_no}><b>{r.room_no}</b> — {r.defect_detail||r.current_status||r.status_group||'รอดำเนินการ'}{r.next_action?' • ต้องทำต่อ: '+r.next_action:''}</p>)}
        </div>:<div className="hotel-pending">ไม่พบกลุ่มสถานะ Defect ค้างตามข้อมูลล่าสุด (ไม่ใช่การยืนยันว่าห้องพร้อมบริการ)</div>}
        <p><Link href={'/defects?q='+encodeURIComponent(chosen.members.map(r=>r.room_no).join(','))+'#room-list'} className="button">ดู Defect Detail ทั้งชุดห้อง</Link></p>
        {canEdit&&<div className="hotel-editor">
            <label>สถานะห้อง<select value={formStatus} onChange={e=>setFormStatus(e.target.value as 'AVAILABLE'|'OOO'|'OOS')}>
              <option value="AVAILABLE">พร้อมให้บริการ</option><option value="OOO">Out of Order (OOO)</option><option value="OOS">Out of Service (OOS)</option>
            </select></label>
            <label>วันที่เริ่ม<input type="date" value={fromDate} disabled={formStatus==='AVAILABLE'} onChange={e=>setFromDate(e.target.value)}/></label>
            <label>วันที่คาดว่าจะสิ้นสุด<input type="date" value={toDate} disabled={formStatus==='AVAILABLE'} onChange={e=>setToDate(e.target.value)}/></label>
            <label className="full">สาเหตุ / รายละเอียด<textarea value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)} rows={3}/></label>
            <button className="button primary" type="button" onClick={save} disabled={busy}>{busy?'กำลังบันทึก…':'ตรวจสอบและบันทึกสถานะทั้งชุดห้อง'}</button>
          </div>}
        {message&&<p role="status" style={{marginTop:10}}>{message}</p>}
      </section>}
    </>}
    {canEdit&&<div style={{marginTop:12}}><DefectInputPanel manualOnly /></div>}
    <style jsx>{`
      .hotel-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.hotel-kpi{border:1px solid #d9e0e7;border-radius:10px;background:#f6f8fa;padding:10px;text-align:left;cursor:pointer}.hotel-kpi.chosen{border-color:#172a43;background:#e9f1fa}.hotel-kpi span,.hotel-kpi small{display:block;color:#667487;font-size:10px}.hotel-kpi b{display:block;font-size:24px;margin:4px 0}.hotel-pending{background:#fff8e7;border:1px solid #efdcab;padding:12px;border-radius:10px;margin:12px 0;font-size:11px}.hotel-pending p{margin:7px 0 0;line-height:1.5}.hotel-editor{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.hotel-editor label{display:grid;gap:5px;font-size:11px;font-weight:700}.hotel-editor input,.hotel-editor select,.hotel-editor textarea{width:100%;border:1px solid #cad2de;border-radius:8px;background:#fff;padding:8px;font:inherit}.hotel-editor .full{grid-column:1/-1}.hotel-editor button{grid-column:1/-1;justify-self:start}
      @media(max-width:760px){.hotel-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.hotel-editor{grid-template-columns:1fr}}
    `}</style>
  </AppShell>
}
