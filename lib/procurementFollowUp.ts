/**
 * Shared read-only classification for dashboard and procurement list.
 * PO/PL evidence, receipts and payment status remain sourced from the existing
 * procurement master / Express workflow; this module never infers those facts.
 */
export type ProcurementFollowUpRow = {
  id?: string | null
  item_name?: string | null
  current_status?: string | null
  payment_status?: string | null
  procurement_status?: string | null
  po_no?: string | null
  pr_no?: string | null
  expected_delivery?: string | null
  expected_delivery_text?: string | null
  source_updated_at?: string | null
  updated_at?: string | null
}

export type ProcurementFollowUpStage = 'pr' | 'ordered' | 'verify' | 'other' | 'closed'

const explicitlyClosed = /(ปิดติดตาม|ปิดงาน|ส่งครบ|ส่งมอบเรียบร้อย|ติดตั้งเรียบร้อย|เสร็จสมบูรณ์|completed|closed)/i
const outstanding = /(รอ|ยังไม่|ค้าง|ต้องยืนยัน|ต้องตรวจ|ไม่พบหลักฐาน|ไม่ใช่หลักฐาน|ต้องติดตาม|เครดิตครบกำหนด|กำหนดชำระ|งวดถัดไป|pending|outstanding|unconfirmed|not\s+(?:paid|received))/i

export function needsProcurementFollowUp(row: ProcurementFollowUpRow): boolean {
  const current = String(row.current_status || '').trim()
  const payment = String(row.payment_status || '').trim()
  // A completed work/delivery is not necessarily a closed purchasing/payment follow-up.
  if (outstanding.test(current) || outstanding.test(payment)) return true
  return !explicitlyClosed.test(current)
}

export function procurementFollowUpStage(row: ProcurementFollowUpRow): ProcurementFollowUpStage {
  if (!needsProcurementFollowUp(row)) return 'closed'
  const current = String(row.current_status || '')
  const payment = String(row.payment_status || '')
  if (/(ชำระ|จ่าย|วางบิล|ตรวจรับ|รับสินค้า|รับของ|รับแล้ว|ติดตั้ง|ส่งมอบ)/i.test(current + ' ' + payment)) return 'verify'
  // An explicit PO/PL number is evidence of an order; status prose alone is not.
  if (String(row.po_no || '').trim()) return 'ordered'
  if (/(PR|PO|PL|ขอซื้อ|อนุมัติ|ยังไม่สั่ง|รอจัดซื้อ)/i.test(current + ' ' + String(row.procurement_status || '') + ' ' + String(row.pr_no || ''))) return 'pr'
  return 'other'
}

export const procurementStageLabels: Record<ProcurementFollowUpStage, string> = {
  pr: 'รอ PO/PL หรือยืนยันใบสั่ง',
  ordered: 'มีเลข PO/PL • รอติดตามส่ง/รับ',
  verify: 'รอตรวจรับ/ตรวจเอกสาร/ชำระ',
  other: 'ต้องตรวจสอบสถานะ',
  closed: 'ปิดติดตาม'
}

function priority(row: ProcurementFollowUpRow, today: string): number {
  const due = String(row.expected_delivery || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due < today) return 0
  const note = [row.current_status, row.expected_delivery_text, row.item_name].join(' ')
  if (/(ด่วน|เร่งด่วน|ค้างส่ง|ของขาด)/i.test(note)) return 1
  if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due <= today) return 2
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return 3
  const stage = procurementFollowUpStage(row)
  return stage === 'ordered' ? 4 : stage === 'pr' ? 5 : stage === 'verify' ? 6 : 7
}

export function sortedProcurementFollowUps<T extends ProcurementFollowUpRow>(rows: T[], today: string): T[] {
  return rows.filter(needsProcurementFollowUp).sort((a, b) =>
    priority(a, today) - priority(b, today) ||
    String(a.expected_delivery || '9999-12-31').localeCompare(String(b.expected_delivery || '9999-12-31')) ||
    String(b.updated_at || b.source_updated_at || '').localeCompare(String(a.updated_at || a.source_updated_at || '')) ||
    String(a.id || '').localeCompare(String(b.id || ''))
  )
}
