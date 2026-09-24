'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import BrandLogo from '@/components/BrandLogo'

type Mode = 'login'|'signup'|'forgot'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmEmailNotice, setConfirmEmailNotice] = useState(false)

  useEffect(() => {
    getSupabase().auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/')
    })
  }, [router])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setConfirmEmailNotice(false)
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
        setMessage('สมัครเรียบร้อยแล้ว กรุณาเปิดอีเมลที่ใช้สมัครและกดลิงก์ยืนยัน จากนั้นกลับมาหน้านี้เพื่อเข้าสู่ระบบ')
        setConfirmEmailNotice(true)
        setMode('login')
        setPassword('')
      }
    } catch (err: any) {
      const errorMessage = String(err?.message || '')
      const errorCode = String(err?.code || '')
      if (errorCode === 'email_not_confirmed' || /email not confirmed|email.*confirm/i.test(errorMessage)) {
        setMessage('กรุณาเปิดอีเมลที่ใช้สมัครและกดลิงก์ยืนยัน จากนั้นกลับมาหน้านี้เพื่อเข้าสู่ระบบ')
        setConfirmEmailNotice(true)
      } else {
        setMessage(errorMessage || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setLoading(false)
    }
  }

  const clearMessage = () => {
    setMessage('')
    setConfirmEmailNotice(false)
  }

  return <div className="login-wrap"><div className="login-card">
    <div className="login-brand"><BrandLogo className="login-logo"/><div><h1>3 Kings Site Report</h1><p>Daily Site Report • Plan vs Actual • Management Dashboard</p></div></div>
    {mode!=='forgot' ? <div className="segmented">
      <button type="button" className={mode==='login'?'active':''} onClick={()=>{setMode('login');clearMessage()}}>เข้าสู่ระบบ</button>
      <button type="button" className={mode==='signup'?'active':''} onClick={()=>{setMode('signup');clearMessage()}}>สมัครใช้งาน</button>
    </div> : <div className="notice"><b>ลืมรหัสผ่าน</b><br/>กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้</div>}

    {mode==='signup' && <div className="company-only"><b>สำหรับทีมงาน 3 Kings Construction Co., Ltd. เท่านั้น</b><span>ไม่เปิดให้ผู้รับเหมาใช้บัญชีนี้ส่งรายงาน เพื่อให้ข้อมูลกำลังคนและรายงานหน้างานไม่ซ้ำซ้อนกับทีมบริษัท</span></div>}

    <form onSubmit={submit} className="form-grid one">
      {mode==='signup' && <label>ชื่อผู้ใช้งาน <small className="muted">แนะนำให้ใช้ “ชื่อเล่น” เพื่อจำง่ายและดูแล้วรู้ทันทีว่าเป็นใคร</small><input value={name} onChange={e=>setName(e.target.value)} placeholder="เช่น Golf, เสือ, ไก่" required /></label>}
      <label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" required /></label>
      {mode!=='forgot' && <label>รหัสผ่าน<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} placeholder="อย่างน้อย 8 ตัวอักษร" required /></label>}
      <button className="primary" disabled={loading}>{loading?'กำลังดำเนินการ…':mode==='login'?'เข้าสู่ระบบ':mode==='signup'?'สมัครใช้งาน':'ส่งลิงก์ตั้งรหัสผ่านใหม่'}</button>
    </form>

    {mode==='login' && <button type="button" className="button" onClick={()=>{setMode('forgot');clearMessage();setPassword('')}}>ลืมรหัสผ่าน?</button>}
    {mode==='forgot' && <button type="button" className="button" onClick={()=>{setMode('login');clearMessage()}}>← กลับไปหน้าเข้าสู่ระบบ</button>}

    {message && (confirmEmailNotice ?
      <div className="notice" style={{marginTop:14, padding:'14px 16px', overflowWrap:'anywhere'}}>
        <div style={{fontSize:20, fontWeight:800, lineHeight:1.35, marginBottom:6}}>⚠️ กรุณายืนยันอีเมลก่อน</div>
        <div style={{fontSize:14, lineHeight:1.65}}>{message}</div>
      </div>
      : <div className="notice" style={{marginTop:14, overflowWrap:'anywhere'}}>{message}</div>
    )}

    <div style={{marginTop:14, padding:'11px 12px', border:'1px solid #e6e0d5', borderRadius:11, background:'#f8f6f1', color:'#5f6976', fontSize:12, lineHeight:1.65, overflowWrap:'anywhere'}}>
      ผู้สมัครใหม่ต้องยืนยันอีเมลก่อนจึงจะเข้าสู่ระบบได้ บัญชีใหม่จะได้รับสิทธิ์ใช้งานระดับโฟร์แมนโดยอัตโนมัติ หากต้องการเปลี่ยนสิทธิ์หรือปิดบัญชี กรุณาแจ้งผู้จัดการระบบ
    </div>
  </div></div>
}
