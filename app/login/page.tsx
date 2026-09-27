'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import BrandLogo from '@/components/BrandLogo'

const INTERNAL_LOGIN_DOMAIN = '3kings.invalid'

function toLoginEmail(value: string) {
  const login = value.trim()
  if (login.includes('@')) return login.toLowerCase()
  return `${login.toLowerCase()}@${INTERNAL_LOGIN_DOMAIN}`
}

export default function LoginPage() {
  const router = useRouter()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: toLoginEmail(loginId),
        password,
      })
      if (error) throw error
      router.replace('/')
    } catch {
      setMessage('รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง หรือติดต่อผู้ดูแลระบบ')
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-wrap"><div className="login-card">
    <div className="login-brand"><BrandLogo className="login-logo"/><div><h1>3 Kings Site Report</h1><p>Daily Site Report • Plan vs Actual • Management Dashboard</p></div></div>

    <div className="notice" style={{marginBottom:14}}>
      <b>เข้าสู่ระบบสำหรับทีมงาน</b><br/>
      ใช้รหัสผู้ใช้และรหัสผ่านที่ได้รับจากผู้ดูแลระบบได้ทันที ไม่ต้องสมัครหรือยืนยันอีเมล
    </div>

    <form onSubmit={submit} className="form-grid one">
      <label>รหัสผู้ใช้
        <input
          value={loginId}
          onChange={e=>setLoginId(e.target.value)}
          placeholder="เช่น USER01"
          autoCapitalize="characters"
          autoComplete="username"
          spellCheck={false}
          required
        />
      </label>
      <label>รหัสผ่าน
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'center'}}>
          <input
            type={showPassword?'text':'password'}
            value={password}
            onChange={e=>setPassword(e.target.value)}
            minLength={8}
            placeholder="กรอกรหัสผ่าน"
            autoComplete="current-password"
            required
          />
          <button type="button" className="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?'ซ่อน':'แสดง'}</button>
        </div>
      </label>
      <button className="primary" disabled={loading}>{loading?'กำลังเข้าสู่ระบบ…':'เข้าสู่ระบบ'}</button>
    </form>

    {message && <div className="notice" style={{marginTop:14,overflowWrap:'anywhere'}}>{message}</div>}

    <div style={{marginTop:14,padding:'11px 12px',border:'1px solid #e6e0d5',borderRadius:11,background:'#f8f6f1',color:'#5f6976',fontSize:12,lineHeight:1.65}}>
      ระบบจะจดจำการเข้าสู่ระบบบนอุปกรณ์นี้อัตโนมัติ หากลืมรหัสผ่านให้ผู้ดูแลระบบตั้งรหัสใหม่จากหน้า User &amp; Access
    </div>
  </div></div>
}
