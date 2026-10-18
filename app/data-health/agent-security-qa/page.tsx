'use client'
import {useState} from 'react'
import AppShell from '@/components/AppShell'
import {getSupabase} from '@/lib/supabase'
import useAccessRole from '@/components/useAccessRole'

type Result={ok?:boolean;code?:string;environment?:string;agentEnabled?:boolean;note?:string}
type Readback={status:number;result:Result}
export default function AgentSecurityQa(){
  const {actualRole,ready}=useAccessRole()
  const [busy,setBusy]=useState(false)
  const [authorized,setAuthorized]=useState<Readback|null>(null)
  const [anonymous,setAnonymous]=useState<Readback|null>(null)
  const [error,setError]=useState('')
  async function check(){
    if(actualRole!=='owner'||busy)return
    setBusy(true);setError('');setAuthorized(null);setAnonymous(null)
    try{
      const session=(await getSupabase().auth.getSession()).data.session
      if(!session?.access_token)throw new Error('No authenticated Owner session')
      const url='/api/agent/access-check'
      const auth=await fetch(url,{method:'POST',cache:'no-store',headers:{
        authorization:'Bearer '+session.access_token,'content-type':'application/json'
      },body:'{}'})
      const result=await auth.json() as Result
      setAuthorized({status:auth.status,result})
      // Control request WITHOUT any Authorization header, never a leaked JWT.
      const noAuth=await fetch(url,{method:'POST',cache:'no-store',
        headers:{'content-type':'application/json'},body:'{}'})
      setAnonymous({status:noAuth.status,result:await noAuth.json() as Result})
    }catch{setError('ไม่สามารถตรวจสิทธิ์ด้วย Session ปัจจุบันได้')}
    finally{setBusy(false)}
  }
  return <AppShell><section className="panel" style={{padding:24,maxWidth:720,margin:'20px auto'}}>
    <h1 style={{fontSize:22,marginTop:0}}>Agent — Production Security QA</h1>
    <p className="muted">ตรวจ Owner และคำขอไม่มี Token ผ่าน Server โดยไม่เปิด Agent หรืออ่านข้อมูล Drive</p>
    {!ready?<p>กำลังตรวจสิทธิ์...</p>:actualRole!=='owner'?
      <p role="alert">เฉพาะ Owner ของ 3 Kings</p>:
      <button className="primary" type="button" onClick={()=>void check()} disabled={busy}>
        {busy?'กำลังตรวจ...':'ตรวจ Owner + Anonymous (Read-only)'}
      </button>}
    {authorized&&<p role="status"><b>Owner:</b> HTTP {authorized.status} — {authorized.result.code},
      Agent Enabled: {String(authorized.result.agentEnabled)}</p>}
    {anonymous&&<p><b>Anonymous:</b> HTTP {anonymous.status} — {anonymous.result.code}</p>}
    {error&&<p role="alert">{error}</p>}
    <p className="muted" style={{fontSize:12,marginTop:16}}>
      ผล Anonymous ไม่ใช่ผล Non-Owner ที่ล็อกอินจริง ต้องแยกทดสอบด้วยบัญชี Contributor/Viewer
      โดยไม่ส่ง Token หรือรหัสผ่านในแชต
    </p>
  </section></AppShell>
}
