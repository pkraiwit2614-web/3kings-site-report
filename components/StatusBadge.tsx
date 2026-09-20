const labels: Record<string,string> = {
  not_started:'ยังไม่เริ่ม',
  in_progress:'กำลังดำเนินการ',
  awaiting_inspection:'รอตรวจ',
  blocked:'ติดปัญหา/อุปสรรค',
  delayed:'ล่าช้า',
  completed:'เสร็จแล้ว',
  on_hold:'พักงาน',
  submitted:'ส่งรายงานแล้ว',
  draft:'แบบร่าง',
  approved:'อนุมัติแล้ว',
  pending:'รอดำเนินการ'
}

export default function StatusBadge({ value }: { value?: string | null }) {
  const raw = value || 'ยังไม่ระบุ'
  const key = raw.toLowerCase().trim()
  const s = labels[key] || raw
  const lower = key
  let kind = 'neutral'
  if (s.includes('เสร็จ') || s.includes('ผ่าน') || s.includes('อนุมัติ') || lower.includes('completed')) kind = 'good'
  else if (s.includes('ล่าช้า') || lower.includes('delayed')) kind = 'bad'
  else if (s.includes('พัก') || s.includes('ติด') || lower.includes('blocked')) kind = 'warn'
  else if (s.includes('กำลัง') || s.includes('รอตรวจ') || lower.includes('progress')) kind = 'info'
  return <span className={`badge ${kind}`}>{s}</span>
}
