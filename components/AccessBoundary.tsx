'use client'

import {useEffect,useState,type ReactNode} from 'react'
import {usePathname,useRouter} from 'next/navigation'
import {getSupabase} from '@/lib/supabase'

export default function AccessBoundary({children}:{children:ReactNode}){
  const path=usePathname()
  const router=useRouter()
  const [allowedPath,setAllowedPath]=useState('')
  const [failed,setFailed]=useState(false)
  const [attempt,setAttempt]=useState(0)

  useEffect(()=>{
    if(path==='/login'){
      setAllowedPath(path)
      setFailed(false)
      return
    }

    let cancelled=false
    const verify=async()=>{
      setAllowedPath('')
      setFailed(false)
      try{
        const s=getSupabase()
        const {data:{session}}=await s.auth.getSession()
        const token=session?.access_token||''
        if(!token){
          if(!cancelled)router.replace('/login')
          return
        }
        const response=await fetch(`/api/access-control?path=${encodeURIComponent(path)}`,{
          headers:{authorization:`Bearer ${token}`},
          cache:'no-store',
        })
        const data=await response.json().catch(()=>null) as {allowed?:boolean;redirect?:string}|null
        if(cancelled)return
        if(response.ok&&data?.allowed){
          setAllowedPath(path)
          return
        }
        if(response.status===401){
          router.replace('/login')
          return
        }
        router.replace(data?.redirect||'/')
      }catch{
        if(!cancelled)setFailed(true)
      }
    }
    void verify()
    return()=>{cancelled=true}
  },[path,router,attempt])

  if(path==='/login'&&allowedPath===path)return <>{children}</>
  if(allowedPath===path)return <>{children}</>

  return <main style={{padding:24}}>
    <div className="panel" role={failed?'alert':undefined}>
      {failed?<><p>ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่</p><button type="button" className="button" onClick={()=>setAttempt(v=>v+1)}>ลองใหม่</button></>:'กำลังตรวจสอบสิทธิ์…'}
    </div>
  </main>
}
