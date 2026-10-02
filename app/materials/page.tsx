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

function textSearch(values:unknown[],needle:string){
  if(!needle) return true
  return values.map(v=>String(v??'')).join(' ').toLowerCase().includes(needle)
}

export default function MaterialsPage(){
  const [projects,setProjects]=useState<Project[]>([])
  const [rows,setRows]=useState<any[]>([])
  const [procurement,setProcurement]=useState<any[]>([])
  const [procurementLinks,setProcurementLinks]=useState<any[]>([])
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
    let alive=true
    let refreshTimer:number|null=null
    const s=getSupabase()
    const load=async()=>{
      const [p,m,pr,prLinks,t,sync]=await Promise.all([
        s.from('projects').select('*').eq('active',true).order('sort_order'),
        s.from('materials').select('*').order('project_id').order('source_row'),
        s.from('procurement_items').select('*').order('source_updated_at',{ascending:false}).order('source_row'),
        s.from('procurement_item_projects').select('procurement_item_id,project_id'),
        s.from('tool_machine').select('*').order('item_no'),
        s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','materials').order('created_at',{ascending:false}).limit(1).maybeSingle()
      ])
      if(!alive)return
      setProjects((p.data||[]) as Project[])
      setRows(m.data||[])
      setProcurement(pr.data||[])
      setProcurementLinks(prLinks.data||[])
      setTools(t.data||[])
      setLatestSyncAt(sync.data?.created_at||null)
    }
    const queueLoad=()=>{
      if(refreshTimer)window.clearTimeout(refreshTimer)
      refreshTimer=window.setTimeout(()=>{void load()},400)
    }
    void load()
    const channel=s.channel('materials-live-refresh')
      .on('postgres_changes',{event:'*',schema:'public',table:'projects'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'materials'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'procurement_items'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'procurement_item_projects'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'tool_machine'},queueLoad)
      .on('postgres_changes',{event:'*',schema:'public',table:'drive_sync_runs'},queueLoad)
      .subscribe()
    const refresh=()=>queueLoad()
    const refreshWhenVisible=()=>{if(document.visibilityState==='visible')queueLoad()}
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refreshWhenVisible)
    return()=>{
      alive=false
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
    for(const item of procurement){
      const itemId=String(item.id||'')
      const projectId=String(item.project_id||'')
      if(!itemId||!projectId) continue
      const ids=map.get(itemId)||[]
      if(!ids.includes(projectId)) ids.push(projectId)
      map.set(itemId,ids)
    }
    return map
  },[procurementLinks,procurement])
  const procurementPlotText=(item:any)=>{
    const ids=procurementProjectIdsByItem.get(String(item.id))||[]
    return ids.map(id=>projectById.get(id)?.code).filter(Boolean).join(' / ')||'-'
  }
  const needle=q.trim().toLowerCase()

  const filtered=useMemo(()=>rows.filter(x=>{
    const p=projectById.get(x.project_id)
    return (!project||x.project_id===project)&&
      (!orderStatus||x.status===orderStatus)&&
      textSearch([
        p?.code,p?.name,x.data_group,x.source_item_no,x.category,x.item_name,x.status,x.status_detail,
        x.brand,x.model_spec,x.quantity_unit,x.contact_name,x.contact_phone,x.notes
      ],needle)
  }),[rows,project,orderStatus,needle,projectById])

  const filteredProcurement=useMemo(()=>{
    if(!needle&&!project) return []
    return procurement.filter(x=>{
      const relatedIds=procurementProjectIdsByItem.get(String(x.id))||[]
      const related=relatedIds.map(id=>projectById.get(id)).filter(Boolean) as Project[]
      return (!project||relatedIds.includes(project))&&textSearch([
        ...related.flatMap(p=>[p.code,p.name]),x.vendor,x.item_name,x.procurement_status,x.payment_status,x.current_status,
        x.pr_no,x.po_no,x.expected_delivery_text,x.condition_note,x.source_updated_at
      ],needle)
    })
  },[procurement,project,needle,projectById,procurementProjectIdsByItem])

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
    <PageHeader title="วัสดุ เครื่องมือและผู้รับเหมา" subtitle={`ค้นหาวัสดุ งาน ผู้ขาย ผู้รับเหมา หรือเลข PO ได้จากหน้าเดียว • วัสดุ/งาน ${rows.length} รายการ • จัดซื้อ/จัดจ้าง ${procurement.length} รายการ • เครื่องมือ ${tools.length} รายการ`}/>

    <section aria-labelledby="materials-status-title">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'end',flexWrap:'wrap',marginBottom:8}}>
        <div>
          <h2 id="materials-status-title" style={{margin:'0 0 3px'}}>Materials Status</h2>
          <div className="small muted">ค้นหาคำเดียวแล้วตรวจได้ทั้งสถานะวัสดุ รายละเอียดล่าสุด และ PO/ผู้รับเหมาที่เกี่ยวข้อง</div>
        </div>
        <b className="small">แสดง {filtered.length} / {rows.length} รายการ</b>
      </div>
      <div className="panel" style={{padding:8,marginBottom:10}}>
        <div className="toolbar" style={{marginBottom:0,gap:8,flexWrap:'wrap'}}>
          <input
            aria-label="ค้นหาวัสดุ งาน PO ผู้ขาย ผู้รับเหมา รุ่น สถานะ หรือรายละเอียด"
            placeholder="ค้นหาวัสดุ / งาน / PO / ผู้ขาย / ผู้รับเหมา / รุ่น / สถานะ / รายละเอียด"
            value={q}
            onChange={e=>setQ(e.target.value)}
            style={{minWidth:260,padding:'7px 9px',fontSize:12,borderRadius:9}}
          />
          <select value={project} onChange={e=>setProject(e.target.value)} style={{minWidth:130,maxWidth:180,padding:'7px 9px',fontSize:12,borderRadius:9}}><option value="">ทุก Plot</option>{projects.filter(p=>/^AV-P[6-9]$/.test(p.code)).map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>
          <select value={orderStatus} onChange={e=>setOrderStatus(e.target.value)} style={{minWidth:150,maxWidth:190,padding:'7px 9px',fontSize:12,borderRadius:9}}>
            <option value="">ทุกสถานะการสั่งซื้อ</option>
            <option value="สั่งแล้ว">สั่งแล้ว</option>
            <option value="สั่งมาไม่พอ">สั่งมาไม่พอ</option>
            <option value="ยังไม่สั่ง">ยังไม่สั่ง</option>
            <option value="เจ้าของจัดหา">เจ้าของจัดหา</option>
            <option value="ไม่เกี่ยวข้อง">ไม่เกี่ยวข้อง</option>
          </select>
          {(project||orderStatus||q)&&<button type="button" className="button" style={{padding:'7px 10px',fontSize:12,borderRadius:9}} onClick={()=>{setProject('');setOrderStatus('');setQ('')}}>ล้าง</button>}
          <span className="small muted" style={{marginLeft:'auto',whiteSpace:'nowrap'}}>Drive Sync • ล่าสุด {dateTimeTH(latestSyncAt)}</span>
        </div>
      </div>
      <div className="panel table-wrap" style={{maxHeight:560,overflow:'auto'}}>
        <table style={{minWidth:1180}}>
          <thead><tr><th>Plot</th><th>หมวด</th><th>วัสดุ / งาน</th><th>ยี่ห้อ / รุ่น / สเปก</th><th>สถานะ</th><th>รายละเอียดล่าสุด</th><th>ผู้ติดต่อ</th></tr></thead>
          <tbody>{filtered.map(x=>{
            const detail=[x.status_detail,x.notes].filter(Boolean).filter((v:string,i:number,a:string[])=>a.indexOf(v)===i)
            return <tr key={x.id}>
              <td><b>{projectById.get(x.project_id)?.code||'-'}</b></td>
              <td>{x.category||'-'}</td>
              <td><b>{x.item_name}</b><small>{x.quantity_unit||'ยังไม่ระบุปริมาณ/หน่วย'}</small></td>
              <td>{[x.brand,x.model_spec].filter(Boolean).join(' / ')||'-'}</td>
              <td><StatusBadge value={x.status}/></td>
              <td>{detail.length?detail.map((v:string,i:number)=><div key={`${x.id}-d-${i}`} style={{marginBottom:i<detail.length-1?4:0}}>{v}</div>):'-'}</td>
              <td>{x.contact_name||x.contact_phone?<><b>{x.contact_name||'-'}</b><small>{x.contact_phone||''}</small></>:'-'}</td>
            </tr>
          })}</tbody>
        </table>
        {!filtered.length&&<p className="muted" style={{padding:16}}>ไม่พบวัสดุ/งานตามคำค้นหรือ Filter ที่เลือก</p>}
      </div>
    </section>

    {(needle||project)&&<section aria-labelledby="material-procurement-title" style={{marginTop:24}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'end',flexWrap:'wrap',marginBottom:10}}>
        <div>
          <h2 id="material-procurement-title" style={{margin:'0 0 3px'}}>PO / จัดซื้อจัดจ้างที่เกี่ยวข้อง</h2>
          <div className="small muted">ใช้คำค้นและ Plot เดียวกับด้านบน เพื่อดูว่า PO เซ็นแล้วหรือยัง ติดขั้นตอนไหน และต้องตามอะไรต่อ</div>
        </div>
        <b className="small">พบ {filteredProcurement.length} รายการ</b>
      </div>
      <div className="panel table-wrap" style={{maxHeight:430,overflow:'auto'}}>
        <table style={{minWidth:1320}}>
          <thead><tr><th>Plot</th><th>PO / PR</th><th>ผู้ขาย / ผู้รับเหมา</th><th>รายการ</th><th>สถานะ PO / ชำระ</th><th>ขั้นตอนปัจจุบัน</th><th>กำหนดส่ง / เข้าหน้างาน</th><th>รายละเอียด / สิ่งที่ต้องตาม</th><th>อัปเดต</th></tr></thead>
          <tbody>{filteredProcurement.map(x=><tr key={x.id}>
            <td><b>{procurementPlotText(x)}</b></td>
            <td><b>{[x.po_no,x.pr_no].filter(Boolean).join(' / ')||'-'}</b></td>
            <td>{x.vendor||'ยังไม่ระบุ'}</td>
            <td><b>{x.item_name||'-'}</b></td>
            <td>{x.payment_status||x.procurement_status||'-'}</td>
            <td><StatusBadge value={x.current_status}/></td>
            <td><b>{x.expected_delivery_text||'ยังไม่ระบุ'}</b></td>
            <td>{x.condition_note||'-'}</td>
            <td>{dateTH(x.source_updated_at)}</td>
          </tr>)}</tbody>
        </table>
        {!filteredProcurement.length&&<p className="muted" style={{padding:16}}>ไม่พบรายการจัดซื้อ/PO ที่ตรงกับคำค้นนี้</p>}
      </div>
    </section>}

    <section aria-labelledby="tool-machine-title" style={{marginTop:26,paddingTop:4}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'end',flexWrap:'wrap',marginBottom:8}}>
        <div>
          <h2 id="tool-machine-title" style={{margin:'0 0 3px'}}>Tool &amp; Machine</h2>
          <div className="small muted">ทะเบียนเครื่องมือและเครื่องจักรจากชีท 06-Tools &amp; Machine</div>
        </div>
        <b className="small">แสดง {filteredTools.length} / {tools.length} รายการ</b>
      </div>
      <div className="panel" style={{padding:8,marginBottom:10}}>
        <div className="toolbar" style={{marginBottom:0,gap:8,flexWrap:'wrap'}}>
          <input
            aria-label="ค้นหาเครื่องมือและเครื่องจักร"
            placeholder="ค้นหารหัส / เครื่องมือ / ยี่ห้อ / รุ่น / ผู้รับผิดชอบ"
            value={toolQ}
            onChange={e=>setToolQ(e.target.value)}
            style={{minWidth:240,padding:'7px 9px',fontSize:12,borderRadius:9}}
          />
          <select value={toolCategory} onChange={e=>setToolCategory(e.target.value)} style={{minWidth:125,maxWidth:170,padding:'7px 9px',fontSize:12,borderRadius:9}}><option value="">ทุกหมวด</option>{toolCategories.map(v=><option key={v} value={v}>{v}</option>)}</select>
          <select value={toolStatus} onChange={e=>setToolStatus(e.target.value)} style={{minWidth:125,maxWidth:170,padding:'7px 9px',fontSize:12,borderRadius:9}}><option value="">ทุกสถานะ</option>{toolStatuses.map(v=><option key={v} value={v}>{v}</option>)}</select>
          <select value={toolLocation} onChange={e=>setToolLocation(e.target.value)} style={{minWidth:125,maxWidth:180,padding:'7px 9px',fontSize:12,borderRadius:9}}><option value="">ทุกสถานที่</option>{toolLocations.map(v=><option key={v} value={v}>{v}</option>)}</select>
          {(toolQ||toolCategory||toolStatus||toolLocation)&&<button type="button" className="button" style={{padding:'7px 10px',fontSize:12,borderRadius:9}} onClick={()=>{setToolQ('');setToolCategory('');setToolStatus('');setToolLocation('')}}>ล้าง</button>}
          <span className="small muted" style={{marginLeft:'auto',whiteSpace:'nowrap'}}>ข้อมูลทะเบียนจาก Drive Sync</span>
        </div>
      </div>
      <div className="panel table-wrap" style={{maxHeight:600,overflow:'auto'}}><table><thead><tr><th>รหัส</th><th>หมวด</th><th>เครื่องมือ / เครื่องจักร</th><th>ยี่ห้อ / รุ่น</th><th>จำนวน</th><th>สถานะ</th><th>สถานที่ล่าสุด</th><th>ผู้รับผิดชอบ</th><th>วันที่อัปเดต</th><th>หมายเหตุ</th></tr></thead><tbody>{filteredTools.map(x=><tr key={x.id}><td><b>{x.item_code||'-'}</b></td><td>{x.category||'-'}</td><td><b>{x.item_name||'-'}</b></td><td>{[x.brand,x.model_spec].filter(Boolean).join(' / ')||'-'}</td><td>{x.quantity??'-'} {x.unit||''}</td><td><StatusBadge value={x.status}/></td><td>{x.location||'-'}</td><td>{x.responsible_person||'-'}</td><td>{dateTH(x.source_updated_at)}</td><td>{x.notes||'-'}</td></tr>)}</tbody></table></div>
    </section>
  </AppShell>
}
