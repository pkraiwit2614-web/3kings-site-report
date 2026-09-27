'use client'

import {useEffect,useState,type ReactNode} from 'react'
import {useRouter} from 'next/navigation'
import {getSupabase} from '@/lib/supabase'

export default function OwnerOnlyGate({children}:{children:ReactNode}){
  const router=useRouter()
  const [state,setState]=useState<'checking'|'allowed'|'denied'>('checking')

  useEffect(()=>{
    let cancelled=false
    const verify=async()=>{
      try{
        const s=getSupabase()
        const {data:{session}}=await s.auth.getSession()
        const token=session?.access_token||''
        if(!token){
          if(!cancelled){setState('denied');router.replace('/login')}
          return
        }
        const response=await fetch('/api/owner-access',{headers:{authorization:`Bearer ${token}`},cache:'no-store'})
        if(cancelled)return
        if(response.ok){setState('allowed');return}
        setState('denied');router.replace('/')
      }catch{
        if(!cancelled){setState('denied');router.replace('/')}
      }
    }
    void verify()
    return()=>{cancelled=true}
  },[router])

  if(state!=='allowed')return <main style={{padding:24}}><div className="panel">{state==='checking'?'กำลังตรวจสอบสิทธิ์…':'ไม่มีสิทธิ์เข้าหน้านี้'}</div></main>
  return <>{children}</>
}
