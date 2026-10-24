'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const gasSource = fs.readFileSync('docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs', 'utf8');

// Compile check in clean VM
test('GoogleCalendarAutoSync script compiles cleanly without syntax errors', () => {
  assert.doesNotThrow(() => new vm.Script(gasSource, { filename: 'GoogleCalendarAutoSync.js' }));
});

const {
  GCAL_AUTO_SYNC_20261023,
  formatCalendarEventTitle,
  parseCalendarEventTitle,
  extractCanonicalRooms,
  normalizeCombineRooms,
  buildStableSourceKey,
  reconcileCalendarEvent,
  syncCalendarItems,
  callWithRetry,
  isIndependentSiteEvent_,
  buildSourceToCalendarMatchLedger,
} = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

test('enforces exact canonical title format: รายละเอียดงานเหมือนเดิม • สถานะ [สถานที่] [กลุ่มงาน]', () => {
  // Example 1: Villa architecture progress
  const ex1 = formatCalendarEventTitle({
    detail: 'งานสถาปัตยกรรม 25.9%',
    status: 'ล่าช้า',
    location: 'Plot 9',
    workGroup: 'สถาปัตย์',
  });
  assert.equal(ex1, 'งานสถาปัตยกรรม 25.9% • ล่าช้า [Plot 9] [สถาปัตย์]');

  // Example 2: Cleaning combine room afternoon
  const ex2 = formatCalendarEventTitle({
    detail: 'Cleaning A221/A222',
    status: 'แผนช่วงบ่าย',
    location: 'Condo A',
    workGroup: 'Cleaning',
  });
  assert.equal(ex2, 'Cleaning A221/A222 • แผนช่วงบ่าย [Condo A] [Cleaning]');

  // Example 3: Handover room
  const ex3 = formatCalendarEventTitle({
    detail: 'Handover A401',
    status: 'แผน',
    location: 'Condo A',
    workGroup: 'Handover',
  });
  assert.equal(ex3, 'Handover A401 • แผน [Condo A] [Handover]');

  // Bracket sanitization (prevents double brackets [[...]])
  const exSanitized = formatCalendarEventTitle({
    detail: 'ตรวจรับงานงวด 3',
    status: 'เสร็จสิ้น',
    location: '[Plot 7]',
    workGroup: '[งานระบบ]',
  });
  assert.equal(exSanitized, 'ตรวจรับงานงวด 3 • เสร็จสิ้น [Plot 7] [งานระบบ]');

  // Rejects empty detail
  assert.throws(() => formatCalendarEventTitle({ detail: '' }), /DETAIL_REQUIRED/);
  assert.throws(() => formatCalendarEventTitle(null), /FORMATTER_INPUT_REQUIRED/);
});

test('parses existing event titles into constituent parts without losing detail', () => {
  const p1 = parseCalendarEventTitle('งานสถาปัตยกรรม 25.9% • ล่าช้า [Plot 9] [สถาปัตย์]');
  assert.equal(p1.detail, 'งานสถาปัตยกรรม 25.9%');
  assert.equal(p1.baseDetail, 'งานสถาปัตยกรรม');
  assert.equal(p1.progressPercent, 25.9);
  assert.equal(p1.status, 'ล่าช้า');
  assert.equal(p1.location, 'Plot 9');
  assert.equal(p1.workGroup, 'สถาปัตย์');

  const p2 = parseCalendarEventTitle('Cleaning A221/A222 • แผนช่วงบ่าย [Condo A] [Cleaning]');
  assert.equal(p2.detail, 'Cleaning A221/A222');
  assert.deepEqual(p2.rooms, ['A221', 'A222']);
  assert.equal(p2.status, 'แผนช่วงบ่าย');
  assert.equal(p2.location, 'Condo A');
  assert.equal(p2.workGroup, 'Cleaning');

  // Legacy parenthesized status
  const pLegacy = parseCalendarEventTitle('งานโครงสร้าง 100% (ตามแผน) [Villa 8] [โครงสร้าง]');
  assert.equal(pLegacy.baseDetail, 'งานโครงสร้าง');
  assert.equal(pLegacy.progressPercent, 100);
  assert.equal(pLegacy.status, 'ตามแผน');
  assert.equal(pLegacy.location, 'Villa 8');
});

test('Combine room normalization equates slash, plus and comma separators', () => {
  assert.equal(normalizeCombineRooms('A221/A222'), 'A221,A222');
  assert.equal(normalizeCombineRooms('A222+A221'), 'A221,A222'); // sorted
  assert.equal(normalizeCombineRooms('A221, A222'), 'A221,A222');
  assert.equal(normalizeCombineRooms('B610/B611'), 'B610,B611');
});

test('Progress percentage update modifies existing event title and preserves same Event ID', () => {
  const existingEvents = [
    {
      id: 'gcal_evt_arch_plot9_001',
      title: 'งานสถาปัตยกรรม 25.9% • ล่าช้า [Plot 9] [สถาปัตย์]',
      date: '2026-10-23',
      description: '[3Kings-Key: gcal:villa:plot_9:สถาปัตย์:งานสถาปัตยกรรม:2026-10-23]',
    },
  ];

  // Incoming sync with newer progress 26.5%
  const updatedItem = {
    detail: 'งานสถาปัตยกรรม 26.5%',
    status: 'ล่าช้า',
    location: 'Plot 9',
    workGroup: 'สถาปัตย์',
    date: '2026-10-23',
    domain: 'villa',
  };

  const decision = reconcileCalendarEvent(updatedItem, existingEvents);
  assert.equal(decision.action, 'UPDATE');
  assert.equal(decision.eventId, 'gcal_evt_arch_plot9_001');
  assert.equal(decision.newTitle, 'งานสถาปัตยกรรม 26.5% • ล่าช้า [Plot 9] [สถาปัตย์]');
  assert.equal(decision.reason, 'STABLE_KEY_MATCH_TITLE_UPDATED');
});

test('Retroactive matching links untagged existing events by date + location + trade without creating duplicates', () => {
  // Simulated legacy event without tags
  const existingEvents = [
    {
      id: 'legacy_evt_cleaning_088',
      title: 'Cleaning A221/A222 • แผนช่วงบ่าย [Condo A] [Cleaning]',
      date: '2026-10-23',
      description: 'ทำความสะอาดก่อนส่งมอบ',
    },
  ];

  const incoming = {
    detail: 'Cleaning A221/A222',
    status: 'แผนช่วงบ่าย',
    location: 'Condo A',
    workGroup: 'Cleaning',
    date: '2026-10-23',
  };

  const decision = reconcileCalendarEvent(incoming, existingEvents);
  assert.equal(decision.action, 'NOOP');
  assert.equal(decision.eventId, 'legacy_evt_cleaning_088');
  assert.equal(decision.reason, 'RETROACTIVE_SEMANTIC_MATCH_NO_CHANGE');
});

test('Ambiguous matches (>1 candidates) fail closed to REVIEW and do not create duplicates', () => {
  const existingEvents = [
    {
      id: 'dup_candidate_1',
      title: 'งานทาสี • ตามแผน [Plot 7] [สถาปัตย์]',
      date: '2026-10-23',
    },
    {
      id: 'dup_candidate_2',
      title: 'งานทาสี • ตามแผน [Plot 7] [สถาปัตย์]',
      date: '2026-10-23',
    },
  ];

  const incoming = {
    detail: 'งานทาสี',
    status: 'ตามแผน',
    location: 'Plot 7',
    workGroup: 'สถาปัตย์',
    date: '2026-10-23',
  };

  const decision = reconcileCalendarEvent(incoming, existingEvents);
  assert.equal(decision.action, 'REVIEW');
  assert.equal(decision.eventId, null);
  assert.equal(decision.reason, 'AMBIGUOUS_RETROACTIVE_MULTIPLE_MATCHES');
  assert.equal(decision.candidates.length, 2);
});

test('Dry-run mode executes zero mutations and returns audit ledger', () => {
  const existingEvents = [
    { id: 'evt_1', title: 'งานสถาปัตยกรรม 25.0% • ล่าช้า [Plot 9] [สถาปัตย์]', date: '2026-10-23' },
  ];
  const items = [
    { detail: 'งานสถาปัตยกรรม 25.9%', status: 'ล่าช้า', location: 'Plot 9', workGroup: 'สถาปัตย์', date: '2026-10-23' },
  ];

  const dryResult = syncCalendarItems(items, existingEvents, { dryRun: true });
  assert.equal(dryResult.dryRun, true);
  assert.equal(dryResult.initialCount, 1);
  assert.equal(dryResult.finalCount, 1);
  assert.equal(dryResult.updatedCount, 1);
  assert.equal(dryResult.finalEvents[0].title, 'งานสถาปัตยกรรม 25.0% • ล่าช้า [Plot 9] [สถาปัตย์]'); // unchanged in dryRun
});

test('Two-pass sync idempotency on 188 simulated production events across 7 calendars', () => {
  // Generate 188 realistic events matching 7 calendars
  const calendars = GCAL_AUTO_SYNC_20261023.CALENDARS;
  assert.equal(calendars.length, 7);

  const initial188Events = [];
  let idCounter = 1;

  // Distribute 188 items across the 7 calendars (34 + 44 + 30 + 20*4 = 188)
  for (let c = 0; c < 7; c++) {
    const cal = calendars[c];
    const countForCal = c === 0 ? 34 : c === 1 ? 44 : c === 2 ? 30 : 20;
    for (let i = 0; i < countForCal; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      const date = `2026-10-${day}`;
      let detail = `งานงวดที่ ${i + 1}`;
      let status = i % 3 === 0 ? 'ล่าช้า' : 'ตามแผน';
      let location = cal.label.includes('Villa') ? cal.label.replace('3K - ', '') : 'Condo A';
      let workGroup = i % 2 === 0 ? 'สถาปัตย์' : 'งานระบบ';

      if (i === 0 && c === 6) {
        detail = 'งานสถาปัตยกรรม 25.9%';
        status = 'ล่าช้า';
        location = 'Plot 9';
        workGroup = 'สถาปัตย์';
      } else if (i === 1 && c === 1) {
        detail = 'Cleaning A221/A222';
        status = 'แผนช่วงบ่าย';
        location = 'Condo A';
        workGroup = 'Cleaning';
      } else if (i === 2 && c === 1) {
        detail = 'Handover A401';
        status = 'แผน';
        location = 'Condo A';
        workGroup = 'Handover';
      }

      const id = `evt_prod_3k_${String(idCounter++).padStart(3, '0')}`;
      const title = formatCalendarEventTitle({ detail, status, location, workGroup });
      initial188Events.push({
        id,
        calendarId: cal.id,
        title,
        date,
        startDate: date,
        description: `Source event for ${detail}`,
      });
    }
  }

  assert.equal(initial188Events.length, 188);

  // Sync Input: exactly matching the 188 items
  const syncItems = initial188Events.map(e => {
    const p = parseCalendarEventTitle(e.title);
    return {
      storedEventId: e.id,
      calendarId: e.calendarId,
      detail: p.detail,
      status: p.status,
      location: p.location,
      workGroup: p.workGroup,
      date: e.date,
    };
  });

  // PASS 1: Execution
  const pass1 = syncCalendarItems(syncItems, initial188Events, { dryRun: false });
  assert.equal(pass1.initialCount, 188);
  assert.equal(pass1.finalCount, 188);
  assert.equal(pass1.createdCount, 0, 'No new duplicate events should be created');
  assert.equal(pass1.noopCount, 188, 'All formatted events should match cleanly');
  assert.equal(pass1.retainedEventIds.length, 188);

  // PASS 2: Re-run immediately
  const pass2 = syncCalendarItems(syncItems, pass1.finalEvents, { dryRun: false });
  assert.equal(pass2.initialCount, 188);
  assert.equal(pass2.finalCount, 188);
  assert.equal(pass2.createdCount, 0, 'Second run must have zero created events');
  assert.equal(pass2.updatedCount, 0, 'Second run must have zero updated events');
  assert.equal(pass2.noopCount, 188, 'Second run must be 100% NOOP');

  // Verify all 188 Event IDs match exactly
  for (let i = 0; i < 188; i++) {
    assert.equal(pass2.finalEvents[i].id, initial188Events[i].id);
    assert.equal(pass2.finalEvents[i].title, initial188Events[i].title);
  }
});

test('Retry logic performs exponential backoff on transient errors and succeeds upon recovery', () => {
  let attempts = 0;
  const flakeyFn = () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('Google Calendar HTTP 429 Quota Exceeded');
    }
    return { ok: true, attempts };
  };

  const res = callWithRetry(flakeyFn, 3);
  assert.equal(res.ok, true);
  assert.equal(attempts, 3);
});

test('Safety boundaries: zero modification to Defect Flow, Work Orders, Materials or unrelated triggers', () => {
  // Ensure the script does not contain write operations against other tables
  assert.doesNotMatch(gasSource, /condo_room_status/);
  assert.doesNotMatch(gasSource, /defect_work_order_snapshot/);
  assert.doesNotMatch(gasSource, /materials/);
  assert.doesNotMatch(gasSource, /payroll/);
  // Ensure no deleteTrigger loop over unrelated handlers
  assert.doesNotMatch(gasSource, /ScriptApp\.deleteTrigger\([^)]*\)\s*;\s*ScriptApp\.newTrigger\('sync3Kings'\)/);
});

test('dryRunGoogleCalendarSync audits exact 188 inventory distribution confirmed by ChatGPT without mutations', () => {
  const { dryRunGoogleCalendarSync } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');
  const calendars = GCAL_AUTO_SYNC_20261023.CALENDARS;

  // Exact distribution confirmed by ChatGPT live readback:
  // Construction Plan: 62, Site / Actual: 90, Deliveries: 5, Villa 6: 7, Villa 7: 7, Villa 8: 11, Villa 9: 6 (Total: 188)
  const expectedCounts = [62, 90, 5, 7, 7, 11, 6];
  const mockCalMap = new Map();

  calendars.forEach((c, idx) => {
    const count = expectedCounts[idx];
    const events = [];
    for (let i = 0; i < count; i++) {
      events.push({
        getTitle: () => `งานงวดที่ ${i + 1} 25.9% • ล่าช้า [${c.label}] [สถาปัตย์]`,
        getId: () => `mock_${c.id}_evt_${i + 1}`,
      });
    }
    mockCalMap.set(c.id, {
      getEvents: () => events,
    });
  });

  global.CalendarApp = {
    getCalendarById: id => mockCalMap.get(id) || null,
  };
  global.Logger = {
    log: () => {},
  };

  try {
    const audit = dryRunGoogleCalendarSync();
    assert.equal(audit.status, 'AUDIT_PASS');
    assert.equal(audit.baselineTarget, 188);
    assert.equal(audit.totalEvents, 188);
    assert.equal(audit.createdCount, 0);
    assert.equal(audit.formattedCount, 188);
    assert.equal(audit.needsFormattingCount, 0);
    assert.equal(audit.duplicatesDetected, 0);
    assert.equal(audit.calendars.length, 7);
    calendars.forEach((c, idx) => {
      assert.equal(audit.calendars[idx].count, expectedCounts[idx]);
      assert.equal(audit.calendars[idx].status, 'OK');
    });
  } finally {
    delete global.CalendarApp;
    delete global.Logger;
  }
});

test('dryRunGoogleCalendarSync and scheduled job fail closed when CalendarApp is missing or calendar inaccessible', () => {
  const { dryRunGoogleCalendarSync, syncGoogleCalendarScheduledJob } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  // Case 1: CalendarApp missing
  delete global.CalendarApp;
  const missingAppAudit = dryRunGoogleCalendarSync();
  assert.equal(missingAppAudit.status, 'ERROR');
  assert.equal(missingAppAudit.error, 'CALENDAR_APP_UNAVAILABLE');

  const missingAppSync = syncGoogleCalendarScheduledJob();
  assert.equal(missingAppSync.status, 'ERROR');
  assert.equal(missingAppSync.error, 'AUDIT_FAILED_BEFORE_SYNC');

  // Case 2: One calendar fails to load
  global.CalendarApp = {
    getCalendarById: id => {
      if (id.includes('Villa 6') || id.includes('9b7068d0')) return null; // Missing
      return { getEvents: () => [] };
    },
  };
  try {
    const brokenAudit = dryRunGoogleCalendarSync();
    assert.equal(brokenAudit.status, 'ERROR');
    assert.equal(brokenAudit.error, 'ONE_OR_MORE_CALENDARS_INACCESSIBLE');

    const brokenSync = syncGoogleCalendarScheduledJob();
    assert.equal(brokenSync.status, 'ERROR');
  } finally {
    delete global.CalendarApp;
  }
});

test('resolveCalendarIdForTask separates Construction Plan, Site Actual, Deliveries and Plot calendars with Actual priority', () => {
  const { resolveCalendarIdForTask } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const siteActualCalId = '9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com';
  const v6CalId = '9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com';
  const v7CalId = '7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com';
  const v8CalId = 'd31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com';
  const v9CalId = '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';
  const planCalId = 'family17900518303332507254@group.calendar.google.com';
  const deliveryCalId = '6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com';

  // CRITICAL SAFETY CHECK: Actual site progress items for Plot 6, 7, 8, 9 MUST route to Site / Actual, NOT Villa Plan
  assert.equal(resolveCalendarIdForTask({ location: 'Plot 6', domain: 'actual' }), siteActualCalId, 'Plot 6 Actual must route to Site/Actual');
  assert.equal(resolveCalendarIdForTask({ area: 'AV-P7', isActual: true }), siteActualCalId, 'Plot 7 Actual must route to Site/Actual');
  assert.equal(resolveCalendarIdForTask({ location: 'Villa 8', status: 'ส่งมอบงานจริง' }), siteActualCalId, 'Plot 8 Actual must route to Site/Actual');
  assert.equal(resolveCalendarIdForTask({ location: 'Plot 9', domain: 'actual' }), siteActualCalId, 'Plot 9 Actual must route to Site/Actual');

  // Plan items for Plots route to their respective Villa Plan calendars
  assert.equal(resolveCalendarIdForTask({ location: 'Plot 6', domain: 'plan' }), v6CalId);
  assert.equal(resolveCalendarIdForTask({ area: 'AV-P7', domain: 'plan' }), v7CalId);
  assert.equal(resolveCalendarIdForTask({ location: 'Villa 8', domain: 'plan' }), v8CalId);
  assert.equal(resolveCalendarIdForTask({ location: 'Plot 9', domain: 'plan' }), v9CalId);

  // Deliveries routing
  assert.equal(resolveCalendarIdForTask({ domain: 'procurement', detail: 'ส่งปูนเข้าหน้างาน' }), deliveryCalId);
  assert.equal(resolveCalendarIdForTask({ domain: 'delivery' }), deliveryCalId);

  // Default Construction Plan
  assert.equal(resolveCalendarIdForTask({ domain: 'plan', location: 'Common Area' }), planCalId);
});

test('dryRunGoogleCalendarSync detects intra-calendar duplicates, unformatted titles and count mismatches', () => {
  const { dryRunGoogleCalendarSync, GCAL_AUTO_SYNC_20261023 } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  // Subcase A: Intra-calendar duplicate (exact title + start date)
  const dupEvent1 = {
    getId: () => 'event_dup_1',
    getTitle: () => 'งานสถาปัตยกรรม • ล่าช้า [Plot 6] [สถาปัตย์]',
    getStartTime: () => new Date('2026-10-23T08:00:00+07:00'),
  };
  const dupEvent2 = {
    getId: () => 'event_dup_2',
    getTitle: () => 'งานสถาปัตยกรรม • ล่าช้า [Plot 6] [สถาปัตย์]',
    getStartTime: () => new Date('2026-10-23T08:00:00+07:00'),
  };

  global.CalendarApp = {
    getCalendarById: () => ({
      getEvents: () => [dupEvent1, dupEvent2],
    }),
  };

  try {
    const dupAudit = dryRunGoogleCalendarSync();
    assert.equal(dupAudit.status, 'REVIEW_HOLD');
    assert.equal(dupAudit.error, 'DUPLICATE_EVENTS_DETECTED');
    assert(dupAudit.duplicatesDetected > 0);
  } finally {
    delete global.CalendarApp;
  }

  // Subcase B: Unformatted title detected
  const unformattedEvent = {
    getId: () => 'event_unformatted_1',
    getTitle: () => 'เทพื้นปูนหน้างาน แบบไม่มีวงเล็บและจุดไข่ปลา',
    getStartTime: () => new Date('2026-10-23T08:00:00+07:00'),
  };

  global.CalendarApp = {
    getCalendarById: () => ({
      getEvents: () => [unformattedEvent],
    }),
  };

  try {
    const unformattedAudit = dryRunGoogleCalendarSync();
    assert.equal(unformattedAudit.status, 'REVIEW_HOLD');
    assert.equal(unformattedAudit.error, 'UNFORMATTED_EVENTS_DETECTED');
    assert(unformattedAudit.needsFormattingCount > 0);
  } finally {
    delete global.CalendarApp;
  }

  // Subcase C: Count mismatch against baseline 188
  const singleValidEvent = {
    getId: () => 'event_valid_1',
    getTitle: () => 'งานเทพื้น • ตามแผน [Plot 6] [โครงสร้าง]',
    getStartTime: () => new Date('2026-10-23T08:00:00+07:00'),
  };

  global.CalendarApp = {
    getCalendarById: () => ({
      getEvents: () => [singleValidEvent],
    }),
  };

  try {
    const mismatchAudit = dryRunGoogleCalendarSync();
    assert.equal(mismatchAudit.status, 'COUNT_MISMATCH_REVIEW');
    assert(mismatchAudit.error.includes('COUNT_MISMATCH'));
  } finally {
    delete global.CalendarApp;
  }
});

test('syncGoogleCalendarScheduledJob updates existing event title upon progress delta and preserves same Event ID', () => {
  const { syncGoogleCalendarScheduledJob } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  let currentTitle = 'งานสถาปัตยกรรม 25.9% • ล่าช้า [Plot 9] [สถาปัตย์]';
  let updatedTag = '';

  const mockEvent = {
    getId: () => 'gcal_plot9_arch_001',
    getTitle: () => currentTitle,
    getDescription: () => '[3Kings-Key: gcal:villa:plot_9:สถาปัตย์:งานสถาปัตยกรรม:2026-10-23]',
    getTag: () => 'gcal:villa:plot_9:สถาปัตย์:งานสถาปัตยกรรม:2026-10-23',
    getStartTime: () => new Date('2026-10-23T08:00:00+07:00'),
    setTitle: t => { currentTitle = t; },
    setTag: (k, v) => { updatedTag = v; },
  };

  const p9CalId = '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';

  global.CalendarApp = {
    getCalendarById: id => ({
      getEvents: () => id === p9CalId ? [mockEvent] : [],
    }),
  };
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {},
    }),
  };
  global.Logger = { log: () => {} };

  try {
    // Incoming source update: progress increases to 26.5%
    const incomingDeltaItem = {
      calendarId: p9CalId,
      detail: 'งานสถาปัตยกรรม 26.5%',
      status: 'ล่าช้า',
      location: 'Plot 9',
      workGroup: 'สถาปัตย์',
      date: '2026-10-23',
    };

    const res = syncGoogleCalendarScheduledJob([incomingDeltaItem], { dryRun: false, allowCountMismatch: true });
    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.updatedCount, 1);
    assert.equal(res.createdCount, 0, 'Must NOT create new duplicate event!');
    assert.equal(res.noopCount, 0);
    assert.equal(res.updatedEvents[0].eventId, 'gcal_plot9_arch_001', 'Must preserve original Event ID!');
    assert.equal(res.updatedEvents[0].verified, true, 'Destination readback must be verified!');
    assert.equal(currentTitle, 'งานสถาปัตยกรรม 26.5% • ล่าช้า [Plot 9] [สถาปัตย์]');
  } finally {
    delete global.CalendarApp;
    delete global.LockService;
    delete global.Logger;
  }
});

test('syncGoogleCalendarScheduledJob called with NO ARGUMENTS fetches source from provider and verifies destination readback', () => {
  const {
    syncGoogleCalendarScheduledJob,
    setGlobalCalendarSourceProvider_,
    GCAL_AUTO_SYNC_20261023
  } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const v6CalId = '9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com';
  const expectedCounts = [62, 90, 5, 7, 7, 11, 6];
  const calendars = GCAL_AUTO_SYNC_20261023.CALENDARS;
  const mockCalMap = new Map();

  let eventTitle = 'งานเทพื้นคอนกรีต 30% • ดำเนินการ [Villa 6] [โครงสร้าง]';
  const initialEventId = 'gcal_v6_concrete_007';

  const mockV6Event = {
    getId: () => initialEventId,
    getTitle: () => eventTitle,
    getDescription: () => '[3Kings-Key: gcal:villa:plot_6:โครงสร้าง:งานเทพื้นคอนกรีต:2026-10-24]',
    getTag: () => 'gcal:villa:plot_6:โครงสร้าง:งานเทพื้นคอนกรีต:2026-10-24',
    getStartTime: () => new Date('2026-10-24T08:00:00+07:00'),
    setTitle: newT => { eventTitle = newT; },
    setTag: () => {},
  };

  calendars.forEach((c, idx) => {
    const count = expectedCounts[idx];
    const events = [];
    if (c.id === v6CalId) {
      events.push(mockV6Event);
      for (let i = 1; i < count; i++) {
        events.push({
          getId: () => `mock_${c.id}_evt_${i + 1}`,
          getTitle: () => `งานงวดที่ ${i + 1} • ตามแผน [${c.label}] [สถาปัตย์]`,
          getStartTime: () => new Date(`2026-10-0${i + 1}T08:00:00+07:00`),
          setTitle: () => {},
          setTag: () => {},
        });
      }
    } else {
      for (let i = 0; i < count; i++) {
        events.push({
          getId: () => `mock_${c.id}_evt_${i + 1}`,
          getTitle: () => `งานงวดที่ ${i + 1} • ตามแผน [${c.label}] [สถาปัตย์]`,
          getStartTime: () => new Date(`2026-10-${String((i % 25) + 1).padStart(2, '0')}T08:00:00+07:00`),
          setTitle: () => {},
          setTag: () => {},
        });
      }
    }
    mockCalMap.set(c.id, {
      getEvents: () => events,
    });
  });

  global.CalendarApp = {
    getCalendarById: id => mockCalMap.get(id) || null,
  };
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {},
    }),
  };
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: key => key === 'CALENDAR_SYNC_DRY_RUN' ? 'false' : null,
    }),
  };
  global.Logger = { log: () => {} };

  // Register authorized source provider returning delta progress for Villa 6 (30% -> 60%)
  setGlobalCalendarSourceProvider_(() => [
    {
      sourceKey: 'gcal:villa:plot_6:โครงสร้าง:งานเทพื้นคอนกรีต:2026-10-24',
      detail: 'งานเทพื้นคอนกรีต 60%',
      task_name: 'งานเทพื้นคอนกรีต 60%',
      status: 'ดำเนินการ',
      location: 'Villa 6',
      workGroup: 'โครงสร้าง',
      date: '2026-10-24',
      domain: 'plan',
      isActual: false,
    }
  ]);

  try {
    // INVOKE WITH NO ARGUMENTS (as Apps Script trigger would)
    const result = syncGoogleCalendarScheduledJob();

    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.dryRun, false);
    assert.equal(result.totalItems, 1);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.createdCount, 0, 'No new event created');
    assert.equal(result.noopCount, 0);

    // Assert exact Event ID is preserved Before & After
    assert.equal(result.updatedEvents[0].eventId, initialEventId, 'Event ID must match before/after');
    assert.equal(result.updatedEvents[0].oldTitle, 'งานเทพื้นคอนกรีต 30% • ดำเนินการ [Villa 6] [โครงสร้าง]');
    assert.equal(result.updatedEvents[0].newTitle, 'งานเทพื้นคอนกรีต 60% • ดำเนินการ [Villa 6] [โครงสร้าง]');
    assert.equal(result.updatedEvents[0].verified, true, 'Destination readback must be true');

    // Confirm destination event title actually changed
    assert.equal(eventTitle, 'งานเทพื้นคอนกรีต 60% • ดำเนินการ [Villa 6] [โครงสร้าง]');
  } finally {
    setGlobalCalendarSourceProvider_(null);
    delete global.CalendarApp;
    delete global.LockService;
    delete global.PropertiesService;
    delete global.Logger;
  }
});

test('syncGoogleCalendarScheduledJob fails closed to reviewQueue when destination readback fails', () => {
  const { syncGoogleCalendarScheduledJob } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const p9CalId = '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';

  // Broken event where setTitle does not update getTitle
  const faultyEvent = {
    getId: () => 'gcal_faulty_001',
    getTitle: () => 'งานติดตั้งหน้าต่าง 10% • ตามแผน [Plot 9] [สถาปัตย์]',
    getStartTime: () => new Date('2026-10-24T08:00:00+07:00'),
    setTitle: () => { /* fails silently, does not update */ },
    setTag: () => {},
  };

  global.CalendarApp = {
    getCalendarById: id => ({
      getEvents: () => id === p9CalId ? [faultyEvent] : [],
    }),
  };
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {},
    }),
  };
  global.Logger = { log: () => {} };

  try {
    const incomingItem = {
      calendarId: p9CalId,
      detail: 'งานติดตั้งหน้าต่าง 40%',
      status: 'ตามแผน',
      location: 'Plot 9',
      workGroup: 'สถาปัตย์',
      date: '2026-10-24',
    };

    assert.throws(() => {
      syncGoogleCalendarScheduledJob([incomingItem], { dryRun: false, allowCountMismatch: true });
    }, /DESTINATION_READBACK_MISMATCH/, 'Must throw on destination readback mismatch');
  } finally {
    delete global.CalendarApp;
    delete global.LockService;
    delete global.Logger;
  }
});

test('dryRunGoogleCalendarSync safely handles null/empty titles and timezone date formatting', () => {
  const { dryRunGoogleCalendarSync } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const nullTitleEvent = {
    getId: () => 'evt_null_title',
    getTitle: () => null, // null title must not throw TypeError
    getStartTime: () => new Date('2026-10-24T00:00:00+07:00'),
  };

  const emptyTitleEvent = {
    getId: () => 'evt_empty_title',
    getTitle: () => '',
    getStartTime: () => new Date('2026-10-24T12:00:00+07:00'),
  };

  global.CalendarApp = {
    getCalendarById: () => ({
      getEvents: () => [nullTitleEvent, emptyTitleEvent],
    }),
  };

  try {
    const res = dryRunGoogleCalendarSync();
    assert.equal(res.status, 'REVIEW_HOLD');
    assert.equal(res.error, 'UNFORMATTED_EVENTS_DETECTED');
    assert.equal(res.needsFormattingCount, 14); // 2 events * 7 calendars
  } finally {
    delete global.CalendarApp;
  }
});

test('diagnoseCalendarAccess20261024 inspects all 7 calendars and Supabase connectivity', () => {
  const { diagnoseCalendarAccess20261024, GCAL_AUTO_SYNC_20261023 } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const calendars = GCAL_AUTO_SYNC_20261023.CALENDARS;
  // Mock where calendar 4 (Villa 6) is not accessible (returns null)
  global.CalendarApp = {
    getCalendarById: (id) => {
      if (id === calendars[3].id) return null;
      return {
        getName: () => 'Mock ' + id.slice(0, 8),
        getTimeZone: () => 'Asia/Bangkok',
        getEvents: () => [{ id: 'evt_1' }, { id: 'evt_2' }],
      };
    },
  };
  global.Logger = { log: () => {} };

  try {
    const report = diagnoseCalendarAccess20261024();
    assert.equal(report.calendarAppAvailable, true);
    assert.equal(report.totalAccessible, 6);
    assert.equal(report.calendars.length, 7);
    assert.equal(report.calendars[3].accessible, false);
    assert.equal(report.totalEvents, 12);
  } finally {
    delete global.CalendarApp;
    delete global.Logger;
  }
});

test('fetchAuthorizedCalendarSourceItems_ maps real actual_progress and site_status without fabricated values or guessing Actual from site_status', () => {
  const { fetchAuthorizedCalendarSourceItems_, resolveCalendarIdForTask } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const p9CalId = '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';
  const siteActualCalId = '9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com';

  const mockTasks = [
    {
      id: 'task_001',
      source_identity: 'task:task_001',
      task_name: 'งานสถาปัตยกรรม',
      area: 'Plot 9',
      category: 'สถาปัตย์',
      planned_start: '2026-10-20',
      planned_end: '2026-10-30',
      actual_progress: 0.259, // 25.9% -> 26%
      site_status: 'ล่าช้า',
    },
    {
      id: 'task_002',
      source_identity: 'task:task_002',
      task_name: 'Cleaning A221/A222',
      area: 'Condo A',
      category: 'Cleaning',
      planned_start: '2026-10-22',
      planned_end: '2026-10-25',
      actual_progress: 0,
      site_status: 'ยังไม่เริ่ม', // One of 71 production tasks with 'ยังไม่เริ่ม'
    },
    {
      id: 'task_003',
      source_identity: 'actual:site_001',
      task_name: 'งานเทปูนพื้นถนนจริง',
      area: 'Site',
      category: 'โครงสร้าง',
      planned_start: '2026-10-23',
      planned_end: '2026-10-23',
      actual_progress: 1.0,
      site_status: 'ผ่าน/เสร็จ',
    },
  ];

  global.buildContext_ = () => ({});
  global.sbGetAll_ = (ctx, query) => {
    // Assert query uses ONLY verified Production columns
    assert(query.includes('actual_progress'));
    assert(query.includes('site_status'));
    assert(query.includes('area'));
    assert(query.includes('task_name'));
    // Assert query DOES NOT query non-existent columns
    assert(!query.includes('current_plan_progress'), 'MUST NOT query current_plan_progress (non-existent in schedule_tasks)');
    assert(!query.includes('imported_plan_progress'), 'MUST NOT query imported_plan_progress (non-existent in schedule_tasks)');
    assert(!query.includes('plan_status'), 'MUST NOT query plan_status');
    return mockTasks;
  };

  try {
    const items = fetchAuthorizedCalendarSourceItems_();
    assert.equal(items.length, 3);

    // Task 1: Plot 9 task with progress 26% and status 'ล่าช้า'
    // Plan milestone with progress; routes to Plot 9 Villa calendar, NOT Site / Actual!
    assert.equal(items[0].progress, 26);
    assert.equal(items[0].status, 'ล่าช้า');
    assert.equal(items[0].detail, 'งานสถาปัตยกรรม 26%');
    assert.equal(items[0].isActual, false, 'Plot task must NOT be marked Actual solely because of site_status');
    assert.equal(items[0].domain, 'plan');
    assert.equal(resolveCalendarIdForTask(items[0]), p9CalId, 'Plot 9 task must route to Villa 9 calendar');

    // Task 2: 71 tasks with 'ยังไม่เริ่ม' and actual_progress 0 must remain plan
    assert.equal(items[1].progress, 0);
    assert.equal(items[1].status, 'ยังไม่เริ่ม');
    assert.equal(items[1].detail, 'Cleaning A221/A222');
    assert.equal(items[1].isActual, false);
    assert.equal(items[1].domain, 'plan');

    // Task 3: Real actual task with explicit evidence ('Site', 'จริง', 'actual')
    assert.equal(items[2].progress, 100);
    assert.equal(items[2].status, 'ผ่าน/เสร็จ');
    assert.equal(items[2].detail, 'งานเทปูนพื้นถนนจริง 100%');
    assert.equal(items[2].isActual, true);
    assert.equal(items[2].domain, 'actual');
    assert.equal(resolveCalendarIdForTask(items[2]), siteActualCalId, 'Actual task must route to Site / Actual');
  } finally {
    delete global.buildContext_;
    delete global.sbGetAll_;
  }
});

test('syncGoogleCalendarScheduledJob supports skipLock to prevent nested LockService deadlock', () => {
  const { syncGoogleCalendarScheduledJob } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  let lockAcquired = false;
  global.CalendarApp = {
    getCalendarById: () => ({
      getEvents: () => [],
    }),
  };
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        lockAcquired = true;
        return true;
      },
      releaseLock: () => {},
    }),
  };

  try {
    // When skipLock is true, LockService must NOT be acquired
    syncGoogleCalendarScheduledJob([], { skipLock: true, allowCountMismatch: true });
    assert.equal(lockAcquired, false, 'Lock must NOT be acquired when skipLock is true');

    // When skipLock is false/omitted, LockService must be acquired
    syncGoogleCalendarScheduledJob([], { skipLock: false, allowCountMismatch: true });
    assert.equal(lockAcquired, true, 'Lock must be acquired when skipLock is false');
  } finally {
    delete global.CalendarApp;
    delete global.LockService;
  }
});

test('301 active tasks reconciliation: unmatched tasks fail closed without creating unwanted events', () => {
  const { syncGoogleCalendarScheduledJob } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const p9CalId = '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';
  let eventTitle = 'งานสถาปัตยกรรม 25.9% • ล่าช้า [Plot 9] [สถาปัตย์]';
  const existingEvent = {
    getId: () => 'gcal_existing_001',
    getTitle: () => eventTitle,
    getDescription: () => '[3Kings-Key: gcal:villa:plot_9:สถาปัตย์:งานสถาปัตยกรรม:2026-10-24]',
    getTag: () => 'gcal:villa:plot_9:สถาปัตย์:งานสถาปัตยกรรม:2026-10-24',
    getStartTime: () => new Date('2026-10-24T08:00:00+07:00'),
    setTitle: (t) => { eventTitle = t; },
    setTag: () => {},
  };

  global.CalendarApp = {
    getCalendarById: (id) => ({
      getEvents: () => id === p9CalId ? [existingEvent] : [],
      createEvent: () => { throw new Error('MUST_NOT_BE_CALLED'); },
    }),
  };
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {},
    }),
  };

  try {
    // Simulate 10 incoming tasks: 1 matched with progress change, 9 unmapped tasks
    const tasks = [
      {
        calendarId: p9CalId,
        detail: 'งานสถาปัตยกรรม 27.5%',
        status: 'ล่าช้า',
        location: 'Plot 9',
        workGroup: 'สถาปัตย์',
        date: '2026-10-24',
      }
    ];
    for (let i = 1; i <= 9; i++) {
      tasks.push({
        calendarId: p9CalId,
        detail: 'Unmatched Task ' + i,
        status: 'แผนงาน',
        location: 'Condo Area ' + i,
        workGroup: 'งานระบบ',
        date: '2026-11-0' + i,
      });
    }

    // Run scheduled job with allowCountMismatch: true, dryRun: false, allowCreate: false
    const res = syncGoogleCalendarScheduledJob(tasks, {
      dryRun: false,
      allowCreate: false,
      allowCountMismatch: true,
      failOnUnmatched: false,
    });

    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.updatedCount, 1);
    assert.equal(res.createdCount, 0, 'Zero events created!');
    assert.equal(res.unmatchedCount, 9, '9 tasks safely identified as unmatched');
    assert.equal(eventTitle, 'งานสถาปัตยกรรม 27.5% • ล่าช้า [Plot 9] [สถาปัตย์]');
  } finally {
    delete global.CalendarApp;
    delete global.LockService;
  }
});

test('71 tasks with site_status = "ยังไม่เริ่ม" and actual_progress = 0 remain domain: "plan" and do not misroute to Site / Actual', () => {
  const { mapScheduleTaskToCalendarItem_, resolveCalendarIdForTask } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const v6CalId = '9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com';
  const v7CalId = '7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com';
  const v8CalId = 'd31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com';
  const v9CalId = '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';
  const planCalId = 'family17900518303332507254@group.calendar.google.com';
  const siteActualCalId = '9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com';

  // Generate 71 tasks with site_status = 'ยังไม่เริ่ม', actual_progress = 0 across Plots and Plan
  const areas = ['Plot 6', 'Plot 7', 'Plot 8', 'Plot 9', 'Condo A', 'Condo B'];
  for (let i = 1; i <= 71; i++) {
    const area = areas[i % areas.length];
    const task = {
      id: `task_not_started_${i}`,
      source_identity: `sched:${i}`,
      source_task_no: `${i}`,
      task_name: `งานเตรียมการ ${i}`,
      area: area,
      category: 'เตรียมงาน',
      planned_start: '2026-11-01',
      planned_end: '2026-11-15',
      actual_start: null,
      actual_end: null,
      actual_progress: 0,
      site_status: 'ยังไม่เริ่ม',
      project_id: 'p1',
      is_active: true,
    };

    const item = mapScheduleTaskToCalendarItem_(task);
    assert.equal(item.isActual, false, `Task ${i} must NOT be marked Actual solely because site_status exists`);
    assert.equal(item.domain, 'plan', `Task ${i} domain must be plan`);
    assert.equal(item.status, 'ยังไม่เริ่ม');
    assert.equal(item.detail, `งานเตรียมการ ${i}`);

    const targetCalId = resolveCalendarIdForTask(item);
    assert.notEqual(targetCalId, siteActualCalId, `Task ${i} in ${area} with 'ยังไม่เริ่ม' must NEVER route to Site / Actual`);

    if (area === 'Plot 6') assert.equal(targetCalId, v6CalId);
    else if (area === 'Plot 7') assert.equal(targetCalId, v7CalId);
    else if (area === 'Plot 8') assert.equal(targetCalId, v8CalId);
    else if (area === 'Plot 9') assert.equal(targetCalId, v9CalId);
    else assert.equal(targetCalId, planCalId);
  }
});

test('fetchAuthorizedCalendarSourceItems_ and syncGoogleCalendarScheduledJob fail closed on HTTP/SQL query error and empty source', () => {
  const { fetchAuthorizedCalendarSourceItems_, syncGoogleCalendarScheduledJob } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  // Case 1: Query throws error (e.g. column current_plan_progress does not exist)
  global.buildContext_ = () => ({});
  global.sbGetAll_ = () => {
    throw new Error('column schedule_tasks.current_plan_progress does not exist');
  };

  try {
    assert.throws(
      () => fetchAuthorizedCalendarSourceItems_(),
      /column schedule_tasks\.current_plan_progress does not exist/,
      'fetchAuthorizedCalendarSourceItems_ must rethrow DB/REST errors'
    );

    // Case 2: syncGoogleCalendarScheduledJob called with no args when DB error occurs
    // CalendarApp must exist to pass pre-audit check
    global.CalendarApp = {
      getCalendarById: () => ({
        getEvents: () => [],
      }),
    };
    global.LockService = {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {},
      }),
    };

    const resError = syncGoogleCalendarScheduledJob(null, { skipLock: true, allowCountMismatch: true });
    assert.equal(resError.status, 'ERROR');
    assert.equal(resError.error, 'SOURCE_FETCH_FAILED');
    assert(resError.details.includes('current_plan_progress'));

    // Case 3: Empty source items returned from DB (no items found)
    global.sbGetAll_ = () => [];
    const resEmpty = syncGoogleCalendarScheduledJob(null, { skipLock: true, allowCountMismatch: true });
    assert.equal(resEmpty.status, 'HOLD');
    assert.equal(resEmpty.reason, 'NO_SOURCE_ITEMS_FOUND_FAIL_CLOSED');
  } finally {
    delete global.buildContext_;
    delete global.sbGetAll_;
    delete global.CalendarApp;
    delete global.LockService;
  }
});

test('syncShiftHourly20261013 never claims slot or persists success marker when CALENDAR_SYNC_ENABLED is false or not set', () => {
  const fs = require('fs');
  const schedulerCode = fs.readFileSync('docs/apps-script/ShiftSyncScheduler_2026-10-13.gs', 'utf8');

  // Load scheduler in isolated mock sandbox
  const setProperties = {};
  const deletedProperties = [];
  const mockScriptProperties = {
    getProperty: (k) => setProperties[k] || null,
    setProperty: (k, v) => { setProperties[k] = v; },
    deleteProperty: (k) => {
      deletedProperties.push(k);
      delete setProperties[k];
    },
    getProperties: () => ({ ...setProperties }),
  };

  const sandbox = {
    PropertiesService: {
      getScriptProperties: () => mockScriptProperties,
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {},
      }),
    },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        if (fmt === 'yyyy-MM-dd') return '2026-10-24';
        if (fmt === 'H') return '10'; // 10:00 (inside 08..18 shift)
        if (fmt === 'm') return '15';
        return '2026-10-24';
      },
    },
    console: { log: () => {}, error: () => {} },
    buildContext_: () => ({ rootFolder: {} }),
    getUniqueChildFolderByName_: () => ({}),
    loadProjectMap_: () => ({}),
    requireProjects_: () => {},
    syncProgressPlot_: () => ({ status: 'ok' }),
    syncMaterialsWorkbook_: () => ({ status: 'ok' }),
    smartSyncDefectsV13_15m: () => ({ status: 'ok' }),
    syncGoogleCalendarScheduledJob: () => ({ status: 'success' }),
    CFG: { ABOVE_FOLDER_NAME: 'Above', VILLA_FOLDER_NAME: 'Villa', MATERIALS_FOLDER_NAME: 'Materials' },
  };

  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(schedulerCode, sandbox);

  // Subcase A: CALENDAR_SYNC_ENABLED is NOT set (default)
  const out1 = sandbox.syncShiftHourly20261013();
  assert.equal(out1.calendar.status, 'skipped');
  assert.equal(out1.calendar.reason, 'CALENDAR_SYNC_NOT_ENABLED_FAIL_CLOSED');
  // Verify NO calendar-sync slot property was ever set in PropertiesService!
  const calendarKeys1 = Object.keys(setProperties).filter(k => k.includes('calendar-sync'));
  assert.equal(calendarKeys1.length, 0, 'No calendar-sync slot key must be set when gate is closed');

  // Subcase B: CALENDAR_SYNC_ENABLED is explicitly 'false'
  setProperties['CALENDAR_SYNC_ENABLED'] = 'false';
  const out2 = sandbox.syncShiftHourly20261013();
  assert.equal(out2.calendar.status, 'skipped');
  assert.equal(out2.calendar.reason, 'CALENDAR_SYNC_NOT_ENABLED_FAIL_CLOSED');
  const calendarKeys2 = Object.keys(setProperties).filter(k => k.includes('calendar-sync'));
  assert.equal(calendarKeys2.length, 0, 'No calendar-sync slot key must be set when disabled');

  // Subcase C: CALENDAR_SYNC_ENABLED is 'true' but job returns HOLD or ERROR
  setProperties['CALENDAR_SYNC_ENABLED'] = 'true';
  sandbox.syncGoogleCalendarScheduledJob = () => ({ status: 'HOLD', reason: 'CALENDAR_BASELINE_COUNT_MISMATCH_HOLD' });
  const out3 = sandbox.syncShiftHourly20261013();
  assert.equal(out3.calendar.status, 'error');
  // Slot key must have been deleted so it does not persist success
  const calendarKeys3 = Object.keys(setProperties).filter(k => k.includes('calendar-sync') && setProperties[k] === 'ok');
  assert.equal(calendarKeys3.length, 0, 'Slot key must be deleted on job HOLD/ERROR');
});

test('auditCalendarScriptProperties20261024 safely inspects properties without exposing secrets', () => {
  const { auditCalendarScriptProperties20261024 } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  const mockProps = {
    CALENDAR_SYNC_ENABLED: 'false',
    CALENDAR_SYNC_DRY_RUN: 'true',
    SUPABASE_URL: 'https://wtqubwdduzedmcvyhbgs.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'secret_service_role_key_value_do_not_expose',
    SUPABASE_ANON_KEY: 'secret_anon_key_value_do_not_expose',
  };

  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => mockProps[k] || null,
    }),
  };

  try {
    const audit = auditCalendarScriptProperties20261024();
    assert.equal(audit.calendarSyncEnabled, 'false');
    assert.equal(audit.calendarSyncDryRun, 'true');
    assert.equal(audit.supabaseUrlConfigured, true);
    assert.equal(audit.supabaseKeyConfigured, true);
    assert.equal(audit.isWritePathLocked, true, 'Write path must be locked when enabled is false');

    // Security assertion: audit object MUST NOT contain the secret keys!
    const jsonStr = JSON.stringify(audit);
    assert(!jsonStr.includes('secret_service_role_key_value_do_not_expose'), 'Secrets MUST NOT be leaked in audit report');
    assert(!jsonStr.includes('secret_anon_key_value_do_not_expose'), 'Secrets MUST NOT be leaked in audit report');
  } finally {
    delete global.PropertiesService;
  }
});

test('isIndependentSiteEvent_ preserves meetings and test events without matching schedule tasks', () => {
  // Test detection of meeting / test indicators
  assert.equal(isIndependentSiteEvent_({ title: 'ประชุมประจำสัปดาห์', description: '' }), true);
  assert.equal(isIndependentSiteEvent_({ title: 'Morning Meeting', description: '' }), true);
  assert.equal(isIndependentSiteEvent_({ title: 'Weekly Sync', description: 'TYPE: MEETING' }), true);
  assert.equal(isIndependentSiteEvent_({ title: 'Water Pressure Test', description: 'TYPE: TEST\nTested by QC' }), true);
  assert.equal(isIndependentSiteEvent_({ title: '[TEST] Smoke Detector Test', description: '' }), true);
  assert.equal(isIndependentSiteEvent_({ title: 'ทดสอบระบบไฟฟ้า', description: '' }), true);

  // Normal tasks must NOT be classified as independent site events
  assert.equal(isIndependentSiteEvent_({ title: 'งานสถาปัตยกรรม 25.9% • ล่าช้า [Plot 9] [สถาปัตย์]', description: '' }), false);
  assert.equal(isIndependentSiteEvent_({ title: 'งานโครงสร้าง 100% • เสร็จสิ้น [Villa 8] [โครงสร้าง]', description: '' }), false);

  // Semantic reconciliation MUST NOT match a meeting event to a schedule task
  const existingEvents = [
    {
      id: 'event-meeting-site-1',
      title: 'ประชุมประสานงานหน้างาน [Site] [Meeting]',
      description: 'TYPE: MEETING\nDaily morning briefing',
      date: '2026-04-10',
      startDate: '2026-04-10',
    },
  ];

  const incomingTask = {
    detail: 'งานเทปูนฐานราก',
    status: 'แผนงาน',
    location: 'Site',
    workGroup: 'Meeting',
    date: '2026-04-10',
    startDate: '2026-04-10',
  };

  const decision = reconcileCalendarEvent(incomingTask, existingEvents, { dryRun: true });
  // Must NOT match the meeting event! Should return CREATE (unmatched)
  assert.notEqual(decision.action, 'UPDATE');
  assert.notEqual(decision.eventId, 'event-meeting-site-1');
  assert.equal(decision.action, 'CREATE');
});

test('syncGoogleCalendarScheduledJob prevents partial writes via two-phase execution (zero mutations on hold)', () => {
  const { syncGoogleCalendarScheduledJob } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  let titleSetCount = 0;
  const mockExistingEvent = {
    id: 'evt-update-1',
    title: 'งานโครงสร้าง 50% • กำลังทำ [Villa 8] [โครงสร้าง]',
    description: '',
    startDate: new Date('2026-05-01T09:00:00+07:00'),
    _raw: {
      getId: () => 'evt-update-1',
      getTitle: () => 'งานโครงสร้าง 50% • กำลังทำ [Villa 8] [โครงสร้าง]',
      setTitle: () => { titleSetCount++; },
      setTag: () => {},
    },
  };

  // Distinct titles on same date and trade that both match "งานสถาปัตย์"
  const mockAmbiguousEventA = {
    id: 'evt-amb-a',
    title: 'งานสถาปัตย์ ส่วนที่ 1 • แผนงาน [Villa 8] [สถาปัตย์]',
    description: '',
    startDate: new Date('2026-05-01T09:00:00+07:00'),
  };
  const mockAmbiguousEventB = {
    id: 'evt-amb-b',
    title: 'งานสถาปัตย์ ส่วนที่ 2 • แผนงาน [Villa 8] [สถาปัตย์]',
    description: '',
    startDate: new Date('2026-05-01T09:00:00+07:00'),
  };

  const villa8CalId = 'd31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com';

  global.CalendarApp = {
    getCalendarById: (id) => {
      if (id === villa8CalId) {
        return {
          getId: () => id,
          getName: () => '3K - Above Villa 8',
          getEvents: () => [
            {
              getId: () => mockExistingEvent.id,
              getTitle: () => mockExistingEvent.title,
              getDescription: () => '',
              getStartTime: () => mockExistingEvent.startDate,
              setTitle: mockExistingEvent._raw.setTitle,
              setTag: mockExistingEvent._raw.setTag,
            },
            {
              getId: () => mockAmbiguousEventA.id,
              getTitle: () => mockAmbiguousEventA.title,
              getDescription: () => '',
              getStartTime: () => mockAmbiguousEventA.startDate,
            },
            {
              getId: () => mockAmbiguousEventB.id,
              getTitle: () => mockAmbiguousEventB.title,
              getDescription: () => '',
              getStartTime: () => mockAmbiguousEventB.startDate,
            },
          ],
        };
      }
      return {
        getId: () => id,
        getName: () => 'Calendar ' + id,
        getEvents: () => [],
      };
    },
  };

  // 2 items: 1 would match and update (50% -> 60%), but the 2nd is ambiguous and triggers REVIEW
  const incomingItems = [
    {
      sourceKey: 'task-1',
      taskId: 'uuid-1',
      detail: 'งานโครงสร้าง 60%',
      task_name: 'งานโครงสร้าง',
      status: 'กำลังทำ',
      location: 'Villa 8',
      area: 'Villa 8',
      workGroup: 'โครงสร้าง',
      startDate: '2026-05-01',
      domain: 'plan',
      isActual: false,
    },
    {
      sourceKey: 'task-2',
      taskId: 'uuid-2',
      detail: 'งานสถาปัตย์',
      task_name: 'งานสถาปัตย์',
      status: 'แผนงาน',
      location: 'Villa 8',
      area: 'Villa 8',
      workGroup: 'สถาปัตย์',
      startDate: '2026-05-01',
      domain: 'plan',
      isActual: false,
    },
  ];

  try {
    const result = syncGoogleCalendarScheduledJob(incomingItems, {
      dryRun: false, // Live run requested
      skipLock: true,
      allowCountMismatch: true,
    });

    // Batch must be held due to ambiguous task 2
    assert.equal(result.status, 'HOLD');
    assert.equal(result.reviewCount, 1);
    // CRITICAL PARTIAL-WRITE PROTECTION ASSERTION:
    // Zero mutations must have occurred! Task 1 must NOT have been updated.
    assert.equal(titleSetCount, 0, 'Zero setTitle mutations must be executed when any item in batch holds!');
  } finally {
    delete global.CalendarApp;
  }
});

test('buildSourceToCalendarMatchLedger produces deterministic match ledger and preserves meetings/tests', () => {
  const villa9CalId = '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';

  const mockEvents = [
    {
      id: 'evt-villa-9-plan',
      title: 'งานทาสี 10% • แผนงาน [Villa 9] [สี]',
      description: '',
      startDate: '2026-06-01',
      date: '2026-06-01',
    },
    {
      id: 'evt-villa-9-meeting',
      title: 'ประชุมตรวจรับงาน [Villa 9] [Meeting]',
      description: 'TYPE: MEETING\nConsultant on site',
      startDate: '2026-06-01',
      date: '2026-06-01',
    },
  ];

  const incomingItems = [
    {
      sourceIdentity: 'v9-paint-01',
      taskId: 'uuid-paint-01',
      task_name: 'งานทาสี',
      detail: 'งานทาสี 10%',
      status: 'แผนงาน',
      location: 'Villa 9',
      area: 'Villa 9',
      workGroup: 'สี',
      startDate: '2026-06-01',
      domain: 'plan',
      isActual: false,
    },
    {
      sourceIdentity: 'v9-new-task-unmatched',
      taskId: 'uuid-unmatched-02',
      task_name: 'งานติดตั้งสุขภัณฑ์',
      detail: 'งานติดตั้งสุขภัณฑ์',
      status: 'แผนงาน',
      location: 'Villa 9',
      area: 'Villa 9',
      workGroup: 'สุขาภิบาล',
      startDate: '2026-06-15',
      domain: 'plan',
      isActual: false,
    },
  ];

  const result = buildSourceToCalendarMatchLedger(incomingItems, {
    eventsByCalendar: {
      [villa9CalId]: mockEvents,
    },
  });

  assert.equal(result.totalSourceItems, 2);
  assert.equal(result.preservedIndependentCount, 1);
  assert.equal(result.independentEvents[0].eventId, 'evt-villa-9-meeting');
  assert.equal(result.independentEvents[0].preserved, true);

  // Match ledger entries
  assert.equal(result.ledger.length, 2);
  const matched = result.ledger[0];
  assert.equal(matched.sourceIdentity, 'v9-paint-01');
  assert.equal(matched.matchedEventId, 'evt-villa-9-plan');
  assert.equal(matched.action, 'NOOP');
  assert.equal(matched.status, 'MATCHED');

  const unmatched = result.ledger[1];
  assert.equal(unmatched.sourceIdentity, 'v9-new-task-unmatched');
  assert.equal(unmatched.action, 'CREATE');
  assert.equal(unmatched.status, 'HOLD_UNMATCHED');
});

test('mapScheduleTaskToCalendarItem_ strictly forbids inferring Actual from actual_progress > 0 alone', () => {
  const { mapScheduleTaskToCalendarItem_ } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');

  // Task with actual_progress = 0.55 (55%), site_status = 'กำลังดำเนินการ', but no explicit actual markers
  const task = {
    id: 'task-prog-plan-1',
    source_identity: 'task-sched-101',
    task_name: 'งานโครงสร้างชั้น 2',
    area: 'Villa 8',
    category: 'โครงสร้าง',
    planned_start: '2026-07-01',
    planned_end: '2026-07-15',
    actual_progress: 0.55,
    site_status: 'กำลังดำเนินการ',
  };

  const mapped = mapScheduleTaskToCalendarItem_(task);

  // CRITICAL RULE VERIFICATION:
  // actual_progress > 0 alone MUST NOT cause domain to become 'actual' or isActual to become true!
  assert.equal(mapped.progress, 55);
  assert.equal(mapped.domain, 'plan', 'Must remain domain: "plan" without explicit actual markers');
  assert.equal(mapped.isActual, false, 'isActual must be false without explicit actual markers');
  assert.equal(mapped.detail, 'งานโครงสร้างชั้น 2 55%');
});

test('scheduled calendar auto sync defaults to HOLD with zero writes if source items are unmatched', () => {
  const { syncGoogleCalendarScheduledJob } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');
  const calendarId = '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';
  let liveTitle = 'งานกระเบื้อง 50% • กำลังดำเนินการ [Plot 9] [กระเบื้อง]';
  let writeCount = 0;
  const existing = {
    getId: () => 'existing-event-1',
    getTitle: () => liveTitle,
    getDescription: () => '',
    getTag: () => '',
    getStartTime: () => new Date('2026-10-24T08:00:00+07:00'),
    setTitle: title => { writeCount++; liveTitle = title; },
    setTag: () => { writeCount++; },
  };
  global.CalendarApp = {
    getCalendarById: id => ({
      getEvents: () => id === calendarId ? [existing] : [],
    }),
  };
  global.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {},
    }),
  };
  global.Logger = { log: () => {} };
  try {
    const result = syncGoogleCalendarScheduledJob([
      {
        calendarId,
        storedEventId: 'existing-event-1',
        detail: 'งานกระเบื้อง 75%',
        status: 'กำลังดำเนินการ',
        location: 'Plot 9',
        workGroup: 'กระเบื้อง',
        date: '2026-10-24',
      },
      {
        calendarId,
        detail: 'งานใหม่ยังไม่จับคู่',
        status: 'แผน',
        location: 'Plot 9',
        workGroup: 'งานระบบ',
        date: '2026-11-20',
      },
    ], {
      dryRun: false,
      allowCreate: false,
      allowCountMismatch: true,
      // Intentionally omit failOnUnmatched: production default must be fail-closed.
    });
    assert.equal(result.status, 'HOLD');
    assert.equal(result.unmatchedCount, 1);
    assert.equal(result.reviewCount, 1);
    assert.equal(result.updatedCount, 0);
    assert.equal(result.createdCount, 0);
    assert.equal(writeCount, 0, 'No setTitle/setTag should run for partially matched batches');
    assert.equal(liveTitle, 'งานกระเบื้อง 50% • กำลังดำเนินการ [Plot 9] [กระเบื้อง]');
  } finally {
    delete global.CalendarApp;
    delete global.LockService;
    delete global.Logger;
  }
});
