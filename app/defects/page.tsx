'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'

type RoomRow = {
  room_no: string
  building: string
  floor: number | null
  owner_name: string | null
  hotel_participation: string
  customer_status: string
  current_status: string
  status_group: string | null
  follow_up: string | null
  priority: string | null
  next_action: string | null
  latest_source: string | null
  source_note: string | null
  hotel_complete_color: string | null
  hotel_remarks: string | null
  source_file_id: string | null
  source_file_name: string | null
  source_modified_at: string | null
  owner_source_file_id: string | null
  owner_source_file_name: string | null
  owner_source_modified_at: string | null
  synced_at: string
}

type Tone = 'neutral' | 'hotel' | 'incomplete' | 'awaiting' | 'complete' | 'handover'
type CategoryDef = {
  id: string
  no: number
  title: string
  description: string
  tone: Tone
  predicate: (row: RoomRow) => boolean
  caution?: string
}

const isHotel = (r: RoomRow) => r.hotel_participation === 'ร่วมโรงแรม'
const hasCustomer = (r: RoomRow) => r.customer_status === 'มีลูกค้า'
const groupIs = (r: RoomRow, value: string) => r.status_group === value

const categories: CategoryDef[] = [
  { id:'nonhotel-customer-complete', no:1, tone:'handover', title:'มีลูกค้า • ไม่ร่วมโรงแรม • ส่งมอบแล้ว', description:'ลูกค้าตรวจรับและส่งมอบห้องเรียบร้อยแล้ว', predicate:r=>!isHotel(r)&&hasCustomer(r)&&r.current_status.includes('Handover Complete') },
  { id:'nonhotel-nosale', no:2, tone:'neutral', title:'ไม่มีลูกค้า • ไม่ร่วมโรงแรม', description:'ห้องยังไม่มีลูกค้า และไม่ได้อยู่ใน Hotel Program', predicate:r=>!isHotel(r)&&!hasCustomer(r) },
  { id:'nonhotel-customer-pending', no:3, tone:'awaiting', title:'มีลูกค้า • ไม่ร่วมโรงแรม • รอลูกค้าเข้าตรวจ', description:'ห้องพร้อมส่งมอบ แต่ยังรอลูกค้าเข้าตรวจเพื่อรับมอบ', predicate:r=>!isHotel(r)&&hasCustomer(r)&&!r.current_status.includes('Handover Complete') },
  { id:'hotel-customer', no:4, tone:'hotel', title:'มีลูกค้า • ร่วมโรงแรม', description:'ยอดแม่ของห้องที่มีลูกค้าและเข้าร่วม Hotel Program', predicate:r=>isHotel(r)&&hasCustomer(r) },
  { id:'hotel-nocustomer', no:5, tone:'hotel', title:'ไม่มีลูกค้า • ร่วมโรงแรม', description:'ยอดแม่ของห้องที่ยังไม่มีลูกค้าและเข้าร่วม Hotel Program', predicate:r=>isHotel(r)&&!hasCustomer(r) },
  { id:'hotel-customer-incomplete', no:6, tone:'incomplete', title:'Defect ยังไม่เสร็จ', description:'รายการ Defect ยังอยู่ในสถานะ Not Completed / In Progress', caution:'Source ปัจจุบันยังไม่แยกชัดว่า Hotel ตรวจงานค้างแล้วหรือยัง', predicate:r=>isHotel(r)&&hasCustomer(r)&&groupIs(r,'Hotel - Incomplete') },
  { id:'hotel-customer-awaiting', no:7, tone:'awaiting', title:'Defect เสร็จ • รอ Hotel ตรวจ', description:'แก้ Defect เสร็จแล้ว แต่ยังรอ Hotel Engineer ตรวจยืนยัน', predicate:r=>isHotel(r)&&hasCustomer(r)&&groupIs(r,'Hotel - Awaiting Check') },
  { id:'hotel-customer-checked', no:8, tone:'complete', title:'Hotel ตรวจแล้ว', description:'Defect เสร็จ และ Hotel Engineer ตรวจยืนยันแล้ว', predicate:r=>isHotel(r)&&hasCustomer(r)&&groupIs(r,'Hotel - Checked Complete') },
  { id:'hotel-nocustomer-awaiting', no:9, tone:'awaiting', title:'Defect เสร็จ • รอ Hotel ตรวจ', description:'ห้องไม่มีลูกค้า งาน Defect เสร็จแล้ว แต่ยังรอ Hotel Engineer ตรวจ', predicate:r=>isHotel(r)&&!hasCustomer(r)&&groupIs(r,'Hotel - Awaiting Check') },
  { id:'hotel-nocustomer-checked', no:10, tone:'complete', title:'Hotel ตรวจแล้ว', description:'ห้องไม่มีลูกค้า งาน Defect เสร็จ และ Hotel Engineer ตรวจยืนยันแล้ว', predicate:r=>isHotel(r)&&!hasCustomer(r)&&groupIs(r,'Hotel - Checked Complete') },
  { id:'hotel-nocustomer-incomplete', no:11, tone:'incomplete', title:'Defect ยังไม่เสร็จ', description:'ห้องไม่มีลูกค้า รายการ Defect ยังอยู่ในสถานะ Not Completed / In Progress', caution:'Source ปัจจุบันยังไม่แยกชัดว่า Hotel ตรวจงานค้างแล้วหรือยัง', predicate:r=>isHotel(r)&&!hasCustomer(r)&&groupIs(r,'Hotel - Incomplete') },
]

const byNo = (no:number) => categories.find(c=>c.no===no)!

function dtTH(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)
}

function defectTone(row: RoomRow): Tone {
  if (row.status_group === 'Hotel - Incomplete') return 'incomplete'
  if (row.status_group === 'Hotel - Awaiting Check') return 'awaiting'
  if (row.status_group === 'Hotel - Checked Complete') return 'complete'
  if (row.current_status.includes('Handover Complete')) return 'handover'
  if (row.current_status.includes('Pending Handover')) return 'awaiting'
  return 'neutral'
}

function defectLabel(row: RoomRow) {
  if (row.status_group === 'Hotel - Incomplete') return 'Defect ยังไม่เสร็จ'
  if (row.status_group === 'Hotel - Awaiting Check') return 'Defect เสร็จ • รอ Hotel ตรวจ'
  if (row.status_group === 'Hotel - Checked Complete') return 'Hotel ตรวจแล้ว'
  if (row.current_status.includes('Handover Complete')) return 'ส่งมอบแล้ว'
  if (row.current_status.includes('Pending Handover')) return 'รอลูกค้าตรวจรับ'
  return row.current_status
}

export default function CondoDefectDashboardPage() {
  const [rows,setRows] = useState<RoomRow[]>([])
  const [loading,setLoading] = useState(true)
  const [syncing,setSyncing] = useState(false)
  const [message,setMessage] = useState('')
  const [q,setQ] = useState('')
  const [building,setBuilding] = useState('ALL')
  const [status,setStatus] = useState('')
  const [selectedCategory,setSelectedCategory] = useState('')

  const loadRows = async () => {
    const s=getSupabase()
    const {data,error}=await s.from('condo_room_status').select('*').order('building').order('floor').order('room_no')
    if(error) throw error
    setRows((data||[]) as RoomRow[])
    return (data||[]) as RoomRow[]
  }

  const syncFromDrive = async (silent=false) => {
    setSyncing(true)
    if(!silent) setMessage('กำลังค้นหาไฟล์ล่าสุดใน Google Drive และอัปเดตข้อมูล…')
    try{
      const s=getSupabase()
      const {data,error}=await s.functions.invoke('google-drive-sync',{body:{action:'sync_condo_defect'}})
      if(error) throw error
      const refreshed=await loadRows()
      setMessage(`อัปเดตสำเร็จ ${refreshed.length} ห้อง • ${data?.source?.name || refreshed[0]?.source_file_name || 'ไฟล์ล่าสุด'}`)
    }catch(error){
      setMessage(`Sync Drive ไม่สำเร็จ: ${error instanceof Error?error.message:'ไม่สามารถ Sync ได้'} • แสดงข้อมูลล่าสุดที่มีในระบบแทน`)
    }finally{setSyncing(false);setLoading(false)}
  }

  useEffect(()=>{
    let active=true
    ;(async()=>{
      try{
        const existing=await loadRows()
        if(!active)return
        setLoading(false)
        await syncFromDrive(true)
        if(!existing.length&&active)setMessage('กำลังเตรียมข้อมูลครั้งแรกจาก Google Drive')
      }catch(error){if(active){setLoading(false);setMessage(error instanceof Error?error.message:'โหลดข้อมูลไม่สำเร็จ')}}
    })()
    return()=>{active=false}
  },[])

  const statusOptions=useMemo(()=>Array.from(new Set(rows.map(r=>r.current_status).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'th')),[rows])
  const activeCategory=useMemo(()=>categories.find(c=>c.id===selectedCategory)||null,[selectedCategory])
  const filtered=useMemo(()=>{
    const query=q.trim().toLowerCase()
    return rows.filter(row=>{
      if(building!=='ALL'&&row.building!==building)return false
      if(status&&row.current_status!==status)return false
      if(activeCategory&&!activeCategory.predicate(row))return false
      if(!query)return true
      return [row.room_no,row.owner_name,row.current_status,row.status_group,row.customer_status,row.hotel_participation,row.follow_up,row.priority,row.next_action,row.source_note,row.hotel_remarks].filter(Boolean).join(' ').toLowerCase().includes(query)
    })
  },[rows,building,status,activeCategory,q])

  const countFor=(cat:CategoryDef,b?:'A'|'B')=>rows.filter(r=>(!b||r.building===b)&&cat.predicate(r)).length
  const roomListFor=(cat:CategoryDef,b:'A'|'B')=>rows.filter(r=>r.building===b&&cat.predicate(r)).map(r=>r.room_no)
  const total=rows.length
  const hotelCount=rows.filter(isHotel).length
  const nonHotelCount=total-hotelCount
  const source=rows[0]

  const selectCat=(cat:CategoryDef)=>setSelectedCategory(selectedCategory===cat.id?'':cat.id)
  const StatusCard=({cat,compact=false}:{cat:CategoryDef;compact?:boolean})=><button type="button" onClick={()=>selectCat(cat)} className={`defect-card tone-${cat.tone} ${compact?'compact':''} ${selectedCategory===cat.id?'selected':''}`}>
    <div className="card-top"><span className="cat-no">{cat.no}</span><span className={`tone-pill ${cat.tone}`}>{cat.tone==='incomplete'?'ยังไม่เสร็จ':cat.tone==='awaiting'?'รอตรวจ':cat.tone==='complete'?'ตรวจแล้ว':cat.tone==='handover'?'ส่งมอบแล้ว':'สถานะห้อง'}</span></div>
    <h3>{cat.title}</h3><p>{cat.description}</p>{cat.caution&&<small className="caution">⚠ {cat.caution}</small>}
    <div className="cat-counts"><span>A <b>{countFor(cat,'A')}</b></span><span>B <b>{countFor(cat,'B')}</b></span><span>รวม <b>{countFor(cat)}</b></span></div>
  </button>

  if(loading&&!rows.length)return <AppShell><div className="loading-screen">กำลังโหลด Defect Summary…</div></AppShell>

  return <AppShell>
    <PageHeader title="สรุปสถานะห้องและ Defect — Above Condo" subtitle="แยก Building A / B และรวมทั้งโครงการ • ข้อ 4–5 เป็นยอดแม่ ข้อ 6–11 เป็นสถานะย่อย" action={<button className="button primary" type="button" disabled={syncing} onClick={()=>syncFromDrive(false)}>{syncing?'กำลัง Sync…':'↻ Sync จาก Drive'}</button>}/>

    <div className="legend-bar" aria-label="คำอธิบายสี">
      <b>สีที่ใช้ในหน้านี้</b>
      <span className="legend hotel">ร่วมโรงแรม</span><span className="legend nonhotel">ไม่ร่วมโรงแรม</span>
      <span className="legend incomplete">Defect ยังไม่เสร็จ</span><span className="legend awaiting">Defect เสร็จ • รอตรวจ</span><span className="legend complete">ตรวจยืนยันแล้ว</span>
    </div>

    <div className="kpi-grid defect-kpis">
      <div className="kpi"><span>ห้องทั้งหมด</span><b>{total}</b><small>A {rows.filter(r=>r.building==='A').length} • B {rows.filter(r=>r.building==='B').length}</small></div>
      <div className="kpi kpi-hotel"><span>ร่วมโรงแรม</span><b>{hotelCount}</b><small>มีลูกค้า {countFor(byNo(4))} • ไม่มีลูกค้า {countFor(byNo(5))}</small></div>
      <div className="kpi kpi-nonhotel"><span>ไม่ร่วมโรงแรม</span><b>{nonHotelCount}</b><small>ส่งมอบแล้ว {countFor(byNo(1))} • รอตรวจ {countFor(byNo(3))}</small></div>
      <div className="kpi"><span>Defect ร่วมโรงแรม</span><b>{countFor(byNo(6))+countFor(byNo(7))+countFor(byNo(8))+countFor(byNo(9))+countFor(byNo(10))+countFor(byNo(11))}</b><small>แดง = ค้าง • เหลือง = รอตรวจ • เขียว = ตรวจแล้ว</small></div>
    </div>

    <section className="panel source-panel">
      <div><b>แหล่งข้อมูลที่ Web App ใช้อยู่</b><span>{source?.source_file_name||'ยังไม่มีข้อมูลจาก Drive'}</span><small>แก้ไขไฟล์ล่าสุด: {dtTH(source?.source_modified_at)} • Sync เข้าระบบ: {dtTH(source?.synced_at)}</small></div>
      <div><b>ข้อมูลชื่อเจ้าของ</b><span>{source?.owner_source_file_name||'ยังไม่พบไฟล์ Owner/Handover'}</span><small>แก้ไขล่าสุด: {dtTH(source?.owner_source_modified_at)}</small></div>
      {message&&<div className="sync-message">{message}</div>}
    </section>

    <section className="defect-section nonhotel-section">
      <div className="section-head"><div><h2><span className="program-dot nonhotel"/> ไม่ร่วมโรงแรม</h2><p>สถานะการส่งมอบลูกค้า แยกออกจาก Defect ของ Hotel Program เพื่อไม่ให้ตัวเลขปะปนกัน</p></div></div>
      <div className="defect-card-grid nonhotel-grid">{[1,2,3].map(no=><StatusCard key={no} cat={byNo(no)}/>)}</div>
    </section>

    <section className="defect-section hotel-section">
      <div className="section-head"><div><h2><span className="program-dot hotel"/> ร่วมโรงแรม — ยอดแม่และสถานะ Defect</h2><p>กรอบน้ำเงินคือยอดแม่ ส่วนสีแดง/เหลือง/เขียวคือสถานะย่อยที่รวมกันต้องเท่ากับยอดแม่</p></div></div>
      <div className="parent-grid">
        <article className="hotel-parent">
          <button type="button" className={`parent-head ${selectedCategory===byNo(4).id?'selected':''}`} onClick={()=>selectCat(byNo(4))}>
            <span className="cat-no">4</span><div><b>มีลูกค้า • ร่วมโรงแรม</b><small>ยอดแม่</small></div><strong>{countFor(byNo(4))}<small> ห้อง</small></strong>
          </button>
          <div className="parent-breakdown"><span>A {countFor(byNo(4),'A')}</span><span>B {countFor(byNo(4),'B')}</span><span>6+7+8 = {countFor(byNo(6))+countFor(byNo(7))+countFor(byNo(8))}</span></div>
          <div className="child-grid">{[6,7,8].map(no=><StatusCard key={no} cat={byNo(no)} compact/>)}</div>
        </article>
        <article className="hotel-parent">
          <button type="button" className={`parent-head ${selectedCategory===byNo(5).id?'selected':''}`} onClick={()=>selectCat(byNo(5))}>
            <span className="cat-no">5</span><div><b>ไม่มีลูกค้า • ร่วมโรงแรม</b><small>ยอดแม่</small></div><strong>{countFor(byNo(5))}<small> ห้อง</small></strong>
          </button>
          <div className="parent-breakdown"><span>A {countFor(byNo(5),'A')}</span><span>B {countFor(byNo(5),'B')}</span><span>9+10+11 = {countFor(byNo(9))+countFor(byNo(10))+countFor(byNo(11))}</span></div>
          <div className="child-grid">{[9,10,11].map(no=><StatusCard key={no} cat={byNo(no)} compact/>)}</div>
        </article>
      </div>
    </section>

    {activeCategory&&<section className={`panel selected-summary tone-${activeCategory.tone}`}>
      <div className="selected-title"><span className="cat-no">{activeCategory.no}</span><div><b>{activeCategory.title}</b><small>{activeCategory.description}</small></div><button type="button" className="button" onClick={()=>setSelectedCategory('')}>แสดงทุกห้อง</button></div>
      <div className="room-list-grid">{(['A','B'] as const).map(b=><div key={b}><h4>Building {b} — {countFor(activeCategory,b)} ห้อง</h4><div className="room-chips">{roomListFor(activeCategory,b).map(room=><button key={room} type="button" onClick={()=>setQ(room)}>{room}</button>)}</div></div>)}</div>
    </section>}

    <section className="panel detail-panel">
      <div className="detail-title"><div><h2>รายละเอียดห้อง</h2><p>แสดง {filtered.length} / {rows.length} ห้อง</p></div></div>
      <div className="toolbar defect-toolbar">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหาเลขห้อง / ชื่อเจ้าของ / สถานะ / หมายเหตุ" aria-label="ค้นหาห้อง เจ้าของ หรือสถานะ"/>
        <select value={building} onChange={e=>setBuilding(e.target.value)}><option value="ALL">Building A + B</option><option value="A">Building A</option><option value="B">Building B</option></select>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">ทุกสถานะ</option>{statusOptions.map(v=><option key={v} value={v}>{v}</option>)}</select>
        {(q||building!=='ALL'||status||selectedCategory)&&<button type="button" className="button" onClick={()=>{setQ('');setBuilding('ALL');setStatus('');setSelectedCategory('')}}>ล้างตัวกรอง</button>}
      </div>
      <div className="table-wrap defect-table-wrap"><table><thead><tr><th>ห้อง</th><th>อาคาร</th><th>ชื่อเจ้าของ</th><th>ลูกค้า</th><th>Hotel Program</th><th>สถานะงาน</th><th>Priority</th><th>ต้องทำต่อ</th></tr></thead><tbody>
        {filtered.map(row=><tr key={row.room_no}><td><b>{row.room_no}</b><small>ชั้น {row.floor??'-'}</small></td><td>{row.building}</td><td>{row.owner_name||<span className="muted">—</span>}</td><td>{row.customer_status}</td><td><span className={`program-pill ${isHotel(row)?'hotel':'nonhotel'}`}>{row.hotel_participation}</span></td><td><span className={`work-pill ${defectTone(row)}`}>{defectLabel(row)}</span><small className="raw-status">{row.current_status}</small>{row.hotel_remarks&&<small>{row.hotel_remarks}</small>}</td><td>{row.priority||'-'}</td><td>{row.next_action||row.follow_up||'-'}</td></tr>)}
        {!filtered.length&&<tr><td colSpan={8} style={{textAlign:'center',padding:28}} className="muted">ไม่พบห้องตามเงื่อนไขที่ค้นหา</td></tr>}
      </tbody></table></div>
    </section>

    <section className="panel definition-panel">
      <h2>เกณฑ์และความหมายของสี</h2>
      <div className="definition-grid">
        <div><b><span className="mini-dot hotel"/> น้ำเงิน — ร่วมโรงแรม</b><span>Hotel Participation = “ร่วมโรงแรม” และข้อ 4–5 เป็นยอดแม่</span></div>
        <div><b><span className="mini-dot nonhotel"/> เทา — ไม่ร่วมโรงแรม</b><span>แยกจาก Hotel Program และติดตามตามสถานะส่งมอบลูกค้า</span></div>
        <div><b><span className="mini-dot incomplete"/> แดง — Defect ยังไม่เสร็จ</b><span>Not Completed / In Progress ต้องติดตามงานแก้ไข</span></div>
        <div><b><span className="mini-dot awaiting"/> เหลือง — Defect เสร็จ รอตรวจ</b><span>งานแก้เสร็จแล้ว แต่ยังรอ Hotel Engineer ตรวจยืนยัน</span></div>
        <div><b><span className="mini-dot complete"/> เขียว — ตรวจยืนยันแล้ว</b><span>Defect เสร็จและ Hotel Engineer ตรวจยืนยันแล้ว</span></div>
        <div><b>การหาไฟล์ล่าสุด</b><span>ใช้ File ID เดิมก่อน แล้วค้น Spreadsheet ล่าสุดและตรวจโครงสร้าง Room Master ซ้ำอีกชั้น</span></div>
      </div>
    </section>

    <style jsx>{`
      .legend-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-8px 0 18px}.legend-bar>b{font-size:12px;color:var(--muted);margin-right:2px}.legend,.tone-pill,.program-pill,.work-pill{display:inline-flex;align-items:center;border-radius:999px;font-weight:800;border:1px solid transparent}.legend{padding:6px 10px;font-size:11px}.hotel{background:#eaf2fb!important;color:#285e94!important;border-color:#c8dcef!important}.nonhotel{background:#f0f2f4!important;color:#596575!important;border-color:#d8dde3!important}.incomplete{background:#fdeceb!important;color:#9e312d!important;border-color:#f1cdca!important}.awaiting{background:#fff3dc!important;color:#85570d!important;border-color:#efdba9!important}.complete,.handover{background:#e9f6ef!important;color:#196645!important;border-color:#cce8d8!important}.defect-kpis .kpi-hotel:before{background:#2f6fb0}.defect-kpis .kpi-nonhotel:before{background:#7b8796}.source-panel{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}.source-panel>div{display:grid;gap:4px}.source-panel span{font-size:13px;overflow-wrap:anywhere}.source-panel small{color:var(--muted)}.source-panel .sync-message{grid-column:1/-1;background:#f5f2eb;border:1px solid #e4dccd;border-radius:10px;padding:9px 11px;color:#5f6875;font-size:12px}.defect-section{margin:24px 0}.section-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:12px}.section-head h2{display:flex;align-items:center;gap:8px;margin:0 0 3px;font-size:19px}.section-head p,.detail-title p{margin:0;color:var(--muted);font-size:12px}.program-dot,.mini-dot{display:inline-block;border-radius:50%;flex:0 0 auto}.program-dot{width:12px;height:12px}.mini-dot{width:9px;height:9px;margin-right:5px}.defect-card-grid{display:grid;gap:10px}.nonhotel-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.defect-card{position:relative;text-align:left;border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:15px 14px 13px;min-height:178px;box-shadow:0 6px 18px rgba(25,42,63,.04);transition:.16s;overflow:hidden}.defect-card:before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:#8b96a4}.defect-card.tone-incomplete:before{background:#b4423d}.defect-card.tone-awaiting:before{background:#d0942b}.defect-card.tone-complete:before,.defect-card.tone-handover:before{background:#27805a}.defect-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(25,42,63,.08)}.defect-card.selected,.parent-head.selected{box-shadow:0 0 0 3px rgba(201,154,59,.25);border-color:var(--gold)}.card-top{display:flex;justify-content:space-between;gap:8px;align-items:center}.cat-no{display:inline-grid;place-items:center;min-width:29px;height:29px;border-radius:9px;background:var(--navy);color:#fff;font-weight:800;font-size:12px}.tone-pill{padding:4px 8px;font-size:9px}.defect-card h3{font-size:14px;line-height:1.35;margin:11px 0 7px}.defect-card p{font-size:11px;line-height:1.45;color:var(--muted);margin:0 0 10px}.defect-card .caution{display:block;font-size:9px;line-height:1.4;color:#8a5c08;margin:0 0 9px}.cat-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:auto}.cat-counts span{background:#f4f1ea;border-radius:9px;padding:7px;text-align:center;font-size:10px;color:var(--muted)}.cat-counts b{display:block;color:var(--text);font-size:18px;margin-top:2px}.parent-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hotel-parent{border:2px solid #c7daf0;background:linear-gradient(180deg,#f4f8fd 0%,#fffdf9 24%);border-radius:18px;padding:13px;box-shadow:0 7px 22px rgba(35,77,124,.06)}.parent-head{width:100%;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px;text-align:left;background:#eaf2fb;border:1px solid #c8dcef;border-radius:13px;padding:12px;color:#244e7a}.parent-head>div{display:grid;gap:2px}.parent-head>div>b{font-size:15px}.parent-head>div>small{font-size:10px;color:#5f7fa2;font-weight:800}.parent-head>strong{font-size:28px;text-align:right}.parent-head>strong small{font-size:10px}.parent-breakdown{display:flex;gap:6px;flex-wrap:wrap;margin:9px 2px 10px}.parent-breakdown span{font-size:10px;font-weight:800;color:#52667d;background:#fff;border:1px solid #d8e4f0;border-radius:999px;padding:5px 8px}.child-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.defect-card.compact{min-height:190px;padding:12px 10px}.defect-card.compact h3{font-size:12px}.defect-card.compact .cat-counts span{padding:5px 3px}.defect-card.compact .cat-counts b{font-size:16px}.selected-summary{margin-bottom:20px;border-left:5px solid #8995a3}.selected-summary.tone-incomplete{border-left-color:#b4423d}.selected-summary.tone-awaiting{border-left-color:#d0942b}.selected-summary.tone-complete,.selected-summary.tone-handover{border-left-color:#27805a}.selected-title{display:flex;gap:11px;align-items:center}.selected-title>div{display:grid;gap:3px;flex:1}.selected-title small{color:var(--muted)}.room-list-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.room-list-grid>div{background:#f8f6f1;border:1px solid var(--line);border-radius:12px;padding:12px}.room-list-grid h4{margin:0 0 9px}.room-chips{display:flex;gap:6px;flex-wrap:wrap}.room-chips button{border:1px solid #d7d0c3;background:#fffdf9;border-radius:8px;padding:5px 7px;font-size:11px;color:#28415f}.detail-panel{padding-bottom:0}.detail-title h2{margin:0 0 4px}.defect-toolbar{margin-top:14px}.defect-toolbar select{max-width:240px}.defect-table-wrap{max-height:620px;margin:0 -19px}.defect-table-wrap table{min-width:1180px}.program-pill,.work-pill{padding:6px 9px;font-size:10px;white-space:nowrap}.raw-status{color:#8b94a0!important;font-size:9px!important;margin-top:5px!important}.definition-panel{margin-top:22px}.definition-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.definition-grid>div{display:grid;gap:4px;padding:11px;background:#f8f6f1;border:1px solid var(--line);border-radius:11px}.definition-grid span{font-size:11px;color:var(--muted);line-height:1.45}@media(max-width:1180px){.parent-grid{grid-template-columns:1fr}.definition-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.legend-bar{align-items:flex-start}.source-panel{grid-template-columns:1fr}.nonhotel-grid,.child-grid{grid-template-columns:1fr}.defect-card,.defect-card.compact{min-height:auto}.parent-head{grid-template-columns:auto 1fr auto}.parent-head>strong{font-size:22px}.room-list-grid{grid-template-columns:1fr}.selected-title{align-items:flex-start;flex-wrap:wrap}.defect-toolbar{display:grid;grid-template-columns:1fr}.defect-toolbar input,.defect-toolbar select,.defect-toolbar button{max-width:none;grid-column:auto}.definition-grid{grid-template-columns:1fr}.defect-table-wrap{margin:0 -19px}.defect-kpis{grid-template-columns:repeat(2,1fr)}}
    `}</style>
  </AppShell>
}
