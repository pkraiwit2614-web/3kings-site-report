'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import DefectCombineRoomEnhancer from '@/components/DefectCombineRoomEnhancer'
import { getSupabase } from '@/lib/supabase'
import { createLiveLoader, requireSuccessfulReads } from '@/lib/liveLoader'

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
  defect_detail:string|null
  latest_source:string|null
  source_note:string|null
  source_modified_at:string|null
}

type Category={
  id:string
  label:string
  tone:'neutral'|'danger'|'warn'|'good'|'hotel'
  predicate:(r:RoomRow)=>boolean
}

type CustomerFilter='ALL'|'CUSTOMER'|'NO_CUSTOMER'

const isAwaitingAcceptance=(r:RoomRow)=>
  r.status_group==='Hotel - Awaiting Check'||
  r.status_group==='Non-Hotel - Pending Handover'||
  (r.status_group==='Hotel - Checked Complete'&&r.hotel_participation==='ไม่ร่วมโรงแรม')

const categories:Category[]=[
  {id:'customer',label:'มีลูกค้า',tone:'hotel',predicate:r=>r.customer_status==='มีลูกค้า'},
  {id:'no-customer',label:'ไม่มีลูกค้า',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'},
  {id:'hotel',label:'ร่วมโรงแรม',tone:'hotel',predicate:r=>r.hotel_participation==='ร่วมโรงแรม'},
  {id:'nonhotel',label:'ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'hotel-customer',label:'มีลูกค้า • ร่วมโรงแรม',tone:'hotel',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'},
  {id:'hotel-nocustomer',label:'ไม่มีลูกค้า • ร่วมโรงแรม',tone:'hotel',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'},
  {id:'nonhotel-customer',label:'มีลูกค้า • ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'nonhotel-no-customer',label:'ไม่มีลูกค้า • ไม่ร่วมโรงแรม',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'},
  {id:'status-incomplete',label:'เพิ่งได้รับแจ้ง Defect',tone:'danger',predicate:r=>r.status_group==='Hotel - Incomplete'},
  {id:'status-awaiting-hotel',label:'Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ',tone:'warn',predicate:r=>r.status_group==='Hotel - Awaiting Check'},
  {id:'status-awaiting-acceptance',label:'Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ',tone:'warn',predicate:isAwaitingAcceptance},
  {id:'status-hotel-checked',label:'Hotel Engineer ตรวจแล้ว',tone:'good',predicate:r=>r.status_group==='Hotel - Checked Complete'&&r.hotel_participation==='ร่วมโรงแรม'},
  {id:'status-pending-handover',label:'Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ',tone:'warn',predicate:r=>r.status_group==='Non-Hotel - Pending Handover'},
  {id:'status-handover-complete',label:'ลูกค้าตรวจรับเรียบร้อยแล้ว',tone:'good',predicate:r=>r.status_group==='Non-Hotel - Handover Complete'},
  {id:'status-awaiting-sale',label:'Awaiting Sale / ยังไม่มีลูกค้า',tone:'neutral',predicate:r=>r.status_group==='Non-Hotel - Awaiting Sale'},
  {id:'hotel-customer-incomplete',label:'มีลูกค้า • ร่วมโรงแรม • เพิ่งได้รับแจ้ง Defect',tone:'danger',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Incomplete'},
  {id:'hotel-customer-awaiting',label:'มีลูกค้า • ร่วมโรงแรม • Defect เสร็จแล้ว รอตรวจรับ',tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Awaiting Check'},
  {id:'hotel-customer-awaiting-receive',label:'มีลูกค้า • ร่วมโรงแรม • Defect เสร็จแล้ว รอลูกค้า / Hotel ตรวจรับ',tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&(r.status_group==='Hotel - Awaiting Check'||r.status_group==='Non-Hotel - Pending Handover')},
  {id:'hotel-customer-checked',label:'มีลูกค้า • ร่วมโรงแรม • Hotel Engineer ตรวจแล้ว',tone:'good',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Checked Complete'},
  {id:'hotel-nocustomer-incomplete',label:'ไม่มีลูกค้า • ร่วมโรงแรม • เพิ่งได้รับแจ้ง Defect',tone:'danger',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Incomplete'},
  {id:'hotel-nocustomer-awaiting',label:'ไม่มีลูกค้า • ร่วมโรงแรม • Defect เสร็จแล้ว รอตรวจรับ',tone:'warn',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Awaiting Check'},
  {id:'hotel-nocustomer-awaiting-receive',label:'ไม่มีลูกค้า • ร่วมโรงแรม • Defect เสร็จแล้ว รอลูกค้า / Hotel ตรวจรับ',tone:'warn',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&(r.status_group==='Hotel - Awaiting Check'||r.status_group==='Non-Hotel - Pending Handover')},
  {id:'hotel-nocustomer-checked',label:'ไม่มีลูกค้า • ร่วมโรงแรม • Hotel Engineer ตรวจแล้ว',tone:'good',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ร่วมโรงแรม'&&r.status_group==='Hotel - Checked Complete'},
  {id:'nonhotel-customer-complete',label:'มีลูกค้า • ไม่ร่วมโรงแรม • ลูกค้าตรวจรับเรียบร้อยแล้ว',tone:'good',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Handover Complete'},
  {id:'nonhotel-customer-pending',label:'มีลูกค้า • ไม่ร่วมโรงแรม • Defect เสร็จแล้ว รอตรวจรับ',tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Pending Handover'},
  {id:'nonhotel-customer-awaiting-receive',label:'มีลูกค้า • ไม่ร่วมโรงแรม • Defect เสร็จแล้ว รอลูกค้า / Hotel ตรวจรับ',tone:'warn',predicate:r=>r.customer_status==='มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&(r.status_group==='Non-Hotel - Pending Handover'||r.status_group==='Hotel - Checked Complete')},
  {id:'nonhotel-nosale',label:'ไม่มีลูกค้า • ไม่ร่วมโรงแรม • Awaiting Sale',tone:'neutral',predicate:r=>r.customer_status==='ไม่มีลูกค้า'&&r.hotel_participation==='ไม่ร่วมโรงแรม'&&r.status_group==='Non-Hotel - Awaiting Sale'},
]

const DEFECT_DONE_FOLDER='https://drive.google.com/drive/folders/1GJy5xu2eQMbv4MIKnQC5df7m_CpyocXK'

const HOTEL_NOTICE_DATE_BY_ROOM:Record<string,string>={
  A202:'2026-09-21',
  A211:'2026-09-24',
  A313:'2026-09-26',
  A314:'2026-09-26',
  A326:'2026-09-26',
  A410:'2026-09-27',
  A412:'2026-09-27',
  A501:'2026-09-16',
  A616:'2026-09-27',
  B212:'2026-09-22',
  B214:'2026-09-23',
}

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}

function hotelNoticeDateTH(r:RoomRow){
  const sourceText=[r.latest_source,r.source_note].filter(Boolean).join(' ')
  const sourceDate=sourceText.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/)
  if(sourceDate){
    const day=sourceDate[1].padStart(2,'0')
    const month=sourceDate[2].padStart(2,'0')
    const buddhistYear=Number(sourceDate[3])+543
    return `${day}/${month}/${String(buddhistYear).slice(-2)}`
  }
  const value=HOTEL_NOTICE_DATE_BY_ROOM[r.room_no]
  if(!value)return '—'
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if(!m)return '—'
  const buddhistYear=Number(m[1])+543
  return `${m[3]}/${m[2]}/${String(buddhistYear).slice(-2)}`
}

function latestSourceDate(rows:RoomRow[]){
  const values=rows.map(r=>r.source_modified_at).filter(Boolean) as string[]
  if(!values.length)return null
  return values.reduce((latest,current)=>new Date(current)>new Date(latest)?current:latest)
}

function statusTone(r:RoomRow){
  if(r.status_group==='Hotel - Incomplete')return 'danger'
  if(r.status_group==='Hotel - Awaiting Check'||r.status_group==='Non-Hotel - Pending Handover')return 'warn'
  if(r.status_group==='Hotel - Checked Complete')return r.hotel_participation==='ไม่ร่วมโรงแรม'?'warn':'good'
  if(r.status_group==='Non-Hotel - Handover Complete')return 'good'
  return 'neutral'
}

function statusLabel(r:RoomRow){
  if(r.status_group==='Hotel - Incomplete')return 'เพิ่งได้รับแจ้ง Defect'
  if(r.status_group==='Hotel - Awaiting Check')return 'Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ'
  if(r.status_group==='Hotel - Checked Complete')return r.hotel_participation==='ไม่ร่วมโรงแรม'?'Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ':'Hotel Engineer ตรวจแล้ว'
  if(r.status_group==='Non-Hotel - Pending Handover')return 'Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ'
  if(r.status_group==='Non-Hotel - Handover Complete')return 'ลูกค้าตรวจรับเรียบร้อยแล้ว'
  if(r.status_group==='Non-Hotel - Awaiting Sale')return 'Awaiting Sale'
  return r.current_status
}

export default function DefectDetailPage(){
  const [loadError,setLoadError]=useState(false)
  const [rows,setRows]=useState<RoomRow[]>([])
  const [loading,setLoading]=useState(true)
  const [filter,setFilter]=useState('')
  const [building,setBuilding]=useState('ALL')
  const [customerFilter,setCustomerFilter]=useState<CustomerFilter>('ALL')
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
    const supabase=getSupabase()
    const loader=createLiveLoader({
      load:async(signal)=>{
        const {data,error}=await supabase.from('condo_room_status').select('room_no,building,floor,owner_name,hotel_participation,customer_status,current_status,status_group,follow_up,priority,next_action,defect_detail,latest_source,source_note,source_modified_at').order('building').order('floor').order('room_no').abortSignal(signal)
        requireSuccessfulReads([{error}])
        if(!alive||signal.aborted)return
        setRows((data||[]) as RoomRow[])
        setLoadError(false)
      },
      onError:()=>{if(alive)setLoadError(true)},
      onSettled:()=>{if(alive)setLoading(false)},
    })
    const load=loader.refresh

    void load()
    const channel=supabase.channel('defect-report-status').on('postgres_changes',{event:'*',schema:'public',table:'condo_room_status'},()=>{void load()}).subscribe()
    const refresh=()=>{void load()}
    const refreshWhenVisible=()=>{if(document.visibilityState==='visible')void load()}
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refreshWhenVisible)

    return()=>{
      alive=false
      loader.dispose()
      window.removeEventListener('focus',refresh)
      document.removeEventListener('visibilitychange',refreshWhenVisible)
      void supabase.removeChannel(channel)
    }
  },[])

  useEffect(()=>{
    if(!loading&&window.location.hash==='#room-list')window.setTimeout(()=>document.getElementById('room-list')?.scrollIntoView({behavior:'smooth',block:'start'}),80)
  },[loading])

  const active=useMemo(()=>categories.find(c=>c.id===filter)||null,[filter])
  const sourceDate=useMemo(()=>latestSourceDate(rows),[rows])
  const baseRows=useMemo(()=>active?rows.filter(active.predicate):rows,[rows,active])
  const customerCount=baseRows.filter(r=>r.customer_status==='มีลูกค้า').length
  const noCustomerCount=baseRows.filter(r=>r.customer_status==='ไม่มีลูกค้า').length
  const aCount=baseRows.filter(r=>r.building==='A').length
  const bCount=baseRows.filter(r=>r.building==='B').length
  const totalCount=baseRows.length

  const filtered=useMemo(()=>{
    const needles=Array.from(new Set(q.split(/[,，]+/).map(x=>x.trim().toLowerCase()).filter(Boolean)))
    return rows.filter(r=>{
      if(building!=='ALL'&&r.building!==building)return false
      if(customerFilter==='CUSTOMER'&&r.customer_status!=='มีลูกค้า')return false
      if(customerFilter==='NO_CUSTOMER'&&r.customer_status!=='ไม่มีลูกค้า')return false
      if(active&&!active.predicate(r))return false
      if(!needles.length)return true
      const searchable=[r.room_no,r.owner_name,r.customer_status,r.hotel_participation,r.defect_detail,statusLabel(r),r.next_action,r.follow_up].filter(Boolean).join(' ').toLowerCase()
      return needles.some(needle=>searchable.includes(needle))
    })
  },[rows,building,customerFilter,active,q])

  const customerScopeLabel=customerFilter==='CUSTOMER'?'มีลูกค้า':customerFilter==='NO_CUSTOMER'?'ไม่มีลูกค้า':'ทุกประเภทลูกค้า'

  return <AppShell>
    {loadError&&<div className="panel" role="alert">โหลดข้อมูลไม่สำเร็จ ข้อมูลที่แสดงอาจเป็นข้อมูลเดิม กรุณาลองใหม่ <button type="button" className="button" onClick={()=>window.dispatchEvent(new Event('focus'))}>ลองใหม่</button></div>}
    <DefectCombineRoomEnhancer />
    <PageHeader
      title="Above Condo — Defect Report"
      subtitle="รายละเอียดย่อย Above Condo A, B"
      action={<div className="header-actions">
        <div className="update-meta"><span>ข้อมูลอัปเดต</span><b>{dateTimeTH(sourceDate)}</b></div>
        <a className="button drive-button" href={DEFECT_DONE_FOLDER} target="_blank" rel="noreferrer">📷 Picture - Defect Done</a>
        <Link href="/?section=defect#dashboard-defect" className="button">← Dashboard</Link>
      </div>}
    />

    {loading?<div className="panel">กำลังโหลดข้อมูลห้อง…</div>:<>
      <section className={`selected-status ${active?.tone||'neutral'}`} id="room-list">
        <div className="selected-copy">
          <span>{active?'รายการที่เลือก':'รายละเอียดทุกห้อง'}</span>
          <h2>{active?.label||'Above Condo — ทุกสถานะ'}</h2>
          <p>{building==='ALL'?'ตึก A + B':`ตึก ${building}`} • {customerScopeLabel} • แสดง {filtered.length} ห้อง</p>
        </div>
        <div className="selected-breakdown">
          <button type="button" onClick={()=>setCustomerFilter(v=>v==='CUSTOMER'?'ALL':'CUSTOMER')} className={`break-card customer ${customerFilter==='CUSTOMER'?'active':''}`}><span>มีลูกค้า</span><b>{customerCount}</b><small>ห้อง</small></button>
          <button type="button" onClick={()=>setCustomerFilter(v=>v==='NO_CUSTOMER'?'ALL':'NO_CUSTOMER')} className={`break-card no-customer ${customerFilter==='NO_CUSTOMER'?'active':''}`}><span>ไม่มีลูกค้า</span><b>{noCustomerCount}</b><small>ห้อง</small></button>
          <button type="button" onClick={()=>setBuilding('A')} className={`break-card building ${building==='A'?'active':''}`}><span>ตึก A</span><b>{aCount}</b><small>ห้อง</small></button>
          <button type="button" onClick={()=>setBuilding('B')} className={`break-card building ${building==='B'?'active':''}`}><span>ตึก B</span><b>{bCount}</b><small>ห้อง</small></button>
          <button type="button" onClick={()=>{setBuilding('ALL');setCustomerFilter('ALL')}} className={`break-card total ${building==='ALL'&&customerFilter==='ALL'?'active':''}`}><span>รวม</span><b>{totalCount}</b><small>ห้อง</small></button>
        </div>
      </section>

      <section className="panel filter-panel">
        <div className="toolbar detail-toolbar">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหาหลายรายการได้ เช่น A521, A522, รอตรวจรับ" aria-label="ค้นหาเลขห้อง ชื่อเจ้าของ สถานะ หรือรายละเอียดงาน หลายคำคั่นด้วย comma"/>
          <select value={building} onChange={e=>setBuilding(e.target.value)} aria-label="กรองอาคาร"><option value="ALL">ตึก A + B</option><option value="A">ตึก A</option><option value="B">ตึก B</option></select>
          <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="กรองสถานะ"><option value="">ทุกสถานะ</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
          {(q||building!=='ALL'||filter||customerFilter!=='ALL')&&<button type="button" className="button" onClick={()=>{setQ('');setBuilding('ALL');setFilter('');setCustomerFilter('ALL')}}>ล้างตัวกรอง</button>}
        </div>
      </section>

      <section className="panel detail-panel">
        <div className="detail-head">
          <div><h2>รายชื่อห้อง</h2><p>แสดง {filtered.length} ห้อง</p></div>
          <div className="legend"><span><i className="customer-dot"/>มีลูกค้า</span><span><i className="no-customer-dot"/>ไม่มีลูกค้า</span><span><i className="bad-dot"/>เพิ่งได้รับแจ้ง Defect</span><span><i className="warn-dot"/>Defect เสร็จแล้ว • รอตรวจรับ</span><span><i className="good-dot"/>ตรวจรับแล้ว / Hotel ตรวจแล้ว</span></div>
        </div>
        <div className="table-wrap defect-table"><table><thead><tr><th>ห้อง</th><th className="center">อาคาร</th><th className="center">วันที่ Hotel แจ้ง</th><th>ชื่อลูกค้า/เจ้าของ</th><th className="center">ลูกค้า</th><th className="center">โรงแรม</th><th>รายละเอียดงาน</th><th className="center">สถานะ</th><th>ต้องทำต่อ</th></tr></thead><tbody>
          {filtered.map(r=><tr key={r.room_no}>
            <td className="room-cell"><b>{r.room_no}</b><small>ชั้น {r.floor??'-'}</small></td>
            <td className="center"><b>{r.building}</b></td>
            <td className="center"><span className="notice-date" title="วันที่ตาม Hotel Defect Notice">{hotelNoticeDateTH(r)}</span></td>
            <td>{r.owner_name||<span className="muted">—</span>}</td>
            <td className="center"><span className={`customer-badge ${r.customer_status==='มีลูกค้า'?'customer':'no-customer'}`}>{r.customer_status}</span></td>
            <td className="center"><span className={`program-badge ${r.hotel_participation==='ร่วมโรงแรม'?'hotel':'nonhotel'}`}>{r.hotel_participation}</span></td>
            <td className="defect-detail">{r.defect_detail||<span className="muted">—</span>}</td>
            <td className="center"><span className={`state-badge ${statusTone(r)}`}>{statusLabel(r)}</span></td>
            <td>{r.next_action||r.follow_up||'-'}</td>
          </tr>)}
          {!filtered.length&&<tr><td colSpan={9} className="muted" style={{padding:28,textAlign:'center'}}>ไม่พบห้องตามเงื่อนไข</td></tr>}
        </tbody></table></div>
      </section>
    </>}

    <style jsx>{`
      .header-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.update-meta{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;line-height:1.25;margin-right:2px}.update-meta span{font-size:8.5px;color:var(--muted);font-weight:700}.update-meta b{font-size:10px;color:var(--navy);font-weight:800;white-space:nowrap}.drive-button{background:#f3f8ff;border-color:#bfd7ec;color:#245e8b;white-space:nowrap}
      .selected-status{scroll-margin-top:16px;display:grid;grid-template-columns:minmax(230px,1fr) minmax(570px,1.9fr);align-items:center;gap:16px;padding:15px 17px;border:1px solid var(--line);border-left:6px solid #8b949e;border-radius:14px;background:var(--surface);margin-bottom:12px}.selected-status.hotel{border-left-color:#2f6fb0;background:#f5f9fe}.selected-status.danger{border-left-color:#d84d45;background:#fff8f7}.selected-status.warn{border-left-color:#e2ad32;background:#fffaf0}.selected-status.good{border-left-color:#2e9a6a;background:#f6fbf8}.selected-copy>span{font-size:9px;font-weight:800;color:var(--muted)}.selected-copy h2{margin:3px 0;font-size:18px;color:var(--navy);line-height:1.3}.selected-copy p{margin:0;font-size:10px;color:var(--muted)}
      .selected-breakdown{display:grid;grid-template-columns:repeat(5,minmax(92px,1fr));gap:7px}.break-card{min-height:66px;border:1px solid var(--line);border-radius:11px;background:#fff;padding:8px 9px;text-align:center;display:flex;flex-direction:column;justify-content:center;color:var(--text);font:inherit;cursor:pointer;transition:.15s ease}.break-card:hover{transform:translateY(-1px);box-shadow:0 5px 14px rgba(25,42,63,.08)}.break-card span{display:block;font-size:8.5px;font-weight:800;color:var(--muted)}.break-card b{display:block;margin-top:2px;font-size:21px;line-height:1;color:var(--navy);font-variant-numeric:tabular-nums}.break-card small{display:block;margin-top:3px;font-size:8px;color:var(--muted)}.break-card.customer{background:#edf7ff;border:2px solid #bad9ef}.break-card.customer span,.break-card.customer b{color:#2a6997}.break-card.customer.active{border-color:#4b9bd3;box-shadow:inset 0 0 0 1px #4b9bd3,0 5px 14px rgba(75,155,211,.12)}.break-card.no-customer{background:#f1f3f5;border:2px solid #d4dae0}.break-card.no-customer span,.break-card.no-customer b{color:#606a76}.break-card.no-customer.active{border-color:#7f8790;box-shadow:inset 0 0 0 1px #7f8790,0 5px 14px rgba(95,104,115,.12)}.break-card.building.active{background:#eef6fc;border-color:#8bbbdc;box-shadow:inset 0 0 0 1px #8bbbdc}.break-card.total{background:#17243a;border:2px solid #17243a}.break-card.total span,.break-card.total b,.break-card.total small{color:#fff}.break-card.total.active{border-color:#d5a94b;box-shadow:inset 0 0 0 1px #d5a94b,0 5px 16px rgba(23,36,58,.16)}
      .filter-panel{padding:12px;margin-bottom:12px}.detail-toolbar{margin:0}.detail-toolbar input{min-width:320px}.detail-toolbar select{max-width:320px}.detail-panel{padding-bottom:0}.detail-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}.detail-head h2{margin:0;font-size:17px}.detail-head p{margin:3px 0 0;font-size:10px;color:var(--muted)}
      .legend{display:flex;gap:9px;flex-wrap:wrap;font-size:8.5px;color:var(--muted)}.legend span{display:flex;align-items:center;gap:4px}.legend i{width:8px;height:8px;border-radius:50%}.customer-dot{background:#4b9bd3}.no-customer-dot{background:#7f8790}.bad-dot{background:#d84d45}.warn-dot{background:#e2ad32}.good-dot{background:#2e9a6a}
      .defect-table{max-height:680px;margin:0 -19px}.defect-table table{min-width:1480px}.defect-table th,.defect-table td{vertical-align:middle}.defect-table th.center,.defect-table td.center{text-align:center}.defect-table td{font-size:11.5px}.room-cell b{display:inline-block;color:var(--navy);font-size:12.5px}.room-cell small{display:block;font-size:8.5px;color:var(--muted)}.notice-date{font-size:10px;font-weight:800;color:var(--navy);white-space:nowrap;font-variant-numeric:tabular-nums}.defect-detail{min-width:240px;max-width:360px;white-space:normal;line-height:1.45}
      .customer-badge,.program-badge,.state-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;font-size:9px;font-weight:750;border:1px solid transparent;white-space:nowrap}.customer-badge.customer{background:#edf7ff;border-color:#c5dfef;color:#2b6994}.customer-badge.no-customer{background:#f0f2f4;border-color:#d7dce1;color:#606a75}.program-badge.hotel{background:#f2edfb;border-color:#dacdf0;color:#5d3d9d}.program-badge.nonhotel{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}.state-badge.danger{background:#fdeceb;border-color:#f1cdca;color:#9e312d}.state-badge.warn{background:#fff3dc;border-color:#f0dfb8;color:#85570d}.state-badge.good{background:#e9f6ef;border-color:#cfe9da;color:#196645}.state-badge.neutral{background:#f0f2f4;border-color:#d8dde2;color:#5f6873}
      @media(max-width:1050px){.selected-status{grid-template-columns:1fr}.selected-breakdown{grid-template-columns:repeat(5,1fr)}}
      @media(max-width:760px){.header-actions{justify-content:flex-start}.update-meta{width:100%;align-items:flex-start}.selected-breakdown{grid-template-columns:repeat(2,1fr)}.break-card.total{grid-column:1/-1}.detail-toolbar input{min-width:0}.detail-toolbar select{max-width:none}.detail-head{align-items:flex-start;flex-direction:column}}
      @media(max-width:480px){.selected-breakdown{grid-template-columns:1fr 1fr}.drive-button{width:100%;text-align:center}}
    `}</style>
  </AppShell>
}