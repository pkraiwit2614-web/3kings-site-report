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
 * Format a Date object or string into canonical ISO yyyy-MM-dd format.
 */
function formatIsoDate_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
      return Utilities.formatDate(val, GCAL_AUTO_SYNC_20261023.TZ, 'yyyy-MM-dd');
    }
    return val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  return s.slice(0, 10);
}

/**
 * Build a stable source key that is independent of progress percentage.
 */
function buildStableSourceKey(item) {
  if (!item || typeof item !== 'object') return '';
  const loc = String(item.location || item.area || '').toLowerCase();
  const domain = String(item.domain || (loc.includes('plot') || loc.includes('villa') ? 'villa' : 'work')).toLowerCase().trim();
  const location = String(item.location || '').replace(/\s+/g, '_').toLowerCase().trim();
  const workGroup = String(item.workGroup || '').replace(/\s+/g, '_').toLowerCase().trim();
  const date = formatIsoDate_(item.date || item.startDate);
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
 * Determine if a calendar event is an independent site event (Meeting, Test, Inspection).
 * Such events must be preserved and never overwritten or matched to schedule milestones.
 */
function isIndependentSiteEvent_(e) {
  if (!e) return false;
  const title = String(e.title || '').toLowerCase();
  const desc = String(e.description || '').toLowerCase();

  if (desc.includes('type: meeting') || desc.includes('type: test') ||
      desc.includes('type:meeting') || desc.includes('type:test')) {
    return true;
  }
  if (title.includes('meeting') || title.includes('ประชุม') ||
      title.includes('นัดหมาย') || title.includes('ทดสอบ') ||
      title.includes('[test]') || title.includes('(test)')) {
    return true;
  }
  return false;
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
  const targetDate = formatIsoDate_(item.date || item.startDate);
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
    // Preserve independent site events (meetings, tests, non-task events)
    if (isIndependentSiteEvent_(e)) {
      return false;
    }
    const eDate = formatIsoDate_(e.startDate || e.date);
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
/**
 * Resolve target Google Calendar ID based on item metadata and domain.
 * Enforces strict Plan vs Actual separation and Villa Plot segregation.
 * CRITICAL SAFETY: Actual progress for any Plot routes to "3 Kings – Site / Actual",
 * NOT to the Villa Plan calendar.
 */
function resolveCalendarIdForTask(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.calendarId && GCAL_AUTO_SYNC_20261023.CALENDARS.some(c => c.id === item.calendarId)) {
    return item.calendarId;
  }
  const loc = String(item.location || item.area || '').toLowerCase();
  const domain = String(item.domain || '').toLowerCase();
  const detail = String(item.detail || item.task_name || '').toLowerCase();

  // 1. Deliveries / Procurement calendar
  if (domain === 'procurement' || domain === 'delivery' || detail.includes('ส่งของ') || detail.includes('เข้าหน้างาน')) {
    return '6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com';
  }

  // 2. Site / Actual vs Construction Plan separation
  // MUST CHECK THIS BEFORE PLOT-SPECIFIC PLAN CALENDARS!
  // Any actual site progress item (even for Plot 6, 7, 8, 9) routes to 3 Kings – Site / Actual.
  if (domain === 'site' || domain === 'actual' || item.isActual === true || String(item.status || '').includes('จริง')) {
    return '9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com';
  }

  // 3. Plot-specific Plan calendars (only for plan items)
  if (loc.includes('plot 6') || loc.includes('villa 6') || loc.includes('av-p6')) {
    return '9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com';
  }
  if (loc.includes('plot 7') || loc.includes('villa 7') || loc.includes('av-p7')) {
    return '7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com';
  }
  if (loc.includes('plot 8') || loc.includes('villa 8') || loc.includes('av-p8')) {
    return 'd31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com';
  }
  if (loc.includes('plot 9') || loc.includes('villa 9') || loc.includes('av-p9')) {
    return '958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com';
  }

  // 4. Default to Construction Plan
  return 'family17900518303332507254@group.calendar.google.com';
}

/**
 * Dry-run entrypoint for Google Apps Script execution.
 * Reads events across all 7 production calendars, audits existing counts,
 * verifies canonical title formatting, detects intra-calendar duplicates, and confirms 0 mutations.
 * Fails closed with explicit ERROR, REVIEW_HOLD, or COUNT_MISMATCH_REVIEW.
 *
 * @param {Date|Object} [customStartOrOptions] - Optional start date or options object
 * @param {Date} [customEnd] - Optional end date
 */
function dryRunGoogleCalendarSync(customStartOrOptions, customEnd) {
  if (typeof CalendarApp === 'undefined') {
    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log('ERROR: CalendarApp is not defined in this runtime.');
    }
    return {
      status: 'ERROR',
      error: 'CALENDAR_APP_UNAVAILABLE',
      timestamp: new Date().toISOString(),
      totalEvents: 0,
      baselineTarget: 188,
      calendars: [],
    };
  }

  let startDate = null;
  let endDate = null;
  let verifyBaseline = false;

  if (customStartOrOptions && typeof customStartOrOptions === 'object' && !(customStartOrOptions instanceof Date)) {
    startDate = customStartOrOptions.startDate;
    endDate = customStartOrOptions.endDate;
    verifyBaseline = Boolean(customStartOrOptions.verifyBaseline);
  } else {
    startDate = customStartOrOptions;
    endDate = customEnd;
  }

  if (!startDate) startDate = new Date('2025-01-01T00:00:00+07:00');
  if (!endDate) endDate = new Date('2027-12-31T23:59:59+07:00');

  const audit = {
    status: 'AUDIT_PASS',
    timestamp: new Date().toISOString(),
    queryWindow: {
      start: (typeof Utilities !== 'undefined' && Utilities.formatDate) ? Utilities.formatDate(startDate, GCAL_AUTO_SYNC_20261023.TZ, 'yyyy-MM-dd') : formatIsoDate_(startDate),
      end: (typeof Utilities !== 'undefined' && Utilities.formatDate) ? Utilities.formatDate(endDate, GCAL_AUTO_SYNC_20261023.TZ, 'yyyy-MM-dd') : formatIsoDate_(endDate),
    },
    calendars: [],
    totalEvents: 0,
    formattedCount: 0,
    needsFormattingCount: 0,
    createdCount: 0,
    duplicatesDetected: 0,
    baselineTarget: 188,
  };

  let hasCalendarErrors = false;

  for (const calConfig of GCAL_AUTO_SYNC_20261023.CALENDARS) {
    try {
      const cal = CalendarApp.getCalendarById(calConfig.id);
      if (!cal) {
        hasCalendarErrors = true;
        audit.calendars.push({
          id: calConfig.id,
          label: calConfig.label,
          status: 'NOT_FOUND',
          error: 'CALENDAR_NOT_FOUND_OR_NO_PERMISSION: CalendarApp.getCalendarById returned null. Verify account access and calendar subscription.',
          count: 0,
        });
        continue;
      }
      const events = cal.getEvents(startDate, endDate) || [];
      let calFormatted = 0;
      let calNeedsFormatting = 0;
      let calDuplicates = 0;
      const seenOnThisCal = new Set();
      const seenTitleStartOnThisCal = new Set();

      events.forEach(e => {
        const id = String(typeof e.getId === 'function' ? e.getId() : (e.id || '') || '').trim();
        const title = String(typeof e.getTitle === 'function' ? e.getTitle() : (e.title || '') || '').trim();
        const rawStart = typeof e.getStartTime === 'function' ? e.getStartTime() : (e.date || e.startDate || '');
        const startTime = formatIsoDate_(rawStart);

        // Intra-calendar ID uniqueness check
        if (id) {
          const calScopedEventKey = calConfig.id + ':' + id;
          if (seenOnThisCal.has(calScopedEventKey)) {
            calDuplicates++;
            audit.duplicatesDetected++;
          }
          seenOnThisCal.add(calScopedEventKey);
        }

        // Intra-calendar title + start date duplicate check
        if (title && startTime) {
          const titleStartKey = title + '|' + startTime;
          if (seenTitleStartOnThisCal.has(titleStartKey)) {
            calDuplicates++;
            audit.duplicatesDetected++;
          }
          seenTitleStartOnThisCal.add(titleStartKey);
        }

        if (title && title.includes(' • ') && title.includes('[') && title.includes(']')) {
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
      hasCalendarErrors = true;
      const errMsg = (err && err.stack) ? String(err.stack) : String(err);
      audit.calendars.push({
        id: calConfig.id,
        label: calConfig.label,
        status: 'ERROR',
        error: errMsg,
        count: 0,
      });
    }
  }

  // Strict audit status determination
  if (hasCalendarErrors) {
    audit.status = 'ERROR';
    const failed = audit.calendars.filter(c => c.status === 'ERROR' || c.status === 'NOT_FOUND');
    audit.error = 'ONE_OR_MORE_CALENDARS_INACCESSIBLE';
    audit.message = 'CALENDAR_ACCESS_ERROR: ' + failed.map(c => c.label + ' [' + c.status + ']').join(', ');
    audit.errorDetail = failed;
  } else if (audit.duplicatesDetected > 0) {
    audit.status = 'REVIEW_HOLD';
    audit.error = 'DUPLICATE_EVENTS_DETECTED';
  } else if (audit.needsFormattingCount > 0) {
    audit.status = 'REVIEW_HOLD';
    audit.error = 'UNFORMATTED_EVENTS_DETECTED';
  } else if (audit.totalEvents !== audit.baselineTarget) {
    audit.status = 'COUNT_MISMATCH_REVIEW';
    audit.error = 'COUNT_MISMATCH: expected ' + audit.baselineTarget + ', found ' + audit.totalEvents;
  } else {
    audit.status = 'AUDIT_PASS';
  }

  if (typeof Logger !== 'undefined' && Logger.log) {
    Logger.log('=== Google Calendar Auto Sync Dry-Run Audit ===');
    Logger.log('Status: ' + audit.status);
    Logger.log('Query Window: ' + audit.queryWindow.start + ' to ' + audit.queryWindow.end);
    Logger.log('Total Events Found: ' + audit.totalEvents + ' (Baseline Target: ' + audit.baselineTarget + ')');
    Logger.log('Formatted: ' + audit.formattedCount + ', Needs Formatting: ' + audit.needsFormattingCount);
    Logger.log('Duplicates Detected: ' + audit.duplicatesDetected + ', Created (Dry-Run): ' + audit.createdCount);
    audit.calendars.forEach(c => {
      Logger.log(' - [' + c.label + ']: ' + (c.count || 0) + ' events (status: ' + c.status + (c.error ? ', error: ' + c.error : '') + ')');
    });
  }
  return audit;
}

/**
 * Standalone read-only diagnostic for Google Apps Script Web IDE.
 * Allows Owner to test all 7 calendars and Supabase connectivity in 1 click without mutations.
 */
function diagnoseCalendarAccess20261024() {
  const report = {
    timestamp: new Date().toISOString(),
    calendarAppAvailable: typeof CalendarApp !== 'undefined',
    calendars: [],
    totalAccessible: 0,
    totalEvents: 0,
    supabaseAccessible: false,
    supabaseTaskCount: 0,
    diagnostics: [],
  };

  if (typeof CalendarApp === 'undefined') {
    report.diagnostics.push('CRITICAL: CalendarApp is not available. Check OAuth authorization or manifest.');
    if (typeof Logger !== 'undefined' && Logger.log) Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  const startDate = new Date('2025-01-01T00:00:00+07:00');
  const endDate = new Date('2027-12-31T23:59:59+07:00');

  for (const calConfig of GCAL_AUTO_SYNC_20261023.CALENDARS) {
    try {
      const cal = CalendarApp.getCalendarById(calConfig.id);
      if (!cal) {
        report.calendars.push({
          id: calConfig.id,
          label: calConfig.label,
          accessible: false,
          error: 'getCalendarById returned null (permission not granted or calendar not subscribed)'
        });
        report.diagnostics.push('[FAIL] ' + calConfig.label + ': NOT ACCESSIBLE (ID: ' + calConfig.id + ')');
        continue;
      }
      const name = typeof cal.getName === 'function' ? cal.getName() : calConfig.label;
      const tz = typeof cal.getTimeZone === 'function' ? cal.getTimeZone() : 'unknown';
      const events = cal.getEvents(startDate, endDate) || [];
      report.totalAccessible++;
      report.totalEvents += events.length;
      report.calendars.push({
        id: calConfig.id,
        label: calConfig.label,
        name: name,
        timeZone: tz,
        accessible: true,
        eventCount: events.length,
      });
      report.diagnostics.push('[OK] ' + calConfig.label + ' ("' + name + '"): ' + events.length + ' events (TZ: ' + tz + ')');
    } catch (err) {
      report.calendars.push({
        id: calConfig.id,
        label: calConfig.label,
        accessible: false,
        error: String(err)
      });
      report.diagnostics.push('[ERROR] ' + calConfig.label + ': ' + String(err));
    }
  }

  // Script properties audit (safe, non-leaking)
  try {
    const propAudit = auditCalendarScriptProperties20261024();
    report.scriptProperties = propAudit;
    report.diagnostics.push('[PROPERTIES] CALENDAR_SYNC_ENABLED: ' + propAudit.calendarSyncEnabled + ', CALENDAR_SYNC_DRY_RUN: ' + propAudit.calendarSyncDryRun + ' (Write Path Locked: ' + propAudit.isWritePathLocked + ')');
  } catch (pErr) {
    report.diagnostics.push('[PROPERTIES] Error reading script properties: ' + String(pErr));
  }

  // Supabase read check
  try {
    const tasks = fetchAuthorizedCalendarSourceItems_({ dryRun: true });
    report.supabaseAccessible = Array.isArray(tasks);
    report.supabaseTaskCount = Array.isArray(tasks) ? tasks.length : 0;
    report.diagnostics.push('[SUPABASE] Read ' + report.supabaseTaskCount + ' tasks successfully');
  } catch (err) {
    report.diagnostics.push('[SUPABASE] Failed to read: ' + String(err));
  }

  if (typeof Logger !== 'undefined' && Logger.log) {
    Logger.log('=== CALENDAR ACCESS DIAGNOSTIC REPORT ===');
    report.diagnostics.forEach(line => Logger.log(line));
    Logger.log('Total Accessible Calendars: ' + report.totalAccessible + ' / ' + GCAL_AUTO_SYNC_20261023.CALENDARS.length);
    Logger.log('Total Events Found: ' + report.totalEvents);
    Logger.log('========================================');
  }

  return report;
}

/**
 * Safe, read-only audit of script properties governing Calendar sync.
 * Never exposes passwords, secret tokens, or full service keys.
 */
function auditCalendarScriptProperties20261024() {
  const audit = {
    timestamp: new Date().toISOString(),
    calendarSyncEnabled: 'not_set',
    calendarSyncDryRun: 'not_set',
    supabaseUrlConfigured: false,
    supabaseKeyConfigured: false,
    isWritePathLocked: true,
  };

  if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
    const props = PropertiesService.getScriptProperties();
    const enabled = props.getProperty('CALENDAR_SYNC_ENABLED');
    const dryRun = props.getProperty('CALENDAR_SYNC_DRY_RUN');
    const url = props.getProperty('SUPABASE_URL');
    const sKey = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
    const aKey = props.getProperty('SUPABASE_ANON_KEY');

    audit.calendarSyncEnabled = enabled === null ? 'not_set' : enabled;
    audit.calendarSyncDryRun = dryRun === null ? 'not_set' : dryRun;
    audit.supabaseUrlConfigured = Boolean(url && url.trim());
    audit.supabaseKeyConfigured = Boolean((sKey && sKey.trim()) || (aKey && aKey.trim()));
    audit.isWritePathLocked = (enabled !== 'true');
  }

  if (typeof Logger !== 'undefined' && Logger.log) {
    Logger.log('=== CALENDAR SCRIPT PROPERTIES AUDIT ===');
    Logger.log('CALENDAR_SYNC_ENABLED: ' + audit.calendarSyncEnabled);
    Logger.log('CALENDAR_SYNC_DRY_RUN: ' + audit.calendarSyncDryRun);
    Logger.log('Supabase URL Configured: ' + audit.supabaseUrlConfigured);
    Logger.log('Supabase Key Configured: ' + audit.supabaseKeyConfigured);
    Logger.log('Write Path Fail-Closed Status: ' + (audit.isWritePathLocked ? 'LOCKED (SAFE)' : 'ARMED (ACTIVE)'));
    Logger.log('========================================');
  }

  return audit;
}

// In-memory pluggable provider for test suites and custom workflows
let globalCalendarSourceProvider_ = null;
function setGlobalCalendarSourceProvider_(provider) {
  globalCalendarSourceProvider_ = provider;
}
function getGlobalCalendarSourceProvider_() {
  return typeof globalCalendarSourceProvider_ === 'function' ? globalCalendarSourceProvider_() : null;
}

/**
 * Map Supabase schedule_tasks record to canonical calendar sync item.
 * Strictly separates Plan vs Actual based on explicit event evidence.
 * CRITICAL RULE: Never infer Actual from Boolean(site_status)!
 * In Production, all 301 active tasks have site_status (including 71 with 'ยังไม่เริ่ม').
 */
function mapScheduleTaskToCalendarItem_(t) {
  let progressPct = null;
  if (t.actual_progress !== null && t.actual_progress !== undefined && t.actual_progress !== '') {
    const num = Number(t.actual_progress);
    if (!isNaN(num)) {
      progressPct = Math.round(num * 100);
    }
  }

  const rawStatus = String(t.site_status || t.plan_status || '').trim();
  const taskName = String(t.task_name || '').trim();
  const loc = String(t.area || '').trim();
  const workGroup = String(t.category || '').trim();
  const sourceIdentity = String(t.source_identity || '').toLowerCase();
  const areaLower = loc.toLowerCase();
  const taskNameLower = taskName.toLowerCase();

  // True event type separation:
  // Explicit actual evidence: explicit domain/flag, 'actual' in identity or area, area 'site', or 'จริง' in task name.
  // Tasks with site_status = 'ยังไม่เริ่ม' or progress = 0 are strictly Plan events.
  const isExplicitActual = Boolean(t.isActual) ||
                           String(t.domain || '').toLowerCase() === 'actual' ||
                           sourceIdentity.includes('actual') ||
                           areaLower.includes('actual') ||
                           areaLower === 'site' ||
                           taskNameLower.includes('จริง');

  const isActual = isExplicitActual;
  const domain = isActual ? 'actual' : (t.domain || 'plan');
  const status = rawStatus || (isActual ? 'ดำเนินการ' : 'แผนงาน');

  let detail = taskName;
  if (progressPct !== null && progressPct > 0 && !taskName.includes('%')) {
    detail = taskName + ' ' + progressPct + '%';
  }

  return {
    sourceKey: t.source_identity || ('task:' + t.id),
    sourceIdentity: t.source_identity || null,
    taskId: t.id,
    detail: detail,
    task_name: taskName,
    location: loc,
    area: loc,
    category: workGroup,
    workGroup: workGroup,
    startDate: t.planned_start,
    endDate: t.planned_end,
    date: t.planned_start,
    actualStart: t.actual_start || null,
    actualEnd: t.actual_end || null,
    domain: domain,
    isActual: isActual,
    status: status,
    siteStatus: t.site_status || null,
    planStatus: t.plan_status || null,
    progress: progressPct,
    importedPlanProgress: t.imported_plan_progress !== undefined ? t.imported_plan_progress : null,
  };
}

/**
 * Authorized Source-of-Truth Provider for Work Plan, Progress, and Actual milestones.
 * In live runtime, queries Supabase schedule_tasks or invokes registered provider.
 * Uses only verified columns from Production schema.
 * Propagates query errors fail-closed without suppressing into false success.
 */
function fetchAuthorizedCalendarSourceItems_(options = {}) {
  if (options && Array.isArray(options.sourceItems)) {
    return options.sourceItems;
  }
  if (options && typeof options.sourceProvider === 'function') {
    return options.sourceProvider();
  }
  const globalProvided = getGlobalCalendarSourceProvider_();
  if (Array.isArray(globalProvided)) {
    return globalProvided;
  }

  // Use only verified columns that exist in public.schedule_tasks
  const queryPath = '/rest/v1/schedule_tasks?select=id,source_identity,source_task_no,task_name,area,category,planned_start,planned_end,actual_start,actual_end,actual_progress,site_status,project_id,is_active&is_active=eq.true&order=planned_start.asc';

  // Live Google Apps Script runtime: Supabase schedule_tasks via buildContext_
  if (typeof buildContext_ === 'function' && typeof sbGetAll_ === 'function') {
    const ctx = buildContext_();
    const tasks = sbGetAll_(ctx, queryPath);
    if (!Array.isArray(tasks)) {
      throw new Error('SUPABASE_QUERY_NON_ARRAY_RESULT: ' + JSON.stringify(tasks));
    }
    return tasks.map(mapScheduleTaskToCalendarItem_);
  }

  // Standalone GAS fallback via Script Properties and UrlFetchApp
  if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties && typeof UrlFetchApp !== 'undefined') {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SUPABASE_URL') || 'https://wtqubwdduzedmcvyhbgs.supabase.co';
    const key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || props.getProperty('SUPABASE_ANON_KEY');
    if (key) {
      const res = UrlFetchApp.fetch(url + queryPath, {
        method: 'get',
        headers: { apikey: key, Authorization: 'Bearer ' + key },
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code !== 200) {
        throw new Error('SUPABASE_REST_HTTP_' + code + ': ' + res.getContentText());
      }
      const tasks = JSON.parse(res.getContentText());
      if (!Array.isArray(tasks)) {
        throw new Error('SUPABASE_REST_NON_ARRAY_RESULT');
      }
      return tasks.map(mapScheduleTaskToCalendarItem_);
    }
  }

  return [];
}

/**
 * Read-only deterministic Source-to-Calendar Match Ledger.
 * Cross-references source items against calendar events using:
 * Calendar ID + Event ID + Source Identity.
 * Strictly preserves independent site events (meetings, tests) and holds unmatched items.
 */
function buildSourceToCalendarMatchLedger(sourceItemsOrOptions, options = {}) {
  let resolvedItems = null;
  let resolvedOptions = {};
  if (Array.isArray(sourceItemsOrOptions)) {
    resolvedItems = sourceItemsOrOptions;
    resolvedOptions = options || {};
  } else if (sourceItemsOrOptions && typeof sourceItemsOrOptions === 'object') {
    resolvedOptions = sourceItemsOrOptions;
    resolvedItems = fetchAuthorizedCalendarSourceItems_(resolvedOptions);
  } else {
    resolvedOptions = options || {};
    resolvedItems = fetchAuthorizedCalendarSourceItems_(resolvedOptions);
  }

  const startDate = resolvedOptions.startDate || new Date('2025-01-01T00:00:00+07:00');
  const endDate = resolvedOptions.endDate || new Date('2027-12-31T23:59:59+07:00');

  const eventsByCal = new Map();
  const independentEvents = [];

  for (const calConfig of GCAL_AUTO_SYNC_20261023.CALENDARS) {
    let events = [];
    if (resolvedOptions.eventsByCalendar && resolvedOptions.eventsByCalendar[calConfig.id]) {
      events = resolvedOptions.eventsByCalendar[calConfig.id];
    } else if (typeof CalendarApp !== 'undefined') {
      try {
        const cal = CalendarApp.getCalendarById(calConfig.id);
        if (cal) {
          const rawEvents = cal.getEvents(startDate, endDate) || [];
          events = rawEvents.map(e => ({
            id: typeof e.getId === 'function' ? e.getId() : (e.id || ''),
            title: typeof e.getTitle === 'function' ? e.getTitle() : (e.title || ''),
            description: typeof e.getDescription === 'function' ? e.getDescription() : (e.description || ''),
            tag: (typeof e.getTag === 'function' ? e.getTag('source_key') : null) || (e.tag || ''),
            startDate: typeof e.getStartTime === 'function' ? e.getStartTime() : (e.date || ''),
            date: typeof e.getStartTime === 'function' ? e.getStartTime() : (e.date || ''),
            _raw: e,
          }));
        }
      } catch (err) {
        // Handled in audit
      }
    }

    events.forEach(e => {
      if (isIndependentSiteEvent_(e)) {
        independentEvents.push({
          calendarId: calConfig.id,
          calendarLabel: calConfig.label,
          eventId: e.id,
          title: e.title,
          description: e.description,
          classification: 'INDEPENDENT_SITE_EVENT',
          preserved: true,
        });
      }
    });

    eventsByCal.set(calConfig.id, events);
  }

  const ledger = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let reviewCount = 0;
  let noopCount = 0;
  let updateCount = 0;

  (resolvedItems || []).forEach(item => {
    const targetCalendarId = resolveCalendarIdForTask(item);
    const existingEvents = targetCalendarId ? (eventsByCal.get(targetCalendarId) || []) : [];
    const decision = reconcileCalendarEvent(item, existingEvents, { dryRun: true });

    let status = 'MATCHED';
    if (decision.action === 'REVIEW') {
      status = 'HOLD_REVIEW';
      reviewCount++;
    } else if (decision.action === 'CREATE') {
      status = 'HOLD_UNMATCHED';
      unmatchedCount++;
    } else if (decision.action === 'NOOP') {
      matchedCount++;
      noopCount++;
    } else if (decision.action === 'UPDATE') {
      matchedCount++;
      updateCount++;
    }

    ledger.push({
      sourceIdentity: item.sourceIdentity || item.sourceKey,
      taskId: item.taskId || null,
      taskName: item.task_name || item.detail,
      area: item.area || item.location,
      domain: item.domain || 'plan',
      isActual: Boolean(item.isActual),
      targetCalendarId: targetCalendarId,
      matchedEventId: decision.eventId || null,
      matchedEventTitle: decision.currentTitle || null,
      proposedTitle: decision.newTitle,
      action: decision.action,
      reason: decision.reason,
      status: status,
      candidates: decision.candidates || null,
    });
  });

  return {
    timestamp: new Date().toISOString(),
    totalSourceItems: (resolvedItems || []).length,
    matchedCount,
    noopCount,
    updateCount,
    unmatchedCount,
    reviewCount,
    preservedIndependentCount: independentEvents.length,
    independentEvents,
    ledger,
    status: reviewCount > 0 ? 'HOLD' : (unmatchedCount > 0 ? 'HOLD' : 'READY'),
  };
}

/**
 * Scheduled sync entrypoint for Google Apps Script trigger.
 * Safe concurrency guarded by LockService (30s) unless skipLock is specified.
 * Two-phase execution pattern: Phase 1 evaluates all reconciliations and match ledger.
 * If any review or hold condition occurs, execution exits with ZERO mutations.
 * Phase 2 performs verified mutations with destination readback only when Phase 1 is 100% clean.
 *
 * @param {Array<Object>|Object} [sourceItemsOrOptions] - Optional work items or trigger event object
 * @param {Object} [options] - Execution options: { dryRun: boolean, allowCreate: boolean, startDate: Date, endDate: Date, skipLock: boolean, verifyBaseline: boolean }
 */
function syncGoogleCalendarScheduledJob(sourceItemsOrOptions, options = {}) {
  // Resolve options and source items for trigger invocation (which passes event object or no args)
  let resolvedOptions = {};
  let resolvedItems = null;

  let sourceFetchError = null;
  if (Array.isArray(sourceItemsOrOptions)) {
    resolvedItems = sourceItemsOrOptions;
    resolvedOptions = options || {};
  } else if (sourceItemsOrOptions && typeof sourceItemsOrOptions === 'object') {
    if ('dryRun' in sourceItemsOrOptions || 'sourceProvider' in sourceItemsOrOptions || 'sourceItems' in sourceItemsOrOptions || 'skipLock' in sourceItemsOrOptions || 'verifyBaseline' in sourceItemsOrOptions) {
      resolvedOptions = Object.assign({}, sourceItemsOrOptions, options || {});
    } else {
      // Apps Script time-based trigger event object: { year: 2026, ... }
      resolvedOptions = options || {};
    }
    try {
      resolvedItems = fetchAuthorizedCalendarSourceItems_(resolvedOptions);
    } catch (err) {
      sourceFetchError = String(err);
    }
  } else {
    resolvedOptions = options || {};
    try {
      resolvedItems = fetchAuthorizedCalendarSourceItems_(resolvedOptions);
    } catch (err) {
      sourceFetchError = String(err);
    }
  }

  const skipLock = Boolean(resolvedOptions.skipLock);
  const lock = (!skipLock && typeof LockService !== 'undefined' && LockService.getScriptLock) ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(30000)) {
    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log('Calendar sync locked by another running execution. Exiting gracefully.');
    }
    return { status: 'LOCKED', message: 'EXECUTION_IN_PROGRESS' };
  }

  try {
    // Determine dryRun mode: explicit option takes precedence, then script property, default true
    let isDryRun = true;
    if (typeof resolvedOptions.dryRun === 'boolean') {
      isDryRun = resolvedOptions.dryRun;
    } else if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) {
      const prop = PropertiesService.getScriptProperties().getProperty('CALENDAR_SYNC_DRY_RUN');
      if (prop === 'false') {
        isDryRun = false;
      }
    }

    const audit = dryRunGoogleCalendarSync({
      startDate: resolvedOptions.startDate,
      endDate: resolvedOptions.endDate,
      verifyBaseline: Boolean(resolvedOptions.verifyBaseline),
    });

    if (audit.status === 'ERROR') {
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log('Sync aborted: pre-sync audit returned ERROR.');
      }
      return { status: 'ERROR', error: 'AUDIT_FAILED_BEFORE_SYNC', audit };
    }

    if (audit.status === 'REVIEW_HOLD') {
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log('Sync held: duplicate or unformatted events detected in existing calendars.');
      }
      return { status: 'HOLD', reason: 'CALENDAR_AUDIT_REVIEW_HOLD', audit };
    }

    if (audit.status === 'COUNT_MISMATCH_REVIEW') {
      if (resolvedOptions.verifyBaseline && !resolvedOptions.allowCountMismatch) {
        if (typeof Logger !== 'undefined' && Logger.log) {
          Logger.log('Sync held: calendar event count did not match baseline target (188).');
        }
        return { status: 'HOLD', reason: 'CALENDAR_BASELINE_COUNT_MISMATCH_HOLD', audit };
      } else if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log('Notice: calendar event count (' + audit.totalEvents + ') differs from baseline target (188), proceeding.');
      }
    }

    // Fail closed immediately if source fetch threw an error
    if (sourceFetchError) {
      if (typeof Logger !== 'undefined' && Logger.log) {
        Logger.log('Sync aborted: source fetch error: ' + sourceFetchError);
      }
      return { status: 'ERROR', error: 'SOURCE_FETCH_FAILED', details: sourceFetchError, audit };
    }

    // If no incoming items provided and none could be fetched
    if (!resolvedItems || resolvedItems.length === 0) {
      if (resolvedOptions.requireSource !== false) {
        return { status: 'HOLD', reason: 'NO_SOURCE_ITEMS_FOUND_FAIL_CLOSED', audit };
      }
      return {
        status: 'SUCCESS',
        mode: 'AUDIT_ONLY',
        dryRun: isDryRun,
        totalItems: 0,
        noopCount: 0,
        updatedCount: 0,
        createdCount: 0,
        reviewCount: 0,
        audit,
      };
    }

    // Group incoming items by resolved target Calendar ID
    const itemsByCal = new Map();
    resolvedItems.forEach(item => {
      const calId = resolveCalendarIdForTask(item);
      if (!calId) return;
      if (!itemsByCal.has(calId)) itemsByCal.set(calId, []);
      itemsByCal.get(calId).push(item);
    });

    const syncResults = {
      status: 'SUCCESS',
      dryRun: isDryRun,
      totalItems: resolvedItems.length,
      noopCount: 0,
      updatedCount: 0,
      createdCount: 0,
      reviewCount: 0,
      unmatchedCount: 0,
      reviewQueue: [],
      updatedEvents: [],
      createdEvents: [],
      calendars: [],
      matchLedger: [],
      audit,
    };

    const startDate = resolvedOptions.startDate || new Date('2026-01-01T00:00:00+07:00');
    const endDate = resolvedOptions.endDate || new Date('2027-12-31T23:59:59+07:00');

    // Load existing events per calendar
    const existingEventsByCal = new Map();
    const liveCals = new Map();

    for (const calConfig of GCAL_AUTO_SYNC_20261023.CALENDARS) {
      const calId = calConfig.id;
      let existingEvents = [];
      if (typeof CalendarApp !== 'undefined') {
        try {
          const cal = CalendarApp.getCalendarById(calId);
          if (cal) {
            liveCals.set(calId, cal);
            const rawEvents = cal.getEvents(startDate, endDate) || [];
            existingEvents = rawEvents.map(e => ({
              id: typeof e.getId === 'function' ? e.getId() : (e.id || ''),
              title: typeof e.getTitle === 'function' ? e.getTitle() : (e.title || ''),
              description: typeof e.getDescription === 'function' ? e.getDescription() : (e.description || ''),
              tag: (typeof e.getTag === 'function' ? e.getTag('source_key') : null) || (e.tag || ''),
              startDate: typeof e.getStartTime === 'function' ? e.getStartTime() : (e.date || ''),
              date: typeof e.getStartTime === 'function' ? e.getStartTime() : (e.date || ''),
              _raw: e,
            }));
          }
        } catch (err) {
          // Handled
        }
      }
      existingEventsByCal.set(calId, existingEvents);
    }

    // PHASE 1: Reconciliation & Match Ledger (Zero mutations)
    const pendingMutations = [];

    for (const [calId, items] of itemsByCal.entries()) {
      const existingEvents = existingEventsByCal.get(calId) || [];
      const cal = liveCals.get(calId) || null;

      for (const item of items) {
        const decision = reconcileCalendarEvent(item, existingEvents, { dryRun: true });

        // Ledger entry for transparency and read-only audit
        const ledgerEntry = {
          calendarId: calId,
          sourceIdentity: item.sourceIdentity || item.sourceKey,
          taskId: item.taskId || null,
          taskName: item.task_name || item.detail,
          area: item.area || item.location,
          domain: item.domain,
          action: decision.action,
          reason: decision.reason,
          matchedEventId: decision.eventId || null,
          currentTitle: decision.currentTitle || null,
          newTitle: decision.newTitle,
        };
        syncResults.matchLedger.push(ledgerEntry);

        if (decision.action === 'NOOP') {
          syncResults.noopCount++;
        } else if (decision.action === 'UPDATE') {
          pendingMutations.push({
            type: 'UPDATE',
            calId,
            item,
            decision,
          });
        } else if (decision.action === 'CREATE') {
          if (resolvedOptions.allowCreate && !isDryRun && cal) {
            pendingMutations.push({
              type: 'CREATE',
              calId,
              item,
              decision,
            });
          } else {
            // Unmatched item fail-closed: do not write or mutate calendar
            syncResults.unmatchedCount++;
            syncResults.reviewQueue.push({
              item,
              reason: 'NEW_EVENT_CREATION_NOT_AUTHORIZED_FAIL_CLOSED',
            });
            if (resolvedOptions.failOnUnmatched === true) {
              syncResults.reviewCount++;
            }
          }
        } else if (decision.action === 'REVIEW') {
          syncResults.reviewCount++;
          syncResults.reviewQueue.push({
            item,
            reason: decision.reason,
            candidates: decision.candidates,
          });
        }
      }
    }

    // Guard against Partial Writes: If reviewQueue has reviews or failOnUnmatched holds, ABORT before ANY mutation
    if (syncResults.reviewCount > 0) {
      syncResults.status = 'HOLD';
      // Record planned updates in updatedEvents for visibility without executing
      pendingMutations.forEach(m => {
        if (m.type === 'UPDATE') {
          syncResults.updatedEvents.push({
            calendarId: m.calId,
            eventId: m.decision.eventId,
            oldTitle: m.decision.currentTitle,
            newTitle: m.decision.newTitle,
            reason: m.decision.reason,
            verified: false,
            dryRun: true,
          });
        }
      });
      return syncResults;
    }

    // If dryRun, do not execute mutations
    if (isDryRun) {
      pendingMutations.forEach(m => {
        if (m.type === 'UPDATE') {
          syncResults.updatedEvents.push({
            calendarId: m.calId,
            eventId: m.decision.eventId,
            oldTitle: m.decision.currentTitle,
            newTitle: m.decision.newTitle,
            reason: m.decision.reason,
            verified: false,
            dryRun: true,
          });
        }
      });
      return syncResults;
    }

    // PHASE 2: Execution with Destination Readback (Only when Phase 1 is 100% clean)
    for (const mutation of pendingMutations) {
      if (mutation.type === 'UPDATE') {
        const { calId, item, decision } = mutation;
        let writeVerified = false;
        if (decision.existingEvent && decision.existingEvent._raw) {
          const raw = decision.existingEvent._raw;
          if (typeof raw.setTitle === 'function') {
            callWithRetry(() => raw.setTitle(decision.newTitle));
            // Destination Readback Verification: assert title was changed on event
            const readbackTitle = typeof raw.getTitle === 'function' ? raw.getTitle() : null;
            if (readbackTitle === decision.newTitle) {
              writeVerified = true;
            } else {
              throw new Error('DESTINATION_READBACK_MISMATCH: expected ' + decision.newTitle + ', got ' + readbackTitle);
            }
          }
          const key = item.sourceKey || buildStableSourceKey(item);
          if (typeof raw.setTag === 'function' && key) {
            callWithRetry(() => raw.setTag('source_key', key));
          }
        }

        if (writeVerified) {
          syncResults.updatedCount++;
          syncResults.updatedEvents.push({
            calendarId: calId,
            eventId: decision.eventId,
            oldTitle: decision.currentTitle,
            newTitle: decision.newTitle,
            reason: decision.reason,
            verified: true,
            dryRun: false,
          });
        } else {
          syncResults.reviewCount++;
          syncResults.reviewQueue.push({
            item,
            reason: 'WRITE_VERIFICATION_FAILED_NO_READBACK',
          });
        }
      } else if (mutation.type === 'CREATE') {
        const { calId, item, decision } = mutation;
        const cal = liveCals.get(calId);
        if (cal && typeof cal.createEvent === 'function') {
          const newTitle = decision.newTitle;
          const start = new Date(item.startDate || item.date || Date.now());
          const end = new Date(item.endDate || item.date || (start.getTime() + 3600000));
          const createdEvent = callWithRetry(() => cal.createEvent(newTitle, start, end));
          const readbackId = (createdEvent && typeof createdEvent.getId === 'function') ? createdEvent.getId() : null;
          const readbackTitle = (createdEvent && typeof createdEvent.getTitle === 'function') ? createdEvent.getTitle() : null;
          if (readbackId && readbackTitle === newTitle) {
            syncResults.createdCount++;
            syncResults.createdEvents = syncResults.createdEvents || [];
            syncResults.createdEvents.push({
              calendarId: calId,
              eventId: readbackId,
              title: readbackTitle,
              verified: true,
            });
          } else {
            throw new Error('CREATE_DESTINATION_READBACK_FAILED');
          }
        }
      }
    }

    if (syncResults.reviewCount > 0) {
      syncResults.status = 'HOLD';
    }

    return syncResults;
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
    resolveCalendarIdForTask,
    dryRunGoogleCalendarSync,
    diagnoseCalendarAccess20261024,
    syncGoogleCalendarScheduledJob,
    fetchAuthorizedCalendarSourceItems_,
    setGlobalCalendarSourceProvider_,
    getGlobalCalendarSourceProvider_,
    auditCalendarScriptProperties20261024,
    mapScheduleTaskToCalendarItem_,
    isIndependentSiteEvent_,
    buildSourceToCalendarMatchLedger,
  };
}
