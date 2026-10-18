'use client'
import {useState} from 'react'
import AppShell from '@/components/AppShell'
import {getSupabase} from '@/lib/supabase'

type ApiResponse={ok?:boolean;code?:string;agentEnabled?:boolean;note?:string}
export default function AgentAccessQaPage(){
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState<number|null>(null)
 const [code,setCode]=useState('')
 async function check(){
   if(busy)return
   setBusy(true);setStatus(null);setCode('')
   try{
     const {data:{session}}=await getSupabase().auth.getSession()
     if(!session?.access_token){setCode('NO_AUTHENTICATED_SESSION');return}
     const res=await fetch('/api/agent/access-check',{
       method:'POST',cache:'no-store',
       headers:{'content-type':'application/json',authorization:'Bearer '+session.access_token},
       body:'{}'
     })
     const body=await res.json().catch(()=>({code:'INVALID_RESPONSE'})) as ApiResponse
     setStatus(res.status);setCode(body.code||'UNKNOWN')
   }catch{setCode('NETWORK_UNAVAILABLE')}
   finally{setBusy(false)}
 }
 return <AppShell><section className="panel" style={{padding:24,maxWidth:680,margin:'24px auto'}}>
  <h1 style={{fontSize:22,marginTop:0}}>Agent Access Test — Read-only</h1>
  <p className="muted">ทดสอบสิทธิ์จากบัญชีที่ล็อกอินอยู่จริง โดยไม่เปิด Agent ไม่เปลี่ยนข้อมูล และไม่แสดง Token</p>
  <button className="primary" type="button" disabled={busy} onClick={()=>void check()}>
    {busy?'กำลังตรวจสอบ...':'ทดสอบสิทธิ์บัญชีปัจจุบัน'}
  </button>
  {code&&<p role="status">HTTP {status===null?'-':status} — {code}</p>}
  <p className="muted" style={{fontSize:12}}>Owner ที่ได้รับอนุญาตควรได้ HTTP 200;
    บัญชีอื่นที่เข้าสู่ระบบได้จริงควรได้ 403; คำขอไม่มี Token ได้ 401
    การทดสอบนี้ไม่ใช่การยืนยัน Google OIDC หรือ Sync ครบวงจร
  </p>
 </section></AppShell>
}
