'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'

type RoomRow={
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

type Category={
  id:string
  label:string
  tone:'neutral'|'danger'|'warn'|'good'|'hotel'
  predicate:(r:RoomRow)=>boolean
}

const categories:Category[]=[
  {id:'customer',label:'มีลูกค้า',tone:'hotel',predicate:r=>r.customer_status==='มีลูกค้า'},
  {id:'no-customer',label:'ไม่มีลูกค้า',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'},
  {id:'hotel',label:'ร่วมโรงแรม',tone:'hotel',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'},
  {id:'nonhotel',label:'ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'hotel-customer',label:'มีลูกค้า • ร่วมโรงแรม',tone:'hotel',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'},
  {id:'hotel-nocustomer',label:'ไม่มีลูกค้า • ร่วมโรงแรม',tone:'hotel',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'},
  {id:'nonhotel-customer',label:'มีลูกค้า • ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'nonhotel-no-customer',label:'ไม่มีลูกค้า • ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'status-incomplete',label:'Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.status_group==='Hotel - Incomplete'},
  {id:'status-awaiting-hotel',label:'Defect เสร็จ / รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.status_group==='Hotel - Awaiting Check'},
  {id:'status-hotel-checked',label:'Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.status_group==='Hotel - Checked Complete'},
  {id:'status-pending-handover',label:'Pending Handover / รอลูกค้าตรวจรับ',tone:'warn',predicate:r=>r.status_group==='Non-Hotel - Pending Handover'},
  {id:'status-handover-complete',label:'ส่งมอบลูกค้าแล้ว',tone:'good',predicate:r=>r.status_group==='Non-Hotel - Handover Complete'},
  {id:'status-awaiting-sale',label:'Awaiting Sale / ยังไม่มีลูกค้า',tone:'neutral',predicate:r=>r.status_group==='Non-Hotel - Awaiting Sale'},
  {id:'hotel-customer-incomplete',label:'มีลูกค้า • ร่วมโรงแรม • Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Incomplete'},
  {id:'hotel-customer-awaiting',label:'มีลูกค้า • ร่วมโรงแรม • รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Awaiting Check'},
  {id:'hotel-customer-checked',label:'มีลูกค้า • ร่วมโรงแรม • Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Checked Complete'},
  {id:'hotel-nocustomer-incomplete',label:'ไม่มีลูกค้า • ร่วมโรงแรม • Defect ยังไม่เสร็จ',tone:'danger',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Incomplete'},
  {id:'hotel-nocustomer-awaiting',label:'ไม่มีลูกค้า • ร่วมโรงแรม • รอ Hotel ตรวจ',tone:'warn',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Awaiting Check'},
  {id:'hotel-nocustomer-checked',label:'ไม่มีลูกค้า • ร่วมโรงแรม • Hotel ตรวจแล้ว',tone:'good',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Checked Complete'},
  {id:'nonhotel-customer-complete',label:'มีลูกค้า • ไม่ร่วมโรงแรม • ส่งมอบแล้ว',tone:'good',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Handover Complete'},
  {id:'nonhotel-customer-pending',label:'มีลูกค้า • ไม่ร่วมโรงแรม • Pending Handover',tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Pending Handover'},
  {id:'nonhotel-nosale',label:'ไม่มีลูกค้า • ไม่ร่วมโรงแรม • Awaiting Sale',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Awaiting Sale'},
]

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}

function latestSourceDate(rows:RoomRow[]){
  const values=rows.map(r=>r.source_modified_at).filter(Boolean) as string[]
  if(!values.length)return null
  return values.reduce((latest,current)=>new Date(current)>new Date(latest)?current:latest)
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
  if(r.status_group==='Non-Hotel - Pending Handover')return 'Pending Handover'
  if(r.status_group==='Non-Hotel - Handover Complete')return 'ส่งมอบลูกค้าแล้ว'
  if(r.status_group==='Non-Hotel - Awaiting Sale')return 'Awaiting Sale'
  return r.current_status
}

function countWhere(rows:RoomRow[],predicate:(r:RoomRow)=>boolean){return rows.filter(predicate).length}

function BuildingFlow({building,rows}:{building:'A'|'B';rows:RoomRow[]}){
  const list=rows.filter(r=>r.building===building)
  const q=(filter:string)=>`/defects?building=${building}&filter=${encodeURIComponent(filter)}#room-list`
  const customer=countWhere(list,r=>r.customer_status==='มีลูกค้า')
  const noCustomer=countWhere(list,r=>r.customer_status==='ไม่มีลูกค้า')
  const customerHotel=countWhere(list,r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม')
  const customerNonHotel=countWhere(list,r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม')
  const noCustomerHotel=countWhere(list,r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม')
  const noCustomerNonHotel=countWhere(list,r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม')
  const n=(filter:string)=>countWhere(list,categories.find(c=>c.id===filter)?.predicate||(()=>false))
  return <section className={`building-flow building-${building.toLowerCase()}`}>
    <div className="building-head"><div><span>ตึก {building}</span><b>{list.length} ห้อง</b></div><small>กดแต่ละช่องเพื่อเปิดรายชื่อห้องของสถานะนั้น</small></div>
    <div className="flow-column-head"><span>1. สถานะลูกค้า</span><span>2. ร่วม / ไม่ร่วมโรงแรม</span><span>3. สถานะปัจจุบัน</span></div>

    <div className="flow-lane">
      <Link href={q('customer')} className="customer-box customer"><span>มีลูกค้า</span><b>{customer}<em>ห้อง</em></b></Link>
      <div className="flow-arrow">→</div>
      <div className="program-stack">
        <Link href={q('hotel-customer')} className="program-box hotel"><span>ร่วมโรงแรม</span><b>{customerHotel} ห้อง</b></Link>
        <Link href={q('nonhotel-customer')} className="program-box nonhotel"><span>ไม่ร่วมโรงแรม</span><b>{customerNonHotel} ห้อง</b></Link>
      </div>
      <div className="flow-arrow">→</div>
      <div className="status-stack">
        <div className="status-row three">
          <Link href={q('hotel-customer-incomplete')} className="end-box danger"><span>Defect ยังไม่เสร็จ</span><b>{n('hotel-customer-incomplete')} ห้อง</b></Link>
          <Link href={q('hotel-customer-awaiting')} className="end-box warn"><span>เสร็จ / รอ Hotel ตรวจ</span><b>{n('hotel-customer-awaiting')} ห้อง</b></Link>
          <Link href={q('hotel-customer-checked')} className="end-box good"><span>Hotel ตรวจแล้ว</span><b>{n('hotel-customer-checked')} ห้อง</b></Link>
        </div>
        <div className="status-row two">
          <Link href={q('nonhotel-customer-complete')} className="end-box good"><span>ส่งมอบลูกค้าแล้ว</span><b>{n('nonhotel-customer-complete')} ห้อง</b></Link>
          <Link href={q('nonhotel-customer-pending')} className="end-box warn"><span>Pending Handover</span><b>{n('nonhotel-customer-pending')} ห้อง</b></Link>
        </div>
      </div>
    </div>

    <div className="lane-separator"/>

    <div className="flow-lane">
      <Link href={q('no-customer')} className="customer-box no-customer"><span>ไม่มีลูกค้า</span><b>{noCustomer}<em>ห้อง</em></b></Link>
      <div className="flow-arrow">→</div>
      <div className="program-stack">
        <Link href={q('hotel-nocustomer')} className="program-box hotel"><span>ร่วมโรงแรม</span><b>{noCustomerHotel} ห้อง</b></Link>
        <Link href={q('nonhotel-no-customer')} className="program-box nonhotel"><span>ไม่ร่วมโรงแรม</span><b>{noCustomerNonHotel} ห้อง</b></Link>
      </div>
      <div className="flow-arrow">→</div>
      <div className="status-stack">
        <div className="status-row three">
          <Link href={q('hotel-nocustomer-incomplete')} className="end-box danger"><span>Defect ยังไม่เสร็จ</span><b>{n('hotel-nocustomer-incomplete')} ห้อง</b></Link>
          <Link href={q('hotel-nocustomer-awaiting')} className="end-box warn"><span>เสร็จ / รอ Hotel ตรวจ</span><b>{n('hotel-nocustomer-awaiting')} ห้อง</b></Link>
          <Link href={q('hotel-nocustomer-checked')} className="end-box good"><span>Hotel ตรวจแล้ว</span><b>{n('hotel-nocustomer-checked')} ห้อง</b></Link>
        </div>
        <div className="status-row one">
          <Link href={q('nonhotel-nosale')} className="end-box neutral"><span>Awaiting Sale / ยังไม่มีลูกค้า</span><b>{n('nonhotel-nosale')} ห้อง</b></Link>
        </div>
      </div>
    </div>
  </section>
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
    const initialQuery=params.get('q')||''
    if(categories.some(c=>c.id===initial))setFilter(initial)
    if(['ALL','A','B'].includes(initialBuilding))setBuilding(initialBuilding)
    if(initialQuery)setQ(initialQuery)
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

  useEffect(()=>{
    if(!loading&&window.location.hash==='#room-list')window.setTimeout(()=>document.getElementById('room-list')?.scrollIntoView({behavior:'smooth',block:'start'}),80)
  },[loading])

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
  const finalDefs=[
    ['status-incomplete','Defect ยังไม่เสร็จ','danger'],
    ['status-awaiting-hotel','Defect เสร็จ / รอ Hotel ตรวจ','warn'],
    ['status-hotel-checked','Hotel ตรวจแล้ว','good'],
    ['status-pending-handover','Pending Handover','warn'],
    ['status-handover-complete','ส่งมอบแล้ว','good'],
    ['status-awaiting-sale','Awaiting Sale','neutral'],
  ] as const

  return <AppShell>
    <PageHeader title="Above Condo — Handover / Defect" subtitle={`ภาพรวมตึก A และ B → กดแต่ละกล่องเพื่อดูรายชื่อห้อง • อัปเดต ${dateTimeTH(sourceDate)}`} action={<Link href="/" className="button">← Dashboard</Link>}/>

    {loading?<div className="panel">กำลังโหลดข้อมูลห้อง…</div>:<>
      <section className="panel project-overview">
        <div className="overview-head"><div><span>สถานะทั้งโครงการ</span><b>{rows.length} ห้อง</b></div><small>มีลูกค้า {countWhere(rows,r=>r.customer_status==='มีลูกค้า')} ห้อง • ไม่มีลูกค้า {countWhere(rows,r=>r.customer_status==='ไม่มีลูกค้า')} ห้อง</small></div>
        <div className="final-grid">
          {finalDefs.map(([id,label,tone])=>{const c=categories.find(x=>x.id===id)!;const list=rows.filter(c.predicate);return <Link key={id} href={`/defects?filter=${id}#room-list`} className={`final-card ${tone}`}><span>{label}</span><b>{list.length}<em>ห้อง</em></b><small>A {list.filter(r=>r.building==='A').length} • B {list.filter(r=>r.building==='B').length}</small></Link>})}
        </div>
      </section>

      <BuildingFlow building="A" rows={rows}/>
      <BuildingFlow building="B" rows={rows}/>

      <section className={`selected-status ${active?.tone||'neutral'}`} id="room-list">
        <div className="selected-copy"><span>{active?'รายการที่เลือก':'รายละเอียดทุกห้อง'}</span><h2>{active?.label||'Above Condo — ทุกสถานะ'}</h2><p>{building==='ALL'?'Building A + B':`Building ${building}`} • แสดง {filtered.length} ห้อง</p></div>
        <div className="selected-counts"><button type="button" onClick={()=>setBuilding('A')} className={building==='A'?'active':''}><span>ตึก A</span><b>{aCount}</b></button><button type="button" onClick={()=>setBuilding('B')} className={building==='B'?'active':''}><span>ตึก B</span><b>{bCount}</b></button><button type="button" onClick={()=>setBuilding('ALL')} className={building==='ALL'?'active':''}><span>รวม</span><b>{totalCount}</b></button></div>
      </section>

      <section className="panel filter-panel"><div className="toolbar detail-toolbar"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหาเลขห้องหรือชื่อเจ้าของ" aria-label="ค้นหาเลขห้องหรือชื่อเจ้าของ"/><select value={building} onChange={e=>setBuilding(e.target.value)} aria-label="กรองอาคาร"><option value="ALL">ตึก A + B</option><option value="A">ตึก A</option><option value="B">ตึก B</option></select><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="กรองสถานะ"><option value="">ทุกสถานะ</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>{(q||building!=='ALL'||filter)&&<button type="button" className="button" onClick={()=>{setQ('');setBuilding('ALL');setFilter('')}}>ล้างตัวกรอง</button>}</div></section>

      <section className="panel detail-panel">
        <div className="detail-head"><div><h2>รายชื่อห้อง</h2><p>แสดง {filtered.length} ห้อง</p></div><div className="legend"><span><i className="hotel-dot"/>ร่วมโรงแรม</span><span><i className="nonhotel-dot"/>ไม่ร่วมโรงแรม</span><span><i className="bad-dot"/>ยังไม่เสร็จ</span><span><i className="warn-dot"/>รอตรวจ</span><span><i className="good-dot"/>ปิดแล้ว</span></div></div>
        <div className="table-wrap defect-table"><table><thead><tr><th>ห้อง</th><th className="center">อาคาร</th><th>ชื่อลูกค้า/เจ้าของ</th><th className="center">ลูกค้า</th><th className="center">โรงแรม</th><th className="center">สถานะ</th><th>ต้องทำต่อ</th></tr></thead><tbody>{filtered.map(r=><tr key={r.room_no}><td className="room-cell"><b>{r.room_no}</b><small>ชั้น {r.floor??'-'}</small></td><td className="center"><b>{r.building}</b></td><td>{r.owner_name||<span className="muted">—</span>}</td><td className="center">{r.customer_status}</td><td className="center"><span className={`program-badge ${r.hotel_participation==='ร่วมโรงแรม'?'hotel':'nonhotel'}`}>{r.hotel_participation}</span></td><td className="center"><span className={`state-badge ${statusTone(r)}`}>{statusLabel(r)}</span></td><td>{r.next_action||r.follow_up||'-'}</td></tr>)}{!filtered.length&&<tr><td colSpan={7} className="muted" style={{padding:28,textAlign:'center'}}>ไม่พบห้องตามเงื่อนไข</td></tr>}</tbody></table></div>
      </section>
    </>}

    <style jsx>{`
      .project-overview{margin-bottom:14px;overflow:hidden}.overview-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,#edf7ff,#f8fbfd)}.overview-head>div{display:flex;align-items:baseline;gap:9px}.overview-head span{font-size:11px;font-weight:800;color:var(--navy)}.overview-head b{font-size:20px;color:var(--navy);font-variant-numeric:tabular-nums}.overview-head small{font-size:10px;color:var(--muted)}
      .final-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:11px}.final-card{border:1px solid var(--line);border-top-width:4px;border-radius:10px;padding:9px 10px;background:var(--surface);min-width:0}.final-card span{display:block;font-size:9px;font-weight:800;line-height:1.3;color:var(--text)}.final-card b{display:flex;align-items:baseline;gap:4px;margin-top:5px;font-size:21px;line-height:1;font-variant-numeric:tabular-nums}.final-card b em{font-style:normal;font-size:8px;color:var(--muted)}.final-card>small{display:block;margin-top:5px;font-size:8px;color:var(--muted)}.final-card.danger{border-top-color:#b4423d;background:#fff8f7}.final-card.warn{border-top-color:#d69a22;background:#fffaf0}.final-card.good{border-top-color:#27805a;background:#f6fbf8}.final-card.neutral{border-top-color:#7b8490;background:#f5f6f7}
      .building-flow{border:2px solid #2787c6;border-radius:15px;overflow:hidden;background:var(--surface);margin-bottom:14px;box-shadow:0 6px 18px rgba(25,42,63,.04)}.building-b{border-color:#2f9a66}.building-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;background:linear-gradient(90deg,#0d6ea7,#55c7ef);color:#fff}.building-b .building-head{background:linear-gradient(90deg,#178a55,#67d69f)}.building-head>div{display:flex;align-items:baseline;gap:10px}.building-head span{font-size:15px;font-weight:800}.building-head b{font-size:20px}.building-head small{font-size:9px;font-weight:700;opacity:.95}
      .flow-column-head{display:grid;grid-template-columns:minmax(145px,.9fr) minmax(170px,1fr) minmax(420px,3fr);gap:38px;padding:7px 14px;background:#f4f8fb;border-bottom:1px solid var(--line);font-size:9px;font-weight:800;color:var(--navy);text-align:center}.flow-lane{display:grid;grid-template-columns:minmax(145px,.9fr) 24px minmax(170px,1fr) 24px minmax(420px,3fr);gap:7px;align-items:stretch;padding:10px 14px}.flow-arrow{display:flex;align-items:center;justify-content:center;font-size:22px;color:#2387c9;font-weight:800}.building-b .flow-arrow{color:#25895c}.customer-box,.program-box,.end-box{border:1px solid var(--line);border-radius:10px;padding:10px 11px;display:flex;justify-content:space-between;align-items:center;gap:7px;min-width:0;transition:.15s}.customer-box:hover,.program-box:hover,.end-box:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(25,42,63,.06)}.customer-box span,.program-box span,.end-box span{font-size:9.5px;font-weight:800;line-height:1.3}.customer-box b{font-size:22px;line-height:1;color:var(--navy);font-variant-numeric:tabular-nums}.customer-box b em{display:block;font-size:8px;font-style:normal;color:var(--muted);margin-top:4px}.customer-box.customer{background:#eff8ff;border-color:#c8e2f4}.customer-box.no-customer{background:#f4f5f7;border-color:#dadddf}.program-stack,.status-stack{display:grid;grid-template-rows:1fr 1fr;gap:7px}.program-box.hotel{background:#f4efff;border-color:#d9c8f3}.program-box.nonhotel{background:#f0f4f8;border-color:#d7e0e8}.program-box b{font-size:14px;white-space:nowrap;color:var(--navy)}.status-row{display:grid;gap:7px}.status-row.three{grid-template-columns:repeat(3,1fr)}.status-row.two{grid-template-columns:repeat(2,1fr)}.status-row.one{grid-template-columns:1fr}.end-box{padding:8px 9px}.end-box b{font-size:14px;white-space:nowrap}.end-box.danger{background:#fff0ef;border-color:#efc7c3}.end-box.danger b{color:#a73531}.end-box.warn{background:#fff7e5;border-color:#edd89c}.end-box.warn b{color:#91600c}.end-box.good{background:#eef9f3;border-color:#cde7d8}.end-box.good b{color:#1d704d}.end-box.neutral{background:#f1f3f5;border-color:#d8dde2}.lane-separator{height:1px;background:var(--line);margin:0 14px}
      .selected-status{scroll-margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:18px;padding:15px 17px;border:1px solid var(--line);border-left:5px solid #8b949e;border-radius:14px;background:var(--surface);margin-bottom:12px}.selected-status.hotel{border-left-color:#2f6fb0;background:#f5f9fe}.selected-status.danger{border-left-color:#b4423d;background:#fff8f7}.selected-status.warn{border-left-color:#d69a22;background:#fffaf0}.selected-status.good{border-left-color:#27805a;background:#f6fbf8}.selected-copy>span{font-size:9px;font-weight:800;color:var(--muted)}.selected-copy h2{margin:3px 0;font-size:18px;color:var(--navy)}.selected-copy p{margin:0;font-size:10px;color:var(--muted)}.selected-counts{display:grid;grid-template-columns:repeat(3,82px);gap:6px}.selected-counts button{border:1px solid var(--line);border-radius:9px;background:#fff;padding:7px;color:var(--text)}.selected-counts button.active{background:#eef6fc;border-color:#a8cbe3}.selected-counts span{display:block;font-size:8px;color:var(--muted)}.selected-counts b{font-size:18px;color:var(--navy)}
      .filter-panel{padding:12px;margin-bottom:12px}.detail-toolbar{margin:0}.detail-toolbar input{min-width:250px}.detail-toolbar select{max-width:310px}.detail-panel{padding-bottom:0}.detail-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}.detail-head h2{margin:0;font-size:17px}.detail-head p{margin:3px 0 0;font-size:10px;color:var(--muted)}.legend{display:flex;gap:9px;flex-wrap:wrap;font-size:8.5px;color:var(--muted)}.legend span{display:flex;align-items:center;gap:4px}.legend i{width:8px;height:8px;border-radius:50%}.hotel-dot{background:#6c46b8}.nonhotel-dot{background:#7f8790}.bad-dot{background:#b4423d}.warn-dot{background:#d69a22}.good-dot{background:#27805a}
      .defect-table{max-height:680px;margin:0 -19px}.defect-table table{min-width:1080px}.defect-table th,.defect-table td{vertical-align:middle}.defect-table th.center,.defect-table td.center{text-align:center}.room-cell b{display:block;color:var(--navy)}.room-cell small{display:block;font-size:8.5px;color:var(--muted)}.program-badge,.state-badge{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:700;border:1px solid transparent;white-space:nowrap}.program-badge.hotel{background:#f2edfb;border-color:#dacdf0;color:#5d3d9d}.program-badge.nonhotel{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}.state-badge.danger{background:#fdeceb;border-color:#f1cdca;color:#9e312d}.state-badge.warn{background:#fff3dc;border-color:#f0dfb8;color:#85570d}.state-badge.good{background:#e9f6ef;border-color:#cfe9da;color:#196645}.state-badge.neutral{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}
      @media(max-width:1100px){.final-grid{grid-template-columns:repeat(3,1fr)}.flow-column-head{display:none}.flow-lane{grid-template-columns:130px 20px 150px 20px minmax(360px,1fr);overflow-x:auto}}
      @media(max-width:760px){.building-head{align-items:flex-start;flex-direction:column}.flow-lane{display:grid;grid-template-columns:1fr;gap:7px;padding:10px}.flow-arrow{transform:rotate(90deg);height:16px}.program-stack,.status-stack{grid-template-rows:auto}.status-row.three,.status-row.two{grid-template-columns:1fr}.lane-separator{margin:0 10px}.final-grid{grid-template-columns:1fr 1fr}.overview-head{align-items:flex-start;flex-direction:column}.selected-status{align-items:flex-start;flex-direction:column}.selected-counts{width:100%;grid-template-columns:repeat(3,1fr)}.detail-toolbar input{min-width:0}.detail-toolbar select{max-width:none}.detail-head{align-items:flex-start;flex-direction:column}}
      @media(max-width:430px){.final-grid{grid-template-columns:1fr}}
    `}</style>
  </AppShell>
}
