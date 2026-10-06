'use client'

import {useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {getActivitySessionId} from '@/lib/activityLog'

type ReviewStatus='pending'|'confirmed'|'needs_review'
type ItemInput={
  id:string
  current_status?:string|null
  expected_delivery_text?:string|null
  expected_delivery?:string|null
  condition_note?:string|null
  web_review_status?:ReviewStatus|null
}
type Saved={
  current_status:string|null
  expected_delivery_text:string|null
  expected_delivery:string|null
  condition_note:string|null
  web_review_status:ReviewStatus
}

export default function ProcurementOverrideEditor({item,editable,onSaved}:{item:ItemInput;editable:boolean;onSaved:(next:Saved)=>void}){
  const [open,setOpen]=useState(false)
  const [currentStatus,setCurrentStatus]=useState(item.current_status||'')
  const [deliveryText,setDeliveryText]=useState(item.expected_delivery_text||'')
  const [deliveryDate,setDeliveryDate]=useState(item.expected_delivery||'')
  const [conditionNote,setConditionNote]=useState(item.condition_note||'')
  const [reviewStatus,setReviewStatus]=useState<ReviewStatus>(item.web_review_status||'pending')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  if(!editable)return item.web_review_status?<span className="small muted">Web: {item.web_review_status}</span>:null

  const save=async()=>{
    setSaving(true);setError('')
    try{
      const {error:rpcError}=await getSupabase().rpc('procurement_save_web_override',{
        p_item_id:item.id,
        p_current_status:currentStatus||null,
        p_expected_delivery_text:deliveryText||null,
        p_expected_delivery:deliveryDate||null,
        p_condition_note:conditionNote||null,
        p_review_status:reviewStatus,
        p_client_session_id:getActivitySessionId(),
        p_user_agent:window.navigator.userAgent,
      })
      if(rpcError)throw rpcError
      onSaved({
        current_status:currentStatus||null,
        expected_delivery_text:deliveryText||null,
        expected_delivery:deliveryDate||null,
        condition_note:conditionNote||null,
        web_review_status:reviewStatus,
      })
      setOpen(false)
    }catch(err:any){setError(String(err?.message||'บันทึกไม่สำเร็จ'))}
    finally{setSaving(false)}
  }

  return <div className="proc-web-editor">
    <button type="button" className="button proc-edit-button" onClick={()=>setOpen(v=>!v)}>{open?'ปิด':'แก้ไข'}</button>
    {item.web_review_status&&<small>Web: {item.web_review_status}</small>}
    {open&&<div className="proc-edit-card">
      <label>ขั้นตอนปัจจุบัน<textarea rows={2} value={currentStatus} onChange={e=>setCurrentStatus(e.target.value)} /></label>
      <label>กำหนดส่ง / ข้อความ<textarea rows={2} value={deliveryText} onChange={e=>setDeliveryText(e.target.value)} /></label>
      <label>วันที่กำหนดส่ง<input type="date" value={deliveryDate||''} onChange={e=>setDeliveryDate(e.target.value)} /></label>
      <label>รายละเอียด / สิ่งที่ต้องตาม<textarea rows={3} value={conditionNote} onChange={e=>setConditionNote(e.target.value)} /></label>
      <label>การยืนยัน<select value={reviewStatus} onChange={e=>setReviewStatus(e.target.value as ReviewStatus)}>
        <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="needs_review">Needs Review</option>
      </select></label>
      <div className="proc-edit-foot"><span>Web override • ไม่แก้ Purchasing raw</span><button type="button" className="button primary" disabled={saving} onClick={save}>{saving?'Saving…':'Save'}</button></div>
      {error&&<div className="proc-edit-error" role="alert">{error}</div>}
    </div>}
    <style jsx>{`
      .proc-web-editor{position:relative;display:grid;gap:3px;min-width:70px}.proc-edit-button{min-height:30px;padding:5px 8px;font-size:10px}.proc-web-editor>small{font-size:8px;color:var(--muted)}
      .proc-edit-card{position:absolute;right:0;top:34px;z-index:40;width:330px;display:grid;gap:7px;padding:10px;border:1px solid var(--line);border-radius:11px;background:#fff;box-shadow:0 12px 34px rgba(23,42,67,.18);text-align:left}
      .proc-edit-card label{display:grid;gap:3px;font-size:9px;font-weight:800;color:var(--muted)}.proc-edit-card input,.proc-edit-card textarea,.proc-edit-card select{width:100%;border:1px solid var(--line);border-radius:7px;padding:6px 7px;background:#fff;color:var(--text);font:inherit;font-size:10.5px;resize:vertical}
      .proc-edit-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}.proc-edit-foot span{font-size:8.5px;color:var(--muted)}.proc-edit-error{padding:6px;border-radius:7px;background:#fff0ef;color:#95342e;font-size:9px}
      @media(max-width:760px){.proc-edit-card{position:fixed;left:12px;right:12px;top:auto;bottom:76px;width:auto;max-height:72vh;overflow:auto}}
    `}</style>
  </div>
}
