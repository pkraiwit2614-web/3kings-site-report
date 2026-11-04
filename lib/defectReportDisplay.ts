/** Above Condo Defect Report next-action presentation only. Never write to source data. */
export function compactNextAction(value: string | null | undefined): string {
  const original = (value || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
  if (!original) return '-'
  const doc = String.raw`Doc\.?\s*(?:ID\.?\s*)?\d+`
  const work = String.raw`DF-[AB]\d+-\d+[A-Z]?(?:(?:\.\.|\s*ถึง\s*)(?:DF-[AB]\d+-|-)?\d+[A-Z]?)?`
  const result: string[] = []
  // Delimit clauses, not words. Dots inside names, identifiers and URLs are preserved.
  for (const part of original.split(/\s*[;|\n]+\s*|\.\s+(?=[\u0E00-\u0E7F]|DF-[AB]\d)/u)) {
    let text = part
      .replace(new RegExp(String.raw`เชื่อม Work Order\s+${work}\s+เพื่อป้องกันรายการซ้ำ`, 'gi'), '')
      .replace(/Sync สำเร็จ|ฐานข้อมูลอัปเดตแล้ว/gi, '')
      .replace(/ซึ่งใน\s+Doc\.?\s*\d+\s+ยังไม่มีเครื่องหมายถูก/gi, '')
      // Exact administrative forms only; never discard a clause merely for containing HOLD.
      .replace(new RegExp(String.raw`(?:จุดลามิเนต\s*#\d+\s+)?ผูกตรวจเทียบกับ\s+${work}\s*(?:เดิม)?\s*(?:\(HOLD ไม่เปิดงานซ้ำ\))?`, 'gi'), '')
      .replace(/(?:รายการ\s*#?\d+\s*)?HOLD\s+รอเทียบงานเดิม/gi, '')
      .replace(/คง\s+\d+\s+งานเก่าที่ปิดแล้ว\s*\([\d,\s]+\)(?:,\s*งานค้าง\s+Doc\.?\d+(?:\s+และ\s+MEP\s+Doc\.?\d+)?)?/gi, '')
      .replace(/,\s*อนุมัติ Work Order\s+\d+\s+รายการ\s+DF-[AB]\d+-\d+\.\.\d+\s+ส่วนที่เหลือ\s+\d+\s+จุด\s+HOLD/gi, '')
      .replace(/(?:\d{2}\/\d{2}\/\d{4}:\s*)?user-confirmed new Defect status/gi, '')
      .replace(/keep\s+Doc\.?\d+\s+received\s+\d{2}\/\d{2}\/\d{4}/gi, '')
      .replace(/\d+\s+pending,\s*\d+\s+HOLD trade\.?/gi, '')
      .replace(new RegExp(String.raw`(?:\d+\s+)?(?:(?:เปิด|ลง|ติดตาม)\s+)?Work\s*IDs?\s*(?:ใหม่\s*)?${work}`, 'gi'), '')
      .replace(new RegExp(work, 'gi'), '')
      .replace(new RegExp(doc, 'gi'), '')
      .replace(/จึงคงสถานะ\s*เพิ่งได้รับแจ้ง Defect\s*และ\s*(?:โดยไม่สร้างซ้ำ)?/gi, '')
      .replace(/ประเภทห้องและ Pending Handover เดิมไม่เปลี่ยน|ประวัติส่งมอบลูกค้าแล้วคงเดิม|ห้องไม่ร่วมโรงแรม\s*\/\s*Pending Handover เหมือนเดิม|คง Pending Handover และไม่ร่วมโรงแรม|ไม่กระทบสถานะส่งมอบ/gi, '')
      .replace(/\s*โดยคงประวัติ Pending Handover|\(ไม่เปลี่ยน Pending Handover\)/gi, '')
      // Cleanup only punctuation left by deletion, with no substitute prose.
      .replace(/\(\s*\)/g, '')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.:;→–-]+|[\s,.:;→–-]+$/g, '').trim()
    if (text) result.push(text)
  }
  return result.join('; ') || '-'
}
export const siteOnlyNextAction = compactNextAction
