import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

function text(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export async function GET() {
  return NextResponse.json({ ok: true, service: '3 Kings Drive Photo Index V3.5', route: '/api/sync/drive-photos' })
}

export async function POST(request: NextRequest) {
  try {
    const syncKey = request.headers.get('x-sync-key') || ''
    if (!syncKey) return NextResponse.json({ ok: false, error: 'missing_sync_key' }, { status: 401 })

    const projectCode = text(request.nextUrl.searchParams.get('project'))
    if (!projectCode) return NextResponse.json({ ok: false, error: 'missing_project' }, { status: 400 })

    let body: any
    try { body = await request.json() } catch { body = null }
    const rows = Array.isArray(body) ? body : body?.rows
    const sourceFolder = text(Array.isArray(body) ? request.nextUrl.searchParams.get('sourceFolder') : body?.sourceFolder) || `${projectCode}-Picture-Progress`

    if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ ok: false, error: 'empty_rows' }, { status: 400 })
    if (rows.length > 1000) return NextResponse.json({ ok: false, error: 'too_many_rows' }, { status: 413 })

    const cleaned = rows.map((row: any) => ({
      drive_file_id: text(row?.drive_file_id),
      drive_folder_id: text(row?.drive_folder_id) || null,
      drive_folder_name: text(row?.drive_folder_name) || null,
      file_name: text(row?.file_name),
      mime_type: text(row?.mime_type) || null,
      drive_url: text(row?.drive_url) || null,
      thumbnail_url: text(row?.thumbnail_url) || null,
      photo_date: text(row?.photo_date),
      phase: ['before','during','after','other'].includes(text(row?.phase)) ? text(row?.phase) : null,
      schedule_task_id: text(row?.schedule_task_id) || null,
      created_time: text(row?.created_time) || null,
      modified_time: text(row?.modified_time) || null,
    }))

    if (cleaned.some((row: any) => !row.drive_file_id || !row.file_name || !row.photo_date)) {
      return NextResponse.json({ ok: false, error: 'invalid_row', required: ['drive_file_id','file_name','photo_date'] }, { status: 422 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await supabase.rpc('drive_photo_index_upsert', {
      p_sync_key: syncKey,
      p_project_code: projectCode,
      p_source_folder: sourceFolder,
      p_rows: cleaned,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const result = data as Record<string, unknown> | null
    return NextResponse.json(result ?? { ok: false, error: 'empty_rpc_response' }, { status: result?.ok === false ? 403 : 200 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'unknown_error' }, { status: 500 })
  }
}
