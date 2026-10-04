export type WorkDateIntegrityRow={work_date:string;work_date_validation_status?:string|null}
export type WorkDateBatch={work_date:string;site_operations_entry_id:string}
export const WORK_DATE_VALID='valid'
export function bangkokToday(now:Date=new Date()):string{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`}
export function isUsableActualWorkDate(row:WorkDateIntegrityRow|null|undefined,today:string=bangkokToday()):boolean{if(!row?.work_date)return false;return(row.work_date_validation_status||WORK_DATE_VALID)===WORK_DATE_VALID&&row.work_date<=today}
export function latestUsableDate(rows:WorkDateIntegrityRow[],today:string=bangkokToday()):string{return rows.filter(row=>isUsableActualWorkDate(row,today)).map(row=>row.work_date).sort((a,b)=>b.localeCompare(a))[0]||''}
export function availableUsableDates(rows:WorkDateIntegrityRow[],today:string=bangkokToday()):string[]{return Array.from(new Set(rows.filter(row=>isUsableActualWorkDate(row,today)).map(row=>row.work_date))).sort((a,b)=>b.localeCompare(a))}
export function isBatchWorkDateUsable(batch:WorkDateBatch,entry:WorkDateIntegrityRow|null|undefined,today:string=bangkokToday()):boolean{return Boolean(entry&&batch.work_date===entry.work_date&&isUsableActualWorkDate(entry,today))}
