'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function ResetPasswordPage(){
  const router=useRouter()
  const[password,setPassword]=useState('')
  const[confirm,setConfirm]=useState('')
  const[ready,setReady]=useState(false)
  const[loading,setLoading]=useState(false)
  const[message,setMessage]=useState('กำลังตรวจสอบลิงก์รีเซ็ตรหัสผ่าน…')

  useEffect(()=>{
    const supabase=getSupabase()
    const check=async()=>{
      const {data}=await supabase.auth.getSession()
      if(data.session){setReady(true);setMessage('')}
    }
    check()
    const {data:listener}=supabase.auth.onAuthStateChange((event,session)=>{
      if((event==='PASSWORD_RECOVERY'||event==='SIGNED_IN')&&session){setReady(true);setMessage('')}
    })
    const timer=setTimeout(()=>{
      setReady(current=>{
        if(!current) setMessage('ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณากลับไปหน้า Login และขอลิงก์ใหม่')
        return current
      })
    },2500)
    return()=>{clearTimeout(timer);listener.subscription.unsubscribe()}
  },[])

  const submit=async(e:FormEvent)=>{
    e.preventDefault()
    if(password.length<8){setMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');return}
    if(password!==confirm){setMessage('รหัสผ่านทั้งสองช่องไม่ตรงกัน');return}
    setLoading(true);setMessage('')
    const supabase=getSupabase()
    const {error}=await supabase.auth.updateUser({password})
    if(error){setMessage(error.message);setLoading(false);return}
    await supabase.auth.signOut()
    setMessage('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กำลังกลับไปหน้า Login…')
    setTimeout(()=>router.replace('/login'),1200)
  }

  return <div className="login-wrap"><div className="login-card">
    <div className="login-brand"><div className="brand-mark large">3K</div><div><h1>ตั้งรหัสผ่านใหม่</h1><p>3 Kings Site Report</p></div></div>
    {ready?<form onSubmit={submit} className="form-grid one">
      <label>รหัสผ่านใหม่<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/></label>
      <label>ยืนยันรหัสผ่านใหม่<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} required/></label>
      <button className="primary" disabled={loading}>{loading?'กำลังบันทึก…':'บันทึกรหัสผ่านใหม่'}</button>
    </form>:<div className="notice">{message}</div>}
    {ready&&message&&<div className="notice">{message}</div>}
    <button type="button" className="link-button" onClick={()=>router.replace('/login')}>← กลับไปหน้า Login</button>
  </div></div>
}
