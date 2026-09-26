'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'

type RoomRow = {
  room_no:string
  building:string
  floor:number|null
  owner_name:string|null
  hotel_participation:string
  customer_status:string
  current_status:string
  status_group:string|null
  follow_up:string|null
  priority:string|null
  next_action:string|null
  source_modified_at:string|null
}

type Category = {
  id:string
  label:string
  short:string
  tone:'neutral'|'danger'|'warn'|'good'|'hotel'
  predicate:(r:RoomRow)=>boolean
}

const categories:Category[] = [
  {id:'nonhotel-customer-complete',label:'ไม่ร่วมโรงแรม • ส่งมอบลูกค้าแล้ว',short:'ส่งมอบลูกค้าแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Non-Hotel - Handover Complete'},
  {id:'nonhotel-nosale',label:'ไม่ร่วมโรงแรม • ยังไม่มีลูกค้า',short:'ยังไม่มีลูกค้า',tone:'neutral',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'},
  {id:'nonhotel-customer-pending',label:'ไม่ร่วมโรงแรม • รอลูกค้าเข้าตรวจ',short:'รอลูกค้าเข้าตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Non-Hotel - Pending Handover'},
  {id:'hotel-customer',label:'ร่วมโรงแรม • มีลูกค้า',short:'ร่วมโรงแรม • มีลูกค้า',tone:'hotel',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'},
  {id:'hotel-nocustomer',label:'ร่วมโรงแรม • ไม่มีลูกค้า',short:'ร่วมโรงแรม • ไม่มีลูกค้า',tone:'hotel',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'},
  {id:'hotel-customer-incomplete',label:'มีลูกค้า • Defect ยังไม่เสร็จ',short:'Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Incomplete'},
  {id:'hotel-customer-awaiting',label:'มีลูกค้า • Defect เสร็จ • รอ Hotel ตรวจ',short:'เสร็จ • รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Awaiting Check'},
  {id:'hotel-customer-checked',label:'มีลูกค้า • Hotel ตรวจแล้ว',short:'Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Checked Complete'},
  {id:'hotel-nocustomer-awaiting',label:'ไม่มีลูกค้า • Defect เสร็จ • รอ Hotel ตรวจ',short:'เสร็จ • รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Awaiting Check'},
  {id:'hotel-nocustomer-checked',label:'ไม่มีลูกค้า • Hotel ตรวจแล้ว',short:'Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Checked Complete'},
  {id:'hotel-nocustomer-incomplete',label:'ไม่มีลูกค้า • Defect ยังไม่เสร็จ',short:'Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Incomplete'},
]

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}

function statusTone(r:RoomRow){
  if(r.status_group==='Hotel - Incomplete')return 'danger'
  if(r.status_group==='Hotel - Awaiting Check'||r.status_group==='Non-Hotel - Pending Handover')return 'warn'
  if(r.status_group==='Hotel - Checked Complete'||r.status_group==='Non-Hotel - Handover Complete')return 'good'
  return 'neutral'
}

function statusLabel(r:RoomRow){
  if(r.status_group==='Hotel - Incomplete')return 'Defect ยังไม่เสร็จ'
  if(r.status_group==='Hotel - Awaiting Check')return 'Defect เสร็จ • รอ Hotel ตรวจ'
  if(r.status_group==='Hotel - Checked Complete')return 'Hotel ตรวจแล้ว'
  if(r.status_group==='Non-Hotel - Pending Handover')return 'รอลูกค้าเข้าตรวจ'
  if(r.status_group==='Non-Hotel - Handover Complete')return 'ส่งมอบลูกค้าแล้ว'
  if(r.status_group==='Non-Hotel - Awaiting Sale')return 'ยังไม่มีลูกค้า'
  return r.current_status
}

function latestSourceDate(rows:RoomRow[]){
  const values=rows.map(r=>r.source_modified_at).filter(Boolean) as string[]
  if(!values.length)return null
  return values.reduce((latest,current)=>new Date(current)>new Date(latest)?current:latest)
}

export default function DefectDetailPage(){
  const [rows,setRows]=useState<RoomRow[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('')
  const [building,setBuilding]=useState('ALL')
  const [q,setQ]=useState('')

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const initial=params.get('filter')||''
    const initialBuilding=params.get('building')||'ALL'
    if(categories.some(c=>c.id===initial))setFilter(initial)
    if(['ALL','A','B'].includes(initialBuilding))setBuilding(initialBuilding)
    let alive=true
    ;(async()=>{
      try{
        const {data,error}=await getSupabase().from('condo_room_status').select('room_no,building,floor,owner_name,hotel_participation,customer_status,current_status,status_group,follow_up,priority,next_action,source_modified_at').order('building').order('floor').order('room_no')
        if(alive&&!error)setRows((data||[]) as RoomRow[])
      }finally{
        if(alive)setLoading(false)
      }
    })()
    return()=>{alive=false}
  },[])

  const active=useMemo(()=>categories.find(c=>c.id===filter)||null,[filter])
  const sourceDate=useMemo(()=>latestSourceDate(rows),[rows])
  const filtered=useMemo(()=>{
    const needle=q.trim().toLowerCase()
    return rows.filter(r=>{
      if(building!=='ALL'&&r.building!==building)return false
      if(active&&!active.predicate(r))return false
      if(!needle)return true
      return [r.room_no,r.owner_name,r.customer_status,r.hotel_participation,statusLabel(r),r.next_action,r.follow_up].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  },[rows,building,active,q])

  const baseRows=useMemo(()=>active?rows.filter(active.predicate):rows,[rows,active])
  const aCount=baseRows.filter(r=>r.building==='A').length
  const bCount=baseRows.filter(r=>r.building==='B').length
  const totalCount=baseRows.length

  function jumpToRooms(nextBuilding:'ALL'|'A'|'B'){
    setBuilding(nextBuilding)
    window.setTimeout(()=>document.getElementById('room-list')?.scrollIntoView({behavior:'smooth',block:'start'}),40)
  }

  return <AppShell>
    <PageHeader
      title="Above Condo — รายละเอียดสถานะห้อง"
      subtitle={`ค้นหาเลขห้องหรือชื่อเจ้าของ, กรอง Building A/B, สถานะ Defect ปัจจุบัน • อัปเดตข้อมูล ${dateTimeTH(sourceDate)}`}
      action={<Link href="/" className="button">← Dashboard</Link>}
    />

    {loading?<div className="panel">กำลังโหลดข้อมูลห้อง…</div>:<>
      <section className={`selected-status ${active?.tone||'neutral'}`}>
        <div className="selected-copy"><span>{active?'สถานะที่เลือก':'ห้องทั้งหมด'}</span><h2>{active?.label||'Above Condo — ทุกสถานะ'}</h2><p>กดจำนวน Building A / B / รวม เพื่อเปิดรายชื่อห้องตามกลุ่มนั้น</p></div>
        <div className="selected-counts">
          <button type="button" className={building==='A'?'active':''} onClick={()=>jumpToRooms('A')}><span>Building A</span><b>{aCount}</b><small>ห้อง</small></button>
          <button type="button" className={building==='B'?'active':''} onClick={()=>jumpToRooms('B')}><span>Building B</span><b>{bCount}</b><small>ห้อง</small></button>
          <button type="button" className={building==='ALL'?'active':''} onClick={()=>jumpToRooms('ALL')}><span>รวม</span><b>{totalCount}</b><small>ห้อง</small></button>
        </div>
      </section>

      <section className="panel filter-panel">
        <div className="toolbar detail-toolbar">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหาเลขห้องหรือชื่อเจ้าของ" aria-label="ค้นหาเลขห้องหรือชื่อเจ้าของ"/>
          <select value={building} onChange={e=>setBuilding(e.target.value)} aria-label="กรองอาคาร"><option value="ALL">Building A + B</option><option value="A">Building A</option><option value="B">Building B</option></select>
          <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="กรองสถานะ Defect"><option value="">ทุกสถานะ Defect</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
          {(q||building!=='ALL'||filter)&&<button type="button" className="button" onClick={()=>{setQ('');setBuilding('ALL');setFilter('')}}>ล้างตัวกรอง</button>}
        </div>
      </section>

      <section className="panel detail-panel" id="room-list">
        <div className="detail-head"><div><h2>รายชื่อห้อง</h2><p>แสดง {filtered.length} ห้อง</p></div><div className="legend"><span><i className="hotel-dot"/>ร่วมโรงแรม</span><span><i className="nonhotel-dot"/>ไม่ร่วมโรงแรม</span><span><i className="bad-dot"/>ยังไม่เสร็จ</span><span><i className="warn-dot"/>รอตรวจ</span><span><i className="good-dot"/>ปิดแล้ว</span></div></div>
        <div className="table-wrap defect-table"><table><thead><tr><th>ห้อง</th><th className="center">อาคาร</th><th className="center owner-head">ชื่อลูกค้า/เจ้าของ</th><th className="center">ลูกค้า</th><th className="center">โรงแรม</th><th className="center status-head">สถานะ</th><th>ต้องทำต่อ</th></tr></thead><tbody>
          {filtered.map(r=><tr key={r.room_no}>
            <td className="room-cell"><b>{r.room_no}</b><small>ชั้น {r.floor??'-'}</small></td>
            <td className="center building-cell"><b>{r.building}</b></td>
            <td className="owner-cell">{r.owner_name||<span className="muted">—</span>}</td>
            <td className="center">{r.customer_status}</td>
            <td className="center"><span className={`program-badge ${r.hotel_participation==='ร่วมโรงแรม'?'hotel':'nonhotel'}`}>{r.hotel_participation}</span></td>
            <td className="center status-cell"><span className={`state-badge ${statusTone(r)}`}>{statusLabel(r)}</span></td>
            <td className="next-cell">{r.next_action||r.follow_up||'-'}</td>
          </tr>)}
          {!filtered.length&&<tr><td colSpan={7} className="muted" style={{padding:28,textAlign:'center'}}>ไม่พบห้องตามเงื่อนไข</td></tr>}
        </tbody></table></div>
      </section>
    </>}

    <style jsx>{`
      .selected-status{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:17px 19px;border:1px solid var(--line);border-left:5px solid #8b949e;border-radius:16px;background:var(--surface);margin-bottom:14px;box-shadow:0 7px 22px rgba(25,42,63,.045)}.selected-status.hotel{border-left-color:#2f6fb0;background:#f5f9fe}.selected-status.danger{border-left-color:#b4423d;background:#fff8f7}.selected-status.warn{border-left-color:#d69a22;background:#fffaf0}.selected-status.good{border-left-color:#27805a;background:#f6fbf8}
      .selected-copy{min-width:0}.selected-copy>span{font-size:9.5px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}.selected-copy h2{margin:4px 0 4px;font-size:19px;line-height:1.25;color:var(--navy);letter-spacing:-.015em}.selected-copy p{margin:0;color:var(--muted);font-size:10px;line-height:1.45}
      .selected-counts{display:grid;grid-template-columns:repeat(3,96px);gap:7px}.selected-counts button{border:1px solid var(--line);border-radius:11px;padding:8px 9px;text-align:center;background:rgba(255,255,255,.84);color:var(--text);transition:.15s}.selected-counts button:hover,.selected-counts button.active{border-color:#a9bfd6;background:#f0f6fc;box-shadow:0 4px 12px rgba(47,111,176,.08)}.selected-counts span{display:block;font-size:8.5px;color:var(--muted);font-weight:700}.selected-counts b{display:inline-block;margin-top:2px;font-size:22px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums;color:var(--navy)}.selected-counts small{margin-left:4px;font-size:8.5px;color:var(--muted);font-weight:600}
      .filter-panel{padding:13px;margin-bottom:14px}.detail-toolbar{margin:0}.detail-toolbar input{min-width:260px}.detail-toolbar select{max-width:270px}
      .detail-panel{padding-bottom:0;scroll-margin-top:16px}.detail-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:12px}.detail-head h2{margin:0;font-size:18px;letter-spacing:-.01em}.detail-head p{margin:3px 0 0;color:var(--muted);font-size:10.5px}.legend{display:flex;gap:10px;flex-wrap:wrap;font-size:9px;color:var(--muted)}.legend span{display:flex;align-items:center;gap:4px}.legend i{width:8px;height:8px;border-radius:50%;display:inline-block}.hotel-dot{background:#2f6fb0}.nonhotel-dot{background:#8b949e}.bad-dot{background:#b4423d}.warn-dot{background:#d69a22}.good-dot{background:#27805a}
      .defect-table{max-height:660px;margin:0 -19px}.defect-table table{min-width:1120px}.defect-table th{font-size:10.5px;letter-spacing:.02em;text-transform:none;font-weight:800;vertical-align:middle}.defect-table td{font-size:12px;line-height:1.45;vertical-align:middle}.defect-table th.center,.defect-table td.center{text-align:center}.room-cell b{font-size:12.5px;color:var(--navy);font-weight:800}.room-cell small{font-size:9px}.building-cell b{font-weight:800;color:var(--navy-2)}.owner-head{min-width:210px}.owner-cell{text-align:left;min-width:210px}.status-head{min-width:190px}.status-cell{min-width:190px}.next-cell{min-width:250px;text-align:left;color:#34445b}
      .program-badge,.state-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;font-size:9.5px;line-height:1.2;font-weight:700;border:1px solid transparent;white-space:nowrap}.program-badge.hotel{background:#eaf2fb;border-color:#c7ddef;color:#245f96}.program-badge.nonhotel{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}.state-badge.danger{background:#fdeceb;border-color:#f1cdca;color:#9e312d}.state-badge.warn{background:#fff3dc;border-color:#f0dfb8;color:#85570d}.state-badge.good{background:#e9f6ef;border-color:#cfe9da;color:#196645}.state-badge.neutral{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}
      @media(max-width:900px){.selected-status{align-items:flex-start;flex-direction:column}.selected-counts{width:100%;grid-template-columns:repeat(3,1fr)}}
      @media(max-width:700px){.selected-status{padding:14px}.selected-copy h2{font-size:17px}.selected-counts b{font-size:20px}.detail-toolbar input{min-width:0}.detail-toolbar select{max-width:none}.detail-head{align-items:flex-start;flex-direction:column}.legend{gap:7px}.defect-table{margin:0 -19px}.defect-table table{min-width:1060px}}
    `}</style>
  </AppShell>
}
