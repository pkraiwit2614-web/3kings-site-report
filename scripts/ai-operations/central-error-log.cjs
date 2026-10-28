'use strict';
/**
 * P0-B staging engine. Pure functions only: NO network, DB, file writes or dispatch.
 * Inputs must be already-authorized snapshots; never pass raw credentials.
 */
const crypto = require('node:crypto');

const SOURCES = Object.freeze([
  'GAS_TRIGGER', 'GAS_EXECUTION', 'SUPABASE_SYNC', 'GITHUB_ACTIONS',
  'VERCEL_BUILD', 'CLOUDFLARE_WORKER', 'LINE_DELIVERY'
]);
const ROUTES = Object.freeze({
  GAS_TRIGGER: 'apps-script-investigator',
  GAS_EXECUTION: 'apps-script-investigator',
  SUPABASE_SYNC: 'sync-investigator',
  GITHUB_ACTIONS: 'github-ci-investigator',
  VERCEL_BUILD: 'vercel-build-investigator',
  CLOUDFLARE_WORKER: 'cloudflare-worker-investigator',
  LINE_DELIVERY: 'line-delivery-investigator'
});
const STATES = new Set(['FAILED', 'WARN', 'RECOVERED', 'UNKNOWN']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const SAFE_COMPONENTS = new Set([
  'MATERIALS', 'SCHEDULE', 'DEFECTS', 'PHOTOS', 'DAILY_SITE_REPORT',
  'HOTEL_WORK_PLAN', 'WORK_ORDER', 'LINE_AUTOPILOT', 'CI',
  'AGENT_CORE_READONLY', 'CLOUDFLARE_BACKUP_BUILD', 'PREVIEW_PLAYWRIGHT_E2E'
]);
function safeComponent(value) {
  const label = cleanLabel(value, 'UNKNOWN_COMPONENT', 96);
  return SAFE_COMPONENTS.has(label) ? label : 'COMPONENT_SHA256_' + hash(String(value || '')).slice(0, 12);
}
function safeErrorCode(value) {
  const code = cleanLabel(value, 'UNCLASSIFIED', 120);
  // Store only known error categories. Raw provider messages may contain secrets.
  if (/RLS/.test(code)) return 'RLS_ERROR';
  if (/AUTH/.test(code)) return 'AUTH_ERROR';
  if (/PERMISSION|FORBIDDEN|DENIED/.test(code)) return 'PERMISSION_ERROR';
  if (/SECRET|TOKEN|CREDENTIAL/.test(code)) return 'SECRET_ERROR';
  if (/PAYROLL/.test(code)) return 'PAYROLL_ERROR';
  if (/SECURITY|EXFILTRATION/.test(code)) return 'SECURITY_ERROR';
  if (/RATE.LIMIT|QUOTA|THROTTL/.test(code)) return 'RATE_LIMIT';
  if (/TIMEOUT|TIMED_OUT/.test(code)) return 'TIMEOUT';
  if (/SCHEMA|HEADER_MISMATCH/.test(code)) return 'SCHEMA_MISMATCH';
  if (/HTTP_5\d\d/.test(code)) return 'HTTP_5XX';
  if (/HTTP_4\d\d/.test(code)) return 'HTTP_4XX';
  if (/WORKFLOW/.test(code)) return code.includes('SUCCESS') ? 'WORKFLOW_SUCCESS' : 'WORKFLOW_FAILURE';
  if (/SYNC/.test(code)) return code.includes('SUCCESS') ? 'SYNC_SUCCESS' : 'SYNC_ERROR';
  if (/LINE|DELIVERY/.test(code)) return 'LINE_DELIVERY_ERROR';
  if (/TRIGGER/.test(code)) return 'GAS_TRIGGER_ERROR';
  if (/EXECUTION/.test(code)) return 'GAS_EXECUTION_ERROR';
  if (/BUILD/.test(code)) return 'BUILD_ERROR';
  if (/NETWORK/.test(code)) return 'NETWORK_ERROR';
  return 'UNCLASSIFIED';
}
const cleanLabel = (value, fallback = 'UNKNOWN', max = 64) => {
  const s = String(value == null ? '' : value).trim().toUpperCase()
    .replace(/[^A-Z0-9_.:-]/g, '_').slice(0, max);
  return s || fallback;
};
function severity(source, state, code) {
  if (/(AUTH|PERMISSION|SECRET|TOKEN|RLS|PAYROLL|SECURITY|EXFILTRATION)/.test(code)) return 'CRITICAL';
  if (state === 'FAILED' && ['LINE_DELIVERY', 'GAS_EXECUTION', 'SUPABASE_SYNC'].includes(source)) return 'HIGH';
  if (state === 'FAILED') return 'MEDIUM';
  return 'LOW';
}
function normalizeEvent(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('INVALID_EVENT');
  const source = cleanLabel(raw.source);
  if (!SOURCES.includes(source)) throw Error('UNKNOWN_SOURCE');
  const state = cleanLabel(raw.state || raw.status);
  if (!STATES.has(state)) throw Error('INVALID_STATE');
  const occurredAt = new Date(raw.occurredAt || raw.occurred_at || '');
  if (Number.isNaN(occurredAt.getTime())) throw Error('INVALID_OCCURRENCE_TIME');
  const current = new Date(now);
  if (Number.isNaN(current.getTime())) throw Error('INVALID_CLOCK');
  if (occurredAt.getTime() > current.getTime() + 5 * 60_000) throw Error('FUTURE_EVENT_QUARANTINED');
  const component = safeComponent(raw.component);
  const code = safeErrorCode(raw.errorCode || raw.error_code || raw.code);
  const fingerprint = hash(`${source}|${component}|${code}`);
  // A per-occurrence ID prevents collapsing separate failures with the same cause.
  // Do not retain raw external IDs, messages, stacks, URLs, room IDs or personal data.
  const eventId = hash(`${fingerprint}|${occurredAt.toISOString()}|${String(raw.eventId || raw.event_id || '')}`);
  const level = severity(source, state, code);
  const needsHuman = level === 'CRITICAL' || state === 'UNKNOWN';
  return Object.freeze({
    schemaVersion: 1, eventId, fingerprint, source, component, errorCode: code,
    state, severity: level, occurredAt: occurredAt.toISOString(),
    observedAt: current.toISOString(),
    proposedExecutor: ROUTES[source],
    proposedAction: needsHuman ? 'MANUAL_SECURITY_REVIEW' : 'INSPECT_ONLY',
    executionMode: 'DISABLED_STAGING', dispatchAllowed: false,
    requiresLiveSopGate: true,
    evidence: 'METADATA_ONLY_NO_RAW_LOGS'
  });
}
function buildReport(rawEvents, now = new Date()) {
  if (!Array.isArray(rawEvents) || rawEvents.length > 10000) throw Error('INVALID_BATCH');
  const byEvent = new Map();
  const rejected = [];
  rawEvents.forEach((raw, index) => {
    try { const item = normalizeEvent(raw, now); byEvent.set(item.eventId, item); }
    catch (error) { rejected.push({index, code: cleanLabel(error.message)}); }
  });
  const events = [...byEvent.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const groups = new Map();
  for (const event of events) {
    const g = groups.get(event.fingerprint) || {
      fingerprint: event.fingerprint, source: event.source, component: event.component,
      errorCode: event.errorCode, proposedExecutor: event.proposedExecutor,
      occurrences: 0, latestAt: event.occurredAt, latestState: event.state,
      severity: event.severity, dispatchAllowed: false
    };
    g.occurrences += 1;
    if (event.occurredAt > g.latestAt) {
      g.latestAt = event.occurredAt;
      g.latestState = event.state;
      g.severity = event.severity;
    }
    groups.set(event.fingerprint, g);
  }
  return {
    schemaVersion: 1, mode: 'STAGING_NO_DISPATCH', generatedAt: new Date(now).toISOString(),
    inputCount: rawEvents.length, acceptedCount: events.length, rejected,
    events, groups: [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt)),
    caveats: [
      'No automatic executor calls, Trigger changes, Supabase writes, LINE sends or deployments.',
      'No live Apps Script trigger status unless a current-user GAS snapshot has been supplied.',
      'Later success does not retroactively erase or resolve a prior failed occurrence.'
    ]
  };
}
function fromSupabaseSyncRun(row) {
  if (!row || typeof row !== 'object') throw Error('INVALID_SYNC_ROW');
  const status = String(row.status || '').toLowerCase();
  if (!['error', 'failed', 'warning', 'warn', 'success'].includes(status)) return null;
  return {
    source: 'SUPABASE_SYNC', component: row.sync_type || 'unknown',
    state: status === 'success' ? 'RECOVERED' : status.startsWith('warn') ? 'WARN' : 'FAILED',
    code: status === 'success' ? 'SYNC_SUCCESS_OBSERVED' : 'SYNC_RUN_' + status.toUpperCase(),
    occurredAt: row.created_at, eventId: row.id
  };
}
function fromGitHubWorkflowRun(row) {
  if (!row || typeof row !== 'object') throw Error('INVALID_WORKFLOW_RUN');
  if (!['failure', 'success', 'timed_out', 'cancelled'].includes(row.conclusion)) return null;
  return {
    source: 'GITHUB_ACTIONS', component: row.workflow_id || row.name || 'unknown',
    state: row.conclusion === 'success' ? 'RECOVERED' : row.conclusion === 'cancelled' ? 'WARN' : 'FAILED',
    code: 'WORKFLOW_' + cleanLabel(row.conclusion),
    occurredAt: row.updated_at || row.created_at, eventId: row.id
  };
}
function inspectGasSnapshot(snapshot, now = new Date()) {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.collector !== 'GAS_CURRENT_USER_TRIGGER_INVENTORY')
    throw Error('INVALID_GAS_SNAPSHOT');
  const collected = new Date(snapshot.collectedAt);
  if (Number.isNaN(collected.getTime()) || collected.getTime() > +new Date(now) + 300000)
    throw Error('INVALID_GAS_SNAPSHOT_TIME');
  if (!Array.isArray(snapshot.triggers) || snapshot.triggers.length > 200)
    throw Error('INVALID_GAS_TRIGGER_LIST');
  for (const t of snapshot.triggers) {
    if (!t || typeof t.handler !== 'string' || t.registration !== 'REGISTERED_FOR_CURRENT_USER')
      throw Error('INVALID_GAS_TRIGGER_ENTRY');
  }
  return {
    status: (+new Date(now) - +collected > 24 * 3600_000) ? 'STALE' : 'PARTIAL_CURRENT_USER',
    observedAt: collected.toISOString(), triggerCount: snapshot.triggers.length,
    triggerHandlerHashes: snapshot.triggers.map(t => hash(String(t.handler)).slice(0, 16)),
    scope: 'CURRENT_ACCOUNT_ONLY', otherOwners: 'NOT_VISIBLE',
    enabledStatus: 'NOT_EXPOSED_BY_SCRIPTAPP', lastExecution: 'NOT_EXPOSED_BY_SCRIPTAPP',
    executionMode: 'READ_ONLY', dispatchAllowed: false
  };
}
module.exports = {SOURCES, ROUTES, normalizeEvent, buildReport, fromSupabaseSyncRun,
  fromGitHubWorkflowRun, inspectGasSnapshot};