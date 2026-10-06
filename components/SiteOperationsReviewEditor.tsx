'use client'

import {useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {getActivitySessionId} from '@/lib/activityLog'

type ReviewStatus='pending'|'confirmed'|'needs_review'
type Review={review_status:ReviewStatus;management_note:string|null;updated_at:string|null}|null

export default function SiteOperationsReviewEditor({entryId,review,editable,onSaved}:{entryId:string;review:Review;editable:boolean;onSaved:(review:Exclude<Review,null>)=>void}){
  const [open,setOpen]=useState(false)
  const [status,setStatus]=useState<ReviewStatus>(review?.review_status||'pending')
  const [note,setNote]=useState(review?.management_note||'')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  if(!editable&&!review)return null

  const save=async()=>{
    setSaving(true);setError('')
    try{
      const {error:rpcError}=await getSupabase().rpc('site_operations_save_management_review',{
        p_entry_id:entryId,
        p_review_status:status,
        p_management_note:note||null,
        p_client_session_id:getActivitySessionId(),
        p_user_agent:window.navigator.userAgent,
      })
      if(rpcError)throw rpcError
      onSaved({review_status:status,management_note:note||null,updated_at:new Date().toISOString()})
      setOpen(false)
    }catch(err:any){setError(String(err?.message||'บันทึกไม่สำเร็จ'))}
    finally{setSaving(false)}
  }

  return <div className="siteops-management-review">
    <div className="siteops-review-summary">
      <span>Management Review</span>
      <b className={status==='confirmed'?'confirmed':status==='needs_review'?'needs-review':''}>{review?.review_status||'Pending'}</b>
      {review?.management_note&&<small>{review.management_note}</small>}
      {editable&&<button type="button" className="button" onClick={()=>setOpen(v=>!v)}>{open?'ปิด':'แก้ไข / ยืนยัน'}</button>}
    </div>
    {editable&&open&&<div className="siteops-review-form">
      <label>สถานะ<select value={status} onChange={e=>setStatus(e.target.value as ReviewStatus)}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="needs_review">Needs Review</option></select></label>
      <label className="note">รายละเอียดเพิ่มเติม<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="เพิ่มหมายเหตุโดยไม่แก้ Raw Daily Report" /></label>
      <button type="button" className="button primary" onClick={save} disabled={saving}>{saving?'Saving…':'Save Review'}</button>
      {error&&<div className="siteops-review-error" role="alert">{error}</div>}
    </div>}
    <style jsx>{`
      .siteops-management-review{margin-top:9px;padding-top:9px;border-top:1px dashed var(--line)}
      .siteops-review-summary{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.siteops-review-summary>span{font-size:8.5px;font-weight:800;text-transform:uppercase;color:var(--muted)}.siteops-review-summary>b{font-size:9px;padding:3px 6px;border-radius:999px;background:#f1f3f5;color:#5f6873}.siteops-review-summary>b.confirmed{background:#e9f6ef;color:#196645}.siteops-review-summary>b.needs-review{background:#fff3dc;color:#85570d}.siteops-review-summary>small{flex:1 1 220px;font-size:9.5px;color:var(--text)}.siteops-review-summary button{min-height:28px;padding:4px 7px;font-size:9px}
      .siteops-review-form{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:7px;align-items:end;margin-top:8px}.siteops-review-form label{display:grid;gap:3px;font-size:8.5px;font-weight:800;color:var(--muted)}.siteops-review-form select,.siteops-review-form textarea{width:100%;border:1px solid var(--line);border-radius:7px;padding:6px;font:inherit;font-size:10px;resize:vertical}.siteops-review-error{grid-column:1/-1;padding:5px 7px;background:#fff0ef;color:#95342e;border-radius:7px;font-size:9px}
      @media(max-width:760px){.siteops-review-form{grid-template-columns:1fr}.siteops-review-form button{width:100%}}
    `}</style>
  </div>
}
