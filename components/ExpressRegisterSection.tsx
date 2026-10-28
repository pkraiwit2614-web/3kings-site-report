'use client'
import {useEffect,useState} from 'react'
import {getSupabase} from '@/lib/supabase'

type DocumentRow={
 document_group:'PO_PL'|'PR_PC';document_no:string;document_date:string|null;
 supplier:string|null;plot_codes:string[];qa_status:string;grand_total:number|null;
 has_verified_project_override?:boolean;project_evidence_url?:string|null;
 source_file:string|null
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
export default function ExpressRegisterSection({projectCode='',query=''}:{projectCode?:string;query?:string}){
 const [group,setGroup]=useState('')
 const [page,setPage]=useState(0)
 const [result,setResult]=useState<RegistryData|null>(null)
 const [state,setState]=useState<'loading'|'off'|'error'|'ready'>('loading')
 useEffect(()=>{setPage(0)},[projectCode,query,group])
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
 },[group,page,projectCode,query])
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
    <div className="table-wrap" style={{overflowX:'auto'}}>
     <table className="materials-print-table" style={{minWidth:780}}>
      <thead><tr><th>ประเภท</th><th>เลขเอกสาร</th><th>วันที่เอกสาร</th><th>ผู้ขาย / ผู้ขอ</th><th>Plot ที่อ้างอิง</th><th>ยอดเอกสาร</th><th>ผลตรวจ Source</th></tr></thead>
      <tbody>{(result?.documents||[]).map(row=><tr key={row.document_group+'|'+row.document_no}>
       <td>{row.document_group==='PO_PL'?'PO / PL':'PR / PC'}</td>
       <td><b>{row.document_no}</b></td><td>{row.document_date||'-'}</td>
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
