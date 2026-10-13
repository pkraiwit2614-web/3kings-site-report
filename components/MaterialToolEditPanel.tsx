'use client'
import {useEffect,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {canManageMaterialsTools} from '@/lib/accessControl'
import useAccessRole from '@/components/useAccessRole'

type Target={type:'material'|'tool';item:Record<string,any>}
const MATERIAL_STATUSES=['สั่งแล้ว','ยังไม่สั่ง','สั่งมาไม่พอ','เจ้าของจัดหา','ต้องติดตาม','รอตรวจสอบ','ไม่เกี่ยวข้อง','ไม่ระบุ']

export default function MaterialToolEditPanel({target,onClose,onSaved}:{target:Target;onClose:()=>void;onSaved:()=>void}){
 const {role}=useAccessRole(),allowed=canManageMaterialsTools(role),{item,type}=target
 const [status,setStatus]=useState(String(item.status||''))
 const [detail,setDetail]=useState(String(item.status_detail||''))
 const [notes,setNotes]=useState(String(item.notes||''))
 const [location,setLocation]=useState(String(item.location||''))
 const [responsible,setResponsible]=useState(String(item.responsible_person||''))
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{const prev=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=prev}},[])
 const save=async()=>{
  if(!allowed||busy)return;setBusy(true);setError('')
  try{
   const {error:e}=await getSupabase().rpc('material_tool_override_save',{
    p_item_type:type,p_item_id:item.id,p_status:status,
    p_status_detail:type==='material'?detail:null,p_notes:notes,
    p_location:type==='tool'?location:null,p_responsible_person:type==='tool'?responsible:null,
    p_expected_updated_at:item.__override_updated_at||null
   })
   if(e)throw e;onSaved()
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 if(!allowed)return null
 return <div className="material-edit-backdrop">
  <section role="dialog" aria-modal="true" aria-label="แก้ไขรายการวัสดุหรือเครื่องมือ" className="material-edit-dialog">
   <h2>{type==='material'?'จัดการสถานะวัสดุ':'จัดการสถานะเครื่องมือ'}</h2>
   <b>{String(item.item_name||'')} {type==='tool'?'('+String(item.item_code||'')+')':''}</b>
   <p className="muted small">บันทึกการแก้ไขแยกจาก Excel ต้นทาง • ไม่เปลี่ยนข้อมูล PR/PO ปริมาณ หรือสเปก</p>
   <label>สถานะ{type==='material'?<select value={status} onChange={e=>setStatus(e.target.value)}>{MATERIAL_STATUSES.map(x=><option key={x} value={x}>{x}</option>)}</select>:<input value={status} onChange={e=>setStatus(e.target.value)} maxLength={120}/>}</label>
   {type==='material'?<label>รายละเอียดสถานะ<textarea rows={3} value={detail} maxLength={4000} onChange={e=>setDetail(e.target.value)}/></label>:<>
    <label>สถานที่ล่าสุด<input value={location} maxLength={500} onChange={e=>setLocation(e.target.value)}/></label>
    <label>ผู้รับผิดชอบ<input value={responsible} maxLength={500} onChange={e=>setResponsible(e.target.value)}/></label>
   </>}
   <label>หมายเหตุ<textarea rows={3} value={notes} maxLength={4000} onChange={e=>setNotes(e.target.value)}/></label>
   {error&&<p role="alert" style={{color:'#b42318'}}>{error.includes('REVISION_CONFLICT')?'ข้อมูลถูกแก้ไขใหม่แล้ว กรุณาปิดแล้วเปิดรายการอีกครั้ง':error}</p>}
   <div className="material-edit-actions">
    <button type="button" className="button" disabled={busy} onClick={onClose}>ยกเลิก</button>
    <button type="button" className="button primary" disabled={busy||!status.trim()} onClick={()=>{void save()}}>{busy?'กำลังบันทึก…':'บันทึก'}</button>
   </div>
  </section>
  <style jsx>{`
    .material-edit-backdrop{position:fixed;inset:0;z-index:1100;background:rgba(9,23,40,.55);display:grid;place-items:center;padding:16px}
    .material-edit-dialog{width:min(560px,100%);max-height:92vh;overflow:auto;display:grid;gap:12px;padding:20px;border-radius:12px;background:#fff;color:#182c43;box-shadow:0 18px 50px #0003}
    h2,p{margin:0}.material-edit-dialog label{display:grid;gap:5px;font-size:12px;font-weight:700}
    .material-edit-dialog input,.material-edit-dialog select,.material-edit-dialog textarea{width:100%;padding:9px;border:1px solid #b9c6d2;border-radius:7px;font:inherit}
    .material-edit-actions{display:flex;justify-content:flex-end;gap:8px}
    @media print{.material-edit-backdrop{display:none!important}}
  `}</style>
 </div>
}