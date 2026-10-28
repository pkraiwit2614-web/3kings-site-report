/**
 * P0-B / Apps Script Trigger Inventory, read-only staging source.
 * NOT installed, scheduled or executed by adding this source to GitHub.
 * When an authorized script owner runs it in EACH actual GAS project, it returns
 * the installed triggers belonging to THAT owner only. Other owners' triggers,
 * trigger enabled state and last execution are NOT exposed by ScriptApp.
 * No UrlFetch, no database, no ScriptProperties writes, no trigger creation.
 */
function collect3KingsAppsScriptTriggerSnapshot() {
  var triggers = ScriptApp.getProjectTriggers();
  var entries = triggers.map(function (trigger) {
    var uid = String(trigger.getUniqueId() || '');
    // Hash the trigger UID to avoid exposing a raw platform identifier.
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, uid);
    var hex = bytes.map(function (b) {
      return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
    }).join('');
    return {
      triggerUidSha256Prefix: hex.slice(0, 16),
      handler: String(trigger.getHandlerFunction() || ''),
      eventType: String(trigger.getEventType() || 'UNKNOWN'),
      triggerSource: String(trigger.getTriggerSource() || 'UNKNOWN'),
      registration: 'REGISTERED_FOR_CURRENT_USER',
      enabled: 'NOT_EXPOSED_BY_SCRIPTAPP',
      lastExecution: 'NOT_EXPOSED_BY_SCRIPTAPP'
    };
  });
  return {
    schemaVersion: 1,
    collector: 'GAS_CURRENT_USER_TRIGGER_INVENTORY',
    collectedAt: new Date().toISOString(),
    timezone: Session.getScriptTimeZone(),
    scope: 'CURRENT_ACCOUNT_ONLY',
    triggers: entries,
    notes: ['Other owners triggers are not visible to this account.',
      'No trigger created, deleted, modified or executed by this inventory.']
  };
}
/** Optional manual inspection in the Apps Script editor, never install a trigger. */
function preview3KingsAppsScriptTriggerSnapshot() {
  var result = collect3KingsAppsScriptTriggerSnapshot();
  console.log(JSON.stringify(result));
  return result;
}