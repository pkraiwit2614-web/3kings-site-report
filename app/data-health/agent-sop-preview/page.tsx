'use client'

import {useState} from 'react'
import AppShell from '@/components/AppShell'
import {getSupabase} from '@/lib/supabase'
import useAccessRole from '@/components/useAccessRole'

type GateResult={
  gate?:{ok:boolean;code:string;command?:string;sop?:{fileId:string;modifiedAt:string;sha256:string}}
  inspection?:{status:string;note:string;checks?:{name:string;status:string}[]}|null
  error?:string
}

export default function AgentSopPreviewPage(){
  const {actualRole,ready}=useAccessRole()
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [result,setResult]=useState<GateResult|null>(null)
  const [httpStatus,setHttpStatus]=useState<number|null>(null)

  async function run(mode:'preflight'|'inspect'){
    if(actualRole!=='owner'||busy)return
    setBusy(true)
    setMessage('')
    setResult(null)
    setHttpStatus(null)
    try{
      const {data:{session},error}=await getSupabase().auth.getSession()
      if(error||!session?.access_token){setMessage('กรุณาเข้าสู่ระบบบัญชี Owner ใน Preview ก่อน');return}
      const response=await fetch('/api/agent/read-only',{
        method:'POST',cache:'no-store',
        headers:{'content-type':'application/json',authorization:'Bearer '+session.access_token},
        body:JSON.stringify({commandId:13,mode})
      })
      const body=await response.json().catch(()=>({error:'INVALID_SERVER_RESPONSE'})) as GateResult
      setHttpStatus(response.status)
      setResult(body)
      if(!response.ok||!body.gate?.ok)setMessage('ไม่ผ่าน: '+(body.gate?.code||body.error||'UNKNOWN_ERROR'))
      else setMessage(mode==='preflight'?'ผ่าน: อ่าน SOP จาก Drive และตรวจ Revision สำเร็จ':'ผ่าน SOP Gate; โปรดดูข้อจำกัดของการตรวจ Sync ด้านล่าง')
    }catch{
      setMessage('ไม่สามารถติดต่อ Preview Agent API ได้')
    }finally{setBusy(false)}
  }

  return <AppShell>
    <div style={{maxWidth:760,margin:'0 auto',padding:'16px 0'}}>
      <section className="panel" style={{padding:24}}>
        <h1 style={{marginTop:0,fontSize:22}}>Agent SOP Gate — Preview QA</h1>
        <p className="muted">ทดสอบจาก Owner บน Preview เท่านั้น: อ่าน SOP 13 จาก Google Drive ด้วย Vercel OIDC ไม่เปลี่ยน Defect, Sync, Calendar, ฐานข้อมูล หรือ Production</p>
        {!ready?<p role="status">กำลังตรวจสิทธิ์...</p>:actualRole!=='owner'?
          <p role="alert">หน้านี้อนุญาตเฉพาะ Owner</p>:
          <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'18px 0'}}>
            <button type="button" className="primary" disabled={busy} onClick={()=>void run('preflight')}>
              {busy?'กำลังตรวจสอบ...':'ทดสอบอ่าน SOP 13'}
            </button>
            <button type="button" className="button" disabled={busy} onClick={()=>void run('inspect')}>
              ตรวจ Sync เบื้องต้น (Read-only)
            </button>
          </div>}
        {message&&<div className="notice" role="status" style={{overflowWrap:'anywhere'}}>{message}</div>}
        {httpStatus!==null&&<p className="muted">HTTP status: {httpStatus}</p>}
        {result?.gate&&<div style={{paddingTop:12,overflowWrap:'anywhere'}}>
          <p><b>Gate:</b> {result.gate.ok?'PASS':'BLOCK'} — {result.gate.code}</p>
          {result.gate.sop&&<>
            <p><b>SOP file ID:</b> {result.gate.sop.fileId}</p>
            <p><b>Last modified:</b> {result.gate.sop.modifiedAt}</p>
            <p><b>SHA-256 prefix:</b> {result.gate.sop.sha256.slice(0,12)}</p>
          </>}
        </div>}
        {result?.inspection&&<div style={{marginTop:12}}>
          <p><b>Inspector:</b> {result.inspection.status}</p>
          <p>{result.inspection.note}</p>
          {(result.inspection.checks||[]).map((item,i)=><p key={i}>
            {item.name}: {item.status}
          </p>)}
        </div>}
        <p className="muted" style={{fontSize:12,marginTop:20}}>
          PASS ของ SOP Gate หมายถึงอ่าน SOP ได้ในคำขอนี้เท่านั้น ไม่ใช่การยืนยันว่าซิงก์ทั้งระบบสำเร็จ
          ไม่มีการแสดงหรือบันทึก OAuth/Service Account Token ในหน้านี้
        </p>
      </section>
    </div>
  </AppShell>
}
