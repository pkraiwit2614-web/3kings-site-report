/**
 * Above Condo Defect Report presentation ONLY.
 * Keep raw defect_detail, next_action and follow_up intact for sync/history/search.
 * Never infer that a defect is complete or a room has been handed over.
 */
function normalizeReportText(value: string | null | undefined): string {
  return (value || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
}

const workUnavailable = /^(?:ไม่ระบุรายการงานที่ยืนยัน|รายการย่อยยังไม่ระบุ|ไม่ระบุ)$/i

/**
 * Show physical work items without source-document headings or audit commentary.
 * The existing summary still controls ordinary descriptions; only clear wrappers
 * are removed. Multi-line numbered items are taken straight from the source.
 */
export function siteOnlyWork(rawText: string | null | undefined, legacySummary: string | null | undefined): string {
  const raw = normalizeReportText(rawText)
  if (!raw) return '—'
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean)
  const numbered = lines.filter(line => /^#0*\d{1,3}(?=\s|[.:[\]-]|$)/.test(line))
  if (numbered.length >= 2) {
    return numbered.map(line => line
      .replace(/\s*;\s*(?:แจ้งเดิม|มีเครื่องหมายถูก|ยังไม่มีหลักฐาน|หมายเหตุ|สถานะ|คงสถานะ|เอกสาร)[^\n]*$/i, '')
      .replace(/\s*[—–-]\s*(?:แจ้งเดิม|แก้ไขแล้ว|มีเครื่องหมายถูก|รอยืนยันหลักฐาน)[^\n]*$/i, '')
      .trim()).filter(Boolean).join('\n') || '—'
  }

  const first = lines[0] || ''
  // A defect first reported in an update note is still a real job, not metadata.
  if (/^\[(?:อัปเดต|อัพเดท|รับแจ้ง)\s/i.test(first)) {
    const marker = /(?:ได้รับแจ้ง\s+Defect\s+ใหม่[^:：]*|งานค้างจริง)\s*[:：]\s*/i.exec(first)
    if (marker && marker.index !== undefined) {
      const work = first.slice(marker.index + marker[0].length)
        .split(/\s*;\s*(?=รวมสถานะ|เป็นห้อง Combine|คงสถานะ|รอหลักฐาน|ประวัติ)/i)[0].trim()
      if (work && !workUnavailable.test(work)) return work
    }
  }

  let work = normalizeReportText(legacySummary)
  // The old summary may include administrative lines after the physical first line.
  if (/ผู้รับเหมา\s*:|ผู้ติดตาม\s*:|หมายเหตุ\s*:|สถานะ\s*:/i.test(work)) work = first
  work = work
    .replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*[—–-]\s*รายการ Defect แจ้งผ่านแชต\s*[:：]\s*/i, '')
    .replace(/^\s*(?:รายการ Defect แจ้งผ่านแชต|Defect ใหม่\s+\d{1,2}\/\d{1,2}\/\d{2,4})\s*[:：]\s*/i, '')
    .replace(/\s*(?:ภาพประกอบบางรายการ|ภาพประกอบที่ไม่มีคำกำกับ|มีภาพประกอบ\s+\d+\s+รายการไม่มีข้อความกำกับ|หมายเหตุ\s*:\s*ยังไม่มีวันรับแจ้ง)[\s\S]*$/i, '')
    .replace(/\s*\|\s*(?:ผู้ใช้ยืนยัน|Updated|Update|Hotel follow-up|ประวัติ)[\s\S]*$/i, '')
    .trim()
  if (!work || workUnavailable.test(work) || /^เข้าเก็บ\s+Defect\s+วันนี้\b/i.test(work)) return '—'
  return work
}

const auditOnly = /^(?:ผู้ใช้ยืนยัน|Hotel Engineer ตรวจแล้ว|โรงแรมตรวจครบแล้ว|Defect ทุกงานเสร็จ|Defect ทุกงานซ่อมเสร็จ|ปิดงาน\/พร้อมคืนพื้นที่|ปิดสถานะ|คงสถานะ|ประเภทห้อง|ประวัติ|ไม่มีการแก้สถานะ|ไม่กระทบสถานะ|แผน Clean|เครื่องหมายถูก|วันที่|ไม่ต้องติดตาม|ไม่ต้องตาม Hotel Defect)/i
const metadataFirst = /^(?:รับแจ้ง|รับ PDF|บันทึก Defect ใหม่|เอกสาร Defect|เปิด Work ID|Work ID\b|Defect เพิ่งได้รับแจ้ง|มีใบขอจ้าง|Defect สีซ่อมเสร็จแล้ว|Defect ทุกงานเสร็จ|Defect ใหม่|[AB]\d{3}\s+รายงาน Defect)/i
const actionable = /^(?:รอ|ติดตาม|นัด|นัด\/ตาม|ตรวจ|แก้|เก็บ|รวบรวม|ประสาน|เข้าทำ|ทำความสะอาด|ซ่อม|รื้อ|ต้องรื้อ|เหลือ|ยังมี|แยกทีม)/i
const embeddedAction = /(?:รอ(?:อนุมัติ|ยืนยัน|แก้ไข|เก็บ|เข้า|ตรวจ|ลูกค้า|ขอ|จัด|ทำ|ซ่อม|นัด|การ)|ติดตาม|นัด(?:\/ตาม)?|ต้องรื้อ|รวบรวม)/i

/** Only next site tasks; reporting/audit/status sentences are never displayed. */
export function siteOnlyNextAction(nextAction: string | null | undefined): string {
  const raw = normalizeReportText(nextAction)
  if (!raw) return '—'
  const output: string[] = []
  for (const piece of raw.split(/[;\n]+/)) {
    let action = piece.trim()
      .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*[:：]\s*/, '')
      .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s+/, '')
    if (!action) continue
    if (auditOnly.test(action)) continue

    if (metadataFirst.test(action) || /^(?:เข้าตรวจสอบแล้ว|รายงาน Defect)/i.test(action)) {
      const match = embeddedAction.exec(action)
      if (!match || match.index === undefined) continue
      action = action.slice(match.index)
    } else if (/^(?:ยังไม่ปิดงาน|ยังไม่ยืนยัน|ยังไม่มีหลักฐาน|ไม่ได้ยืนยัน|ได้รับแจ้ง)/i.test(action)) {
      continue
    } else if (!actionable.test(action)) {
      const match = /(?:ต้องรื้อ|รออนุมัติ|รอยืนยัน|ติดตามงาน|นัดลูกค้า)/i.exec(action)
      if (!match || match.index === undefined) continue
      action = action.slice(match.index)
    }

    action = action
      .replace(/\s*\((?:ไม่เปลี่ยน|คงสถานะ|ไม่ได้ยืนยัน|เฉพาะสถานะ|ยังไม่ยืนยัน|RSE แจ้ง|ไม่มีหลักฐาน)[^)]*\)/gi, '')
      .replace(/\s+ตาม\s+PDF\s+[AB]\d+\b/gi, '')
      .replace(/\s+(?:โดยคง|และคงสถานะ|แต่คงสถานะ|ไม่กระทบสถานะ|คงสถานะ)[\s\S]*$/i, '')
      .trim().replace(/[.;,\s]+$/, '')
    if (!action || auditOnly.test(action) || output.includes(action)) continue
    output.push(action)
  }
  return output.length ? output.join('; ') : '—'
}
