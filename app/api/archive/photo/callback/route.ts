import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 15

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

function secretMatches(actual: string, expected: string) {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const archiveKey = process.env.N8N_PHOTO_ARCHIVE_KEY || ''
  const suppliedKey = request.headers.get('x-archive-key') || ''
  if (!archiveKey || !suppliedKey || !secretMatches(suppliedKey, archiveKey)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized callback' }, { status: 403 })
  }

  let body: any
  try { body = await request.json() } catch { body = {} }

  const photoId = String(body.photo_id || body.photoId || '')
  const status = String(body.status || '')
  const driveFileId = body.drive_file_id || body.driveFileId || null
  const driveUrl = body.drive_url || body.driveUrl || null
  const archiveFileName = body.archive_file_name || body.archiveFileName || null
  const stagingPath = body.staging_path || body.stagingPath || null
  const errorMessage = body.error || body.message || null

  if (!photoId || !['archived', 'failed'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'Invalid callback payload' }, { status: 400 })
  }
  if (status === 'archived' && !driveFileId) {
    return NextResponse.json({ ok: false, error: 'drive_file_id is required' }, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc('photo_archive_finalize', {
    p_callback_key: archiveKey,
    p_photo_id: photoId,
    p_status: status,
    p_drive_file_id: driveFileId,
    p_drive_url: driveUrl,
    p_archive_file_name: archiveFileName,
    p_error: errorMessage,
    p_staging_path: stagingPath,
  })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let cleanupWarning: string | null = null
  if (status === 'archived' && stagingPath) {
    const { error: removeError } = await supabase.storage
      .from('photo-archive-staging')
      .remove([stagingPath])

    if (removeError) {
      cleanupWarning = removeError.message
    } else {
      const { error: clearError } = await supabase.rpc('photo_archive_clear_staging', {
        p_callback_key: archiveKey,
        p_photo_id: photoId,
      })
      if (clearError) cleanupWarning = clearError.message
    }
  }

  return NextResponse.json({
    ok: true,
    result: data,
    cleanupWarning,
  })
}
