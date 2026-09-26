'use client'

import { useEffect,useMemo,useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'

type Project={id:string;code:string;name:string}
type Task={id:string;project_id:string;source_task_no:string|null;task_name:string;area:string|null;category:string|null}
type Photo={
  id:string;project_id:string;schedule_task_id:string|null;drive_file_id:string;drive_folder_name:string|null;file_name:string;
  drive_url:string;photo_date:string;phase:string;match_method:string;match_score:number|null;verified_by:string|null;verified_at:string|null;mapping_note:string|null
}
type Filter='unmatched'|'suggested'|'verified'|'all'
type Phase='before'|'during'|'after'|'other'

const PAGE_SIZE=500

function dateTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(`${value}T00:00:00+07:00`)
  if(Number.isNaN(d.getTime()))return value
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric'}).format(d)
}
function dateTimeTH(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value)
  if(Number.isNaN(d.getTime()))return '-'
  return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)
}
function statusOf(p:Photo){
  if(p.verified_at) return 'verified'
  if(p.schedule_task_id) return 'suggested'
  return 'unmatched'
}
function statusLabel(p:Photo){
  if(p.verified_at) return 'ยืนยันแล้ว'
  if(p.schedule_task_id&&p.match_method==='manual') return 'Manual เดิม'
  if(p.schedule_task_id) return 'ระบบจับคู่'
  return 'ยังไม่จับคู่'
}
function phaseLabel(phase:string){
  if(phase==='before')return 'Before / ก่อนทำ'
  if(phase==='during')return 'During / ระหว่างทำ'
  if(phase==='after')return 'After / หลังทำ'
  return 'Other / รูปประกอบ'
}

export default function PhotoMappingPage(){
  const [projects,setProjects]=useState<Project[]>([])
  const [tasks,setTasks]=useState<Task[]>([])
  const [photos,setPhotos]=useState<Photo[]>([])
  const [role,setRole]=useState('')
  const [userId,setUserId]=useState('')
  const [project,setProject]=useState('')
  const [filter,setFilter]=useState<Filter>('unmatched')
  const [q,setQ]=useState('')
  const [selected,setSelected]=useState<Record<string,string>>({})
  const [notes,setNotes]=useState<Record<string,string>>({})
  const [phases,setPhases]=useState<Record<string,Phase>>({})
  const [saving,setSaving]=useState('')
  const [message,setMessage]=useState('')
  const [loadError,setLoadError]=useState('')
  const [loading,setLoading]=useState(true)

  const load=async()=>{
    setLoading(true);setLoadError('')
    const s=getSupabase()
    const p=await s.from('projects').select('id,code,name').eq('active',true).order('sort_order')
    if(p.error)throw p.error
    const projectRows=(p.data||[]) as Project[]
    const villaRows=projectRows.filter(x=>/^AV-P[6-9]$/.test(x.code))
    const villaProjectIds=villaRows.map(x=>x.id)
    if(!villaProjectIds.length)throw new Error('ไม่พบโครงการ AV-P6 ถึง AV-P9')

    const [{data:{user}},t]=await Promise.all([
      s.auth.getUser(),
      s.from('v_schedule_tasks').select('id,project_id,source_task_no,task_name,area,category').in('project_id',villaProjectIds).order('planned_start')
    ])
    if(t.error)throw t.error

    let photoRows:Photo[]=[]
    for(let from=0;;from+=PAGE_SIZE){
      const ph=await s.from('drive_photo_index')
        .select('id,project_id,schedule_task_id,drive_file_id,drive_folder_name,file_name,drive_url,photo_date,phase,match_method,match_score,verified_by,verified_at,mapping_note')
        .eq('is_active',true)
        .in('project_id',villaProjectIds)
        .order('photo_date',{ascending:false})
        .range(from,from+PAGE_SIZE-1)
      if(ph.error)throw ph.error
      const rows=(ph.data||[]) as Photo[]
      photoRows=photoRows.concat(rows)
      if(rows.length<PAGE_SIZE)break
    }

    setUserId(user?.id||'')
    if(user){
      const {data:profile,error:profileError}=await s.from('profiles').select('role').eq('user_id',user.id).maybeSingle()
      if(profileError)throw profileError
      setRole(profile?.role||'')
    }
    setProjects(projectRows)
    setTasks((t.data||[]) as Task[])
    setPhotos(photoRows)
    setLoading(false)
  }

  useEffect(()=>{load().catch(err=>{setLoadError(err instanceof Error?err.message:'โหลดข้อมูลไม่สำเร็จ');setLoading(false)})},[])

  const villaProjects=useMemo(()=>projects.filter(p=>/^AV-P[6-9]$/.test(p.code)),[projects])
  const villaIds=useMemo(()=>new Set(villaProjects.map(p=>p.id)),[villaProjects])
  const editable=role==='manager'||role==='engineer'
  const taskById=useMemo(()=>new Map(tasks.map(t=>[t.id,t])),[tasks])

  const filtered=useMemo(()=>photos.filter(p=>{
    if(!villaIds.has(p.project_id))return false
    if(project&&p.project_id!==project)return false
    if(filter!=='all'&&statusOf(p)!==filter)return false
    if(q){
      const currentTask=p.schedule_task_id?taskById.get(p.schedule_task_id):undefined
      const haystack=`${p.file_name} ${p.drive_folder_name||''} ${currentTask?.task_name||''} ${currentTask?.area||''}`.toLowerCase()
      if(!haystack.includes(q.toLowerCase()))return false
    }
    return true
  }),[photos,villaIds,project,filter,q,taskById])

  const counts=useMemo(()=>{
    const list=photos.filter(p=>villaIds.has(p.project_id))
    return {
      total:list.length,
      unmatched:list.filter(p=>statusOf(p)==='unmatched').length,
      suggested:list.filter(p=>statusOf(p)==='suggested').length,
      verified:list.filter(p=>statusOf(p)==='verified').length,
    }
  },[photos,villaIds])

  const save=async(photo:Photo)=>{
    if(!editable||!userId)return
    const taskId=selected[photo.id]??photo.schedule_task_id??''
    if(!taskId){setMessage(`กรุณาเลือก Task สำหรับ ${photo.file_name}`);return}
    const task=taskById.get(taskId)
    if(!task||task.project_id!==photo.project_id){setMessage('Task ที่เลือกไม่ตรงกับ Plot ของรูป กรุณาเลือกใหม่');return}
    const now=new Date().toISOString()
    const phase=phases[photo.id]??(photo.phase as Phase)||'other'
    setSaving(photo.id);setMessage('')
    const s=getSupabase()
    const {error}=await s.from('drive_photo_index').update({
      schedule_task_id:taskId,
      phase,
      match_method:'manual',
      match_score:1,
      verified_by:userId,
      verified_at:now,
      mapping_note:(notes[photo.id]??photo.mapping_note??'').trim()||null,
      updated_at:now,
    }).eq('id',photo.id)
    if(error){setMessage(`บันทึกไม่สำเร็จ: ${error.message}`);setSaving('');return}
    setPhotos(v=>v.map(x=>x.id===photo.id?{...x,schedule_task_id:taskId,phase,match_method:'manual',match_score:1,verified_by:userId,verified_at:now,mapping_note:(notes[photo.id]??photo.mapping_note??'').trim()||null}:x))
    setSaving('');setMessage(`ยืนยัน ${photo.file_name} → ${task.task_name} แล้ว`)
  }

  const clearMapping=async(photo:Photo)=>{
    if(!editable)return
    setSaving(photo.id);setMessage('')
    const {error}=await getSupabase().from('drive_photo_index').update({schedule_task_id:null,match_method:'unmatched',match_score:null,verified_by:null,verified_at:null,mapping_note:null,updated_at:new Date().toISOString()}).eq('id',photo.id)
    if(error){setMessage(`ล้าง Mapping ไม่สำเร็จ: ${error.message}`);setSaving('');return}
    setPhotos(v=>v.map(x=>x.id===photo.id?{...x,schedule_task_id:null,match_method:'unmatched',match_score:null,verified_by:null,verified_at:null,mapping_note:null}:x))
    setSelected(v=>({...v,[photo.id]:''}));setSaving('');setMessage(`ล้าง Mapping ของ ${photo.file_name} แล้ว`)
  }

  return <AppShell>
    <PageHeader title="Photo Mapping Inbox" subtitle="ตรวจและยืนยัน Picture Progress ให้ตรง Schedule Task — Verified Photo จะถูกใช้ก่อน Auto Match และ fallback ใน Executive Presentation"/>

    {!editable&&<div className="notice" style={{marginBottom:14}}>บัญชีนี้ดู Mapping ได้ แต่การยืนยัน/แก้ไขจำกัดเฉพาะ Manager และ Engineer</div>}
    {message&&<div className="notice" style={{marginBottom:14}}>{message}</div>}
    {loadError&&<div className="notice" style={{marginBottom:14,borderColor:'var(--red)',color:'var(--red)'}}>โหลดข้อมูลไม่สำเร็จ: {loadError} <button className="button" style={{marginLeft:8}} onClick={()=>load().catch(err=>{setLoadError(err instanceof Error?err.message:'โหลดข้อมูลไม่สำเร็จ');setLoading(false)})}>ลองใหม่</button></div>}

    <section className="executive-kpi-grid" style={{marginBottom:14}}>
      <button className="executive-kpi" onClick={()=>setFilter('all')}><span>รูป P6–P9 ทั้งหมด</span><b>{counts.total}</b><small>โหลดครบจาก Photo Index แบบแบ่งหน้า</small></button>
      <button className="executive-kpi danger" onClick={()=>setFilter('unmatched')}><span>ยังไม่จับคู่</span><b>{counts.unmatched}</b><small>ใช้เป็น Plot fallback เท่านั้น</small></button>
      <button className="executive-kpi warn" onClick={()=>setFilter('suggested')}><span>ระบบจับคู่ / Manual เดิม</span><b>{counts.suggested}</b><small>ควรตรวจยืนยัน</small></button>
      <button className="executive-kpi" onClick={()=>setFilter('verified')}><span>ยืนยันแล้ว</span><b>{counts.verified}</b><small>Verified task evidence</small></button>
    </section>

    <section className="panel" style={{position:'sticky',top:0,zIndex:20,marginBottom:14}}>
      <div className="toolbar">
        <select value={project} onChange={e=>setProject(e.target.value)}><option value="">P6–P9 ทั้งหมด</option>{villaProjects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select>
        <select value={filter} onChange={e=>setFilter(e.target.value as Filter)}><option value="unmatched">ยังไม่จับคู่</option><option value="suggested">ระบบจับคู่ / Manual เดิม</option><option value="verified">ยืนยันแล้ว</option><option value="all">ทั้งหมด</option></select>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหารูป / โฟลเดอร์ / Task / Area"/>
        <span className="small muted">แสดง {filtered.length} / {counts.total} รูป</span>
      </div>
    </section>

    {loading?<div className="panel">กำลังโหลด Photo Index ทั้งหมดและ Schedule…</div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:12}}>
      {filtered.map(photo=>{
        const p=projects.find(x=>x.id===photo.project_id)
        const taskList=tasks.filter(t=>t.project_id===photo.project_id&&t.source_task_no!=='1')
        const currentTask=photo.schedule_task_id?taskById.get(photo.schedule_task_id):undefined
        const selectedTask=selected[photo.id]??photo.schedule_task_id??''
        const selectedPhase=phases[photo.id]??((photo.phase||'other') as Phase)
        const status=statusOf(photo)
        return <article className="panel" key={photo.id} style={{padding:0,overflow:'hidden'}}>
          <div style={{height:210,background:'#edf1f4',display:'grid',placeItems:'center',overflow:'hidden'}}>
            <img src={`/api/drive-photo?fileId=${encodeURIComponent(photo.drive_file_id)}`} alt={photo.file_name} loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
          </div>
          <div style={{padding:12}}>
            <div className="row between" style={{gap:8,alignItems:'flex-start'}}><div style={{minWidth:0}}><b style={{display:'block',wordBreak:'break-word'}}>{photo.file_name}</b><small className="muted">{p?.code||'-'} • {dateTH(photo.photo_date)} • {photo.drive_folder_name||'-'}</small></div><span className={`badge ${status==='verified'?'success':status==='suggested'?'warning':'danger'}`}>{statusLabel(photo)}</span></div>
            {currentTask&&<p className="small" style={{margin:'10px 0 6px'}}><b>Mapping ปัจจุบัน:</b> {currentTask.task_name}{currentTask.area?` — ${currentTask.area}`:''}{photo.match_score!==null?` • ${Math.round(Number(photo.match_score)*100)}%`:''}</p>}
            <p className="small muted" style={{margin:'0 0 8px'}}>Phase: {phaseLabel(photo.phase)}{photo.verified_at?` • Verified ${dateTimeTH(photo.verified_at)}`:''}</p>
            <label className="small" style={{display:'block',fontWeight:800}}>Schedule Task
              <select disabled={!editable||saving===photo.id} value={selectedTask} onChange={e=>setSelected(v=>({...v,[photo.id]:e.target.value}))} style={{width:'100%',marginTop:5}}>
                <option value="">-- เลือก Task --</option>
                {taskList.map(t=><option key={t.id} value={t.id}>{t.source_task_no||'-'}. {t.task_name}{t.area?` — ${t.area}`:''}</option>)}
              </select>
            </label>
            <label className="small" style={{display:'block',fontWeight:800,marginTop:8}}>Photo Phase
              <select disabled={!editable||saving===photo.id} value={selectedPhase} onChange={e=>setPhases(v=>({...v,[photo.id]:e.target.value as Phase}))} style={{width:'100%',marginTop:5}}>
                <option value="before">Before / ก่อนทำ</option><option value="during">During / ระหว่างทำ</option><option value="after">After / หลังทำ</option><option value="other">Other / รูปประกอบ</option>
              </select>
            </label>
            <label className="small" style={{display:'block',fontWeight:800,marginTop:8}}>หมายเหตุ Mapping
              <input disabled={!editable||saving===photo.id} value={notes[photo.id]??photo.mapping_note??''} onChange={e=>setNotes(v=>({...v,[photo.id]:e.target.value}))} placeholder="เช่น ยืนยันงานฝ้าชั้น 2 หลังปิดแผ่น" style={{width:'100%',marginTop:5}}/>
            </label>
            <div className="row" style={{marginTop:10,flexWrap:'wrap'}}>
              <button className="button primary" disabled={!editable||!selectedTask||saving===photo.id} onClick={()=>save(photo)}>{saving===photo.id?'กำลังบันทึก…':'ยืนยัน Mapping'}</button>
              {(photo.schedule_task_id||photo.verified_at)&&<button className="button" disabled={!editable||saving===photo.id} onClick={()=>clearMapping(photo)}>ล้าง Mapping</button>}
              <a className="button" href={photo.drive_url} target="_blank" rel="noreferrer">เปิดใน Drive ↗</a>
            </div>
          </div>
        </article>
      })}
      {!filtered.length&&!loading&&<div className="panel"><p className="muted">ไม่พบรูปตามตัวกรองนี้</p></div>}
    </div>}
  </AppShell>
}
