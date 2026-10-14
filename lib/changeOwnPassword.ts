import { createClient } from '@supabase/supabase-js'
import { getSupabase, getSupabaseConnection } from '@/lib/supabase'
import {canChangeOwnPassword,resolveAccessRole} from '@/lib/accessControl'

// Account changes are voluntary. Owner resets remain in the existing admin-users function.
// Authenticate the current password in a separate, non-persistent session so an incorrect
// password can never replace or sign out the user's existing browser session.
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<string> {
  if (!currentPassword) throw new Error('กรุณากรอกรหัสผ่านปัจจุบัน')
  if (newPassword.length < 12 || newPassword.length > 128) {
    throw new Error('รหัสผ่านใหม่ต้องมี 12–128 ตัวอักษร')
  }
  if (currentPassword === newPassword) {
    throw new Error('กรุณากำหนดรหัสผ่านใหม่ให้ต่างจากรหัสผ่านปัจจุบัน')
  }

  const current = getSupabase()
  const { data: { user }, error: userError } = await current.auth.getUser()
  if (userError || !user?.id || !user.email) {
    throw new Error('ไม่สามารถยืนยันบัญชีผู้ใช้งานได้ กรุณาเข้าสู่ระบบใหม่')
  }

  const { data: profile, error: profileError } = await current
    .from('profiles').select('active,role').eq('user_id', user.id).maybeSingle()
  if (profileError || !profile?.active) {
    throw new Error('บัญชีนี้ไม่ได้รับอนุญาตให้ใช้งาน')
  }

  // Always evaluate the caller's canonical role, not metadata or UI preview role.
  if (!canChangeOwnPassword(resolveAccessRole(profile.role, user.id))) {
    throw new Error('บัญชีประเภท Viewer ไม่ได้รับสิทธิ์เปลี่ยนรหัสผ่าน กรุณาติดต่อ Owner')
  }

  // Supabase-js is currently pinned to v2.95; using a separate sign-in checks the
  // current password without changing the main session or relying on email OTPs.
  const connection = getSupabaseConnection()
  const verifier = createClient(connection.url, connection.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  try {
    const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (verifyError || !verified.user || verified.user.id !== user.id) {
      throw new Error('รหัสผ่านปัจจุบันไม่ถูกต้อง')
    }

    // Change only the identity that just supplied the correct current password.
    const { error: updateError } = await verifier.auth.updateUser({ password: newPassword })
    if (updateError) {
      // Some projects require email OTP reauthentication, which internal .invalid
      // addresses cannot receive. Never silently fall back to an admin bypass.
      throw new Error('ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาติดต่อ Owner เพื่อรีเซ็ตรหัสผ่าน')
    }
    return user.id
  } finally {
    // Local scope prevents this temporary check from revoking unrelated sessions.
    await verifier.auth.signOut({ scope: 'local' }).catch(() => {})
  }
}
