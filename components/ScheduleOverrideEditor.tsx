'use client'

import {useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {getActivitySessionId} from '@/lib/activityLog'

type ReviewStatus='pending'|'confirmed'|'needs_review'
type TaskInput={
  id:string
  site_status?:string|null
  next_action?:string|null
  target_close?:string|null
  blocker?:string|null
  notes?:string|null
  web_review_status?:ReviewStatus|null
}
type UpdatePayload={
  site_status:string|null
  next_action:string|null
  target_close:string|null
  blocker:string|null
  notes:string|null
  web_review_status:ReviewStatus
}

export default function ScheduleOverrideEditor({task,editable,onSaved}:{task:TaskInput;editable:boolean;onSaved:(next:UpdatePayload)=>void}){
  const [open,setOpen]=useState(false)
  const [siteStatus,setSiteStatus]=useState(task.site_status||'')
  const [nextAction,setNextAction]=useState(task.next_action||'')
  const [targetClose,setTargetClose]=useState(task.target_close||'')
  const [blocker,setBlocker]=useState(task.blocker||'')
  const [notes,setNotes]=useState(task.notes||'')
  const [reviewStatus,setReviewStatus]=useState<ReviewStatus>(task.web_review_status||'pending')
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')

  if(!editable)return task.web_review_status?<span className="small muted">Web: {task.web_review_status}</span>:null

  const save=async()=>{
    setSaving(true);setError('')
    try{
      const {error:rpcError}=await getSupabase().rpc('schedule_save_web_override',{
        p_task_id:task.id,
        p_site_status:siteStatus||null,
        p_next_action:nextAction||null,
        p_target_close:targetClose||null,
        p_blocker:blocker||null,
        p_notes:notes||null,
        p_review_status:reviewStatus,
        p_client_session_id:getActivitySessionId(),
        p_user_agent:window.navigator.userAgent,
      })
      if(rpcError)throw rpcError
      onSaved({
        site_status:siteStatus||null,next_action:nextAction||null,target_close:targetClose||null,
        blocker:blocker||null,notes:notes||null,web_review_status:reviewStatus,
      })
      setOpen(false)
    }catch(err:any){setError(String(err?.message||'บันทึกไม่สำเร็จ'))}
    finally{setSaving(false)}
  }

  return <div className="schedule-web-editor">
    <button type="button" className="button schedule-edit-button" onClick={()=>setOpen(v=>!v)}>{open?'ปิด':'แก้ไข'}</button>
    {task.web_review_status&&<small>Web: {task.web_review_status}</small>}
    {open&&<div className="schedule-edit-card">
      <label>สถานะหน้างาน<input value={siteStatus} onChange={e=>setSiteStatus(e.target.value)} /></label>
      <label>งานถัดไป<textarea rows={2} value={nextAction} onChange={e=>setNextAction(e.target.value)} /></label>
      <label>Target Close<input type="date" value={targetClose||''} onChange={e=>setTargetClose(e.target.value)} /></label>
      <label>Blocker<textarea rows={2} value={blocker} onChange={e=>setBlocker(e.target.value)} /></label>
      <label>หมายเหตุ<textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} /></label>
      <label>การยืนยัน<select value={reviewStatus} onChange={e=>setReviewStatus(e.target.value as ReviewStatus)}>
        <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="needs_review">Needs Review</option>
      </select></label>
      <div className="schedule-edit-foot"><span>Web override • ไม่แก้ Drive raw</span><button type="button" className="button primary" disabled={saving} onClick={save}>{saving?'Saving…':'Save'}</button></div>
      {error&&<div className="schedule-edit-error" role="alert">{error}</div>}
    </div>}
    <style jsx>{`
      .schedule-web-editor{position:relative;display:grid;gap:3px;min-width:70px}.schedule-edit-button{min-height:30px;padding:5px 8px;font-size:10px}.schedule-web-editor>small{font-size:8px;color:var(--muted)}
      .schedule-edit-card{position:absolute;right:0;top:34px;z-index:40;width:320px;display:grid;gap:7px;padding:10px;border:1px solid var(--line);border-radius:11px;background:#fff;box-shadow:0 12px 34px rgba(23,42,67,.18);text-align:left}
      .schedule-edit-card label{display:grid;gap:3px;font-size:9px;font-weight:800;color:var(--muted)}.schedule-edit-card input,.schedule-edit-card textarea,.schedule-edit-card select{width:100%;border:1px solid var(--line);border-radius:7px;padding:6px 7px;background:#fff;color:var(--text);font:inherit;font-size:10.5px;resize:vertical}
      .schedule-edit-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}.schedule-edit-foot span{font-size:8.5px;color:var(--muted)}.schedule-edit-error{padding:6px;border-radius:7px;background:#fff0ef;color:#95342e;font-size:9px}
      @media(max-width:760px){.schedule-edit-card{position:fixed;left:12px;right:12px;top:auto;bottom:76px;width:auto;max-height:72vh;overflow:auto}}
    `}</style>
  </div>
}
