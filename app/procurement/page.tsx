'use client'

import { useEffect,useMemo,useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import { dateTH } from '@/lib/format'
import type { Project } from '@/lib/types'

const thaiMonths:Record<string,number>={
  'ม.ค.':0,'ก.พ.':1,'มี.ค.':2,'เม.ย.':3,'พ.ค.':4,'มิ.ย.':5,
  'ก.ค.':6,'ส.ค.':7,'ก.ย.':8,'ต.ค.':9,'พ.ย.':10,'ธ.ค.':11
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

export default function ProcurementPage(){
  const [rows,setRows]=useState<any[]>([])
  const [projects,setProjects]=useState<Project[]>([])
  const [statusFilter,setStatusFilter]=useState('')
  const [updateFilter,setUpdateFilter]=useState('')

  useEffect(()=>{
    const s=getSupabase()
    Promise.all([
      s.from('procurement_items').select('*'),
      s.from('projects').select('*')
    ]).then(([r,p])=>{
      setRows(r.data||[])
      setProjects((p.data||[]) as Project[])
    })
  },[])

  const statuses=useMemo(()=>[...new Set(rows.map(x=>String(x.current_status||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th')),[rows])
  const updateDates=useMemo(()=>[...new Set(rows.map(x=>String(x.source_updated_at||'').trim()).filter(Boolean))].sort((a,b)=>b.localeCompare(a)),[rows])
  const latestUpdate=updateDates[0]||''

  const filteredRows=useMemo(()=>{
    const today=new Date(); today.setHours(0,0,0,0); const todayTs=today.getTime()
    return rows.filter(x=>{
      if(statusFilter&&String(x.current_status||'')!==statusFilter) return false
      if(updateFilter&&String(x.source_updated_at||'')!==updateFilter) return false
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
  },[rows,statusFilter,updateFilter])

  return <AppShell>
    <PageHeader title="การจัดซื้อ/จัดจ้าง" subtitle="ติดตามสถานะจัดซื้อ การชำระ ผู้ขาย/ผู้รับเหมา และกำหนดส่งหรือเข้าหน้างาน"/>

    <section className="panel" style={{marginBottom:14,position:'sticky',top:0,zIndex:18}}>
      <div className="toolbar" style={{padding:10,background:'var(--surface)',borderRadius:12}}>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="">ทุกสถานะปัจจุบัน</option>
          {statuses.map(x=><option key={x} value={x}>{x}</option>)}
        </select>
        <select value={updateFilter} onChange={e=>setUpdateFilter(e.target.value)}>
          <option value="">ทุกวันที่อัปเดตข้อมูล</option>
          {updateDates.map(x=><option key={x} value={x}>{dateTH(x)}</option>)}
        </select>
        {(statusFilter||updateFilter)&&<button type="button" className="button" onClick={()=>{setStatusFilter('');setUpdateFilter('')}}>ล้างตัวกรอง</button>}
        <span className="muted small" style={{marginLeft:'auto'}}>แสดง {filteredRows.length} / {rows.length} รายการ{latestUpdate?` • ข้อมูลล่าสุด ${dateTH(latestUpdate)}`:''}</span>
      </div>
    </section>

    <div className="panel" style={{padding:0,overflow:'hidden'}}>
      <div className="table-wrap" style={{maxHeight:'calc(100vh - 245px)',overflow:'auto'}}>
        <table>
          <thead style={{position:'sticky',top:0,zIndex:12,background:'var(--surface)'}}><tr><th>Site / Plot</th><th>ผู้ขาย / ผู้รับเหมา</th><th>รายการ</th><th>สถานะชำระ / จัดซื้อ</th><th>สถานะปัจจุบัน</th><th>กำหนดส่ง / เข้าหน้างาน</th><th>อัปเดตข้อมูล</th><th>เงื่อนไข / หมายเหตุ</th></tr></thead>
          <tbody>{filteredRows.map(x=><tr key={x.id}>
            <td>{projects.find(p=>p.id===x.project_id)?.code||'-'}</td>
            <td>{x.vendor||'ยังไม่ระบุ'}</td>
            <td><b>{x.item_name}</b></td>
            <td>{x.payment_status||x.procurement_status||'-'}</td>
            <td><StatusBadge value={x.current_status}/></td>
            <td><b>{x.expected_delivery_text||'ยังไม่ระบุ'}</b></td>
            <td>{dateTH(x.source_updated_at)}</td>
            <td>{x.condition_note||'-'}</td>
          </tr>)}</tbody>
        </table>
        {!filteredRows.length&&<p className="muted" style={{padding:16}}>ไม่พบรายการตามตัวกรองที่เลือก</p>}
      </div>
    </div>
    <p className="muted small" style={{marginTop:8}}>เรียงกำหนดส่ง/เข้าหน้างาน: วันที่กำลังจะถึงก่อน • รายการที่เลยกำหนดแล้วเรียงจากล่าสุดไปเก่าสุด • รายการที่ไม่ระบุวันที่อยู่ท้ายตาราง</p>
  </AppShell>
}
