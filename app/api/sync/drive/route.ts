import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readSheet } from 'read-excel-file/node'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

const PROJECT_SHEETS: Record<string, { sheet: string; sourceFile: string }> = {
  'AV-P6': { sheet: 'ติดตามความคืบหน้าP6', sourceFile: 'Above Villa Plot6 Construction Progress_Updated_2026-09-19.xlsx' },
  'AV-P7': { sheet: 'ติดตามความคืบหน้าP7', sourceFile: 'Above Villa Plot7 Construction Progress_Updated_2026-09-19.xlsx' },
  'AV-P8': { sheet: 'ติดตามความคืบหน้าP8', sourceFile: 'Above Villa Plot8 Construction Progress.xlsx' },
  'AV-P9': { sheet: 'ติดตามความคืบหน้าP9', sourceFile: 'Above Villa Plot9 Construction Progress.xlsx' },
}

const MATERIAL_SHEETS: Record<string, string> = {
  'AV-P6': '03 Villa Plot 6',
  'AV-P7': '04 Villa Plot 7',
  'AV-P8': '05 Villa Plot 8',
  'AV-P9': '06 Villa Plot 9',
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number(String(value).replace(/,/g, '').replace('%', '').trim())
  return Number.isFinite(n) ? n : null
}

function pct(value: unknown): number | null {
  const n = num(value)
  if (n === null) return null
  const v = n > 1 && n <= 100 ? n / 100 : n
  return Math.max(0, Math.min(1, v))
}

function isoDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const s = String(value).trim()
  if (!s) return null
  const thai = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (thai) {
    const day = Number(thai[1])
    const month = Number(thai[2])
    let year = Number(thai[3])
    if (year > 2400) year -= 543
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function sourceTaskNo(value: unknown, fallback: number): string {
  const n = num(value)
  if (n !== null) return String(Math.trunc(n))
  return text(value) || String(fallback)
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function headerIndex(headers: unknown[], title: string): number {
  const target = normalizeHeader(title)
  return headers.findIndex((h) => normalizeHeader(h) === target)
}

function valueByHeader(row: unknown[], headers: unknown[], title: string): unknown {
  const i = headerIndex(headers, title)
  return i >= 0 ? row[i] : null
}

function mapProjectFromLocation(location: unknown): string | null {
  const s = String(location ?? '')
  if (/Plot\s*6/i.test(s)) return 'AV-P6'
  if (/Plot\s*7/i.test(s)) return 'AV-P7'
  if (/Plot\s*8/i.test(s)) return 'AV-P8'
  if (/Plot\s*9/i.test(s)) return 'AV-P9'
  return null
}

async function parseSchedule(buffer: Buffer, projectCode: string) {
  const config = PROJECT_SHEETS[projectCode]
  if (!config) throw new Error(`Unsupported project: ${projectCode}`)

  const rows = await readSheet(buffer, config.sheet)
  const h = rows.findIndex((r) => normalizeHeader(r[0]) === 'ID' && normalizeHeader(r[2]).includes('Task Name'))
  if (h < 0) throw new Error(`Header row not found in ${config.sheet}`)

  const out: Record<string, unknown>[] = []
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    const category = text(r[1])
    const taskName = text(r[2])
    if (!category && !taskName) continue

    out.push({
      source_task_no: sourceTaskNo(r[0], i - h),
      category,
      task_name: taskName,
      area: text(r[3]),
      planned_duration_days: num(r[4]),
      planned_start: isoDate(r[5]),
      planned_end: isoDate(r[6]),
      baseline_progress: pct(r[7]),
      imported_plan_progress: pct(r[8]),
      actual_progress: pct(r[9]) ?? 0,
      plan_status: text(r[11]),
      site_status: text(r[12]),
      actual_start: isoDate(r[13]),
      actual_end: isoDate(r[14]),
      responsible_person: text(r[15]),
      contractor: text(r[16]),
      inspection_point: text(r[17]),
      required_evidence: text(r[18]),
      inspection_type: text(r[19]),
      inspection_result: text(r[20]),
      inspection_date: isoDate(r[21]),
      blocker: text(r[22]),
      next_action: text(r[23]),
      target_close: isoDate(r[24]),
      defect_ref: text(r[25]),
      evidence_link: text(r[26]),
      source_updated_at: isoDate(r[27]),
      notes: text(r[28]),
      source_sheet: config.sheet,
      source_row: i + 1,
    })
  }

  return { rows: out, sourceFile: config.sourceFile }
}

async function parseMaterials(buffer: Buffer) {
  const materials: Record<string, unknown>[] = []

  for (const [projectCode, sheet] of Object.entries(MATERIAL_SHEETS)) {
    const rows = await readSheet(buffer, sheet)
    const h = rows.findIndex((r) => r.some((v) => normalizeHeader(v) === 'รายการวัสดุ/งาน'))
    if (h < 0) throw new Error(`Header row not found in ${sheet}`)
    const headers = rows[h] as unknown[]

    for (let i = h + 1; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      const itemName = text(valueByHeader(r, headers, 'รายการวัสดุ/งาน'))
      if (!itemName) continue
      materials.push({
        project_code: projectCode,
        data_group: text(valueByHeader(r, headers, 'กลุ่มข้อมูล')),
        source_item_no: text(valueByHeader(r, headers, 'ลำดับเดิม')),
        category: text(valueByHeader(r, headers, 'หมวดหมู่')),
        item_name: itemName,
        status: text(valueByHeader(r, headers, 'สถานะหลัก')),
        status_detail: text(valueByHeader(r, headers, 'รายละเอียดสถานะเดิม')),
        brand: text(valueByHeader(r, headers, 'ยี่ห้อ/ผู้ผลิต')),
        model_spec: text(valueByHeader(r, headers, 'รุ่น/สเปก')),
        quantity_unit: text(valueByHeader(r, headers, 'ปริมาณ/หน่วย')),
        contact_name: text(valueByHeader(r, headers, 'ผู้ติดต่อ')),
        contact_phone: text(valueByHeader(r, headers, 'โทรศัพท์')),
        notes: text(valueByHeader(r, headers, 'หมายเหตุ')),
        source_sheet: sheet,
        source_row: i + 1,
      })
    }
  }

  const procurement: Record<string, unknown>[] = []
  const procurementSheet = '12 Purchasing ค้างส่ง'
  const pRows = await readSheet(buffer, procurementSheet)
  const ph = pRows.findIndex((r) => r.some((v) => normalizeHeader(v) === 'ผู้ขาย/ผู้รับเหมา'))
  if (ph >= 0) {
    const headers = pRows[ph] as unknown[]
    for (let i = ph + 1; i < pRows.length; i++) {
      const r = pRows[i] as unknown[]
      const itemName = text(valueByHeader(r, headers, 'รายการ'))
      if (!itemName) continue
      const deliveryText = text(valueByHeader(r, headers, 'กำหนดส่ง/เข้าหน้างาน'))
      procurement.push({
        project_code: mapProjectFromLocation(valueByHeader(r, headers, 'หน้างาน')),
        vendor: text(valueByHeader(r, headers, 'ผู้ขาย/ผู้รับเหมา')),
        item_name: itemName,
        procurement_status: text(valueByHeader(r, headers, 'สถานะชำระ/จัดซื้อ')),
        payment_status: text(valueByHeader(r, headers, 'สถานะชำระ/จัดซื้อ')),
        current_status: text(valueByHeader(r, headers, 'สถานะปัจจุบัน')),
        expected_delivery_text: deliveryText,
        expected_delivery: isoDate(deliveryText),
        condition_note: text(valueByHeader(r, headers, 'ผู้แจ้ง/เงื่อนไข')),
        source_updated_at: isoDate(valueByHeader(r, headers, 'อัปเดตล่าสุด')),
        source_row: i + 1,
      })
    }
  }

  return { materials, procurement }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: '3 Kings Drive Sync V3.2', route: '/api/sync/drive' })
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')
    const projectCode = url.searchParams.get('project')
    const syncKey = request.headers.get('x-sync-key') || ''

    if (!syncKey) return NextResponse.json({ ok: false, error: 'missing_sync_key' }, { status: 401 })
    if (kind !== 'schedule' && kind !== 'materials') {
      return NextResponse.json({ ok: false, error: 'invalid_kind' }, { status: 400 })
    }

    const arrayBuffer = await request.arrayBuffer()
    if (!arrayBuffer.byteLength) return NextResponse.json({ ok: false, error: 'empty_file' }, { status: 400 })
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 413 })

    const buffer = Buffer.from(arrayBuffer)
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (kind === 'schedule') {
      if (!projectCode || !PROJECT_SHEETS[projectCode]) {
        return NextResponse.json({ ok: false, error: 'invalid_project' }, { status: 400 })
      }
      const parsed = await parseSchedule(buffer, projectCode)
      const { data, error } = await supabase.rpc('drive_sync_apply_schedule', {
        p_sync_key: syncKey,
        p_project_code: projectCode,
        p_source_file: parsed.sourceFile,
        p_rows: parsed.rows,
      })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      const result = data as Record<string, unknown> | null
      return NextResponse.json(result ?? { ok: false, error: 'empty_rpc_response' }, { status: result?.ok === false ? 403 : 200 })
    }

    const parsed = await parseMaterials(buffer)
    const { data, error } = await supabase.rpc('drive_sync_replace_materials', {
      p_sync_key: syncKey,
      p_source_file: 'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-06.xlsx',
      p_materials: parsed.materials,
      p_procurement: parsed.procurement,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const result = data as Record<string, unknown> | null
    return NextResponse.json(result ?? { ok: false, error: 'empty_rpc_response' }, { status: result?.ok === false ? 403 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
