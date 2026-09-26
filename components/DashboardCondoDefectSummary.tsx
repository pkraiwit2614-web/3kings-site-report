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
  const coverage=useMemo(()=>finalStatuses.reduce((sum,s)=>sum+rows.filter(r=>r.status_group===s.group).length,0),[rows])

  return <section className="panel dashboard-module condo-summary" style={{marginBottom:18}}>
    <div className="module-title">
      <span>9</span>
      <div><b>ABOVE CONDO — HANDOVER / DEFECT STATUS</b><small>สถานะทั้งโครงการ • กดแต่ละช่องเพื่อเปิดรายชื่อห้องที่เกี่ยวข้อง</small></div>
      <Link href="/defects">ดูผังรายละเอียด →</Link>
    </div>
    {loading?<p className="muted" style={{padding:16}}>กำลังโหลดสถานะห้อง…</p>:!rows.length?<div className="empty">ยังไม่มีข้อมูลสถานะห้อง</div>:<>
      <div className="topline">
        <div className="summary-chips">
          <Link href="/defects" className="summary-chip total"><span>ห้องทั้งหมด</span><b>{summary.total}</b><em>ห้อง</em></Link>
          <Link href="/defects?filter=customer#room-list" className="summary-chip customer"><span>มีลูกค้า</span><b>{summary.customer}</b><em>ห้อง</em></Link>
          <Link href="/defects?filter=no-customer#room-list" className="summary-chip no-customer"><span>ไม่มีลูกค้า</span><b>{summary.noCustomer}</b><em>ห้อง</em></Link>
        </div>
        <div className="source">
          <span>ตึก A <b>{summary.buildingA}</b> ห้อง <i/> ตึก B <b>{summary.buildingB}</b> ห้อง</span>
          <small>ข้อมูลล่าสุด {dateTimeTH(sourceDate)}</small>
        </div>
      </div>

      <div className="status-grid">
        {finalStatuses.map(s=>{
          const list=rows.filter(r=>r.status_group===s.group)
          const a=list.filter(r=>r.building==='A').length
          const b=list.filter(r=>r.building==='B').length
          return <Link key={s.key} href={`/defects?filter=${s.key}#room-list`} className={`status-card ${s.tone}`}>
            <div className="status-copy"><span>{s.label}</span><small>{s.note}</small><em>ตึก A {a} • ตึก B {b}</em></div>
            <div className="status-count"><b>{list.length}</b><small>ห้อง</small></div>
          </Link>
        })}
      </div>
      <div className={`coverage ${coverage===summary.total?'complete':'attention'}`}><span>Coverage Check</span><b>{coverage} / {summary.total} ห้อง</b><small>{coverage===summary.total?'ครบทุกห้องในสถานะปลายทาง 1 กลุ่ม':'มีห้องที่ต้องตรวจสอบการจัดกลุ่มสถานะ'}</small></div>
    </>}
    <style jsx>{`
      .condo-summary{margin-top:18px;overflow:hidden}.empty{padding:22px;color:var(--muted);font-size:12px}
      .topline{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#fbfdff 0%,#f7fafc 100%)}
      .summary-chips{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:9px;flex:1;max-width:660px}.summary-chip{min-height:68px;border:1px solid var(--line);border-radius:13px;padding:11px 13px;background:#fff;display:grid;grid-template-columns:1fr auto auto;align-items:center;column-gap:6px;min-width:0;transition:.15s ease}.summary-chip:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(25,42,63,.07)}.summary-chip span{font-size:11px;font-weight:800;color:#42526a;line-height:1.3}.summary-chip b{font-size:27px;line-height:1;font-weight:850;color:var(--navy);font-variant-numeric:tabular-nums}.summary-chip em{font-style:normal;font-size:9.5px;color:var(--muted);font-weight:700}.summary-chip.total{border-color:#c9d9e8;background:#f8fbfe}.summary-chip.customer{background:#edf7ff;border-color:#c8e0f2}.summary-chip.no-customer{background:#f3f5f7;border-color:#d9dee4}
      .source{min-width:245px;display:flex;justify-content:center;align-items:flex-end;flex-direction:column;text-align:right;color:var(--muted);font-size:10.5px;line-height:1.5}.source span{white-space:nowrap}.source b{color:var(--navy);font-weight:850;font-size:12px}.source i{display:inline-block;width:1px;height:11px;background:var(--line);margin:0 8px;vertical-align:-1px}.source small{font-size:9.5px;margin-top:3px}
      .status-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;padding:14px}.status-card{min-height:94px;border:1px solid var(--line);border-top-width:5px;border-radius:13px;padding:12px;background:var(--surface);display:flex;justify-content:space-between;align-items:center;gap:10px;min-width:0;transition:.15s ease}.status-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(25,42,63,.08)}.status-copy{min-width:0}.status-copy>span{display:block;font-size:11px;font-weight:850;color:#26364b;line-height:1.35}.status-copy>small{display:block;margin-top:4px;font-size:9px;color:var(--muted);line-height:1.35}.status-copy>em{display:block;margin-top:8px;font-size:9px;font-style:normal;color:#657386;font-weight:700;white-space:nowrap}.status-count{flex:0 0 auto;text-align:right}.status-count b{display:block;font-size:28px;line-height:.95;font-weight:850;font-variant-numeric:tabular-nums}.status-count small{display:block;margin-top:5px;font-size:9px;color:var(--muted);font-weight:700}.status-card.danger{border-top-color:#d84d45;background:#fff7f6}.status-card.danger .status-count b{color:#b93c36}.status-card.warn{border-top-color:#d9a229;background:#fffaf0}.status-card.warn .status-count b{color:#9b6812}.status-card.good{border-top-color:#2e9a6a;background:#f6fbf8}.status-card.good .status-count b{color:#237b56}.status-card.neutral{border-top-color:#7c8794;background:#f5f7f9}.status-card.neutral .status-count b{color:#5c6672}
      .coverage{margin:0 14px 14px;border:1px solid var(--line);border-radius:11px;padding:10px 12px;display:flex;align-items:center;gap:11px;background:var(--surface-2);font-size:10px;color:var(--muted)}.coverage span{font-weight:850;color:var(--navy);font-size:10.5px}.coverage b{font-size:12px;color:var(--text);font-variant-numeric:tabular-nums}.coverage small{margin-left:auto}.coverage.complete{background:#f6fbf8;border-color:#d0e7da}.coverage.attention{background:#fff9ef;border-color:#ecdca9}
      @media(max-width:1180px){.status-grid{grid-template-columns:repeat(3,1fr)}.topline{align-items:flex-start}.source{min-width:210px}}
      @media(max-width:850px){.topline{display:grid}.summary-chips{max-width:none;width:100%}.source{align-items:flex-start;text-align:left;min-width:0}.status-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:620px){.summary-chips{grid-template-columns:1fr 1fr}.summary-chip.total{grid-column:1/-1}.summary-chip{min-height:62px}.status-grid{grid-template-columns:1fr 1fr;padding:10px;gap:8px}.status-card{min-height:90px;padding:11px}.status-copy>span{font-size:10.5px}.status-count b{font-size:25px}.coverage{margin:0 10px 10px;align-items:flex-start;flex-wrap:wrap}.coverage small{width:100%;margin-left:0}.source span{white-space:normal}}
      @media(max-width:430px){.status-grid{grid-template-columns:1fr}.summary-chips{grid-template-columns:1fr}.summary-chip.total{grid-column:auto}}
    `}</style>
  </section>
}
