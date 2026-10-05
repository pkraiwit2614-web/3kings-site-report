'use client'

import {useEffect,useState} from 'react'
import {usePathname,useRouter} from 'next/navigation'
import {getSupabase} from '@/lib/supabase'
import {canAccessPath,defaultPathForRole,resolveAccessRole,type AccessRole} from '@/lib/accessControl'
import useRolePreview from '@/components/useRolePreview'

export default function RolePermissionGuard20260927(){
  const path=usePathname()
  const router=useRouter()
  const [actualRole,setActualRole]=useState<AccessRole|null>(null)
  const {presentationRole,ready:previewReady}=useRolePreview(actualRole)

  useEffect(()=>{
    let cancelled=false
    const apply=async()=>{
      const s=getSupabase()
      const {data:{user}}=await s.auth.getUser()
      if(cancelled)return
      if(!user){setActualRole(null);return}
      const {data:profile}=await s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
      if(cancelled)return
      if(!profile?.active){setActualRole(null);return}
      const role=resolveAccessRole(profile.role,user.id)
      if(!role){setActualRole(null);return}
      setActualRole(role)
      if(!canAccessPath(role,path))router.replace(defaultPathForRole(role))
    }
    void apply()
    return()=>{cancelled=true}
  },[path,router])

  useEffect(()=>{
    const body=document.body
    for(const cls of Array.from(body.classList)){
      if(cls.startsWith('access-role-'))body.classList.remove(cls)
    }
    if(previewReady&&presentationRole)body.classList.add(`access-role-${presentationRole}`)
    return()=>{
      if(presentationRole)body.classList.remove(`access-role-${presentationRole}`)
    }
  },[presentationRole,previewReady])

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
