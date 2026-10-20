/**
 * Read-only staging for Materials identity drift. Source row position is NOT
 * treated as stable after an Excel insertion/deletion; PR supersession is not
 * equivalent to an approved PO or a received item.
 * This module NEVER issues a database or Drive write.
 */
export type MaterialRow={
  id?:string;sourceSheet:string;sourceRow?:number|null;
  sourceItemNo?:string|null;itemName:string;projectCode?:string|null;
}
export type ReconciliationRow={
  existingId:string;status:'EXACT_IDENTITY'|'REVIEW_REQUIRED';
  reason:'SAME_IDENTITY'|'ROW_SHIFT'|'RENAME_OR_REPLACED_PR'|'AMBIGUOUS'|'UNMATCHED'|'INSUFFICIENT_IDENTITY';
  sourceRow:number|null;candidateCount:number
}
const norm=(v:string|null|undefined)=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()
export function stageMaterialsReconciliation(existing:MaterialRow[],incoming:MaterialRow[]):{
  status:'READ_ONLY'|'BLOCK_WRITE';matched:number;reviewRequired:number;rows:ReconciliationRow[]
}{
  const rows:ReconciliationRow[]=existing.map(old=>{
    const id=String(old.id||'')
    const sheet=norm(old.sourceSheet),project=norm(old.projectCode),code=norm(old.sourceItemNo)
    if(!id.trim()||!sheet||!project||!code||!norm(old.itemName))
      return {existingId:id,status:'REVIEW_REQUIRED' as const,reason:'INSUFFICIENT_IDENTITY' as const,sourceRow:null,candidateCount:0}
    const duplicateExisting=existing.filter(row=>norm(row.sourceSheet)===sheet&&
      norm(row.projectCode)===project&&norm(row.sourceItemNo)===code).length>1 ||
      existing.filter(row=>String(row.id||'')===id).length>1
    if(duplicateExisting)
      return {existingId:id,status:'REVIEW_REQUIRED' as const,reason:'AMBIGUOUS' as const,sourceRow:null,candidateCount:0}
    const pool=incoming.filter(next=>norm(next.sourceSheet)===sheet&&norm(next.projectCode)===project)
    // Item codes must be unique inside one site and source sheet to be trusted.
    const byCode=code?pool.filter(next=>norm(next.sourceItemNo)===code):[]
    const byName=pool.filter(next=>norm(next.itemName)===norm(old.itemName))
    const exact=byCode.length===1?byCode[0]:null
    if(exact && norm(exact.itemName)===norm(old.itemName))
      return {existingId:id,status:'EXACT_IDENTITY' as const,
        reason:(exact.sourceRow===old.sourceRow?'SAME_IDENTITY':'ROW_SHIFT') as 'SAME_IDENTITY'|'ROW_SHIFT',
        sourceRow:exact.sourceRow??null,candidateCount:1}
    const candidates=byCode.length>0?byCode:byName
    return {existingId:id,status:'REVIEW_REQUIRED' as const,
      reason:byCode.length>1||byName.length>1?'AMBIGUOUS' as const:
        exact||byName.length===1?'RENAME_OR_REPLACED_PR' as const:
        !code?'INSUFFICIENT_IDENTITY' as const:'UNMATCHED' as const,
      sourceRow:candidates.length===1?candidates[0].sourceRow??null:null,
      candidateCount:candidates.length}
  })
  const reviewRequired=rows.filter(r=>r.status==='REVIEW_REQUIRED').length
  return {status:reviewRequired?'BLOCK_WRITE':'READ_ONLY',
    matched:rows.length-reviewRequired,reviewRequired,rows}
}
