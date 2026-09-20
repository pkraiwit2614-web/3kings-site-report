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
    <PageHeader title="Purchasing / Delivery Follow-up" subtitle="รายการค้างส่งและนัดเข้าหน้างานที่ต้องติดตาม"/>
    <div className="panel table-wrap"><table><thead><tr><th>Site</th><th>Vendor</th><th>Item</th><th>Payment</th><th>Status</th><th>ETA</th><th>Note</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{projects.find(p=>p.id===x.project_id)?.code||'-'}</td><td>{x.vendor||'-'}</td><td><b>{x.item_name}</b></td><td>{x.payment_status||'-'}</td><td><StatusBadge value={x.current_status}/></td><td>{x.expected_delivery_text||'-'}</td><td>{x.condition_note||'-'}</td></tr>)}</tbody></table></div>
  </AppShell>
}
