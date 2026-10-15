/** Shared display date. Do not treat a document date as confirmed SLA receipt. */
export type NoticeRoom={room_no:string;latest_source?:string|null;source_note?:string|null}
const HOTEL_NOTICE_DATE_BY_ROOM:Record<string,string>={
  A202:'2026-09-21',
  A211:'2026-09-24',
  A313:'2026-09-26',
  A314:'2026-09-26',
  A326:'2026-09-26',
  A410:'2026-09-27',
  A412:'2026-09-27',
  A501:'2026-09-16',
  A616:'2026-09-27',
  B212:'2026-09-22',
  B214:'2026-09-23',
}

export function hotelNoticeDateTH(r:NoticeRoom){
  const sourceText=[r.latest_source,r.source_note].filter(Boolean).join(' ')
  const sourceDate=sourceText.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/)
  if(sourceDate){
    const day=sourceDate[1].padStart(2,'0')
    const month=sourceDate[2].padStart(2,'0')
    const buddhistYear=Number(sourceDate[3])+543
    return `${day}/${month}/${String(buddhistYear).slice(-2)}`
  }
  const value=HOTEL_NOTICE_DATE_BY_ROOM[r.room_no]
  if(!value)return '—'
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if(!m)return '—'
  const buddhistYear=Number(m[1])+543
  return `${m[3]}/${m[2]}/${String(buddhistYear).slice(-2)}`
}
