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

function dateTH(value:string|null|undefined){
  if(!value) return '-'
  const d=new Date(`${value}T00:00:00+07:00`)
  if(Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).format(d)
}

function uniqueText(rows:any[],key:string){
  return Array.from(new Set(rows.map(x=>`${x?.[key]||''}`.trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'th'))
}

export default function MaterialsPage(){
  const [projects,setProjects]=useState<Project[]>([])
  const [rows,setRows]=useState<any[]>([])
  const [tools,setTools]=useState<any[]>([])
  const [project,setProject]=useState('')
  const [orderStatus,setOrderStatus]=useState('')
  const [q,setQ]=useState('')
  const [toolStatus,setToolStatus]=useState('')
  const [toolCategory,setToolCategory]=useState('')
  const [toolLocation,setToolLocation]=useState('')
  const [toolQ,setToolQ]=useState('')
  const [latestSyncAt,setLatestSyncAt]=useState<string|null>(null)

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const projectParam=params.get('project')||''
    const statusParam=params.get('status')||''
    const qParam=params.get('q')||''
    if(projectParam) setProject(projectParam)
    if(['สั่งแล้ว','สั่งมาไม่พอ','ยังไม่สั่ง','เจ้าของจัดหา','ไม่เกี่ยวข้อง'].includes(statusParam)) setOrderStatus(statusParam)
    if(qParam) setQ(qParam)
  },[])

  useEffect(()=>{
    const s=getSupabase()
    Promise.all([
      s.from('projects').select('*').eq('active',true).order('sort_order'),
      s.from('materials').select('*').order('project_id').order('source_row'),
      s.from('tool_machine').select('*').order('item_no'),
      s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','materials').order('created_at',{ascending:false}).limit(1).maybeSingle()
    ]).then(([p,m,t,sync])=>{
      setProjects((p.data||[]) as Project[])
      setRows(m.data||[])
      setTools(t.data||[])
      setLatestSyncAt(sync.data?.created_at||null)
    })
  },[])

  const filtered=useMemo(()=>rows.filter(x=>
    (!project||x.project_id===project)&&
    (!orderStatus||x.status===orderStatus)&&
    (!q||`${x.item_name} ${x.category||''} ${x.status||''} ${x.model_spec||''} ${x.brand||''}`.toLowerCase().includes(q.toLowerCase()))
  ),[rows,project,orderStatus,q])

  const toolStatuses=useMemo(()=>uniqueText(tools,'status'),[tools])
  const toolCategories=useMemo(()=>uniqueText(tools,'category'),[tools])
  const toolLocations=useMemo(()=>uniqueText(tools,'location'),[tools])
  const filteredTools=useMemo(()=>tools.filter(x=>
    (!toolStatus||x.status===toolStatus)&&
    (!toolCategory||x.category===toolCategory)&&
    (!toolLocation||x.location===toolLocation)&&
    (!toolQ||`${x.item_code||''} ${x.item_name||''} ${x.category||''} ${x.brand||''} ${x.model_spec||''} ${x.status||''} ${x.location||''} ${x.responsible_person||''}`.toLowerCase().includes(toolQ.toLowerCase()))
  ),[tools,toolStatus,toolCategory,toolLocation,toolQ])

  return <AppShell>
    <PageHeader title="วัสดุ เครื่องมือและผู้รับเหมา" subtitle={`ข้อมูล Materials Status และทะเบียน Tool & Machine จากไฟล์ล่าสุดใน Google Drive • วัสดุ/งาน ${rows.length} รายการ • เครื่องมือ ${tools.length} รายการ`}/>

    <section aria-labelledby="materials-status-title">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'end',flexWrap:'wrap',marginBottom:10}}>
        <div>
          <h2 id="materials-status-title" style={{margin:'0 0 3px'}}>Materials Status</h2>
          <div className="small muted">วัสดุ อุปกรณ์ และรายการผู้รับเหมา</div>
        </div>
        <b className="small">แสดง {filtered.length} / {rows.length} รายการ</b>
      </div>
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
          <option value="สั่งมาไม่พอ">สั่งมาไม่พอ</option>
          <option value="ยังไม่สั่ง">ยังไม่สั่ง</option>
          <option value="เจ้าของจัดหา">เจ้าของจัดหา</option>
          <option value="ไม่เกี่ยวข้อง">ไม่เกี่ยวข้อง</option>
        </select>
        <span className="small muted" style={{flex:1}}>ข้อมูล Materials จาก Drive Sync</span>
      </div>
      <div className="panel table-wrap" style={{maxHeight:500,overflow:'auto'}}><table><thead><tr><th>Plot</th><th>หมวด</th><th>วัสดุ / งาน</th><th>ยี่ห้อ / รุ่น / สเปก</th><th>สถานะ</th><th>รายละเอียด / หมายเหตุ</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td>{projects.find(p=>p.id===x.project_id)?.code||'-'}</td><td>{x.category||'-'}</td><td><b>{x.item_name}</b><small>{x.quantity_unit||'ยังไม่ระบุปริมาณ/หน่วย'}</small></td><td>{[x.brand,x.model_spec].filter(Boolean).join(' / ')||'-'}</td><td><StatusBadge value={x.status}/></td><td>{x.status_detail||x.notes||'-'}</td></tr>)}</tbody></table></div>
    </section>

    <section aria-labelledby="tool-machine-title" style={{marginTop:30,paddingTop:4}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'end',flexWrap:'wrap',marginBottom:10}}>
        <div>
          <h2 id="tool-machine-title" style={{margin:'0 0 3px'}}>Tool &amp; Machine</h2>
          <div className="small muted">ทะเบียนเครื่องมือและเครื่องจักรจากชีท 06-Tools &amp; Machine</div>
        </div>
        <b className="small">แสดง {filteredTools.length} / {tools.length} รายการ</b>
      </div>
      <div className="panel" style={{padding:'10px 14px',marginBottom:14}}>
        <input
          aria-label="ค้นหาเครื่องมือและเครื่องจักร"
          placeholder="ค้นหารหัส / เครื่องมือ / ยี่ห้อ / รุ่น / ผู้รับผิดชอบ"
          value={toolQ}
          onChange={e=>setToolQ(e.target.value)}
          style={{width:'100%',maxWidth:720,padding:'10px 11px',border:'1px solid #d8d2c7',borderRadius:10,background:'#fffdf9',color:'#182231',outline:'none'}}
        />
      </div>
      <div className="toolbar">
        <select value={toolCategory} onChange={e=>setToolCategory(e.target.value)}><option value="">ทุกหมวด</option>{toolCategories.map(v=><option key={v} value={v}>{v}</option>)}</select>
        <select value={toolStatus} onChange={e=>setToolStatus(e.target.value)}><option value="">ทุกสถานะ</option>{toolStatuses.map(v=><option key={v} value={v}>{v}</option>)}</select>
        <select value={toolLocation} onChange={e=>setToolLocation(e.target.value)}><option value="">ทุกสถานที่</option>{toolLocations.map(v=><option key={v} value={v}>{v}</option>)}</select>
        <span className="small muted" style={{flex:1}}>ข้อมูลทะเบียนจาก Drive Sync</span>
      </div>
      <div className="panel table-wrap" style={{maxHeight:560,overflow:'auto'}}><table><thead><tr><th>รหัส</th><th>หมวด</th><th>เครื่องมือ / เครื่องจักร</th><th>ยี่ห้อ / รุ่น</th><th>จำนวน</th><th>สถานะ</th><th>สถานที่ล่าสุด</th><th>ผู้รับผิดชอบ</th><th>วันที่อัปเดต</th><th>หมายเหตุ</th></tr></thead><tbody>{filteredTools.map(x=><tr key={x.id}><td><b>{x.item_code||'-'}</b></td><td>{x.category||'-'}</td><td><b>{x.item_name||'-'}</b></td><td>{[x.brand,x.model_spec].filter(Boolean).join(' / ')||'-'}</td><td>{x.quantity??'-'} {x.unit||''}</td><td><StatusBadge value={x.status}/></td><td>{x.location||'-'}</td><td>{x.responsible_person||'-'}</td><td>{dateTH(x.source_updated_at)}</td><td>{x.notes||'-'}</td></tr>)}</tbody></table></div>
    </section>
  </AppShell>
}
