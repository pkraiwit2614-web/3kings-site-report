'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login'|'signup'>('login')
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
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() || email.trim().split('@')[0] } }
        })
        if (error) throw error
        setMessage('สมัครบัญชีเรียบร้อยแล้ว บัญชีใหม่จะยังไม่สามารถเข้าใช้งานระบบได้จนกว่า Manager จะอนุมัติใน Users & Access')
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
    <div className="segmented">
      <button type="button" className={mode==='login'?'active':''} onClick={()=>setMode('login')}>เข้าสู่ระบบ</button>
      <button type="button" className={mode==='signup'?'active':''} onClick={()=>setMode('signup')}>สมัครใช้งาน</button>
    </div>
    <form onSubmit={submit} className="form-grid one">
      {mode==='signup' && <label>ชื่อผู้ใช้งาน<input value={name} onChange={e=>setName(e.target.value)} placeholder="ชื่อผู้ใช้งาน" required /></label>}
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" required /></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></label>
      <button className="primary" disabled={loading}>{loading?'กำลังดำเนินการ…':mode==='login'?'Login':'สมัครใช้งาน'}</button>
    </form>
    {message && <div className="notice">{message}</div>}
    <p className="muted small">บัญชีใหม่ทุกบัญชีจะเริ่มต้นเป็น Foreman + Inactive และต้องได้รับการอนุมัติจาก Manager ก่อนจึงจะเข้าใช้งานระบบได้</p>
  </div></div>
}
