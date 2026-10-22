'use client'
import {useEffect,useState} from 'react'
import {getSupabase} from '@/lib/supabase'

type Run={id:string;source_fingerprint:string;source_files:number;document_count:number;line_count:number;review_count:number;completed_at:string}
type Doc={document_group:'PO_PL'|'PR_PC';document_no:string;line_seq:number;document_date:string|null;supplier:string|null;plot_codes:string[];
 qa_status:string;source_url:string|null;grand_total:number|null;search_text:string}
type Line={line_seq:number;item_code:string|null;description:string|null;quantity:number|null;unit:string|null;
 unit_price:number|null;line_amount:number|null}
const PAGE_SIZE=50
const money=(n:number|null)=>n==null?'—':Number(n).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})
const literal=(s:string)=>s.slice(0,120).replace(/[\\%_]/g,'\\$&')

export default function ExpressPoSection({projectCode='',query=''}:{projectCode?:string;query?:string}){
 const [run,setRun]=useState<Run|null>(null)
 const [rows,setRows]=useState<Doc[]>([])
 const [count,setCount]=useState(0)
 const [page,setPage]=useState(0)
 const [busy,setBusy]=useState(true)
 const [error,setError]=useState('')
 const [selected,setSelected]=useState<string|null>(null)
 const [lines,setLines]=useState<Line[]>([])
 const [linesCount,setLinesCount]=useState(0)
 const [lineError,setLineError]=useState('')
 useEffect(()=>{setPage(0);setSelected(null)},[projectCode,query])
 useEffect(()=>{
  let active=true
  const s=getSupabase()
  setBusy(true)
  void (async()=>{
   try{
    const {data:batch,error:batchError}=await s.from('express_register_runs')
      .select('id,source_fingerprint,source_files,document_count,line_count,review_count,completed_at')
      .eq('state','complete').order('completed_at',{ascending:false}).limit(1).maybeSingle()
    if(batchError)throw batchError
    if(!batch){if(active){setRun(null);setRows([]);setCount(0);setError('ยังไม่มีทะเบียน Express ที่ผ่านการ Sync')}return}
    let request=s.from('express_register_rows')
      .select('document_group,document_no,line_seq,document_date,supplier,plot_codes,qa_status,source_url,grand_total,search_text',{count:'exact'})
      .eq('batch_id',batch.id).eq('line_seq',0)
    if(projectCode)request=request.contains('plot_codes',[projectCode])
    const q=literal(query.trim())
    if(q)request=request.ilike('search_text','%'+q+'%')
    const {data, count:total, error:rowError}=await request.order('document_no').range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1)
    if(rowError)throw rowError
    if(active){setRun(batch as Run);setRows((data||[]) as Doc[]);setCount(total||0);setError('')}
   }catch{if(active){setError('ยังอ่านทะเบียน Express ไม่สำเร็จ หรือยังไม่ได้เปิดใช้ฐานข้อมูล');setRows([]);setCount(0)}}
   finally{if(active)setBusy(false)}
  })()
  return()=>{active=false}
 },[projectCode,query,page])
 useEffect(()=>{
  if(!selected||!run){setLines([]);setLinesCount(0);setLineError('');return}
  let active=true;const [group,docNo]=selected.split('|')
  const s=getSupabase()
  void (async()=>{
   const {data,count,error:err}=await s.from('express_register_rows')
      .select('line_seq,item_code,description,quantity,unit,unit_price,line_amount',{count:'exact'})
      .eq('batch_id',run.id).eq('document_group',group).eq('document_no',docNo)
      .gt('line_seq',0).order('line_seq').range(0,199)
   if(active){if(err){setLineError('ยังอ่านรายละเอียดรายบรรทัดไม่ได้');setLines([])}
     else{setLineError('');setLines((data||[]) as Line[]);setLinesCount(count||0)}}
  })()
  return()=>{active=false}
 },[selected,run])
 // All procurement information is protected by the existing procurement-view RLS policy.
 if(error && !run)return null
 return <section aria-labelledby="express-register-title" style={{marginTop:26}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,flexWrap:'wrap',marginBottom:10}}>
   <div><h2 id="express-register-title" style={{margin:'0 0 3px'}}>Express Register — PR / PC / PO / PL</h2>
    <div className="small muted">ทะเบียนเอกสารย้อนหลัง แยกจากยอด Materials และงาน Purchasing Follow-up • PO ไม่ใช่หลักฐานรับสินค้า</div>
   </div>
   <span className="small muted">{run?.completed_at?new Date(run.completed_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):''}</span>
  </div>
  <div className="panel" style={{padding:12}}>
   {busy?<p className="small muted">กำลังโหลดทะเบียน Express…</p>:error?<p role="alert" className="small muted">{error}</p>:<>
    <p className="small muted">พบ {count.toLocaleString('th-TH')} เอกสารตามตัวกรอง • ทะเบียนทั้งหมด {run?.document_count.toLocaleString('th-TH')} เอกสาร / {run?.line_count.toLocaleString('th-TH')} บรรทัด • รอตรวจ {run?.review_count.toLocaleString('th-TH')} เอกสาร</p>
    <div className="table-wrap"><table className="materials-print-table" style={{minWidth:890}}>
     <thead><tr><th>เอกสาร</th><th>วันที่</th><th>ผู้ขาย/ผู้รับเหมา</th><th>โครงการ</th><th>ยอดเอกสาร</th><th>ตรวจข้อมูล</th><th>หลักฐาน</th></tr></thead>
     <tbody>{rows.map(d=>{
      const key=d.document_group+'|'+d.document_no
      return <tr key={key}><td><button type="button" className="button" aria-label={'ดูรายการ '+d.document_no} onClick={()=>setSelected(selected===key?null:key)}>{d.document_no}</button></td>
       <td>{d.document_date||'—'}</td><td>{d.supplier||'—'}</td><td>{d.plot_codes?.join(' / ')||'ยังไม่ระบุ Plot'}</td>
       <td style={{textAlign:'right'}}>{money(d.grand_total)}</td>
       <td>{d.qa_status==='VERIFIED_SOURCE_ONLY'?'ยืนยันต้นทาง':d.qa_status==='SOURCE_LINE_REVIEW'?'รอตรวจบรรทัด':d.qa_status==='HOLD_MULTI_PLOT'?'หลายโครงการ':'รอระบุ Plot'}</td>
       <td>{d.source_url?.startsWith('https://drive.google.com/file/d/')?<a href={d.source_url} target="_blank" rel="noopener noreferrer">เปิดต้นฉบับ</a>:'—'}</td>
      </tr>})}</tbody>
    </table></div>
    {!rows.length&&<p className="muted">ไม่พบเอกสารตามคำค้น</p>}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:10}}>
     <button type="button" className="button" disabled={page===0} onClick={()=>{setPage(p=>Math.max(0,p-1));setSelected(null)}}>ก่อนหน้า</button>
     <span className="small muted">หน้า {page+1} / {Math.max(1,Math.ceil(count/PAGE_SIZE))}</span>
     <button type="button" className="button" disabled={(page+1)*PAGE_SIZE>=count} onClick={()=>{setPage(p=>p+1);setSelected(null)}}>ถัดไป</button>
    </div>
    {selected&&<div style={{marginTop:16}}><h3 style={{fontSize:15}}>รายการในเอกสาร {selected.split('|')[1]}</h3>
      {lineError?<p role="alert">{lineError}</p>:<><div className="table-wrap"><table className="materials-print-table" style={{minWidth:700}}>
       <thead><tr><th>ลำดับ</th><th>รหัส</th><th>รายการ</th><th>จำนวน</th><th>หน่วย</th><th>ราคาต่อหน่วย</th><th>รวม</th></tr></thead>
       <tbody>{lines.map(d=><tr key={d.line_seq}><td>{d.line_seq}</td><td>{d.item_code||'—'}</td><td>{d.description||'รอตรวจรายละเอียด'}</td>
        <td>{d.quantity??'—'}</td><td>{d.unit||'—'}</td><td>{money(d.unit_price)}</td><td>{money(d.line_amount)}</td></tr>)}</tbody>
      </table></div>{linesCount>200&&<p className="small muted">แสดง 200 รายการแรกจาก {linesCount} รายการ</p>}</>}
     </div>}
   </>}
  </div>
 </section>
}
