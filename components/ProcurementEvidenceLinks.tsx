import {
  matchingProcurementEvidence,
  procurementDriveFileUrl,
  procurementNumberType,
  type ProcurementEvidenceRow,
} from '@/lib/procurementEvidence'

type Props={
  prNo?:string|null
  poNo?:string|null
  evidenceRows:readonly ProcurementEvidenceRow[]
}

/**
 * Documents are links only when a verified record has an exact document number.
 * A ZIP bundle is clearly labelled and is NOT claimed to be a single signed PDF.
 * Missing/ambiguous evidence remains unlinked.
 */
export default function ProcurementEvidenceLinks({prNo,poNo,evidenceRows}:Props) {
  const numbers:[string,'pr'|'po'][]=[
    [String(prNo||'').trim(),'pr'],
    [String(poNo||'').trim(),'po'],
  ].filter(([number])=>Boolean(number)) as [string,'pr'|'po'][]
  if(!numbers.length)return <span className="muted">-</span>

  return <span style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4}}>
    {numbers.map(([number,column])=>{
      const type=procurementNumberType(number,column)
      const matches=matchingProcurementEvidence(evidenceRows,number,column)
      const label=`${type} ${number}`
      return <span key={column+number} style={{display:'inline-flex',flexWrap:'wrap',gap:5,alignItems:'baseline'}}>
        <b>{label}</b>
        {matches.length?matches.map(item=>{
          const url=procurementDriveFileUrl(item.drive_file_id)
          if(!url)return null
          return <a key={item.drive_file_id} href={url} target="_blank" rel="noopener noreferrer"
            title={item.evidence_scope==='bundle'
              ?`เปิด ZIP ชุดเอกสาร ตรวจเลข ${number} ภายใน ZIP ก่อนใช้งาน`
              :`เปิดหลักฐาน ${number}: ${item.file_name}`}
            style={{textDecoration:'underline',textUnderlineOffset:3}}
          >↗ {item.evidence_scope==='bundle'?'ZIP รวม':item.file_format.toUpperCase()}</a>
        }):<small className="muted" style={{display:'inline'}}>· รอหลักฐาน</small>}
      </span>
    })}
  </span>
}
