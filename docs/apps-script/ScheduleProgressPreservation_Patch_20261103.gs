/**
 * 3 Kings Construction — Schedule Progress Preservation Surgical Patch
 * Purpose: Prevent blank/null/undefined cells from coercing to 0% and destroying existing progress.
 * Verification Status: TESTED & VALIDATED (SCHEDULE_PARSER_PATCH_TEST_PASS)
 * Mode: STAGED ON BRANCH / NOT YET DEPLOYED TO PRODUCTION GAS
 * Date: 2026-11-03
 *
 * Surgical Patch Details:
 * 1. syncProgressPlot_(): Include 'actual_progress' in sbGetAll_ select query.
 * 2. parseProgressSheet_(): Check isSpreadsheetError_ on rawActualProgress, fail closed on non-blank unparseable text,
 *    and use progressOrNull_ instead of progressOrZero_.
 * 3. prepareScheduleUpsert_(): If incoming actual_progress is null/undefined and old.actual_progress exists,
 *    preserve old.actual_progress rather than overwriting with null/0.
 * 4. progressOrNull_(): Support string percentages (e.g. '1%') properly so '1%' becomes 0.01 instead of 1.00.
 */

// --- PATCH 1: In syncProgressPlot_ (Line 192) ---
/*
  // Before:
  const existing = sbGetAll_(ctx,
    `/rest/v1/schedule_tasks?select=id,source_row,source_task_no,task_name,area,planned_start,planned_end,source_identity,is_active&project_id=eq.${encodeURIComponent(project.id)}&source_sheet=eq.${encodeURIComponent(sheetName)}`
  );

  // After (Surgical Patch):
  const existing = sbGetAll_(ctx,
    `/rest/v1/schedule_tasks?select=id,source_row,source_task_no,task_name,area,planned_start,planned_end,actual_progress,source_identity,is_active&project_id=eq.${encodeURIComponent(project.id)}&source_sheet=eq.${encodeURIComponent(sheetName)}`
  );
*/

// --- PATCH 2: In parseProgressSheet_ (Lines 289-306) ---
/*
  // Before:
  const rawPlanProgress = getCell_(r, col.planProgress);
  const rawPlanStatus = getCell_(r, col.planStatus);
  if (isSpreadsheetError_(rawPlanProgress) || isSpreadsheetError_(rawPlanStatus)) {
    throw new Error(`${projectCode}: formula error at Excel row ${i + 1} (plan progress/status). Sync aborted before database write.`);
  }

  rows.push({
    ...
    actual_progress: progressOrZero_(getCell_(r, col.actualProgress)),
    ...
  });

  // After (Surgical Patch):
  const rawActualProgress = getCell_(r, col.actualProgress);
  const rawPlanProgress = getCell_(r, col.planProgress);
  const rawPlanStatus = getCell_(r, col.planStatus);
  if (isSpreadsheetError_(rawActualProgress) || isSpreadsheetError_(rawPlanProgress) || isSpreadsheetError_(rawPlanStatus)) {
    throw new Error(`${projectCode}: formula error at Excel row ${i + 1} (actual/plan progress/status). Sync aborted before database write.`);
  }

  // Fail closed on invalid non-blank string format in actual progress
  if (rawActualProgress !== null && rawActualProgress !== undefined && String(rawActualProgress).trim() !== '' && String(rawActualProgress).trim() !== '-') {
    if (numberOrNull_(rawActualProgress) === null) {
      throw new Error(`${projectCode}: invalid actual progress format "${rawActualProgress}" at Excel row ${i + 1}. Sync aborted before database write.`);
    }
  }

  rows.push({
    ...
    actual_progress: progressOrNull_(rawActualProgress),
    ...
  });
*/

// --- PATCH 3: In prepareScheduleUpsert_ (Lines 370-380) ---
/*
  // Before:
  if (old) {
    row.id = old.id;
    row.source_identity = old.source_identity || makeSourceIdentity_(projectCode, sheetName, row);
    seenIds[old.id] = true;
    matched.push(row);
  } else { ... }

  // After (Surgical Patch):
  if (old) {
    row.id = old.id;
    row.source_identity = old.source_identity || makeSourceIdentity_(projectCode, sheetName, row);
    // Preservation Rule: If incoming source actual_progress is null/undefined (blank in Excel),
    // preserve the existing progress from the database record!
    if (row.actual_progress === null || row.actual_progress === undefined) {
      if (old.actual_progress !== null && old.actual_progress !== undefined) {
        row.actual_progress = old.actual_progress;
      } else {
        row.actual_progress = null;
      }
    }
    seenIds[old.id] = true;
    matched.push(row);
  } else { ... }
*/

// --- PATCH 4: In progressOrNull_ (Line 1463) ---
/*
  // Before:
  function progressOrNull_(v) {
    const n = numberOrNull_(v);
    if (n === null) return null;
    let x = n;
    if (x > 1 && x <= 100) x = x / 100;
    if (x < 0) x = 0;
    if (x > 1) x = 1;
    return Number(x.toFixed(6));
  }

  // After (Surgical Patch):
  function progressOrNull_(v) {
    const n = numberOrNull_(v);
    if (n === null) return null;
    let x = n;
    if (typeof v === 'string' && v.includes('%')) {
      x = n / 100;
    } else if (x > 1 && x <= 100) {
      x = x / 100;
    }
    if (x < 0) x = 0;
    if (x > 1) x = 1;
    return Number(x.toFixed(6));
  }
*/

