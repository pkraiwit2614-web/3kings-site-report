'use strict'
/**
 * Pure Express export source selector. The Drive folder ID and source revision
 * are verified by the authenticated route; this module only selects a name.
 */
const PATTERNS={
  po_history:/^(?:PO2024-Now|PO20\d{2}-\d{12})\.csv$/i,
  pr_history:/^(?:PR2024-Now|PR20\d{2}-\d{12})\.csv$/i,
  po_daily:/^\d{12}\.csv$/i,
  pr_daily:/^PR-\d{12}\.csv$/i,
}
function exportTime(name){
  const match=/^(?:PO|PR)20\d{2}-(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})\.csv$/i.exec(name)
  if(!match)return 0 // Legacy 2024-Now or daily format: use modifiedTime.
  const [,day,month,year,hour,minute]=match.map(String)
  const date=new Date(Date.UTC(+year,+month-1,+day,+hour,+minute))
  if(date.getUTCFullYear()!==+year||date.getUTCMonth()!==+month-1||
     date.getUTCDate()!==+day||date.getUTCHours()!==+hour||
     date.getUTCMinutes()!==+minute) return -1
  return date.getTime()
}
function selectExpressCsv(files,mode){
  const pattern=PATTERNS[mode]
  if(!pattern||!Array.isArray(files))throw Error('INVALID_SOURCE_MODE')
  const matches=files.filter(f=>f&&f.mimeType==='text/csv'&&
    /^[\w-]{15,100}$/.test(String(f.id||''))&&
    Number.isFinite(Number(f.size))&&Number(f.size)>0&&Number(f.size)<=8_000_000&&
    typeof f.name==='string'&&pattern.test(f.name)&&
    Number.isFinite(Date.parse(String(f.modifiedTime||'')))&&exportTime(f.name)!==-1)
  if(!matches.length)throw Error('NO_VALID_EXPRESS_CSV')
  matches.sort((a,b)=>exportTime(b.name)-exportTime(a.name)||
    Date.parse(b.modifiedTime)-Date.parse(a.modifiedTime))
  // Two distinct objects for the same named historical export are ambiguous.
  if(mode.endsWith('history')&&matches.length>1&&
     exportTime(matches[0].name)===exportTime(matches[1].name)&&
     matches[0].name===matches[1].name)throw Error('SOURCE_AMBIGUOUS')
  return matches[0]
}
module.exports={selectExpressCsv,exportTime}
