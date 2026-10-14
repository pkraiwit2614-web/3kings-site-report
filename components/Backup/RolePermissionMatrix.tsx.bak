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

// Display-only matrix: all route and editor decisions use the existing access-control
// helpers. The Defect/OOO editor-specific exception mirrors the guarded DB RPC.
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
  {label: 'Room Status | OOO/OOS', path: '/hotel-room-status',
    canManage: role => role === 'owner' || role === 'defect_editor'},
  {label: 'วัสดุ / เครื่องมือ', path: '/materials', canManage: canManageMaterialsTools},
  {label: 'Procurement', path: '/procurement', canManage: canEditProcurement},
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
  return <section className="panel permission-matrix" aria-labelledby="permission-matrix-title">
    <div className="permission-matrix-heading">
      <div>
        <h2 id="permission-matrix-title">Role Permission Matrix</h2>
        <p>ตารางสิทธิ์ตามการตั้งค่าปัจจุบันของ Web App • อ่านอย่างเดียว ไม่สามารถเปลี่ยนสิทธิ์จากตารางนี้</p>
      </div>
      <span className="permission-matrix-count">7 Roles · 13 Modules</span>
    </div>

    <div className="permission-matrix-legend" aria-label="คำอธิบายสถานะสิทธิ์">
      <span><b className="permission-legend-mark manage">จัดการ</b> ดูและแก้ไขตามฟังก์ชันที่ได้รับอนุญาต</span>
      <span><b className="permission-legend-mark view">ดู</b> อ่านอย่างเดียว</span>
      <span><b className="permission-legend-mark none">—</b> ไม่มีสิทธิ์เข้าถึง</span>
    </div>

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
              const level = permissionMatrixLevel(role, section)
              return <td key={role} data-level={level} aria-label={`${ROLE_PREVIEW_LABELS[role]}: ${statusLabel[level]}`}>
                <span className="permission-state">{statusLabel[level]}</span>
              </td>
            })}
          </tr>)}
        </tbody>
      </table>
    </div>

    <div className="permission-matrix-notes">
      <p><b>Purchase:</b> จัดการสถานะและรายละเอียดวัสดุ/เครื่องมือ, Procurement และ Work Calendar ได้ แต่ไม่มีสิทธิ์ดู Payroll</p>
      <p><b>Defect Viewer:</b> คือ Role เดิม <code>defect_contributor</code> (ดูอย่างเดียว) · <b>Defect Contributor:</b> คือ Role เดิม <code>defect_editor</code> (แก้ไข Defect และ OOO/OOS ได้)</p>
      <p>การจัดการวัสดุ/เครื่องมือไม่รวมการแก้ไขจำนวน สเปก หรือเลข PR/PO ในไฟล์ต้นทาง • การบังคับสิทธิ์ยังอยู่ที่หน้าเว็บและฐานข้อมูลตามเดิม</p>
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
