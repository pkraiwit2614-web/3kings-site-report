'use client'

import {useEffect} from 'react'
import {usePathname,useRouter} from 'next/navigation'
import {getSupabase} from '@/lib/supabase'
import {canAccessPath,defaultPathForRole,resolveAccessRole} from '@/lib/accessControl'

export default function RolePermissionGuard20260927(){
  const path=usePathname()
  const router=useRouter()

  useEffect(()=>{
    let cancelled=false
    const apply=async()=>{
      const body=document.body
      for(const cls of Array.from(body.classList)){
        if(cls.startsWith('access-role-'))body.classList.remove(cls)
      }
      const s=getSupabase()
      const {data:{user}}=await s.auth.getUser()
      if(cancelled||!user)return
      const {data:profile}=await s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
      if(cancelled||!profile?.active)return
      const role=resolveAccessRole(profile.role,user.id)
      if(!role)return
      body.classList.add(`access-role-${role}`)
      if(!canAccessPath(role,path))router.replace(defaultPathForRole(role))
    }
    void apply()
    return()=>{cancelled=true}
  },[path,router])

  return <style jsx global>{`
    body.access-role-viewer a[href='/reports/quick'],
    body.access-role-viewer a[href='/reports/new'],
    body.access-role-viewer a[href^='/reports/'][href$='/edit'],
    body.access-role-admin a[href='/photo-mapping'],
    body.access-role-admin a[href='/data-health'],
    body.access-role-admin a[href='/users'],
    body.access-role-viewer a[href='/photo-mapping'],
    body.access-role-viewer a[href='/data-health'],
    body.access-role-viewer a[href='/users']{display:none!important}
  `}</style>
}
