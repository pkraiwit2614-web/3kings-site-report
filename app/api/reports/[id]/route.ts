import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: 'Invalid report id' }, { status: 400 })
  }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const user = userData.user
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileError || !profile?.active || profile.role !== 'manager') {
    return NextResponse.json({ ok: false, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ลบรายงานได้' }, { status: 403 })
  }

  const { data: photos, error: photoError } = await supabase
    .from('report_photos')
    .select('storage_path,archive_staging_path')
    .eq('daily_report_id', id)

  if (photoError) {
    return NextResponse.json({ ok: false, error: `อ่านข้อมูลรูปไม่สำเร็จ: ${photoError.message}` }, { status: 500 })
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('daily_reports')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (deleteError) {
    return NextResponse.json({ ok: false, error: `ลบรายงานไม่สำเร็จ: ${deleteError.message}` }, { status: 500 })
  }
  if (!deleted) {
    return NextResponse.json({ ok: false, error: 'ไม่พบรายงาน หรือไม่มีสิทธิ์ลบรายงานนี้' }, { status: 404 })
  }

  const cleanupWarnings: string[] = []
  const sitePhotoPaths = [...new Set((photos || []).map((p: any) => String(p.storage_path || '')).filter(Boolean))]
  const stagingPaths = [...new Set((photos || []).map((p: any) => String(p.archive_staging_path || '')).filter(Boolean))]

  if (sitePhotoPaths.length) {
    const { error } = await supabase.storage.from('site-photos').remove(sitePhotoPaths)
    if (error) cleanupWarnings.push(`site-photos: ${error.message}`)
  }
  if (stagingPaths.length) {
    const { error } = await supabase.storage.from('photo-archive-staging').remove(stagingPaths)
    if (error) cleanupWarnings.push(`archive staging: ${error.message}`)
  }

  return NextResponse.json({ ok: true, id, cleanup_warnings: cleanupWarnings }, { headers: { 'cache-control': 'no-store' } })
}
