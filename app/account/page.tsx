'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import PageHeader from '@/components/PageHeader'
import { changeOwnPassword } from '@/lib/changeOwnPassword'
import { getSupabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activityLog'

export default function AccountPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || success) return
    if (newPassword !== confirmPassword) {
      setMessage('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const userId = await changeOwnPassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
      // Never include either password in Activity History.
      await logActivity({
        userId,
        eventType: 'submit',
        path: '/account',
        action: 'own_password_changed',
      })
      await getSupabase().auth.signOut({ scope: 'local' })
      router.replace('/login')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถเปลี่ยนรหัสผ่านได้')
    } finally {
      setBusy(false)
    }
  }

  return <AppShell>
    <PageHeader title="บัญชีของฉัน" subtitle="จัดการรหัสผ่านสำหรับเข้าสู่ระบบ 3 Kings"/>
    <section className="panel" style={{maxWidth:600}}>
      <h2>เปลี่ยนรหัสผ่าน</h2>
      <p className="muted small" style={{lineHeight:1.7,marginTop:0}}>
        เปลี่ยนเมื่อคุณต้องการเท่านั้น ไม่มีการบังคับเปลี่ยนรหัสผ่าน หากลืมรหัสผ่านให้ติดต่อ Owner เพื่อรีเซ็ตรหัสผ่านใหม่
      </p>
      <form name="self-password-change" aria-label="เปลี่ยนรหัสผ่าน" onSubmit={submit} className="form-grid one" style={{marginTop:16}}>
        <label>รหัสผ่านปัจจุบัน
          <input type={showPasswords?'text':'password'} value={currentPassword}
            onChange={event=>setCurrentPassword(event.target.value)}
            autoComplete="current-password" maxLength={128} required disabled={busy||success}/>
        </label>
        <label>รหัสผ่านใหม่
          <input type={showPasswords?'text':'password'} value={newPassword}
            onChange={event=>setNewPassword(event.target.value)}
            autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy||success}/>
        </label>
        <label>ยืนยันรหัสผ่านใหม่
          <input type={showPasswords?'text':'password'} value={confirmPassword}
            onChange={event=>setConfirmPassword(event.target.value)}
            autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy||success}/>
        </label>
        <label className="row" style={{gap:8,justifyContent:'flex-start',fontSize:13}}>
          <input type="checkbox" checked={showPasswords} onChange={event=>setShowPasswords(event.target.checked)} disabled={busy||success}/>
          แสดงรหัสผ่าน
        </label>
        <p className="muted small" style={{margin:0}}>รหัสผ่านใหม่ต้องมี 12–128 ตัวอักษร และต้องไม่ตรงกับรหัสผ่านเดิม</p>
        {message && <div className="notice" role="alert">{message}</div>}
        {success && <div className="notice" role="status">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่</div>}
        <button type="submit" className="primary" disabled={busy||success||!currentPassword||newPassword.length<12||newPassword!==confirmPassword}>
          {busy?'กำลังตรวจสอบและเปลี่ยนรหัสผ่าน…':'ยืนยันการเปลี่ยนรหัสผ่าน'}
        </button>
      </form>
    </section>
  </AppShell>
}
