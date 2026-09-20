export default function StatusBadge({ value }: { value?: string | null }) {
  const s = value || 'ยังไม่ระบุ'; const lower = s.toLowerCase()
  let kind = 'neutral'
  if (s.includes('เสร็จ') || s.includes('ผ่าน') || lower.includes('completed')) kind = 'good'
  else if (s.includes('ล่าช้า') || lower.includes('delayed')) kind = 'bad'
  else if (s.includes('พัก') || s.includes('ติด') || lower.includes('blocked')) kind = 'warn'
  else if (s.includes('กำลัง') || lower.includes('progress')) kind = 'info'
  return <span className={`badge ${kind}`}>{s}</span>
}
