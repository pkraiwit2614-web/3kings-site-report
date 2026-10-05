'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { getSupabase } from '@/lib/supabase'
import { readAllPages, requireCompletePagedReads } from '@/lib/pagedRead'
import { dateTH } from '@/lib/format'
import { bangkokToday, isBatchWorkDateUsable, latestUsableDate } from '@/lib/workDateIntegrity'
import { confirmedHeadcount, countLabel, headcountSourceStatus, isHeadcountConfirmed, isHeadcountReviewCase, maleFemaleHeadcount } from '@/lib/headcountReconciliation'
import type { Project } from '@/lib/types'
import {canManageLabour,canViewPayroll,resolveAccessRole,type AccessRole} from '@/lib/accessControl'
import useRolePreview from '@/components/useRolePreview'
import { canUseCanonicalDownstream, canonicalFlowState, deriveSuspectedCanonicalFallback, type CanonicalStateRow } from '@/lib/siteOperationsCanonical'

type SiteEntry={id:string;work_date:string;source_row:number;project_name_raw:string|null;area_raw:string|null;supervisor_raw:string|null;male_count:number|null;female_count:number|null;total_manpower:number|null;work_detail:string|null;status_text:string|null;next_plan:string|null;afternoon_detail:string|null;specific_area:string|null;source_fingerprint:string;supervisor_worker_id:string|null;work_date_validation_status?:string|null;work_date_validation_reason?:string|null}
type Batch={id:string;site_operations_entry_id:string;work_date:string;expected_headcount:number|null;confirmed_headcount:number|null;confirmed_headcount_basis:string|null;confirmed_headcount_evidence:string|null;headcount_source_status:'matched'|'mismatch'|'unknown'|null;headcount_confirmation_status:'confirmed'|'unconfirmed'|null;headcount_confirmed_at:string|null;supervisor_worker_id:string|null;supervisor_raw:string|null;home_team:string|null;verification_status:string;verified_by:string|null;verified_at:string|null;verified_source_fingerprint:string|null;note:string|null;concurrency_revision:number;contractor_person_count:number|null;contractor_count_basis:string|null;contractor_count_evidence:string|null;contractor_count_confirmed_at:string|null}
type Worker={worker_id:string;full_name:string;nickname:string|null;trade_skill:string|null;default_team:string|null;status:string|null;display_label:string|null;worker_class:'company'|'contractor'|'non_person';payroll_eligible:boolean;payroll_eligibility_source:string;payroll_eligibility_evidence:string|null}
type EntryProject={entry_id:string;project_id:string}
type Assignment={id:string;batch_id:string;worker_id:string;work_date:string;project_id:string|null;home_team:string|null;working_team:string|null;movement_status:string;allocation_hours:number|null;allocation_share:number|null;work_detail:string|null;notes:string|null;verified_at:string|null}
type DraftAssignment={worker_id:string;project_id:string;working_team:string;movement_status:string;allocation_hours:string;notes:string}
type PayrollRecord={id:string;labour_batch_id:string;verification_method:'web'|'legacy_excel';status:'draft'|'timecard_checked'|'verified'|'external_verified'|'needs_review';source_labour_verified_at:string|null;external_reference:string|null;note:string|null;timecard_checked_at:string|null;verified_at:string|null;updated_at:string;concurrency_revision:number}
type PayrollItem={id:string;record_id:string;labour_assignment_id:string|null;worker_id:string;attendance_status:string;clock_in:string|null;clock_out:string|null;clock_spans_next_day:boolean;attendance_exception_requested:boolean;attendance_exception_reason:string|null;attendance_exception_evidence:string|null;attendance_exception_approved_by:string|null;attendance_exception_approved_at:string|null;work_units:number;ot_hours:number;timecard_match:boolean;regular_rate:number|null;ot_rate:number|null;regular_pay:number|null;ot_pay:number|null;adjustment:number;total_pay:number|null;calculation_status:string;note:string|null}
type PayrollDraftItem={labour_assignment_id:string;worker_id:string;attendance_status:string;clock_in:string;clock_out:string;clock_spans_next_day:boolean;attendance_exception_requested:boolean;attendance_exception_reason:string;attendance_exception_evidence:string;work_units:string;ot_hours:string;timecard_match:boolean;regular_rate:number|null;ot_rate:number|null;regular_pay:number|null;ot_pay:number|null;adjustment:number;total_pay:number|null;calculation_status:string;note:string}
type HeadcountDraft={count:string;basis:string;evidence:string}
type ContractorCountDraft={count:string;basis:string;evidence:string;source_fingerprint:string;batch_revision:number}
type DraftBase={source_fingerprint:string;batch_revision:number}
type PayrollDraftBase=DraftBase&{payroll_revision:number}

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
function headcountBasisLabel(value:string|null|undefined){
  const map:Record<string,string>={source_total:'Source total',male_female:'ชาย + หญิง',daily_report:'Daily Report',monthly_report:'Monthly Report',company_roster:'Company roster',legacy_verified_roster:'Roster ที่เคยยืนยันแล้ว',contractor_only:'ผู้รับเหมาเท่านั้น',manual_review:'ตรวจไขว้ด้วยคน'}
  return value?map[value]||value:'-'
}
function contractorBasisLabel(value:string|null|undefined){
  const map:Record<string,string>={daily_report:'Daily Report',monthly_report:'Monthly Report',contractor_roster:'Contractor roster',manual_review:'ตรวจไขว้ด้วยคน'}
  return value?map[value]||value:'-'
}
function isCompanyPayrollWorker(worker:Worker|undefined|null){
  return Boolean(worker&&worker.worker_class==='company'&&worker.payroll_eligible)
}

export default function LabourVerificationPage(){
  const [loading,setLoading]=useState(true)
  const [loadError,setLoadError]=useState(false)
  const [actualAccessRole,setActualAccessRole]=useState<AccessRole|null>(null)
  const [entries,setEntries]=useState<SiteEntry[]>([])
  const [batches,setBatches]=useState<Batch[]>([])
  const [workers,setWorkers]=useState<Worker[]>([])
  const [projects,setProjects]=useState<Project[]>([])
  const [entryProjects,setEntryProjects]=useState<EntryProject[]>([])
  const [assignments,setAssignments]=useState<Assignment[]>([])
  const [payrollRecords,setPayrollRecords]=useState<PayrollRecord[]>([])
  const [payrollItems,setPayrollItems]=useState<PayrollItem[]>([])
  const [canonicalStates,setCanonicalStates]=useState<CanonicalStateRow[]>([])
  const [selectedDate,setSelectedDate]=useState('')
  const [statusFilter,setStatusFilter]=useState('')
  const [q,setQ]=useState('')
  const [mode,setMode]=useState<'verify'|'payroll'>('verify')
  const [dateFrom,setDateFrom]=useState('')
  const [dateTo,setDateTo]=useState('')
  const [payrollStatusFilter,setPayrollStatusFilter]=useState('')
  const [drafts,setDrafts]=useState<Record<string,DraftAssignment[]>>({})
  const [draftBases,setDraftBases]=useState<Record<string,DraftBase>>({})
  const [payrollDrafts,setPayrollDrafts]=useState<Record<string,PayrollDraftItem[]>>({})
  const [payrollDraftBases,setPayrollDraftBases]=useState<Record<string,PayrollDraftBase>>({})
  const [payrollNotes,setPayrollNotes]=useState<Record<string,string>>({})
  const [externalRefs,setExternalRefs]=useState<Record<string,string>>({})
  const [notes,setNotes]=useState<Record<string,string>>({})
  const [addWorker,setAddWorker]=useState<Record<string,string>>({})
  const [supervisorPick,setSupervisorPick]=useState<Record<string,string>>({})
  const [headcountDrafts,setHeadcountDrafts]=useState<Record<string,HeadcountDraft>>({})
  const [contractorDrafts,setContractorDrafts]=useState<Record<string,ContractorCountDraft>>({})
  const [saving,setSaving]=useState<Record<string,boolean>>({})
  const [message,setMessage]=useState('')
  const [refreshTick,setRefreshTick]=useState(0)
  const [focusEntry,setFocusEntry]=useState('')
  const [duplicateEvidence,setDuplicateEvidence]=useState<Record<string,string>>({})
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
      const emptyPayrollRecord={label:'payroll_verification_records',data:[] as PayrollRecord[],count:0,loaded:0,truncated:false,pages:0}
      const emptyPayrollItem={label:'payroll_verification_items',data:[] as PayrollItem[],count:0,loaded:0,truncated:false,pages:0}
      const [e,b,w,p,ep,a,pr,pi]=await Promise.all([
        readAllPages<SiteEntry>({label:'site_operations_entries',keyOf:x=>x.id,fetchPage:(from,to)=>s.from('site_operations_entries').select('id,work_date,source_row,project_name_raw,area_raw,supervisor_raw,male_count,female_count,total_manpower,work_detail,status_text,next_plan,afternoon_detail,specific_area,source_fingerprint,supervisor_worker_id,work_date_validation_status,work_date_validation_reason',{count:'exact'}).order('work_date',{ascending:false}).order('source_row',{ascending:false}).order('id',{ascending:false}).range(from,to)}),
        readAllPages<Batch>({label:'labour_verification_batches',keyOf:x=>x.id,fetchPage:(from,to)=>s.from('labour_verification_batches').select('*',{count:'exact'}).order('work_date',{ascending:false}).order('id',{ascending:false}).range(from,to)}),
        readAllPages<Worker>({label:'labour_workers',keyOf:x=>x.worker_id,fetchPage:(from,to)=>s.from('labour_workers').select('worker_id,full_name,nickname,trade_skill,default_team,status,display_label,worker_class,payroll_eligible,payroll_eligibility_source,payroll_eligibility_evidence',{count:'exact'}).order('worker_id').range(from,to)}),
        readAllPages<Project>({label:'projects',keyOf:x=>x.id,fetchPage:(from,to)=>s.from('projects').select('id,code,name,site_group,target_handover,active,sort_order',{count:'exact'}).order('sort_order').order('id').range(from,to)}),
        readAllPages<EntryProject>({label:'site_operations_entry_projects',keyOf:x=>x.entry_id+':'+x.project_id,fetchPage:(from,to)=>s.from('site_operations_entry_projects').select('entry_id,project_id',{count:'exact'}).order('entry_id').order('project_id').range(from,to)}),
        readAllPages<Assignment>({label:'labour_daily_assignments',keyOf:x=>x.id,fetchPage:(from,to)=>s.from('labour_daily_assignments').select('*',{count:'exact'}).order('work_date',{ascending:false}).order('id',{ascending:false}).range(from,to)}),
        payrollAllowed?readAllPages<PayrollRecord>({label:'payroll_verification_records',keyOf:x=>x.id,fetchPage:(from,to)=>s.from('payroll_verification_records').select('*',{count:'exact'}).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(from,to)}):Promise.resolve(emptyPayrollRecord),
        payrollAllowed?readAllPages<PayrollItem>({label:'payroll_verification_items',keyOf:x=>x.id,fetchPage:(from,to)=>s.from('payroll_verification_items').select('*',{count:'exact'}).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(from,to)}):Promise.resolve(emptyPayrollItem)
      ])
      const paged=payrollAllowed?[e,b,w,p,ep,a,pr,pi]:[e,b,w,p,ep,a]
      setReadSignals(paged.map(({label,loaded,count,truncated})=>({label,loaded,count,truncated})))
      requireCompletePagedReads(paged)
      let nextCanonical:CanonicalStateRow[]=[]
      try{
        const canonical=await readAllPages<CanonicalStateRow>({label:'v_site_operations_canonical_state',keyOf:x=>x.entry_id,fetchPage:(from,to)=>
          s.from('v_site_operations_canonical_state').select('entry_id,source_row,group_id,group_state,canonical_entry_id,flow_state,decision_evidence,decided_at',{count:'exact'}).order('source_row',{ascending:false}).range(from,to)})
        nextCanonical=canonical.data
      }catch{nextCanonical=deriveSuspectedCanonicalFallback(e.data)}
      if(!alive)return
      const nextEntries=e.data
      setEntries(nextEntries);setBatches(b.data);setWorkers(w.data)
      setProjects(p.data);setEntryProjects(ep.data);setAssignments(a.data)
      setPayrollRecords(pr.data);setPayrollItems(pi.data);setCanonicalStates(nextCanonical)
      setActualAccessRole(nextAccessRole)
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

  const {presentationRole,ready:rolePreviewReady}=useRolePreview(actualAccessRole)
  const canVerify=rolePreviewReady&&canManageLabour(presentationRole)
  const canPayroll=rolePreviewReady&&canViewPayroll(presentationRole)
  useEffect(()=>{
    if(rolePreviewReady&&!canPayroll&&mode==='payroll')setMode('verify')
  },[rolePreviewReady,canPayroll,mode])
  const today=bangkokToday()
  const entryById=useMemo(()=>new Map(entries.map(x=>[x.id,x])),[entries])
  const canonicalByEntry=useMemo(()=>new Map(canonicalStates.map(x=>[x.entry_id,x])),[canonicalStates])
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
  const workDateUsableBatches=useMemo(()=>batches.filter(batch=>isBatchWorkDateUsable(batch,entryById.get(batch.site_operations_entry_id),today)),[batches,entryById,today])
  const usableBatches=useMemo(()=>workDateUsableBatches.filter(batch=>canUseCanonicalDownstream(canonicalByEntry.get(batch.site_operations_entry_id))),[workDateUsableBatches,canonicalByEntry])
  const duplicateReviewGroups=useMemo(()=>{
    const map=new Map<string,CanonicalStateRow[]>()
    for(const row of canonicalStates){
      if(!row.group_id||row.group_state!=='suspected'||canonicalFlowState(row)!=='suspected')continue
      const list=map.get(row.group_id)||[];list.push(row);map.set(row.group_id,list)
    }
    return Array.from(map.entries()).map(([id,rows])=>({id,rows:rows.sort((a,b)=>a.source_row-b.source_row)}))
  },[canonicalStates])
  const availableDates=useMemo(()=>Array.from(new Set(usableBatches.map(x=>x.work_date))).sort((a,b)=>b.localeCompare(a)),[usableBatches])
  const teamOptions=useMemo(()=>Array.from(new Set([...workers.map(x=>x.default_team),...batches.map(x=>x.home_team)].filter(Boolean) as string[])).sort((a,b)=>a.localeCompare(b,'th')),[workers,batches])
  const activeWorkers=useMemo(()=>workers.filter(x=>String(x.status||'').toLowerCase()!=='inactive'),[workers])
  const payrollWorkers=useMemo(()=>activeWorkers.filter(isCompanyPayrollWorker),[activeWorkers])

  const labourStatusFor=(batch:Batch)=>{
    const entry=entryById.get(batch.site_operations_entry_id)
    if(!entry)return batch.verification_status
    if(isHeadcountReviewCase(batch,entry))return 'needs_review'
    if(batch.verification_status==='verified'&&(
      !batch.verified_source_fingerprint||
      batch.verified_source_fingerprint!==entry.source_fingerprint
    ))return 'needs_review'
    return batch.verification_status
  }
  const visibleBatches=useMemo(()=>{
    const needle=q.trim().toLowerCase()
    return usableBatches.filter(batch=>{
      if(selectedDate&&batch.work_date!==selectedDate)return false
      if(statusFilter&&labourStatusFor(batch)!==statusFilter)return false
      if(focusEntry&&batch.site_operations_entry_id!==focusEntry)return false
      if(!needle)return true
      const entry=entryById.get(batch.site_operations_entry_id)
      return [batch.supervisor_raw,batch.home_team,entry?.area_raw,entry?.project_name_raw,entry?.work_detail].join(' ').toLowerCase().includes(needle)
    })
  },[usableBatches,selectedDate,statusFilter,focusEntry,q,entryById])
  const ensureBatchWorkDateUsable=(batch:Batch)=>{if(isBatchWorkDateUsable(batch,entryById.get(batch.site_operations_entry_id),bangkokToday()))return true;setMessage('Work Date รายการนี้ถูกกักไว้เพื่อตรวจสอบ • ห้ามยืนยัน Labour/Payroll จนกว่าจะมีหลักฐานแก้วันที่ต้นทาง');return false}
  const draftBaseFor=(batch:Batch):DraftBase|null=>{
    const entry=entryById.get(batch.site_operations_entry_id)
    const revision=Number(batch.concurrency_revision)
    if(!entry?.source_fingerprint||!Number.isInteger(revision)||revision<1)return null
    return {source_fingerprint:entry.source_fingerprint,batch_revision:revision}
  }
  const payrollDraftBaseFor=(batch:Batch,record?:PayrollRecord):PayrollDraftBase|null=>{
    const base=draftBaseFor(batch)
    if(!base)return null
    const payrollRevision=record?Number(record.concurrency_revision):0
    if(!Number.isInteger(payrollRevision)||payrollRevision<0)return null
    return {...base,payroll_revision:payrollRevision}
  }

  const draftFor=(batch:Batch)=>drafts[batch.id]||[]
  const updateDraft=(batchId:string,index:number,patch:Partial<DraftAssignment>)=>{
    setDrafts(prev=>({...prev,[batchId]:(prev[batchId]||[]).map((x,i)=>i===index?{...x,...patch}:x)}))
  }
  const loadExisting=(batch:Batch)=>{
    const base=draftBaseFor(batch)
    if(!base){setMessage('โหลด Draft ไม่ได้ เพราะยังไม่มี source/revision ที่เชื่อถือได้');return}
    const rows=(assignmentsByBatch.get(batch.id)||[])
    setDraftBases(prev=>({...prev,[batch.id]:base}))
    setDrafts(prev=>({...prev,[batch.id]:rows.map(x=>({
      worker_id:x.worker_id,project_id:x.project_id||'',working_team:x.working_team||x.home_team||'',
      movement_status:x.movement_status||'same_team',allocation_hours:x.allocation_hours===null?'':String(x.allocation_hours),notes:x.notes||''
    }))}))
    setNotes(prev=>({...prev,[batch.id]:batch.note||''}))
  }
  const useHomeTeam=(batch:Batch)=>{
    const base=draftBaseFor(batch)
    if(!base){setMessage('สร้าง Draft ไม่ได้ เพราะยังไม่มี source/revision ที่เชื่อถือได้');return}
    setDraftBases(prev=>({...prev,[batch.id]:base}))
    const candidates=payrollWorkers.filter(w=>batch.home_team&&w.default_team===batch.home_team)
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
    if(!draftBases[batch.id]){
      const base=draftBaseFor(batch)
      if(!base){setMessage('แก้ Draft ไม่ได้ เพราะยังไม่มี source/revision ที่เชื่อถือได้');return}
      setDraftBases(prev=>({...prev,[batch.id]:base}))
    }
    if(!isCompanyPayrollWorker(worker)){setMessage('รายการนี้ไม่ใช่ Worker Payroll • '+(worker?.payroll_eligibility_source||worker?.worker_class||'ไม่ทราบ classification'));return}
    if(existing.some(x=>x.worker_id===workerId)){setMessage('คนงานคนนี้อยู่ในรายการแล้ว');return}
    const pids=projectIdsByEntry.get(batch.site_operations_entry_id)||[]
    const workingTeam=batch.home_team||''
    if(!workingTeam){setMessage('ยังไม่ทราบทีมที่ทำงานจริงของชุดนี้ • กรุณาตรวจ/ยืนยันทีมก่อนเพิ่มคน');return}
    setDrafts(prev=>({...prev,[batch.id]:[...existing,{
      worker_id:workerId,project_id:pids.length===1?pids[0]:'',working_team:workingTeam,
      movement_status:worker?.default_team?worker.default_team===workingTeam?'same_team':'borrowed':'other',allocation_hours:'',notes:''
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

  const updateHeadcountDraft=(batchId:string,patch:Partial<HeadcountDraft>)=>{
    setHeadcountDrafts(prev=>({...prev,[batchId]:{...(prev[batchId]||{count:'',basis:'',evidence:''}),...patch}}))
  }
  const beginHeadcountEdit=(batch:Batch)=>{
    setHeadcountDrafts(prev=>({...prev,[batch.id]:{
      count:batch.confirmed_headcount===null?'':String(batch.confirmed_headcount),
      basis:batch.confirmed_headcount_basis||'',
      evidence:batch.confirmed_headcount_evidence||''
    }}))
  }
  const confirmHeadcount=async(batch:Batch)=>{
    if(!canVerify||saving['headcount-'+batch.id]||!ensureBatchWorkDateUsable(batch))return
    const draft=headcountDrafts[batch.id]||{count:'',basis:'',evidence:''}
    if(draft.count.trim()===''||!/^\\d+$/.test(draft.count.trim())){setMessage('กรุณาระบุ Confirmed headcount เป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');return}
    if(!draft.basis){setMessage('กรุณาระบุหลักฐานที่ใช้ยืนยัน Headcount');return}
    const entry=entryById.get(batch.site_operations_entry_id)
    const sourceStatus=entry?headcountSourceStatus(batch,entry):'unknown'
    const needsEvidence=sourceStatus!=='matched'||['daily_report','monthly_report','company_roster','contractor_only','manual_review'].includes(draft.basis)
    if(needsEvidence&&!draft.evidence.trim()){setMessage('กรณีข้อมูลขัดกัน/ไม่ครบ ต้องใส่หลักฐานหรือเหตุผลที่ใช้ยืนยัน โดยไม่แก้ raw source');return}
    setSaving(prev=>({...prev,['headcount-'+batch.id]:true}));setMessage('')
    try{
      const {data,error}=await getSupabase().rpc('labour_confirm_headcount',{
        p_batch_id:batch.id,p_confirmed_headcount:Number(draft.count),p_basis:draft.basis,p_evidence_note:draft.evidence||''
      })
      if(error)throw error
      setMessage('ยืนยัน Headcount แล้ว '+String(data)+' คน • downstream จะใช้ค่านี้แทน raw source')
      setHeadcountDrafts(prev=>{const next={...prev};delete next[batch.id];return next})
      setRefreshTick(v=>v+1)
    }catch(err:any){setMessage(String(err?.message||'ยืนยัน Headcount ไม่สำเร็จ'))}
    finally{setSaving(prev=>({...prev,['headcount-'+batch.id]:false}))}
  }


  const beginContractorEdit=(batch:Batch)=>{
    const base=draftBaseFor(batch)
    if(!base){setMessage('ยืนยัน Contractor count ไม่ได้ เพราะยังไม่มี source/revision ที่เชื่อถือได้');return}
    setContractorDrafts(prev=>({...prev,[batch.id]:{
      count:batch.contractor_person_count===null?'':String(batch.contractor_person_count),
      basis:batch.contractor_count_basis||'',
      evidence:batch.contractor_count_evidence||'',
      source_fingerprint:base.source_fingerprint,
      batch_revision:base.batch_revision
    }}))
  }
  const updateContractorDraft=(batchId:string,patch:Partial<ContractorCountDraft>)=>{
    setContractorDrafts(prev=>({...prev,[batchId]:{...prev[batchId],...patch}}))
  }
  const confirmContractorCount=async(batch:Batch)=>{
    if(!canVerify||saving['contractor-'+batch.id]||!ensureBatchWorkDateUsable(batch))return
    const draft=contractorDrafts[batch.id]
    if(!draft||draft.count.trim()===''||!/^\d+$/.test(draft.count.trim())){setMessage('กรุณาระบุ Contractor / non-payroll people เป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');return}
    if(!draft.basis||!draft.evidence.trim()){setMessage('Contractor count ต้องมีที่มาและหลักฐานแยกจากหมายเหตุทั่วไป');return}
    setSaving(prev=>({...prev,['contractor-'+batch.id]:true}));setMessage('')
    try{
      const {data,error}=await getSupabase().rpc('labour_confirm_contractor_count',{
        p_batch_id:batch.id,p_count:Number(draft.count),p_basis:draft.basis,p_evidence:draft.evidence,
        p_expected_source_fingerprint:draft.source_fingerprint,p_expected_batch_revision:draft.batch_revision
      })
      if(error)throw error
      setMessage('ยืนยัน Contractor / non-payroll people แล้ว '+String(data)+' คน • ไม่กระทบ raw reported manpower หรือ Confirmed Worker Payroll')
      setContractorDrafts(prev=>{const next={...prev};delete next[batch.id];return next})
      setRefreshTick(v=>v+1)
    }catch(err:any){
      const raw=String(err?.message||'ยืนยัน Contractor count ไม่สำเร็จ')
      if(raw.includes('STALE_CONTRACTOR_COUNT_RELOAD_REQUIRED')){setMessage('Source/Batch เปลี่ยนหลังเริ่มแก้ Contractor count • ระบบปฏิเสธ stale save และเก็บ Draft ไว้ กรุณาตรวจข้อมูลล่าสุดก่อนบันทึกใหม่');setRefreshTick(v=>v+1)}
      else setMessage(raw)
    }finally{setSaving(prev=>({...prev,['contractor-'+batch.id]:false}))}
  }

  const saveBatch=async(batch:Batch)=>{
    if(!canVerify||saving[batch.id]||!ensureBatchWorkDateUsable(batch))return
    const base=draftBases[batch.id]
    if(!base){setMessage('Draft นี้ยังไม่มี revision อ้างอิง • กรุณาโหลดรายการเดิมหรือสร้าง Draft ใหม่ก่อนบันทึก');return}
    const rows=draftFor(batch)
    const authority=confirmedHeadcount(batch)
    if(authority===null){setMessage('ต้องยืนยัน Confirmed headcount ก่อนยืนยันทีมคนงาน');return}
    if(rows.length!==authority){setMessage('รายชื่อคนงานต้องตรงกับ Confirmed headcount ก่อนยืนยัน • ห้ามใช้หมายเหตุเพื่อข้ามจำนวน');return}
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
        p_batch_id:batch.id,p_note:notes[batch.id]||'',p_assignments:payload,
        p_expected_source_fingerprint:base.source_fingerprint,p_expected_batch_revision:base.batch_revision
      })
      if(error)throw error
      setMessage('ยืนยันทีมคนงานแล้ว '+String(data||rows.length)+' คน • เก็บเป็น Verified Labour Dataset')
      setDraftBases(prev=>({...prev,[batch.id]:{source_fingerprint:base.source_fingerprint,batch_revision:base.batch_revision+1}}))
      setRefreshTick(v=>v+1)
    }catch(err:any){
      const raw=String(err?.message||'ยืนยันไม่สำเร็จ')
      if(raw.includes('STALE_LABOUR_SAVE_RELOAD_REQUIRED')){setMessage('มีข้อมูล Labour/Source ใหม่กว่าตอนที่เริ่มแก้ • ระบบปฏิเสธการบันทึกเพื่อไม่ให้ทับข้อมูลล่าสุด • Draft ของคุณยังอยู่ กรุณาโหลดข้อมูลล่าสุดและ reconcile ก่อนบันทึกใหม่');setRefreshTick(v=>v+1)}
      else if(raw.includes('HEADCOUNT_CONFIRMATION_REQUIRED'))setMessage('ยังไม่มี Confirmed headcount • กรุณาตรวจหลักฐานและยืนยันจำนวนก่อน')
      else if(raw.includes('HEADCOUNT_MISMATCH'))setMessage('จำนวนรายชื่อไม่ตรงกับ Confirmed headcount • ต้องแก้จำนวนหรือรายชื่อให้ตรงกันก่อน')
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
    if(labourStatusFor(batch)!=='verified'&&record.status!=='draft')return 'needs_review'
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
    const base=payrollDraftBaseFor(batch,record)
    if(!base){setMessage('เริ่ม Payroll Draft ไม่ได้ เพราะยังไม่มี source/revision ที่เชื่อถือได้');return}
    setPayrollDraftBases(prev=>({...prev,[batch.id]:base}))
    const saved=record?payrollItemsByRecord.get(record.id)||[]:[]
    const savedByWorker=new Map(saved.map(x=>[x.worker_id,x]))
    const rows=(assignmentsByBatch.get(batch.id)||[])
    setPayrollDrafts(prev=>({...prev,[batch.id]:rows.map(a=>{
      const old=savedByWorker.get(a.worker_id)
      return {
        labour_assignment_id:a.id,worker_id:a.worker_id,
        attendance_status:old?.attendance_status||'present',
        clock_in:old?.clock_in?.slice(0,5)||'',clock_out:old?.clock_out?.slice(0,5)||'',
        clock_spans_next_day:Boolean(old?.clock_spans_next_day),attendance_exception_requested:Boolean(old?.attendance_exception_requested),
        attendance_exception_reason:old?.attendance_exception_reason||'',attendance_exception_evidence:old?.attendance_exception_evidence||'',
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
  const attendanceEvidenceIssue=(row:PayrollDraftItem)=>{
    const units=Number(row.work_units),ot=Number(row.ot_hours)
    const hasException=Boolean(row.attendance_exception_requested)
    const exceptionComplete=hasException&&Boolean(row.attendance_exception_reason.trim())&&Boolean(row.attendance_exception_evidence.trim())
    const hasIn=Boolean(row.clock_in),hasOut=Boolean(row.clock_out)
    if(hasException&&!exceptionComplete)return 'ข้อยกเว้นต้องระบุเหตุผลและหลักฐานให้ครบ'
    if(!hasException&&(row.attendance_exception_reason.trim()||row.attendance_exception_evidence.trim()))return 'ต้องเลือกใช้ข้อยกเว้นอย่างชัดเจนก่อน'
    if(row.attendance_status==='absent'&&(units!==0||ot!==0))return 'สถานะขาดต้องเป็นวันทำงาน 0 และ OT 0'
    if(row.attendance_status==='leave'&&(units!==0||ot!==0))return 'สถานะลาต้องเป็นวันทำงาน 0 และ OT 0'
    if(row.attendance_status==='half_day'&&units!==0.5)return 'สถานะครึ่งวันต้องเป็นวันทำงาน 0.5'
    if(row.attendance_status==='present'&&units<=0)return 'สถานะมาทำงานต้องมีวันทำงานมากกว่า 0'
    if(row.attendance_status==='other'&&!exceptionComplete)return 'สถานะอื่น ๆ ต้องมีข้อยกเว้นพร้อมเหตุผลและหลักฐาน'
    if(row.attendance_status==='present'&&!(hasIn&&hasOut)&&!exceptionComplete)return 'มาทำงานต้องมีเวลาเข้า-ออกครบ หรือใช้ข้อยกเว้นพร้อมหลักฐาน'
    if(hasIn!==hasOut&&!exceptionComplete)return 'มีเวลาเข้า/ออกเพียงด้านเดียว ต้องเติม punch ให้ครบหรือใช้ข้อยกเว้น'
    if(row.clock_spans_next_day&&!(hasIn&&hasOut))return 'ข้ามวันใช้ได้เมื่อมีเวลาเข้า-ออกครบเท่านั้น'
    if(hasIn&&hasOut){
      if(row.clock_in===row.clock_out)return 'เวลาเข้าและออกห้ามเท่ากัน'
      if(row.clock_spans_next_day){
        if(row.clock_out>=row.clock_in)return 'เลือกข้ามวันแล้ว เวลาออกต้องอยู่วันถัดไปอย่างชัดเจน'
      }else if(row.clock_out<=row.clock_in)return 'เวลาออกก่อนเวลาเข้า ต้องเลือก “ออกวันถัดไป” อย่างชัดเจน'
    }
    return null
  }
  const markAllTimecards=(batch:Batch,matched:boolean)=>{
    const rows=payrollDrafts[batch.id]||[]
    if(!matched){setPayrollDrafts(prev=>({...prev,[batch.id]:(prev[batch.id]||[]).map(x=>({...x,timecard_match:false}))}));return}
    const blocked=rows.filter(x=>attendanceEvidenceIssue(x)).length
    setPayrollDrafts(prev=>({...prev,[batch.id]:(prev[batch.id]||[]).map(x=>({...x,timecard_match:!attendanceEvidenceIssue(x)}))}))
    setMessage(blocked?('ติ๊กให้เฉพาะรายการที่หลักฐานครบ • ยังติด '+blocked+' คน'):'หลักฐานครบทุกคน • ติ๊กตรงกับบัตรตอกแล้ว')
  }
  const clearAllOt=(batch:Batch)=>{
    setPayrollDrafts(prev=>({...prev,[batch.id]:(prev[batch.id]||[]).map(x=>Number(x.ot_hours||0)===0?x:{...x,ot_hours:'0',timecard_match:false})}))
  }
  const savePayrollWeb=async(batch:Batch,status:'draft'|'timecard_checked')=>{
    if(!canPayroll||saving['payroll-'+batch.id]||!ensureBatchWorkDateUsable(batch))return
    if(labourStatusFor(batch)!=='verified'){setMessage('ข้อมูลต้นทางมีการเปลี่ยนหลังยืนยันทีม • ต้องตรวจและยืนยันทีมรายวันใหม่ก่อนตรวจ Payroll');return}
    const base=payrollDraftBases[batch.id]
    if(!base){setMessage('Payroll Draft นี้ยังไม่มี revision อ้างอิง • กรุณาเปิดรายการล่าสุดก่อนบันทึก');return}
    const rows=payrollDraftFor(batch)
    if(!rows.length){setMessage('ยังไม่มีรายชื่อคนงานสำหรับตรวจบัตรตอก กรุณายืนยันทีมรายวันก่อน');return}
    if(status==='timecard_checked'){
      const blocked=rows.find(x=>!x.timecard_match||attendanceEvidenceIssue(x))
      if(blocked){setMessage(attendanceEvidenceIssue(blocked)||'ยังมีคนงานที่ไม่ได้ติ๊ก “ตรงกับบัตรตอก”');return}
    }
    setSaving(prev=>({...prev,['payroll-'+batch.id]:true}));setMessage('')
    try{
      if(rows.some(x=>![x.work_units,x.ot_hours].every(v=>v.trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&/^\d+(?:\.\d{1,2})?$/.test(v))||Number(x.work_units)>1||Number(x.ot_hours)>24)){
        throw new Error('กรุณาระบุวันทำงาน 0–1 และ OT 0–24 เป็นตัวเลขทศนิยมไม่เกิน 2 ตำแหน่ง')
      }
      const payload=rows.map(x=>({
        labour_assignment_id:x.labour_assignment_id,worker_id:x.worker_id,attendance_status:x.attendance_status,
        clock_in:x.clock_in||null,clock_out:x.clock_out||null,clock_spans_next_day:x.clock_spans_next_day,
        attendance_exception_requested:x.attendance_exception_requested,attendance_exception_reason:x.attendance_exception_reason||null,
        attendance_exception_evidence:x.attendance_exception_evidence||null,
        work_units:Number(x.work_units),ot_hours:Number(x.ot_hours),timecard_match:x.timecard_match,
        adjustment:x.adjustment,note:x.note||null
      }))
      const {error}=await getSupabase().rpc('payroll_save_verification',{
        p_labour_batch_id:batch.id,p_method:'web',p_status:status,p_note:payrollNotes[batch.id]||'',
        p_external_reference:null,p_items:payload,p_expected_source_fingerprint:base.source_fingerprint,
        p_expected_batch_revision:base.batch_revision,p_expected_payroll_revision:base.payroll_revision
      })
      if(error){
        if(/PAYROLL_RULES_NOT_APPROVED|CLIENT_PAYROLL|CLIENT_CALCULATION/.test(error.message))throw new Error('ยังยืนยันยอดเงินไม่ได้: รออัตรา สูตร และกติกาปัดเศษที่บัญชีอนุมัติ')
        if(/INVALID_PAYROLL/.test(error.message))throw new Error('ข้อมูลจำนวนวัน OT หรือรายการปรับปรุงไม่ถูกต้อง กรุณาตรวจตัวเลขและทศนิยม')
        if(/ATTENDANCE_|TIMECARD_|CLOCK_|OVERNIGHT_/.test(error.message))throw new Error('หลักฐานเวลา/สถานะเข้างานยังไม่ครบหรือขัดกัน • กรุณาตรวจ punch, วันทำงาน, OT, ข้ามวัน และข้อยกเว้น')
        throw error
      }
      setMessage(status==='timecard_checked'
        ?'ตรวจบัตรตอกครบแล้ว • บันทึก Payroll Verification Record • ยอดเงินรอ Rate Master'
        :'บันทึกฉบับร่าง Payroll Verification Record แล้ว')
      setPayrollDraftBases(prev=>({...prev,[batch.id]:{...base,payroll_revision:base.payroll_revision+1}}))
      setRefreshTick(v=>v+1)
    }catch(err:any){
      const raw=String(err?.message||'บันทึก Payroll Verification ไม่สำเร็จ')
      if(raw.includes('STALE_PAYROLL_SAVE_RELOAD_REQUIRED')){setMessage('มีข้อมูล Payroll/Labour ใหม่กว่าตอนที่เริ่มแก้ • ระบบปฏิเสธการบันทึกเพื่อไม่ให้ทับข้อมูลล่าสุด • Draft ของคุณยังอยู่ กรุณาโหลดข้อมูลล่าสุดและ reconcile ก่อนบันทึกใหม่');setRefreshTick(v=>v+1)}
      else setMessage(raw)
    }
    finally{setSaving(prev=>({...prev,['payroll-'+batch.id]:false}))}
  }

  const resolveDuplicate=async(groupId:string,resolution:'confirmed_duplicate'|'confirmed_distinct',canonicalEntryId:string|null)=>{
    if(!canVerify||saving['duplicate-'+groupId])return
    const evidence=(duplicateEvidence[groupId]||'').trim()
    if(!evidence){setMessage('Duplicate Review ต้องมีหลักฐาน/เหตุผลก่อนยืนยันสถานะ');return}
    setSaving(prev=>({...prev,['duplicate-'+groupId]:true}));setMessage('')
    try{
      const {error}=await getSupabase().rpc('site_operations_resolve_duplicate',{
        p_group_id:groupId,
        p_resolution:resolution,
        p_canonical_entry_id:canonicalEntryId,
        p_evidence:evidence
      })
      if(error)throw error
      setMessage(resolution==='confirmed_duplicate'
        ?'ยืนยันรายการซ้ำแล้ว • คง raw rows ทุกแถว และใช้เฉพาะ canonical row ใน Site Operations/Labour/Payroll'
        :'ยืนยันว่าเป็นคนละงานแล้ว • แต่ละ raw row กลับเข้า flow แยกกันตามหลักฐาน')
      setDuplicateEvidence(prev=>{const next={...prev};delete next[groupId];return next})
      setRefreshTick(v=>v+1)
    }catch(err:any){setMessage(String(err?.message||'ยืนยัน Duplicate Review ไม่สำเร็จ'))}
    finally{setSaving(prev=>({...prev,['duplicate-'+groupId]:false}))}
  }

  return <AppShell>
    {readSignals.some(x=>x.truncated)&&<div className="panel" role="alert" style={{marginBottom:10}}>โหลดข้อมูลไม่ครบ • {readSignals.filter(x=>x.truncated).map(x=>x.label+' '+x.loaded+'/'+x.count).join(' • ')}</div>}
    {loadError&&<div className="panel" role="alert" style={{marginBottom:10}}>โหลด Labour Verification ไม่สำเร็จ กรุณาลองใหม่ <button type="button" className="button" onClick={()=>setRefreshTick(v=>v+1)}>ลองใหม่</button></div>}
    <PageHeader title={canPayroll?'Labour & Payroll Verification':'Labour'} subtitle={canPayroll?'Labour PDF รันอัตโนมัติเหมือนเดิม • หน้านี้ใช้ยืนยันทีมรายวันและตรวจบัตรตอกเพื่อสร้าง Payroll Verification Record':'ดูข้อมูลทีมและแรงงานจาก Site Operations • ไม่มีสิทธิ์เข้าถึงข้อมูล Payroll'} action={<div className="labour-mode"><button type="button" className={mode==='verify'?'active':''} onClick={()=>setMode('verify')}>ยืนยันทีมรายวัน</button>{canPayroll&&<button type="button" className={mode==='payroll'?'active':''} onClick={()=>setMode('payroll')}>Payroll Verification Record</button>}</div>}/>

    {message&&<div className="notice" role="status" aria-live="polite" style={{marginBottom:10}}>{message}</div>}

    {mode==='verify'?<>
      {duplicateReviewGroups.length>0&&<section className="duplicate-review-stack">
        {duplicateReviewGroups.map(group=><article className="panel duplicate-review-card" key={group.id}>
          <header><div><b>Suspected duplicate • ต้องตรวจหลักฐานก่อนใช้ downstream</b><small>{group.rows.length} raw rows • ไม่มีการ merge อัตโนมัติ</small></div></header>
          <div className="duplicate-review-members">
            {group.rows.map(row=>{const entry=entryById.get(row.entry_id);return <div key={row.entry_id}>
              <div><b>Form row {row.source_row}</b><span>{entry?dateTH(entry.work_date):'-'} • {entry?.supervisor_raw||'-'} • {entry?.project_name_raw||'-'}</span><small>{entry?.work_detail||'-'}</small></div>
              {canVerify&&<button type="button" className="button" disabled={saving['duplicate-'+group.id]} onClick={()=>resolveDuplicate(group.id,'confirmed_duplicate',row.entry_id)}>ยืนยันซ้ำ → ใช้ row {row.source_row} เป็น canonical</button>}
            </div>})}
          </div>
          {canVerify?<div className="duplicate-review-decision">
            <label>หลักฐาน / เหตุผล<input value={duplicateEvidence[group.id]||''} onChange={e=>setDuplicateEvidence(prev=>({...prev,[group.id]:e.target.value}))} placeholder="เช่น ตรวจ Google Form + หน้างานแล้ว เป็นการกดส่งซ้ำ / เป็นคนละกะ"/></label>
            <button type="button" className="button" disabled={saving['duplicate-'+group.id]} onClick={()=>resolveDuplicate(group.id,'confirmed_distinct',null)}>ยืนยันว่าเป็นคนละงาน</button>
          </div>:<div className="duplicate-review-readonly">รายการนี้ถูกกักจากยอด/การยืนยันจน Admin ตรวจหลักฐาน</div>}
        </article>)}
      </section>}

      <section className="panel labour-filter">
        <label>วันที่<select value={selectedDate} onChange={e=>{setSelectedDate(e.target.value);setFocusEntry('')}}><option value="">ทุกวันที่</option>{availableDates.map(d=><option key={d} value={d}>{dateTH(d)}</option>)}</select></label>
        <label>สถานะ<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="">ทุกสถานะ</option><option value="pending">รอยืนยัน</option><option value="needs_review">ต้องตรวจข้อมูล</option><option value="verified">ยืนยันแล้ว</option></select></label>
        <label className="labour-search">ค้นหา<input value={q} onChange={e=>setQ(e.target.value)} placeholder="หัวหน้าทีม / พื้นที่ / งาน"/></label>
        {(statusFilter||q||focusEntry)&&<button type="button" className="button" onClick={()=>{setStatusFilter('');setQ('');setFocusEntry('')}}>ล้าง</button>}
      </section>

      <section className="labour-kpis">
        <div><span>รายการวันนี้</span><b>{visibleBatches.length}</b></div>
        <div><span>Verified</span><b>{visibleBatches.filter(x=>labourStatusFor(x)==='verified').length}</b></div>
        <div><span>Pending</span><b>{visibleBatches.filter(x=>labourStatusFor(x)==='pending').length}</b></div>
        <div><span>Needs review</span><b>{visibleBatches.filter(x=>labourStatusFor(x)==='needs_review').length}</b></div>
      </section>

      {!canVerify&&<div className="panel labour-readonly">บัญชีนี้ดูข้อมูล Labour ได้ แต่การยืนยัน/แก้ทีมคนงานสงวนไว้สำหรับ Admin</div>}

      {loading?<div className="panel">กำลังโหลดข้อมูล…</div>:!visibleBatches.length?<div className="panel labour-empty">ไม่พบรายการตาม Filter</div>:<div className="labour-stack">
        {visibleBatches.map(batch=>{
          const entry=entryById.get(batch.site_operations_entry_id)
          if(!entry)return null
          const pids=projectIdsByEntry.get(entry.id)||[]
          const linkedProjects=pids.map(id=>projectById.get(id)).filter(Boolean) as Project[]
          const existing=(assignmentsByBatch.get(batch.id)||[])
          const draft=draftFor(batch)
          const homeCandidates=payrollWorkers.filter(w=>batch.home_team&&w.default_team===batch.home_team)
          const authority=confirmedHeadcount(batch)
          const sourceStatus=headcountSourceStatus(batch,entry)
          const sexTotal=maleFemaleHeadcount(entry)
          const countMismatch=authority!==null&&authority!==draft.length
          const headcountDraft=headcountDrafts[batch.id]||{count:'',basis:'',evidence:''}
          const editingHeadcount=!isHeadcountConfirmed(batch)||Boolean(headcountDrafts[batch.id])
          const headcountNeedsEvidence=sourceStatus!=='matched'||['daily_report','monthly_report','company_roster','contractor_only','manual_review'].includes(headcountDraft.basis)
          const supervisor=batch.supervisor_worker_id?workerById.get(batch.supervisor_worker_id):null
          const supervisorPayrollEligible=isCompanyPayrollWorker(supervisor)
          const contractorDraft=contractorDrafts[batch.id]
          const effectiveLabourStatus=labourStatusFor(batch)
          return <article className="panel labour-card" key={batch.id}>
            <header>
              <div><b>{batch.supervisor_raw||'ไม่ระบุหัวหน้าทีม'}</b><small>{dateTH(batch.work_date)} • Form row {entry.source_row} • {entry.area_raw||entry.project_name_raw||'-'}</small></div>
              <div><span className={'verify-status '+effectiveLabourStatus}>{statusLabel(effectiveLabourStatus)}</span><strong>{authority===null?'Headcount ยังไม่ยืนยัน':authority+' คน'}</strong></div>
            </header>

            <div className="labour-source">
              <div><span>Daily Report</span><b>{entry.work_detail||'-'}</b></div>
              {entry.afternoon_detail&&<div><span>ช่วงบ่าย</span><b>{entry.afternoon_detail}</b></div>}
              {entry.next_plan&&<div><span>Next plan</span><b>{entry.next_plan}</b></div>}
              <div><span>Reported manpower (raw)</span><b>รวม {countLabel(entry.total_manpower)} • ชาย {countLabel(entry.male_count)} • หญิง {countLabel(entry.female_count)} • ชาย+หญิง {countLabel(sexTotal)}</b><small className={sourceStatus==='mismatch'?'bad-text':''}>Daily Report Form row {entry.source_row} • {sourceStatus==='mismatch'?'Source discrepancy: รวม ≠ ชาย+หญิง':sourceStatus==='unknown'?'Source บางช่องไม่ระบุ — ห้ามตีความเป็น 0':'Raw source สอดคล้องกัน แต่ยังไม่ใช่ Payroll authority'}</small></div>
              <div><span>Company Payroll workers</span><b>{authority===null?'ยังไม่ยืนยัน':authority+' คน'}</b><small>{authority===null?'ใช้เฉพาะ Confirmed headcount พร้อม evidence':headcountBasisLabel(batch.confirmed_headcount_basis)+' • expected_headcount (compat) '+countLabel(batch.expected_headcount)}</small></div>
              <div><span>Supervisor role</span><b>{batch.supervisor_worker_id?'1 คน • '+(supervisorPayrollEligible?'มีสิทธิ์อยู่ใน Worker Payroll เมื่ออยู่ใน roster':'แยก/ไม่อยู่ Worker Payroll ตาม classification'):'ยังไม่ resolve'}</b><small>{batch.supervisor_worker_id?(batch.supervisor_worker_id+' • '+(supervisor?.payroll_eligibility_source||'classification ไม่ระบุ')):'supervisor_raw: '+(batch.supervisor_raw||'ไม่ระบุ')}</small></div>
              <div><span>Contractor / non-payroll</span><b>{batch.contractor_person_count===null?'ยังไม่ยืนยัน':batch.contractor_person_count+' คน'}</b><small>{batch.contractor_person_count===null?'ไม่คำนวณจาก Reported - Company Payroll':contractorBasisLabel(batch.contractor_count_basis)+(batch.contractor_count_evidence?' • '+batch.contractor_count_evidence:'')}</small></div>
              <div><span>Project</span><b>{linkedProjects.map(p=>p.code).join(' / ')||'ยังไม่ map Project'}</b></div>
              <div><span>Home team</span><b>{batch.home_team||'ยังไม่ยืนยัน identity ของหัวหน้าทีม'}</b></div>
            </div>

            <div className={'headcount-authority '+(sourceStatus==='mismatch'?'review':sourceStatus==='unknown'?'unknown':'')}>
              <div className="headcount-authority-title"><b>{sourceStatus==='mismatch'?'ต้องตรวจ Headcount: Source ขัดกัน':sourceStatus==='unknown'?'ต้องตรวจ Headcount: Source ไม่ครบ':'Headcount Source พร้อมให้ยืนยัน'}</b><span>Worker Payroll ใช้เฉพาะ Confirmed headcount • ผู้รับเหมาไม่รวมกับคนงานบริษัท</span></div>
              {!editingHeadcount&&authority!==null?<div className="headcount-confirmed">
                <div><b>✓ Confirmed {authority} คน</b><small>{headcountBasisLabel(batch.confirmed_headcount_basis)}{batch.confirmed_headcount_evidence?' • '+batch.confirmed_headcount_evidence:''}</small></div>
                <button type="button" className="button" disabled={!canVerify} onClick={()=>beginHeadcountEdit(batch)}>แก้ Headcount</button>
              </div>:<div className="headcount-confirm-form">
                <label>Confirmed headcount<input type="number" min="0" step="1" value={headcountDraft.count} onChange={e=>updateHeadcountDraft(batch.id,{count:e.target.value})} placeholder="ไม่กรอก = ยังไม่ยืนยัน" disabled={!canVerify}/></label>
                <label>หลักฐาน<select value={headcountDraft.basis} onChange={e=>updateHeadcountDraft(batch.id,{basis:e.target.value})} disabled={!canVerify}><option value="">เลือกหลักฐาน</option><option value="source_total">Source total</option><option value="male_female">ชาย + หญิง</option><option value="daily_report">Daily Report</option><option value="monthly_report">Monthly Report</option><option value="company_roster">Company roster / รายชื่อบริษัท</option><option value="contractor_only">ผู้รับเหมาเท่านั้น → Worker Payroll = 0</option><option value="manual_review">ตรวจไขว้ด้วยคน</option></select></label>
                <label className="headcount-evidence">หลักฐาน/เหตุผล<input value={headcountDraft.evidence} onChange={e=>updateHeadcountDraft(batch.id,{evidence:e.target.value})} placeholder={headcountNeedsEvidence?'จำเป็น: เช่น Monthly C=E+F / บริษัท 5 + ผู้รับเหมา 7':'ถ้ามีข้อมูลประกอบเพิ่มเติม'}/></label>
                <button type="button" className="button primary" disabled={!canVerify||saving['headcount-'+batch.id]||headcountDraft.count.trim()===''||!headcountDraft.basis||(headcountNeedsEvidence&&!headcountDraft.evidence.trim())} onClick={()=>confirmHeadcount(batch)}>{saving['headcount-'+batch.id]?'กำลังยืนยัน…':'ยืนยัน Headcount'}</button>
                {isHeadcountConfirmed(batch)&&<button type="button" className="button" onClick={()=>setHeadcountDrafts(prev=>{const next={...prev};delete next[batch.id];return next})}>ยกเลิก</button>}
              </div>}
            </div>

            <div className="headcount-authority">
              <div className="headcount-authority-title"><b>Contractor / non-payroll people</b><span>ยืนยันแยกจาก Reported manpower และ Company Payroll • non-person/group ไม่ถูกนับเป็นคน</span></div>
              {!contractorDraft?<div className="headcount-confirmed">
                <div><b>{batch.contractor_person_count===null?'ยังไม่ยืนยัน Contractor count':'✓ '+batch.contractor_person_count+' คน'}</b><small>{batch.contractor_person_count===null?'ไม่เดาจากส่วนต่างของยอด':contractorBasisLabel(batch.contractor_count_basis)+(batch.contractor_count_evidence?' • '+batch.contractor_count_evidence:'')}</small></div>
                <button type="button" className="button" disabled={!canVerify} onClick={()=>beginContractorEdit(batch)}>{batch.contractor_person_count===null?'ยืนยันจำนวน':'แก้จำนวน'}</button>
              </div>:<div className="headcount-confirm-form">
                <label>Contractor people<input type="number" min="0" step="1" value={contractorDraft.count} onChange={e=>updateContractorDraft(batch.id,{count:e.target.value})} placeholder="จำนวนคน" disabled={!canVerify}/></label>
                <label>หลักฐาน<select value={contractorDraft.basis} onChange={e=>updateContractorDraft(batch.id,{basis:e.target.value})} disabled={!canVerify}><option value="">เลือกหลักฐาน</option><option value="daily_report">Daily Report</option><option value="monthly_report">Monthly Report</option><option value="contractor_roster">Contractor roster</option><option value="manual_review">ตรวจไขว้ด้วยคน</option></select></label>
                <label className="headcount-evidence">ที่มา/หลักฐาน<input value={contractorDraft.evidence} onChange={e=>updateContractorDraft(batch.id,{evidence:e.target.value})} placeholder="จำเป็น • ห้ามใช้ note กลบยอดที่ไม่ตรง" disabled={!canVerify}/></label>
                <button type="button" className="button primary" disabled={!canVerify||saving['contractor-'+batch.id]||contractorDraft.count.trim()===''||!contractorDraft.basis||!contractorDraft.evidence.trim()} onClick={()=>confirmContractorCount(batch)}>{saving['contractor-'+batch.id]?'กำลังยืนยัน…':'ยืนยัน Contractor count'}</button>
                <button type="button" className="button" onClick={()=>setContractorDrafts(prev=>{const next={...prev};delete next[batch.id];return next})}>ยกเลิก</button>
              </div>}
            </div>

            {batch.supervisor_worker_id?<div className="supervisor-confirmed">
              <span className="supervisor-confirmed-icon" aria-hidden="true">✓</span>
              <div>
                <b>หัวหน้าทีมยืนยันแล้ว</b>
                <strong>{batch.home_team||supervisor?.nickname||supervisor?.display_label||batch.supervisor_raw||'หัวหน้าทีม'} • {batch.supervisor_worker_id}</strong>
                <small>{supervisor?.full_name||supervisor?.display_label||batch.supervisor_raw||'-'} • {supervisorPayrollEligible?'Supervisor role + Worker Payroll eligible':'Supervisor role • '+(supervisor?.payroll_eligibility_source||'ไม่อยู่ Worker Payroll')} • ระบบจะใช้ Mapping นี้อัตโนมัติในครั้งถัดไป</small>
              </div>
            </div>:<div className="supervisor-resolve">
              <b>ยืนยันหัวหน้าทีมก่อนเพื่อเรียก roster เดิม</b>
              <select value={supervisorPick[batch.id]||''} onChange={e=>setSupervisorPick(prev=>({...prev,[batch.id]:e.target.value}))} disabled={!canVerify}>
                <option value="">เลือกจาก Worker Master</option>
                {activeWorkers.map(w=><option key={w.worker_id} value={w.worker_id}>{w.worker_id} — {w.display_label||w.full_name} — {w.default_team||'ไม่ระบุทีม'}</option>)}
              </select>
              <button type="button" className="button" disabled={!canVerify||!supervisorPick[batch.id]||saving[batch.id]} onClick={()=>confirmSupervisor(batch)}>{saving[batch.id]?'กำลังบันทึก…':'ยืนยันหัวหน้าทีม'}</button>
            </div>}

            <div className="labour-tools">
              <button type="button" className="button" disabled={!canVerify||!batch.home_team} onClick={()=>useHomeTeam(batch)}>ใช้ทีมเดิมทั้งหมด ({homeCandidates.length})</button>
              {existing.length>0&&<button type="button" className="button" disabled={!canVerify} onClick={()=>loadExisting(batch)}>โหลดชุดที่ยืนยันไว้ ({existing.length})</button>}
              <select value={addWorker[batch.id]||''} onChange={e=>setAddWorker(prev=>({...prev,[batch.id]:e.target.value}))} disabled={!canVerify}><option value="">+ เลือก Worker Payroll</option>{payrollWorkers.map(w=><option key={w.worker_id} value={w.worker_id}>{w.worker_id} — {w.display_label||w.full_name} — {w.default_team||'ไม่ระบุทีม'}</option>)}</select>
              <button type="button" className="button" disabled={!canVerify||!addWorker[batch.id]} onClick={()=>addOneWorker(batch)}>เพิ่มคน</button>
            </div>

            {draft.length?<div className="labour-draft">
              <div className="labour-draft-head"><b>รายชื่อที่จะยืนยัน</b><span className={countMismatch?'bad-text':''}>{draft.length} / {authority===null?'ยังไม่ยืนยัน Headcount':authority+' คน'}{countMismatch?' • จำนวนไม่ตรง Confirmed':''}</span></div>
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
            </div>:<div className="labour-no-draft">{authority===0?'Confirmed headcount = 0 • ไม่มี Worker Payroll roster สำหรับรายการนี้':'ยังไม่ได้เลือกรายชื่อ • ใช้ “ทีมเดิมทั้งหมด” เพื่อลดการกรอก หรือเพิ่มเฉพาะคนที่ต้องการจาก Worker Master'}</div>}

            <div className="labour-confirm">
              <label>หมายเหตุการยืนยัน<input value={notes[batch.id]??batch.note??''} onChange={e=>setNotes(prev=>({...prev,[batch.id]:e.target.value}))} placeholder="เช่น A ย้ายไปช่วยทีมช่างพร 1 วัน"/></label>
              <button type="button" className="primary" disabled={!canVerify||saving[batch.id]||authority===null||draft.length!==authority} onClick={()=>saveBatch(batch)}>{saving[batch.id]?'กำลังยืนยัน…':batch.verification_status==='verified'?'ยืนยันการแก้ไข':'ยืนยันทีมคนงาน'}</button>
            </div>
            {batch.verification_status==='verified'&&batch.verified_at&&<div className="labour-save-state verified">
              <div><b>✓ ทีมคนงานยืนยันแล้ว</b><span>{existing.length} / {authority===null?'ไม่ทราบ':authority} คน • บันทึกเป็น Verified Labour Dataset</span></div>
              <small>ยืนยันล่าสุด {new Date(batch.verified_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</small>
            </div>}
            {batch.verification_status==='needs_review'&&batch.verified_at&&<div className="labour-save-state review">
              <div><b>ข้อมูลทีมเปลี่ยนหลังการยืนยัน</b><span>ข้อมูลเดิมยังเก็บอยู่ • กรุณาตรวจและยืนยันทีมคนงานใหม่ก่อนใช้ downstream</span></div>
              <small>ยืนยันเดิม {new Date(batch.verified_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</small>
            </div>}
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
            const rows=(assignmentsByBatch.get(batch.id)||[])
            const draft=payrollDraftFor(batch)
            const leader=batch.supervisor_worker_id?workerById.get(batch.supervisor_worker_id):null
            const linkedProjects=(projectIdsByEntry.get(entry.id)||[]).map(id=>projectById.get(id)).filter(Boolean) as Project[]
            const payrollAuthority=confirmedHeadcount(batch)
            const countMismatch=payrollAuthority!==null&&rows.length!==payrollAuthority
            const allMatched=draft.length>0&&draft.every(x=>x.timecard_match&&!attendanceEvidenceIssue(x))
            const payrollSaving=Boolean(saving['payroll-'+batch.id])
            return <article className="panel payroll-card" key={batch.id}>
              <header>
                <div><b>{batch.home_team||batch.supervisor_raw||'ไม่ระบุทีม'}</b><small>{dateTH(batch.work_date)} • {entry.area_raw||entry.project_name_raw||'-'} • {linkedProjects.map(p=>p.code).join(' / ')||'ยังไม่ map Project'}</small></div>
                <div><span className={'payroll-status '+effectiveStatus}>{payrollStatusLabel(effectiveStatus)}</span><strong>{rows.length} คนงาน</strong></div>
              </header>

              <div className="payroll-summary-grid">
                <div><span>หัวหน้าทีม</span><b>{leader?.nickname||leader?.display_label||batch.supervisor_raw||'-'}</b><small>แยกการจ่าย • ไม่รวมใน Worker Payroll</small></div>
                <div><span>รายละเอียดงาน</span><b>{entry.work_detail||'-'}</b>{entry.afternoon_detail&&<small>บ่าย: {entry.afternoon_detail}</small>}</div>
                <div><span>Headcount authority</span><b>{payrollAuthority===null?'ยังไม่ยืนยัน':payrollAuthority+' คนงาน'}</b><small className={countMismatch?'bad-text':''}>Raw {countLabel(entry.total_manpower)} • รายชื่อยืนยัน {rows.length}{countMismatch?' • ไม่ตรง Confirmed headcount':''}</small></div>
                <div><span>วิธียืนยัน Payroll</span><b>{record?.verification_method==='legacy_excel'?'Legacy Excel':'Web Verification'}</b><small>{record?.external_reference||'Audit trail ในระบบ'}</small></div>
              </div>

              {payrollAuthority===null&&<div className="payroll-warning">Headcount ยังไม่มีผู้ยืนยัน • ห้ามใช้เป็น Worker Payroll downstream จนกว่าจะ Confirmed</div>}
              {batch.confirmed_headcount_basis==='contractor_only'&&<div className="payroll-warning">รายการนี้ยืนยันว่าเป็นผู้รับเหมาเท่านั้น • ไม่รวมใน Worker Payroll</div>}
              {labourStatusFor(batch)!=='verified'&&<div className="payroll-warning">ทีมรายวันนี้ยังไม่ผ่านการยืนยันรายชื่อ • ต้องยืนยันทีมก่อนตรวจบัตรตอก และยังยืนยันยอดเงินไม่ได้จนกว่ากติกาบัญชีจะพร้อม</div>}
              {effectiveStatus==='needs_review'&&<div className="payroll-warning">ข้อมูลทีมรายวันมีการเปลี่ยนหลังการตรวจ Payroll • ต้องเปิดตรวจบัตรตอกซ้ำก่อนใช้ยอด</div>}

              <div className="payroll-actions">
                <button type="button" className="button primary" disabled={!canPayroll||labourStatusFor(batch)!=='verified'||payrollAuthority===null||batch.confirmed_headcount_basis==='contractor_only'||rows.length!==payrollAuthority} onClick={()=>startPayrollReview(batch)}>{draft.length?'โหลดข้อมูลจากระบบใหม่':record?.verification_method==='web'?'เปิดรายการเดิม':'เริ่มตรวจบัตรตอก'}</button>
                {draft.length>0&&<><button type="button" className="button" onClick={()=>markAllTimecards(batch,true)}>✓ ติ๊กเฉพาะหลักฐานครบ</button><button type="button" className="button" onClick={()=>clearAllOt(batch)}>OT = 0 ทั้งทีม</button></>}
                {record?.timecard_checked_at&&<span className="payroll-audit">ตรวจบัตรล่าสุด {new Date(record.timecard_checked_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</span>}
              </div>

              {draft.length>0&&<div className="payroll-worker-table"><table>
                <thead><tr><th>คนงาน</th><th>สถานะ</th><th>เข้า</th><th>ออก</th><th>ข้ามวัน</th><th>วันทำงาน</th><th>OT ชม.</th><th>ข้อยกเว้น</th><th>บัตรตอก</th><th>ค่าแรง</th><th>หมายเหตุ</th></tr></thead>
                <tbody>{draft.map((row,index)=>{
                  const worker=workerById.get(row.worker_id)
                  return <tr key={row.worker_id}>
                    <td><b>{worker?.nickname||worker?.display_label||worker?.full_name||row.worker_id}</b><small>{row.worker_id} • {worker?.default_team||'-'}</small></td>
                    <td><select value={row.attendance_status} onChange={e=>applyAttendance(batch.id,index,e.target.value)}><option value="present">มาทำงาน</option><option value="half_day">ครึ่งวัน</option><option value="leave">ลา</option><option value="absent">ขาด</option><option value="other">อื่น ๆ</option></select></td>
                    <td><input type="time" value={row.clock_in} onChange={e=>updatePayrollDraft(batch.id,index,{clock_in:e.target.value,timecard_match:false})}/></td>
                    <td><input type="time" value={row.clock_out} onChange={e=>updatePayrollDraft(batch.id,index,{clock_out:e.target.value,timecard_match:false})}/></td>
                    <td><label className="match-toggle"><input type="checkbox" checked={row.clock_spans_next_day} onChange={e=>updatePayrollDraft(batch.id,index,{clock_spans_next_day:e.target.checked,timecard_match:false})}/><span>ออกวันถัดไป</span></label></td>
                    <td><input type="number" min="0" max="1" step="0.5" value={row.work_units} onChange={e=>updatePayrollDraft(batch.id,index,{work_units:e.target.value,timecard_match:false})}/></td>
                    <td><input type="number" min="0" max="24" step="0.5" value={row.ot_hours} onChange={e=>updatePayrollDraft(batch.id,index,{ot_hours:e.target.value,timecard_match:false})}/></td>
                    <td><div className="attendance-exception"><label className="match-toggle"><input type="checkbox" checked={row.attendance_exception_requested} onChange={e=>updatePayrollDraft(batch.id,index,{attendance_exception_requested:e.target.checked,timecard_match:false})}/><span>ใช้ข้อยกเว้น</span></label>{row.attendance_exception_requested&&<><input value={row.attendance_exception_reason} onChange={e=>updatePayrollDraft(batch.id,index,{attendance_exception_reason:e.target.value,timecard_match:false})} placeholder="เหตุผล"/><input value={row.attendance_exception_evidence} onChange={e=>updatePayrollDraft(batch.id,index,{attendance_exception_evidence:e.target.value,timecard_match:false})} placeholder="หลักฐาน / reference"/></>}</div></td>
                    <td><label className={'match-toggle '+(row.timecard_match?'matched':'')} title={attendanceEvidenceIssue(row)||''}><input type="checkbox" checked={row.timecard_match} disabled={Boolean(attendanceEvidenceIssue(row))} onChange={e=>updatePayrollDraft(batch.id,index,{timecard_match:e.target.checked})}/><span>{row.timecard_match?'ตรงแล้ว':attendanceEvidenceIssue(row)?'หลักฐานไม่ครบ':'รอตรวจ'}</span></label></td>
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
                <summary>เอกสาร Excel ประกอบการตรวจ — ยังยืนยันยอดเงินไม่ได้</summary>
                <div><label>ชื่อไฟล์ / Reference<input disabled value={externalRefs[batch.id]??record?.external_reference??''} onChange={e=>setExternalRefs(prev=>({...prev,[batch.id]:e.target.value}))} placeholder="เช่น Labour Cost Week 40.xlsx"/></label><label>หมายเหตุ<input value={payrollNotes[batch.id]??record?.note??''} onChange={e=>setPayrollNotes(prev=>({...prev,[batch.id]:e.target.value}))} placeholder="ถ้ามี"/></label><button type="button" className="button" disabled title="รออัตรา สูตร และกติกาปัดเศษที่บัญชียืนยัน">รอกติกาบัญชียืนยัน</button></div>
              </details>

              {record?.verified_at&&<div className="labour-verified-line">Verified ล่าสุด {new Date(record.verified_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} • {payrollStatusLabel(effectiveStatus)}</div>}
            </article>
          })}
        </div>}
      </>}
    </>}

    <style jsx>{`
      .duplicate-review-stack{display:grid;gap:10px;margin-bottom:10px}.duplicate-review-card{padding:0;overflow:hidden;border-color:#e5b76a;background:#fffdf7}.duplicate-review-card>header{display:flex;justify-content:space-between;padding:10px 12px;background:#fff6df;border-bottom:1px solid #ead29a;color:#765300}.duplicate-review-card header b{font-size:10.5px}.duplicate-review-card header small{display:block;margin-top:2px;font-size:8.5px}.duplicate-review-members{display:grid}.duplicate-review-members>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px 12px;border-bottom:1px solid #f0e4c7}.duplicate-review-members b{font-size:10px}.duplicate-review-members span,.duplicate-review-members small{display:block;margin-top:2px;font-size:8.5px;line-height:1.4;color:var(--muted)}.duplicate-review-decision{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;padding:10px 12px}.duplicate-review-decision label{display:grid;gap:4px;font-size:9px;font-weight:850;color:#765300}.duplicate-review-decision input{min-height:35px;border:1px solid #d9c28f;border-radius:8px;padding:6px 8px;font-size:9.5px}.duplicate-review-readonly{padding:10px 12px;font-size:9px;color:#765300}@media(max-width:760px){.duplicate-review-members>div,.duplicate-review-decision{grid-template-columns:1fr}.duplicate-review-members .button{justify-self:start}}
      .labour-mode{display:inline-flex;gap:4px;padding:4px;border:1px solid var(--line);border-radius:11px;background:#f4f7fa}.labour-mode button{border:0;background:transparent;border-radius:8px;padding:8px 11px;font-size:10px;font-weight:850;color:var(--muted);cursor:pointer}.labour-mode button.active{background:var(--navy);color:#fff}
      .labour-filter,.report-filter{display:grid;grid-template-columns:170px 170px minmax(260px,1fr) auto;gap:8px;align-items:end;padding:10px;margin-bottom:10px}.labour-filter label,.report-filter label{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted)}.labour-filter select,.labour-filter input,.report-filter select,.report-filter input{min-height:36px;border:1px solid var(--line);border-radius:9px;background:#fff;padding:7px 9px;font:inherit;font-size:12px}
      .labour-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}.labour-kpis>div{padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.labour-kpis span{display:block;font-size:9px;font-weight:850;color:var(--muted)}.labour-kpis b{display:block;margin-top:3px;font-size:21px;color:var(--navy)}
      .labour-readonly,.labour-empty{padding:16px;text-align:center;color:var(--muted);font-size:10.5px;margin-bottom:10px}.labour-stack,.worker-report-stack{display:grid;gap:10px}.labour-card{padding:0;overflow:hidden}.labour-card>header,.worker-report>header{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 13px;background:linear-gradient(135deg,#172a43,#213d5e);color:#fff}.labour-card header b,.worker-report header b{font-size:13px}.labour-card header small,.worker-report header small{display:block;margin-top:3px;font-size:9px;color:#c9d5e1}.labour-card header>div:last-child{display:flex;align-items:center;gap:7px}.labour-card header strong,.worker-report header strong{font-size:15px}.verify-status{padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.2);font-size:9px;font-weight:850}.verify-status.verified{background:rgba(69,170,103,.22)}.verify-status.needs_review{background:rgba(218,154,38,.25)}
      .headcount-authority{margin:0 12px 10px;padding:10px;border:1px solid #cdd9e5;border-radius:12px;background:#f8fbfd}.headcount-authority.review{border-color:#e5b76a;background:#fff9ed}.headcount-authority.unknown{border-color:#c8ced6;background:#f7f8fa}.headcount-authority-title{display:grid;gap:2px;margin-bottom:8px}.headcount-authority-title>b{font-size:11px;color:var(--navy)}.headcount-authority-title>span{font-size:9px;color:var(--muted)}.headcount-confirmed{display:flex;align-items:center;justify-content:space-between;gap:8px}.headcount-confirmed>div{display:grid;gap:2px}.headcount-confirmed b{font-size:11px}.headcount-confirmed small{font-size:9px;color:var(--muted)}.headcount-confirm-form{display:grid;grid-template-columns:150px minmax(180px,220px) minmax(220px,1fr) auto auto;gap:7px;align-items:end}.headcount-confirm-form label{display:grid;gap:3px;font-size:9px;font-weight:800;color:var(--muted)}.headcount-confirm-form input,.headcount-confirm-form select{min-height:34px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:6px 8px;font:inherit;font-size:10px}.headcount-evidence{min-width:0}\n      .labour-source{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border-bottom:1px solid var(--line)}.labour-source>div{display:grid;grid-template-columns:90px minmax(0,1fr);gap:7px;padding:8px 12px;border-bottom:1px solid #edf0f3}.labour-source span{font-size:8.5px;font-weight:900;color:var(--muted);text-transform:uppercase}.labour-source b{font-size:10px;line-height:1.45}.labour-source small{font-size:8.5px;line-height:1.35;color:var(--muted)}
      .supervisor-resolve{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(280px,1.5fr) auto;gap:7px;align-items:center;padding:9px 12px;background:#fff8e8;border-bottom:1px solid #ead29a}.supervisor-resolve>b{font-size:9.5px;color:#7a5600}.supervisor-resolve select{min-height:34px;border:1px solid #d7c48e;border-radius:8px;background:#fff;padding:6px 8px;font-size:10px}
      .supervisor-confirmed{display:flex;align-items:center;gap:9px;padding:10px 12px;background:#edf8f1;border-bottom:1px solid #b9ddc5;color:#245f38}.supervisor-confirmed-icon{display:grid;place-items:center;flex:0 0 24px;height:24px;border-radius:999px;background:#d7efdf;font-size:13px;font-weight:900}.supervisor-confirmed>div{display:grid;gap:2px;min-width:0}.supervisor-confirmed b{font-size:9px;color:#287643}.supervisor-confirmed strong{font-size:10.5px;color:#183e27}.supervisor-confirmed small{font-size:8.5px;line-height:1.4;color:#4b6e57}
      .labour-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:9px 12px;background:#f8fafc;border-bottom:1px solid var(--line)}.labour-tools select{flex:1 1 300px;min-height:34px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:6px 8px;font-size:10px}
      .labour-draft{padding:10px 12px}.labour-draft-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px;font-size:10px}.labour-draft-head span{color:var(--muted)}.bad-text{color:var(--red)!important;font-weight:850}
      .labour-person{display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(145px,.9fr) minmax(145px,.9fr) minmax(145px,.9fr) 90px auto;gap:6px;align-items:end;padding:7px 0;border-top:1px solid #edf0f3}.labour-person-name{align-self:center}.labour-person-name b{display:block;font-size:10.5px}.labour-person-name small{display:block;margin-top:2px;font-size:8.5px;color:var(--muted)}.labour-person label{display:grid;gap:3px;font-size:8px;font-weight:850;color:var(--muted)}.labour-person select,.labour-person input{min-height:31px;border:1px solid var(--line);border-radius:7px;background:#fff;padding:5px 6px;font-size:9px;min-width:0}.labour-no-draft{padding:13px;color:var(--muted);font-size:10px;text-align:center}
      .labour-confirm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;padding:10px 12px;border-top:1px solid var(--line);background:#fbfcfd}.labour-confirm label{display:grid;gap:4px;font-size:9px;font-weight:850;color:var(--muted)}.labour-confirm input{min-height:35px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:10px}.labour-confirm .primary{min-height:35px}.labour-save-state{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 12px;border-top:1px solid var(--line)}.labour-save-state>div{display:grid;gap:2px}.labour-save-state b{font-size:9.5px}.labour-save-state span,.labour-save-state small{font-size:8.5px;line-height:1.4}.labour-save-state.verified{background:#edf8f1;border-color:#b9ddc5;color:#287643}.labour-save-state.review{background:#fff6df;border-color:#ead29a;color:#765300}.labour-verified-line{padding:7px 12px;border-top:1px solid var(--line);font-size:8.5px;color:var(--muted);text-align:right}
      .payroll-intro{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:0;padding:0;margin-bottom:10px;overflow:hidden}.payroll-intro>div{padding:12px 14px;border-right:1px solid var(--line)}.payroll-intro>div:last-child{border-right:0}.payroll-intro b{display:block;font-size:11px;color:var(--navy)}.payroll-intro span{display:block;margin-top:4px;font-size:9px;line-height:1.5;color:var(--muted)}.payroll-rule{background:#f8fafc}.payroll-rate{background:#fff9ec}.payroll-filter{grid-template-columns:145px 145px 180px minmax(220px,1fr) auto}.payroll-stack{display:grid;gap:10px}.payroll-card{padding:0;overflow:hidden}.payroll-card>header{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:11px 13px;background:linear-gradient(135deg,#172a43,#213d5e);color:#fff}.payroll-card header b{font-size:13px}.payroll-card header small{display:block;margin-top:3px;font-size:9px;color:#c9d5e1}.payroll-card header>div:last-child{display:flex;align-items:center;gap:7px}.payroll-card header strong{font-size:12px}.payroll-status{padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.22);font-size:8.5px;font-weight:850}.payroll-status.timecard_checked,.payroll-status.verified,.payroll-status.external_verified{background:rgba(69,170,103,.22)}.payroll-status.needs_review{background:rgba(218,154,38,.28)}.payroll-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--line)}.payroll-summary-grid>div{padding:9px 11px;border-right:1px solid #edf0f3}.payroll-summary-grid>div:last-child{border-right:0}.payroll-summary-grid span{display:block;font-size:8px;font-weight:900;color:var(--muted);text-transform:uppercase}.payroll-summary-grid b{display:block;margin-top:3px;font-size:10px;line-height:1.4}.payroll-summary-grid small{display:block;margin-top:3px;font-size:8.5px;color:var(--muted);line-height:1.4}.payroll-warning{padding:8px 12px;background:#fff6df;border-bottom:1px solid #ead29a;color:#765300;font-size:9.5px;font-weight:700}.payroll-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:9px 12px;background:#f8fafc;border-bottom:1px solid var(--line)}.payroll-audit{margin-left:auto;font-size:8.5px;color:var(--muted)}.payroll-worker-table{overflow:auto;padding:0 10px}.payroll-worker-table table{width:100%;min-width:1100px}.payroll-worker-table th,.payroll-worker-table td{font-size:9px;vertical-align:middle;white-space:normal}.payroll-worker-table td:first-child{min-width:150px}.payroll-worker-table td small{display:block;margin-top:2px;color:var(--muted)}.payroll-worker-table select,.payroll-worker-table input{width:100%;min-height:31px;border:1px solid var(--line);border-radius:7px;background:#fff;padding:5px 6px;font-size:9px}.payroll-worker-table input[type=time]{min-width:88px}.payroll-worker-table input[type=number]{min-width:72px}.match-toggle{display:flex;align-items:center;gap:5px;padding:6px 7px;border:1px solid #d9e0e7;border-radius:8px;background:#f8fafc;font-weight:800;color:var(--muted);white-space:nowrap}.match-toggle input{width:auto!important;min-height:auto!important}.match-toggle.matched{background:#edf8f1;border-color:#b9ddc5;color:#287643}.attendance-exception{display:grid;gap:4px;min-width:150px}.attendance-exception input{min-width:145px}.rate-state{display:inline-flex;padding:5px 7px;border-radius:999px;background:#fff4da;color:#7a5600;font-size:8px;font-weight:850;white-space:nowrap}.payroll-confirm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:end;padding:10px 12px;border-top:1px solid var(--line);background:#fbfcfd}.payroll-confirm>label{display:grid;gap:4px;font-size:9px;font-weight:850;color:var(--muted)}.payroll-confirm>label input{min-height:34px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:9.5px}.payroll-confirm>div{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.match-ready,.match-wait{font-size:8.5px;font-weight:850}.match-ready{color:#287643}.match-wait{color:#a16a00}.legacy-payroll{border-top:1px solid var(--line);background:#fff}.legacy-payroll summary{padding:9px 12px;cursor:pointer;font-size:9px;font-weight:800;color:var(--muted)}.legacy-payroll>div{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:end;padding:0 12px 11px}.legacy-payroll label{display:grid;gap:4px;font-size:8.5px;font-weight:800;color:var(--muted)}.legacy-payroll input{min-height:33px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:9px}
      @media(max-width:1150px){.headcount-confirm-form{grid-template-columns:1fr 1fr}.headcount-evidence{grid-column:1/-1}.supervisor-resolve{grid-template-columns:1fr 1fr}.supervisor-resolve>b{grid-column:1/-1}.labour-person{grid-template-columns:1fr 1fr 1fr}.labour-person-name{grid-column:1/-1}.labour-person .link-danger{justify-self:start}.payroll-summary-grid{grid-template-columns:1fr 1fr}.payroll-summary-grid>div:nth-child(2){border-right:0}.payroll-intro{grid-template-columns:1fr}.payroll-intro>div{border-right:0;border-bottom:1px solid var(--line)}}@media(max-width:760px){.headcount-confirm-form{grid-template-columns:1fr}.headcount-evidence{grid-column:auto}.headcount-confirmed{align-items:flex-start;flex-direction:column}.supervisor-resolve{grid-template-columns:1fr}.supervisor-resolve>b{grid-column:auto}.labour-filter,.report-filter,.payroll-filter{grid-template-columns:1fr 1fr}.labour-search{grid-column:1/-1}.labour-kpis{grid-template-columns:1fr 1fr}.labour-card>header,.payroll-card>header{align-items:flex-start}.labour-source,.payroll-summary-grid{grid-template-columns:1fr}.payroll-summary-grid>div{border-right:0;border-bottom:1px solid #edf0f3}.labour-person{grid-template-columns:1fr 1fr}.labour-person-name{grid-column:1/-1}.labour-confirm,.payroll-confirm{grid-template-columns:1fr}.legacy-payroll>div{grid-template-columns:1fr}}@media print{.labour-mode,.labour-filter,.report-filter,.labour-kpis,.labour-readonly,.labour-tools,.labour-confirm,.payroll-actions,.payroll-confirm,.legacy-payroll,.notice{display:none!important}.payroll-card{break-inside:avoid}}
    `}</style>
  </AppShell>
}
