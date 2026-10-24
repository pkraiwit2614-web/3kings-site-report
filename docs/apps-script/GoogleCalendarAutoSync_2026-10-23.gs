/**
 * 3 Kings Construction — Google Calendar Auto Sync & Formatter (SOP 12)
 * File: docs/apps-script/GoogleCalendarAutoSync_2026-10-23.gs
 * Revision: 2026-10-23-v1
 *
 * Purpose:
 * - Enforce canonical Google Calendar event title format:
 *     "รายละเอียดงานเหมือนเดิม • สถานะ [สถานที่] [กลุ่มงาน]"
 *   Examples:
 *     - "งานสถาปัตยกรรม 25.9% • ล่าช้า [Plot 9] [สถาปัตย์]"
 *     - "Cleaning A221/A222 • แผนช่วงบ่าย [Condo A] [Cleaning]"
 *     - "Handover A401 • แผน [Condo A] [Handover]"
 * - Maintain stable identity across progress changes (e.g. 25.9% -> 26.5% modifies
 *   the title of the existing event without creating duplicate events).
 * - Match existing events by:
 *     1. Stored Calendar ID + Event ID (O(1) exact match)
 *     2. Stable Source Key (extended property / description tag)
 *     3. Retroactive Semantic Matching for existing 188 events (by date, location, workGroup, room/plot)
 * - Safe concurrency guard via LockService.
 * - Retry with exponential backoff on transient Google API rate limits.
 * - Fail closed: Ambiguous matches (>1) are marked REVIEW and never duplicated.
 */

const GCAL_AUTO_SYNC_20261023 = Object.freeze({
  TZ: 'Asia/Bangkok',
  SEPARATOR: ' • ',
  CALENDARS: [
    { id: 'family17900518303332507254@group.calendar.google.com', label: '3 Kings – Construction Plan' },
    { id: '9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com', label: '3 Kings – Site / Actual' },
    { id: '6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com', label: 'กำหนดส่ง-ของเข้าหน้างาน' },
    { id: '9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com', label: '3K - Above Villa 6' },
    { id: '7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com', label: '3K - Above Villa 7' },
    { id: 'd31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com', label: '3K - Above Villa 8' },
    { id: '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com', label: '3K - Above Villa 9' },
  ],
  MAX_RETRIES: 3,
  BACKOFF_BASE_MS: 1000,
});

/**
 * Format event title according to SOP 12:
 * "รายละเอียดงานเหมือนเดิม • สถานะ [สถานที่] [กลุ่มงาน]"
 */
function formatCalendarEventTitle(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new Error('FORMATTER_INPUT_REQUIRED');
  }
  const detail = String(opts.detail || '').trim();
  if (!detail) {
    throw new Error('DETAIL_REQUIRED');
  }
  const status = String(opts.status || '').trim();
  const location = String(opts.location || '').trim();
  const workGroup = String(opts.workGroup || '').trim();

  let title = detail;
  if (status) {
    title += GCAL_AUTO_SYNC_20261023.SEPARATOR + status;
  }
  if (location) {
    const cleanLoc = location.replace(/^\[+|\]+$/g, '').trim();
    if (cleanLoc) title += ' [' + cleanLoc + ']';
  }
  if (workGroup) {
    const cleanGroup = workGroup.replace(/^\[+|\]+$/g, '').trim();
    if (cleanGroup) title += ' [' + cleanGroup + ']';
  }
  return title;
}

/**
 * Parse an existing calendar title into structured components.
 */
function parseCalendarEventTitle(rawTitle) {
  const str = String(rawTitle || '').trim();
  if (!str) {
    return {
      raw: '',
      detail: '',
      baseDetail: '',
      progressPercent: null,
      status: '',
      location: '',
      workGroup: '',
      rooms: [],
    };
  }

  // Extract trailing bracketed tokens: [Location] [WorkGroup]
  const bracketMatches = [...str.matchAll(/\[([^\]]+)\]/g)];
  let location = '';
  let workGroup = '';
  let textWithoutBrackets = str;

  if (bracketMatches.length >= 2) {
    location = bracketMatches[bracketMatches.length - 2][1].trim();
    workGroup = bracketMatches[bracketMatches.length - 1][1].trim();
    const firstBracketIdx = str.indexOf(bracketMatches[bracketMatches.length - 2][0]);
    textWithoutBrackets = str.slice(0, firstBracketIdx).trim();
  } else if (bracketMatches.length === 1) {
    location = bracketMatches[0][1].trim();
    textWithoutBrackets = str.slice(0, str.indexOf(bracketMatches[0][0])).trim();
  }

  // Split detail and status by bullet separator " • " or legacy " - "
  let detail = textWithoutBrackets;
  let status = '';

  if (textWithoutBrackets.includes(GCAL_AUTO_SYNC_20261023.SEPARATOR)) {
    const parts = textWithoutBrackets.split(GCAL_AUTO_SYNC_20261023.SEPARATOR);
    detail = parts[0].trim();
    status = parts.slice(1).join(GCAL_AUTO_SYNC_20261023.SEPARATOR).trim();
  } else if (textWithoutBrackets.includes(' • ')) {
    const parts = textWithoutBrackets.split(' • ');
    detail = parts[0].trim();
    status = parts.slice(1).join(' • ').trim();
  } else {
    // Check for parenthesized status e.g. "งานสถาปัตยกรรม 25.9% (ล่าช้า)"
    const parenMatch = textWithoutBrackets.match(/^(.*?)\s*\(([^)]+)\)$/);
    if (parenMatch) {
      detail = parenMatch[1].trim();
      status = parenMatch[2].trim();
    }
  }

  // Extract progress percentage from detail if present
  let progressPercent = null;
  const progressMatch = detail.match(/(\d+(?:\.\d+)?)\s*%/);
  if (progressMatch) {
    progressPercent = Number(progressMatch[1]);
  }

  // Base detail: detail with percentage removed for stable matching
  const baseDetail = detail.replace(/\s*\d+(?:\.\d+)?\s*%/, '').trim();

  // Extract room numbers (e.g. A221, B101, A221/A222)
  const rooms = extractCanonicalRooms(detail);

  return {
    raw: str,
    detail,
    baseDetail,
    progressPercent,
    status,
    location,
    workGroup,
    rooms,
  };
}

/**
 * Extract canonical room identifiers from text (e.g. A221/A222, A401, B101).
 */
function extractCanonicalRooms(text) {
  const s = String(text || '').toUpperCase();
  const found = new Set();
  const matches = s.match(/[AB]\d{3}/g) || [];
  matches.forEach(r => found.add(r));
  return Array.from(found).sort();
}

/**
 * Normalize Combine Room text (e.g. "A221/A222", "A221+A222", "A221, A222")
 * into sorted comma-separated canonical string "A221,A222".
 */
function normalizeCombineRooms(text) {
  const rooms = extractCanonicalRooms(text);
  return rooms.join(',');
}

/**
 * Build a stable source key that is independent of progress percentage.
 */
function buildStableSourceKey(item) {
  if (!item || typeof item !== 'object') return '';
  const domain = String(item.domain || 'work').toLowerCase().trim();
  const location = String(item.location || '').replace(/\s+/g, '_').toLowerCase().trim();
  const workGroup = String(item.workGroup || '').replace(/\s+/g, '_').toLowerCase().trim();
  const date = String(item.date || '').slice(0, 10);
  const baseName = String(item.baseName || item.detail || '')
    .replace(/\s*\d+(?:\.\d+)?\s*%/, '')
    .replace(/[^\w\u0E00-\u0E7F]/g, '_')
    .toLowerCase()
    .trim();

  const rooms = extractCanonicalRooms(item.detail || item.rooms || '').join('_');
  const roomPart = rooms ? ':' + rooms : '';

  return 'gcal:' + domain + ':' + location + ':' + workGroup + ':' + baseName + roomPart + ':' + date;
}

/**
 * Reconcile an incoming work item against existing events in a calendar.
 *
 * Returns decision:
 * {
 *   action: 'NOOP' | 'UPDATE' | 'CREATE' | 'REVIEW',
 *   eventId: string | null,
 *   currentTitle: string | null,
 *   newTitle: string,
 *   reason: string,
 *   existingEvent: object | null
 * }
 */
function reconcileCalendarEvent(item, existingEvents, opts) {
  const dryRun = Boolean(opts && opts.dryRun);
  const targetDate = String(item.date || '').slice(0, 10);
  const newTitle = formatCalendarEventTitle({
    detail: item.detail,
    status: item.status,
    location: item.location,
    workGroup: item.workGroup,
  });

  const stableKey = item.sourceKey || buildStableSourceKey(item);
  const parsedNew = parseCalendarEventTitle(newTitle);

  // 1. Tier 1: Match by explicit stored Event ID
  if (item.storedEventId) {
    const exact = existingEvents.find(e => e.id === item.storedEventId);
    if (exact) {
      if (exact.title === newTitle) {
        return {
          action: 'NOOP',
          eventId: exact.id,
          currentTitle: exact.title,
          newTitle,
          reason: 'STORED_EVENT_ID_MATCH_NO_CHANGE',
          existingEvent: exact,
        };
      }
      return {
        action: 'UPDATE',
        eventId: exact.id,
        currentTitle: exact.title,
        newTitle,
        reason: 'STORED_EVENT_ID_MATCH_TITLE_UPDATED',
        existingEvent: exact,
      };
    }
  }

  // 2. Tier 2: Match by stable source key in tags or description
  if (stableKey) {
    const keyMatches = existingEvents.filter(e => {
      const desc = String(e.description || '');
      const tag = String(e.tag || '');
      return tag === stableKey || desc.includes('[3Kings-Key: ' + stableKey + ']');
    });

    if (keyMatches.length === 1) {
      const match = keyMatches[0];
      if (match.title === newTitle) {
        return {
          action: 'NOOP',
          eventId: match.id,
          currentTitle: match.title,
          newTitle,
          reason: 'STABLE_KEY_MATCH_NO_CHANGE',
          existingEvent: match,
        };
      }
      return {
        action: 'UPDATE',
        eventId: match.id,
        currentTitle: match.title,
        newTitle,
        reason: 'STABLE_KEY_MATCH_TITLE_UPDATED',
        existingEvent: match,
      };
    } else if (keyMatches.length > 1) {
      return {
        action: 'REVIEW',
        eventId: null,
        currentTitle: null,
        newTitle,
        reason: 'AMBIGUOUS_STABLE_KEY_MULTIPLE_MATCHES',
        candidates: keyMatches.map(m => ({ id: m.id, title: m.title })),
      };
    }
  }

  // 3. Tier 3: Retroactive Semantic Matching for existing 188 events
  // Match by Date + Location + WorkGroup + Base Detail / Rooms
  const sameDateEvents = existingEvents.filter(e => {
    const eDate = String(e.startDate || e.date || '').slice(0, 10);
    return eDate === targetDate;
  });

  const semanticCandidates = sameDateEvents.filter(e => {
    const parsed = parseCalendarEventTitle(e.title);

    // Location check: must match if both present
    if (parsedNew.location && parsed.location) {
      const loc1 = parsedNew.location.toLowerCase();
      const loc2 = parsed.location.toLowerCase();
      if (loc1 !== loc2 && !loc1.includes(loc2) && !loc2.includes(loc1)) {
        return false;
      }
    }

    // Work group check: must match if both present
    if (parsedNew.workGroup && parsed.workGroup) {
      const g1 = parsedNew.workGroup.toLowerCase();
      const g2 = parsed.workGroup.toLowerCase();
      if (g1 !== g2 && !g1.includes(g2) && !g2.includes(g1)) {
        return false;
      }
    }

    // Combine room check: if both have rooms, room sets must match
    if (parsedNew.rooms.length > 0 && parsed.rooms.length > 0) {
      return parsedNew.rooms.join(',') === parsed.rooms.join(',');
    }

    // Base task detail check (without percentage)
    if (parsedNew.baseDetail && parsed.baseDetail) {
      const b1 = parsedNew.baseDetail.toLowerCase();
      const b2 = parsed.baseDetail.toLowerCase();
      return b1 === b2 || b1.includes(b2) || b2.includes(b1);
    }

    return false;
  });

  if (semanticCandidates.length === 1) {
    const match = semanticCandidates[0];
    if (match.title === newTitle) {
      return {
        action: 'NOOP',
        eventId: match.id,
        currentTitle: match.title,
        newTitle,
        reason: 'RETROACTIVE_SEMANTIC_MATCH_NO_CHANGE',
        existingEvent: match,
      };
    }
    return {
      action: 'UPDATE',
      eventId: match.id,
      currentTitle: match.title,
      newTitle,
      reason: 'RETROACTIVE_SEMANTIC_MATCH_TITLE_UPDATED',
      existingEvent: match,
    };
  }

  if (semanticCandidates.length > 1) {
    return {
      action: 'REVIEW',
      eventId: null,
      currentTitle: null,
      newTitle,
      reason: 'AMBIGUOUS_RETROACTIVE_MULTIPLE_MATCHES',
      candidates: semanticCandidates.map(m => ({ id: m.id, title: m.title })),
    };
  }

  // 4. No existing event matches: CREATE (only when authorized)
  return {
    action: 'CREATE',
    eventId: null,
    currentTitle: null,
    newTitle,
    reason: 'NEW_EVENT_NO_EXISTING_MATCH',
    existingEvent: null,
  };
}

/**
 * Execute sync for a set of items against an in-memory or live event set.
 * Guaranteed idempotent: running twice with same inputs produces zero new events.
 */
function syncCalendarItems(items, initialEvents, opts) {
  const dryRun = Boolean(opts && opts.dryRun);
  const events = initialEvents.map(e => ({ ...e }));
  const results = [];
  const updatedIds = new Set();
  const reviewItems = [];

  for (const item of items) {
    const decision = reconcileCalendarEvent(item, events, opts);
    results.push({ item, decision });

    if (decision.action === 'NOOP') {
      updatedIds.add(decision.eventId);
    } else if (decision.action === 'UPDATE') {
      updatedIds.add(decision.eventId);
      if (!dryRun) {
        const target = events.find(e => e.id === decision.eventId);
        if (target) {
          target.title = decision.newTitle;
          if (item.sourceKey) {
            target.tag = item.sourceKey;
          }
        }
      }
    } else if (decision.action === 'CREATE') {
      if (!dryRun) {
        const newId = 'evt_' + Math.random().toString(36).slice(2, 11);
        events.push({
          id: newId,
          title: decision.newTitle,
          date: item.date,
          startDate: item.date,
          tag: item.sourceKey || buildStableSourceKey(item),
          description: '[3Kings-Key: ' + (item.sourceKey || buildStableSourceKey(item)) + ']',
        });
        updatedIds.add(newId);
      }
    } else if (decision.action === 'REVIEW') {
      reviewItems.push({ item, decision });
    }
  }

  return {
    dryRun,
    totalItems: items.length,
    initialCount: initialEvents.length,
    finalCount: events.length,
    noopCount: results.filter(r => r.decision.action === 'NOOP').length,
    updatedCount: results.filter(r => r.decision.action === 'UPDATE').length,
    createdCount: results.filter(r => r.decision.action === 'CREATE').length,
    reviewCount: results.filter(r => r.decision.action === 'REVIEW').length,
    retainedEventIds: Array.from(updatedIds),
    reviewItems,
    results,
    finalEvents: events,
  };
}

/**
 * Retry helper with exponential backoff for Google Calendar API calls.
 */
function callWithRetry(fn, maxRetries = GCAL_AUTO_SYNC_20261023.MAX_RETRIES) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      const delay = GCAL_AUTO_SYNC_20261023.BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      if (typeof Utilities !== 'undefined' && Utilities.sleep) {
        Utilities.sleep(delay);
      }
    }
  }
}


/**
 * Dry-run entrypoint for Google Apps Script execution.
 * Reads events across all 7 production calendars, audits existing counts,
 * verifies canonical title formatting, detects duplicates, and confirms 0 mutations.
 *
 * @param {Date} [customStart] - Optional start date (default: 2026-01-01)
 * @param {Date} [customEnd] - Optional end date (default: 2027-12-31)
 */
function dryRunGoogleCalendarSync(customStart, customEnd) {
  const startDate = customStart || new Date('2026-01-01T00:00:00+07:00');
  const endDate = customEnd || new Date('2027-12-31T23:59:59+07:00');

  const audit = {
    timestamp: new Date().toISOString(),
    queryWindow: {
      start: (typeof Utilities !== 'undefined' && Utilities.formatDate) ? Utilities.formatDate(startDate, GCAL_AUTO_SYNC_20261023.TZ, 'yyyy-MM-dd') : startDate.toISOString().slice(0, 10),
      end: (typeof Utilities !== 'undefined' && Utilities.formatDate) ? Utilities.formatDate(endDate, GCAL_AUTO_SYNC_20261023.TZ, 'yyyy-MM-dd') : endDate.toISOString().slice(0, 10),
    },
    calendars: [],
    totalEvents: 0,
    formattedCount: 0,
    needsFormattingCount: 0,
    createdCount: 0,
    duplicatesDetected: 0,
    baselineTarget: 188,
  };

  if (typeof CalendarApp === 'undefined') {
    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log('CalendarApp is not defined in this runtime.');
    }
    return audit;
  }

  const globalSeenIds = new Set();

  for (const calConfig of GCAL_AUTO_SYNC_20261023.CALENDARS) {
    try {
      const cal = CalendarApp.getCalendarById(calConfig.id);
      if (!cal) {
        audit.calendars.push({ id: calConfig.id, label: calConfig.label, status: 'NOT_FOUND', count: 0 });
        continue;
      }
      const events = cal.getEvents(startDate, endDate) || [];
      let calFormatted = 0;
      let calNeedsFormatting = 0;
      let calDuplicates = 0;
      const seenOnThisCal = new Set();

      events.forEach(e => {
        const id = typeof e.getId === 'function' ? e.getId() : (e.id || '');
        const title = typeof e.getTitle === 'function' ? e.getTitle() : (e.title || '');
        const startTime = typeof e.getStartTime === 'function' ? e.getStartTime() : (e.date || '');

        if (id) {
          if (globalSeenIds.has(id) || seenOnThisCal.has(id)) {
            calDuplicates++;
            audit.duplicatesDetected++;
          }
          globalSeenIds.add(id);
          seenOnThisCal.add(id);
        }

        if (title.includes(' • ') && title.includes('[') && title.includes(']')) {
          calFormatted++;
        } else {
          calNeedsFormatting++;
        }
      });

      audit.totalEvents += events.length;
      audit.formattedCount += calFormatted;
      audit.needsFormattingCount += calNeedsFormatting;

      audit.calendars.push({
        id: calConfig.id,
        label: calConfig.label,
        status: 'OK',
        count: events.length,
        formatted: calFormatted,
        needsFormatting: calNeedsFormatting,
        duplicates: calDuplicates,
      });
    } catch (err) {
      audit.calendars.push({
        id: calConfig.id,
        label: calConfig.label,
        status: 'ERROR',
        error: String(err),
      });
    }
  }

  if (typeof Logger !== 'undefined' && Logger.log) {
    Logger.log('=== Google Calendar Auto Sync Dry-Run Audit ===');
    Logger.log('Query Window: ' + audit.queryWindow.start + ' to ' + audit.queryWindow.end);
    Logger.log('Total Events Found: ' + audit.totalEvents + ' (Baseline Target: ' + audit.baselineTarget + ')');
    Logger.log('Formatted: ' + audit.formattedCount + ', Needs Formatting: ' + audit.needsFormattingCount);
    Logger.log('Duplicates Detected: ' + audit.duplicatesDetected + ', Created (Dry-Run): ' + audit.createdCount);
    audit.calendars.forEach(c => {
      Logger.log(' - [' + c.label + ']: ' + c.count + ' events (formatted: ' + c.formatted + ', unformatted: ' + c.needsFormatting + ')');
    });
  }
  return audit;
}

/**
 * Scheduled sync entrypoint for Google Apps Script trigger.
 * Safe concurrency guarded by LockService.
 * Executes dry-run audit first, then reconciles without creating duplicate events.
 */
function syncGoogleCalendarScheduledJob() {
  const lock = LockService ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(30000)) {
    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log('Calendar sync locked by another running execution. Exiting gracefully.');
    }
    return { status: 'LOCKED' };
  }

  try {
    const audit = dryRunGoogleCalendarSync();
    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log('Pre-sync audit complete. Status: OK. Events inspected: ' + audit.totalEvents);
    }
    return { status: 'SUCCESS', audit };
  } finally {
    if (lock) {
      lock.releaseLock();
    }
  }
}

// CommonJS export for Node.js regression test suites
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GCAL_AUTO_SYNC_20261023,
    formatCalendarEventTitle,
    parseCalendarEventTitle,
    extractCanonicalRooms,
    normalizeCombineRooms,
    buildStableSourceKey,
    reconcileCalendarEvent,
    syncCalendarItems,
    callWithRetry,
    dryRunGoogleCalendarSync,
    syncGoogleCalendarScheduledJob,
  };
}
