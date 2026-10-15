export const CONTACT_BOOK_CSV_FILE_ID = '1pea9ALaYxhVNvBzuGb615s7_M8rYesic'
export const CONTACT_BOOK_SOURCE_URL = 'https://drive.google.com/file/d/1pea9ALaYxhVNvBzuGb615s7_M8rYesic/view'

export const CONTACT_FIELDS = [
  'contact_id', 'category', 'service_group', 'organization', 'contact_name', 'phone',
  'work_scope', 'project_area', 'verified_status', 'review_note', 'source_file',
  'source_url', 'source_reference_date', 'secondary_phone', 'active', 'aliases',
] as const
export type ContactField = typeof CONTACT_FIELDS[number]
export type ContactEntry = Record<ContactField,string>
export type EditableContact = Pick<ContactEntry,'category'|'service_group'|'organization'|'contact_name'|'phone'|'work_scope'|'project_area'|'review_note'|'secondary_phone'|'active'|'aliases'>

export function normalizedPhone(input:string){
  return String(input||'').replace(/[^0-9]/g,'')
}
export function thaiDate(){
  const p = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  return [p.find(x=>x.type==='day')?.value,p.find(x=>x.type==='month')?.value,p.find(x=>x.type==='year')?.value].join('/')
}

export function parseContactCsv(csv:string):ContactEntry[]{
  const text=String(csv||'').replace(/^\uFEFF/,'')
  const matrix:string[][]=[]
  let row:string[]=[];let value='';let quote=false
  for(let i=0;i<text.length;i++){
    const ch=text[i]
    if(quote){if(ch==='"'){if(text[i+1]==='"'){value+='"';i++}else quote=false}else value+=ch;continue}
    if(ch==='"'){quote=true;continue}
    if(ch===','){row.push(value);value='';continue}
    if(ch==='\r'||ch==='\n'){
      if(ch==='\r'&&text[i+1]==='\n')i++
      row.push(value);matrix.push(row);row=[];value='';continue
    }
    value+=ch
  }
  if(quote)throw new Error('invalid_csv_quote')
  if(row.length||value){row.push(value);matrix.push(row)}
  const header=matrix.shift()
  if(!header||header.join('|')!==CONTACT_FIELDS.join('|'))throw new Error('contact_book_csv_header_changed')
  const entries=matrix.filter(r=>r.some(Boolean)).map(r=>{
    if(r.length!==CONTACT_FIELDS.length)throw new Error('contact_book_csv_column_mismatch')
    return Object.fromEntries(CONTACT_FIELDS.map((field,i)=>[field,r[i]||''])) as ContactEntry
  })
  if(entries.length<41)throw new Error('contact_book_csv_source_rows_below_baseline')
  const ids=new Set<string>()
  for(const entry of entries){
    if(!/^3KC-\d{4,}$/.test(entry.contact_id)||ids.has(entry.contact_id))throw new Error('contact_book_csv_duplicate_or_invalid_id')
    ids.add(entry.contact_id)
  }
  validateUniquePhones(entries)
  return entries
}

function csvCell(value:string){
  const raw=String(value??'')
  return /[",\r\n]/.test(raw)?'"'+raw.replace(/"/g,'""')+'"':raw
}
export function formatContactCsv(rows:ContactEntry[]){
  return '\uFEFF'+[CONTACT_FIELDS.join(','),...rows.map(row=>CONTACT_FIELDS.map(key=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n'
}
export function validateUniquePhones(rows:ContactEntry[]){
  const used=new Map<string,string>()
  for(const row of rows){
    for(const value of [row.phone,row.secondary_phone]){
      if(!value.trim())continue
      const number=normalizedPhone(value)
      if(number.length<9||number.length>15)throw new Error('invalid_contact_phone')
      const previous=used.get(number)
      if(previous&&previous!==row.contact_id)throw new Error('duplicate_contact_phone:'+previous)
      used.set(number,row.contact_id)
    }
  }
}
export function cleanContactInput(value:Partial<EditableContact>):EditableContact{
  const limits:Record<keyof EditableContact,number>={
    category:40,service_group:140,organization:220,contact_name:140,
    phone:35,work_scope:500,project_area:220,review_note:1200,
    secondary_phone:35,active:10,aliases:220
  }
  const out={} as EditableContact
  for(const key of Object.keys(limits) as (keyof EditableContact)[]){
    const text=String(value[key]??'').trim()
    if(text.length>limits[key])throw new Error('contact_field_too_long:'+key)
    out[key]=text
  }
  if(!['ผู้รับเหมา','ร้านค้า'].includes(out.category))throw new Error('invalid_contact_category')
  if(!out.organization||!out.contact_name||!out.work_scope||!out.project_area)throw new Error('contact_required_fields')
  if(!/^0[0-9\s()+\-]{8,20}$/.test(out.phone)||normalizedPhone(out.phone).length<9)throw new Error('invalid_contact_phone')
  if(out.secondary_phone&&(!/^[0-9\s()+\-]{9,25}$/.test(out.secondary_phone)||normalizedPhone(out.secondary_phone).length<9))throw new Error('invalid_secondary_phone')
  if(!['ใช่','ไม่ใช่'].includes(out.active))throw new Error('invalid_active_value')
  return out
}
export function putContact(rows:ContactEntry[],id:string|null,input:EditableContact,sourceUrl=CONTACT_BOOK_SOURCE_URL){
  const list=rows.map(x=>({...x}))
  const clean=cleanContactInput(input)
  const index=id?list.findIndex(x=>x.contact_id===id):-1
  if(id&&index<0)throw new Error('contact_not_found')
  let record:ContactEntry
  if(index>=0){record={...list[index],...clean};list[index]=record}
  else{
    const number=Math.max(0,...list.map(x=>Number(x.contact_id.match(/\d+$/)?.[0]||0)))+1
    const contact_id='3KC-'+String(number).padStart(4,'0')
    record={...Object.fromEntries(CONTACT_FIELDS.map(f=>[f,''])) as ContactEntry,...clean,contact_id,
      verified_status:'เพิ่มผ่านเว็บไซต์ รอตรวจสอบ',
      source_file:'Contact Book Web App',source_url:CONTACT_BOOK_SOURCE_URL,
      source_reference_date:thaiDate()}
    list.push(record)
  }
  validateUniquePhones(list)
  return {rows:list,record}
}
