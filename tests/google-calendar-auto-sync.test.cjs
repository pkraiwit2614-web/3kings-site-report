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

test('dryRunGoogleCalendarSync audits all 7 production calendars against 188 baseline events without mutations', () => {
  const { dryRunGoogleCalendarSync } = require('../docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs');
  const calendars = GCAL_AUTO_SYNC_20261023.CALENDARS;

  // Build mock CalendarApp returning exactly 188 events across the 7 calendars
  const mockCalMap = new Map();
  calendars.forEach((c, idx) => {
    const count = idx === 0 ? 34 : idx === 1 ? 44 : idx === 2 ? 30 : 20;
    const events = [];
    for (let i = 0; i < count; i++) {
      events.push({
        getTitle: () => `งานสถาปัตยกรรม 25.9% • ล่าช้า [${c.label}] [สถาปัตย์]`,
        getId: () => `mock_${c.id}_${i}`,
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
    assert.equal(audit.baselineTarget, 188);
    assert.equal(audit.totalEvents, 188);
    assert.equal(audit.createdCount, 0);
    assert.equal(audit.formattedCount, 188);
    assert.equal(audit.needsFormattingCount, 0);
    assert.equal(audit.calendars.length, 7);
    audit.calendars.forEach(c => assert.equal(c.status, 'OK'));
  } finally {
    delete global.CalendarApp;
    delete global.Logger;
  }
});

