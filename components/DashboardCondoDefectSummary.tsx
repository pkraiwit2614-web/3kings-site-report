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
  const toneTotals=useMemo(()=>{
    const count=(tone:FinalStatus['tone'])=>finalStatuses.filter(s=>s.tone===tone).reduce((sum,s)=>sum+rows.filter(r=>r.status_group===s.group).length,0)
    return {danger:count('danger'),warn:count('warn'),good:count('good'),neutral:count('neutral')}
  },[rows])

  const totalForChart=Math.max(1,summary.total)
  const dangerEnd=toneTotals.danger/totalForChart*360
  const warnEnd=dangerEnd+toneTotals.warn/totalForChart*360
  const goodEnd=warnEnd+toneTotals.good/totalForChart*360
  const donutBackground=`conic-gradient(#d84d45 0deg ${dangerEnd}deg,#e2ad32 ${dangerEnd}deg ${warnEnd}deg,#2e9a6a ${warnEnd}deg ${goodEnd}deg,#7c8794 ${goodEnd}deg 360deg)`

  return <section className="panel dashboard-module condo-summary" style={{marginBottom:18}}>
    <div className="module-title">
      <span>9</span>
      <div><b>ABOVE CONDO — HANDOVER / DEFECT STATUS</b><small>สถานะทั้งโครงการ • กดแต่ละช่องเพื่อเปิดรายชื่อห้องที่เกี่ยวข้อง</small></div>
      <Link href="/defects">ดูรายละเอียด →</Link>
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

      <div className="status-visual">
        <div className="donut-panel">
          <div className="donut" style={{background:donutBackground}}>
            <div className="donut-hole"><b>{summary.total}</b><span>ห้องทั้งหมด</span></div>
          </div>
          <div className="donut-legend">
            <span><i className="danger-dot"/>ยังไม่เสร็จ <b>{toneTotals.danger}</b></span>
            <span><i className="warn-dot"/>รอตรวจ / รอส่งมอบ <b>{toneTotals.warn}</b></span>
            <span><i className="good-dot"/>ตรวจแล้ว / ส่งมอบแล้ว <b>{toneTotals.good}</b></span>
            <span><i className="neutral-dot"/>Awaiting Sale <b>{toneTotals.neutral}</b></span>
          </div>
        </div>

        <div className="status-grid">
          {finalStatuses.map(s=>{
            const list=rows.filter(r=>r.status_group===s.group)
            const a=list.filter(r=>r.building==='A').length
            const b=list.filter(r=>r.building==='B').length
            const customer=list.filter(r=>r.customer_status==='มีลูกค้า').length
            const noCustomer=list.filter(r=>r.customer_status==='ไม่มีลูกค้า').length
            return <Link key={s.key} href={`/defects?filter=${s.key}#room-list`} className={`status-card ${s.tone}`}>
              <div className="status-top"><span>{s.label}</span><div className="status-count"><b>{list.length}</b><small>ห้อง</small></div></div>
              <small className="status-note">{s.note}</small>
              <div className="customer-split">
                <span className="customer-pill">มีลูกค้า <b>{customer}</b></span>
                <span className="no-customer-pill">ไม่มีลูกค้า <b>{noCustomer}</b></span>
              </div>
              <em>ตึก A {a} • ตึก B {b}</em>
            </Link>
          })}
        </div>
      </div>

      <div className={`coverage ${coverage===summary.total?'complete':'attention'}`}><span>Coverage Check</span><b>{coverage} / {summary.total} ห้อง</b><small>{coverage===summary.total?'ครบทุกห้องในสถานะปลายทาง 1 กลุ่ม':'มีห้องที่ต้องตรวจสอบการจัดกลุ่มสถานะ'}</small></div>
    </>}

    <style jsx>{`
      .condo-summary{margin-top:18px;overflow:hidden}.empty{padding:22px;color:var(--muted);font-size:12px}
      .topline{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#fbfdff 0%,#f7fafc 100%)}
      .summary-chips{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:9px;flex:1;max-width:660px}.summary-chip{min-height:68px;border:1px solid var(--line);border-radius:13px;padding:11px 13px;background:#fff;display:grid;grid-template-columns:1fr auto auto;align-items:center;column-gap:6px;min-width:0;transition:.15s ease}.summary-chip:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(25,42,63,.07)}.summary-chip span{font-size:11px;font-weight:800;color:#42526a;line-height:1.3}.summary-chip b{font-size:27px;line-height:1;font-weight:850;color:var(--navy);font-variant-numeric:tabular-nums}.summary-chip em{font-style:normal;font-size:9.5px;color:var(--muted);font-weight:700}.summary-chip.total{border-color:#c9d9e8;background:#f8fbfe}.summary-chip.customer{background:#edf7ff;border-color:#c8e0f2}.summary-chip.no-customer{background:#f3f5f7;border-color:#d9dee4}
      .source{min-width:245px;display:flex;justify-content:center;align-items:flex-end;flex-direction:column;text-align:right;color:var(--muted);font-size:10.5px;line-height:1.5}.source span{white-space:nowrap}.source b{color:var(--navy);font-weight:850;font-size:12px}.source i{display:inline-block;width:1px;height:11px;background:var(--line);margin:0 8px;vertical-align:-1px}.source small{font-size:9.5px;margin-top:3px}
      .status-visual{display:grid;grid-template-columns:220px minmax(0,1fr);gap:14px;padding:14px}.donut-panel{border:1px solid #dfe5eb;border-radius:15px;background:#fbfcfd;padding:15px 13px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:270px}.donut{width:154px;height:154px;border-radius:50%;display:grid;place-items:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.7)}.donut-hole{width:96px;height:96px;border-radius:50%;background:white;border:1px solid #e3e8ed;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(25,42,63,.06)}.donut-hole b{font-size:30px;line-height:1;font-weight:850;color:var(--navy)}.donut-hole span{margin-top:5px;font-size:9.5px;font-weight:700;color:var(--muted)}
      .donut-legend{width:100%;margin-top:14px;display:grid;gap:7px}.donut-legend span{display:grid;grid-template-columns:10px 1fr auto;align-items:center;gap:7px;font-size:9px;color:#536276}.donut-legend i{width:9px;height:9px;border-radius:50%}.donut-legend b{font-size:10px;color:var(--text);font-weight:850}.danger-dot{background:#d84d45}.warn-dot{background:#e2ad32}.good-dot{background:#2e9a6a}.neutral-dot{background:#7c8794}
      .status-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.status-card{--status-color:#7c8794;--status-soft:#f4f6f8;min-height:130px;border:2px solid var(--status-color);border-radius:14px;padding:12px 13px;background:linear-gradient(180deg,var(--status-soft) 0%,#fff 100%);display:flex;flex-direction:column;min-width:0;transition:.15s ease;box-shadow:inset 0 5px 0 var(--status-color)}.status-card:hover{transform:translateY(-2px);box-shadow:inset 0 5px 0 var(--status-color),0 8px 20px rgba(25,42,63,.10)}.status-top{display:flex;justify-content:space-between;align-items:flex-start;gap:9px}.status-top>span{font-size:11px;font-weight:850;line-height:1.35;color:#fff;background:var(--status-color);border-radius:8px;padding:5px 8px;box-shadow:0 2px 7px rgba(25,42,63,.08)}.status-count{flex:0 0 auto;display:flex;align-items:baseline;gap:4px}.status-count b{font-size:28px;line-height:.95;font-weight:850;font-variant-numeric:tabular-nums;color:var(--status-color)}.status-count small{font-size:8.5px;color:var(--muted);font-weight:700}.status-note{display:block;margin-top:7px;font-size:9px;color:#5e6a78;line-height:1.35}.customer-split{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}.customer-split span{border:1px solid transparent;border-radius:999px;padding:5px 7px;font-size:8.5px;font-weight:750;white-space:nowrap;text-align:center}.customer-split b{font-size:10px;font-weight:850}.customer-pill{background:#edf7ff;border-color:#c9e0f1!important;color:#2d668e}.no-customer-pill{background:#f0f2f4;border-color:#d8dde2!important;color:#626b76}.status-card>em{display:block;margin-top:auto;padding-top:9px;font-size:8.8px;font-style:normal;color:#657386;font-weight:700}
      .status-card.danger{--status-color:#d84d45;--status-soft:#fff1ef}.status-card.warn{--status-color:#e2ad32;--status-soft:#fff8e8}.status-card.good{--status-color:#2e9a6a;--status-soft:#edf9f2}.status-card.neutral{--status-color:#7c8794;--status-soft:#f1f3f5}
      .coverage{margin:0 14px 14px;border:1px solid var(--line);border-radius:11px;padding:10px 12px;display:flex;align-items:center;gap:11px;background:var(--surface-2);font-size:10px;color:var(--muted)}.coverage span{font-weight:850;color:var(--navy);font-size:10.5px}.coverage b{font-size:12px;color:var(--text);font-variant-numeric:tabular-nums}.coverage small{margin-left:auto}.coverage.complete{background:#f6fbf8;border-color:#d0e7da}.coverage.attention{background:#fff9ef;border-color:#ecdca9}
      @media(max-width:1180px){.status-visual{grid-template-columns:190px 1fr}.donut{width:138px;height:138px}.donut-hole{width:86px;height:86px}.status-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:850px){.topline{display:grid}.summary-chips{max-width:none;width:100%}.source{align-items:flex-start;text-align:left;min-width:0}.status-visual{grid-template-columns:1fr}.donut-panel{min-height:0;display:grid;grid-template-columns:150px 1fr;gap:15px;justify-items:center}.donut-legend{margin-top:0}.status-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:620px){.summary-chips{grid-template-columns:1fr 1fr}.summary-chip.total{grid-column:1/-1}.summary-chip{min-height:62px}.status-visual{padding:10px;gap:10px}.donut-panel{grid-template-columns:1fr;padding:13px}.donut-legend{margin-top:10px}.status-grid{grid-template-columns:1fr 1fr;gap:8px}.status-card{min-height:128px;padding:11px}.customer-split{grid-template-columns:1fr}.coverage{margin:0 10px 10px;align-items:flex-start;flex-wrap:wrap}.coverage small{width:100%;margin-left:0}.source span{white-space:normal}}
      @media(max-width:430px){.status-grid{grid-template-columns:1fr}.summary-chips{grid-template-columns:1fr}.summary-chip.total{grid-column:auto}}
    `}</style>
  </section>
}