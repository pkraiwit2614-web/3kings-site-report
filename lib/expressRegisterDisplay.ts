/** Presentation-only helpers for the historical Express register. No writes or status inference. */
export function expressDateISO(value:string|null|undefined):string|null {
 const raw=(value||'').trim()
 if(!raw)return null
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
 const thai=/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(raw)
 if(!iso&&!thai)return null
 let year=Number(iso?iso[1]:thai![3])
 const month=Number(iso?iso[2]:thai![2])
 const day=Number(iso?iso[3]:thai![1])
 // Express records use abbreviated Thai Buddhist years: 68 -> 2025, 69 -> 2026.
 if(thai&&thai[3].length===2)year+=2500
 if(year>=2400)year-=543
 const date=new Date(Date.UTC(year,month-1,day))
 if(!Number.isFinite(date.getTime())||date.getUTCFullYear()!==year||
    date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null
 return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')
}

type DatedDocument={document_date:string|null;document_no:string;document_group:string}
export function compareExpressDocumentsNewestFirst(a:DatedDocument,b:DatedDocument):number {
 const aDate=expressDateISO(a.document_date)
 const bDate=expressDateISO(b.document_date)
 if(aDate!==bDate)return !aDate?1:!bDate?-1:bDate.localeCompare(aDate)
 return b.document_no.localeCompare(a.document_no,'en',{numeric:true})||
  a.document_group.localeCompare(b.document_group)
}

export function expressDocumentType(documentNo:string):string {
 switch((documentNo||'').slice(0,2).toUpperCase()){
  case 'PO': return 'สั่งซื้อ'
  case 'PL': return 'สั่งจ้าง'
  case 'PR': return 'ขอซื้อ'
  case 'PC': return 'ขอจ้าง'
  default: return 'ไม่ระบุประเภท'
 }
}
