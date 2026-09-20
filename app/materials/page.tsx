'use client'

import { useEffect,useMemo,useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import type { Project } from '@/lib/types'

export default function MaterialsPage(){
  const [projects,setProjects]=useState<Project[]>([])
  const [rows,setRows]=useState<any[]>([])
  const [project,setProject]=useState('')
  const [q,setQ]=useState('')

  useEffect(()=>{
    const s=getSupabase()
    Promise.all([
      s.from('projects').select('*').eq('active',true).order('sort_order'),
      s.from('materials').select('*').order('project_id').order('source_row')
    ]).then(([p,m])=>{
      setProjects((p.data||[]) as Project[])
      setRows(m.data||[])
    })
  },[])

  const filtered=useMemo(()=>rows.filter(x=>(!project||x.project_id===project)&&(!q||`${x.item_name} ${x.category||''} ${x.status||''} ${x.model_spec||''}`.toLowerCase().includes(q.toLowerCase()))),[rows,project,q])

  return <AppShell>
    <PageHeader title="Materials Status" subtitle={`วัสดุอุปกรณ์และรายการผู้รับเหมา จาก Master Materials ล่าสุดใน Google Drive • ปัจจุบัน ${rows.length} รายการ`}/>
    <div className="toolbar">
      <select value={project} onChange={e=>setProject(e.target.value)}><option value="">ทุก Plot</option>{projects.filter(p=>/^AV-P[6-9]$/.test(p.code)).map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>
      <input placeholder="ค้นหาวัสดุ / รุ่น / สถานะ / หมวด" value={q} onChange={e=>setQ(e.target.value)}/>
      <span>{filtered.length} รายการ</span>
    </div>
    <div className="panel table-wrap"><table><thead><tr><th>Plot</th><th>หมวด</th><th>วัสดุ / งาน</th><th>ยี่ห้อ / รุ่น / สเปก</th><th>สถานะ</th><th>รายละเอียด / หมายเหตุ</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td>{projects.find(p=>p.id===x.project_id)?.code||'-'}</td><td>{x.category||'-'}</td><td><b>{x.item_name}</b><small>{x.quantity_unit||'ยังไม่ระบุปริมาณ/หน่วย'}</small></td><td>{[x.brand,x.model_spec].filter(Boolean).join(' / ')||'-'}</td><td><StatusBadge value={x.status}/></td><td>{x.status_detail||x.notes||'-'}</td></tr>)}</tbody></table></div>
  </AppShell>
}
