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

