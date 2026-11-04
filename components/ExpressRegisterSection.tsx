'use client'
import {useEffect,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {expressDocumentType} from '@/lib/expressRegisterDisplay'

type ExpressItem={line_seq:number;item_code:string|null;description:string|null;quantity:number|null;unit:string|null}
type DocumentRow={
 document_group:'PO_PL'|'PR_PC';document_no:string;document_date:string|null;
 supplier:string|null;plot_codes:string[];qa_status:string;grand_total:number|null;
 has_verified_project_override?:boolean;project_evidence_url?:string|null;
 source_file:string|null;search_text?:string|null;items?:ExpressItem[]
}
type RegistryData={
 status:'read_only'|'no_import';documents:DocumentRow[];
 latest:{completedAt:string;sourceFiles:number;documentCount:number;lineCount:number;
  skippedCanceled:number;reviewCount:number}|null;
 total:number;page:number;pageSize?:number;hasMore:boolean
}
function amount(value:number|null){
 return value===null?'-':Number(value).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})
}
const qaLabel:Record<string,string>={
 VERIFIED_SOURCE_ONLY:'อ่านต้นฉบับผ่าน — ยังไม่ยืนยัน Master',
 HOLD_UNASSIGNED_PLOT:'รอระบุ Plot',
 VERIFIED_PROJECT_OVERRIDE:'ยืนยันโครงการจากเอกสารต้นฉบับ',
 HOLD_MULTI_PLOT:'รอตรวจการแบ่งหลาย Plot',
 SOURCE_LINE_REVIEW:'ตรวจรายละเอียดต้นฉบับ',
}
function lineSummary(item:ExpressItem){
 const description=item.description?.trim()||item.item_code?.trim()||'ไม่ระบุรายละเอียด'
 const quantity=item.quantity===null?'':Number(item.quantity).toLocaleString('th-TH')
 return description+(quantity?' • '+quantity+(item.unit?' '+item.unit:''):'')
}
export default function ExpressRegisterSection({projectCode='',query='',procurementView=false}:{projectCode?:string;query?:string;procurementView?:boolean}){
 const [group,setGroup]=useState('')
 const [dateFrom,setDateFrom]=useState('')
 const [dateTo,setDateTo]=useState('')
 const [page,setPage]=useState(0)
 const [result,setResult]=useState<RegistryData|null>(null)
 const [state,setState]=useState<'loading'|'off'|'error'|'ready'>('loading')
 useEffect(()=>{setPage(0)},[projectCode,query,group,dateFrom,dateTo,procurementView])
 useEffect(()=>{
  let active=true
  const abort=new AbortController()
  setState('loading')
  void(async()=>{
   try{
    const {data:{session}}=await getSupabase().auth.getSession()
    if(!session?.access_token)throw Error('NO_SESSION')
    const params=new URLSearchParams({page:String(page)})
    if(group)params.set('group',group)
    if(procurementView){
     params.set('view','procurement')
     if(dateFrom)params.set('from',dateFrom)
     if(dateTo)params.set('to',dateTo)
    }
    if(projectCode)params.set('plot',projectCode)
    if(query.trim())params.set('q',query.trim().slice(0,80))
    const res=await fetch('/api/materials/express-register?'+params.toString(),{
     headers:{Authorization:'Bearer '+session.access_token},cache:'no-store',signal:abort.signal})
    if(res.status===503){
     const body=await res.json().catch(()=>({}))
     if(active)setState(body.error==='EXPRESS_REGISTER_DISPLAY_DISABLED'?'off':'error')
     return
    }
    if(!res.ok)throw Error('REGISTER_REQUEST_FAILED')
    const data=await res.json() as RegistryData
    if(active){setResult(data);setState('ready')}
   }catch{if(active)setState('error')}
  })()
  return ()=>{active=false;abort.abort()}
 },[group,page,projectCode,query,dateFrom,dateTo,procurementView])
 // Pin TH cells individually so header stays visible inside scroll container.
 const stickyHeaderCellStyle=procurementView?{position:'sticky' as const,top:0,zIndex:6,background:'var(--surface)'}:undefined
 if(state==='off')return null
 return <section aria-labelledby="express-register-title" style={{marginTop:24}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'end',flexWrap:'wrap',marginBottom:10}}>
   <div>
    <h2 id="express-register-title">ทะเบียน Express — PO/PL และ PR/PC ย้อนหลัง</h2>
    <p className="small muted">ข้อมูลเอกสารต้นฉบับแยกจากรายการจัดซื้อค้างส่ง • ไม่ถือว่าได้รับสินค้าแล้ว • ไม่เพิ่มยอดใน Materials Master</p>
   </div>
   <label className="small">ชนิดเอกสาร{' '}
    <select aria-label="ชนิดเอกสาร Express" value={group} onChange={e=>setGroup(e.target.value)}>
     <option value="">ทั้งหมด</option><option value="PO_PL">PO / PL</option><option value="PR_PC">PR / PC</option>
    </select>
   </label>
   {procurementView&&<>
    <label className="small">วันที่เอกสาร ตั้งแต่{' '}
     <input type="date" aria-label="วันที่เอกสาร Express ตั้งแต่" value={dateFrom} max={dateTo||undefined} onChange={e=>setDateFrom(e.target.value)}/>
    </label>
    <label className="small">ถึง{' '}
     <input type="date" aria-label="วันที่เอกสาร Express ถึง" value={dateTo} min={dateFrom||undefined} onChange={e=>setDateTo(e.target.value)}/>
    </label>
    {(dateFrom||dateTo)&&<button type="button" onClick={()=>{setDateFrom('');setDateTo('')}}>ล้างวันที่</button>}
   </>}
  </div>
  <div className="panel" style={{padding:12}}>
   {state==='loading'&&<p className="small muted">กำลังอ่านทะเบียน Express…</p>}
   {state==='error'&&<p role="alert" className="small muted">ทะเบียน Express ยังไม่พร้อมหรือไม่มีสิทธิ์อ่าน • Materials เดิมไม่ได้รับผลกระทบ</p>}
   {state==='ready'&&<>
    <p className="small muted">
     แสดง {result?.documents.length||0} จาก {result?.total||0} เอกสารตามตัวกรอง
     {' '}• ต้นฉบับทั้งหมด {result?.latest?.documentCount||0} เอกสาร / {result?.latest?.lineCount||0} บรรทัด
     {' '}• ยังต้องตรวจต้นฉบับ {result?.latest?.reviewCount||0} เอกสาร
    </p>
    <div className="table-wrap" style={procurementView?{overflow:'auto',maxHeight:620}:{overflowX:'auto'}}>
     <table className="materials-print-table" style={{minWidth:procurementView?1120:780}}>
      <thead><tr><th style={stickyHeaderCellStyle}>ประเภท</th><th style={stickyHeaderCellStyle}>เลขเอกสาร</th><th style={stickyHeaderCellStyle}>วันที่เอกสาร</th>{procurementView&&<th style={stickyHeaderCellStyle}>ซื้อ / จ้าง และรายละเอียดรายการ</th>}<th style={stickyHeaderCellStyle}>ผู้ขาย / ผู้ขอ</th><th style={stickyHeaderCellStyle}>Plot ที่อ้างอิง</th><th style={stickyHeaderCellStyle}>ยอดเอกสาร</th><th style={stickyHeaderCellStyle}>ผลตรวจ Source</th></tr></thead>
      <tbody>{(result?.documents||[]).map(row=><tr key={row.document_group+'|'+row.document_no}>
       <td>{row.document_group==='PO_PL'?'PO / PL':'PR / PC'}</td>
       <td><b>{row.document_no}</b></td><td>{row.document_date||'-'}</td>
       {procurementView&&<td style={{minWidth:290,maxWidth:520,whiteSpace:'normal'}}>
        <b>{expressDocumentType(row.document_no)}</b>
        {row.items?.length?<div className="small">
         {row.items.slice(0,2).map((item,index)=><div key={item.line_seq}>{index+1}. {lineSummary(item)}</div>)}
         {row.items.length>2&&<details><summary className="small">ดูอีก {row.items.length-2} รายการ</summary>
          {row.items.slice(2).map((item,index)=><div key={item.line_seq}>{index+3}. {lineSummary(item)}</div>)}
         </details>}
        </div>:<small className="muted">{(row.search_text||'').replace(row.document_no,'').replace(row.supplier||'','').trim()||'ต้นฉบับไม่ระบุรายละเอียดงาน'}</small>}
       </td>}
       <td>{row.supplier||'-'}</td>
       <td>{row.plot_codes?.join(', ')||'ยังไม่ระบุ'}</td>
       <td style={{textAlign:'right',whiteSpace:'nowrap'}}>{amount(row.grand_total)}</td>
       <td>{qaLabel[row.qa_status]||row.qa_status}
        {row.has_verified_project_override&&row.project_evidence_url?.startsWith('https://drive.google.com/file/d/')&&
         <small><a href={row.project_evidence_url} target="_blank" rel="noopener noreferrer">หลักฐานการระบุโครงการ</a></small>}
       </td>
      </tr>)}</tbody>
     </table>
     {!result?.documents.length&&<p className="small muted" style={{padding:12}}>ไม่พบเอกสารที่ตรงกับตัวกรอง</p>}
    </div>
    <div style={{display:'flex',alignItems:'center',gap:10,justifyContent:'end',marginTop:10}}>
     <button type="button" disabled={page<=0} onClick={()=>setPage(x=>Math.max(0,x-1))}>ก่อนหน้า</button>
     <span className="small muted">หน้า {page+1}</span>
     <button type="button" disabled={!result?.hasMore} onClick={()=>setPage(x=>x+1)}>ถัดไป</button>
    </div>
   </>}
  </div>
 </section>
}
