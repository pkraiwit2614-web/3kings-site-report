'use client'

import {useEffect,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {resolveAccessRole,type AccessRole} from '@/lib/accessControl'
import useRolePreview from '@/components/useRolePreview'

export default function useAccessRole(){
  const [role,setRole]=useState<AccessRole|null>(null)
  const [userId,setUserId]=useState('')
  const [ready,setReady]=useState(false)

  useEffect(()=>{
    let alive=true
    void (async()=>{
      const s=getSupabase()
      const {data:{user}}=await s.auth.getUser()
      if(!alive){return}
      if(!user){setReady(true);return}
      const {data:profile}=await s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
      if(!alive){return}
      setUserId(user.id)
      setRole(profile?.active?resolveAccessRole(profile.role,user.id):null)
      setReady(true)
    })()
    return()=>{alive=false}
  },[])

  const {presentationRole,ready:previewReady}=useRolePreview(role)

  // Editors must follow the same preview as navigation. Server authorization
  // continues to use the real profile/session; preview never changes either.
  return {
    role:ready&&previewReady?presentationRole:null,
    actualRole:role,
    userId,
    ready:ready&&(!role||previewReady),
  }
}
