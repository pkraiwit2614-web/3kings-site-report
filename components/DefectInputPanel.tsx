'use client'

import {useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import useAccessRole from '@/components/useAccessRole'
import {canEditDefect} from '@/lib/accessControl'
import {getActivitySessionId} from '@/lib/activityLog'

function cleanFileName(value:string){return value.normalize('NFKC').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'defect.pdf'}
function todayBangkok(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}

export default function DefectInputPanel(){
 const {role,userId}=useAccessRole();const editable=canEditDefect(role)
 const [file,setFile]=useState<File|null>(null);const [uploading,setUploading]=useState(false);const [uploadMsg,setUploadMsg]=useState('')
 const [room,setRoom]=useState('');const [detail,setDetail]=useState('');const [status,setStatus]=useState('');const [statusGroup,setStatusGroup]=useState('');const [nextAction,setNextAction]=useState('');const [manualMsg,setManualMsg]=useState('');const [saving,setSaving]=useState(false)

 const upload=async()=>{
   if(!editable||!userId||!file)return
   if(file.type!=='application/pdf'){setUploadMsg('รองรับเฉพาะไฟล์ PDF');return}
   if(file.size>20*1024*1024){setUploadMsg('ไฟล์ต้องไม่เกิน 20 MB');return}
   setUploading(true);setUploadMsg('')
   const s=getSupabase();const path=userId+'/'+todayBangkok()+'/'+crypto.randomUUID()+'-'+cleanFileName(file.name)
   const {error:upErr}=await s.storage.from('defect-flow-staging').upload(path,file,{contentType:'application/pdf',upsert:false})
   if(upErr){setUploading(false);setUploadMsg(upErr.message);return}
   const {data:{session}}=await s.auth.getSession()
   if(!session?.access_token){
     await s.storage.from('defect-flow-staging').remove([path]).catch(()=>null)
     setUploading(false);setUploadMsg('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');return
   }
   const response=await fetch('/api/defect/validate-upload',{
     method:'POST',
     headers:{'content-type':'application/json',authorization:`Bearer ${session.access_token}`},
     body:JSON.stringify({
       storagePath:path,fileName:file.name,mimeType:file.type,fileSize:file.size,
       clientSessionId:getActivitySessionId(),userAgent:navigator.userAgent
     })
   })
   const result=await response.json().catch(()=>null) as any
   setUploading(false)
   if(!response.ok||!result?.ok){setUploadMsg(result?.message||result?.error||'ตรวจสอบไฟล์ไม่สำเร็จ');return}
   setFile(null);const input=document.getElementById('defect-pdf-upload') as HTMLInputElement|null;if(input)input.value=''
   setUploadMsg(result.message||(
     result.status==='accepted'?'รับเข้า Defect Flow แล้ว':
     result.status==='duplicate'?'ไฟล์นี้มีอยู่แล้ว จึงไม่เพิ่มซ้ำ':
     'ไฟล์นี้ไม่ใช่รายการ Defect จึงไม่นำเข้าระบบ'
   ))
 }

 const saveManual=async()=>{
   if(!editable||!room.trim()||!detail.trim())return
   setSaving(true);setManualMsg('')
   const {error}=await getSupabase().rpc('defect_manual_update_apply',{p_room_no:room.trim(),p_detail_text:detail.trim(),p_current_status:status.trim()||null,p_status_group:statusGroup.trim()||null,p_next_action:nextAction.trim()||null,p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent})
   setSaving(false)
   if(error){setManualMsg(error.message);return}
   setManualMsg('อัปเดต Defect และ Defect Flow data เรียบร้อย');setDetail('');setStatus('');setStatusGroup('');setNextAction('')
 }

 if(!editable)return null
 return <section className="panel defect-input-panel" aria-label="เพิ่มข้อมูล Defect">
   <div className="defect-input-head"><div><b>เพิ่ม / อัปเดต Defect</b><small>เฉพาะผู้ใช้ที่มีสิทธิ์แก้ Defect • ทุกการบันทึกมี Activity Log</small></div></div>
   <div className="defect-input-grid">
     <article><b>เพิ่มจากไฟล์ PDF</b><p>อัปโหลด PDF แล้วระบบจะตรวจเนื้อหาก่อนรับเข้า Defect Flow</p><input id="defect-pdf-upload" type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/><button type="button" className="button" onClick={upload} disabled={!file||uploading}>{uploading?'กำลังอัปโหลด…':'อัปโหลดไฟล์'}</button>{uploadMsg&&<small>{uploadMsg}</small>}<em>ไฟล์ที่ไม่ใช่ Defect หรือไฟล์ซ้ำจะถูกปฏิเสธและลบจาก staging • รับเฉพาะ Defect ที่มีเลขห้อง Above Condo A+B</em></article>
     <article><b>เพิ่มจากรายละเอียด</b><p>กรอกเลขห้องและรายละเอียดล่าสุด ระบบจะอัปเดตข้อมูลที่ Web App ใช้สรุป Defect Flow</p><div className="manual-grid"><label>ห้อง<input value={room} onChange={e=>setRoom(e.target.value.toUpperCase())} placeholder="เช่น A511"/></label><label>สถานะ<input value={status} onChange={e=>setStatus(e.target.value)} placeholder="เว้นว่าง = คงสถานะเดิม"/></label><label>กลุ่มสถานะ<select value={statusGroup} onChange={e=>setStatusGroup(e.target.value)}><option value="">คงเดิม</option><option value="Hotel - Incomplete">New Defect / Incomplete</option><option value="Hotel - Awaiting Check">Awaiting Acceptance</option><option value="Hotel - Checked Complete">Hotel Checked</option><option value="Non-Hotel - Pending Handover">Pending Handover</option><option value="Non-Hotel - Handover Complete">Customer Accepted</option><option value="Non-Hotel - Awaiting Sale">Awaiting Sale</option></select></label><label className="wide">รายละเอียด<textarea value={detail} onChange={e=>setDetail(e.target.value)} placeholder="รายละเอียด Defect ล่าสุด"/></label><label className="wide">ต้องทำต่อ<textarea value={nextAction} onChange={e=>setNextAction(e.target.value)} placeholder="Next Action (ถ้ามี)"/></label></div><button type="button" className="button primary" onClick={saveManual} disabled={saving||!room.trim()||!detail.trim()}>{saving?'กำลังบันทึก…':'บันทึก / อัปเดต Defect'}</button>{manualMsg&&<small>{manualMsg}</small>}</article>
   </div>
   <style jsx>{`
   .defect-input-panel{margin-bottom:12px;padding:12px}.defect-input-head{display:flex;justify-content:space-between;gap:10px}.defect-input-head small{display:block;margin-top:3px;color:var(--muted);font-size:9.5px}.defect-input-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:10px}.defect-input-grid article{border:1px solid var(--line);border-radius:10px;padding:10px;background:#fbfcfd}.defect-input-grid article>b{font-size:11px}.defect-input-grid p{margin:4px 0 8px;color:var(--muted);font-size:9.5px;line-height:1.45}.defect-input-grid input[type=file]{display:block;width:100%;margin-bottom:7px;font-size:10px}.defect-input-grid article>small{display:block;margin-top:7px;font-size:9.5px;color:var(--muted)}.defect-input-grid article>em{display:block;margin-top:7px;font-size:8.5px;line-height:1.45;color:#8a6420;font-style:normal}.manual-grid{display:grid;grid-template-columns:120px 1fr 1fr;gap:7px;margin-bottom:8px}.manual-grid label{display:grid;gap:3px;font-size:9px;font-weight:800;color:var(--muted)}.manual-grid input,.manual-grid select,.manual-grid textarea{border:1px solid var(--line);border-radius:8px;padding:7px;font:inherit;background:#fff}.manual-grid textarea{min-height:55px;resize:vertical}.manual-grid .wide{grid-column:1/-1}@media(max-width:760px){.defect-input-grid{grid-template-columns:1fr}.manual-grid{grid-template-columns:1fr}}
   `}</style>
 </section>
}