'use client'

import {useEffect,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {resolveAccessRole,type AccessRole} from '@/lib/accessControl'

export default function useActualAccessRole(){
  const [role,setRole]=useState<AccessRole|null>(null)
  const [userId,setUserId]=useState('')
  const [ready,setReady]=useState(false)

  useEffect(()=>{
    let cancelled=false
    const load=async()=>{
      try{
        const s=getSupabase()
        const {data:{user}}=await s.auth.getUser()
        if(cancelled)return
        if(!user){setRole(null);setUserId('');setReady(true);return}
        const {data:profile}=await s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
        if(cancelled)return
        setUserId(user.id)
        setRole(profile?.active?resolveAccessRole(profile.role,user.id):null)
      }finally{
        if(!cancelled)setReady(true)
      }
    }
    void load()
    return()=>{cancelled=true}
  },[])

  return {role,userId,ready}
}
