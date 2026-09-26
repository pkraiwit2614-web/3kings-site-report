'use client'

import Link from 'next/link'
import { useEffect,useMemo,useState } from 'react'
import { createPortal } from 'react-dom'
import { getSupabase } from '@/lib/supabase'
import type { Project } from '@/lib/types'
import DashboardCondoDefectSummary from '@/components/DashboardCondoDefectSummary'

function dateTimeTH(value:string|null|undefined){
  if(!value) return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)
}

export default function DashboardMaterialsStatus(){
  const [projects,setProjects]=useState<Project[]>([])
  const [rows,setRows]=useState<any[]>([])
  const [latestSyncAt,setLatestSyncAt]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const [portalTarget,setPortalTarget]=useState<HTMLElement|null>(null)

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      const s=getSupabase()
      const [p,m,sync]=await Promise.all([
        s.from('projects').select('id,code,name,active,sort_order').eq('active',true).order('sort_order'),
        s.from('materials').select('id,project_id,status'),
        s.from('drive_sync_runs').select('created_at').eq('status','success').eq('sync_type','materials').order('created_at',{ascending:false}).limit(1).maybeSingle(),
      ])
      if(cancelled) return
      setProjects((p.data||[]) as Project[])
      setRows(m.data||[])
      setLatestSyncAt(sync.data?.created_at||null)
      setLoading(false)
    }
    load().catch(()=>setLoading(false))
    return()=>{cancelled=true}
  },[])

  useEffect(()=>{
    const anchor=document.getElementById('management-followup')
    if(!anchor)return
    const existing=document.getElementById('condo-defect-dashboard-slot')
    if(existing){setPortalTarget(existing);return}
    const slot=document.createElement('div')
    slot.id='condo-defect-dashboard-slot'
    anchor.insertAdjacentElement('afterend',slot)
    setPortalTarget(slot)
    return()=>{slot.remove()}
  },[])

  const stats=useMemo(()=>projects.flatMap(p=>{
    const list=rows.filter(x=>x.project_id===p.id)
    if(!list.length) return []
    const ordered=list.filter(x=>x.status==='สั่งแล้ว').length
    const pending=list.filter(x=>x.status==='ยังไม่สั่ง').length
    const followup=list.filter(x=>['สั่งมาไม่พอ','ต้องติดตาม','รอตรวจสอบ'].includes(`${x.status||''}`)).length
    const other=Math.max(0,list.length-ordered-pending-followup)
    return [{project:p,total:list.length,ordered,pending,followup,other}]
  }).sort((a,b)=>b.pending-a.pending||b.followup-a.followup),[projects,rows])

  const totals=useMemo(()=>stats.reduce((a,x)=>({total:a.total+x.total,ordered:a.ordered+x.ordered,pending:a.pending+x.pending,followup:a.followup+x.followup,other:a.other+x.other}),{total:0,ordered:0,pending:0,followup:0,other:0}),[stats])

  return <>
    <section className="panel dashboard-module materials-summary" style={{marginBottom:18}}>
      <div className="module-title">
        <span>7B</span>
        <div><b>MATERIALS STATUS</b><small>ภาพรวมสถานะวัสดุราย Plot และรายการที่ต้องติดตาม</small></div>
        <Link href="/materials">เปิด Materials →</Link>
      </div>
      <div className="materials-meta">
        <span><b>อัปเดตล่าสุด</b> {dateTimeTH(latestSyncAt)}</span>
        <span>กดสถานะเพื่อเปิดรายการที่กรองไว้แล้ว</span>
      </div>
      {loading?<p className="muted" style={{padding:14}}>กำลังโหลด Materials Status…</p>:<>
        <div className="materials-kpis">
          <div className="good"><span>สั่งแล้ว</span><b>{totals.ordered}</b><small>จาก {totals.total} รายการ</small></div>
          <div className="danger"><span>ยังไม่สั่ง</span><b>{totals.pending}</b><small>ต้องติดตามการสั่งซื้อ</small></div>
          <div className="warn"><span>ต้องติดตามเพิ่ม</span><b>{totals.followup}</b><small>สั่งมาไม่พอ / รอตรวจสอบ</small></div>
          <div className="neutral"><span>สถานะอื่น</span><b>{totals.other}</b><small>เจ้าของจัดหา / ไม่เกี่ยวข้อง / อื่น ๆ</small></div>
        </div>
        <div className="materials-plots">
          {stats.map((x,index)=>{
            const orderedPct=x.total?Math.round(x.ordered/x.total*100):0
            const pendingPct=x.total?Math.round(x.pending/x.total*100):0
            const followupPct=x.total?Math.round(x.followup/x.total*100):0
            const restPct=Math.max(0,100-orderedPct-pendingPct-followupPct)
            return <div key={x.project.id} className={index===0&&x.pending>0?'plot-card attention':'plot-card'}>
              <div className="plot-head">
                <Link href={`/materials?project=${encodeURIComponent(x.project.id)}`}><b>{x.project.code}</b><small>{x.project.name}</small></Link>
                {index===0&&x.pending>0&&<span>รอสั่งมากสุด</span>}
              </div>
              <div className="material-bar" title={`สั่งแล้ว ${x.ordered} • ยังไม่สั่ง ${x.pending} • ต้องตาม ${x.followup} • อื่น ${x.other}`}>
                {orderedPct>0&&<i style={{width:`${orderedPct}%`,background:'var(--green)'}}/>}
                {pendingPct>0&&<i style={{width:`${pendingPct}%`,background:'var(--red)'}}/>}
                {followupPct>0&&<i style={{width:`${followupPct}%`,background:'var(--amber)'}}/>}
                {restPct>0&&<i style={{width:`${restPct}%`,background:'#adb5bd'}}/>}
              </div>
              <div className="plot-status-grid">
                <Link href={`/materials?project=${encodeURIComponent(x.project.id)}&status=${encodeURIComponent('สั่งแล้ว')}`} className="good"><span>สั่งแล้ว</span><b>{x.ordered}</b></Link>
                <Link href={`/materials?project=${encodeURIComponent(x.project.id)}&status=${encodeURIComponent('ยังไม่สั่ง')}`} className="danger"><span>ยังไม่สั่ง</span><b>{x.pending}</b></Link>
              </div>
              <div className="plot-foot"><span>ต้องตาม <b>{x.followup}</b></span><span>อื่น ๆ <b>{x.other}</b></span><span>รวม <b>{x.total}</b></span></div>
            </div>
          })}
          {!stats.length&&<p className="muted">ยังไม่มีข้อมูล Materials Status</p>}
        </div>
      </>}
      <style jsx>{`
        .materials-meta{padding:10px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:10.5px;color:var(--muted)}
        .materials-meta b{color:var(--text);font-weight:700;margin-right:4px}
        .materials-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:12px}
        .materials-kpis>div{border:1px solid var(--line);border-radius:12px;padding:11px 12px;background:var(--surface-2)}
        .materials-kpis span{display:block;font-size:10px;font-weight:700;color:var(--muted)}
        .materials-kpis b{display:block;margin:4px 0 3px;font-size:24px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums;color:var(--navy)}
        .materials-kpis small{font-size:9.5px;line-height:1.35;color:var(--muted)}
        .materials-kpis .good{background:#f4faf6;border-color:#d3e8da}.materials-kpis .danger{background:#fff7f6;border-color:#efcfcc}.materials-kpis .warn{background:#fffaf0;border-color:#eedda8}.materials-kpis .neutral{background:#f5f7f9;border-color:#dfe5eb}
        .materials-plots{padding:0 12px 13px;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
        .plot-card{border:1px solid var(--line);border-radius:13px;padding:12px;background:var(--surface-2)}.plot-card.attention{background:#fff9f7;border-color:#efd7d2}
        .plot-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.plot-head a{min-width:0}.plot-head a>b{display:block;color:var(--navy-2);font-size:13px;font-weight:800}.plot-head a>small{display:block;margin-top:3px;color:var(--muted);font-size:9.5px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.plot-head>span{font-size:8.5px;font-weight:800;color:var(--red);background:var(--red-soft);border-radius:999px;padding:4px 7px;white-space:nowrap}
        .material-bar{display:flex;height:9px;border-radius:999px;overflow:hidden;background:#e7e9ec;margin:11px 0 9px}.material-bar i{display:block;height:100%}
        .plot-status-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.plot-status-grid a{border:1px solid var(--line);border-radius:9px;padding:8px 9px}.plot-status-grid span{display:block;font-size:9.5px;color:var(--muted)}.plot-status-grid b{display:block;margin-top:2px;font-size:19px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums}.plot-status-grid .good{background:#eef8f2;border-color:#cfe8d8}.plot-status-grid .good b{color:var(--green)}.plot-status-grid .danger{background:var(--red-soft);border-color:#efcfcc}.plot-status-grid .danger b{color:var(--red)}
        .plot-foot{display:flex;justify-content:space-between;gap:8px;margin-top:9px;font-size:9px;color:var(--muted)}.plot-foot b{font-weight:800;color:var(--text);font-variant-numeric:tabular-nums}
        @media(max-width:900px){.materials-kpis{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:560px){.materials-kpis{grid-template-columns:1fr 1fr;gap:7px}.materials-meta{display:grid}.materials-plots{grid-template-columns:1fr}}
      `}</style>
    </section>
    {portalTarget&&createPortal(<DashboardCondoDefectSummary/>,portalTarget)}
  </>
}
