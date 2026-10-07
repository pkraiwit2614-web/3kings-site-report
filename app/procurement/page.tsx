'use client'

import { useEffect,useMemo,useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { createLiveLoader, requireSuccessfulReads } from '@/lib/liveLoader'
import { dateTH } from '@/lib/format'
import type { Project } from '@/lib/types'
import ProcurementEditPanel from '@/components/ProcurementEditPanel'

function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' น.'
}

const thaiMonths:Record<string,number>={
  'ม.ค.':0,'ก.พ.':1,'มี.ค.':2,'เม.ย.':3,'พ.ค.':4,'มิ.ย.':5,
  'ก.ค.':6,'ส.ค.':7,'ก.ย.':8,'ต.ค.':9,'พ.ย.':10,'ธ.ค.':11
}

const completedStatusPattern=/(ส่งมอบเรียบร้อย|รับสินค้าเรียบร้อย|รับสินค้าแล้ว|ติดตั้งเรียบร้อย|ส่งครบ|ปิดงาน|ปิดติดตาม|งานเสร็จ|เสร็จสมบูรณ์|completed|done|closed)/i

function needsFollowUp(row:any){
  const current=String(row.current_status||'').trim()
  if(current&&completedStatusPattern.test(current)) return false
  return true
}

function parseDeliveryDate(row:any){
  const text=String(row.expected_delivery_text||'').trim()
  const numeric=text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/)
  if(numeric){
    let year=Number(numeric[3]); if(year>2400) year-=543
    const d=new Date(year,Number(numeric[2])-1,Number(numeric[1]))
    if(!Number.isNaN(d.getTime())) return d.getTime()
  }
  const monthToken=Object.keys(thaiMonths).find(m=>text.includes(m))
  const yearMatch=text.match(/(25\d{2}|20\d{2})/)
  if(monthToken&&yearMatch){
    let year=Number(yearMatch[1]); if(year>2400) year-=543
    const day=/ต้น/.test(text)?5:/ปลาย/.test(text)?25:/กลาง/.test(text)?15:15
    return new Date(year,thaiMonths[monthToken],day).getTime()
  }
  if(row.expected_delivery){
    const d=new Date(`${row.expected_delivery}T00:00:00`)
    if(!Number.isNaN(d.getTime())&&d.getFullYear()<2200) return d.getTime()
  }
  return null
}

function searchable(values:unknown[],needle:string){
  if(!needle) return true
  return values.map(v=>String(v??'')).join(' ').toLowerCase().includes(needle)
}

export default function ProcurementPage(){
  const [loadError,setLoadError]=useState(false)
  const [rows,setRows]=useState<any[]>([])
  const [procurementLinks,setProcurementLinks]=useState<any[]>([])
  const [projects,setProjects]=useState<Project[]>([])
  const [siteFilter,setSiteFilter]=useState('')
  const [statusFilter,setStatusFilter]=useState('')
  const [updateFilter,setUpdateFilter]=useState('')
  const [followUpOnly,setFollowUpOnly]=useState(false)
  const [q,setQ]=useState('')
  const [latestSyncAt,setLatestSyncAt]=useState<string|null>(null)

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const qParam=params.get('q')||''
    if(qParam) setQ(qParam)
  },[])

  useEffect(()=>{
    let alive=true
    let refreshTimer:number|null=null
    const s=getSupabase()
    const loader=createLiveLoader({
      load:async(signal)=>{
        const [r,links,p,sync]=await Promise.all([
          s.from('procurement_items').select('*').abortSignal(signal),
          s.from('procurement_item_projects').select('procurement_item_id,project_id').abortSignal(signal),
          s.from('projects').select('*').abortSignal(signal),
          s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','materials').order('created_at',{ascending:false}).limit(1).abortSignal(signal).maybeSingle()
        ])
        requireSuccessfulReads([r,links,p,sync])
        if(!alive||signal.aborted)return
        setLoadError(false)
        setRows(r.data||[])
        setProcurementLinks(links.data||[])
        setProjects((p.data||[]) as Project[])
        setLatestSyncAt(sync.data?.created_at||null)
      },
      onError:()=>{if(alive)setLoadError(true)},
    })
    const load=loader.refresh
    const queueLoad=()=>{
      if(refreshTimer)window.clearTimeout(refreshTimer)
      refreshTimer=window.setTimeout(()=>{void load()},350)
    }
    void load()
    const channel=s.channel('procurement-live-refresh')
      .on('postgres_changes',{event:'*',schema:'public',table:'procurement_items'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'procurement_item_projects'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'projects'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'drive_sync_runs'},queueLoad)
      .subscribe()
    const refresh=()=>queueLoad()
    const refreshWhenVisible=()=>{if(document.visibilityState==='visible')queueLoad()}
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refreshWhenVisible)
    return()=>{
      alive=false
      loader.dispose()
      if(refreshTimer)window.clearTimeout(refreshTimer)
      window.removeEventListener('focus',refresh)
      document.removeEventListener('visibilitychange',refreshWhenVisible)
      void s.removeChannel(channel)
    }
  },[])

  const projectById=useMemo(()=>new Map(projects.map(p=>[p.id,p])),[projects])
  const procurementProjectIdsByItem=useMemo(()=>{
    const map=new Map<string,string[]>()
    for(const link of procurementLinks){
      const itemId=String(link.procurement_item_id||'')
      const projectId=String(link.project_id||'')
      if(!itemId||!projectId) continue
      const ids=map.get(itemId)||[]
      if(!ids.includes(projectId)) ids.push(projectId)
      map.set(itemId,ids)
    }
    for(const item of rows){
      const itemId=String(item.id||'')
      const projectId=String(item.project_id||'')
      if(!itemId||!projectId) continue
      const ids=map.get(itemId)||[]
      if(!ids.includes(projectId)) ids.push(projectId)
      map.set(itemId,ids)
    }
    return map
  },[procurementLinks,rows])
  const procurementProjectsFor=(item:any)=>(procurementProjectIdsByItem.get(String(item.id))||[])
    .map(id=>projectById.get(id))
    .filter(Boolean)
    .sort((a,b)=>(a?.sort_order??999999)-(b?.sort_order??999999)) as Project[]
  const siteOptions=useMemo(()=>{
    const usedProjectIds=new Set(Array.from(procurementProjectIdsByItem.values()).flat())
    return projects
      .filter(p=>usedProjectIds.has(p.id))
      .sort((a,b)=>(a.sort_order??999999)-(b.sort_order??999999)||a.code.localeCompare(b.code,'th'))
  },[projects,procurementProjectIdsByItem])
  const statuses=useMemo(()=>[...new Set(rows.map(x=>String(x.current_status||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th')),[rows])
  const updateDates=useMemo(()=>[...new Set(rows.map(x=>String(x.source_updated_at||'').trim()).filter(Boolean))].sort((a,b)=>b.localeCompare(a)),[rows])
  const latestUpdate=updateDates[0]||''
  const needle=q.trim().toLowerCase()

  const filteredRows=useMemo(()=>{
    const today=new Date(); today.setHours(0,0,0,0); const todayTs=today.getTime()
    return rows.filter(x=>{
      const relatedIds=procurementProjectIdsByItem.get(String(x.id))||[]
      const related=relatedIds.map(id=>projectById.get(id)).filter(Boolean) as Project[]
      if(siteFilter&&!relatedIds.includes(siteFilter)) return false
      if(statusFilter&&String(x.current_status||'')!==statusFilter) return false
      if(updateFilter&&String(x.source_updated_at||'')!==updateFilter) return false
      if(followUpOnly&&!needsFollowUp(x)) return false
      if(!searchable([
        ...related.flatMap(p=>[p.code,p.name]),x.vendor,x.item_name,x.procurement_status,x.payment_status,x.current_status,
        x.pr_no,x.po_no,x.expected_delivery_text,x.condition_note,x.source_updated_at
      ],needle)) return false
      return true
    }).sort((a,b)=>{
      const ad=parseDeliveryDate(a), bd=parseDeliveryDate(b)
      if(ad===null&&bd===null) return (a.source_row||999999)-(b.source_row||999999)
      if(ad===null) return 1
      if(bd===null) return -1
      const aFuture=ad>=todayTs, bFuture=bd>=todayTs
      if(aFuture!==bFuture) return aFuture?-1:1
      return aFuture?ad-bd:bd-ad
    })
  },[rows,siteFilter,statusFilter,updateFilter,followUpOnly,needle,projectById,procurementProjectIdsByItem])

  const compactControlStyle={
    minHeight:34,
    padding:'6px 9px',
    borderRadius:8,
    fontSize:12
  } as const

  return <AppShell>
    {loadError&&<div className="panel" role="alert">โหลดข้อมูลไม่สำเร็จ ข้อมูลที่แสดงอาจเป็นข้อมูลเดิม กรุณาลองใหม่ <button type="button" className="button" onClick={()=>window.dispatchEvent(new Event('focus'))}>ลองใหม่</button></div>}
    <PageHeader title="การจัดซื้อ/จัดจ้าง" subtitle="ค้นหาจากวัสดุ งาน ผู้ขาย ผู้รับเหมา เลข PO หรือสถานะ เพื่อดูว่าตอนนี้ติดอยู่ขั้นตอนไหนและต้องตามอะไรต่อ" action={<div className="header-actions">
      <div className="update-meta"><span>ข้อมูลอัปเดต</span><b>{dateTimeTH(latestSyncAt)}</b></div>
      <Link href="/?section=purchasing-followup#dashboard-purchasing" className="button">← Dashboard</Link>
    </div>}/>
    <ProcurementEditPanel/>

    <section className="panel" style={{marginBottom:10,position:'sticky',top:0,zIndex:18,padding:8,borderRadius:14}}>
      <div className="toolbar" style={{padding:0,background:'var(--surface)',borderRadius:10,marginBottom:0,flexWrap:'wrap',gap:6,alignItems:'center'}}>
        <input
          aria-label="ค้นหาจัดซื้อจัดจ้าง"
          placeholder="ค้นหา วัสดุ / งาน / PO / ผู้ขาย / ผู้รับเหมา / สถานะ"
          value={q}
          onChange={e=>setQ(e.target.value)}
          style={{...compactControlStyle,flex:'1 1 300px',minWidth:220,border:'1px solid #d8d2c7',background:'#fffdf9',color:'#182231',outline:'none'}}
        />
        <select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)} style={{...compactControlStyle,minWidth:145,maxWidth:220}}>
          <option value="">ทุก Plot / หน้างาน</option>
          {siteOptions.map(p=><option key={p.id} value={p.id}>{p.code}{p.name&&p.name!==p.code?` — ${p.name}`:''}</option>)}
        </select>
        <button
          type="button"
          className="button"
          aria-pressed={followUpOnly}
          onClick={()=>setFollowUpOnly(v=>!v)}
          style={{...compactControlStyle,whiteSpace:'nowrap',...(followUpOnly?{fontWeight:800,boxShadow:'inset 0 0 0 2px currentColor'}:{})}}
        >
          {followUpOnly?'✓ ':''}ติดค้าง / ต้องตาม
        </button>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{...compactControlStyle,minWidth:140,maxWidth:205}}>
          <option value="">ทุกสถานะ</option>
          {statuses.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <select value={updateFilter} onChange={e=>setUpdateFilter(e.target.value)} style={{...compactControlStyle,minWidth:140,maxWidth:190}}>
          <option value="">ทุกวันที่อัปเดต</option>
          {updateDates.map(x=><option key={x} value={x}>{dateTH(x)}</option>)}
        </select>
        {(q||siteFilter||statusFilter||updateFilter||followUpOnly)&&<button type="button" className="button" onClick={()=>{setQ('');setSiteFilter('');setStatusFilter('');setUpdateFilter('');setFollowUpOnly(false)}} style={{...compactControlStyle,whiteSpace:'nowrap'}}>ล้าง</button>}
      </div>
      <div className="muted small" style={{marginTop:5,textAlign:'right',fontSize:11,lineHeight:1.25}}>
        แสดง {filteredRows.length} / {rows.length} รายการ{latestUpdate?` • ข้อมูลล่าสุด ${dateTH(latestUpdate)}`:''}
      </div>
    </section>

    <div className="panel" style={{padding:0,overflow:'hidden'}}>
      <div className="table-wrap" style={{maxHeight:'calc(100vh - 205px)',overflow:'auto'}}>
        <table style={{minWidth:1450}}>
          <thead style={{position:'sticky',top:0,zIndex:12,background:'var(--surface)'}}><tr><th>Site / Plot</th><th>PO / PR</th><th>ผู้ขาย / ผู้รับเหมา</th><th>รายการ</th><th>สถานะ PO / ชำระ</th><th style={{width:180,minWidth:180,maxWidth:180}}>ขั้นตอนปัจจุบัน</th><th>กำหนดส่ง / เข้าหน้างาน</th><th>รายละเอียด / สิ่งที่ต้องตาม</th><th>อัปเดตข้อมูล</th></tr></thead>
          <tbody>{filteredRows.map(x=>{const linkedProjects=procurementProjectsFor(x);return <tr key={x.id}>
            <td><b>{linkedProjects.map(p=>p.code).join(' / ')||'ไม่ระบุ Plot'}</b><small>{linkedProjects.map(p=>p.name).filter(Boolean).join(' / ')}</small></td>
            <td><b>{[x.po_no,x.pr_no].filter(Boolean).join(' / ')||'-'}</b></td>
            <td>{x.vendor||'ยังไม่ระบุ'}</td>
            <td><b>{x.item_name}</b></td>
            <td>{x.payment_status||x.procurement_status||'-'}</td>
            <td style={{width:180,minWidth:180,maxWidth:180,whiteSpace:'normal',overflowWrap:'anywhere'}}><StatusBadge value={x.current_status} multiline/></td>
            <td><b>{x.expected_delivery_text||'ยังไม่ระบุ'}</b></td>
            <td>{x.condition_note||'-'}</td>
            <td>{dateTH(x.source_updated_at)}</td>
          </tr>})}</tbody>
        </table>
        {!filteredRows.length&&<p className="muted" style={{padding:16}}>ไม่พบรายการตามคำค้นหรือ Filter ที่เลือก</p>}
      </div>
    </div>
    <p className="muted small" style={{marginTop:8}}>พิมพ์ชื่อวัสดุหรือเลข PO เพื่อดูรายการที่เกี่ยวข้องได้ทันที • ใช้ Filter Plot/หน้างานและ “เฉพาะติดค้าง / ต้องตาม” ร่วมกับการค้นหาได้ • ขั้นตอนปัจจุบันและรายละเอียดใช้สำหรับตามต่อกับจัดซื้อ บัญชี ร้านค้า หรือผู้รับเหมา</p>
  </AppShell>
}
