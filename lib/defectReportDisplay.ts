/**
 * Above Condo Defect Report: light presentation-only wording cleanup.
 * Preserve counts, new defect descriptions, dates, Work IDs, HOLD, vendor, evidence
 * and all actionable follow-ups. Canonical source fields are never changed.
 * The original "รายละเอียดงาน" summary is rendered without this helper.
 */
export function compactNextAction(value: string | null | undefined): string {
  const original = (value || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
  if (!original) return '-'

  // Remove only status repetition already visible in the Status column.
  // Do not interpret, shorten or remove the actual new-defect / repair detail.
  return original
    .replace(/\s*\(ไม่เปลี่ยน Pending Handover\)/gi, '')
    .replace(/(?:;\s*)?คงสถานะ Pending Handover\s*\(ไม่ได้ยืนยันส่งมอบลูกค้า\)/gi, '')
    .replace(/(?:;\s*)?ประเภทห้องและ Pending Handover เดิมไม่เปลี่ยน/gi, '')
    .replace(/(?:;\s*)?ประวัติส่งมอบลูกค้าแล้วคงเดิม/gi, '')
    .replace(/(?:;\s*)?ห้องไม่ร่วมโรงแรม\s*\/\s*Pending Handover เหมือนเดิม/gi, '')
    .replace(/(?:;\s*)?คง Pending Handover และไม่ร่วมโรงแรม/gi, '')
    .replace(/(?:;\s*)?ไม่กระทบสถานะส่งมอบ/gi, '')
    .replace(/\s+โดยคงประวัติ Pending Handover/gi, '')
    .replace(/;\s*;/g, '; ')
    .replace(/;\s*\./g, '.')
    .replace(/\.\s+\./g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .trim() || '-'
}
