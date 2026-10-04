export type HeadcountSourceStatus='matched'|'mismatch'|'unknown'
export type HeadcountConfirmationStatus='confirmed'|'unconfirmed'

export type HeadcountEntryLike={
  total_manpower:number|null|undefined
  male_count:number|null|undefined
  female_count:number|null|undefined
}

export type HeadcountBatchLike={
  confirmed_headcount?:number|null
  expected_headcount?:number|null
  headcount_source_status?:HeadcountSourceStatus|null
  headcount_confirmation_status?:HeadcountConfirmationStatus|null
}

function isKnownCount(value:number|null|undefined):value is number{
  return typeof value==='number'&&Number.isInteger(value)&&value>=0
}

export function maleFemaleHeadcount(entry:HeadcountEntryLike):number|null{
  if(!isKnownCount(entry.male_count)||!isKnownCount(entry.female_count))return null
  return entry.male_count+entry.female_count
}

export function deriveHeadcountSourceStatus(entry:HeadcountEntryLike):HeadcountSourceStatus{
  if(!isKnownCount(entry.total_manpower))return 'unknown'
  const sexTotal=maleFemaleHeadcount(entry)
  if(sexTotal===null)return 'unknown'
  return sexTotal===entry.total_manpower?'matched':'mismatch'
}

export function headcountSourceStatus(batch:HeadcountBatchLike|undefined,entry:HeadcountEntryLike):HeadcountSourceStatus{
  return batch?.headcount_source_status||deriveHeadcountSourceStatus(entry)
}

export function confirmedHeadcount(batch:HeadcountBatchLike|undefined):number|null{
  if(batch?.headcount_confirmation_status!=='confirmed')return null
  return isKnownCount(batch.confirmed_headcount)?batch.confirmed_headcount:null
}

export function isHeadcountConfirmed(batch:HeadcountBatchLike|undefined):boolean{
  return confirmedHeadcount(batch)!==null
}

export function isHeadcountReviewCase(batch:HeadcountBatchLike|undefined,entry:HeadcountEntryLike):boolean{
  return !isHeadcountConfirmed(batch)&&headcountSourceStatus(batch,entry)!=='matched'
}

export function countLabel(value:number|null|undefined):string{
  return isKnownCount(value)?String(value):'ไม่ระบุ'
}
