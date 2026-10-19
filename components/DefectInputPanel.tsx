'use client'

import {useEffect,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import useAccessRole from '@/components/useAccessRole'
import {canEditDefect} from '@/lib/accessControl'
import {getActivitySessionId} from '@/lib/activityLog'
import {hotelRoomLabel,hotelRoomMembers,normalizeHotelRoom} from '@/lib/hotelRoomGroups'

function cleanFileName(value:string){return value.normalize('NFKC').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'defect.pdf'}
function todayBangkok(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}

// Scoped reconciliation based on approved RSE update 19/10/2026 and the Excel Master.
// These values are proposed only after the editor explicitly clicks the B511 action.
const B511_RECONCILIATION={
 room:'B511',
 status:'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ',
 group:'Hotel - Awaiting Check',
 nextAction:'นัด/ตาม Hotel Engineer ตรวจ; รวบรวมรูป After',
 detail:'RSE แจ้ง 19/10/26 Defect เสร็จหมดแล้ว',
} as const

export default function DefectInputPanel({manualOnly=false}:{manualOnly?:boolean}){
 const {role,userId}=useAccessRole();const editable=canEditDefect(role)
 const [file,setFile]=useState<File|null>(null);const [uploading,setUploading]=useState(false);const [uploadMsg,setUploadMsg]=useState('')
 const [room,setRoom]=useState('');const [detail,setDetail]=useState('');const [status,setStatus]=useState('');const [statusGroup,setStatusGroup]=useState('');const [nextAction,setNextAction]=useState('');const [manualMsg,setManualMsg]=useState('');const [saving,setSaving]=useState(false)
 const [writebackRoom,setWritebackRoom]=useState('');const [writebackState,setWritebackState]=useState('')
 // The room's original server revision is captured when selected, not when Save is clicked.
 const [loadedRoom,setLoadedRoom]=useState<{room:string;stamp:string;currentStatus:string;statusGroup:string}|null>(null)
 const [revisionError,setRevisionError]=useState('')
 const loadRoomRevision=async(roomNo:string)=>{
   const normalized=normalizeHotelRoom(roomNo)
   if(!/^[AB][0-9]{3}$/.test(normalized)){setLoadedRoom(null);return}
   const {data,error}=await getSupabase().from('condo_room_status')
     .select('room_no,source_modified_at,current_status,status_group').eq('room_no',normalized).maybeSingle()
   if(error||!data?.source_modified_at){setLoadedRoom(null);setRevisionError(error?.message||'ไม่พบ Revision ของห้อง');return}
   setLoadedRoom({room:normalized,stamp:data.source_modified_at,currentStatus:data.current_status||'',statusGroup:data.status_group||''})
   setRevisionError('')
 }
 useEffect(()=>{
   const normalized=normalizeHotelRoom(room)
   setLoadedRoom(null)
   if(!/^[AB][0-9]{3}$/.test(normalized))return
   let active=true
   void getSupabase().from('condo_room_status')
     .select('room_no,source_modified_at,current_status,status_group').eq('room_no',normalized).maybeSingle()
     .then(({data,error})=>{
       if(!active)return
       if(error||!data?.source_modified_at){setRevisionError(error?.message||'ไม่พบ Revision ของห้อง');return}
       setLoadedRoom({room:normalized,stamp:data.source_modified_at,currentStatus:data.current_status||'',statusGroup:data.status_group||''})
       setRevisionError('')
     })
   return()=>{active=false}
 },[room])

 useEffect(()=>{
   if(!editable||!userId)return
   let alive=true
   void (async()=>{
     const s=getSupabase()
     const {data}=await s.from('defect_file_uploads')
       .select('id,storage_path')
       .eq('created_by',userId)
       .eq('validation_status','rejected')
       .limit(20)
     if(!alive||!data?.length)return
     for(const row of data){
       const {error}=await s.storage.from('defect-flow-staging').remove([String(row.storage_path)])
       if(!error)await s.rpc('defect_forget_rejected_upload',{p_id:row.id})
     }
   })()
   return()=>{alive=false}
 },[editable,userId])

 useEffect(()=>{
   if(!writebackRoom||!editable)return
   let alive=true
   const refresh=async()=>{
     const {data,error}=await getSupabase().rpc('defect_writeback_status',{p_room_no:writebackRoom})
     if(!alive)return
     if(error){setWritebackState('ไม่สามารถตรวจสถานะ Excel Sync: '+error.message);return}
     const state=(data as {state?:string;last_error?:string})?.state
     if(state==='synced')setWritebackState('ยืนยันแล้ว: เขียนและอ่านตรวจกลับจาก Excel ทั้งสองไฟล์สำเร็จ')
     else if(state==='pending')setWritebackState('บันทึกบนเว็บแล้ว • รออัปเดต Excel ต้นฉบับทั้งสองไฟล์'+((data as {last_error?:string})?.last_error?' (พบข้อผิดพลาดระหว่าง Sync กำลังรอลองใหม่)':''))
     else setWritebackState('บันทึกบนเว็บแล้ว • ยังไม่มีหลักฐานยืนยันว่า Excel ทั้งสองไฟล์อัปเดตสำเร็จ')
   }
   void refresh()
   const poll=window.setInterval(()=>{void refresh()},15000)
   return()=>{alive=false;window.clearInterval(poll)}
 },[writebackRoom,editable])

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

 const applyB511Reconciliation=()=>{
   if(!editable||normalizeHotelRoom(room)!==B511_RECONCILIATION.room||loadedRoom?.room!==B511_RECONCILIATION.room)return
   setStatus(B511_RECONCILIATION.status)
   setStatusGroup(B511_RECONCILIATION.group)
   setNextAction(B511_RECONCILIATION.nextAction)
   if(!detail.trim())setDetail(B511_RECONCILIATION.detail)
   setManualMsg('เตรียมสถานะและ Next Action ของ B511 ตามรายงาน RSE 19/10/2026 แล้ว • ตรวจค่าก่อนกดบันทึก')
 }

 const saveManual=async()=>{
   if(!editable||!room.trim()||!detail.trim())return
   const target=normalizeHotelRoom(room)
   if(!loadedRoom||loadedRoom.room!==target){setManualMsg('กรุณาโหลดสถานะห้องล่าสุดก่อนบันทึก');return}
   setSaving(true);setManualMsg('')
   let proposedGroup=statusGroup.trim()
   let proposedStatus=status.trim()
   const done=/defect\s*เสร็จแล้ว|แก้ไข\s*defect\s*เสร็จแล้ว/i.test(detail+' '+status)&&!/ยังไม่เสร็จ|ไม่เสร็จ/.test(detail+' '+status)
   if(done&&!proposedGroup){
     const {data:existing,error:lookupError}=await getSupabase().from('condo_room_status').select('hotel_participation,customer_status,status_group').eq('room_no',target).maybeSingle()
     if(lookupError||!existing){setSaving(false);setManualMsg(lookupError?.message||'ไม่พบเลขห้อง');return}
     if(['Hotel - Checked Complete','Non-Hotel - Handover Complete'].includes(existing.status_group)){setSaving(false);setManualMsg('ห้องตรวจรับแล้ว กรุณาตรวจสอบก่อนเปลี่ยนสถานะ');return}
     const isHotel=existing.hotel_participation==='ร่วมโรงแรม'
     if(!isHotel&&existing.customer_status!=='มีลูกค้า'){setSaving(false);setManualMsg('โปรดเลือกกลุ่มสถานะเองสำหรับห้องที่ยังไม่มีลูกค้า');return}
     proposedGroup=isHotel?'Hotel - Awaiting Check':'Non-Hotel - Pending Handover'
     const nextLabel=isHotel?'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ':'Defect เสร็จแล้ว / รอลูกค้าตรวจรับ'
     if(!window.confirm('ห้อง '+hotelRoomLabel(target)+'\nเสนอเปลี่ยนกลุ่มสถานะเป็น '+nextLabel+'\nยังไม่ถือว่าตรวจรับแล้ว\nกด OK เพื่อยืนยันก่อนบันทึก')){setSaving(false);setManualMsg('ยกเลิก ไม่ได้บันทึกข้อมูล');return}
     if(!proposedStatus)proposedStatus=nextLabel
   }
   // A completion report on B511 must not be saved as "still incomplete".
   // Require an explicit editor selection, leaving all other rooms unchanged.
   if(target===B511_RECONCILIATION.room&&/RSE.*19\/10\/26.*Defect.*เสร็จหมดแล้ว/i.test(detail)
     &&(proposedStatus!==B511_RECONCILIATION.status
       ||proposedGroup!==B511_RECONCILIATION.group
       ||nextAction.trim()!==B511_RECONCILIATION.nextAction)){
     setSaving(false)
     setManualMsg('B511: รายงาน RSE ยืนยันงานเสร็จ แต่ช่องสถานะ/ต้องทำต่อยังไม่ตรง กรุณากด “ใช้ค่าที่ตรวจสอบแล้วสำหรับ B511” และตรวจข้อมูลก่อนบันทึก')
     return
   }
   const combineMembers=hotelRoomMembers(target)
   if(combineMembers.length>1&&!window.confirm('ยืนยันอัปเดตข้อมูล Defect และสถานะให้ห้อง Combine ทั้งชุด: '+combineMembers.join(' + ')+'\\nยังคงแยก Room ID และประวัติแต่ละห้อง')){setSaving(false);setManualMsg('ยกเลิก ไม่ได้บันทึกข้อมูล');return}
   const {error}=await getSupabase().rpc('defect_manual_update_apply_checked',{p_room_no:target,p_detail_text:detail.trim(),p_current_status:proposedStatus||null,p_status_group:proposedGroup||null,p_next_action:nextAction.trim()||null,p_client_session_id:getActivitySessionId(),p_user_agent:navigator.userAgent,p_expected_source_modified_at:loadedRoom.stamp})
   if(error){setSaving(false);setManualMsg(error.message.includes('DEFECT_REVISION_CONFLICT')?'ห้องนี้ถูกแก้ไขจากผู้ใช้อื่นแล้ว กรุณาตรวจสถานะล่าสุดและกดโหลดข้อมูลล่าสุดก่อนลองใหม่':error.message);return}
   // The RPC returning successfully alone is not proof that both saved fields match.
   // This readback is intentionally limited to the approved B511 reconciliation.
   if(target===B511_RECONCILIATION.room){
     const {data:verified,error:verifyError}=await getSupabase().from('condo_room_status')
       .select('current_status,status_group,next_action').eq('room_no',target).maybeSingle()
     if(verifyError||!verified||verified.current_status!==proposedStatus||
       verified.status_group!==proposedGroup||verified.next_action!==(nextAction.trim()||loadedRoom.currentStatus)){
       setSaving(false)
       setManualMsg('บันทึกถูกส่งแล้ว แต่ยังไม่ผ่านการอ่านยืนยัน Current Status / Status Group / Next Action ของ B511: '+(verifyError?.message||'ข้อมูลไม่ตรงกับค่าที่ส่ง')+' • โหลดข้อมูลล่าสุดก่อนลองใหม่')
       void loadRoomRevision(target)
       return
     }
   }
   setSaving(false)
   setLoadedRoom(null)
   void loadRoomRevision(target)
   setManualMsg('บันทึก Defect และ Defect Flow ในฐานข้อมูลแล้ว'+(combineMembers.length>1?' • อัปเดต Combine '+combineMembers.join(' + '):''));setWritebackState('กำลังตรวจสถานะเขียนกลับ Excel ทั้งสองไฟล์');setWritebackRoom(target);setDetail('');setStatus('');setStatusGroup('');setNextAction('')
 }

 if(!editable)return null
 return <section className="panel defect-input-panel" aria-label="เพิ่มข้อมูล Defect">
   <div className="defect-input-head"><div><b>เพิ่ม / อัปเดต Defect</b><small>เฉพาะผู้ใช้ที่มีสิทธิ์แก้ Defect • ทุกการบันทึกมี Activity Log</small></div></div>
   <div className={"defect-input-grid "+(manualOnly?"manual-only":"")}>
     {!manualOnly&&<article><b>เพิ่มจากไฟล์ PDF</b><p>อัปโหลด PDF แล้วระบบจะตรวจเนื้อหาก่อนรับเข้า Defect Flow</p><input id="defect-pdf-upload" type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/><button type="button" className="button" onClick={upload} disabled={!file||uploading}>{uploading?'กำลังอัปโหลด…':'อัปโหลดไฟล์'}</button>{uploadMsg&&<small>{uploadMsg}</small>}<em>ไฟล์ที่ไม่ใช่ Defect หรือไฟล์ซ้ำจะถูกปฏิเสธและลบจาก staging • รับเฉพาะ Defect ที่มีเลขห้อง Above Condo A+B</em></article>}
     <article><b>เพิ่มจากรายละเอียด</b><p>สถานะ = รายละเอียดความคืบหน้า • กลุ่มสถานะ = หมวดที่ Defect Flow ใช้นับห้อง • หากแจ้งว่า Defect เสร็จแล้ว ระบบจะให้ยืนยันการเปลี่ยนเป็นรอตรวจรับก่อนบันทึก</p><div className="manual-grid"><label>ห้อง<input value={room} onChange={e=>setRoom(e.target.value.toUpperCase())} placeholder="เช่น B101 หรือ Good01"/></label><label>สถานะ<input value={status} onChange={e=>setStatus(e.target.value)} placeholder="เว้นว่าง = คงสถานะเดิม"/></label><label>กลุ่มสถานะ<select value={statusGroup} onChange={e=>setStatusGroup(e.target.value)}><option value="">คงเดิม</option><option value="Hotel - Incomplete">เพิ่งได้รับแจ้ง / กำลังดำเนินการ</option><option value="Hotel - Awaiting Check">รอตรวจรับ</option><option value="Hotel - Checked Complete">ตรวจรับเรียบร้อย</option><option value="Non-Hotel - Pending Handover">รอส่งมอบ</option><option value="Non-Hotel - Handover Complete">ลูกค้าตรวจรับแล้ว</option><option value="Non-Hotel - Awaiting Sale">รอขาย</option></select></label><label className="wide">รายละเอียด<textarea value={detail} onChange={e=>setDetail(e.target.value)} placeholder="รายละเอียด Defect ล่าสุด"/></label><label className="wide">ต้องทำต่อ<textarea value={nextAction} onChange={e=>setNextAction(e.target.value)} placeholder="Next Action (ถ้ามี)"/></label></div>{room.trim()&&<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:8}}>
    <small>{loadedRoom?.room===normalizeHotelRoom(room)?'ข้อมูลขณะเปิดห้อง: '+(loadedRoom.currentStatus||'ไม่ระบุ')+' / '+(loadedRoom.statusGroup||'ไม่ระบุกลุ่ม'):revisionError||'กำลังตรวจ Revision ห้อง…'}</small>
    <button type="button" className="button" onClick={()=>{void loadRoomRevision(room)}} disabled={saving}>โหลดสถานะห้องล่าสุด</button>
    {loadedRoom?.room===B511_RECONCILIATION.room&&<button type="button" className="button" onClick={applyB511Reconciliation} disabled={saving}>ใช้ค่าที่ตรวจสอบแล้วสำหรับ B511</button>}
   </div>}
   <button type="button" className="button primary" onClick={saveManual} disabled={saving||!room.trim()||!detail.trim()||loadedRoom?.room!==normalizeHotelRoom(room)}>{saving?'กำลังบันทึก…':'บันทึก / ยืนยันการอัปเดต Defect'}</button>{manualMsg&&<small>{manualMsg}</small>}{writebackState&&<small role="status" aria-live="polite">{writebackRoom}: {writebackState}</small>}</article>
   </div>
   <style jsx>{`
   .defect-input-panel{margin-bottom:12px;padding:12px}.defect-input-head{display:flex;justify-content:space-between;gap:10px}.defect-input-head small{display:block;margin-top:3px;color:var(--muted);font-size:9.5px}.defect-input-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:10px}.defect-input-grid.manual-only{grid-template-columns:1fr}.defect-input-grid article{border:1px solid var(--line);border-radius:10px;padding:10px;background:#fbfcfd}.defect-input-grid article>b{font-size:11px}.defect-input-grid p{margin:4px 0 8px;color:var(--muted);font-size:9.5px;line-height:1.45}.defect-input-grid input[type=file]{display:block;width:100%;margin-bottom:7px;font-size:10px}.defect-input-grid article>small{display:block;margin-top:7px;font-size:9.5px;color:var(--muted)}.defect-input-grid article>em{display:block;margin-top:7px;font-size:8.5px;line-height:1.45;color:#8a6420;font-style:normal}.manual-grid{display:grid;grid-template-columns:120px 1fr 1fr;gap:7px;margin-bottom:8px}.manual-grid label{display:grid;gap:3px;font-size:9px;font-weight:800;color:var(--muted)}.manual-grid input,.manual-grid select,.manual-grid textarea{border:1px solid var(--line);border-radius:8px;padding:7px;font:inherit;background:#fff}.manual-grid textarea{min-height:55px;resize:vertical}.manual-grid .wide{grid-column:1/-1}@media(max-width:760px){.defect-input-grid{grid-template-columns:1fr}.manual-grid{grid-template-columns:1fr}}
   `}</style>
 </section>
}