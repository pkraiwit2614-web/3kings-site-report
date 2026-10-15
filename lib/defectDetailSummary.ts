/** Display-only summary; never mutate the canonical Defect history. */
export type DefectDetailSummary = {work: string; dates: string; count: string}

function normalizedDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  const local = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(value)
  if (!iso && !local) return null
  let year = Number(iso ? iso[1] : local![3])
  const month = Number(iso ? iso[2] : local![2])
  const day = Number(iso ? iso[3] : local![1])
  // Thai short Buddhist years (e.g. 69=2569) and short Gregorian years (26=2026).
  if (year < 100) year += year >= 50 ? 1957 : 2000
  if (year >= 2400) year -= 543
  if (year < 2000 || year > 2099) return null
  const valid = new Date(Date.UTC(year, month - 1, day))
  if (valid.getUTCFullYear() !== year || valid.getUTCMonth() !== month - 1 || valid.getUTCDate() !== day) return null
  return String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')
}

function dateRange(description: string): string {
  const mentions = description.match(/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\b/g) || []
  const found = Array.from(new Set(mentions.map(normalizedDate).filter((v): v is string => !!v))).sort()
  const format = (iso: string) => iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4)
  if (found.length === 0) return 'ไม่ระบุ'
  if (found.length === 1) return format(found[0])
  return format(found[0])+' → '+format(found[found.length - 1])
}

function workCount(description: string): string {
  // Prefer explicit source count: do not assume semicolon phrases or image count equal job count.
  const explicit = description.match(/(?:ระบุ|รวม|จำนวน|#รายการ\s*)?\s*(\d{1,3})\s*รายการ(?:งาน|\b|\.|\s)/)
  if (explicit && Number(explicit[1]) > 0) return String(Number(explicit[1]))+' รายการ'
  const numbered = [...description.matchAll(/\[(\d{1,3})\]/g)].map(m=>Number(m[1]))
  const unique = [...new Set(numbered)].sort((a,b)=>a-b)
  if (unique.length && unique[0] === 1 && unique.every((n,i)=>n===i+1)) return String(unique.length)+' รายการ'
  return 'ไม่ระบุ'
}

function workSummary(description: string): string {
  // Only the original defect inventory belongs under "งานทั้งหมด".
  // Follow-up/history entries document progress, not additional work items by default.
  const normalized = description.replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
  const history = normalized.search(/\n\s*(?:\[(?:อัพเดท|อัปเดต|ยืนยัน|ผู้ใช้ยืนยัน|Updated|Update|Hotel follow-up)|\d{1,2}\/\d{1,2}\/\d{2,4}\s*[—–-]\s*ปิดรอบ Defect)/i)
  const original = (history >= 0 ? normalized.slice(0, history) : normalized)
    .split(/\s+\|\s+(?=ผู้ใช้ยืนยัน|Updated|Update|Hotel follow-up|Previous|การแจ้ง)/i)[0]

  const caption = original.match(/ข้อความกำกับที่อ่านได้\s*[:：]\s*/)
  let text = caption ? original.slice((caption.index || 0) + caption[0].length) : original
  text = text
    .replace(/^\s*Hotel\s+list\s+ล่าสุด\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*[:：]\s*/i, '')
    .replace(/\.\s*หลักฐานเสริม\s+(?:doc|เอกสาร)\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*[:：]\s*/gi, '; ')
    .replace(/\s*(?:ภาพประกอบบางรายการ|ภาพประกอบที่ไม่มีคำกำกับ|ใหม่กว่า\s*update|เอกสารระบุ\s*#?รายการ).*$/is, '')
    .trim()
  if (!caption && /^(?:Hotel PDF|โรงแรมแจ้ง|User update|Updated|Update|ผู้ใช้ยืนยัน)\b/i.test(text)) {
    return 'ไม่ระบุรายการงานที่ยืนยัน'
  }
  // Preserve the order and even repeated source items (multiple defects of the same type).
  // Join individual semicolon/newline-delimited jobs with a consistent comma delimiter.
  const jobs = text.split(/[;\n]+/).map(part=>part
    .replace(/\s*[—–-]\s*(?:แก้ไขแล้ว|เสร็จแล้ว|Target|รอ Hotel Engineer|ปิดรอบ Defect).*$/i, '')
    .replace(/\s*(?:รอ Hotel Engineer ตรวจ|ผู้ใช้ยืนยัน|Update|ล่าสุด).*$/i, '')
    .trim().replace(/[.;|,\s]+$/,'')
  ).filter(part=>part && !/^(?:รอ Hotel Engineer ตรวจ|ปิดรอบ Defect)/i.test(part))
  return jobs.length ? jobs.join(', ') : 'ไม่ระบุรายการงานที่ยืนยัน'
}

/** Only first and latest dated notes appear, even after many updates. */
export function summarizeDefectDetail(description: string | null | undefined): DefectDetailSummary {
  if (!description?.trim()) return {work:'ไม่ระบุ', dates:'ไม่ระบุ', count:'ไม่ระบุ'}
  return {work:workSummary(description), dates:dateRange(description), count:workCount(description)}
}
