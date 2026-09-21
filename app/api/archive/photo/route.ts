import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

function safePart(value: string, fallback = 'unknown') {
  const clean = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#%{}[\]~]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return clean.slice(0, 100) || fallback
}

function normalizeN8nPayload(value: any): any {
  if (Array.isArray(value)) return value[0] || {}
  return value || {}
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return NextResponse.json({ ok: false, error: 'Missing user token' }, { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, error: 'Invalid user token' }, { status: 401 })
  }

  let body: any
  try { body = await request.json() } catch { body = {} }

  const photoId = String(body.photo_id || '')
  const reportId = String(body.report_id || '')
  const projectId = String(body.project_id || '')
  const projectCode = String(body.project_code || '')
  const projectName = String(body.project_name || '')
  const reportDate = String(body.report_date || '')
  const phase = String(body.phase || 'other')
  const originalFileName = String(body.original_file_name || 'site-photo')
  const stagingPath = String(body.staging_path || '')
  const signedUrl = String(body.signed_url || '')

  const expectedSignedPrefix = `${SUPABASE_URL}/storage/v1/object/sign/photo-archive-staging/`
  if (!photoId || !reportId || !projectId || !projectCode || !reportDate || !stagingPath || !signedUrl.startsWith(expectedSignedPrefix)) {
    return NextResponse.json({ ok: false, error: 'Invalid archive payload' }, { status: 400 })
  }
  if (!stagingPath.startsWith(`${userData.user.id}/`)) {
    return NextResponse.json({ ok: false, error: 'Invalid staging owner' }, { status: 403 })
  }

  const markFailed = async (message: string) => {
    await supabase
      .from('report_photos')
      .update({
        archive_status: 'failed',
        archive_error: message.slice(0, 1000),
        archive_staging_path: stagingPath,
      })
      .eq('id', photoId)
      .eq('uploaded_by', userData.user.id)
  }

  const webhookUrl = process.env.N8N_PHOTO_ARCHIVE_WEBHOOK_URL
  const archiveKey = process.env.N8N_PHOTO_ARCHIVE_KEY
  if (!webhookUrl || !archiveKey) {
    await markFailed('Photo Archive ยังไม่ได้ตั้งค่า Environment Variables บน Vercel')
    return NextResponse.json({ ok: false, error: 'Photo Archive is not configured' }, { status: 503 })
  }

  const extension = (originalFileName.match(/\.[^.]+$/)?.[0] || '.jpg').toLowerCase()
  const archiveFileName = [
    safePart(reportDate),
    safePart(projectCode),
    safePart(phase),
    safePart(reportId.slice(0, 8)),
    safePart(photoId.slice(0, 8)),
    safePart(originalFileName.replace(/\.[^.]+$/, ''), 'photo'),
  ].join('_') + extension

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-archive-key': archiveKey,
      },
      body: JSON.stringify({
        photo_id: photoId,
        report_id: reportId,
        project_id: projectId,
        project_code: projectCode,
        project_name: projectName,
        report_date: reportDate,
        phase,
        original_file_name: originalFileName,
        archive_file_name: archiveFileName,
        staging_path: stagingPath,
        signed_url: signedUrl,
        uploaded_by: userData.user.id,
      }),
      cache: 'no-store',
    })

    const responseText = await response.text()
    let parsed: any = {}
    try { parsed = JSON.parse(responseText) } catch { parsed = { raw: responseText } }
    const payload = normalizeN8nPayload(parsed)

    const driveFileId = payload.driveFileId || payload.id || payload.fileId || null
    const driveUrl = payload.driveUrl || payload.webViewLink || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null)

    if (!response.ok || payload.ok === false || !driveFileId) {
      const detail = payload.error || payload.message || responseText || `n8n HTTP ${response.status}`
      await markFailed(String(detail))
      return NextResponse.json({ ok: false, error: String(detail) }, { status: 502 })
    }

    const { error: updateError } = await supabase
      .from('report_photos')
      .update({
        archive_status: 'archived',
        archive_drive_file_id: String(driveFileId),
        archive_drive_url: driveUrl ? String(driveUrl) : null,
        archive_file_name: String(payload.archiveFileName || archiveFileName),
        archive_staging_path: null,
        archived_at: new Date().toISOString(),
        archive_error: null,
      })
      .eq('id', photoId)
      .eq('uploaded_by', userData.user.id)

    if (updateError) {
      return NextResponse.json({ ok: false, error: `Drive upload สำเร็จ แต่บันทึก Archive metadata ไม่สำเร็จ: ${updateError.message}`, driveFileId, driveUrl }, { status: 500 })
    }

    const { error: removeError } = await supabase.storage.from('photo-archive-staging').remove([stagingPath])
    if (removeError) {
      return NextResponse.json({ ok: true, driveFileId, driveUrl, archiveFileName, cleanupWarning: removeError.message })
    }

    return NextResponse.json({ ok: true, driveFileId, driveUrl, archiveFileName })
  } catch (error: any) {
    const message = error?.message || 'Photo archive request failed'
    await markFailed(message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
