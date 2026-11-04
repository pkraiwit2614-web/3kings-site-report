/**
 * 3 Kings owner Sync pending incident tracking and cross-cycle reconciler.
 * Connects durable pending registry with alert-policy.mjs and owner-alerts.mjs.
 * Service-role only, strict schema isolation, no mutation of legacy Daily LINE.
 */
import { decideOwnerAlert, isVerifiedNoChange } from './alert-policy.mjs';

const validStamp = s => typeof s === 'string' && Number.isFinite(Date.parse(s));

export function formatPendingVerification(incident, opts = {}) {
  if (!incident || !incident.pipeline || !incident.original_run_key) return null;
  return {
    pipeline: incident.pipeline,
    sourceFile: incident.source_file_id,
    originalRunKey: incident.original_run_key,
    originalRunCreatedAt: incident.first_detected_at,
    firstDetectedAt: incident.first_detected_at,
    firstCheckAttemptedAt: incident.first_detected_at,
    nextRoundDueAt: incident.next_round_due_at,
    scheduleVerified: incident.schedule_verified === true,
    pendingUnresolved: incident.alert_status === 'pending' || incident.alert_status === 'overdue_alerted',
    pendingReconciled: incident.alert_status === 'resolved',
    lastCheckReason: incident.missing_evidence,
    alertStatus: incident.alert_status,
    ...opts
  };
}

/**
 * Assess a scheduled cycle against known pending incidents.
 * If scheduled time arrived but no log exists, labels as MISSING_SCHEDULED_CYCLE_EVIDENCE,
 * NOT unevidenced sync failure.
 */
export function evaluatePendingCycle({
  pipeline,
  sourceFile,
  activePending = [],
  currentRun = null,
  currentResult = null,
  noChangeProof = null,
  now = new Date()
} = {}) {
  const incident = activePending.find(x => x.pipeline === pipeline && x.source_file_id === sourceFile);
  const currentTime = new Date(now);

  // Case 1: No active pending incident from prior cycles
  if (!incident) {
    if (!currentRun || !currentResult) {
      return { action: 'NO_OP', reason: 'NO_RUN_AND_NO_PENDING' };
    }
    const policy = decideOwnerAlert(currentRun, currentResult, {
      noChangeProof,
      now: currentTime
    });
    return {
      action: policy.decision === 'SEND' ? 'SEND_ALERT' : (policy.decision === 'WAIT' ? 'RECORD_PENDING' : 'SILENT'),
      policy,
      needsPendingRecord: policy.decision === 'WAIT' || currentResult.status === 'UNVERIFIED' || currentResult.status === 'HOLD'
    };
  }

  // Case 2: Active pending incident exists
  const verification = formatPendingVerification(incident);

  // If current cycle resolved it with authenticated proof:
  if (currentResult?.status === 'PASS') {
    return {
      action: 'RESOLVE_PENDING',
      incident,
      reason: 'VERIFIED_RESOLVED_ON_LATEST_CYCLE',
      policy: { decision: 'SEND', status: 'PASS', reason: 'RESOLVED_AND_VERIFIED' }
    };
  }

  // If no new run appeared for this cycle:
  if (!currentRun) {
    if (verification.nextRoundDueAt && currentTime.getTime() >= Date.parse(verification.nextRoundDueAt)) {
      if (incident.alert_status === 'overdue_alerted') {
        return { action: 'SILENT', reason: 'ALREADY_ALERTED_OVERDUE', incident };
      }
      return {
        action: 'SEND_OVERDUE',
        incident,
        verification,
        reason: 'MISSING_SCHEDULED_CYCLE_EVIDENCE'
      };
    }
    return { action: 'WAIT', reason: 'AWAITING_SCHEDULED_CYCLE_OR_PROOF', incident };
  }

  // A new run exists (e.g. NO_CHANGE or still UNVERIFIED)
  const policy = decideOwnerAlert(currentRun, currentResult, {
    noChangeProof,
    verification,
    now: currentTime
  });

  if (policy.decision === 'SEND' && policy.status === 'OVERDUE') {
    if (incident.alert_status === 'overdue_alerted') {
      return { action: 'SILENT', reason: 'ALREADY_ALERTED_OVERDUE', incident };
    }
    return {
      action: 'SEND_OVERDUE',
      incident,
      verification,
      policy,
      reason: policy.reason || 'OVERDUE_AT_NEXT_ROUND'
    };
  }

  return {
    action: policy.decision === 'WAIT' ? 'KEEP_PENDING' : 'SILENT',
    policy,
    incident
  };
}
