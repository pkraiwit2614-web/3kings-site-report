'use client'

import {useEffect,useState,type ReactNode} from 'react'
import {usePathname,useRouter} from 'next/navigation'
import {getSupabase} from '@/lib/supabase'
import {canAccessPath,defaultPathForRole,type AccessRole} from '@/lib/accessControl'
import useRolePreview from '@/components/useRolePreview'

export default function AccessBoundary({children}:{children:ReactNode}){
  const path=usePathname()
  const router=useRouter()
  const [allowedPath,setAllowedPath]=useState('')
  const [actualRole,setActualRole]=useState<AccessRole|null>(null)
  const [failed,setFailed]=useState(false)
  const [attempt,setAttempt]=useState(0)
  const {presentationRole,ready:previewReady}=useRolePreview(actualRole)

  useEffect(()=>{
    if(path==='/login'){
      setAllowedPath(path)
      setActualRole(null)
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
        const data=await response.json().catch(()=>null) as {allowed?:boolean;redirect?:string|null;role?:AccessRole}|null
        if(cancelled)return
        if(response.ok&&data?.allowed&&data.role){
          setActualRole(data.role)
          setAllowedPath(path)
          return
        }
        if(response.status===401){
          setActualRole(null)
          router.replace('/login')
          return
        }
        router.replace(data?.redirect||'/login')
      }catch{
        if(!cancelled)setFailed(true)
      }
    }
    void verify()
    return()=>{cancelled=true}
  },[path,router,attempt])

  useEffect(()=>{
    if(path==='/login'||allowedPath!==path||!previewReady||!presentationRole)return
    if(canAccessPath(presentationRole,path))return
    setAllowedPath('')
    router.replace(defaultPathForRole(presentationRole))
  },[allowedPath,path,presentationRole,previewReady,router])

  if(path==='/login'&&allowedPath===path)return <>{children}</>

  const previewPathAllowed=previewReady&&presentationRole&&canAccessPath(presentationRole,path)
  if(allowedPath===path&&previewPathAllowed)return <>{children}</>

  return <main style={{padding:24}}>
    <div className="panel" role={failed?'alert':undefined}>
      {failed?<><p>ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่</p><button type="button" className="button" onClick={()=>setAttempt(v=>v+1)}>ลองใหม่</button></>:'กำลังตรวจสอบสิทธิ์…'}
    </div>
  </main>
}
