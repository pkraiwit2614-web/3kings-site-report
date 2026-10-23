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
