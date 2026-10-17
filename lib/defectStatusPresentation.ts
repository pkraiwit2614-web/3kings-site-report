/** Shared Defect Report status display. Presentation only: never change source status values. */
export type DefectStatusView={
  status_group:string|null
  current_status:string|null
  hotel_participation:string|null
}

export function statusTone(r:DefectStatusView):'danger'|'warn'|'good'|'neutral'{
  if(r.status_group==='Hotel - Incomplete')return 'danger'
  if(r.status_group==='Hotel - Awaiting Check'||r.status_group==='Non-Hotel - Pending Handover')return 'warn'
  if(r.status_group==='Hotel - Checked Complete')return r.hotel_participation==='ไม่ร่วมโรงแรม'?'warn':'good'
  if(r.status_group==='Non-Hotel - Handover Complete')return 'good'
  return 'neutral'
}

export const DEFECT_AWAITING_ACCEPTANCE_LABEL='Defect เสร็จแล้ว • รอลูกค้า / Hotel ตรวจรับ'

export function statusLabel(r:DefectStatusView):string{
  if(r.status_group==='Hotel - Incomplete')return 'เพิ่งได้รับแจ้ง Defect'
  if(r.status_group==='Hotel - Awaiting Check')return DEFECT_AWAITING_ACCEPTANCE_LABEL
  if(r.status_group==='Hotel - Checked Complete')return r.hotel_participation==='ไม่ร่วมโรงแรม'?DEFECT_AWAITING_ACCEPTANCE_LABEL:'Hotel Engineer ตรวจแล้ว'
  if(r.status_group==='Non-Hotel - Pending Handover')return DEFECT_AWAITING_ACCEPTANCE_LABEL
  if(r.status_group==='Non-Hotel - Handover Complete')return 'ลูกค้าตรวจรับเรียบร้อยแล้ว'
  if(r.status_group==='Non-Hotel - Awaiting Sale')return 'Awaiting Sale'
  return r.current_status||'—'
}
