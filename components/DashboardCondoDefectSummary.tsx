'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

type Row={
  room_no:string
  building:string
  customer_status:string
  status_group:string|null
  source_modified_at:string|null
}

type FinalStatus={
  key:string
  label:string
  note:string
  tone:'danger'|'warn'|'good'|'neutral'
  group:string
}

const finalStatuses:FinalStatus[]=[
  {key:'status-incomplete',label:'Defect ยังไม่เสร็จ',note:'ต้องปิดงาน',tone:'danger',group:'Hotel - Incomplete'},
  {key:'status-awaiting-hotel',label:'Defect เสร็จ / รอ Hotel ตรวจ',note:'รอ Hotel Engineer',tone:'warn',group:'Hotel - Awaiting Check'},
  {key:'status-hotel-checked',label:'Hotel ตรวจแล้ว',note:'ปิดสถานะ Defect',tone:'good',group:'Hotel - Checked Complete'},
  {key:'status-pending-handover',label:'Pending Handover',note:'รอลูกค้าเข้าตรวจรับ',tone:'warn',group:'Non-Hotel - Pending Handover'},
  {key:'status-handover-complete',label:'ส่งมอบแล้ว',note:'Handover Complete',tone:'good',group:'Non-Hotel - Handover Complete'},
  {key:'status-awaiting-sale',label:'Awaiting Sale',note:'ยังไม่มีลูกค้า',tone:'neutral',group:'Non-Hotel - Awaiting Sale'},
]

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}

function latestDate(rows:Row[]){
  const values=rows.map(r=>r.source_modified_at).filter(Boolean) as string[]
  if(!values.length)return null
  return values.reduce((latest,current)=>new Date(current)>new Date(latest)?current:latest)
}

export default function DashboardCondoDefectSummary(){
  const [rows,setRows]=useState<Row[]>([])
  const [loading,setLoading]=useState(true)

  useEffect(()=>{
    let alive=true
    ;(async()=>{
      try{
        const {data}=await getSupabase().from('condo_room_status').select('room_no,building,customer_status,status_group,source_modified_at').order('room_no')
        if(alive)setRows((data||[]) as Row[])
      }finally{
        if(alive)setLoading(false)
      }
    })()
    return()=>{alive=false}
  },[])

  const summary=useMemo(()=>({
    total:rows.length,
    customer:rows.filter(r=>r.customer_status==='มีลูกค้า').length,
    noCustomer:rows.filter(r=>r.customer_status==='ไม่มีลูกค้า').length,
    buildingA:rows.filter(r=>r.building==='A').length,
    buildingB:rows.filter(r=>r.building==='B').length,
  }),[rows])
  const sourceDate=useMemo(()=>latestDate(rows),[rows])

  return <section className="panel dashboard-module condo-summary" style={{marginBottom:18}}>
    <div className="module-title">
      <span>9</span>
      <div><b>ABOVE CONDO — HANDOVER / DEFECT STATUS</b><small>สถานะทั้งโครงการ • กดแต่ละช่องเพื่อเปิดรายชื่อห้องที่เกี่ยวข้อง</small></div>
      <Link href="/defects">ดูผังรายละเอียด →</Link>
    </div>
    {loading?<p className="muted" style={{padding:14}}>กำลังโหลดสถานะห้อง…</p>:!rows.length?<div className="empty">ยังไม่มีข้อมูลสถานะห้อง</div>:<>
      <div className="topline">
        <Link href="/defects" className="total-chip"><span>ห้องทั้งหมด</span><b>{summary.total}</b><em>ห้อง</em></Link>
        <Link href="/defects?filter=customer#room-list" className="mini-chip customer"><span>มีลูกค้า</span><b>{summary.customer}</b><em>ห้อง</em></Link>
        <Link href="/defects?filter=no-customer#room-list" className="mini-chip no-customer"><span>ไม่มีลูกค้า</span><b>{summary.noCustomer}</b><em>ห้อง</em></Link>
        <div className="source"><span>ตึก A <b>{summary.buildingA}</b> ห้อง • ตึก B <b>{summary.buildingB}</b> ห้อง</span><small>ข้อมูลล่าสุด {dateTimeTH(sourceDate)}</small></div>
      </div>

      <div className="status-grid">
        {finalStatuses.map(s=>{
          const list=rows.filter(r=>r.status_group===s.group)
          const a=list.filter(r=>r.building==='A').length
          const b=list.filter(r=>r.building==='B').length
          return <Link key={s.key} href={`/defects?filter=${s.key}#room-list`} className={`status-card ${s.tone}`}>
            <div><span>{s.label}</span><small>{s.note}</small><em>ตึก A {a} • ตึก B {b}</em></div>
            <b>{list.length}<small>ห้อง</small></b>
          </Link>
        })}
      </div>
      <div className="coverage"><span>Coverage Check</span><b>{finalStatuses.reduce((sum,s)=>sum+rows.filter(r=>r.status_group===s.group).length,0)} / {summary.total} ห้อง</b><small>ทุกห้องควรอยู่ในสถานะปลายทางเพียง 1 กลุ่ม</small></div>
    </>}
    <style jsx>{`
      .condo-summary{margin-top:18px}.empty{padding:20px;color:var(--muted);font-size:12px}
      .topline{display:grid;grid-template-columns:160px 150px 150px 1fr;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);align-items:stretch}
      .total-chip,.mini-chip{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--surface-2);display:flex;align-items:baseline;gap:6px;min-width:0}.total-chip span,.mini-chip span{font-size:10px;font-weight:800;color:var(--muted);margin-right:auto}.total-chip b,.mini-chip b{font-size:22px;line-height:1;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums}.total-chip em,.mini-chip em{font-style:normal;font-size:9px;color:var(--muted);font-weight:700}.mini-chip.customer{background:#eff8ff;border-color:#cfe2f4}.mini-chip.no-customer{background:#f5f6f8;border-color:#dfe3e8}
      .source{display:flex;justify-content:flex-end;align-items:flex-end;flex-direction:column;text-align:right;color:var(--muted);font-size:10px;line-height:1.45;padding:2px 0}.source b{color:var(--text);font-weight:800}.source small{font-size:9px}
      .status-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:12px 14px}.status-card{border:1px solid var(--line);border-top-width:4px;border-radius:12px;padding:11px 11px 10px;background:var(--surface);display:flex;justify-content:space-between;align-items:center;gap:9px;min-width:0;transition:.15s}.status-card:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(25,42,63,.07)}.status-card>div{min-width:0}.status-card span{display:block;font-size:10px;font-weight:800;color:var(--text);line-height:1.3}.status-card div small{display:block;margin-top:3px;font-size:8.5px;color:var(--muted);line-height:1.3}.status-card div em{display:block;margin-top:6px;font-size:8.5px;font-style:normal;color:var(--muted);font-weight:700}.status-card>b{display:flex;flex-direction:column;align-items:flex-end;font-size:24px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}.status-card>b small{font-size:8.5px;margin-top:3px;color:var(--muted)}.status-card.danger{border-top-color:#b4423d;background:#fff8f7}.status-card.danger>b{color:var(--red)}.status-card.warn{border-top-color:#d69a22;background:#fffaf0}.status-card.warn>b{color:#9a650f}.status-card.good{border-top-color:#27805a;background:#f6fbf8}.status-card.good>b{color:var(--green)}.status-card.neutral{border-top-color:#7b8490;background:#f6f7f8}.status-card.neutral>b{color:#59616c}
      .coverage{margin:0 14px 14px;border:1px solid var(--line);border-radius:10px;padding:9px 11px;display:flex;align-items:center;gap:10px;background:var(--surface-2);font-size:9.5px;color:var(--muted)}.coverage span{font-weight:800;color:var(--navy)}.coverage b{font-size:11px;color:var(--text)}.coverage small{margin-left:auto}
      @media(max-width:1200px){.status-grid{grid-template-columns:repeat(3,1fr)}.topline{grid-template-columns:150px 1fr 1fr}.source{grid-column:1/-1;align-items:flex-start;text-align:left}}
      @media(max-width:700px){.topline{grid-template-columns:1fr 1fr}.total-chip{grid-column:1/-1}.source{grid-column:1/-1}.status-grid{grid-template-columns:1fr 1fr}.coverage{align-items:flex-start;flex-wrap:wrap}.coverage small{width:100%;margin-left:0}}
      @media(max-width:430px){.status-grid{grid-template-columns:1fr}.topline{grid-template-columns:1fr 1fr}.total-chip{grid-column:1/-1}}
    `}</style>
  </section>
}
