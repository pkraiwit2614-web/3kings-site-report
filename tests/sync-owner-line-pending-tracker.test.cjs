'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const load = n => import(pathToFileURL(path.resolve(__dirname, '../operations/sync-monitor/' + n + '.mjs')).href);

const sampleIncident = {
  id: 1,
  pipeline: 'materials',
  source_file_id: 'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx',
  original_run_key: 'materials:run-101',
  first_detected_at: '2026-11-03T10:19:51Z',
  missing_evidence: 'Missing authenticated Web readback',
  next_round_due_at: '2026-11-03T12:19:51Z',
  schedule_verified: true,
  alert_status: 'pending'
};

const sampleRun = {
  id: 'run-102',
  run_key: 'materials:run-102',
  sync_type: 'materials',
  source_file: 'ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx',
  source_system: 'drive_sync_runs',
  status: 'success',
  created_at: '2026-11-03T12:20:00Z',
  metrics: { read: 614, written: 0 }
};

test('evaluatePendingCycle: fresh cycle without pending records pending when unverified', async () => {
  const { evaluatePendingCycle } = await load('pending-tracker');
  const res = evaluatePendingCycle({
    pipeline: 'materials',
    sourceFile: sampleIncident.source_file_id,
    activePending: [],
    currentRun: sampleRun,
    currentResult: { status: 'UNVERIFIED', reason: 'WEB_READBACK_MISSING' },
    now: new Date('2026-11-03T12:20:00Z')
  });

  assert.equal(res.action, 'RECORD_PENDING');
  assert.equal(res.needsPendingRecord, true);
});

test('evaluatePendingCycle: next round overdue triggers alert once when unverified at due time', async () => {
  const { evaluatePendingCycle } = await load('pending-tracker');
  const res = evaluatePendingCycle({
    pipeline: 'materials',
    sourceFile: sampleIncident.source_file_id,
    activePending: [sampleIncident],
    currentRun: sampleRun,
    currentResult: { status: 'UNVERIFIED', reason: 'WEB_READBACK_MISSING' },
    now: new Date('2026-11-03T12:20:00Z')
  });

  assert.equal(res.action, 'SEND_OVERDUE');
  assert.equal(res.verification.originalRunKey, 'materials:run-101');
});

test('evaluatePendingCycle: when no new log appears but scheduled time passes, labels as missing cycle evidence', async () => {
  const { evaluatePendingCycle } = await load('pending-tracker');
  const res = evaluatePendingCycle({
    pipeline: 'materials',
    sourceFile: sampleIncident.source_file_id,
    activePending: [sampleIncident],
    currentRun: null,
    currentResult: null,
    now: new Date('2026-11-03T12:25:00Z')
  });

  assert.equal(res.action, 'SEND_OVERDUE');
  assert.equal(res.reason, 'MISSING_SCHEDULED_CYCLE_EVIDENCE');
  assert.equal(res.verification.originalRunKey, 'materials:run-101');
});

test('evaluatePendingCycle: already overdue alerted does not spam on subsequent check', async () => {
  const { evaluatePendingCycle } = await load('pending-tracker');
  const alertedIncident = { ...sampleIncident, alert_status: 'overdue_alerted' };
  const res = evaluatePendingCycle({
    pipeline: 'materials',
    sourceFile: sampleIncident.source_file_id,
    activePending: [alertedIncident],
    currentRun: sampleRun,
    currentResult: { status: 'UNVERIFIED', reason: 'WEB_READBACK_MISSING' },
    now: new Date('2026-11-03T12:30:00Z')
  });

  assert.equal(res.action, 'SILENT');
  assert.equal(res.reason, 'ALREADY_ALERTED_OVERDUE');
});

test('evaluatePendingCycle: resolving cycle with verified PASS triggers resolve action', async () => {
  const { evaluatePendingCycle } = await load('pending-tracker');
  const res = evaluatePendingCycle({
    pipeline: 'materials',
    sourceFile: sampleIncident.source_file_id,
    activePending: [sampleIncident],
    currentRun: sampleRun,
    currentResult: { status: 'PASS', reason: 'E2E_MATCH' },
    now: new Date('2026-11-03T12:20:00Z')
  });

  assert.equal(res.action, 'RESOLVE_PENDING');
  assert.equal(res.reason, 'VERIFIED_RESOLVED_ON_LATEST_CYCLE');
});
