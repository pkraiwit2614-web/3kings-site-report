/**
 * 3 Kings hotel-only trigger retirement (2026-11-07).
 * Install/run ONLY inside the EXISTING Apps Script project that owns both
 * Hotel OOO/OOS and Hotel Work Plan workers. Never install in a new project.
 * No changes to Defect, Daily Report, Materials, Schedule, Photo, or Calendar triggers.
 * Does not alter source Excel / Supabase / trigger cadence for other pipelines.
 */
var RETIRED_HOTEL_HANDLER_NAMES_20261107 = Object.freeze([
  'hotelOOOExecuteWriteback',
  'hotelWorkPlanSyncNow'
]);

function hotelModuleRetirementStatus20261107() {
  var all = ScriptApp.getProjectTriggers();
  var counts = {};
  RETIRED_HOTEL_HANDLER_NAMES_20261107.forEach(function(name) { counts[name] = 0; });
  all.forEach(function(trigger) {
    var name = trigger.getHandlerFunction();
    if (Object.prototype.hasOwnProperty.call(counts, name)) counts[name] += 1;
  });
  return {
    scriptId: ScriptApp.getScriptId(),
    retired: counts,
    unrelatedTriggerCount: all.length - RETIRED_HOTEL_HANDLER_NAMES_20261107
      .reduce(function(sum, name) { return sum + counts[name]; }, 0),
    // Counts from THIS Apps Script project only; do not assume other projects were checked.
    scope: 'EXISTING_SCRIPT_PROJECT_ONLY'
  };
}

/**
 * Apply once after verifying the script ID matches the existing project.
 * Deletes only the two dedicated hotel handlers by exact name.
 * Keeps every unrelated trigger by unique ID unchanged.
 */
function hotelModuleRetirementApply20261107() {
  var retired = {};
  RETIRED_HOTEL_HANDLER_NAMES_20261107.forEach(function(name) { retired[name] = true; });
  var before = ScriptApp.getProjectTriggers();
  var keepBefore = before.filter(function(t) { return !retired[t.getHandlerFunction()]; })
    .map(function(t) { return t.getUniqueId(); }).sort();
  var hotelOnly = before.filter(function(t) { return retired[t.getHandlerFunction()]; });
  hotelOnly.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  var after = ScriptApp.getProjectTriggers();
  var keepAfter = after.filter(function(t) { return !retired[t.getHandlerFunction()]; })
    .map(function(t) { return t.getUniqueId(); }).sort();
  var unexpected = after.filter(function(t) { return retired[t.getHandlerFunction()]; });
  if (JSON.stringify(keepBefore) !== JSON.stringify(keepAfter))
    throw new Error('UNRELATED_TRIGGER_SET_CHANGED_STOP_AND_INVESTIGATE');
  if (unexpected.length)
    throw new Error('HOTEL_TRIGGER_STILL_ACTIVE_STOP_AND_INVESTIGATE');
  return {
    ok: true,
    scriptId: ScriptApp.getScriptId(),
    deletedHandlerCounts: RETIRED_HOTEL_HANDLER_NAMES_20261107.map(function(name) {
      return { handler: name, count: hotelOnly.filter(function(t) {
        return t.getHandlerFunction() === name;
      }).length };
    }),
    preservedUnrelatedTriggers: keepAfter.length,
    remainingRetiredTriggers: unexpected.length
  };
}
