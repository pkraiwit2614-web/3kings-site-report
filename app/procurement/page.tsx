'use client'

import { useEffect,useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import type { Project } from '@/lib/types'

export default function ProcurementPage(){
  const [rows,setRows]=useState<any[]>([])
  const [projects,setProjects]=useState<Project[]>([])

  useEffect(()=>{
    const s=getSupabase()
    Promise.all([
      s.from('procurement_items').select('*').order('source_row'),
      s.from('projects').select('*')
    ]).then(([r,p])=>{
      setRows(r.data||[])
      setProjects((p.data||[]) as Project[])
    })
  },[])

  return <AppShell>
    <PageHeader title="Purchasing / Delivery Follow-up" subtitle="ติดตามสถานะจัดซื้อ การชำระ ผู้ขาย/ผู้รับเหมา และกำหนดส่งหรือเข้าหน้างาน"/>
    <div className="panel table-wrap"><table><thead><tr><th>Site / Plot</th><th>ผู้ขาย / ผู้รับเหมา</th><th>รายการ</th><th>สถานะชำระ / จัดซื้อ</th><th>สถานะปัจจุบัน</th><th>กำหนดส่ง / เข้าหน้างาน</th><th>เงื่อนไข / หมายเหตุ</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{projects.find(p=>p.id===x.project_id)?.code||'-'}</td><td>{x.vendor||'ยังไม่ระบุ'}</td><td><b>{x.item_name}</b></td><td>{x.payment_status||x.procurement_status||'-'}</td><td><StatusBadge value={x.current_status}/></td><td>{x.expected_delivery_text||'ยังไม่ระบุ'}</td><td>{x.condition_note||'-'}</td></tr>)}</tbody></table></div>
  </AppShell>
}
