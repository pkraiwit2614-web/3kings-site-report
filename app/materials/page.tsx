'use client'

import { useEffect,useMemo,useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import StatusBadge from '@/components/StatusBadge'
import { getSupabase } from '@/lib/supabase'
import type { Project } from '@/lib/types'

function dateTimeTH(value:string|null|undefined){
  if(!value) return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d)
}

export default function MaterialsPage(){
  const [projects,setProjects]=useState<Project[]>([])
  const [rows,setRows]=useState<any[]>([])
  const [project,setProject]=useState('')
  const [orderStatus,setOrderStatus]=useState('')
  const [q,setQ]=useState('')
  const [latestSyncAt,setLatestSyncAt]=useState<string|null>(null)

  useEffect(()=>{
    const s=getSupabase()
    Promise.all([
      s.from('projects').select('*').eq('active',true).order('sort_order'),
      s.from('materials').select('*').order('project_id').order('source_row'),
      s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','materials').order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]).then(([p,m,sync])=>{
      setProjects((p.data||[]) as Project[])
      setRows(m.data||[])
      setLatestSyncAt(sync.data?.created_at||null)
    })
  },[])

  const filtered=useMemo(()=>rows.filter(x=>
    (!project||x.project_id===project)&&
    (!orderStatus||x.status===orderStatus)&&
    (!q||`${x.item_name} ${x.category||''} ${x.status||''} ${x.model_spec||''}`.toLowerCase().includes(q.toLowerCase()))
  ),[rows,project,orderStatus,q])

  return <AppShell>
    <PageHeader title="Materials Status" subtitle={`วัสดุอุปกรณ์และรายการผู้รับเหมา จาก Master Materials ล่าสุดใน Google Drive • ปัจจุบัน ${rows.length} รายการ`}/>
    <div className="panel" style={{padding:'10px 14px',marginBottom:14,display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}>
      <input
        aria-label="ค้นหาวัสดุ รุ่น สถานะ หรือหมวด"
        placeholder="ค้นหาวัสดุ / รุ่น / สถานะ / หมวด"
        value={q}
        onChange={e=>setQ(e.target.value)}
        style={{flex:'1 1 340px',minWidth:220,maxWidth:620,padding:'10px 11px',border:'1px solid #d8d2c7',borderRadius:10,background:'#fffdf9',color:'#182231',outline:'none'}}
      />
      <b className="small">อัปเดตข้อมูลล่าสุด: {dateTimeTH(latestSyncAt)}</b>
    </div>
    <div className="toolbar">
      <select value={project} onChange={e=>setProject(e.target.value)}><option value="">ทุก Plot</option>{projects.filter(p=>/^AV-P[6-9]$/.test(p.code)).map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>
      <select value={orderStatus} onChange={e=>setOrderStatus(e.target.value)}>
        <option value="">ทุกสถานะการสั่งซื้อ</option>
        <option value="สั่งแล้ว">สั่งแล้ว</option>
        <option value="ยังไม่สั่ง">ยังไม่สั่ง</option>
      </select>
      <span className="small muted" style={{flex:1}}>ข้อมูล Materials จาก Drive Sync</span>
      <span>{filtered.length} รายการ</span>
    </div>
    <div className="panel table-wrap" style={{maxHeight:'calc(100vh - 250px)',overflow:'auto'}}><table><thead><tr><th>Plot</th><th>หมวด</th><th>วัสดุ / งาน</th><th>ยี่ห้อ / รุ่น / สเปก</th><th>สถานะ</th><th>รายละเอียด / หมายเหตุ</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td>{projects.find(p=>p.id===x.project_id)?.code||'-'}</td><td>{x.category||'-'}</td><td><b>{x.item_name}</b><small>{x.quantity_unit||'ยังไม่ระบุปริมาณ/หน่วย'}</small></td><td>{[x.brand,x.model_spec].filter(Boolean).join(' / ')||'-'}</td><td><StatusBadge value={x.status}/></td><td>{x.status_detail||x.notes||'-'}</td></tr>)}</tbody></table></div>
  </AppShell>
}
