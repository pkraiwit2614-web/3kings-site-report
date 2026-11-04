/** Above Condo Defect Report: display-only. Never write back to Defect Master/DB. */
export function compactNextAction(value: string | null | undefined): string {
  const original = (value || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
  if (!original) return '-'
  const cleaned = original
    .replace(/รับ\s+PDF\s+([AB]\d+)\s+Art House\s+Doc\.?\d+/gi, 'รับรายงาน Defect ห้อง $1')
    .replace(/\(\s*([^()]+?),\s*อนุมัติ Work Order[^)]*\)/gi, '($1)')
    .replace(/\s*\|\s*/g, '; ').replace(/\n+/g, '; ')
  const output: string[] = []
  for (const clause of cleaned.split(/;\s*|\.\s+(?=[\u0E00-\u0E7FA-Z#])/u)) {
    let s = clause.trim()
    if (!s) continue
    // Administrative duplicate-matching/HOLD/Work ID tracking has no place in next action.
    if (/ผูกตรวจเทียบกับ|รอเทียบงานเดิม|ไม่เปิดงานซ้ำ|ตรวจตำแหน่ง.*เทียบ\s*#\d+/i.test(s)) continue
    if (/^คง\s+\d+\s+งานเก่าที่ปิดแล้ว|^งานค้าง\s+(?:Doc|เอกสาร)|^keep\s|^user-confirmed|^\d+\s+pending\s*,/i.test(s)) continue
    if (/^(?:\d+\s+)?(?:เปิด|ติดตาม|ลง)\s+Work\s*ID.*$/i.test(s) && !/รอ(?:แก้|ตรวจ|เข้า|เก็บ)|นัด|ซ่อม/i.test(s)) continue
    if (/^\d+\s+Work\s*ID\s*ใหม่/i.test(s)) continue
    if (/^.*\bHOLD\b.*(?:รอเทียบ|ตรวจตำแหน่ง|ไม่เปิดงานซ้ำ)/i.test(s)) continue
    if (/^#?\d+(?:\/#?\d+)*\s+รายละเอียดไม่ชัด\s+HOLD/i.test(s)) continue

    s = s.replace(/ซึ่งใน\s+Doc\.?\s*\d+\s+ยังไม่มีเครื่องหมายถูก/gi, '')
      .replace(/จึงคงสถานะ\s*เพิ่งได้รับแจ้ง Defect\s*และ\s*Work ID[\s\S]*$/gi, '')
      .replace(/\([^)]*\bHOLD\b[^)]*\)/gi, '')
      .replace(/(?:\s*→\s*)?(?:เปิด|ลง|ติดตาม)\s+Work\s*ID(?:s)?\s*DF-[AB]\d+(?:-\d+)?(?:\.\.\d+|\s*ถึง\s*[-\d]+)?/gi, '')
      .replace(/(?:\d+\s*)?Work\s*ID(?:s)?\s*(?:ใหม่\s*)?DF-[AB]\d+(?:-\d+)?(?:\.\.\d+|\s*ถึง\s*[-\d]+)?/gi, '')
      .replace(/DF-[AB]\d+-\d+(?:\.\.\d+|\s*ถึง\s*[-\d]+)?/gi, '')
      .replace(/Doc(?:\.|\s+ID\.?)\s*\d+/gi, '')
      .replace(/\bPDF\b\s*(?=\s|$)/gi, '')
      .replace(/^(?:งาน|รายการ|จุด)\s*#?\d+(?:(?:\/|[-–])#?\d+)*\s*HOLD\s*/gi, '')
      .replace(/^#?\d+\s+HOLD\s*/gi, '')
      .replace(/^\d+\s+HOLD\s*/gi, '')
      .replace(/\bHOLD\s+(?=รอยืนยัน)/gi, '')
      .replace(/ประเภทห้องและ Pending Handover เดิมไม่เปลี่ยน/gi, '')
      .replace(/ประวัติส่งมอบลูกค้าแล้วคงเดิม/gi, '')
      .replace(/ห้องไม่ร่วมโรงแรม\s*\/\s*Pending Handover เหมือนเดิม/gi, '')
      .replace(/คง Pending Handover และไม่ร่วมโรงแรม/gi, '')
      .replace(/ไม่กระทบสถานะส่งมอบ/gi, '')
      .replace(/\s+โดยคงประวัติ Pending Handover/gi, '')
      .replace(/\s*\(ไม่เปลี่ยน Pending Handover\)/gi, '')
      .replace(/^\s*เปิด\s*$/gi, '')
      .replace(/\s*→\s*$/g, '')
      .replace(/\s*\(\s*\)/g, '')
      .replace(/\(\s+วันที่/gi, '(วันที่')
      .replace(/(\d+)\s+จุดวันที่/gi, '$1 จุด วันที่')
      .replace(/\s+/g, ' ').trim()
    s = s.replace(/^[,.:;\s–-]+|[,.:;\s–-]+$/g, '').trim()
    if (s) output.push(s)
  }
  return output.join('; ') || '-'
}
/** Keep exactly the pre-PR Work Detail summary for all rooms including Combine. */
export function siteOnlyWork(_source: string | null | undefined, summary: string | null | undefined): string {
  return summary || 'ไม่ระบุ'
}
export const siteOnlyNextAction = compactNextAction
