'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import { requireSuccessfulReads } from '@/lib/liveLoader'
import { dateTH } from '@/lib/format'
import type { Project } from '@/lib/types'

type SiteEntry={id:string;work_date:string;source_row:number;project_name_raw:string|null;area_raw:string|null;supervisor_raw:string|null;male_count:number|null;female_count:number|null;total_manpower:number|null;work_detail:string|null;status_text:string|null;next_plan:string|null;afternoon_detail:string|null;specific_area:string|null;supervisor_worker_id:string|null}
type Batch={id:string;site_operations_entry_id:string;work_date:string;expected_headcount:number|null;supervisor_worker_id:string|null;supervisor_raw:string|null;home_team:string|null;verification_status:string;verified_by:string|null;verified_at:string|null;note:string|null}
type Worker={worker_id:string;full_name:string;nickname:string|null;default_team:string|null;status:string|null;display_label:string|null}
type EntryProject={entry_id:string;project_id:string}
type Assignment={id:string;batch_id:string;worker_id:string;work_date:string;project_id:string|null;home_team:string|null;working_team:string|null;movement_status:string;allocation_hours:number|null;allocation_share:number|null;work_detail:string|null;notes:string|null;verified_at:string|null}
type DraftAssignment={worker_id:string;project_id:string;working_team:string;movement_status:string;allocation_hours:string;notes:string}

function addDays(value:string,days:number){
  const d=new Date(value+'T12:00:00Z')
  if(Number.isNaN(d.getTime()))return value
  d.setUTCDate(d.getUTCDate()+days)
  return d.toISOString().slice(0,10)
}
function bangkokToday(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const get=(type:string)=>parts.find(x=>x.type===type)?.value||''
  return get('year')+'-'+get('month')+'-'+get('day')
}
function latestUsableDate(rows:SiteEntry[]){
  const today=bangkokToday()
  return rows.map(x=>x.work_date).filter(x=>x<=today).sort((a,b)=>b.localeCompare(a))[0]||rows[0]?.work_date||''
}
function movementLabel(value:string){
  const map:Record<string,string>={same_team:'ทีมเดิม',borrowed:'ย้าย/ถูกยืมไปช่วยทีมอื่น',returned:'กลับทีมเดิม',other:'อื่น ๆ'}
  return map[value]||value
}
function statusLabel(value:string){
  const map:Record<string,string>={pending:'รอยืนยัน',verified:'ยืนยันแล้ว',needs_review:'ต้องตรวจข้อมูล'}
  return map[value]||value
}

export default function LabourVerificationPage(){
  const [loading,setLoading]=useState(true)
  const [loadError,setLoadError]=useState(false)
  const [role,setRole]=useState('viewer')
  const [entries,setEntries]=useState<SiteEntry[]>([])
  const [batches,setBatches]=useState<Batch[]>([])
  const [workers,setWorkers]=useState<Worker[]>([])
  const [projects,setProjects]=useState<Project[]>([])
  const [entryProjects,setEntryProjects]=useState<EntryProject[]>([])
  const [assignments,setAssignments]=useState<Assignment[]>([])
  const [selectedDate,setSelectedDate]=useState('')
  const [statusFilter,setStatusFilter]=useState('')
  const [q,setQ]=useState('')
  const [mode,setMode]=useState<'verify'|'report'>('verify')
  const [dateFrom,setDateFrom]=useState('')
  const [dateTo,setDateTo]=useState('')
  const [workerFilter,setWorkerFilter]=useState('')
  const [drafts,setDrafts]=useState<Record<string,DraftAssignment[]>>({})
  const [notes,setNotes]=useState<Record<string,string>>({})
  const [addWorker,setAddWorker]=useState<Record<string,string>>({})
  const [supervisorPick,setSupervisorPick]=useState<Record<string,string>>({})
  const [saving,setSaving]=useState<Record<string,boolean>>({})
  const [message,setMessage]=useState('')
  const [refreshTick,setRefreshTick]=useState(0)
  const [focusEntry,setFocusEntry]=useState('')

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search)
    const d=params.get('date')||''
    const entry=params.get('entry')||''
    if(d)setSelectedDate(d)
    if(entry)setFocusEntry(entry)
  },[])

  useEffect(()=>{
    let alive=true
    const load=async()=>{
      const s=getSupabase()
      const userResult=await s.auth.getUser()
      const user=userResult.data.user
      const [e,b,w,p,ep,a,profile]=await Promise.all([
        s.from('site_operations_entries').select('id,work_date,source_row,project_name_raw,area_raw,supervisor_raw,male_count,female_count,total_manpower,work_detail,status_text,next_plan,afternoon_detail,specific_area,supervisor_worker_id').order('work_date',{ascending:false}).order('source_row',{ascending:false}).limit(1500),
        s.from('labour_verification_batches').select('*').order('work_date',{ascending:false}),
        s.from('labour_workers').select('worker_id,full_name,nickname,default_team,status,display_label').order('worker_id'),
        s.from('projects').select('id,code,name,site_group,target_handover,active,sort_order').order('sort_order'),
        s.from('site_operations_entry_projects').select('entry_id,project_id'),
        s.from('labour_daily_assignments').select('*').order('work_date',{ascending:false}),
        user?s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle():Promise.resolve({data:null,error:null})
      ])
      requireSuccessfulReads([e,b,w,p,ep,a])
      if(profile.error)throw profile.error
      if(!alive)return
      const nextEntries=(e.data||[]) as SiteEntry[]
      setEntries(nextEntries);setBatches((b.data||[]) as Batch[]);setWorkers((w.data||[]) as Worker[])
      setProjects((p.data||[]) as Project[]);setEntryProjects((ep.data||[]) as EntryProject[]);setAssignments((a.data||[]) as Assignment[])
      setRole(String(profile.data?.role||'viewer'))
      const latest=latestUsableDate(nextEntries)
      setSelectedDate(v=>v||latest)
      setDateTo(v=>v||latest)
      setDateFrom(v=>v||(latest?addDays(latest,-6):''))
      setLoadError(false)
    }
    setLoading(true)
    load().catch(()=>{if(alive)setLoadError(true)}).finally(()=>{if(alive)setLoading(false)})
    return()=>{alive=false}
  },[refreshTick])

  const canVerify=role==='manager'||role==='engineer'
  const entryById=useMemo(()=>new Map(entries.map(x=>[x.id,x])),[entries])
  const workerById=useMemo(()=>new Map(workers.map(x=>[x.worker_id,x])),[workers])
  const projectById=useMemo(()=>new Map(projects.map(x=>[x.id,x])),[projects])
  const projectIdsByEntry=useMemo(()=>{
    const map=new Map<string,string[]>()
    for(const link of entryProjects){const list=map.get(link.entry_id)||[];if(!list.includes(link.project_id))list.push(link.project_id);map.set(link.entry_id,list)}
    return map
  },[entryProjects])
  const assignmentsByBatch=useMemo(()=>{
    const map=new Map<string,Assignment[]>()
    for(const row of assignments){const list=map.get(row.batch_id)||[];list.push(row);map.set(row.batch_id,list)}
    return map
  },[assignments])
  const availableDates=useMemo(()=>Array.from(new Set(batches.map(x=>x.work_date))).sort((a,b)=>b.localeCompare(a)),[batches])
  const teamOptions=useMemo(()=>Array.from(new Set(workers.map(x=>x.default_team).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b,'th')),[workers])
  const activeWorkers=useMemo(()=>workers.filter(x=>String(x.status||'').toLowerCase()!=='inactive'),[workers])

  const visibleBatches=useMemo(()=>{
    const needle=q.trim().toLowerCase()
    return batches.filter(batch=>{
      if(selectedDate&&batch.work_date!==selectedDate)return false
      if(statusFilter&&batch.verification_status!==statusFilter)return false
      if(focusEntry&&batch.site_operations_entry_id!==focusEntry)return false
      if(!needle)return true
      const entry=entryById.get(batch.site_operations_entry_id)
      return [batch.supervisor_raw,batch.home_team,entry?.area_raw,entry?.project_name_raw,entry?.work_detail].join(' ').toLowerCase().includes(needle)
    })
  },[batches,selectedDate,statusFilter,focusEntry,q,entryById])

  const draftFor=(batch:Batch)=>drafts[batch.id]||[]
  const updateDraft=(batchId:string,index:number,patch:Partial<DraftAssignment>)=>{
    setDrafts(prev=>({...prev,[batchId]:(prev[batchId]||[]).map((x,i)=>i===index?{...x,...patch}:x)}))
  }
  const loadExisting=(batch:Batch)=>{
    const rows=assignmentsByBatch.get(batch.id)||[]
    setDrafts(prev=>({...prev,[batch.id]:rows.map(x=>({
      worker_id:x.worker_id,project_id:x.project_id||'',working_team:x.working_team||x.home_team||'',
      movement_status:x.movement_status||'same_team',allocation_hours:x.allocation_hours===null?'':String(x.allocation_hours),notes:x.notes||''
    }))}))
    setNotes(prev=>({...prev,[batch.id]:batch.note||''}))
  }
  const useHomeTeam=(batch:Batch)=>{
    const candidates=activeWorkers.filter(w=>batch.home_team&&w.default_team===batch.home_team)
    const pids=projectIdsByEntry.get(batch.site_operations_entry_id)||[]
    const defaultProject=pids.length===1?pids[0]:''
    setDrafts(prev=>({...prev,[batch.id]:candidates.map(w=>({
      worker_id:w.worker_id,project_id:defaultProject,working_team:batch.home_team||w.default_team||'',
      movement_status:'same_team',allocation_hours:'',notes:''
    }))}))
  }
  const addOneWorker=(batch:Batch)=>{
    const workerId=addWorker[batch.id]||''
    if(!workerId)return
    const worker=workerById.get(workerId)
    const existing=draftFor(batch)
    if(existing.some(x=>x.worker_id===workerId)){setMessage('คนงานคนนี้อยู่ในรายการแล้ว');return}
    const pids=projectIdsByEntry.get(batch.site_operations_entry_id)||[]
    setDrafts(prev=>({...prev,[batch.id]:[...existing,{
      worker_id:workerId,project_id:pids.length===1?pids[0]:'',working_team:worker?.default_team||batch.home_team||'',
      movement_status:worker?.default_team===batch.home_team?'same_team':'borrowed',allocation_hours:'',notes:''
    }]}))
    setAddWorker(prev=>({...prev,[batch.id]:''}))
  }
  const removeDraft=(batchId:string,index:number)=>setDrafts(prev=>({...prev,[batchId]:(prev[batchId]||[]).filter((_,i)=>i!==index)}))

  const confirmSupervisor=async(batch:Batch)=>{
    const workerId=supervisorPick[batch.id]||''
    if(!canVerify||!workerId||saving[batch.id])return
    setSaving(prev=>({...prev,[batch.id]:true}));setMessage('')
    try{
      const {error}=await getSupabase().rpc('labour_confirm_supervisor_mapping',{p_batch_id:batch.id,p_worker_id:workerId})
      if(error)throw error
      setMessage('ยืนยันหัวหน้าทีมและบันทึก alias แล้ว • ชื่อนี้จะใช้ mapping เดิมในรอบถัดไป')
      setRefreshTick(v=>v+1)
    }catch(err:any){setMessage(String(err?.message||'ยืนยันหัวหน้าทีมไม่สำเร็จ'))}
    finally{setSaving(prev=>({...prev,[batch.id]:false}))}
  }

  const saveBatch=async(batch:Batch)=>{
    if(!canVerify||saving[batch.id])return
    const rows=draftFor(batch)
    if((batch.expected_headcount||0)>0&&!rows.length){setMessage('กรุณาเลือกคนงานก่อนยืนยัน');return}
    setSaving(prev=>({...prev,[batch.id]:true}));setMessage('')
    try{
      const payload=rows.map(x=>({
        worker_id:x.worker_id,
        project_id:x.project_id||null,
        working_team:x.working_team||null,
        movement_status:x.movement_status||'same_team',
        allocation_hours:x.allocation_hours===''?null:Number(x.allocation_hours),
        allocation_share:null,
        notes:x.notes||null
      }))
      const {data,error}=await getSupabase().rpc('labour_verify_batch',{
        p_batch_id:batch.id,p_note:notes[batch.id]||'',p_assignments:payload
      })
      if(error)throw error
      setMessage('ยืนยันทีมคนงานแล้ว '+String(data||rows.length)+' คน • เก็บเป็น Verified Labour Dataset')
      setRefreshTick(v=>v+1)
    }catch(err:any){
      const raw=String(err?.message||'ยืนยันไม่สำเร็จ')
      if(raw.includes('HEADCOUNT_MISMATCH'))setMessage('จำนวนคนที่เลือกไม่ตรงกับ Headcount ใน Daily Report — หากข้อมูลต้นทางมีข้อยกเว้น ให้ใส่หมายเหตุแล้วกดยืนยันอีกครั้ง')
      else setMessage(raw)
    }finally{setSaving(prev=>({...prev,[batch.id]:false}))}
  }

  const reportRows=useMemo(()=>assignments.filter(row=>
    (!dateFrom||row.work_date>=dateFrom)&&(!dateTo||row.work_date<=dateTo)&&(!workerFilter||row.worker_id===workerFilter)
  ),[assignments,dateFrom,dateTo,workerFilter])
  const reportByWorker=useMemo(()=>{
    const map=new Map<string,Assignment[]>()
    for(const row of reportRows){const list=map.get(row.worker_id)||[];list.push(row);map.set(row.worker_id,list)}
    return Array.from(map.entries()).sort((a,b)=>(workerById.get(a[0])?.display_label||a[0]).localeCompare(workerById.get(b[0])?.display_label||b[0],'th'))
  },[reportRows,workerById])

  return <AppShell>
    {loadError&&<div className="panel" role="alert" style={{marginBottom:10}}>โหลด Labour Verification ไม่สำเร็จ กรุณาลองใหม่ <button type="button" className="button" onClick={()=>setRefreshTick(v=>v+1)}>ลองใหม่</button></div>}
    <PageHeader title="Labour Verification" subtitle="ยืนยันรายชื่อคนงานและการย้ายทีมจาก Daily Report ก่อนบันทึกเป็น Verified Labour Dataset • ไม่ต้องกรอกงานซ้ำ" action={<div className="labour-mode"><button type="button" className={mode==='verify'?'active':''} onClick={()=>setMode('verify')}>ยืนยันรายวัน</button><button type="button" className={mode==='report'?'active':''} onClick={()=>setMode('report')}>รายงานรายคน</button></div>}/>

    {message&&<div className="notice" style={{marginBottom:10}}>{message}</div>}

    {mode==='verify'?<>
      <section className="panel labour-filter">
        <label>วันที่<select value={selectedDate} onChange={e=>{setSelectedDate(e.target.value);setFocusEntry('')}}><option value="">ทุกวันที่</option>{availableDates.map(d=><option key={d} value={d}>{dateTH(d)}</option>)}</select></label>
        <label>สถานะ<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">ทุกสถานะ</option><option value="pending">รอยืนยัน</option><option value="needs_review">ต้องตรวจข้อมูล</option><option value="verified">ยืนยันแล้ว</option></select></label>
        <label className="labour-search">ค้นหา<input value={q} onChange={e=>setQ(e.target.value)} placeholder="หัวหน้าทีม / พื้นที่ / งาน"/></label>
        {(statusFilter||q||focusEntry)&&<button type="button" className="button" onClick={()=>{setStatusFilter('');setQ('');setFocusEntry('')}}>ล้าง</button>}
      </section>

      <section className="labour-kpis">
        <div><span>รายการวันนี้</span><b>{visibleBatches.length}</b></div>
        <div><span>Verified</span><b>{visibleBatches.filter(x=>x.verification_status==='verified').length}</b></div>
        <div><span>Pending</span><b>{visibleBatches.filter(x=>x.verification_status==='pending').length}</b></div>
        <div><span>Needs review</span><b>{visibleBatches.filter(x=>x.verification_status==='needs_review').length}</b></div>
      </section>

      {!canVerify&&<div className="panel labour-readonly">บัญชีนี้ดูข้อมูลได้ แต่การยืนยัน/แก้ทีมคนงานสงวนไว้สำหรับ Manager หรือ Engineer</div>}

      {loading?<div className="panel">กำลังโหลดข้อมูล…</div>:!visibleBatches.length?<div className="panel labour-empty">ไม่พบรายการตาม Filter</div>:<div className="labour-stack">
        {visibleBatches.map(batch=>{
          const entry=entryById.get(batch.site_operations_entry_id)
          if(!entry)return null
          const pids=projectIdsByEntry.get(entry.id)||[]
          const linkedProjects=pids.map(id=>projectById.get(id)).filter(Boolean) as Project[]
          const existing=assignmentsByBatch.get(batch.id)||[]
          const draft=draftFor(batch)
          const homeCandidates=activeWorkers.filter(w=>batch.home_team&&w.default_team===batch.home_team)
          const headcount=Number(batch.expected_headcount||0)
          const countMismatch=draft.length>0&&headcount!==draft.length
          return <article className="panel labour-card" key={batch.id}>
            <header>
              <div><b>{batch.supervisor_raw||'ไม่ระบุหัวหน้าทีม'}</b><small>{dateTH(batch.work_date)} • Form row {entry.source_row} • {entry.area_raw||entry.project_name_raw||'-'}</small></div>
              <div><span className={'verify-status '+batch.verification_status}>{statusLabel(batch.verification_status)}</span><strong>{headcount} คน</strong></div>
            </header>

            <div className="labour-source">
              <div><span>Daily Report</span><b>{entry.work_detail||'-'}</b></div>
              {entry.afternoon_detail&&<div><span>ช่วงบ่าย</span><b>{entry.afternoon_detail}</b></div>}
              {entry.next_plan&&<div><span>Next plan</span><b>{entry.next_plan}</b></div>}
              <div><span>Source headcount</span><b>ชาย {entry.male_count??0} • หญิง {entry.female_count??0} • รวม {entry.total_manpower??0}</b></div>
              <div><span>Project</span><b>{linkedProjects.map(p=>p.code).join(' / ')||'ยังไม่ map Project'}</b></div>
              <div><span>Home team</span><b>{batch.home_team||'ยังไม่ยืนยัน identity ของหัวหน้าทีม'}</b></div>
            </div>

            {!batch.supervisor_worker_id&&<div className="supervisor-resolve">
              <b>ยืนยันหัวหน้าทีมก่อนเพื่อเรียก roster เดิม</b>
              <select value={supervisorPick[batch.id]||''} onChange={e=>setSupervisorPick(prev=>({...prev,[batch.id]:e.target.value}))} disabled={!canVerify}>
                <option value="">เลือกจาก Worker Master</option>
                {activeWorkers.map(w=><option key={w.worker_id} value={w.worker_id}>{w.worker_id} — {w.display_label||w.full_name} — {w.default_team||'ไม่ระบุทีม'}</option>)}
              </select>
              <button type="button" className="button" disabled={!canVerify||!supervisorPick[batch.id]||saving[batch.id]} onClick={()=>confirmSupervisor(batch)}>ยืนยันหัวหน้าทีม</button>
            </div>}

            <div className="labour-tools">
              <button type="button" className="button" disabled={!canVerify||!batch.home_team} onClick={()=>useHomeTeam(batch)}>ใช้ทีมเดิมทั้งหมด ({homeCandidates.length})</button>
              {existing.length>0&&<button type="button" className="button" disabled={!canVerify} onClick={()=>loadExisting(batch)}>โหลดชุดที่ยืนยันไว้ ({existing.length})</button>}
              <select value={addWorker[batch.id]||''} onChange={e=>setAddWorker(prev=>({...prev,[batch.id]:e.target.value}))} disabled={!canVerify}><option value="">+ เลือกคนจาก Worker Master</option>{activeWorkers.map(w=><option key={w.worker_id} value={w.worker_id}>{w.worker_id} — {w.display_label||w.full_name} — {w.default_team||'ไม่ระบุทีม'}</option>)}</select>
              <button type="button" className="button" disabled={!canVerify||!addWorker[batch.id]} onClick={()=>addOneWorker(batch)}>เพิ่มคน</button>
            </div>

            {draft.length?<div className="labour-draft">
              <div className="labour-draft-head"><b>รายชื่อที่จะยืนยัน</b><span className={countMismatch?'bad-text':''}>{draft.length} / {headcount} คน{countMismatch?' • จำนวนไม่ตรง':''}</span></div>
              {draft.map((row,index)=>{
                const worker=workerById.get(row.worker_id)
                return <div className="labour-person" key={row.worker_id+'-'+index}>
                  <div className="labour-person-name"><b>{worker?.display_label||worker?.full_name||row.worker_id}</b><small>{row.worker_id} • Home: {worker?.default_team||'-'}</small></div>
                  <label>ทำงานที่<select value={row.project_id} onChange={e=>updateDraft(batch.id,index,{project_id:e.target.value})}><option value="">ยังไม่ระบุ Project</option>{projects.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
                  <label>ทีมที่ทำงานจริง<select value={row.working_team} onChange={e=>{const next=e.target.value;updateDraft(batch.id,index,{working_team:next,movement_status:next&&next!==worker?.default_team?'borrowed':'same_team'})}}><option value="">ไม่ระบุ</option>{teamOptions.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
                  <label>การย้ายทีม<select value={row.movement_status} onChange={e=>updateDraft(batch.id,index,{movement_status:e.target.value})}><option value="same_team">ทีมเดิม</option><option value="borrowed">ย้าย/ถูกยืม</option><option value="returned">กลับทีมเดิม</option><option value="other">อื่น ๆ</option></select></label>
                  <label>ชม.จัดสรร<input type="number" min="0" max="24" step="0.5" value={row.allocation_hours} onChange={e=>updateDraft(batch.id,index,{allocation_hours:e.target.value})} placeholder="ถ้ามี"/></label>
                  <button type="button" className="link-danger" onClick={()=>removeDraft(batch.id,index)}>ลบ</button>
                </div>
              })}
            </div>:<div className="labour-no-draft">ยังไม่ได้เลือกรายชื่อ • ใช้ “ทีมเดิมทั้งหมด” เพื่อลดการกรอก หรือเพิ่มเฉพาะคนที่ต้องการจาก Worker Master</div>}

            <div className="labour-confirm">
              <label>หมายเหตุการยืนยัน<input value={notes[batch.id]??batch.note??''} onChange={e=>setNotes(prev=>({...prev,[batch.id]:e.target.value}))} placeholder={countMismatch?'จำนวนไม่ตรงกับ Daily Report ต้องระบุสาเหตุ':'เช่น A ย้ายไปช่วยทีมช่างพร 1 วัน'}/></label>
              <button type="button" className="primary" disabled={!canVerify||saving[batch.id]||!draft.length} onClick={()=>saveBatch(batch)}>{saving[batch.id]?'กำลังยืนยัน…':batch.verification_status==='verified'?'ยืนยันการแก้ไข':'ยืนยันทีมคนงาน'}</button>
            </div>
            {batch.verified_at&&<div className="labour-verified-line">ยืนยันล่าสุด {new Date(batch.verified_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</div>}
          </article>
        })}
      </div>}
    </>:<>
      <section className="panel report-filter">
        <label>จากวันที่<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
        <label>ถึงวันที่<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
        <label>คนงาน<select value={workerFilter} onChange={e=>setWorkerFilter(e.target.value)}><option value="">ทุกคน</option>{activeWorkers.map(w=><option key={w.worker_id} value={w.worker_id}>{w.worker_id} — {w.display_label||w.full_name}</option>)}</select></label>
        <button type="button" className="button" onClick={()=>window.print()}>พิมพ์ / PDF</button>
      </section>

      <div className="report-summary">ช่วง {dateFrom?dateTH(dateFrom):'-'} – {dateTo?dateTH(dateTo):'-'} • {reportByWorker.length} คน • {reportRows.length} worker-days/allocations จากข้อมูลที่ยืนยันแล้วเท่านั้น</div>
      {!reportByWorker.length?<div className="panel labour-empty">ยังไม่มี Verified Labour Dataset ในช่วงวันที่เลือก</div>:<div className="worker-report-stack">
        {reportByWorker.map(([workerId,rows])=>{
          const worker=workerById.get(workerId)
          return <section className="panel worker-report" key={workerId}>
            <header><div><b>{worker?.display_label||worker?.full_name||workerId}</b><small>{workerId} • Home team: {worker?.default_team||'-'}</small></div><strong>{new Set(rows.map(x=>x.work_date)).size} วัน</strong></header>
            <div className="worker-table"><table><thead><tr><th>วันที่</th><th>Project</th><th>ทีมที่ทำจริง</th><th>สถานะทีม</th><th>ชม.</th><th>รายละเอียดงานจาก Daily Report</th></tr></thead><tbody>{rows.sort((a,b)=>a.work_date.localeCompare(b.work_date)).map(row=><tr key={row.id}><td>{dateTH(row.work_date)}</td><td><b>{row.project_id?projectById.get(row.project_id)?.code||'-':'-'}</b></td><td>{row.working_team||row.home_team||'-'}</td><td>{movementLabel(row.movement_status)}</td><td>{row.allocation_hours??'-'}</td><td>{row.work_detail||'-'}{row.notes&&<small>{row.notes}</small>}</td></tr>)}</tbody></table></div>
          </section>
        })}
      </div>}
    </>}

    <style jsx>{`
      .labour-mode{display:inline-flex;gap:4px;padding:4px;border:1px solid var(--line);border-radius:11px;background:#f4f7fa}.labour-mode button{border:0;background:transparent;border-radius:8px;padding:8px 11px;font-size:10px;font-weight:850;color:var(--muted);cursor:pointer}.labour-mode button.active{background:var(--navy);color:#fff}
      .labour-filter,.report-filter{display:grid;grid-template-columns:170px 170px minmax(260px,1fr) auto;gap:8px;align-items:end;padding:10px;margin-bottom:10px}.labour-filter label,.report-filter label{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted)}.labour-filter select,.labour-filter input,.report-filter select,.report-filter input{min-height:36px;border:1px solid var(--line);border-radius:9px;background:#fff;padding:7px 9px;font:inherit;font-size:12px}
      .labour-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}.labour-kpis>div{padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.labour-kpis span{display:block;font-size:9px;font-weight:850;color:var(--muted)}.labour-kpis b{display:block;margin-top:3px;font-size:21px;color:var(--navy)}
      .labour-readonly,.labour-empty{padding:16px;text-align:center;color:var(--muted);font-size:10.5px;margin-bottom:10px}.labour-stack,.worker-report-stack{display:grid;gap:10px}.labour-card{padding:0;overflow:hidden}.labour-card>header,.worker-report>header{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 13px;background:linear-gradient(135deg,#172a43,#213d5e);color:#fff}.labour-card header b,.worker-report header b{font-size:13px}.labour-card header small,.worker-report header small{display:block;margin-top:3px;font-size:9px;color:#c9d5e1}.labour-card header>div:last-child{display:flex;align-items:center;gap:7px}.labour-card header strong,.worker-report header strong{font-size:15px}.verify-status{padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.2);font-size:9px;font-weight:850}.verify-status.verified{background:rgba(69,170,103,.22)}.verify-status.needs_review{background:rgba(218,154,38,.25)}
      .labour-source{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border-bottom:1px solid var(--line)}.labour-source>div{display:grid;grid-template-columns:90px minmax(0,1fr);gap:7px;padding:8px 12px;border-bottom:1px solid #edf0f3}.labour-source span{font-size:8.5px;font-weight:900;color:var(--muted);text-transform:uppercase}.labour-source b{font-size:10px;line-height:1.45}
      .supervisor-resolve{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(280px,1.5fr) auto;gap:7px;align-items:center;padding:9px 12px;background:#fff8e8;border-bottom:1px solid #ead29a}.supervisor-resolve>b{font-size:9.5px;color:#7a5600}.supervisor-resolve select{min-height:34px;border:1px solid #d7c48e;border-radius:8px;background:#fff;padding:6px 8px;font-size:10px}
      .labour-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:9px 12px;background:#f8fafc;border-bottom:1px solid var(--line)}.labour-tools select{flex:1 1 300px;min-height:34px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:6px 8px;font-size:10px}
      .labour-draft{padding:10px 12px}.labour-draft-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px;font-size:10px}.labour-draft-head span{color:var(--muted)}.bad-text{color:var(--red)!important;font-weight:850}
      .labour-person{display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(145px,.9fr) minmax(145px,.9fr) minmax(145px,.9fr) 90px auto;gap:6px;align-items:end;padding:7px 0;border-top:1px solid #edf0f3}.labour-person-name{align-self:center}.labour-person-name b{display:block;font-size:10.5px}.labour-person-name small{display:block;margin-top:2px;font-size:8.5px;color:var(--muted)}.labour-person label{display:grid;gap:3px;font-size:8px;font-weight:850;color:var(--muted)}.labour-person select,.labour-person input{min-height:31px;border:1px solid var(--line);border-radius:7px;background:#fff;padding:5px 6px;font-size:9px;min-width:0}.labour-no-draft{padding:13px;color:var(--muted);font-size:10px;text-align:center}
      .labour-confirm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;padding:10px 12px;border-top:1px solid var(--line);background:#fbfcfd}.labour-confirm label{display:grid;gap:4px;font-size:9px;font-weight:850;color:var(--muted)}.labour-confirm input{min-height:35px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:10px}.labour-confirm .primary{min-height:35px}.labour-verified-line{padding:7px 12px;border-top:1px solid var(--line);font-size:8.5px;color:var(--muted);text-align:right}
      .report-summary{padding:7px 9px;margin:-2px 0 10px;font-size:9.5px;color:var(--muted);text-align:right}.worker-report{padding:0;overflow:hidden}.worker-table{overflow:auto}.worker-table table{width:100%;min-width:900px}.worker-table th,.worker-table td{font-size:9.5px;white-space:normal;vertical-align:top}.worker-table td small{display:block;margin-top:3px;color:var(--muted)}
      @media(max-width:1150px){.supervisor-resolve{grid-template-columns:1fr 1fr}.supervisor-resolve>b{grid-column:1/-1}.labour-person{grid-template-columns:1fr 1fr 1fr}.labour-person-name{grid-column:1/-1}.labour-person .link-danger{justify-self:start}}@media(max-width:760px){.supervisor-resolve{grid-template-columns:1fr}.supervisor-resolve>b{grid-column:auto}.labour-filter,.report-filter{grid-template-columns:1fr 1fr}.labour-search{grid-column:1/-1}.labour-kpis{grid-template-columns:1fr 1fr}.labour-card>header,.worker-report>header{align-items:flex-start}.labour-source{grid-template-columns:1fr}.labour-person{grid-template-columns:1fr 1fr}.labour-person-name{grid-column:1/-1}.labour-confirm{grid-template-columns:1fr}}@media print{.labour-mode,.labour-filter,.report-filter,.labour-kpis,.labour-readonly,.labour-tools,.labour-confirm,.notice{display:none!important}.worker-report{break-inside:avoid}}
    `}</style>
  </AppShell>
}
