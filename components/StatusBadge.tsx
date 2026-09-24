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
  pending:'รอดำเนินการ',
  needs_fix:'รอแก้ไข',
  on_track:'ตามแผน',
  at_risk:'เสี่ยงล่าช้า',
  ordered:'✓ สั่งแล้ว',
  not_ordered:'! ยังไม่สั่ง'
}

const aliases: Record<string,string> = {
  'ยังไม่เริ่ม':'not_started',
  'กำลังดำเนินการ':'in_progress',
  'รอตรวจ':'awaiting_inspection',
  'ติดปัญหา/อุปสรรค':'blocked',
  'ล่าช้า':'delayed',
  'ผ่าน/เสร็จ':'completed',
  'เสร็จแล้ว':'completed',
  'พักงาน':'on_hold',
  'ส่งรายงานแล้ว':'submitted',
  'แบบร่าง':'draft',
  'อนุมัติแล้ว':'approved',
  'รอดำเนินการ':'pending',
  'รอแก้ไข':'needs_fix',
  'on track':'on_track',
  'at risk':'at_risk',
  'ตามแผน':'on_track',
  'เสี่ยงล่าช้า':'at_risk',
  'สั่งแล้ว':'ordered',
  'ยังไม่สั่ง':'not_ordered'
}

const kinds: Record<string,string> = {
  not_started:'neutral',
  in_progress:'info',
  awaiting_inspection:'warn',
  blocked:'bad',
  delayed:'bad',
  completed:'good',
  on_hold:'warn',
  submitted:'info',
  draft:'neutral',
  approved:'good',
  pending:'warn',
  needs_fix:'warn',
  on_track:'good',
  at_risk:'warn',
  ordered:'good',
  not_ordered:'bad'
}

const procurementStyles: Record<string,{background:string;color:string;borderColor:string}> = {
  'รอส่งสินค้า': {background:'#e8f2ff',color:'#155f9c',borderColor:'#a9cce9'},
  'นัดเข้าหน้างาน': {background:'#f1e9ff',color:'#6941a5',borderColor:'#cab6ec'},
  'มีสินค้าพร้อมส่ง': {background:'#e8f7ed',color:'#217044',borderColor:'#a8d8b7'},
  'รอผลิต/จัดส่ง': {background:'#fff3d9',color:'#8b5d00',borderColor:'#e9c96f'}
}

export default function StatusBadge({ value }: { value?: string | null }) {
  const clean = `${value || 'ยังไม่ระบุ'}`.trim().replace(/\s+/g,' ')
  const lookup = clean.toLowerCase()
  const canonical = aliases[lookup] || lookup
  const s = labels[canonical] || clean
  let kind = kinds[canonical] || 'neutral'

  if (!kinds[canonical]) {
    if (s.includes('เสร็จ') || s.includes('ผ่าน') || s.includes('อนุมัติ')) kind = 'good'
    else if (s.includes('ล่าช้า')) kind = 'bad'
    else if (s.includes('พัก') || s.includes('ติด') || s.includes('แก้ไข')) kind = 'warn'
    else if (s.includes('กำลัง') || s.includes('รอตรวจ')) kind = 'info'
  }

  const procurementStyle = procurementStyles[clean]
  return <span className={`badge ${kind}`} style={{width:124,height:28,justifyContent:'center',alignItems:'center',padding:'0 9px',lineHeight:1,flex:'0 0 124px',...(procurementStyle||{})}}>{s}</span>
}
