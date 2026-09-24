'use client'

import Link from 'next/link'
import { useEffect,useMemo,useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { Project } from '@/lib/types'

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

  return <section className="panel dashboard-module" style={{marginBottom:18}}>
    <div className="module-title">
      <span style={{fontSize:10}}>7B</span>
      <div><b>MATERIALS STATUS</b><small>สรุปสถานะวัสดุราย Plot — เรียงจากรายการ “ยังไม่สั่ง” มากไปน้อย</small></div>
      <Link href="/materials">เปิด Materials →</Link>
    </div>
    <div style={{padding:'9px 14px',borderBottom:'1px solid var(--line)',fontSize:11,color:'var(--muted)',display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
      <span><b style={{color:'var(--text)'}}>อัปเดตข้อมูลล่าสุด:</b> {dateTimeTH(latestSyncAt)}</span>
      <span>กดตัวเลขของแต่ละ Plot เพื่อเปิดรายการที่กรองไว้แล้ว</span>
    </div>
    {loading?<p className="muted" style={{padding:14}}>กำลังโหลด Materials Status…</p>:<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8,padding:12}}>
        <div style={{background:'#eef8f2',border:'1px solid #cfe8d8',borderRadius:11,padding:10}}><span style={{fontSize:10,color:'var(--muted)',fontWeight:800}}>✓ สั่งแล้ว</span><b style={{display:'block',fontSize:22,color:'var(--green)',margin:'4px 0'}}>{totals.ordered}</b><small style={{fontSize:9,color:'var(--muted)'}}>จาก {totals.total} รายการ</small></div>
        <div style={{background:'var(--red-soft)',border:'1px solid #efcfcc',borderRadius:11,padding:10}}><span style={{fontSize:10,color:'var(--muted)',fontWeight:800}}>! ยังไม่สั่ง</span><b style={{display:'block',fontSize:22,color:'var(--red)',margin:'4px 0'}}>{totals.pending}</b><small style={{fontSize:9,color:'var(--muted)'}}>ควรตามการสั่งซื้อ</small></div>
        <div style={{background:'var(--amber-soft)',border:'1px solid #eedda8',borderRadius:11,padding:10}}><span style={{fontSize:10,color:'var(--muted)',fontWeight:800}}>ต้องติดตามเพิ่ม</span><b style={{display:'block',fontSize:22,color:'var(--amber)',margin:'4px 0'}}>{totals.followup}</b><small style={{fontSize:9,color:'var(--muted)'}}>สั่งมาไม่พอ / ต้องติดตาม</small></div>
        <div style={{background:'#f3f7fb',border:'1px solid #dfe8f0',borderRadius:11,padding:10}}><span style={{fontSize:10,color:'var(--muted)',fontWeight:800}}>สถานะอื่น</span><b style={{display:'block',fontSize:22,color:'#1f5e99',margin:'4px 0'}}>{totals.other}</b><small style={{fontSize:9,color:'var(--muted)'}}>เจ้าของจัดหา / ไม่เกี่ยวข้อง / อื่น ๆ</small></div>
      </div>
      <div style={{padding:'0 12px 13px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10}}>
        {stats.map((x,index)=>{
          const orderedPct=x.total?Math.round(x.ordered/x.total*100):0
          const pendingPct=x.total?Math.round(x.pending/x.total*100):0
          const followupPct=x.total?Math.round(x.followup/x.total*100):0
          const restPct=Math.max(0,100-orderedPct-pendingPct-followupPct)
          return <div key={x.project.id} style={{border:'1px solid var(--line)',borderRadius:13,padding:12,background:index===0&&x.pending>0?'#fff8f7':'var(--surface-2)'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start'}}>
              <Link href={`/materials?project=${encodeURIComponent(x.project.id)}`} style={{minWidth:0}}>
                <b style={{display:'block',color:'var(--navy-2)',fontSize:13}}>{x.project.code}</b>
                <small style={{display:'block',color:'var(--muted)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{x.project.name}</small>
              </Link>
              {index===0&&x.pending>0&&<span style={{fontSize:9,fontWeight:900,color:'var(--red)',background:'var(--red-soft)',borderRadius:999,padding:'4px 7px',whiteSpace:'nowrap'}}>รอสั่งมากสุด</span>}
            </div>
            <div title={`สั่งแล้ว ${x.ordered} • ยังไม่สั่ง ${x.pending} • ต้องตาม ${x.followup} • อื่น ${x.other}`} style={{display:'flex',height:10,borderRadius:999,overflow:'hidden',background:'#e7e9ec',margin:'11px 0 9px'}}>
              {orderedPct>0&&<i style={{width:`${orderedPct}%`,background:'var(--green)'}}/>}
              {pendingPct>0&&<i style={{width:`${pendingPct}%`,background:'var(--red)'}}/>}
              {followupPct>0&&<i style={{width:`${followupPct}%`,background:'var(--amber)'}}/>}
              {restPct>0&&<i style={{width:`${restPct}%`,background:'#adb5bd'}}/>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
              <Link href={`/materials?project=${encodeURIComponent(x.project.id)}&status=${encodeURIComponent('สั่งแล้ว')}`} style={{border:'1px solid #cfe8d8',background:'#eef8f2',borderRadius:9,padding:'8px 9px'}}><small style={{display:'block',color:'#54705d'}}>สั่งแล้ว</small><b style={{display:'block',fontSize:20,color:'var(--green)'}}>{x.ordered}</b></Link>
              <Link href={`/materials?project=${encodeURIComponent(x.project.id)}&status=${encodeURIComponent('ยังไม่สั่ง')}`} style={{border:'1px solid #efcfcc',background:'var(--red-soft)',borderRadius:9,padding:'8px 9px'}}><small style={{display:'block',color:'#8c5853'}}>ยังไม่สั่ง</small><b style={{display:'block',fontSize:20,color:'var(--red)'}}>{x.pending}</b></Link>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:8,fontSize:9,color:'var(--muted)'}}><span>ต้องตามเพิ่ม <b style={{color:'var(--amber)'}}>{x.followup}</b></span><span>อื่น ๆ <b>{x.other}</b></span><span>รวม <b>{x.total}</b></span></div>
          </div>
        })}
        {!stats.length&&<p className="muted">ยังไม่มีข้อมูล Materials Status</p>}
      </div>
    </>}
  </section>
}
