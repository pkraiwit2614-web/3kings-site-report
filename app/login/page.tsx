'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

type Mode = 'login'|'signup'|'forgot'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    getSupabase().auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [router])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const supabase = getSupabase()
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        router.replace('/')
        return
      }

      if (mode === 'forgot') {
        const redirectTo = `${window.location.origin}/reset-password`
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
        if (error) throw error
        setMessage('ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว กรุณาตรวจอีเมลและเปิดลิงก์เพื่อกำหนดรหัสผ่านใหม่')
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() || email.trim().split('@')[0] } }
      })
      if (error) throw error
      if (data.session) {
        setMessage('สมัครเรียบร้อยแล้ว กำลังเข้าสู่ระบบ…')
        router.replace('/')
      } else {
        setMessage('สมัครเรียบร้อยแล้ว กรุณายืนยันอีเมล 1 ครั้ง จากนั้น Login ได้ทันที โดยสิทธิ์เริ่มต้นเป็น Foreman')
        setMode('login')
        setPassword('')
      }
    } catch (err: any) {
      setMessage(err.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-wrap"><div className="login-card">
    <div className="login-brand"><div className="brand-mark large">3K</div><div><h1>3 Kings Site Report</h1><p>Daily Site Report • Plan vs Actual • Management Dashboard</p></div></div>
    {mode!=='forgot' ? <div className="segmented">
      <button type="button" className={mode==='login'?'active':''} onClick={()=>{setMode('login');setMessage('')}}>เข้าสู่ระบบ</button>
      <button type="button" className={mode==='signup'?'active':''} onClick={()=>{setMode('signup');setMessage('')}}>สมัครใช้งาน</button>
    </div> : <div className="notice"><b>ลืมรหัสผ่าน</b><br/>กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้</div>}

    <form onSubmit={submit} className="form-grid one">
      {mode==='signup' && <label>ชื่อผู้ใช้งาน<input value={name} onChange={e=>setName(e.target.value)} placeholder="ชื่อผู้ใช้งาน" required /></label>}
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" required /></label>
      {mode!=='forgot' && <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></label>}
      <button className="primary" disabled={loading}>{loading?'กำลังดำเนินการ…':mode==='login'?'Login':mode==='signup'?'สมัครใช้งาน':'ส่งลิงก์ตั้งรหัสผ่านใหม่'}</button>
    </form>

    {mode==='login' && <button type="button" className="button" onClick={()=>{setMode('forgot');setMessage('');setPassword('')}}>ลืมรหัสผ่าน?</button>}
    {mode==='forgot' && <button type="button" className="button" onClick={()=>{setMode('login');setMessage('')}}>← กลับไปหน้า Login</button>}
    {message && <div className="notice">{message}</div>}
    <p className="muted small">ผู้สมัครใหม่ใช้งานได้ทันทีหลังผ่านขั้นตอนยืนยันอีเมล โดยเริ่มต้นเป็น Foreman ส่วนการเปลี่ยน Role หรือปิดบัญชีทำได้โดย Manager ใน Users & Access</p>
  </div></div>
}
