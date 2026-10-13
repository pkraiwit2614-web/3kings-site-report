'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import PrintButton from '@/components/PrintButton'
import useAccessRole from '@/components/useAccessRole'
import {getSupabase} from '@/lib/supabase'
import {hotelRoomKey,hotelRoomMembers,normalizeHotelRoom} from '@/lib/hotelRoomGroups'

type Room={
  room_no:string;building:string;floor:number|null;hotel_participation:string;owner_name:string|null;customer_status:string|null;follow_up:string|null;
  defect_detail:string|null;status_group:string|null;current_status:string|null;next_action:string|null
}
type HotelStatus={
  room_no:string;availability_status:'AVAILABLE'|'OOO'|'OOS'|'UNKNOWN';
  start_date:string|null;end_date:string|null;reason:string|null;
  updated_by_name:string;updated_at:string;revision:number;hotel_remark:string|null;
  source_sync_state:'pending'|'synced';source_synced_revision:number
}
type RoomGroup={key:string;members:Room[];hotel:HotelStatus|null;ownHotel:HotelStatus|null;inferred:boolean;conflict:boolean;inHotel:boolean}
const pending=(r:Room)=>(
  ['Hotel - Incomplete','Hotel - Awaiting Check','Hotel - Awaiting Room Inspection','Non-Hotel - Pending Handover'].includes(r.status_group||'')
)
const dateTH=(value:string|null)=>value?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—'
const statusText=(s:HotelStatus|null)=>!s||s.availability_status==='UNKNOWN'?'ยังไม่ระบุ':s.availability_status==='AVAILABLE'?'พร้อมให้บริการ':s.availability_status

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
  const [formStatus,setFormStatus]=useState<'AVAILABLE'|'OOO'|'OOS'|'UNKNOWN'>('UNKNOWN')
  const [fromDate,setFromDate]=useState('')
  const [toDate,setToDate]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  const refresh=useCallback(async()=>{
    const s=getSupabase()
    const [a,b]=await Promise.all([
      s.from('condo_room_status').select('room_no,building,floor,hotel_participation,owner_name,customer_status,follow_up,defect_detail,status_group,current_status,next_action').order('room_no'),
      s.from('hotel_room_availability').select('room_no,availability_status,start_date,end_date,reason,hotel_remark,updated_by_name,updated_at,revision,source_sync_state,source_synced_revision').order('room_no')
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
    const statusMap=new Map(statuses.map(row=>[row.room_no,row]))
    const roomMap=new Map(rooms.map(row=>[row.room_no,row]))
    return rooms.map((room):RoomGroup=>{
      const members=hotelRoomMembers(room.room_no).map(id=>roomMap.get(id)).filter((r):r is Room=>Boolean(r))
      const ownHotel=statusMap.get(room.room_no)||null
      const known=members.map(member=>statusMap.get(member.room_no)).filter((v):v is HotelStatus=>Boolean(v))
      const unique=new Set(known.map(v=>v.availability_status))
      // Only infer missing room statuses visually. Never mutate conflicting imported evidence.
      const inferred=!ownHotel&&unique.size===1&&known.length>0
      return {key:room.room_no,members,hotel:ownHotel||(inferred?known[0]:null),
        ownHotel,inferred,conflict:unique.size>1,inHotel:room.hotel_participation==='ร่วมโรงแรม'}
    }).sort((a,b)=>a.key.localeCompare(b.key))
  },[rooms,statuses])
  const lastUpdated=useMemo(()=>statuses.map(r=>r.updated_at).filter(Boolean).sort().at(-1)||null,[statuses])
  const filtered=useMemo(()=>{
    const terms=query.split(/[,，]+/).map(normalizeHotelRoom).filter(Boolean)
    return groups.filter(g=>
      (building==='ALL'||g.members.some(r=>r.building===building)) &&
      (stateFilter==='ALL'||g.members.some(member=>(groups.find(other=>other.key===member.room_no)?.hotel?.availability_status||'UNKNOWN')===stateFilter)) &&
      (!terms.length||terms.some(t=>g.members.some(r=>r.room_no.includes(t))||
        hotelRoomMembers(g.key).some(r=>r.includes(t))||hotelRoomKey(g.key).includes(t)||
        g.members.some(r=>[r.owner_name,r.customer_status,r.hotel_participation,r.defect_detail,r.current_status,r.next_action,r.follow_up].filter(Boolean).join(' ').toUpperCase().includes(t))||
        [g.hotel?.reason,g.hotel?.availability_status,g.hotel?.hotel_remark].filter(Boolean).join(' ').toUpperCase().includes(t)))
    )
  },[groups,query,building,stateFilter])
  const chosen=groups.find(x=>x.key===selected)||null
  const currentlyPending=chosen?.members.filter(pending)||[]
  const count=(status:string)=>groups.filter(g=>(g.hotel?.availability_status||'UNKNOWN')===status).length
  const choose=(g:RoomGroup)=>{
    setSelected(g.key);setFormStatus(g.hotel?.availability_status||'UNKNOWN')
    setFromDate(g.hotel?.start_date||'');setToDate(g.hotel?.end_date||'')
    setMessage('')
  }
  const save=async()=>{
    if(!chosen||!canEdit)return
    if((formStatus==='OOO'||formStatus==='OOS')&&!fromDate){setMessage('กรุณาระบุวันที่เริ่มใช้สถานะ');return}
    if(toDate&&!fromDate){setMessage('กรุณาระบุวันที่เริ่มก่อนกำหนดวันที่สิ้นสุด');return}
    if(toDate&&fromDate&&toDate<fromDate){setMessage('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');return}
    if(!window.confirm('ยืนยันบันทึก '+hotelRoomMembers(chosen.key).join(' + ')+' เป็น '+(formStatus==='AVAILABLE'?'พร้อมให้บริการ':formStatus==='UNKNOWN'?'ไม่ระบุ':formStatus)+' ทั้งชุด Combine?\\nไม่เปลี่ยนข้อมูล Defect'))return
    setBusy(true);setMessage('')
    const {error:saveError}=await getSupabase().rpc('hotel_room_availability_save',{
      p_room_no:chosen.key,p_status:formStatus,
      p_start_date:fromDate||null,
      p_end_date:toDate||null,
      p_reason:null,p_expected_revision:chosen.ownHotel?.revision??null
    })
    if(saveError){setMessage(saveError.message);setBusy(false);return}
    try{await refresh();setMessage('บันทึกสถานะครบทุกห้องในชุด Combine แล้ว • รอเขียนกลับ Excel โรงแรมทุก Room ID • ตรวจสอบสถานะ Sync / Data Reconciliation')}
    catch(e){setMessage('บันทึกแล้ว แต่โหลดผลล่าสุดไม่สำเร็จ: '+String(e))}
    setBusy(false)
  }

  return <AppShell>
    <PageHeader title="Room Status | OOO/OOS" subtitle="OOO = Out of Order • OOS = Out of Service"
      action={<div className="hotel-header-actions"><div className="hotel-update-meta"><span>ข้อมูลอัปเดต</span><b>{dateTH(lastUpdated)}</b></div><PrintButton reportTitle="Room Status | OOO/OOS"/><Link className="button" href="/defects">เปิด Defect Detail</Link></div>}/>
    <section className="panel" style={{padding:14,marginBottom:12}}>
      <div className="hotel-kpis">
        {([['AVAILABLE','พร้อมให้บริการ'],['OOO','Out of Order'],['OOS','Out of Service'],['UNKNOWN','ยังไม่ระบุ']] as const)
          .map(([key,label])=><button key={key} className={'hotel-kpi status-'+key.toLowerCase()+' '+(stateFilter===key?'chosen':'')} onClick={()=>setStateFilter(stateFilter===key?'ALL':key)}
            type="button"><span>{label}</span><b>{count(key)}</b><small>ชุดห้อง</small></button>)}
      </div>
      <div className="toolbar detail-toolbar compact-filter hotel-search-toolbar" style={{marginTop:12}}>
        <input aria-label="ค้นหาห้องพัก" value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="ค้นหาหลายรายการได้ เช่น A213, A214, B614" />
        <select aria-label="เลือกอาคาร" value={building} onChange={e=>setBuilding(e.target.value)}>
          <option value="ALL">อาคาร A+B</option><option value="A">อาคาร A</option><option value="B">อาคาร B</option>
        </select>
        <select aria-label="สถานะห้อง" value={stateFilter} onChange={e=>setStateFilter(e.target.value)}>
          <option value="ALL">ทุกสถานะ</option><option value="AVAILABLE">พร้อมให้บริการ</option><option value="OOO">OOO</option><option value="OOS">OOS</option><option value="UNKNOWN">ยังไม่ระบุ</option>
        </select>
        <button type="button" className="button" onClick={()=>{setQuery('');setBuilding('ALL');setStateFilter('ALL')}}>ล้างตัวกรอง</button>
      </div>
      <p className="small muted" style={{marginTop:8}}>สถานะที่ยังไม่ระบุไม่ใช่ห้องพร้อมให้บริการ • หนึ่งรายการต่อหนึ่ง Room ID (263 ห้อง) • ค้นหาห้องใดจะแสดงสมาชิก Combine ทั้งชุด • สถานะที่อ้างอิงคู่ยังไม่ใช่ข้อมูลที่บันทึกแล้ว • ความขัดแย้งเก่าต้องตรวจสอบ Data Reconciliation</p>
    </section>
    {error&&<div className="panel" role="alert" style={{color:'#a63329',marginBottom:12}}>โหลดข้อมูลล้มเหลว: {error}</div>}
    {loading?<div className="panel">กำลังโหลดสถานะห้อง…</div>:!error&&<>
      <section className="panel" style={{padding:12}}>
        <h2>รายการสถานะห้องพัก • {filtered.length} ห้อง</h2>
        <div className="table-wrap hotel-status-table"><table><thead><tr>
          <th>ห้อง / Combine</th><th>สถานะ Hotel</th><th>ช่วงวันที่</th><th>สาเหตุ</th><th>Defect ค้าง / รอตรวจรับ</th><th>แก้ไขล่าสุด</th><th>จัดการ</th>
        </tr></thead><tbody>
          {filtered.map(g=><tr key={g.key}>
            <td><b>{g.key}</b>
              {hotelRoomMembers(g.key).length>1&&<small>⌁ ห้อง Combine: {hotelRoomMembers(g.key).filter(r=>r!==g.key).join(', ')}</small>}
              {!g.inHotel&&<small>ไม่ร่วมโรงแรม</small>}
              {g.members.some(r=>['B101','B102','B103','B104','B105'].includes(r.room_no))&&<small>{g.members.map(r=>r.room_no.replace(/^B10([1-5])$/,'Good0$1')).join(' / ')}</small>}</td>
            <td><span className={'hotel-status-badge status-'+(g.hotel?.availability_status||'UNKNOWN').toLowerCase()}>{statusText(g.hotel)}</span>{g.inferred&&<small>อ้างอิงสถานะคู่ Combine • รอยืนยันห้องนี้</small>}{g.conflict&&<small className="hotel-conflict">สถานะต้นทางของชุด Combine ไม่ตรงกัน • ตรวจสอบก่อน</small>}</td>
            <td>{g.hotel?.start_date||'—'}{g.hotel?.end_date?' ถึง '+g.hotel.end_date:''}</td>
            <td>{g.hotel?.reason||'—'}{g.hotel?.hotel_remark&&<small>Hotel Remark: {g.hotel.hotel_remark}</small>}</td>
            <td>{g.members.filter(pending).length?g.members.filter(pending).map(r=>r.room_no).join(', '):'—'}</td>
            <td>{g.ownHotel? <>{g.ownHotel.updated_by_name}<small>{dateTH(g.ownHotel.updated_at)}</small><small>{g.ownHotel.source_sync_state==='pending'?'รอบันทึก Excel':'Excel ตรงกับ Revision '+g.ownHotel.source_synced_revision}</small></>:g.inferred?'ยังไม่มีรายการยืนยันสำหรับห้องนี้':'—'}</td>
            <td><button type="button" className="button" onClick={()=>choose(g)}>ดู{canEdit?' / แก้ไข':''}</button></td>
          </tr>)}
          {!filtered.length&&<tr><td colSpan={7} style={{textAlign:'center'}}>ไม่พบห้องตามเงื่อนไข</td></tr>}
        </tbody></table></div>
      </section>
      {chosen&&<section className="panel" style={{padding:16,marginTop:12}} aria-label="รายละเอียดสถานะห้องที่เลือก">
        <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <h2>ห้อง {chosen.key} {hotelRoomMembers(chosen.key).length>1?'⌁ คู่ Combine: '+hotelRoomMembers(chosen.key).filter(r=>r!==chosen.key).join(', '):''}</h2>
          <button type="button" className="button" onClick={()=>setSelected('')}>ปิด</button>
        </div>
        <p className="muted small">แก้ไขเฉพาะสถานะห้องและช่วงวันที่ โดยอัปเดต Room ID ทุกห้องในชุด Combine เดียวกัน • สาเหตุ/หมายเหตุจากต้นทางคงเดิม • ไม่แก้ข้อมูล Defect หรือประวัติ 3 Kings</p>
        {currentlyPending.length>0?<div className="hotel-pending">
          <b>Defect ที่ยังค้างหรือรอตรวจรับ ({currentlyPending.length} ห้อง)</b>
          {currentlyPending.map(r=><p key={r.room_no}><b>{r.room_no}</b> — {r.defect_detail||r.current_status||r.status_group||'รอดำเนินการ'}{r.next_action?' • ต้องทำต่อ: '+r.next_action:''}</p>)}
        </div>:<div className="hotel-pending">ไม่พบกลุ่มสถานะ Defect ค้างตามข้อมูลล่าสุด (ไม่ใช่การยืนยันว่าห้องพร้อมบริการ)</div>}
        <p><Link href={'/defects?q='+encodeURIComponent(hotelRoomMembers(chosen.key).join(','))+'#room-list'} className="button">ดู Defect Detail ทั้งชุด Combine</Link></p>
        {canEdit&&<div className="hotel-editor">
            <label>สถานะห้อง<select value={formStatus} onChange={e=>setFormStatus(e.target.value as 'AVAILABLE'|'OOO'|'OOS'|'UNKNOWN')}>
              <option value="AVAILABLE">พร้อมให้บริการ</option><option value="OOO">Out of Order (OOO)</option><option value="OOS">Out of Service (OOS)</option><option value="UNKNOWN">ไม่ระบุ</option>
            </select></label>
            <label>วันที่เริ่มใช้สถานะ<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
            <label>วันที่สิ้นสุด (ถ้ามี)<input type="date" value={toDate} min={fromDate||undefined} onChange={e=>setToDate(e.target.value)}/></label>
            <button className="button primary" type="button" onClick={save} disabled={busy}>{busy?'กำลังบันทึก…':'ตรวจสอบและบันทึกสถานะทั้งชุดห้อง'}</button>
          </div>}
        {message&&<p role="status" style={{marginTop:10}}>{message}</p>}
      </section>}
    </>}
    <style jsx>{`
      .hotel-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.hotel-update-meta{display:grid;gap:2px;text-align:right;line-height:1.25}.hotel-update-meta span{font-size:8.5px;color:var(--muted);font-weight:700}.hotel-update-meta b{font-size:10px;color:var(--navy);font-weight:800;white-space:nowrap}.hotel-search-toolbar{flex-wrap:wrap;gap:8px;margin-bottom:0}.hotel-search-toolbar input{flex:1 1 225px;min-width:190px;max-width:420px;min-height:34px}.hotel-search-toolbar select{flex:0 1 155px;min-width:120px;padding:7px 9px}.hotel-status-table{max-height:68vh;overflow:auto} .hotel-status-table th{position:sticky;top:0;z-index:3}.hotel-conflict{color:#9e312d!important;font-weight:800}@media print{.hotel-status-table{max-height:none;overflow:visible}.hotel-status-table thead{display:table-header-group}}.hotel-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.hotel-kpi{border:1px solid #d9e0e7;border-radius:10px;background:#f6f8fa;padding:10px;text-align:left;cursor:pointer} .hotel-kpi.chosen{outline:2px solid var(--navy);outline-offset:1px}.hotel-kpi.status-available,.hotel-status-badge.status-available{background:#e4f5e9;color:#176238;border-color:#82cca0}.hotel-kpi.status-ooo,.hotel-status-badge.status-ooo{background:#ffebeb;color:#a0222a;border-color:#eaa7a9}.hotel-kpi.status-oos,.hotel-status-badge.status-oos{background:#fff1d6;color:#925711;border-color:#eac27a}.hotel-kpi.status-unknown,.hotel-status-badge.status-unknown{background:#eceff3;color:#506071;border-color:#bfc8d2}.hotel-status-badge{display:inline-flex;align-items:center;padding:5px 9px;border:1px solid;border-radius:7px;font-weight:800;white-space:nowrap} .hotel-kpi span,.hotel-kpi small{display:block;color:inherit;font-size:10px} .hotel-kpi b{display:block;font-size:24px;margin:4px 0;color:inherit}.hotel-pending{background:#fff8e7;border:1px solid #efdcab;padding:12px;border-radius:10px;margin:12px 0;font-size:11px}.hotel-pending p{margin:7px 0 0;line-height:1.5}.hotel-editor{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.hotel-editor label{display:grid;gap:5px;font-size:11px;font-weight:700}.hotel-editor input,.hotel-editor select,.hotel-editor textarea{width:100%;border:1px solid #cad2de;border-radius:8px;background:#fff;padding:8px;font:inherit}.hotel-editor .full{grid-column:1/-1}.hotel-editor button{grid-column:1/-1;justify-self:start}
      @media(max-width:760px){.hotel-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.hotel-editor{grid-template-columns:1fr}}
    `}</style>
  </AppShell>
}
