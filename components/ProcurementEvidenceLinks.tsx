import {
  associatedProcurementPlNumbers,
  matchingProcurementEvidence,
  procurementAttachedEvidence,
  procurementDriveFileUrl,
  procurementNumberType,
  type ProcurementEvidenceRow,
} from '@/lib/procurementEvidence'

type Props = {
  prNo?: string | null
  poNo?: string | null
  itemName?: string | null
  conditionNote?: string | null
  evidenceRows: readonly ProcurementEvidenceRow[]
}

const documentLabels = { PR: 'ใบขอซื้อ', PO: 'ใบสั่งซื้อ', PL: 'ใบสั่งจ้าง' } as const

/** Exact signed documents and original attached evidence; no source data writes. */
export default function ProcurementEvidenceLinks({
  prNo, poNo, itemName, conditionNote, evidenceRows,
}: Props) {
  const numbers: [string, 'pr' | 'po'][] = [
    [String(prNo || '').trim(), 'pr'],
    [String(poNo || '').trim(), 'po'],
  ].filter(([number]) => Boolean(number)) as [string, 'pr' | 'po'][]

  for (const number of associatedProcurementPlNumbers(itemName, conditionNote)) {
    if (numbers.some(([existing]) => existing.toUpperCase() === number)) continue
    if (matchingProcurementEvidence(evidenceRows, number, 'po')
      .some(row => row.evidence_scope === 'individual')) numbers.push([number, 'po'])
  }

  const linkedFiles = new Set<string>()
  const embedded = procurementAttachedEvidence(conditionNote)
  const attachments = embedded.filter(item => !evidenceRows.some(row =>
    row.drive_file_id === item.fileId && numbers.some(([number, column]) =>
      matchingProcurementEvidence([row], number, column).length > 0
    )
  ))

  if (!numbers.length && !attachments.length) return <span className="muted">-</span>
  return <span style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:5}}>
    {numbers.map(([number, column]) => {
      const type = procurementNumberType(number, column)
      const matches = matchingProcurementEvidence(evidenceRows, number, column)
      return <span key={column + number} style={{display:'flex',flexWrap:'wrap',gap:5,alignItems:'baseline'}}>
        {matches.length ? matches.map(item => {
          const url = procurementDriveFileUrl(item.drive_file_id)
          if (!url || linkedFiles.has(item.drive_file_id)) return null
          linkedFiles.add(item.drive_file_id)
          const label = item.evidence_scope === 'bundle'
            ? 'ZIP รวม'
            : documentLabels[type] + ' ' + number
          return <a key={item.drive_file_id} href={url} target="_blank" rel="noopener noreferrer"
            title={item.evidence_scope === 'bundle'
              ? 'เปิด ZIP รวม ตรวจเลข ' + number + ' ภายใน ZIP ก่อนใช้งาน'
              : 'เปิด' + documentLabels[type] + ' ' + number + ': ' + item.file_name}
            style={{textDecoration:'underline',textUnderlineOffset:3}}>
            {label}
          </a>
        }) : <><b>{type} {number}</b><small className="muted">· รอหลักฐาน</small></>}
      </span>
    })}
    {attachments.filter(item => !linkedFiles.has(item.fileId)).map(item =>
      <a key={item.fileId} href={item.url} target="_blank" rel="noopener noreferrer"
        title={item.folder ? 'เปิดโฟลเดอร์หลักฐานใน Drive' : 'เปิดเอกสารหลักฐานต้นฉบับใน Drive'}
        style={{textDecoration:'underline',textUnderlineOffset:3}}>
        {item.label}
      </a>
    )}
  </span>
}
