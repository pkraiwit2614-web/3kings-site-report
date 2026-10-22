'use client'
import {useEffect,useMemo,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
type Po={
 poNo:string;orderedDate:string;supplier:string;total:string;projectCodes:string[];
 decision:'staged_verified'|'hold_mapping'|'hold_qa';receiptEvidence:'unverified';itemCount:number
}
type Data={
 status:'staged_read_only'|'no_import';
 source:{fileName:string;fileModifiedAt:string;importedAt:string}|null;
 documents:Po[];counts?:{documents:number;items:number;holdQa:number;holdMapping:number}
}
function dateTime(value:string|undefined){
 if(!value)return '-'
 const d=new Date(value);if(Number.isNaN(d.getTime()))return '-'
 return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',
  day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)
}
const money=(v:string)=>{
 const n=Number(v)
 return Number.isFinite(n)?n.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}):'-'
}
export default function ExpressPoSection({projectCode='',query=''}:{projectCode?:string;query?:string}){
 const [result,setResult]=useState<Data|null>(null)
 const [status,setStatus]=useState<'loading'|'off'|'error'|'ready'>('loading')
 useEffect(()=>{
  let active=true
  const controller=new AbortController()
  void (async()=>{
   try{
    const s=getSupabase()
    const {data:{session}}=await s.auth.getSession()
    if(!session?.access_token)throw Error('NO_SESSION')
    const res=await fetch('/api/materials/express-po',{headers:{Authorization:'Bearer '+session.access_token},
     cache:'no-store',signal:controller.signal})
    if(res.status===503){
     const p=await res.json().catch(()=>({}))
     if(active)setStatus(p.error==='EXPRESS_PO_DISPLAY_DISABLED'?'off':'error')
     return
    }
    if(!res.ok)throw Error('REQUEST_FAILED')
    const data=await res.json() as Data
    if(active){setResult(data);setStatus('ready')}
   }catch{if(active)setStatus('error')}
  })()
  return ()=>{active=false;controller.abort()}
 },[])
 const filtered=useMemo(()=>{
  const key=query.trim().toLowerCase()
  return (result?.documents||[]).filter(row=>
   (!projectCode||row.projectCodes.includes(projectCode))&&
   (!key||[row.poNo,row.supplier,row.orderedDate,row.total,...row.projectCodes]
    .join(' ').toLowerCase().includes(key)))
 },[result,projectCode,query])
 if(status==='off')return null
 return <section aria-labelledby="express-po-title" style={{marginTop:26}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'end',flexWrap:'wrap',marginBottom:10}}>
   <div>
    <h2 id="express-po-title" style={{margin:'0 0 3px'}}>Express PO — ข้อมูลใบสั่งซื้อ</h2>
    <div className="small muted">รายงานจาก Express แยกจาก Materials Master • PO ไม่เท่ากับรับวัสดุ • รายการที่ยังไม่ยืนยันจะไม่ถูกนับเป็นงานรับเข้า</div>
   </div>
   <span className="small muted">อัปเดตไฟล์ล่าสุด {dateTime(result?.source?.fileModifiedAt)}</span>
  </div>
  <div className="panel" style={{padding:12}}>
   {status==='loading'&&<p className="small muted">กำลังอ่านข้อมูล Express PO…</p>}
   {status==='error'&&<p role="alert" className="small muted">ยังตรวจสอบข้อมูล Express PO ไม่สำเร็จ — ระบบ Materials เดิมยังใช้งานตามปกติ</p>}
   {status==='ready'&&<>
    <div className="small muted" style={{marginBottom:10}}>
     แสดง {filtered.length} / {result?.counts?.documents??0} PO • รายการสินค้า {result?.counts?.items??0} •
     รอจับคู่โครงการ {result?.counts?.holdMapping??0} • รอตรวจยอด {result?.counts?.holdQa??0}
    </div>
    <div className="table-wrap" style={{maxHeight:490,overflow:'auto'}}>
     <table className="materials-print-table" style={{minWidth:900}}>
      <thead><tr><th>เลข PO</th><th>วันที่สั่งซื้อ</th><th>ผู้จำหน่าย</th><th>โครงการ</th><th>รายการ</th><th>ยอดรวม (บาท)</th><th>การตรวจข้อมูล</th></tr></thead>
      <tbody>{filtered.map(row=><tr key={row.poNo}>
       <td><b>{row.poNo}</b></td><td>{row.orderedDate||'-'}</td><td>{row.supplier||'-'}</td>
       <td>{row.projectCodes.join(' / ')||'ยังไม่ระบุโครงการ'}</td><td>{row.itemCount}</td>
       <td style={{textAlign:'right',whiteSpace:'nowrap'}}>{money(row.total)}</td>
       <td>{row.decision==='hold_qa'?'พักตรวจยอด':row.decision==='hold_mapping'?'รอระบุโครงการ':'เอกสารผ่าน QA'}
        <small>สถานะรับวัสดุ: ยังไม่ยืนยัน</small>
       </td>
      </tr>)}</tbody>
     </table>
     {!filtered.length&&<p className="muted" style={{padding:14}}>ไม่พบ PO ตรงกับตัวกรอง</p>}
    </div>
   </>}
  </div>
 </section>
}
