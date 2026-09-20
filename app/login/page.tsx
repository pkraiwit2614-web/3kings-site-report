'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login'|'setup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('Golf')
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
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() || 'Golf' } }
        })
        if (error) throw error
        if (data.session) {
          router.replace('/')
        } else {
          setMessage('สร้างบัญชีแล้ว กรุณาเปิดอีเมลเพื่อยืนยันบัญชี จากนั้นกลับมา Login อีกครั้ง')
        }
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
      <button type="button" className={mode==='setup'?'active':''} onClick={()=>setMode('setup')}>ตั้งค่า Manager คนแรก</button>
    </div>
    <form onSubmit={submit} className="form-grid one">
      {mode==='setup' && <label>ชื่อผู้ใช้งาน<input value={name} onChange={e=>setName(e.target.value)} required /></label>}
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" required /></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required /></label>
      <button className="primary" disabled={loading}>{loading?'กำลังดำเนินการ…':mode==='login'?'Login':'Create First Manager'}</button>
    </form>
    {message && <div className="notice">{message}</div>}
    <p className="muted small">บัญชีแรกของระบบจะเป็น Manager + Active อัตโนมัติ บัญชีที่สมัครภายหลังจะถูกพักไว้จน Manager อนุมัติ</p>
  </div></div>
}
