'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {hotelRoomMembers} from '@/lib/hotelRoomGroups'
import useAccessRole from '@/components/useAccessRole'

type HotelStatus={room_no:string;availability_status:string;reason:string|null;revision:number;updated_by_name:string;updated_at:string;source_sync_state:string;source_writeback_last_error:string|null}
type Review={room_no:string;reviewed_status:string;reviewed_revision:number;reviewed_at:string}
export default function HotelRoomReconciliationPanel(){
  const {actualRole,ready}=useAccessRole()
  const [hotel,setHotel]=useState<HotelStatus[]>([])
  const [reviews,setReviews]=useState<Review[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState('')
  const [query,setQuery]=useState('')
  const [showAll,setShowAll]=useState(false)
  const refresh=useCallback(async()=>{
    const s=getSupabase()
    const [h,r]=await Promise.all([
      s.from('hotel_room_availability').select('room_no,availability_status,reason,revision,updated_by_name,updated_at,source_sync_state,source_writeback_last_error').order('room_no'),
      s.from('hotel_room_availability_reviews').select('room_no,reviewed_status,reviewed_revision,reviewed_at')
    ])
    if(h.error||r.error)throw new Error(h.error?.message||r.error?.message)
    setHotel((h.data||[]) as HotelStatus[]);setReviews((r.data||[]) as Review[])
  },[])
  useEffect(()=>{if(!ready||actualRole!=='owner')return;void refresh().catch(e=>setError(String(e)))},[ready,actualRole,refresh])
  const reviewMap=useMemo(()=>new Map(reviews.map(r=>[r.room_no,r])),[reviews])
  const pending=hotel.filter(h=>reviewMap.get(h.room_no)?.reviewed_revision!==h.revision||h.source_sync_state==='pending')
  const shown=(showAll?hotel:pending).filter(h=>{
    const needle=query.trim().toUpperCase();return !needle||hotelRoomMembers(h.room_no).some(r=>r.includes(needle))||
       h.availability_status.includes(needle)||h.updated_by_name.toUpperCase().includes(needle)
  })
  const confirm=async(row:HotelStatus)=>{
    if(!window.confirm('ยืนยันรับทราบสถานะ '+row.room_no+' = '+row.availability_status+' (revision '+row.revision+') โดยไม่แก้ Defect หรือห้อง Combine?'))return
    setBusy(row.room_no);setError('')
    const {error:e}=await getSupabase().rpc('hotel_room_availability_review',{p_room_no:row.room_no,p_expected_revision:row.revision})
    if(e)setError(e.message)
    else try{await refresh()}catch(err){setError(String(err))}
    setBusy('')
  }
  if(!ready||actualRole!=='owner')return null
  return <section className="panel" style={{padding:14,marginBottom:16}}>
    <div className="panel-head"><div><h2>Data Reconciliation — Hotel Room Status (OOO/OOS)</h2>
      <p className="muted small">ตรวจรายการโรงแรมที่ยังไม่ได้ยืนยันเทียบกับสถานะที่ 3 Kings ตรวจรับไว้ • ไม่เปลี่ยน Defect หรือสถานะของโรงแรมอัตโนมัติ</p></div></div>
    <p><b>รอตรวจสอบ {pending.length} ห้อง</b> จาก {hotel.length} ห้องที่โรงแรมแจ้ง •
      เมื่อยังไม่มีข้อมูลที่ 3 Kings ยืนยัน ให้แสดง “รอตรวจสอบ” ไม่ใช่ “ข้อมูลขัดแย้ง”</p>
    <div className="toolbar" style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0'}}>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ค้นหาห้อง / Combine / สถานะ" aria-label="ค้นหารายการเปรียบเทียบ" style={{flex:'1 1 250px'}}/>
      <label><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> แสดงรายการที่ยืนยันแล้ว</label>
      <button className="button" type="button" onClick={()=>{void refresh().catch(e=>setError(String(e)))}}>โหลดล่าสุด</button>
    </div>
    {error&&<p role="alert" style={{color:'#b23429'}}>{error}</p>}
    <div className="table-wrap"><table><thead><tr>
      <th>ห้อง</th><th>สถานะจาก Hotel</th><th>3 Kings ยืนยันล่าสุด</th><th>ผลเปรียบเทียบ</th><th>ผู้แก้ไข Hotel</th><th>ตรวจสอบ</th>
    </tr></thead><tbody>
      {shown.map(h=>{const r=reviewMap.get(h.room_no),outdated=!!r&&r.reviewed_revision!==h.revision
        return <tr key={h.room_no}>
          <td><b>{h.room_no}</b><small>{hotelRoomMembers(h.room_no).length>1?'Combine: '+hotelRoomMembers(h.room_no).filter(x=>x!==h.room_no).join(', '):''}</small></td>
          <td>{h.availability_status}<small>{h.reason||'—'}</small></td>
          <td>{r?r.reviewed_status:'—'}<small>{r?'rev '+r.reviewed_revision:'ไม่มีข้อมูลยืนยัน'}</small></td>
          <td><b>{!r?'รอตรวจสอบ':outdated?(r.reviewed_status===h.availability_status?'มีการอัปเดตใหม่':'สถานะต่างจากที่ยืนยัน'):'ตรงกัน / ตรวจแล้ว'}</b>
            <small>{h.source_sync_state==='pending'?(h.source_writeback_last_error?'Excel Conflict — '+h.source_writeback_last_error:'รออัปเดตไฟล์ Excel'):'Excel ตรงกับสถานะที่บันทึกแล้ว'}</small></td>
          <td>{h.updated_by_name}<small>{new Date(h.updated_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</small></td>
          <td>{!outdated&&r?'ยืนยันแล้ว':<button className="button" type="button" disabled={busy!==''}
            onClick={()=>{void confirm(h)}}>{busy===h.room_no?'กำลังบันทึก…':'ยืนยันหลังตรวจ'}</button>}</td>
        </tr>})}
      {!shown.length&&<tr><td colSpan={6}>ไม่มีรายการที่ต้องตรวจตามตัวกรอง</td></tr>}
    </tbody></table></div>
  </section>
}
