/** Presentation-only formatter for Above Condo Defect Report. Never edits canonical data. */
export function compactNextAction(value: string | null | undefined): string {
  const original = (value || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
  if (!original) return '-'
  const parts = original.split(/[;\n|]+/).map(part => {
    let s = part.trim()
    if (!s) return ''
    if (/ผูกตรวจเทียบกับ|HOLD\s*รอเทียบงานเดิม|รอเทียบงานเดิม|ไม่เปิดงานซ้ำ/i.test(s)) return ''
    if (/^(?:ติดตาม|เปิด|ลง|ผูก|คง|อนุมัติ)?\s*(?:\d+\s*)?Work\s*ID/i.test(s) && !/รอ(?:แก้|ตรวจ|เข้าทำ|เก็บ)|นัด|ซ่อม/i.test(s)) return ''
    if (/^คง\s+\d+\s+งานเก่าที่ปิดแล้ว|^งานค้าง\s+Doc\./i.test(s)) return ''
    s = s.replace(/\([^)]*\bHOLD\b[^)]*\)/gi, '')
      .replace(/\b(?:PDF\s*)?Doc\.?\s*\d+\b/gi, '')
      .replace(/(?:ติดตาม|เปิด|ลง)\s*Work\s*ID(?:s)?\s*DF-[AB]\d+(?:-\d+)?(?:\.\.[\d-]+|\s*ถึง\s*\d+)?/gi, '')
      .replace(/\b(?:\d+\s*)?Work\s*ID(?:s)?\s*(?:ใหม่\s*)?DF-[AB]\d+(?:-\d+)?(?:\.\.[\d-]+|\s*ถึง\s*\d+)?/gi, '')
      .replace(/\bDF-[AB]\d+-\d+(?:\.\.[\d-]+|\s*ถึง\s*[-\d]+)?/gi, '')
      .replace(/(?:รายการ|งาน|จุด)\s*#?\d+(?:\s*[-–]\s*#?\d+)?\s*HOLD\s*/gi, '')
      .replace(/\bHOLD\s*(?=รอ)/gi, '')
      .replace(/\s*\(ไม่เปลี่ยน Pending Handover\)/gi, '')
      .replace(/(?:;\s*)?ประเภทห้องและ Pending Handover เดิมไม่เปลี่ยน/gi, '')
      .replace(/(?:;\s*)?ประวัติส่งมอบลูกค้าแล้วคงเดิม/gi, '')
      .replace(/\s+โดยคงประวัติ Pending Handover/gi, '')
      .replace(/\s*ห้องไม่ร่วมโรงแรม\s*\/\s*Pending Handover เหมือนเดิม/gi, '')
      .replace(/\s*คง Pending Handover และไม่ร่วมโรงแรม/gi, '')
      .replace(/\s*ไม่กระทบสถานะส่งมอบ/gi, '')
      .replace(/\s+/g, ' ').trim()
    return s.replace(/^[\s,.:(\-–]+|[\s,.:(\-–]+$/g, '')
  }).filter(Boolean)
  return parts.join('; ') || '-'
}
/** Preserve the original detail summary in the Work Details column. */
export function siteOnlyWork(_source: string | null | undefined, summary: string | null | undefined): string {
  return summary || 'ไม่ระบุ'
}
export const siteOnlyNextAction = compactNextAction
