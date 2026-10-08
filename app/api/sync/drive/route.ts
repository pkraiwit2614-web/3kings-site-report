import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { readSheet } from 'read-excel-file/node'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wtqubwdduzedmcvyhbgs.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Ruyka15H3QApZKY9q2U-Vg_CjmEuMRX'

const PROJECT_SHEETS: Record<string, { sheet: string }> = {
  'AV-P3': { sheet: 'ติดตามความคืบหน้าP3' },
  'AV-P6': { sheet: 'ติดตามความคืบหน้าP6' },
  'AV-P7': { sheet: 'ติดตามความคืบหน้าP7' },
  'AV-P8': { sheet: 'ติดตามความคืบหน้าP8' },
  'AV-P9': { sheet: 'ติดตามความคืบหน้าP9' },
}

const MATERIAL_MASTER_SHEET = '01 รายการทั้งหมด'
const MATERIAL_SOURCE_FILE = 'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx'
const PROCUREMENT_SHEETS = ['04 Purchasing ค้างส่ง','12 Purchasing ค้างส่ง']
const TOOL_MACHINE_SHEET = '06-Tools & Machine'

const DEFECT_MASTER_SHEET = 'ข้อมูลจำแนก'
const DEFECT_EXPECTED_ROOMS = 263
const DEFECT_EXPECTED_A = 162
const DEFECT_EXPECTED_B = 101
const DEFECT_REQUIRED_HEADERS = [
  'Building', 'Floor', 'Room', 'Hotel Participation', 'Customer Status',
  'Current Status', 'Status Group', 'Follow-up', 'Priority', 'Next Action',
]

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

function headerIndexPrefix(headers: unknown[], prefix: string): number {
  const target = normalizeHeader(prefix)
  return headers.findIndex((h) => normalizeHeader(h).startsWith(target))
}

function valueByHeader(row: unknown[], headers: unknown[], title: string): unknown {
  const i = headerIndex(headers, title)
  return i >= 0 ? row[i] : null
}

function valueByHeaderPrefix(row: unknown[], headers: unknown[], prefix: string): unknown {
  const i = headerIndexPrefix(headers, prefix)
  return i >= 0 ? row[i] : null
}

function normalizeIdentityPart(value: string | null): string {
  return (value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function sourceIdentity(projectCode: string, category: string | null, taskName: string | null, area: string | null, occurrence: number): string {
  const raw = [projectCode, normalizeIdentityPart(category), normalizeIdentityPart(taskName), normalizeIdentityPart(area), String(occurrence)].join('|')
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

function plotCodesFromLocation(location: unknown): string[] {
  const s = String(location ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
  const codes = new Set<string>()
  // Read the entire numeric token: Plot 30 must never become Plot 3.
  for (const match of s.matchAll(/\b(?:Plot\s*|AV-P\s*|P\s*)(\d+)(?:\s*[/,+&]\s*(?:Plot\s*|AV-P\s*|P\s*)?\d+)*(?![\w])/gi)) {
    for (const number of match[0].match(/\d+/g) || []) {
      if (['3','6','7','8','9'].includes(number)) codes.add(`AV-P${number}`)
    }
  }
  // Keep existing non-P3 shorthand semantics unchanged in this scoped fix.
  if (!codes.has('AV-P3')) {
    return Array.from(new Set(Array.from(s.matchAll(/\bPlot\s*([6-9])\b/gi), match => `AV-P${match[1]}`)))
  }
  return Array.from(codes)
}

function mapProjectFromLocation(location: unknown): string | null {
  const codes = plotCodesFromLocation(location)
  return ['AV-P3','AV-P6','AV-P7','AV-P8','AV-P9'].find(code => codes.includes(code)) || null
}

function mapProjectsFromLocation(location: unknown): string[] {
  const s = String(location ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
  const codes = new Set<string>(plotCodesFromLocation(s))

  if (/Above\s*Condo\s*A\b|Condo\s*Building\s*A\b/i.test(s)) codes.add('CONDO-A')
  if (/Above\s*Condo\s*B\b|Condo\s*Building\s*B\b/i.test(s)) codes.add('CONDO-B')
  if (/\bMirage\b/i.test(s)) codes.add('MIRAGE')
  if (/Proud\s*Karon/i.test(s)) codes.add('PROUD-KARON')
  if (/Hennessy|Henessy/i.test(s)) codes.add('HENNESSY')
  if (/Above\s*Villa.*(?:Common|ส่วนกลาง)|(?:Common|ส่วนกลาง).*Above\s*Villa/i.test(s)) codes.add('AV-COMMON')

  return Array.from(codes)
}

function applyConfirmedProcurementFacts(row: Record<string, unknown>): Record<string, unknown> {
  const itemName = String(row.item_name ?? '')
  const vendor = String(row.vendor ?? '')

  if (/สะดืออ่างล้างหน้า/i.test(itemName) && /บ้านสุขภัณฑ์/i.test(vendor)) {
    return {
      ...row,
      project_code: null,
      project_codes: ['CONDO-A','CONDO-B'],
      procurement_status: 'รับสินค้าแล้ว / ติดตั้งเรียบร้อย',
      current_status: 'รับสินค้าแล้ว / ติดตั้งเรียบร้อย / ปิดติดตาม',
      expected_delivery_text: 'ของมาครบและติดตั้งเรียบร้อยแล้ว',
      expected_delivery: null,
      condition_note: 'สำหรับ Above Condo A และ Above Condo B • ยืนยัน 02/10/2569: ของมาครบทั้งหมดและติดตั้งเรียบร้อยแล้ว',
      source_updated_at: '2026-10-02',
    }
  }

  return row
}

function isExplicitSharedProcurement(row: Record<string, unknown>): boolean {
  const marker = [row.item_name, row.condition_note].map((v) => String(v ?? '')).join(' ')
  return /(?:รวม\s*P\d|Qty\s*รวม|ไม่แยก\s*Qty\s*\/?\s*Plot|ไม่ใช่ต่อ\s*Plot)/i.test(marker)
}

function mergeSharedProcurementRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const merged: Record<string, unknown>[] = []
  const sharedByKey = new Map<string, Record<string, unknown>>()

  for (const row of rows) {
    if (!isExplicitSharedProcurement(row)) {
      merged.push(row)
      continue
    }

    const key = [
      row.vendor, row.item_name, row.procurement_status, row.payment_status, row.current_status,
      row.expected_delivery_text, row.condition_note, row.source_updated_at, row.source_sheet,
    ].map((v) => normalizeIdentityPart(text(v))).join('|')

    const existing = sharedByKey.get(key)
    if (!existing) {
      const copy = { ...row }
      sharedByKey.set(key, copy)
      merged.push(copy)
      continue
    }

    const existingCodes = Array.isArray(existing.project_codes) ? existing.project_codes.map(String) : []
    const rowCodes = Array.isArray(row.project_codes) ? row.project_codes.map(String) : []
    const projectCodes = Array.from(new Set([...existingCodes, ...rowCodes]))
    existing.project_codes = projectCodes
    existing.project_code = projectCodes.length === 1 ? projectCodes[0] : null

    const existingSourceRow = Number(existing.source_row)
    const rowSourceRow = Number(row.source_row)
    if (Number.isFinite(rowSourceRow) && (!Number.isFinite(existingSourceRow) || rowSourceRow < existingSourceRow)) {
      existing.source_row = row.source_row
    }
  }

  return merged
}

function normalizeRoomNo(value: unknown): string | null {
  const room = String(value ?? '').toUpperCase().replace(/\s+/g, '').trim()
  return /^[AB]\d{3}$/.test(room) ? room : null
}

async function parseDefects(buffer: Buffer) {
  const rows = await readSheet(buffer, DEFECT_MASTER_SHEET)
  const h = rows.findIndex((r) => {
    const headers = r as unknown[]
    return DEFECT_REQUIRED_HEADERS.every((name) => headerIndex(headers, name) >= 0)
  })
  if (h < 0) throw new Error(`Defect master headers not found in ${DEFECT_MASTER_SHEET}`)

  const headers = rows[h] as unknown[]
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    const rawRoom = text(valueByHeader(r, headers, 'Room'))
    if (!rawRoom) continue

    const roomNo = normalizeRoomNo(rawRoom)
    if (!roomNo) throw new Error(`Invalid defect room number at row ${i + 1}: ${rawRoom}`)
    if (seen.has(roomNo)) throw new Error(`Duplicate defect room in source: ${roomNo}`)

    const building = text(valueByHeader(r, headers, 'Building'))
    const floorValue = num(valueByHeader(r, headers, 'Floor'))
    const hotelParticipation = text(valueByHeader(r, headers, 'Hotel Participation'))
    const customerStatus = text(valueByHeader(r, headers, 'Customer Status'))
    const currentStatus = text(valueByHeader(r, headers, 'Current Status'))
    const statusGroup = text(valueByHeader(r, headers, 'Status Group'))
    const followUp = text(valueByHeader(r, headers, 'Follow-up'))
    const priority = text(valueByHeader(r, headers, 'Priority'))
    const nextAction = text(valueByHeader(r, headers, 'Next Action'))

    if (building !== roomNo.charAt(0)) {
      throw new Error(`Building mismatch for ${roomNo}: source=${building || '-'}`)
    }
    const expectedFloor = Number(roomNo.charAt(1))
    if (floorValue === null || Math.trunc(floorValue) !== expectedFloor) {
      throw new Error(`Floor mismatch for ${roomNo}: source=${floorValue ?? '-'} expected=${expectedFloor}`)
    }
    if (!['ร่วมโรงแรม', 'ไม่ร่วมโรงแรม'].includes(hotelParticipation || '')) {
      throw new Error(`Invalid Hotel Participation for ${roomNo}: ${hotelParticipation || '-'}`)
    }
    if (!['มีลูกค้า', 'ไม่มีลูกค้า'].includes(customerStatus || '')) {
      throw new Error(`Invalid Customer Status for ${roomNo}: ${customerStatus || '-'}`)
    }
    if (!currentStatus || !statusGroup || !followUp || !priority || !nextAction) {
      throw new Error(`Required defect status field is blank for ${roomNo}`)
    }

    seen.add(roomNo)
    out.push({
      room_no: roomNo,
      building,
      floor: expectedFloor,
      hotel_participation: hotelParticipation,
      customer_status: customerStatus,
      current_status: currentStatus,
      status_group: statusGroup,
      follow_up: followUp,
      priority,
      next_action: nextAction,
      latest_source: text(valueByHeader(r, headers, 'Latest Source')),
      source_note: text(valueByHeader(r, headers, 'Source Note')),
      hotel_complete_color: text(valueByHeader(r, headers, 'Hotel Complete Color')),
      hotel_remarks: text(valueByHeader(r, headers, 'Hotel Remarks')),
    })
  }

  const aCount = out.filter((r) => r.building === 'A').length
  const bCount = out.filter((r) => r.building === 'B').length
  if (out.length !== DEFECT_EXPECTED_ROOMS || seen.size !== DEFECT_EXPECTED_ROOMS) {
    throw new Error(`Defect inventory parsed ${out.length} unique rooms; expected ${DEFECT_EXPECTED_ROOMS}`)
  }
  if (aCount !== DEFECT_EXPECTED_A || bCount !== DEFECT_EXPECTED_B) {
    throw new Error(`Defect building count mismatch: A=${aCount} B=${bCount}; expected A=${DEFECT_EXPECTED_A} B=${DEFECT_EXPECTED_B}`)
  }

  return { rows: out, counts: { total: out.length, A: aCount, B: bCount } }
}

async function parseSchedule(buffer: Buffer, projectCode: string) {
  const config = PROJECT_SHEETS[projectCode]
  if (!config) throw new Error(`Unsupported project: ${projectCode}`)

  const rows = await readSheet(buffer, config.sheet)
  const h = rows.findIndex((r) => r.some((v) => normalizeHeader(v) === 'ID') && r.some((v) => normalizeHeader(v) === 'Task Name ตาม Schedule'))
  if (h < 0) throw new Error(`Header row not found in ${config.sheet}`)

  const headers = rows[h] as unknown[]
  const requiredHeaders = [
    'ID', 'หมวดหลัก', 'Task Name ตาม Schedule', 'พื้นที่/ชั้น', '% หน้างานล่าสุด',
    'สถานะหน้างาน', 'ปัญหา/อุปสรรค', 'งานถัดไป/แนวทางแก้', 'วันที่อัปเดต'
  ]
  const missing = requiredHeaders.filter((name) => headerIndex(headers, name) < 0)
  if (missing.length) throw new Error(`Missing schedule headers in ${config.sheet}: ${missing.join(', ')}`)

  const identityCounts = new Map<string, number>()
  const out: Record<string, unknown>[] = []

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    const category = text(valueByHeader(r, headers, 'หมวดหลัก'))
    const taskName = text(valueByHeader(r, headers, 'Task Name ตาม Schedule'))
    const area = text(valueByHeader(r, headers, 'พื้นที่/ชั้น'))
    if (!category && !taskName) continue

    const identityBase = [normalizeIdentityPart(category), normalizeIdentityPart(taskName), normalizeIdentityPart(area)].join('|')
    const occurrence = (identityCounts.get(identityBase) || 0) + 1
    identityCounts.set(identityBase, occurrence)

    out.push({
      source_identity: sourceIdentity(projectCode, category, taskName, area, occurrence),
      source_task_no: sourceTaskNo(valueByHeader(r, headers, 'ID'), i - h),
      category,
      task_name: taskName,
      area,
      planned_duration_days: num(valueByHeader(r, headers, 'ระยะเวลา (วัน)')),
      planned_start: isoDate(valueByHeader(r, headers, 'เริ่มตามแผน')),
      planned_end: isoDate(valueByHeader(r, headers, 'จบตามแผน')),
      baseline_progress: pct(valueByHeaderPrefix(r, headers, '% ตาม Schedule')),
      imported_plan_progress: pct(valueByHeader(r, headers, '% แผน ณ วันรายงาน')),
      actual_progress: pct(valueByHeader(r, headers, '% หน้างานล่าสุด')) ?? 0,
      plan_status: text(valueByHeader(r, headers, 'สถานะแผน (Auto)')),
      site_status: text(valueByHeader(r, headers, 'สถานะหน้างาน')),
      actual_start: isoDate(valueByHeader(r, headers, 'เริ่มจริง')),
      actual_end: isoDate(valueByHeader(r, headers, 'จบจริง')),
      responsible_person: text(valueByHeader(r, headers, 'ผู้รับผิดชอบ')),
      contractor: text(valueByHeader(r, headers, 'ทีมงาน/ผู้รับเหมา')),
      inspection_point: text(valueByHeader(r, headers, 'จุดตรวจสำคัญ / ITP')),
      required_evidence: text(valueByHeader(r, headers, 'หลักฐาน / Report ที่ต้องมี')),
      inspection_type: text(valueByHeader(r, headers, 'ประเภทจุดตรวจ')),
      inspection_result: text(valueByHeader(r, headers, 'ผลตรวจล่าสุด')),
      inspection_date: isoDate(valueByHeader(r, headers, 'วันที่ตรวจล่าสุด')),
      blocker: text(valueByHeader(r, headers, 'ปัญหา/อุปสรรค')),
      next_action: text(valueByHeader(r, headers, 'งานถัดไป/แนวทางแก้')),
      target_close: isoDate(valueByHeader(r, headers, 'Target Close')),
      defect_ref: text(valueByHeader(r, headers, 'Defect/NCR Ref.')),
      evidence_link: text(valueByHeader(r, headers, 'Link รูป/เอกสาร')),
      source_updated_at: isoDate(valueByHeader(r, headers, 'วันที่อัปเดต')),
      notes: text(valueByHeader(r, headers, 'หมายเหตุ')),
      source_sheet: config.sheet,
      source_row: i + 1,
    })
  }

  return { rows: out }
}

async function parseMaterials(buffer: Buffer) {
  const materials: Record<string, unknown>[] = []
  const rows = await readSheet(buffer, MATERIAL_MASTER_SHEET)
  const h = rows.findIndex((r) => r.some((v) => normalizeHeader(v) === 'รายการวัสดุ/งาน'))
  if (h < 0) throw new Error(`Header row not found in ${MATERIAL_MASTER_SHEET}`)
  const headers = rows[h] as unknown[]
  if (headerIndex(headers, 'สถานที่/หลัง') < 0) throw new Error('Materials location header not found')

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[]
    const location = valueByHeader(r, headers, 'สถานที่/หลัง')
    const relatedPlots = mapProjectsFromLocation(location).filter(code => code.startsWith('AV-P'))
    // A master-material row has one project_id. Never silently move a shared row to Plot 3.
    if (relatedPlots.includes('AV-P3') && relatedPlots.length > 1) {
      throw new Error(`Ambiguous shared Plot 3 material at row ${i + 1}; use separate source rows or the shared Purchasing sheet`)
    }
    const projectCode = mapProjectFromLocation(location)
    if (!projectCode) continue
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
      source_sheet: MATERIAL_MASTER_SHEET,
      source_row: i + 1,
    })
  }

  const procurement: Record<string, unknown>[] = []
  let procurementSheet = ''
  let pRows: any = null
  for (const candidate of PROCUREMENT_SHEETS) {
    try {
      pRows = await readSheet(buffer, candidate)
      procurementSheet = candidate
      break
    } catch {
      // Try the next supported sheet name.
    }
  }
  if (!pRows || !procurementSheet) throw new Error('Purchasing sheet not found')

  const ph = pRows.findIndex((r: unknown[]) => r.some((v) => normalizeHeader(v) === 'ผู้ขาย/ผู้รับเหมา'))
  if (ph < 0 || headerIndex(pRows[ph], 'รายการ') < 0) {
    throw new Error(`Purchasing headers not found in ${procurementSheet}`)
  }
  if (ph >= 0) {
    const pHeaders = pRows[ph] as unknown[]
    for (let i = ph + 1; i < pRows.length; i++) {
      const r = pRows[i] as unknown[]
      const itemName = text(valueByHeader(r, pHeaders, 'รายการ'))
      if (!itemName) continue
      const deliveryText = text(valueByHeader(r, pHeaders, 'กำหนดส่ง/เข้าหน้างาน'))
      const projectCodes = mapProjectsFromLocation(valueByHeader(r, pHeaders, 'หน้างาน'))
      procurement.push({
        project_code: projectCodes.length === 1 ? projectCodes[0] : null,
        project_codes: projectCodes,
        vendor: text(valueByHeader(r, pHeaders, 'ผู้ขาย/ผู้รับเหมา')),
        item_name: itemName,
        procurement_status: text(valueByHeader(r, pHeaders, 'สถานะชำระ/จัดซื้อ')),
        payment_status: text(valueByHeader(r, pHeaders, 'สถานะชำระ/จัดซื้อ')),
        current_status: text(valueByHeader(r, pHeaders, 'สถานะปัจจุบัน')),
        expected_delivery_text: deliveryText,
        expected_delivery: isoDate(deliveryText),
        condition_note: text(valueByHeader(r, pHeaders, 'ผู้แจ้ง/เงื่อนไข')),
        source_updated_at: isoDate(valueByHeader(r, pHeaders, 'อัปเดตล่าสุด')),
        source_sheet: procurementSheet,
        source_row: i + 1,
      })
    }
  }

  const tools: Record<string, unknown>[] = []
  const tRows = await readSheet(buffer, TOOL_MACHINE_SHEET)
  const th = tRows.findIndex((r) => r.some((v) => normalizeHeader(v) === 'รหัสรายการ') && r.some((v) => normalizeHeader(v) === 'รายการเครื่องมือ/เครื่องจักร'))
  if (th < 0) throw new Error(`Header row not found in ${TOOL_MACHINE_SHEET}`)
  const tHeaders = tRows[th] as unknown[]

  for (let i = th + 1; i < tRows.length; i++) {
    const r = tRows[i] as unknown[]
    const itemCode = text(valueByHeader(r, tHeaders, 'รหัสรายการ'))
    const itemName = text(valueByHeader(r, tHeaders, 'รายการเครื่องมือ/เครื่องจักร'))
    if (!itemCode && !itemName) continue

    tools.push({
      item_no: num(valueByHeader(r, tHeaders, 'ลำดับ')),
      item_code: itemCode,
      category: text(valueByHeader(r, tHeaders, 'หมวด')),
      item_name: itemName,
      brand: text(valueByHeader(r, tHeaders, 'ยี่ห้อ')),
      model_spec: text(valueByHeader(r, tHeaders, 'รุ่น/ขนาด')),
      quantity: num(valueByHeader(r, tHeaders, 'จำนวน')),
      unit: text(valueByHeader(r, tHeaders, 'หน่วย')),
      status: text(valueByHeader(r, tHeaders, 'สถานะ')),
      location: text(valueByHeader(r, tHeaders, 'สถานที่จัดเก็บ/ใช้ล่าสุด')),
      source_updated_at: isoDate(valueByHeader(r, tHeaders, 'วันที่อัปเดต')),
      responsible_person: text(valueByHeader(r, tHeaders, 'ผู้รับผิดชอบ')),
      notes: text(valueByHeader(r, tHeaders, 'หมายเหตุ')),
      source_sheet: TOOL_MACHINE_SHEET,
      source_row: i + 1,
    })
  }

  return { materials, procurement: mergeSharedProcurementRows(procurement.map(applyConfirmedProcurementFacts)), tools }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: '3 Kings Drive Sync V3.3.2', route: '/api/sync/drive', kinds: ['schedule','materials','defects'] })
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')
    const projectCode = url.searchParams.get('project')
    const sourceFile = text(url.searchParams.get('sourceFile'))
    const sourceFileId = text(url.searchParams.get('sourceFileId'))
    const sourceModifiedAt = text(url.searchParams.get('sourceModifiedAt'))
    const dryRun = ['1', 'true', 'yes'].includes(String(url.searchParams.get('dryRun') || '').toLowerCase())
    const syncKey = request.headers.get('x-sync-key') || ''

    if (!syncKey) return NextResponse.json({ ok: false, error: 'missing_sync_key' }, { status: 401 })
    if (kind !== 'schedule' && kind !== 'materials' && kind !== 'defects') {
      return NextResponse.json({ ok: false, error: 'invalid_kind' }, { status: 400 })
    }

    // Only defects has a transactional dry-run RPC. Fail closed for other kinds.
    if (dryRun && kind !== 'defects') {
      return NextResponse.json({ ok: false, error: 'dry_run_not_supported', writes_performed: false }, { status: 400 })
    }
    if (kind === 'materials' && sourceFile && /REFERENCE[ _-]*ONLY|PR[ _-]*Plot[ _-]*3[ _-]*Working/i.test(sourceFile)) {
      return NextResponse.json({ ok: false, error: 'reference_or_working_pr_not_materials_master' }, { status: 422 })
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
      if (!parsed.rows.length) return NextResponse.json({ ok: false, error: 'no_schedule_rows' }, { status: 422 })
      const actualSourceFile = sourceFile || `${projectCode}-latest.xlsx`
      const { data, error } = await supabase.rpc('drive_sync_apply_schedule', {
        p_sync_key: syncKey,
        p_project_code: projectCode,
        p_source_file: actualSourceFile,
        p_rows: parsed.rows,
      })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      const result = data as Record<string, unknown> | null
      return NextResponse.json(result ?? { ok: false, error: 'empty_rpc_response' }, { status: result?.ok === false ? 403 : 200 })
    }

    if (kind === 'defects') {
      const parsed = await parseDefects(buffer)
      const actualSourceFile = sourceFile || 'Handover_Defect_Summary.xlsx'
      const { data, error } = await supabase.rpc('drive_sync_apply_condo_defects', {
        p_sync_key: syncKey,
        p_source_file: actualSourceFile,
        p_source_file_id: sourceFileId,
        p_source_modified_at: sourceModifiedAt,
        p_rows: parsed.rows,
        p_dry_run: dryRun,
      })
      if (error) return NextResponse.json({ ok: false, error: error.message, counts: parsed.counts }, { status: 500 })
      const result = data as Record<string, unknown> | null
      return NextResponse.json(
        { ...(result ?? { ok: false, error: 'empty_rpc_response' }), source_validation: parsed.counts },
        { status: result?.ok === false ? 422 : 200 }
      )
    }

    const parsed = await parseMaterials(buffer)
    // A truncated/header-only workbook must never reach the replacement RPC.
    if (!parsed.materials.length || !parsed.procurement.length || !parsed.tools.length) {
      return NextResponse.json({ ok: false, error: 'incomplete_materials_workbook' }, { status: 422 })
    }
    const actualSourceFile = sourceFile || MATERIAL_SOURCE_FILE
    const { data, error } = await supabase.rpc('drive_sync_replace_materials_tools', {
      p_sync_key: syncKey,
      p_source_file: actualSourceFile,
      p_materials: parsed.materials,
      p_procurement: parsed.procurement,
      p_tools: parsed.tools,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const result = data as Record<string, unknown> | null
    return NextResponse.json(result ?? { ok: false, error: 'empty_rpc_response' }, { status: result?.ok === false ? 403 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
