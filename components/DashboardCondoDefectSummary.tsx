'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

type Row = {
  room_no:string
  building:string
  hotel_participation:string
  customer_status:string
  status_group:string|null
  source_modified_at:string|null
}

type StatusDef = {
  key:string
  label:string
  tone:'neutral'|'danger'|'warn'|'good'
  predicate:(r:Row)=>boolean
}

const nonHotelStatuses:StatusDef[] = [
  {key:'nonhotel-customer-complete',label:'ส่งมอบลูกค้าแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Non-Hotel - Handover Complete'},
  {key:'nonhotel-customer-pending',label:'รอลูกค้าเข้าตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Non-Hotel - Pending Handover'},
  {key:'nonhotel-nosale',label:'ยังไม่มีลูกค้า',tone:'neutral',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'},
]

const hotelCustomerStatuses:StatusDef[] = [
  {key:'hotel-customer-incomplete',label:'Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Incomplete'},
  {key:'hotel-customer-awaiting',label:'เสร็จแล้ว • รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Awaiting Check'},
  {key:'hotel-customer-checked',label:'Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Checked Complete'},
]

const hotelNoCustomerStatuses:StatusDef[] = [
  {key:'hotel-nocustomer-incomplete',label:'Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Incomplete'},
  {key:'hotel-nocustomer-awaiting',label:'เสร็จแล้ว • รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Awaiting Check'},
  {key:'hotel-nocustomer-checked',label:'Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Checked Complete'},
]

function dateTimeTH(value:string|null|undefined){
  if(!value) return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}

function latestDate(rows:Row[]){
  const values=rows.map(r=>r.source_modified_at).filter(Boolean) as string[]
  if(!values.length)return null
  return values.reduce((latest,current)=>new Date(current)>new Date(latest)?current:latest)
}

function StatusTile({def,rows}:{def:StatusDef;rows:Row[]}){
  const list=rows.filter(def.predicate)
  const a=list.filter(r=>r.building==='A').length
  const b=list.filter(r=>r.building==='B').length
  return <Link href={`/defects?filter=${encodeURIComponent(def.key)}`} className={`condo-status ${def.tone}`}>
    <div><span>{def.label}</span><small>Building A {a} • Building B {b}</small></div>
    <b>{list.length}<em>ห้อง</em></b>
  </Link>
}

export default function DashboardCondoDefectSummary(){
  const [rows,setRows]=useState<Row[]>([])
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    let alive=true
    ;(async()=>{
      try{
        const {data}=await getSupabase().from('condo_room_status').select('room_no,building,hotel_participation,customer_status,status_group,source_modified_at').order('room_no')
        if(alive)setRows((data||[]) as Row[])
      }finally{
        if(alive)setLoading(false)
      }
    })()
    return()=>{alive=false}
  },[])

  const summary=useMemo(()=>({
    total:rows.length,
    buildingA:rows.filter(r=>r.building==='A').length,
    buildingB:rows.filter(r=>r.building==='B').length,
    hotel:rows.filter(r=>r.hotel_participation==='ร่วมโรงแรม').length,
    nonhotel:rows.filter(r=>r.hotel_participation==='ไม่ร่วมโรงแรม').length,
    hotelCustomer:rows.filter(r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า').length,
    hotelNoCustomer:rows.filter(r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า').length,
  }),[rows])

  const sourceDate=useMemo(()=>latestDate(rows),[rows])

  return <section className="panel dashboard-module condo-summary" style={{marginBottom:18}}>
    <div className="module-title"><span>9</span><div><b>ABOVE CONDO — DEFECT STATUS</b><small>ภาพรวมสถานะห้องและ Defect • กดสถานะเพื่อดูรายชื่อห้อง</small></div><Link href="/defects">เปิด Defect Report →</Link></div>
    {loading?<p className="muted" style={{padding:14}}>กำลังโหลดสถานะห้อง…</p>:!rows.length?<div className="condo-empty">ยังไม่มีข้อมูลสถานะห้อง</div>:<>
      <div className="condo-meta"><span>ข้อมูลล่าสุด <b>{dateTimeTH(sourceDate)}</b></span><span>Building A {summary.buildingA} ห้อง • Building B {summary.buildingB} ห้อง</span></div>

      <div className="condo-headline">
        <Link href="/defects" className="headline-card total"><span>ห้องทั้งหมด</span><b>{summary.total}<em>ห้อง</em></b><small>A {summary.buildingA} • B {summary.buildingB}</small></Link>
        <Link href="/defects?filter=nonhotel-nosale" className="headline-card nonhotel"><span>ไม่ร่วมโรงแรม</span><b>{summary.nonhotel}<em>ห้อง</em></b><small>สถานะส่งมอบและรอลูกค้า</small></Link>
        <Link href="/defects?filter=hotel-customer" className="headline-card hotel"><span>ร่วมโรงแรม • มีลูกค้า</span><b>{summary.hotelCustomer}<em>ห้อง</em></b><small>รวมสถานะ Defect 3 กลุ่มด้านล่าง</small></Link>
        <Link href="/defects?filter=hotel-nocustomer" className="headline-card hotel"><span>ร่วมโรงแรม • ไม่มีลูกค้า</span><b>{summary.hotelNoCustomer}<em>ห้อง</em></b><small>รวมสถานะ Defect 3 กลุ่มด้านล่าง</small></Link>
      </div>

      <div className="condo-group nonhotel-group">
        <div className="group-head"><div><span>ไม่ร่วมโรงแรม</span><b>{summary.nonhotel} ห้อง</b></div><small>สถานะการส่งมอบ</small></div>
        <div className="condo-status-grid">{nonHotelStatuses.map(def=><StatusTile key={def.key} def={def} rows={rows}/>)}</div>
      </div>

      <div className="hotel-parent-grid">
        <div className="condo-group hotel-group">
          <div className="group-head"><div><span>ร่วมโรงแรม • มีลูกค้า</span><b>{summary.hotelCustomer} ห้อง</b></div><small>ยอดรวม = 3 สถานะย่อย</small></div>
          <div className="condo-status-grid">{hotelCustomerStatuses.map(def=><StatusTile key={def.key} def={def} rows={rows}/>)}</div>
        </div>
        <div className="condo-group hotel-group">
          <div className="group-head"><div><span>ร่วมโรงแรม • ไม่มีลูกค้า</span><b>{summary.hotelNoCustomer} ห้อง</b></div><small>ยอดรวม = 3 สถานะย่อย</small></div>
          <div className="condo-status-grid">{hotelNoCustomerStatuses.map(def=><StatusTile key={def.key} def={def} rows={rows}/>)}</div>
        </div>
      </div>
    </>}
    <style jsx>{`
      .condo-summary{margin-top:18px}
      .condo-empty{padding:20px;color:var(--muted);font-size:12px}
      .condo-meta{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line);font-size:10.5px;line-height:1.4;color:var(--muted)}.condo-meta b{font-weight:700;color:var(--text)}
      .condo-headline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:12px 14px 2px}
      .headline-card{border:1px solid var(--line);border-radius:13px;padding:12px 13px;background:var(--surface-2);min-width:0;transition:.15s ease}.headline-card:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(25,42,63,.07)}.headline-card.nonhotel{background:#f5f6f7;border-color:#d9dde2}.headline-card.hotel{background:#f1f7fd;border-color:#c9dcef}.headline-card span{display:block;font-size:10px;font-weight:700;color:var(--muted);line-height:1.35}.headline-card b{display:flex;align-items:baseline;gap:5px;margin-top:5px;font-size:26px;line-height:1;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums}.headline-card b em{font-style:normal;font-size:10px;font-weight:700;color:var(--muted)}.headline-card small{display:block;margin-top:6px;font-size:9px;line-height:1.35;color:var(--muted)}
      .condo-group{margin:12px 14px 0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface)}.nonhotel-group{border-color:#d7dce1}.hotel-group{border-color:#bfd5eb;background:#fbfdff}
      .group-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;background:#f4f5f6;border-bottom:1px solid var(--line)}.hotel-group .group-head{background:#eaf3fc}.group-head>div{display:flex;align-items:baseline;gap:8px;min-width:0}.group-head span{font-size:11px;font-weight:800;color:var(--text)}.group-head b{font-size:17px;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums}.group-head small{font-size:9px;color:var(--muted);font-weight:600}
      .hotel-parent-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;padding-bottom:14px}.hotel-parent-grid .condo-group:first-child{margin-right:0}.hotel-parent-grid .condo-group:last-child{margin-left:0}
      .condo-status-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px}.condo-status{display:flex;justify-content:space-between;align-items:center;gap:9px;min-width:0;border:1px solid var(--line);border-left-width:4px;border-radius:10px;padding:10px 11px;background:var(--surface);transition:.15s}.condo-status:hover{transform:translateY(-1px);box-shadow:0 5px 16px rgba(25,42,63,.06)}.condo-status>div{min-width:0}.condo-status span{display:block;font-size:10px;font-weight:700;line-height:1.35;color:var(--text)}.condo-status small{display:block;margin-top:4px;font-size:8.5px;line-height:1.3;color:var(--muted)}.condo-status b{display:flex;align-items:baseline;gap:3px;font-size:20px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}.condo-status b em{font-style:normal;font-size:8.5px;font-weight:600;color:var(--muted)}.condo-status.neutral{border-left-color:#8b949e}.condo-status.danger{border-left-color:#b4423d;background:#fff8f7}.condo-status.danger b{color:var(--red)}.condo-status.warn{border-left-color:#d69a22;background:#fffaf0}.condo-status.warn b{color:#9a650f}.condo-status.good{border-left-color:#27805a;background:#f7fcf9}.condo-status.good b{color:var(--green)}
      @media(max-width:1180px){.condo-headline{grid-template-columns:repeat(2,1fr)}.hotel-parent-grid{grid-template-columns:1fr}.hotel-parent-grid .condo-group{margin:12px 14px 0}.condo-status-grid{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:720px){.condo-headline,.condo-status-grid{grid-template-columns:1fr}.condo-meta{display:grid}.group-head{align-items:flex-start;flex-direction:column}.group-head>div{width:100%;justify-content:space-between}.headline-card b{font-size:24px}}
    `}</style>
  </section>
}
