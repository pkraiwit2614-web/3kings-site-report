'use client'
import {useEffect,useState} from 'react'
import {getSupabase} from '@/lib/supabase'
import {applyPermissionSnapshot,loadPermissions} from '@/lib/permissionClient'
import {moduleForPath,canEditHotel,canEditWorkPlan,type PermissionSnapshot,type PermissionRow} from '@/lib/accessControl'
import {
  canAccessPath,
  canEditCalendar,
  canEditDefect,
  canEditProcurement,
  canEditSchedule,
  canEditSiteOperations,
  canManageLabour,
  canManageMaterialsTools,
  type AccessRole,
} from '@/lib/accessControl'
import {ROLE_PREVIEW_LABELS} from '@/lib/rolePreview'

type PermissionLevel = 'manage' | 'view' | 'none'
type PermissionSection = {
  label: string
  path: string
  canManage?: (role: AccessRole) => boolean
  ownerManaged?: boolean
  readOnly?: boolean
}

// Defaults are derived from the existing helpers; edits are persisted by the owner-only RPC.
export const MATRIX_ROLES: readonly AccessRole[] = [
  'owner', 'admin', 'viewer', 'viewer_editor',
  'purchase', 'defect_contributor', 'defect_editor',
]

export const MATRIX_SECTIONS: readonly PermissionSection[] = [
  {label: 'Dashboard', path: '/', ownerManaged: true},
  {label: 'Executive Presentation', path: '/presentation', ownerManaged: true},
  {label: 'Schedule / Plan vs Actual', path: '/schedule', canManage: canEditSchedule},
  {label: 'Site Operations', path: '/reports', canManage: canEditSiteOperations},
  {label: 'Defect Report / Flow', path: '/defect-flow', canManage: canEditDefect},
  {label: 'Hotel Work Plan', path: '/hotel-work-plan', canManage: canEditWorkPlan},
  {label: 'Room Status | OOO/OOS', path: '/hotel-room-status',
    canManage: canEditHotel},
  {label: 'วัสดุ / เครื่องมือ', path: '/materials', canManage: canManageMaterialsTools},
  {label: 'Procurement', path: '/procurement', canManage: canEditProcurement},
  {label: 'Contact Book', path: '/contact-book', canManage: (role) => role === 'owner' || role === 'purchase'},
  {label: 'Work Calendar', path: '/calendar', canManage: canEditCalendar},
  {label: 'Labour / Payroll', path: '/reports/labour', canManage: canManageLabour},
  {label: 'System & Access', path: '/users', ownerManaged: true},
  {label: 'Activity History', path: '/users?tab=activity', readOnly: true},
  {label: 'Data Reconciliation', path: '/data-health', ownerManaged: true},
]

export function permissionMatrixLevel(role: AccessRole, section: PermissionSection): PermissionLevel {
  if (!canAccessPath(role, section.path)) return 'none'
  if (section.readOnly) return 'view'
  if ((section.ownerManaged && role === 'owner') || section.canManage?.(role)) return 'manage'
  return 'view'
}

const statusLabel: Record<PermissionLevel, string> = {
  manage: 'จัดการ',
  view: 'ดู',
  none: '—',
}

export default function RolePermissionMatrix() {
  const [snapshot,setSnapshot]=useState<PermissionSnapshot|null>(null)
  const [draft,setDraft]=useState<Record<string,PermissionLevel>>({})
  const [message,setMessage]=useState('')
  const [saving,setSaving]=useState(false)
  const [confirming,setConfirming]=useState(false)
  const [history,setHistory]=useState<{revision:number;changed_at:string;full_name:string;changes:{role:string;module:string;before:PermissionLevel;after:PermissionLevel}[]}[]>([])
  const key=(r:PermissionRow)=>r.role+':'+r.module
  const changes=snapshot?.rows.filter(r=>draft[key(r)]!==undefined&&draft[key(r)]!==r.level).map(r=>({role:r.role,module:r.module,level:draft[key(r)],before:r.level}))||[]
  async function refresh(){
    try{const value=await loadPermissions(true);setSnapshot(value);setDraft({});setConfirming(false);setMessage('');const {data,error}=await getSupabase().rpc('role_permission_matrix_history');if(!error)setHistory(data||[])}catch(e){setMessage(e instanceof Error?e.message:'โหลดสิทธิ์ไม่สำเร็จ')}
  }
  useEffect(()=>{void refresh()},[])
  async function save(){
    if(!snapshot||!changes.length||saving)return
    setSaving(true);setMessage('')
    try{
      const {data,error}=await getSupabase().rpc('role_permission_matrix_save',{p_expected_revision:snapshot.revision,p_changes:changes.map(({role,module,level})=>({role,module,level}))})
      if(error)throw error
      applyPermissionSnapshot(data);setSnapshot(data);setDraft({});setConfirming(false)
      const {data:logs}=await getSupabase().rpc('role_permission_matrix_history');setHistory(logs||[])
      setMessage('บันทึกสิทธิ์แล้ว ระบบตรวจสิทธิ์ใหม่ที่ฐานข้อมูลทันที')
    }catch(e){const text=e instanceof Error?e.message:String((e as {message?:string})?.message||e);setMessage(text.includes('REVISION_CONFLICT')?'มีการเปลี่ยนสิทธิ์จากหน้าจออื่น กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขอีกครั้ง':'บันทึกไม่สำเร็จ: '+text)}finally{setSaving(false)}
  }
  function restoreDefaults(){
    if(!snapshot)return
    setDraft(Object.fromEntries(snapshot.rows.filter(r=>!r.locked).map(r=>[key(r),r.default_level])))
    setConfirming(false)
  }

  return <section className="panel permission-matrix" aria-labelledby="permission-matrix-title">
    <div className="permission-matrix-heading">
      <div>
        <h2 id="permission-matrix-title">Role Permission Matrix</h2>
        <p>แก้ไขได้เฉพาะ Owner • เลือกสิทธิ์ ตรวจรายการเปลี่ยนแปลง แล้วกดยืนยันบันทึก</p>
      </div>
      <span className="permission-matrix-count">7 Roles · 15 Modules</span>
    </div>

    <div className="permission-matrix-legend" aria-label="คำอธิบายสถานะสิทธิ์">
      <span><b className="permission-legend-mark manage">จัดการ</b> ดูและแก้ไขตามฟังก์ชันที่ได้รับอนุญาต</span>
      <span><b className="permission-legend-mark view">ดู</b> อ่านอย่างเดียว</span>
      <span><b className="permission-legend-mark none">—</b> ไม่มีสิทธิ์เข้าถึง</span>
    </div>

    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
      <button className="button" disabled={!snapshot||saving||!changes.length} onClick={()=>setConfirming(true)}>ตรวจสอบก่อนบันทึก ({changes.length})</button>
      <button className="button" disabled={!snapshot||saving} onClick={()=>{setDraft({});setConfirming(false)}}>ยกเลิกการแก้ไข</button>
      <button className="button" disabled={!snapshot||saving} onClick={restoreDefaults}>คืนค่าเริ่มต้น</button>
      <button className="button" disabled={saving} onClick={()=>void refresh()}>โหลดข้อมูลล่าสุด</button>
    </div>
    {message&&<p role="status">{message}</p>}
    {!snapshot&&<p>กำลังโหลดสิทธิ์จริงจากระบบ…</p>}
    {confirming&&<div className="panel" role="region" aria-label="ตรวจสอบสิทธิ์ก่อนบันทึก" style={{marginBottom:12}}>
      <b>ตรวจสอบ {changes.length} รายการ — มีผลกับผู้ใช้ทุกคนใน Role นั้น</b>
      <ul>{changes.map(c=><li key={c.role+c.module}>{ROLE_PREVIEW_LABELS[c.role]} / {MATRIX_SECTIONS.find(s=>moduleForPath(s.path)===c.module)?.label}: {statusLabel[c.before]} → {statusLabel[c.level]}</li>)}</ul>
      <button className="button primary" disabled={saving||!changes.length} onClick={()=>void save()}>{saving?'กำลังบันทึก…':'ยืนยันบันทึกสิทธิ์'}</button>{' '}
      <button className="button" disabled={saving} onClick={()=>setConfirming(false)}>กลับไปแก้ไข</button>
    </div>}
    <div className="permission-matrix-scroll" tabIndex={0} role="region" aria-label="ตารางเปรียบเทียบสิทธิ์ทั้งเจ็ด Role">
      <table className="permission-matrix-table">
        <thead><tr>
          <th scope="col">หน้า / ฟังก์ชัน</th>
          {MATRIX_ROLES.map(role => <th key={role} scope="col">{ROLE_PREVIEW_LABELS[role]}</th>)}
        </tr></thead>
        <tbody>
          {MATRIX_SECTIONS.map(section => <tr key={section.path}>
            <th scope="row">{section.label}</th>
            {MATRIX_ROLES.map(role => {
              const cell=snapshot?.rows.find(r=>r.role===role&&r.module===moduleForPath(section.path))
              const level = cell?(draft[key(cell)]??cell.level):permissionMatrixLevel(role, section)
              return <td key={role} data-level={level} aria-label={`${ROLE_PREVIEW_LABELS[role]}: ${statusLabel[level]}`}>
                {cell&&!cell.locked?<select aria-label={`${ROLE_PREVIEW_LABELS[role]} / ${section.label}`} value={level} disabled={saving} onChange={e=>{setDraft(d=>({...d,[key(cell)]:e.target.value as PermissionLevel}));setConfirming(false)}} style={{maxWidth:96,fontSize:11,padding:5,border:level!==cell.level?'2px solid #d48b13':'1px solid #cbd5e1',borderRadius:6}}>
                  <option value="none">ไม่มีสิทธิ์</option><option value="view">ดู</option>{!section.ownerManaged&&!section.readOnly&&<option value="manage">จัดการ</option>}
                </select>:<span className="permission-state" title="สิทธิ์ระบบที่ป้องกันการแก้ไข">{statusLabel[level]} · ล็อก</span>}
              </td>
            })}
          </tr>)}
        </tbody>
      </table>
    </div>

    <div className="permission-matrix-notes">
      <p>ค่าเริ่มต้นคง Role และสิทธิ์เดิมทั้งหมด • Owner, System &amp; Access, Activity History และ Data Reconciliation ล็อกไว้เพื่อป้องกันการสูญเสียสิทธิ์ควบคุมระบบ</p>
      <p>“จัดการ” เปิดฟังก์ชันแก้ไขของโมดูลนั้น โดยคงข้อจำกัดรายรายการ การตรวจข้อมูล และกฎอนุมัติเดิม ไม่รวมการแก้ไฟล์ต้นทางหรือการลบที่สงวนไว้สำหรับ Owner</p>
      <p>การถอนสิทธิ์มีผลกับคำขอใหม่ที่ฐานข้อมูลทันที หน้าที่เปิดอยู่ตรวจสิทธิ์ใหม่เมื่อกลับเข้าแท็บหรือภายใน 30 วินาที • ข้อมูลที่เปิดอ่านไปแล้วไม่สามารถเรียกคืนได้</p>
      <p>Defect Viewer ใช้รหัสเดิม <code>defect_contributor</code> • Defect Contributor ใช้รหัสเดิม <code>defect_editor</code></p>
      <details><summary>ประวัติการเปลี่ยนสิทธิ์ ({history.length} รายการล่าสุด)</summary>{history.map(h=><div key={h.revision} style={{padding:'8px 0'}}><b>เวอร์ชัน {h.revision}</b> · {new Date(h.changed_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} · {h.full_name||'Owner'}<ul>{h.changes.map(c=><li key={c.role+c.module}>{ROLE_PREVIEW_LABELS[c.role as AccessRole]||c.role} / {MATRIX_SECTIONS.find(s=>moduleForPath(s.path)===c.module)?.label||c.module}: {statusLabel[c.before]} → {statusLabel[c.after]}</li>)}</ul></div>)}</details>
    </div>
    <style jsx>{`
      .permission-matrix{padding:16px;min-width:0}
      .permission-matrix-heading{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}
      .permission-matrix-heading h2{margin:0 0 6px;font-size:17px;color:#182a43}
      .permission-matrix-heading p{margin:0;color:#687789;font-size:12px;line-height:1.6}
      .permission-matrix-count{font-size:11px;font-weight:750;color:#50627a;background:#f0f3f7;border:1px solid #dce3eb;border-radius:8px;padding:6px 9px}
      .permission-matrix-legend{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;font-size:11px;color:#617083;margin-bottom:12px}
      .permission-matrix-legend>span{display:inline-flex;align-items:center;gap:6px}
      .permission-legend-mark,.permission-state{font-weight:800}
      .permission-legend-mark.manage,.permission-matrix-table td[data-level="manage"]{color:#166b49}
      .permission-legend-mark.view,.permission-matrix-table td[data-level="view"]{color:#245d97}
      .permission-legend-mark.none,.permission-matrix-table td[data-level="none"]{color:#97a0ad}
      .permission-matrix-scroll{max-width:100%;overflow-x:auto;overflow-y:visible;border:1px solid #dce3eb;border-radius:10px;outline-offset:3px}
      .permission-matrix-table{border-collapse:separate;border-spacing:0;table-layout:fixed;width:100%;min-width:890px;font-size:11px}
      .permission-matrix-table th,.permission-matrix-table td{padding:11px 8px;border-right:1px solid #e8edf2;border-bottom:1px solid #e8edf2;line-height:1.45}
      .permission-matrix-table tr>*:last-child{border-right:0}
      .permission-matrix-table tbody tr:last-child>*{border-bottom:0}
      .permission-matrix-table thead th{background:#edf2f8;color:#213a57;font-size:10.5px;text-align:center;font-weight:850;overflow-wrap:anywhere;vertical-align:middle}
      .permission-matrix-table thead th:first-child,.permission-matrix-table tbody th{width:188px;min-width:188px;position:sticky;left:0;z-index:1;text-align:left}
      .permission-matrix-table thead th:first-child{z-index:2;background:#e7eef7}
      .permission-matrix-table tbody th{background:#fff;font-weight:800;color:#26384e}
      .permission-matrix-table tbody tr:nth-child(even) th{background:#fafbfd}
      .permission-matrix-table tbody tr:nth-child(even) td{background:#fafbfd}
      .permission-matrix-table td{text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}
      .permission-state{font-size:11px}
      .permission-matrix-notes{display:grid;gap:5px;padding-top:12px}
      .permission-matrix-notes p{margin:0;font-size:11px;color:#657488;line-height:1.65}
      .permission-matrix-notes b{color:#344b67}
      .permission-matrix-notes code{font-size:10.5px}
      @media(max-width:760px){
        .permission-matrix{padding:12px}
        .permission-matrix-table{min-width:830px}
        .permission-matrix-table thead th:first-child,.permission-matrix-table tbody th{width:162px;min-width:162px}
      }
      @media print{.permission-matrix-scroll{overflow:visible}.permission-matrix-table{min-width:0;font-size:9px}.permission-matrix-table th,.permission-matrix-table td{padding:6px}}
    `}</style>
  </section>
}
