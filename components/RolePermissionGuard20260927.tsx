'use client'

import {useEffect} from 'react'
import {usePathname,useRouter} from 'next/navigation'
import {getSupabase} from '@/lib/supabase'

const WRITE_REPORT_PATHS=[
  /^\/reports\/quick\/?$/,
  /^\/reports\/new\/?$/,
  /^\/reports\/[^/]+\/edit\/?$/,
]
const OWNER_ONLY_PATHS=new Set(['/data-health','/users'])

export default function RolePermissionGuard20260927(){
  const path=usePathname()
  const router=useRouter()

  useEffect(()=>{
    let cancelled=false
    const apply=async()=>{
      const body=document.body
      body.classList.remove('role-viewer','role-report-user','role-engineer','role-manager')
      const s=getSupabase()
      const {data:{user}}=await s.auth.getUser()
      if(cancelled||!user)return
      const {data:profile}=await s.from('profiles').select('role,active').eq('user_id',user.id).maybeSingle()
      if(cancelled||!profile?.active)return
      const role=String(profile.role||'viewer')
      body.classList.add(`role-${role==='foreman'?'report-user':role}`)
      if((role==='viewer'||role==='payroll')&&WRITE_REPORT_PATHS.some(rx=>rx.test(path))){
        router.replace(role==='payroll'?'/reports/labour':'/reports')
        return
      }
      if(role!=='manager'&&OWNER_ONLY_PATHS.has(path)){
        router.replace('/')
      }
    }
    void apply()
    return()=>{cancelled=true}
  },[path,router])

  return <style jsx global>{`
    body.role-viewer .sidebar a[href='/reports/quick'],
    body.role-viewer .mobile-nav a[href='/reports/quick'],
    body.role-viewer .mobile-more-links a[href='/reports/quick'],
    body.role-viewer a[href='/reports/new'],
    body.role-viewer a[href^='/reports/'][href$='/edit'],
    body.role-viewer a[href='/data-health'],
    body.role-payroll .sidebar a[href='/reports/quick'],
    body.role-payroll .mobile-nav a[href='/reports/quick'],
    body.role-payroll .mobile-more-links a[href='/reports/quick'],
    body.role-payroll a[href='/reports/new'],
    body.role-payroll a[href^='/reports/'][href$='/edit'],
    body.role-payroll a[href='/data-health'],
    body.role-report-user a[href='/data-health'],
    body.role-engineer a[href='/data-health']{display:none!important}
  `}</style>
}
