/**
 * Read-only, exact-number evidence references.
 * All Drive file IDs come from an authenticated, RLS-protected Supabase row.
 * NEVER commit actual private Drive file IDs to this public repository.
 */
export type ProcurementDocumentType = 'PR' | 'PO' | 'PL'

export type ProcurementEvidenceRow = {
  document_type: ProcurementDocumentType
  document_no: string
  drive_file_id: string
  file_name: string
  file_format: string
  evidence_scope: 'individual' | 'bundle'
}

export function procurementNumberType(
  number: string,
  column: 'pr' | 'po'
): ProcurementDocumentType {
  if(column==='pr')return 'PR'
  return /^PL[0-9]+/i.test(number.trim())?'PL':'PO'
}

export function matchingProcurementEvidence(
  evidenceRows: readonly ProcurementEvidenceRow[],
  number: string,
  column: 'pr' | 'po'
): ProcurementEvidenceRow[] {
  const lookup=number.trim().toUpperCase()
  const type=procurementNumberType(number,column)
  if(!lookup)return []
  return evidenceRows.filter(row=>row.document_type===type &&
    row.document_no.trim().toUpperCase()===lookup)
}

export function procurementDriveFileUrl(fileId:string):string|null {
  if(!/^[a-zA-Z0-9_-]{12,}$/.test(fileId))return null
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
}


/** Read existing Drive evidence URLs in purchasing notes without changing Master data. */
export type ProcurementAttachedEvidence = { fileId: string; url: string; label: string; folder: boolean }

export function procurementAttachedEvidence(note: string | null | undefined): ProcurementAttachedEvidence[] {
  const source = String(note || '')
  const pattern = /https:\/\/drive\.google\.com\/(?:file\/d\/([a-zA-Z0-9_-]{12,})(?:\/view)?|drive\/folders\/([a-zA-Z0-9_-]{12,}))(?:\?[^ \s•)\];]+)?/g
  const evidence: ProcurementAttachedEvidence[] = []
  const seen = new Set<string>()
  for (const match of source.matchAll(pattern)) {
    const fileId = match[1] || match[2]
    if (!fileId || seen.has(fileId)) continue
    seen.add(fileId)
    const folder = Boolean(match[2])
    const context = source.slice(Math.max(0, (match.index || 0) - 160), match.index)
      .split(/[•|\n\r;]/).pop()?.trim() || ''
    let label = 'หลักฐานแนบ'
    if (folder) label = 'โฟลเดอร์หลักฐาน'
    else if (/Express\s*(?:PL|PO)/i.test(context)) label = 'ไฟล์รวม Express PO/PL'
    else if (/Express\s*(?:PR|PC)/i.test(context)) label = 'ไฟล์รวม Express PR/PC'
    else if (/Payment\s*Advice|หลักฐานโอน/i.test(context)) label = 'Payment Advice (รอตรวจการจับคู่)'
    else if (/ใบเสนอราคา|(?:^|[\s/])QT(?:\b|\/)|Quotation|Scope/i.test(context)) label = 'ใบเสนอราคา / ขอบเขตงาน'
    else if (/PC\s*signed|ใบขออนุมัติ|PC\s*form/i.test(context)) label = 'ใบขออนุมัติ'
    else if (/IMG_|ภาพ|รูป/i.test(context)) label = 'ภาพหลักฐาน'
    else if (/ZIP|ไฟล์รวม/i.test(context)) label = 'ZIP รวม'
    evidence.push({
      fileId,
      url: folder
        ? 'https://drive.google.com/drive/folders/' + encodeURIComponent(fileId)
        : procurementDriveFileUrl(fileId)!,
      label,
      folder,
    })
  }
  return evidence
}

/**
 * Only associate registered signed PL PDFs with unequivocal references in the
 * same item. "แยกจาก PL..." means another contract and must never match.
 */
export function associatedProcurementPlNumbers(
  itemName: string | null | undefined,
  note: string | null | undefined,
): string[] {
  const matches = new Set<string>()
  const titlePL = [...String(itemName || '').matchAll(/\bPL\d{7}\b/gi)].map(m => m[0].toUpperCase())
  if (new Set(titlePL).size === 1) matches.add(titlePL[0])
  const sections = String(note || '').split(/[•|\r\n]/)
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const found = [...section.matchAll(/\bPL\d{7}\b/gi)]
    if (found.length !== 1) continue
    const hit = found[0]
    const prefix = section.slice(0, hit.index || 0)
    const suffix = section.slice((hit.index || 0) + hit[0].length)
    if (/แยกจาก|ต่างจาก|คนละ|ไม่รวม|ไม่ซ้ำ|เปรียบเทียบ|ก่อนหน้า|แทนที่|งานเดิม/i.test(prefix)) continue
    const affirmative = /^\s*(?:ใน\s*Express|ออกจริงแล้ว|ได้รับอนุมัติ|ลงนาม|อนุมัติ|ออกเอกสาร)/i.test(suffix)
    const firstSection = i === 0 && /(?:\bPC\d{9}\b|\bPL\d{7}\b|ใบสั่งจ้าง)/i.test(section) &&
      !/แยกจาก|คนละ|ก่อนหน้า|เทียบกับ|ไม่ใช่|เดิม/i.test(section)
    if (affirmative || firstSection) matches.add(hit[0].toUpperCase())
  }
  return matches.size === 1 ? [...matches] : []
}
