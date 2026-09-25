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

type CategoryDef = {
  id: string
  no: number
  title: string
  description: string
  predicate: (row: RoomRow) => boolean
  caution?: string
}

const isHotel = (r: RoomRow) => r.hotel_participation === 'ร่วมโรงแรม'
const hasCustomer = (r: RoomRow) => r.customer_status === 'มีลูกค้า'
const groupIs = (r: RoomRow, value: string) => r.status_group === value

const categories: CategoryDef[] = [
  {
    id: 'nonhotel-customer-complete', no: 1,
    title: 'มีลูกค้า • ไม่ร่วมโรงแรม • ส่งมอบแล้ว',
    description: 'ลูกค้าตรวจรับและส่งมอบห้องเรียบร้อยแล้ว',
    predicate: r => !isHotel(r) && hasCustomer(r) && r.current_status.includes('Handover Complete'),
  },
  {
    id: 'nonhotel-nosale', no: 2,
    title: 'ไม่มีลูกค้า • ไม่ร่วมโรงแรม',
    description: 'ห้องยังไม่มีลูกค้า และไม่ได้อยู่ใน Hotel Program',
    predicate: r => !isHotel(r) && !hasCustomer(r),
  },
  {
    id: 'nonhotel-customer-pending', no: 3,
    title: 'มีลูกค้า • ไม่ร่วมโรงแรม • รอลูกค้าเข้าตรวจ',
    description: 'ห้องพร้อมส่งมอบ แต่ยังรอลูกค้าเข้าตรวจเพื่อรับมอบ',
    predicate: r => !isHotel(r) && hasCustomer(r) && !r.current_status.includes('Handover Complete'),
  },
  {
    id: 'hotel-customer', no: 4,
    title: 'มีลูกค้า • ร่วมโรงแรม',
    description: 'ยอดแม่ของห้องที่มีลูกค้าและเข้าร่วม Hotel Program',
    predicate: r => isHotel(r) && hasCustomer(r),
  },
  {
    id: 'hotel-nocustomer', no: 5,
    title: 'ไม่มีลูกค้า • ร่วมโรงแรม',
    description: 'ยอดแม่ของห้องที่ยังไม่มีลูกค้าและเข้าร่วม Hotel Program',
    predicate: r => isHotel(r) && !hasCustomer(r),
  },
  {
    id: 'hotel-customer-incomplete', no: 6,
    title: 'มีลูกค้า • ร่วมโรงแรม • Defect ยังไม่เสร็จ',
    description: 'รายการ Defect ยังอยู่ในสถานะ Not Completed / In Progress',
    caution: 'ไฟล์ต้นทางปัจจุบันยังไม่มีฟิลด์แยกชัดเจนว่า Hotel ตรวจงานค้างแล้วหรือยัง จึงไม่สรุปเกินข้อมูล',
    predicate: r => isHotel(r) && hasCustomer(r) && groupIs(r, 'Hotel - Incomplete'),
  },
  {
    id: 'hotel-customer-awaiting', no: 7,
    title: 'มีลูกค้า • ร่วมโรงแรม • Defect เสร็จ • รอ Hotel ตรวจ',
    description: 'แก้ Defect เสร็จแล้ว แต่ยังรอ Hotel Engineer ตรวจยืนยัน',
    predicate: r => isHotel(r) && hasCustomer(r) && groupIs(r, 'Hotel - Awaiting Check'),
  },
  {
    id: 'hotel-customer-checked', no: 8,
    title: 'มีลูกค้า • ร่วมโรงแรม • Hotel ตรวจแล้ว',
    description: 'Defect เสร็จ และ Hotel Engineer ตรวจยืนยันแล้ว',
    predicate: r => isHotel(r) && hasCustomer(r) && groupIs(r, 'Hotel - Checked Complete'),
  },
  {
    id: 'hotel-nocustomer-awaiting', no: 9,
    title: 'ไม่มีลูกค้า • ร่วมโรงแรม • Defect เสร็จ • รอ Hotel ตรวจ',
    description: 'ห้องไม่มีลูกค้า งาน Defect เสร็จแล้ว แต่ยังรอ Hotel Engineer ตรวจ',
    predicate: r => isHotel(r) && !hasCustomer(r) && groupIs(r, 'Hotel - Awaiting Check'),
  },
  {
    id: 'hotel-nocustomer-checked', no: 10,
    title: 'ไม่มีลูกค้า • ร่วมโรงแรม • Hotel ตรวจแล้ว',
    description: 'ห้องไม่มีลูกค้า งาน Defect เสร็จ และ Hotel Engineer ตรวจยืนยันแล้ว',
    predicate: r => isHotel(r) && !hasCustomer(r) && groupIs(r, 'Hotel - Checked Complete'),
  },
  {
    id: 'hotel-nocustomer-incomplete', no: 11,
    title: 'ไม่มีลูกค้า • ร่วมโรงแรม • Defect ยังไม่เสร็จ',
    description: 'ห้องไม่มีลูกค้า รายการ Defect ยังอยู่ในสถานะ Not Completed / In Progress',
    caution: 'ไฟล์ต้นทางปัจจุบันยังไม่มีฟิลด์แยกชัดเจนว่า Hotel ตรวจงานค้างแล้วหรือยัง จึงแสดงเป็น “Defect ยังไม่เสร็จ”',
    predicate: r => isHotel(r) && !hasCustomer(r) && groupIs(r, 'Hotel - Incomplete'),
  },
]

function dtTH(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

function statusTone(row: RoomRow) {
  if (row.status_group === 'Hotel - Checked Complete' || row.current_status.includes('Handover Complete')) return 'good'
  if (row.status_group === 'Hotel - Awaiting Check' || row.current_status.includes('Pending Handover')) return 'warn'
  if (row.status_group === 'Hotel - Incomplete') return 'bad'
  return 'info'
}

export default function CondoDefectDashboardPage() {
  const [rows, setRows] = useState<RoomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [q, setQ] = useState('')
  const [building, setBuilding] = useState('ALL')
  const [status, setStatus] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const loadRows = async () => {
    const s = getSupabase()
    const { data, error } = await s.from('condo_room_status').select('*').order('building').order('floor').order('room_no')
    if (error) throw error
    setRows((data || []) as RoomRow[])
    return (data || []) as RoomRow[]
  }

  const syncFromDrive = async (silent = false) => {
    setSyncing(true)
    if (!silent) setMessage('กำลังค้นหาไฟล์ล่าสุดใน Google Drive และอัปเดตข้อมูล…')
    try {
      const s = getSupabase()
      const { data, error } = await s.functions.invoke('google-drive-sync', { body: { action: 'sync_condo_defect' } })
      if (error) throw error
      const refreshed = await loadRows()
      const sourceName = data?.source?.name || refreshed[0]?.source_file_name || 'ไฟล์ล่าสุด'
      setMessage(`อัปเดตสำเร็จ ${refreshed.length} ห้อง • ${sourceName}`)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'ไม่สามารถ Sync ได้'
      setMessage(`Sync Drive ไม่สำเร็จ: ${text} • แสดงข้อมูลล่าสุดที่มีในระบบแทน`)
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const existing = await loadRows()
        if (!active) return
        setLoading(false)
        await syncFromDrive(true)
        if (!existing.length && active) setMessage('กำลังเตรียมข้อมูลครั้งแรกจาก Google Drive')
      } catch (error) {
        if (!active) return
        setLoading(false)
        setMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ')
      }
    })()
    return () => { active = false }
  }, [])

  const statusOptions = useMemo(() => Array.from(new Set(rows.map(r => r.current_status).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'th')), [rows])
  const activeCategory = useMemo(() => categories.find(c => c.id === selectedCategory) || null, [selectedCategory])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return rows.filter(row => {
      if (building !== 'ALL' && row.building !== building) return false
      if (status && row.current_status !== status) return false
      if (activeCategory && !activeCategory.predicate(row)) return false
      if (!query) return true
      const haystack = [
        row.room_no, row.owner_name, row.current_status, row.status_group, row.customer_status,
        row.hotel_participation, row.follow_up, row.priority, row.next_action, row.source_note, row.hotel_remarks,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [rows, building, status, activeCategory, q])

  const total = rows.length
  const hotelCount = rows.filter(isHotel).length
  const followCount = rows.filter(r => r.follow_up === 'ต้องติดตาม').length
  const closedCount = rows.filter(r => r.follow_up !== 'ต้องติดตาม').length
  const source = rows[0]

  const roomListFor = (category: CategoryDef, b: 'A' | 'B') => rows.filter(r => r.building === b && category.predicate(r)).map(r => r.room_no)
  const countFor = (category: CategoryDef, b?: 'A' | 'B') => rows.filter(r => (!b || r.building === b) && category.predicate(r)).length

  if (loading && !rows.length) return <AppShell><div className="loading-screen">กำลังโหลด Defect Summary…</div></AppShell>

  return <AppShell>
    <PageHeader
      title="สรุปสถานะห้องและ Defect — Above Condo"
      subtitle="แยก Building A / B และรวมทั้งโครงการ • ค้นหาเลขห้อง ชื่อเจ้าของ และสถานะได้ในช่องเดียว"
      action={<button className="button primary" type="button" disabled={syncing} onClick={()=>syncFromDrive(false)}>{syncing?'กำลัง Sync…':'↻ Sync จาก Drive'}</button>}
    />

    <div className="kpi-grid defect-kpis">
      <div className="kpi"><span>ห้องทั้งหมด</span><b>{total}</b><small>A {rows.filter(r=>r.building==='A').length} • B {rows.filter(r=>r.building==='B').length}</small></div>
      <div className="kpi"><span>ร่วมโรงแรม</span><b>{hotelCount}</b><small>มีลูกค้า {rows.filter(r=>isHotel(r)&&hasCustomer(r)).length} • ไม่มีลูกค้า {rows.filter(r=>isHotel(r)&&!hasCustomer(r)).length}</small></div>
      <div className="kpi"><span>ต้องติดตาม</span><b>{followCount}</b><small>Pending / Defect / รอตรวจ / รอขาย</small></div>
      <div className="kpi"><span>ปิดสถานะแล้ว</span><b>{closedCount}</b><small>Handover Complete / Hotel Checked</small></div>
    </div>

    <section className="panel source-panel">
      <div>
        <b>แหล่งข้อมูลที่ Web App ใช้อยู่</b>
        <span>{source?.source_file_name || 'ยังไม่มีข้อมูลจาก Drive'}</span>
        <small>แก้ไขไฟล์ล่าสุด: {dtTH(source?.source_modified_at)} • Sync เข้าระบบ: {dtTH(source?.synced_at)}</small>
      </div>
      <div>
        <b>ข้อมูลชื่อเจ้าของ</b>
        <span>{source?.owner_source_file_name || 'ยังไม่พบไฟล์ Owner/Handover'}</span>
        <small>แก้ไขล่าสุด: {dtTH(source?.owner_source_modified_at)}</small>
      </div>
      {message && <div className="sync-message">{message}</div>}
    </section>

    <section className="defect-section">
      <div className="section-head">
        <div><h2>1–5 • ภาพรวมห้องและการส่งมอบ</h2><p>ข้อ 4–5 เป็นยอดแม่ของห้องร่วมโรงแรม ส่วนข้อ 6–11 เป็นรายละเอียดภายในยอดแม่</p></div>
      </div>
      <div className="defect-card-grid">
        {categories.slice(0,5).map(cat => <button key={cat.id} type="button" onClick={()=>setSelectedCategory(selectedCategory===cat.id?'':cat.id)} className={`defect-card ${selectedCategory===cat.id?'selected':''}`}>
          <span className="cat-no">{cat.no}</span><h3>{cat.title}</h3><p>{cat.description}</p>
          <div className="cat-counts"><span>A <b>{countFor(cat,'A')}</b></span><span>B <b>{countFor(cat,'B')}</b></span><span>รวม <b>{countFor(cat)}</b></span></div>
        </button>)}
      </div>
    </section>

    <section className="defect-section">
      <div className="section-head">
        <div><h2>6–11 • สถานะ Defect ของห้องร่วมโรงแรม</h2><p>แยกตามมีลูกค้า/ไม่มีลูกค้า และสถานะงาน Defect ล่าสุดจากไฟล์ Hotel Completion</p></div>
      </div>
      <div className="defect-card-grid defect-card-grid-3">
        {categories.slice(5).map(cat => <button key={cat.id} type="button" onClick={()=>setSelectedCategory(selectedCategory===cat.id?'':cat.id)} className={`defect-card ${selectedCategory===cat.id?'selected':''}`}>
          <span className="cat-no">{cat.no}</span><h3>{cat.title}</h3><p>{cat.description}</p>
          {cat.caution && <small className="caution">⚠ {cat.caution}</small>}
          <div className="cat-counts"><span>A <b>{countFor(cat,'A')}</b></span><span>B <b>{countFor(cat,'B')}</b></span><span>รวม <b>{countFor(cat)}</b></span></div>
        </button>)}
      </div>
    </section>

    {activeCategory && <section className="panel selected-summary">
      <div className="selected-title"><span className="cat-no">{activeCategory.no}</span><div><b>{activeCategory.title}</b><small>{activeCategory.description}</small></div><button type="button" className="button" onClick={()=>setSelectedCategory('')}>แสดงทุกห้อง</button></div>
      <div className="room-list-grid">
        {(['A','B'] as const).map(b => <div key={b}><h4>Building {b} — {countFor(activeCategory,b)} ห้อง</h4><div className="room-chips">{roomListFor(activeCategory,b).map(room=><button key={room} type="button" onClick={()=>setQ(room)}>{room}</button>)}</div></div>)}
      </div>
    </section>}

    <section className="panel detail-panel">
      <div className="detail-title"><div><h2>รายละเอียดห้อง</h2><p>แสดง {filtered.length} / {rows.length} ห้อง</p></div></div>
      <div className="toolbar defect-toolbar">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหาเลขห้อง / ชื่อเจ้าของ / สถานะ / หมายเหตุ" aria-label="ค้นหาห้อง เจ้าของ หรือสถานะ" />
        <select value={building} onChange={e=>setBuilding(e.target.value)}><option value="ALL">Building A + B</option><option value="A">Building A</option><option value="B">Building B</option></select>
        <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">ทุกสถานะ</option>{statusOptions.map(v=><option key={v} value={v}>{v}</option>)}</select>
        {(q||building!=='ALL'||status||selectedCategory) && <button type="button" className="button" onClick={()=>{setQ('');setBuilding('ALL');setStatus('');setSelectedCategory('')}}>ล้างตัวกรอง</button>}
      </div>
      <div className="table-wrap defect-table-wrap"><table><thead><tr><th>ห้อง</th><th>อาคาร</th><th>ชื่อเจ้าของ</th><th>ลูกค้า</th><th>Hotel Program</th><th>สถานะปัจจุบัน</th><th>Priority</th><th>ต้องทำต่อ</th></tr></thead><tbody>
        {filtered.map(row => <tr key={row.room_no}><td><b>{row.room_no}</b><small>ชั้น {row.floor ?? '-'}</small></td><td>{row.building}</td><td>{row.owner_name || <span className="muted">—</span>}</td><td>{row.customer_status}</td><td>{row.hotel_participation}</td><td><span className={`badge ${statusTone(row)}`}>{row.current_status}</span>{row.hotel_remarks && <small>{row.hotel_remarks}</small>}</td><td>{row.priority || '-'}</td><td>{row.next_action || row.follow_up || '-'}</td></tr>)}
        {!filtered.length && <tr><td colSpan={8} style={{textAlign:'center',padding:28}} className="muted">ไม่พบห้องตามเงื่อนไขที่ค้นหา</td></tr>}
      </tbody></table></div>
    </section>

    <section className="panel definition-panel">
      <h2>เกณฑ์ที่ใช้ตีความข้อมูล</h2>
      <div className="definition-grid">
        <div><b>มีลูกค้า / ไม่มีลูกค้า</b><span>อิง Customer Status ใน Room Master และประกบชื่อเจ้าของจาก Handover Source</span></div>
        <div><b>ร่วมโรงแรม</b><span>อิง Hotel Participation = “ร่วมโรงแรม” จากไฟล์สรุปล่าสุด</span></div>
        <div><b>Defect เสร็จ • รอ Hotel ตรวจ</b><span>อิง Status Group = Hotel - Awaiting Check / Completed สีแดง</span></div>
        <div><b>Hotel ตรวจแล้ว</b><span>อิง Status Group = Hotel - Checked Complete / Completed สีดำ</span></div>
        <div><b>Defect ยังไม่เสร็จ</b><span>อิง Not Completed / In Progress โดยไม่สมมติสถานะ Hotel Check ที่ source ยังไม่ได้แยก</span></div>
        <div><b>การหาไฟล์ล่าสุด</b><span>ระบบใช้ File ID เดิมก่อน แล้วค้นชื่อ/ไฟล์ Spreadsheet ที่แก้ไขล่าสุดและตรวจโครงสร้าง “Room Master” ซ้ำอีกชั้น</span></div>
      </div>
      <p className="small muted" style={{marginBottom:0}}>หมายเหตุ: การเปลี่ยนชื่อหรือย้ายไฟล์ภายในพื้นที่ Drive ที่ Service Account ยังมีสิทธิ์อ่าน จะไม่ทำให้ Sync ขาด เนื่องจาก File ID ยังใช้ได้และระบบมีการค้นหาไฟล์ล่าสุดเป็น fallback หากสร้างไฟล์ใหม่แทนไฟล์เดิม</p>
    </section>

    <style jsx>{`
      .source-panel{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}.source-panel>div{display:grid;gap:4px}.source-panel span{font-size:13px;overflow-wrap:anywhere}.source-panel small{color:var(--muted)}.source-panel .sync-message{grid-column:1/-1;background:#f5f2eb;border:1px solid #e4dccd;border-radius:10px;padding:9px 11px;color:#5f6875;font-size:12px}.defect-section{margin:24px 0}.section-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:12px}.section-head h2{margin:0 0 3px;font-size:19px}.section-head p,.detail-title p{margin:0;color:var(--muted);font-size:12px}.defect-card-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.defect-card-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.defect-card{position:relative;text-align:left;border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:16px 14px 13px;min-height:185px;box-shadow:0 6px 18px rgba(25,42,63,.04);transition:.16s}.defect-card:hover{transform:translateY(-2px);border-color:#d5bd83}.defect-card.selected{border-color:var(--gold);box-shadow:0 0 0 2px rgba(201,154,59,.14),0 10px 24px rgba(25,42,63,.07)}.cat-no{display:inline-grid;place-items:center;min-width:29px;height:29px;border-radius:9px;background:var(--navy);color:#fff;font-weight:800;font-size:12px}.defect-card h3{font-size:14px;line-height:1.35;margin:11px 0 7px}.defect-card p{font-size:11px;line-height:1.45;color:var(--muted);margin:0 0 10px}.defect-card .caution{display:block;font-size:10px;line-height:1.4;color:#8a5c08;margin:0 0 9px}.cat-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:auto}.cat-counts span{background:#f4f1ea;border-radius:9px;padding:7px;text-align:center;font-size:10px;color:var(--muted)}.cat-counts b{display:block;color:var(--text);font-size:18px;margin-top:2px}.selected-summary{margin-bottom:20px}.selected-title{display:flex;gap:11px;align-items:center}.selected-title>div{display:grid;gap:3px;flex:1}.selected-title small{color:var(--muted)}.room-list-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.room-list-grid>div{background:#f8f6f1;border:1px solid var(--line);border-radius:12px;padding:12px}.room-list-grid h4{margin:0 0 9px}.room-chips{display:flex;gap:6px;flex-wrap:wrap}.room-chips button{border:1px solid #d7d0c3;background:#fffdf9;border-radius:8px;padding:5px 7px;font-size:11px;color:#28415f}.detail-panel{padding-bottom:0}.detail-title h2{margin:0 0 4px}.defect-toolbar{margin-top:14px}.defect-toolbar select{max-width:240px}.defect-table-wrap{max-height:620px;margin:0 -19px}.defect-table-wrap table{min-width:1180px}.defect-table-wrap .badge{width:auto;max-width:250px;height:auto;white-space:normal;line-height:1.3;padding:6px 9px}.definition-panel{margin-top:22px}.definition-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.definition-grid>div{display:grid;gap:4px;padding:11px;background:#f8f6f1;border:1px solid var(--line);border-radius:11px}.definition-grid span{font-size:11px;color:var(--muted);line-height:1.45}@media(max-width:1180px){.defect-card-grid{grid-template-columns:repeat(3,1fr)}.definition-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.source-panel{grid-template-columns:1fr}.defect-card-grid,.defect-card-grid-3{grid-template-columns:1fr}.defect-card{min-height:auto}.room-list-grid{grid-template-columns:1fr}.selected-title{align-items:flex-start;flex-wrap:wrap}.defect-toolbar{display:grid;grid-template-columns:1fr}.defect-toolbar input,.defect-toolbar select,.defect-toolbar button{max-width:none;grid-column:auto}.definition-grid{grid-template-columns:1fr}.defect-table-wrap{margin:0 -19px}.defect-kpis{grid-template-columns:repeat(2,1fr)}}
    `}</style>
  </AppShell>
}
