import { createHash } from 'node:crypto'
import { resolveLineAlertDestination, type LineRoutingConfig } from './lineAutopilotSecurity'

export type AutoPilotKind =
  | 'sync_failure'
  | 'defect_overdue'
  | 'po_materials'
  | 'daily_site_report'
  | 'weekly_recap'

export type AutoPilotEvidence = {
  /** Upstream executor-verified evidence. Not client-controlled and not a substitute for SOP Gate. */
  sourceVerified: boolean
  sopVerified: boolean
  sopFileId: string
  sopRevision: string
  sourceIds: string[]
  inspectedAt: string
  sourceRevision: string
}

export type AutoPilotAlert = {
  kind: AutoPilotKind
  /** Stable unique event or period key produced by the verified source collector. */
  eventId: string
  /** A source-provided status, never inferred from a trigger's success exit code. */
  status: 'PASS' | 'WARN' | 'FAIL'
  /** A count of *verified* actionable items: no guesses or unverified PO/Defect items. */
  confirmedItems: number
  title: string
  facts: string[]
  /** Main 3 Kings group by default; approved site groups only when explicitly requested. */
  destinationScope?: 'main' | 'site'
  projectCode?: string
  evidence: AutoPilotEvidence
}

export type PreparedAutoPilotAlert = {
  eventKey: string
  kind: AutoPilotKind
  to: string
  text: string
  sourceIds: string[]
  inspectedAt: string
}

export const LINE_AUTOPILOT_SCOPE = Object.freeze({
  sync_failure: Object.freeze({
    label: 'Sync ล้มเหลว',
    destination: 'owner_private_only',
    sourceSop: 'ตรวจ Sync',
    cadence: 'on_confirmed_failure',
  }),
  defect_overdue: Object.freeze({
    label: 'Defect เกินกำหนด',
    destination: 'company_or_approved_site_group',
    sourceSop: 'ตรวจ Defect 7 วัน',
    cadence: 'daily_morning_after_verified_check',
  }),
  po_materials: Object.freeze({
    label: 'PO / Materials ต้องติดตาม',
    destination: 'company_or_approved_site_group',
    sourceSop: 'เช็ก PO',
    cadence: 'daily_morning_after_evidence_review',
  }),
  daily_site_report: Object.freeze({
    label: 'Daily Site Report',
    destination: 'company_or_approved_site_group',
    sourceSop: 'ทำ Daily Site Report ตามเดิม',
    cadence: 'after_daily_sheet_and_report_readback',
  }),
  weekly_recap: Object.freeze({
    label: 'Weekly Recap',
    destination: 'company_or_approved_site_group',
    sourceSop: 'สรุป Weekly Recap',
    cadence: 'friday_morning_partial_if_friday_actual_missing',
  }),
} as const)

/** No return means no outgoing message. Every branch fails closed. */
export function prepareLineAutoPilotNotification(
  alert: AutoPilotAlert,
  routing: LineRoutingConfig
): PreparedAutoPilotAlert | null {
  if (!Object.prototype.hasOwnProperty.call(LINE_AUTOPILOT_SCOPE, alert.kind)) return null
  if (!alert.evidence || alert.evidence.sourceVerified !== true ||
    alert.evidence.sopVerified !== true) return null

  const ev = alert.evidence
  const approvedSource = ev.sourceIds.length > 0 && ev.sourceIds.length <= 12 &&
    ev.sourceIds.every(id => /^[A-Za-z0-9_-]{12,150}$/.test(id))
  if (!approvedSource || !/^[A-Za-z0-9_-]{12,150}$/.test(ev.sopFileId) ||
      !/^[A-Za-z0-9_.:-]{1,90}$/.test(ev.sopRevision) ||
      !/^[A-Za-z0-9_.:-]{3,150}$/.test(ev.sourceRevision)) return null

  const at = new Date(ev.inspectedAt)
  if (!Number.isFinite(at.getTime()) || at.toISOString() !== ev.inspectedAt) return null

  if (!/^[A-Za-z0-9_.:-]{3,120}$/.test(alert.eventId) ||
      !Number.isSafeInteger(alert.confirmedItems) || alert.confirmedItems <= 0 ||
      alert.confirmedItems > 5000 || !Array.isArray(alert.facts) ||
      alert.facts.length < 1 || alert.facts.length > 6) return null

  // "Sync successful" or "a script ran" must NEVER produce a failure notice.
  if (alert.kind === 'sync_failure' && alert.status !== 'FAIL') return null
  if (alert.kind !== 'sync_failure' &&
      !['PASS','WARN','FAIL'].includes(alert.status)) return null
  if (alert.title.trim().length < 4 || alert.title.length > 160 ||
      alert.facts.some(v => typeof v !== 'string' || v.trim().length === 0 ||
        v.length > 240 || /[\r\n]/.test(v))) return null

  // No debug dumps, auth tokens, secrets or unrestricted file paths in LINE messages.
  const rawText = [alert.title, ...alert.facts].join(' ')
  if (/(?:service[_-]?role|authorization\s*:|bearer\s+\S+|api[_-]?key\s*[:=]|password\s*[:=]|channel[_-]?access[_-]?token)/i.test(rawText)) return null

  const main = alert.destinationScope !== 'site'
  const destination = alert.kind === 'sync_failure'
    ? resolveLineAlertDestination({ category: 'system' }, routing)
    : main
      ? resolveLineAlertDestination({ category: 'management' }, routing)
      : resolveLineAlertDestination({ category: 'site', siteCode: alert.projectCode }, routing)
  if (!destination) return null

  const header = LINE_AUTOPILOT_SCOPE[alert.kind].label
  const observed = new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
    timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short'
  }).format(at)
  const text = [
    '3 Kings AutoPilot',
    header,
    'ผลตรวจ: ' + alert.status,
    'เรื่อง: ' + alert.title.trim(),
    ...(alert.projectCode ? ['โครงการ: ' + alert.projectCode] : []),
    ...alert.facts.map(x => '• ' + x.trim()),
    'ตรวจข้อมูล: ' + observed + ' (เวลาไทย)',
    'อ้างอิงต้นทางที่ตรวจแล้ว: ' + ev.sourceIds.length + ' แหล่ง',
  ].join('\n')
  if (text.length > 4800) return null

  // De-duplication identity ONLY: caller must atomically persist it with
  // a retry UUID before sending. This helper is never a live in-memory queue.
  const eventKey = createHash('sha256').update(
    [alert.kind, alert.eventId, ev.sourceRevision, alert.projectCode || '',
     alert.destinationScope || 'main'].join('|'), 'utf8'
  ).digest('hex')

  return {
    eventKey, kind: alert.kind, to: destination, text,
    sourceIds: [...ev.sourceIds], inspectedAt: ev.inspectedAt,
  }
}
