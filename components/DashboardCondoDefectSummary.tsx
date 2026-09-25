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

type Tile = {
  key:string
  label:string
  tone:'neutral'|'hotel'|'danger'|'warn'|'good'
  predicate:(r:Row)=>boolean
}

const tiles:Tile[] = [
  {key:'nonhotel-customer-complete',label:'ส่งมอบลูกค้าแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Non-Hotel - Handover Complete'},
  {key:'nonhotel-customer-pending',label:'รอลูกค้าเข้าตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Non-Hotel - Pending Handover'},
  {key:'nonhotel-nosale',label:'ยังไม่มีลูกค้า',tone:'neutral',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'},
  {key:'hotel-customer-incomplete',label:'มีลูกค้า • Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Incomplete'},
  {key:'hotel-customer-awaiting',label:'มีลูกค้า • เสร็จแล้ว รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Awaiting Check'},
  {key:'hotel-customer-checked',label:'มีลูกค้า • Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า'&&r.status_group==='Hotel - Checked Complete'},
  {key:'hotel-nocustomer-incomplete',label:'ไม่มีลูกค้า • Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Incomplete'},
  {key:'hotel-nocustomer-awaiting',label:'ไม่มีลูกค้า • เสร็จแล้ว รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Awaiting Check'},
  {key:'hotel-nocustomer-checked',label:'ไม่มีลูกค้า • Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า'&&r.status_group==='Hotel - Checked Complete'},
]

function dateTH(value:string|null|undefined){
  if(!value) return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'2-digit'}).format(d)
}

export default function DashboardCondoDefectSummary(){
  const [rows,setRows]=useState<Row[]>([])
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    let alive=true
    getSupabase().from('condo_room_status').select('room_no,building,hotel_participation,customer_status,status_group,source_modified_at').order('room_no').then(({data})=>{
      if(!alive)return
      setRows((data||[]) as Row[])
      setLoading(false)
    }).catch(()=>{if(alive)setLoading(false)})
    return()=>{alive=false}
  },[])

  const summary=useMemo(()=>({
    total:rows.length,
    hotel:rows.filter(r=>r.hotel_participation==='ร่วมโรงแรม').length,
    nonhotel:rows.filter(r=>r.hotel_participation==='ไม่ร่วมโรงแรม').length,
    hotelCustomer:rows.filter(r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='มีลูกค้า').length,
    hotelNoCustomer:rows.filter(r=>r.hotel_participation==='ร่วมโรงแรม'&&r.customer_status==='ไม่มีลูกค้า').length,
  }),[rows])

  const sourceDate=rows.find(r=>r.source_modified_at)?.source_modified_at||null

  return <section className="panel dashboard-module condo-summary" style={{marginBottom:18}}>
    <div className="module-title"><span style={{fontSize:10}}>7C</span><div><b>ABOVE CONDO — ROOM / DEFECT STATUS</b><small>ดูสถานะและจำนวนห้อง • กดตัวเลขเพื่อเปิดรายชื่อห้องและเจ้าของ</small></div><Link href="/defects">ดูทั้งหมด →</Link></div>
    {loading?<p className="muted" style={{padding:14}}>กำลังโหลดสถานะห้อง…</p>:!rows.length?<div className="condo-empty">ยังไม่มีข้อมูลสถานะห้อง</div>:<>
      <div className="condo-headline">
        <div><span>ห้องทั้งหมด</span><b>{summary.total}</b></div>
        <div className="hotel"><span>ร่วมโรงแรม</span><b>{summary.hotel}</b><small>มีลูกค้า {summary.hotelCustomer} • ไม่มีลูกค้า {summary.hotelNoCustomer}</small></div>
        <div className="nonhotel"><span>ไม่ร่วมโรงแรม</span><b>{summary.nonhotel}</b></div>
        <small className="condo-date">ข้อมูล ณ {dateTH(sourceDate)}</small>
      </div>
      <div className="condo-status-grid">
        {tiles.map(tile=>{
          const all=rows.filter(tile.predicate)
          const a=all.filter(r=>r.building==='A').length
          const b=all.filter(r=>r.building==='B').length
          return <Link key={tile.key} href={`/defects?filter=${encodeURIComponent(tile.key)}`} className={`condo-status ${tile.tone}`}>
            <span>{tile.label}</span><b>{all.length}</b><small>A {a} • B {b}</small>
          </Link>
        })}
      </div>
    </>}
    <style jsx>{`
      .condo-empty{padding:18px;color:var(--muted)}
      .condo-headline{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px;border-bottom:1px solid var(--line);position:relative}
      .condo-headline>div{border:1px solid var(--line);border-radius:12px;padding:11px 13px;background:var(--surface-2)}
      .condo-headline>div.hotel{border-color:#b9d2ee;background:#edf5ff}.condo-headline>div.nonhotel{border-color:#d9dde2;background:#f4f5f6}
      .condo-headline span{display:block;font-size:11px;color:var(--muted);font-weight:700}.condo-headline b{display:block;font-size:26px;line-height:1.1;margin-top:4px}.condo-headline small{font-size:10px;color:var(--muted)}.condo-date{grid-column:1/-1;text-align:right;color:var(--muted);font-size:10px}
      .condo-status-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:14px}.condo-status{position:relative;display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;border:1px solid var(--line);border-left-width:5px;border-radius:11px;padding:10px 11px;background:var(--surface);transition:.15s}.condo-status:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(25,42,63,.07)}.condo-status span{font-size:11px;font-weight:800;line-height:1.35}.condo-status b{font-size:22px}.condo-status small{grid-column:1/-1;font-size:10px;color:var(--muted)}
      .condo-status.hotel{border-left-color:#2f6fb0}.condo-status.neutral{border-left-color:#8b949e}.condo-status.danger{border-left-color:#b4423d;background:#fff8f7}.condo-status.warn{border-left-color:#d69a22;background:#fffaf0}.condo-status.good{border-left-color:#27805a;background:#f7fcf9}
      @media(max-width:900px){.condo-status-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.condo-headline,.condo-status-grid{grid-template-columns:1fr}.condo-date{text-align:left}}
    `}</style>
  </section>
}