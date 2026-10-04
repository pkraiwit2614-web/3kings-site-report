'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import { readAllPages, requireCompletePagedReads } from '@/lib/pagedRead'
import { dateTH } from '@/lib/format'
import { bangkokToday, isBatchWorkDateUsable, latestUsableDate } from '@/lib/workDateIntegrity'
import type { Project } from '@/lib/types'
import {canManageLabour,canViewPayroll,resolveAccessRole,type AccessRole} from '@/lib/accessControl'

type SiteEntry={id:string;work_date:string;source_row:number;project_name_raw:string|null;area_raw:string|null;supervisor_raw:string|null;male_count:number|null;female_count:number|null;total_manpower:number|null;work_detail:string|null;status_text:string|null;next_plan:string|null;afternoon_detail:string|null;specific_area:string|null;supervisor_worker_id:string|null;work_date_validation_status?:string|null;work_date_validation_reason?:string|null}
type Batch={id:string;site_operations_entry_id:string;work_date:string;expected_headcount:number|null;supervisor_worker_id:string|null;supervisor_raw:string|null;home_team:string|null;verification_status:string;verified_by:string|null;verified_at:string|null;note:string|null}
type Worker={worker_id:string;full_name:string;nickname:string|null;default_team:string|null;status:string|null;display_label:string|null}
type EntryProject={entry_id:string;project_id:string}
type Assignment={id:string;batch_id:string;worker_id:string;work_date:string;project_id:string|null;home_team:string|null;working_team:string|null;movement_status:string;allocation_hours:number|null;allocation_share:number|null;work_detail:string|null;notes:string|null;verified_at:string|null}
type DraftAssignment={worker_id:string;project_id:string;working_team:string;movement_status:string;allocation_hours:string;notes:string}
type PayrollRecord={id:string;labour_batch_id:string;verification_method:'web'|'legacy_excel';status:'draft'|'timecard_checked'|'verified'|'external_verified'|'needs_review';source_labour_verified_at:string|null;external_reference:string|null;note:string|null;timecard_checked_at:string|null;verified_at:string|null;updated_at:string}
type PayrollItem={id:string;record_id:string;labour_assignment_id:string|null;worker_id:string;attendance_status:string;clock_in:string|null;clock_out:string|null;work_units:number;ot_hours:number;timecard_match:boolean;regular_rate:number|null;ot_rate:number|null;regular_pay:number|null;ot_pay:number|null;adjustment:number;total_pay:number|null;calculation_status:string;note:string|null}
type PayrollDraftItem={labour_assignment_id:string;worker_id:string;attendance_status:string;clock_in:string;clock_out:string;work_units:string;ot_hours:string;timecard_match:boolean;regular_rate:number|null;ot_rate:number|null;regular_pay:number|null;ot_pay:number|null;adjustment:number;total_pay:number|null;calculation_status:string;note:string}

function addDays(value:string,days:number){
  const d=new Date(value+'T12:00:00Z')
  if(Number.isNaN(d.getTime()))return value
  d.setUTCDate(d.getUTCDate()+days)
  return d.toISOString().slice(0,10)
}
function movementLabel(value:string){
  const map:Record<string,string>={same_team:'ทีมเดิม',borrowed:'ย้าย/ถูกยืมไปช่วยทีมอื่น',returned:'กลับทีมเดิม',other:'อื่น ๆ'}
  return map[value]||value
}
function statusLabel(value:string){
  const map:Record<string,string>={pending:'รอยืนยันทีม',verified:'ยืนยันทีมแล้ว',needs_review:'ต้องตรวจข้อมูล'}
  return map[value]||value
}
function payrollStatusLabel(value:string){
  const map:Record<string,string>={pending:'รอตรวจบัตรตอก',draft:'กำลังตรวจ',timecard_checked:'ตรวจบัตรตอกแล้ว',verified:'Verified Payroll',external_verified:'Verified via Excel',needs_review:'ต้องตรวจซ้ำ'}
  return map[value]||value
}
function attendanceLabel(value:string){
  const map:Record<string,string>={present:'มาทำงาน',absent:'ขาด',leave:'ลา',half_day:'ครึ่งวัน',other:'อื่น ๆ'}
  return map[value]||value
}

export default function LabourVerificationPage(){
  const [loading,setLoading]=useState(true)
  const [loadError,setLoadError]=useState(false)
  const [accessRole,setAccessRole]=useState<AccessRole|null>(null)
  const [entries,setEntries]=useState<SiteEntry[]>([])
  const [batches,setBatches]=useState<Batch[]>([])
  const [workers,setWorkers]=useState<Worker[]>([])
  const [projects,setProjects]=useState<Project[]>([])
  const [entryProjects,setEntryProjects]=useState<EntryProject[]>([])
  const [assignments,setAssignments]=useState<Assignment[]>([])
  const [payrollRecords,setPayrollRecords]=useState<PayrollRecord[]>([])
  const [payrollItems,setPayrollItems]=useState<PayrollItem[]>([])
  const [selectedDate,setSelectedDate]=useState('')
  const [statusFilter,setStatusFilter]=useState('')
  const [q,setQ]=useState('')
  const [mode,setMode]=useState<'verify'|'payroll'>('verify')
  const [dateFrom,setDateFrom]=useState('')
  const [dateTo,setDateTo]=useState('')
  const [payrollStatusFilter,setPayrollStatusFilter]=useState('')
  const [drafts,setDrafts]=useState<Record<string,DraftAssignment[]>>({})
  const [payrollDrafts,setPayrollDrafts]=useState<Record<string,PayrollDraftItem[]>>({})
  const [payrollNotes,setPayrollNotes]=useState<Record<string,string>>({})
  const [externalRefs,setExternalRefs]=useState<Record<string,string>>({})
  const [notes,setNotes]=useState<Record<string,string>>({})
  const [addWorker,setAddWorker]=useState<Record<string,string>>({})
  const [supervisorPick,setSupervisorPick]=useState<Record<string,string>>({})
  const [saving,setSaving]=useState<Record<string,boolean>>({})
  const [message,setMessage]=useState('')
  const [refreshTick,setRefreshTick]=useState(0)
  const [focusEntry,setFocusEntry]=useState('')
  const [readSignals,setReadSignals]=useState<Array<{label:string;loaded:number;count:number;truncated:boolean}>>([])

  useEffect(()=>{
    const queueRefresh=()=>setRefreshTick(v=>v+1)
    const onFocus=()=>queueRefresh()
    const onVisible=()=>{if(document.visibilityState==='visible')queueRefresh()}
    const pollTimer=window.setInterval(()=>{if(document.visibilityState==='visible')queueRefresh()},60000)
    window.addEventListener('focus',onFocus)
    document.addEventListener('visibilitychange',onVisible)
    return()=>{window.clearInterval(pollTimer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisible)}
  },[])

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
      if(!user)throw new Error('AUTH_REQUIRED')

      const profile=await s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
      if(profile.error)throw profile.error
      if(!profile.data?.active)throw new Error('INACTIVE_USER')
      const nextAccessRole=resolveAccessRole(profile.data.role,user.id)
      if(!nextAccessRole)throw new Error('ROLE_NOT_ALLOWED')
      const payrollAllowed=canViewPayroll(nextAccessRole)

      const emptyPayrollRecord={label:'payroll_verification_records',data:[] as PayrollRecord[],count:0,loaded:0,truncated:false}
      const emptyPayrollItem={label:'payroll_verification_items',data:[] as PayrollItem[],count:0,loaded:0,truncated:false}

      const [e,b,w,p,ep,a,pr,pi]=await Promise.all([
        readAllPages<SiteEntry>({label:'site_operations_entries',keyOf:x=>x.id,fetchPage:(from,to)=>
          s.from('site_operations_entries').select('id,work_date,source_row,project_name_raw,area_raw,supervisor_raw,male_count,female_count,total_manpower,work_detail,status_text,next_plan,afternoon_detail,specific_area,supervisor_worker_id,work_date_validation_status,work_date_validation_reason',{count:'exact'}).order('work_date',{ascending:false}).order('source_row',{ascending:false}).order('id',{ascending:false}).range(from,to)}),
        readAllPages<Batch>({label:'labour_verification_batches',keyOf:x=>x.id,fetchPage:(from,to)=>
          s.from('labour_verification_batches').select('*',{count:'exact'}).order('work_date',{ascending:false}).order('id',{ascending:false}).range(from,to)}),
        readAllPages<Worker>({label:'labour_workers',keyOf:x=>x.worker_id,fetchPage:(from,to)=>
          s.from('labour_workers').select('worker_id,full_name,nickname,default_team,status,display_label',{count:'exact'}).order('worker_id').range(from,to)}),
        readAllPages<Project>({label:'projects',keyOf:x=>x.id,fetchPage:(from,to)=>
          s.from('projects').select('id,code,name,site_group,target_handover,active,sort_order',{count:'exact'}).order('sort_order').order('id').range(from,to)}),
        readAllPages<EntryProject>({label:'site_operations_entry_projects',keyOf:x=>x.entry_id+':'+x.project_id,fetchPage:(from,to)=>
          s.from('site_operations_entry_projects').select('entry_id,project_id',{count:'exact'}).order('entry_id').order('project_id').range(from,to)}),
        readAllPages<Assignment>({label:'labour_daily_assignments',keyOf:x=>x.id,fetchPage:(from,to)=>
          s.from('labour_daily_assignments').select('*',{count:'exact'}).order('work_date',{ascending:false}).order('id',{ascending:false}).range(from,to)}),
        payrollAllowed?readAllPages<PayrollRecord>({label:'payroll_verification_records',keyOf:x=>x.id,fetchPage:(from,to)=>
          s.from('payroll_verification_records').select('*',{count:'exact'}).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(from,to)}):Promise.resolve(emptyPayrollRecord),
        payrollAllowed?readAllPages<PayrollItem>({label:'payroll_verification_items',keyOf:x=>x.id,fetchPage:(from,to)=>
          s.from('payroll_verification_items').select('*',{count:'exact'}).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(from,to)}):Promise.resolve(emptyPayrollItem)
      ])
      const paged=payrollAllowed?[e,b,w,p,ep,a,pr,pi]:[e,b,w,p,ep,a]
      setReadSignals(paged.map(({label,loaded,count,truncated})=>({label,loaded,count,truncated})))
      requireCompletePagedReads(paged)
      if(!alive)return
      const nextEntries=e.data
      setEntries(nextEntries);setBatches(b.data);setWorkers(w.data)
      setProjects(p.data);setEntryProjects(ep.data);setAssignments(a.data)
      setPayrollRecords(pr.data);setPayrollItems(pi.data)
      setAccessRole(nextAccessRole)
      if(!payrollAllowed)setMode('verify')
      const latest=latestUsableDate(nextEntries)
      setSelectedDate(v=>v||latest)
      setDateTo(v=>v||latest)
      setDateFrom(v=>v||(latest?addDays(latest,-6):''))
      setLoadError(false)
    }
    if(refreshTick===0)setLoading(true)
    load().catch(()=>{if(alive)setLoadError(true)}).finally(()=>{if(alive)setLoading(false)})
    return()=>{alive=false}
  },[refreshTick])

  const canVerify=canManageLabour(accessRole)
  const canPayroll=canViewPayroll(accessRole)
  const today=bangkokToday()
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
  const usableBatches=useMemo(()=>batches.filter(batch=>isBatchWorkDateUsable(batch,entryById.get(batch.site_operations_entry_id),today)),[batches,entryById,today])
  const availableDates=useMemo(()=>Array.from(new Set(usableBatches.map(x=>x.work_date))).sort((a,b)=>b.localeCompare(a)),[usableBatches])
  const teamOptions=useMemo(()=>Array.from(new Set(workers.map(x=>x.default_team).filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b,'th')),[workers])
  const activeWorkers=useMemo(()=>workers.filter(x=>String(x.status||'').toLowerCase()!=='inactive'),[workers])

  const visibleBatches=useMemo(()=>{
    const needle=q.trim().toLowerCase()
    return usableBatches.filter(batch=>{
      if(selectedDate&&batch.work_date!==selectedDate)return false
      if(statusFilter&&batch.verification_status!==statusFilter)return false
      if(focusEntry&&batch.site_operations_entry_id!==focusEntry)return false
      if(!needle)return true
      const entry=entryById.get(batch.site_operations_entry_id)
      return [batch.supervisor_raw,batch.home_team,entry?.area_raw,entry?.project_name_raw,entry?.work_detail].join(' ').toLowerCase().includes(needle)
    })
  },[usableBatches,selectedDate,statusFilter,focusEntry,q,entryById])
  const ensureBatchWorkDateUsable=(batch:Batch)=>{if(isBatchWorkDateUsable(batch,entryById.get(batch.site_operations_entry_id),bangkokToday()))return true;setMessage('Work Date รายการนี้ถูกกักไว้เพื่อตรวจสอบ • ห้ามยืนยัน Labour/Payroll จนกว่าจะมีหลักฐานแก้วันที่ต้นทาง');return false}

  const draftFor=(batch:Batch)=>drafts[batch.id]||[]
  const updateDraft=(batchId:string,index:number,patch:Partial<DraftAssignment>)=>{
    setDrafts(prev=>({...prev,[batchId]:(prev[batchId]||[]).map((x,i)=>i===index?{...x,...patch}:x)}))
  }
  const loadExisting=(batch:Batch)=>{
    const rows=(assignmentsByBatch.get(batch.id)||[]).filter(x=>x.worker_id!==batch.supervisor_worker_id)
    setDrafts(prev=>({...prev,[batch.id]:rows.map(x=>({
      worker_id:x.worker_id,project_id:x.project_id||'',working_team:x.working_team||x.home_team||'',
      movement_status:x.movement_status||'same_team',allocation_hours:x.allocation_hours===null?'':String(x.allocation_hours),notes:x.notes||''
    }))}))
    setNotes(prev=>({...prev,[batch.id]:batch.note||''}))
  }
  const useHomeTeam=(batch:Batch)=>{
    const candidates=activeWorkers.filter(w=>batch.home_team&&w.default_team===batch.home_team&&w.worker_id!==batch.supervisor_worker_id)
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
    if(workerId===batch.supervisor_worker_id){setMessage('หัวหน้าทีมถูกแยกจากรายการคนงานและไม่รวมใน Worker Payroll');return}
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
    if(!canVerify||!workerId||saving[batch.id]||!ensureBatchWorkDateUsable(batch))return
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
    if(!canVerify||saving[batch.id]||!ensureBatchWorkDateUsable(batch))return
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

  const payrollRecordByBatch=useMemo(()=>new Map(payrollRecords.map(x=>[x.labour_batch_id,x])),[payrollRecords])
  const payrollItemsByRecord=useMemo(()=>{
    const map=new Map<string,PayrollItem[]>()
    for(const row of payrollItems){const list=map.get(row.record_id)||[];list.push(row);map.set(row.record_id,list)}
    return map
  },[payrollItems])
  const payrollStatusFor=(batch:Batch)=>{
    const record=payrollRecordByBatch.get(batch.id)
    if(!record)return 'pending'
    if(batch.verification_status!=='verified'&&record.status!=='draft')return 'needs_review'
    if(record.source_labour_verified_at&&batch.verified_at&&new Date(record.source_labour_verified_at).getTime()!==new Date(batch.verified_at).getTime())return 'needs_review'
    return record.status
  }
  const payrollBatches=useMemo(()=>{
    const needle=q.trim().toLowerCase()
    return usableBatches.filter(batch=>{
      if(dateFrom&&batch.work_date<dateFrom)return false
      if(dateTo&&batch.work_date>dateTo)return false
      const effective=payrollStatusFor(batch)
      if(payrollStatusFilter&&effective!==payrollStatusFilter)return false
      if(!needle)return true
      const entry=entryById.get(batch.site_operations_entry_id)
      return [batch.supervisor_raw,batch.home_team,entry?.area_raw,entry?.project_name_raw,entry?.work_detail].join(' ').toLowerCase().includes(needle)
    })
  },[usableBatches,dateFrom,dateTo,payrollStatusFilter,q,entryById,payrollRecordByBatch])
  const payrollDraftFor=(batch:Batch)=>payrollDrafts[batch.id]||[]
  const startPayrollReview=(batch:Batch)=>{
    const record=payrollRecordByBatch.get(batch.id)
    const saved=record?payrollItemsByRecord.get(record.id)||[]:[]
    const savedByWorker=new Map(saved.map(x=>[x.worker_id,x]))
    const rows=(assignmentsByBatch.get(batch.id)||[]).filter(x=>x.worker_id!==batch.supervisor_worker_id)
    setPayrollDrafts(prev=>({...prev,[batch.id]:rows.map(a=>{
      const old=savedByWorker.get(a.worker_id)
      return {
        labour_assignment_id:a.id,worker_id:a.worker_id,
        attendance_status:old?.attendance_status||'present',
        clock_in:old?.clock_in?.slice(0,5)||'',clock_out:old?.clock_out?.slice(0,5)||'',
        work_units:old?String(old.work_units):'1',ot_hours:old?String(old.ot_hours):'0',
        timecard_match:Boolean(old?.timecard_match),
        regular_rate:old?.regular_rate??null,ot_rate:old?.ot_rate??null,
        regular_pay:old?.regular_pay??null,ot_pay:old?.ot_pay??null,
        adjustment:old?.adjustment??0,total_pay:old?.total_pay??null,
        calculation_status:old?.calculation_status||'rate_pending',note:old?.note||''
      }
    })}))
    setPayrollNotes(prev=>({...prev,[batch.id]:record?.note||''}))
    setExternalRefs(prev=>({...prev,[batch.id]:record?.external_reference||''}))
  }
  const updatePayrollDraft=(batchId:string,index:number,patch:Partial<PayrollDraftItem>)=>{
    setPayrollDrafts(prev=>({...prev,[batchId]:(prev[batchId]||[]).map((x,i)=>i===index?{...x,...patch}:x)}))
  }
  const applyAttendance=(batchId:string,index:number,value:string)=>{
    const patch:Partial<PayrollDraftItem>={attendance_status:value,timecard_match:false}
    if(value==='absent'||value==='leave'){patch.work_units='0';patch.ot_hours='0'}
    else if(value==='half_day')patch.work_units='0.5'
    else if(value==='present'){const current=(payrollDrafts[batchId]||[])[index];if(!current||Number(current.work_units)===0)patch.work_units='1'}
    updatePayrollDraft(batchId,index,patch)
  }
  const markAllTimecards=(batch:Batch,matched:boolean)=>{
    setPayrollDrafts(prev=>({...prev,[batch.id]:(prev[batch.id]||[]).map(x=>({...x,timecard_match:matched}))}))
  }
  const clearAllOt=(batch:Batch)=>{
    setPayrollDrafts(prev=>({...prev,[batch.id]:(prev[batch.id]||[]).map(x=>Number(x.ot_hours||0)===0?x:{...x,ot_hours:'0',timecard_match:false})}))
  }
  const savePayrollWeb=async(batch:Batch,status:'draft'|'timecard_checked')=>{
    if(!canPayroll||saving['payroll-'+batch.id]||!ensureBatchWorkDateUsable(batch))return
    const rows=payrollDraftFor(batch)
    if(!rows.length){setMessage('ยังไม่มีรายชื่อคนงานสำหรับตรวจบัตรตอก กรุณายืนยันทีมรายวันก่อน');return}
    if(status==='timecard_checked'&&rows.some(x=>!x.timecard_match)){setMessage('ยังมีคนงานที่ไม่ได้ติ๊ก “ตรงกับบัตรตอก”');return}
    setSaving(prev=>({...prev,['payroll-'+batch.id]:true}));setMessage('')
    try{
      const payload=rows.map(x=>({
        labour_assignment_id:x.labour_assignment_id,worker_id:x.worker_id,attendance_status:x.attendance_status,
        clock_in:x.clock_in||null,clock_out:x.clock_out||null,
        work_units:Number(x.work_units||0),ot_hours:Number(x.ot_hours||0),timecard_match:x.timecard_match,
        regular_rate:x.regular_rate,ot_rate:x.ot_rate,regular_pay:x.regular_pay,ot_pay:x.ot_pay,
        adjustment:Number(x.adjustment||0),total_pay:x.total_pay,
        calculation_status:x.calculation_status||'rate_pending',note:x.note||null
      }))
      const {error}=await getSupabase().rpc('payroll_save_verification',{
        p_labour_batch_id:batch.id,p_method:'web',p_status:status,p_note:payrollNotes[batch.id]||'',
        p_external_reference:null,p_items:payload
      })
      if(error)throw error
      setMessage(status==='timecard_checked'
        ?'ตรวจบัตรตอกครบแล้ว • บันทึก Payroll Verification Record • ยอดเงินรอ Rate Master'
        :'บันทึกฉบับร่าง Payroll Verification Record แล้ว')
      setRefreshTick(v=>v+1)
    }catch(err:any){setMessage(String(err?.message||'บันทึก Payroll Verification ไม่สำเร็จ'))}
    finally{setSaving(prev=>({...prev,['payroll-'+batch.id]:false}))}
  }
  const saveLegacyPayroll=async(batch:Batch)=>{
    if(!canPayroll||saving['payroll-'+batch.id]||!ensureBatchWorkDateUsable(batch))return
    const ref=(externalRefs[batch.id]||payrollRecordByBatch.get(batch.id)?.external_reference||'').trim()
    if(!ref){setMessage('กรุณาระบุชื่อไฟล์ Excel / เลขอ้างอิงที่ใช้ตรวจค่าแรง');return}
    setSaving(prev=>({...prev,['payroll-'+batch.id]:true}));setMessage('')
    try{
      const {error}=await getSupabase().rpc('payroll_save_verification',{
        p_labour_batch_id:batch.id,p_method:'legacy_excel',p_status:'external_verified',
        p_note:payrollNotes[batch.id]||'',p_external_reference:ref,p_items:[]
      })
      if(error)throw error
      setMessage('บันทึก Verified Payroll จาก Excel เดิมแล้ว • เก็บ Reference ไว้ตรวจสอบย้อนหลัง')
      setRefreshTick(v=>v+1)
    }catch(err:any){setMessage(String(err?.message||'บันทึกการยืนยันจาก Excel ไม่สำเร็จ'))}
    finally{setSaving(prev=>({...prev,['payroll-'+batch.id]:false}))}
  }

  return <AppShell>
    {readSignals.some(x=>x.truncated)&&<div className="panel" role="alert" style={{marginBottom:10}}>โหลดข้อมูลไม่ครบ • {readSignals.filter(x=>x.truncated).map(x=>x.label+' '+x.loaded+'/'+x.count).join(' • ')}</div>}
    {loadError&&<div className="panel" role="alert" style={{marginBottom:10}}>โหลด Labour Verification ไม่สำเร็จ กรุณาลองใหม่ <button type="button" className="button" onClick={()=>setRefreshTick(v=>v+1)}>ลองใหม่</button></div>}
    <PageHeader title={canPayroll?'Labour & Payroll Verification':'Labour'} subtitle={canPayroll?'Labour PDF รันอัตโนมัติเหมือนเดิม • หน้านี้ใช้ยืนยันทีมรายวันและตรวจบัตรตอกเพื่อสร้าง Payroll Verification Record':'ดูข้อมูลทีมและแรงงานจาก Site Operations • ไม่มีสิทธิ์เข้าถึงข้อมูล Payroll'} action={<div className="labour-mode"><button type="button" className={mode==='verify'?'active':''} onClick={()=>setMode('verify')}>ยืนยันทีมรายวัน</button>{canPayroll&&<button type="button" className={mode==='payroll'?'active':''} onClick={()=>setMode('payroll')}>Payroll Verification Record</button>}</div>}/>

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

      {!canVerify&&<div className="panel labour-readonly">บัญชีนี้ดูข้อมูล Labour ได้ แต่การยืนยัน/แก้ทีมคนงานสงวนไว้สำหรับ Admin</div>}

      {loading?<div className="panel">กำลังโหลดข้อมูล…</div>:!visibleBatches.length?<div className="panel labour-empty">ไม่พบรายการตาม Filter</div>:<div className="labour-stack">
        {visibleBatches.map(batch=>{
          const entry=entryById.get(batch.site_operations_entry_id)
          if(!entry)return null
          const pids=projectIdsByEntry.get(entry.id)||[]
          const linkedProjects=pids.map(id=>projectById.get(id)).filter(Boolean) as Project[]
          const existing=(assignmentsByBatch.get(batch.id)||[]).filter(x=>x.worker_id!==batch.supervisor_worker_id)
          const draft=draftFor(batch)
          const homeCandidates=activeWorkers.filter(w=>batch.home_team&&w.default_team===batch.home_team&&w.worker_id!==batch.supervisor_worker_id)
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
              <div><span>Source headcount</span><b>คนงาน {entry.total_manpower??0} • หัวหน้าทีมแยกต่างหาก</b></div>
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
                  <label>ทำงานที่<select value={row.project_id} onChange={e=>updateDraft(batch.id,index,{project_id:e.target.value})}><option value="">ยังไม่ระบุ Project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}{p.active?'':' (inactive)'}</option>)}</select></label>
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
      {!canPayroll?<div className="panel labour-empty">บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลทางการเงิน Payroll</div>:<>
        <section className="panel payroll-intro">
          <div><b>Payroll Verification Record</b><span>เทียบรายชื่อทีมกับบัตรตอก → ใส่เวลาจริง/OT → ยืนยันความตรงกัน → ระบบเก็บ Audit Record ให้ทันที</span></div>
          <div className="payroll-rule"><b>หัวหน้าทีม</b><span>แยกจาก Worker Payroll • รูปแบบการจ่ายของหัวหน้าทีมไม่ถูกนำมาคำนวณรวม</span></div>
          <div className="payroll-rate"><b>Rate Master</b><span>ยังไม่ตั้งอัตราในระบบ จึงไม่คำนวณยอดเงินเองจนกว่าจะนำ Excel สูตรค่าแรงเข้ามา</span></div>
        </section>
        <section className="panel report-filter payroll-filter">
          <label>จากวันที่<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
          <label>ถึงวันที่<input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
          <label>สถานะ<select value={payrollStatusFilter} onChange={e=>setPayrollStatusFilter(e.target.value)}><option value="">ทุกสถานะ</option><option value="pending">รอตรวจบัตรตอก</option><option value="draft">กำลังตรวจ</option><option value="timecard_checked">ตรวจบัตรตอกแล้ว</option><option value="external_verified">Verified via Excel</option><option value="verified">Verified Payroll</option><option value="needs_review">ต้องตรวจซ้ำ</option></select></label>
          <label className="labour-search">ค้นหา<input value={q} onChange={e=>setQ(e.target.value)} placeholder="หัวหน้าทีม / พื้นที่ / งาน"/></label>
          <button type="button" className="button" onClick={()=>window.print()}>พิมพ์รายการ</button>
        </section>

        <section className="labour-kpis payroll-kpis">
          <div><span>Team-days</span><b>{payrollBatches.length}</b></div>
          <div><span>รอตรวจบัตรตอก</span><b>{payrollBatches.filter(x=>payrollStatusFor(x)==='pending').length}</b></div>
          <div><span>ตรวจบัตรตอกแล้ว</span><b>{payrollBatches.filter(x=>payrollStatusFor(x)==='timecard_checked').length}</b></div>
          <div><span>Verified</span><b>{payrollBatches.filter(x=>['verified','external_verified'].includes(payrollStatusFor(x))).length}</b></div>
        </section>

        {!payrollBatches.length?<div className="panel labour-empty">ไม่พบ Payroll Verification Record ตามช่วงวันที่และ Filter</div>:<div className="payroll-stack">
          {payrollBatches.map(batch=>{
            const entry=entryById.get(batch.site_operations_entry_id)
            if(!entry)return null
            const record=payrollRecordByBatch.get(batch.id)
            const effectiveStatus=payrollStatusFor(batch)
            const rows=(assignmentsByBatch.get(batch.id)||[]).filter(x=>x.worker_id!==batch.supervisor_worker_id)
            const draft=payrollDraftFor(batch)
            const leader=batch.supervisor_worker_id?workerById.get(batch.supervisor_worker_id):null
            const linkedProjects=(projectIdsByEntry.get(entry.id)||[]).map(id=>projectById.get(id)).filter(Boolean) as Project[]
            const countMismatch=Number(batch.expected_headcount||0)>0&&rows.length>0&&rows.length!==Number(batch.expected_headcount||0)
            const allMatched=draft.length>0&&draft.every(x=>x.timecard_match)
            const payrollSaving=Boolean(saving['payroll-'+batch.id])
            return <article className="panel payroll-card" key={batch.id}>
              <header>
                <div><b>{batch.home_team||batch.supervisor_raw||'ไม่ระบุทีม'}</b><small>{dateTH(batch.work_date)} • {entry.area_raw||entry.project_name_raw||'-'} • {linkedProjects.map(p=>p.code).join(' / ')||'ยังไม่ map Project'}</small></div>
                <div><span className={'payroll-status '+effectiveStatus}>{payrollStatusLabel(effectiveStatus)}</span><strong>{rows.length} คนงาน</strong></div>
              </header>

              <div className="payroll-summary-grid">
                <div><span>หัวหน้าทีม</span><b>{leader?.nickname||leader?.display_label||batch.supervisor_raw||'-'}</b><small>แยกการจ่าย • ไม่รวมใน Worker Payroll</small></div>
                <div><span>รายละเอียดงาน</span><b>{entry.work_detail||'-'}</b>{entry.afternoon_detail&&<small>บ่าย: {entry.afternoon_detail}</small>}</div>
                <div><span>Daily Report</span><b>{batch.expected_headcount??0} คนงาน</b><small className={countMismatch?'bad-text':''}>{rows.length} รายชื่อที่ยืนยันแล้ว{countMismatch?' • จำนวนไม่ตรง Source':''}</small></div>
                <div><span>วิธียืนยัน Payroll</span><b>{record?.verification_method==='legacy_excel'?'Legacy Excel':'Web Verification'}</b><small>{record?.external_reference||'Audit trail ในระบบ'}</small></div>
              </div>

              {batch.verification_status!=='verified'&&<div className="payroll-warning">ทีมรายวันนี้ยังไม่ผ่านการยืนยันรายชื่อ • ใช้ Excel เดิมได้ แต่การตรวจบัตรตอกผ่าน Web ต้องยืนยันทีมก่อน</div>}
              {effectiveStatus==='needs_review'&&<div className="payroll-warning">ข้อมูลทีมรายวันมีการเปลี่ยนหลังการตรวจ Payroll • ต้องเปิดตรวจบัตรตอกซ้ำก่อนใช้ยอด</div>}

              <div className="payroll-actions">
                <button type="button" className="button primary" disabled={!canPayroll||!rows.length||batch.verification_status!=='verified'} onClick={()=>startPayrollReview(batch)}>{draft.length?'โหลดข้อมูลจากระบบใหม่':record?.verification_method==='web'?'เปิดรายการเดิม':'เริ่มตรวจบัตรตอก'}</button>
                {draft.length>0&&<><button type="button" className="button" onClick={()=>markAllTimecards(batch,true)}>✓ ตรงทุกคน</button><button type="button" className="button" onClick={()=>clearAllOt(batch)}>OT = 0 ทั้งทีม</button></>}
                {record?.timecard_checked_at&&<span className="payroll-audit">ตรวจบัตรล่าสุด {new Date(record.timecard_checked_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</span>}
              </div>

              {draft.length>0&&<div className="payroll-worker-table"><table>
                <thead><tr><th>คนงาน</th><th>สถานะ</th><th>เข้า</th><th>ออก</th><th>วันทำงาน</th><th>OT ชม.</th><th>บัตรตอก</th><th>ค่าแรง</th><th>หมายเหตุ</th></tr></thead>
                <tbody>{draft.map((row,index)=>{
                  const worker=workerById.get(row.worker_id)
                  return <tr key={row.worker_id}>
                    <td><b>{worker?.nickname||worker?.display_label||worker?.full_name||row.worker_id}</b><small>{row.worker_id} • {worker?.default_team||'-'}</small></td>
                    <td><select value={row.attendance_status} onChange={e=>applyAttendance(batch.id,index,e.target.value)}><option value="present">มาทำงาน</option><option value="half_day">ครึ่งวัน</option><option value="leave">ลา</option><option value="absent">ขาด</option><option value="other">อื่น ๆ</option></select></td>
                    <td><input type="time" value={row.clock_in} onChange={e=>updatePayrollDraft(batch.id,index,{clock_in:e.target.value,timecard_match:false})}/></td>
                    <td><input type="time" value={row.clock_out} onChange={e=>updatePayrollDraft(batch.id,index,{clock_out:e.target.value,timecard_match:false})}/></td>
                    <td><input type="number" min="0" max="1" step="0.5" value={row.work_units} onChange={e=>updatePayrollDraft(batch.id,index,{work_units:e.target.value,timecard_match:false})}/></td>
                    <td><input type="number" min="0" max="24" step="0.5" value={row.ot_hours} onChange={e=>updatePayrollDraft(batch.id,index,{ot_hours:e.target.value,timecard_match:false})}/></td>
                    <td><label className={'match-toggle '+(row.timecard_match?'matched':'')}><input type="checkbox" checked={row.timecard_match} onChange={e=>updatePayrollDraft(batch.id,index,{timecard_match:e.target.checked})}/><span>{row.timecard_match?'ตรงแล้ว':'รอตรวจ'}</span></label></td>
                    <td><span className={'rate-state '+row.calculation_status}>{row.calculation_status==='rate_pending'?'รอ Rate Master':row.total_pay===null?row.calculation_status:'฿'+Number(row.total_pay).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></td>
                    <td><input value={row.note} onChange={e=>updatePayrollDraft(batch.id,index,{note:e.target.value})} placeholder="ถ้ามี"/></td>
                  </tr>
                })}</tbody>
              </table></div>}

              {draft.length>0&&<div className="payroll-confirm">
                <label>หมายเหตุ Payroll<input value={payrollNotes[batch.id]??record?.note??''} onChange={e=>setPayrollNotes(prev=>({...prev,[batch.id]:e.target.value}))} placeholder="เช่น OT ตามบัตรตอก / ลา / ย้ายทีม"/></label>
                <div><span className={allMatched?'match-ready':'match-wait'}>{draft.filter(x=>x.timecard_match).length}/{draft.length} คนตรงกับบัตรตอก</span><button type="button" className="button" disabled={payrollSaving} onClick={()=>savePayrollWeb(batch,'draft')}>บันทึกร่าง</button><button type="button" className="primary" disabled={payrollSaving||!allMatched} onClick={()=>savePayrollWeb(batch,'timecard_checked')}>{payrollSaving?'กำลังบันทึก…':'ยืนยันตรวจบัตรตอก'}</button></div>
              </div>}

              <details className="legacy-payroll">
                <summary>ยังใช้ Excel แบบเดิมอยู่? บันทึก Verified Payroll จาก Excel ได้</summary>
                <div><label>ชื่อไฟล์ / Reference<input value={externalRefs[batch.id]??record?.external_reference??''} onChange={e=>setExternalRefs(prev=>({...prev,[batch.id]:e.target.value}))} placeholder="เช่น Labour Cost Week 40.xlsx"/></label><label>หมายเหตุ<input value={payrollNotes[batch.id]??record?.note??''} onChange={e=>setPayrollNotes(prev=>({...prev,[batch.id]:e.target.value}))} placeholder="ถ้ามี"/></label><button type="button" className="button" disabled={payrollSaving} onClick={()=>saveLegacyPayroll(batch)}>ยืนยันจาก Excel เดิม</button></div>
              </details>

              {record?.verified_at&&<div className="labour-verified-line">Verified ล่าสุด {new Date(record.verified_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} • {payrollStatusLabel(effectiveStatus)}</div>}
            </article>
          })}
        </div>}
      </>}
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
      .payroll-intro{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:0;padding:0;margin-bottom:10px;overflow:hidden}.payroll-intro>div{padding:12px 14px;border-right:1px solid var(--line)}.payroll-intro>div:last-child{border-right:0}.payroll-intro b{display:block;font-size:11px;color:var(--navy)}.payroll-intro span{display:block;margin-top:4px;font-size:9px;line-height:1.5;color:var(--muted)}.payroll-rule{background:#f8fafc}.payroll-rate{background:#fff9ec}.payroll-filter{grid-template-columns:145px 145px 180px minmax(220px,1fr) auto}.payroll-stack{display:grid;gap:10px}.payroll-card{padding:0;overflow:hidden}.payroll-card>header{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 13px;background:linear-gradient(135deg,#172a43,#213d5e);color:#fff}.payroll-card header b{font-size:13px}.payroll-card header small{display:block;margin-top:3px;font-size:9px;color:#c9d5e1}.payroll-card header>div:last-child{display:flex;align-items:center;gap:7px}.payroll-card header strong{font-size:12px}.payroll-status{padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.22);font-size:8.5px;font-weight:850}.payroll-status.timecard_checked,.payroll-status.verified,.payroll-status.external_verified{background:rgba(69,170,103,.22)}.payroll-status.needs_review{background:rgba(218,154,38,.28)}.payroll-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--line)}.payroll-summary-grid>div{padding:9px 11px;border-right:1px solid #edf0f3}.payroll-summary-grid>div:last-child{border-right:0}.payroll-summary-grid span{display:block;font-size:8px;font-weight:900;color:var(--muted);text-transform:uppercase}.payroll-summary-grid b{display:block;margin-top:3px;font-size:10px;line-height:1.4}.payroll-summary-grid small{display:block;margin-top:3px;font-size:8.5px;color:var(--muted);line-height:1.4}.payroll-warning{padding:8px 12px;background:#fff6df;border-bottom:1px solid #ead29a;color:#765300;font-size:9.5px;font-weight:700}.payroll-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:9px 12px;background:#f8fafc;border-bottom:1px solid var(--line)}.payroll-audit{margin-left:auto;font-size:8.5px;color:var(--muted)}.payroll-worker-table{overflow:auto;padding:0 10px}.payroll-worker-table table{width:100%;min-width:1100px}.payroll-worker-table th,.payroll-worker-table td{font-size:9px;vertical-align:middle;white-space:normal}.payroll-worker-table td:first-child{min-width:150px}.payroll-worker-table td small{display:block;margin-top:2px;color:var(--muted)}.payroll-worker-table select,.payroll-worker-table input{width:100%;min-height:31px;border:1px solid var(--line);border-radius:7px;background:#fff;padding:5px 6px;font-size:9px}.payroll-worker-table input[type=time]{min-width:88px}.payroll-worker-table input[type=number]{min-width:72px}.match-toggle{display:flex;align-items:center;gap:5px;padding:6px 7px;border:1px solid #d9e0e7;border-radius:8px;background:#f8fafc;font-weight:800;color:var(--muted);white-space:nowrap}.match-toggle input{width:auto!important;min-height:auto!important}.match-toggle.matched{background:#edf8f1;border-color:#b9ddc5;color:#287643}.rate-state{display:inline-flex;padding:5px 7px;border-radius:999px;background:#fff4da;color:#7a5600;font-size:8px;font-weight:850;white-space:nowrap}.payroll-confirm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:end;padding:10px 12px;border-top:1px solid var(--line);background:#fbfcfd}.payroll-confirm>label{display:grid;gap:4px;font-size:9px;font-weight:850;color:var(--muted)}.payroll-confirm>label input{min-height:34px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:9.5px}.payroll-confirm>div{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.match-ready,.match-wait{font-size:8.5px;font-weight:850}.match-ready{color:#287643}.match-wait{color:#a16a00}.legacy-payroll{border-top:1px solid var(--line);background:#fff}.legacy-payroll summary{padding:9px 12px;cursor:pointer;font-size:9px;font-weight:800;color:var(--muted)}.legacy-payroll>div{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:end;padding:0 12px 11px}.legacy-payroll label{display:grid;gap:4px;font-size:8.5px;font-weight:800;color:var(--muted)}.legacy-payroll input{min-height:33px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:9px}
      @media(max-width:1150px){.supervisor-resolve{grid-template-columns:1fr 1fr}.supervisor-resolve>b{grid-column:1/-1}.labour-person{grid-template-columns:1fr 1fr 1fr}.labour-person-name{grid-column:1/-1}.labour-person .link-danger{justify-self:start}.payroll-summary-grid{grid-template-columns:1fr 1fr}.payroll-summary-grid>div:nth-child(2){border-right:0}.payroll-intro{grid-template-columns:1fr}.payroll-intro>div{border-right:0;border-bottom:1px solid var(--line)}}@media(max-width:760px){.supervisor-resolve{grid-template-columns:1fr}.supervisor-resolve>b{grid-column:auto}.labour-filter,.report-filter,.payroll-filter{grid-template-columns:1fr 1fr}.labour-search{grid-column:1/-1}.labour-kpis{grid-template-columns:1fr 1fr}.labour-card>header,.payroll-card>header{align-items:flex-start}.labour-source,.payroll-summary-grid{grid-template-columns:1fr}.payroll-summary-grid>div{border-right:0;border-bottom:1px solid #edf0f3}.labour-person{grid-template-columns:1fr 1fr}.labour-person-name{grid-column:1/-1}.labour-confirm,.payroll-confirm{grid-template-columns:1fr}.legacy-payroll>div{grid-template-columns:1fr}}@media print{.labour-mode,.labour-filter,.report-filter,.labour-kpis,.labour-readonly,.labour-tools,.labour-confirm,.payroll-actions,.payroll-confirm,.legacy-payroll,.notice{display:none!important}.payroll-card{break-inside:avoid}}
    `}</style>
  </AppShell>
}
