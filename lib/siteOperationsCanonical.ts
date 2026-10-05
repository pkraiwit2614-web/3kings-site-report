export type CanonicalFlowState='active'|'suspected'|'suppressed'

export type CanonicalStateRow={
  entry_id:string
  source_row:number
  group_id:string|null
  group_state:'suspected'|'confirmed_duplicate'|'confirmed_distinct'|'retired'|null
  canonical_entry_id:string|null
  flow_state:CanonicalFlowState
  decision_evidence:string|null
  decided_at:string|null
}

export type DuplicateCandidateInput={
  work_date:string|null|undefined
  supervisor_worker_id?:string|null
  supervisor_raw?:string|null
  project_name_raw?:string|null
  area_raw?:string|null
  specific_area?:string|null
  work_detail?:string|null
  afternoon_detail?:string|null
}

export function normalizeDuplicateText(value:unknown){
  return String(value??'').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,' ').trim()
}

export function duplicateCandidateSignature(input:DuplicateCandidateInput){
  const identity=String(input.supervisor_worker_id??'').trim().toLowerCase()||normalizeDuplicateText(input.supervisor_raw)
  const workDate=String(input.work_date??'').trim()
  const project=normalizeDuplicateText(input.project_name_raw)
  const work=normalizeDuplicateText(input.work_detail)
  if(!workDate||!identity||!project||!work)return null
  return [
    workDate,
    identity,
    project,
    normalizeDuplicateText(input.area_raw),
    normalizeDuplicateText(input.specific_area),
    work,
    normalizeDuplicateText(input.afternoon_detail),
  ].join('|')
}

export function canonicalFlowState(row:Pick<CanonicalStateRow,'flow_state'>|null|undefined):CanonicalFlowState{
  return row?.flow_state||'active'
}

export function canUseCanonicalDownstream(row:Pick<CanonicalStateRow,'flow_state'>|null|undefined){
  return canonicalFlowState(row)==='active'
}
