'use client'

import {useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {canEditDefects} from '@/lib/accessControl'
import {getActivitySessionId} from '@/lib/activityLog'
import useActualAccessRole from '@/components/useActualAccessRole'

type ParsedUpdate={room_no:string;detail_text:string}

function parseUpdates(value:string):ParsedUpdate[]{
  const updates:ParsedUpdate[]=[]
  const seen=new Set<string>()
  const lines=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
  if(!lines.length)throw new Error('กรุณากรอกรายละเอียดอย่างน้อย 1 รายการ')
  for(const line of lines){
    const rooms=Array.from(line.toUpperCase().matchAll(/\b[AB]\d{3}\b/g),m=>m[0])
    if(!rooms.length)throw new Error(`ไม่พบเลขห้องในบรรทัด: ${line}`)
    const detail=line
      .replace(/\b[AB]\d{3}\b/gi,' ')
      .replace(/^[\s,，:;|/–—-]+/,'')
      .replace(/\s+/g,' ')
      .trim()
    if(!detail)throw new Error(`ไม่มีรายละเอียดสำหรับ ${rooms.join(', ')}`)
    for(const room of rooms){
      if(seen.has(room))throw new Error(`มีเลขห้อง ${room} ซ้ำในรายการเดียวกัน`)
      seen.add(room)
      updates.push({room_no:room,detail_text:detail})
    }
  }
  if(updates.length>50)throw new Error('เพิ่มได้ไม่เกิน 50 ห้องต่อครั้ง')
  return updates
}

export default function DefectManualUpdatePanel(){
  const {role,ready}=useActualAccessRole()
  const [text,setText]=useState('')
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')

  if(!ready||!canEditDefects(role))return null

  const submit=async()=>{
    setMessage('')
    setError('')
    let updates:ParsedUpdate[]
    try{updates=parseUpdates(text)}
    catch(err:any){setError(err?.message||'รูปแบบข้อมูลไม่ถูกต้อง');return}

    setSaving(true)
    try{
      const {data,error:rpcError}=await getSupabase().rpc('defect_submit_manual_details',{
        p_updates:updates,
        p_client_session_id:getActivitySessionId(),
        p_user_agent:window.navigator.userAgent,
      })
      if(rpcError)throw rpcError
      setText('')
      setMessage(`บันทึกรายละเอียดแล้ว ${Number(data)||updates.length} ห้อง`)
    }catch(err:any){
      const raw=String(err?.message||'บันทึกไม่สำเร็จ')
      const friendly=raw.includes('UNKNOWN_ROOM')?'พบเลขห้องที่ไม่มีใน Defect master':
        raw.includes('NOT_AUTHORIZED')?'บัญชีนี้ไม่มีสิทธิ์แก้ไข Defect':
        raw.includes('DUPLICATE_ROOM')?'มีเลขห้องซ้ำในรายการ':
        raw
      setError(friendly)
    }finally{
      setSaving(false)
    }
  }

  return <section className="panel defect-manual-update" aria-label="เพิ่มรายละเอียด Defect">
    <div className="defect-manual-copy">
      <b>เพิ่มรายละเอียด Defect วันนี้</b>
      <small>ระบุเลขห้อง + รายละเอียด • รองรับหลายห้องในบรรทัดเดียว เช่น A417, A418 เหลืองานระบบ</small>
    </div>
    <textarea
      value={text}
      onChange={e=>setText(e.target.value)}
      placeholder={'A511 เหลืองานเก็บสีผนัง\nA417, A418 เหลืองานระบบ P-Trap อ่างล้างจาน'}
      rows={3}
      maxLength={12000}
      aria-label="เลขห้องและรายละเอียด Defect"
    />
    <div className="defect-manual-actions">
      <span className="muted">Manual layer • ไม่เขียนทับข้อมูล Hotel / Drive เดิม</span>
      <button type="button" className="button primary" onClick={submit} disabled={saving||!text.trim()}>{saving?'กำลังบันทึก…':'บันทึกรายละเอียด'}</button>
    </div>
    {message&&<div className="notice defect-manual-message" role="status">{message}</div>}
    {error&&<div className="defect-manual-error" role="alert">{error}</div>}
    <style jsx>{`
      .defect-manual-update{display:grid;gap:8px;margin:0 0 12px;padding:11px 12px}
      .defect-manual-copy{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .defect-manual-copy b{font-size:12px;color:var(--navy)}
      .defect-manual-copy small{font-size:10px;color:var(--muted)}
      textarea{width:100%;min-height:76px;resize:vertical;border:1px solid var(--line);border-radius:10px;padding:9px 10px;background:#fff;color:var(--text);font:inherit;font-size:11px;line-height:1.5;outline:none}
      textarea:focus{border-color:#7aa6c8;box-shadow:0 0 0 3px rgba(70,126,169,.10)}
      .defect-manual-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .defect-manual-actions span{font-size:9.5px}
      .defect-manual-message,.defect-manual-error{padding:7px 9px;border-radius:8px;font-size:10px}
      .defect-manual-error{background:#fff0ef;border:1px solid #edcbc8;color:#96312d}
      @media(max-width:620px){.defect-manual-actions{align-items:stretch;flex-direction:column}.defect-manual-actions button{width:100%}}
    `}</style>
  </section>
}
