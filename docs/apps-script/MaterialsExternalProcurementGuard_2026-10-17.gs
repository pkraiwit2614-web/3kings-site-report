/**
 * 3 Kings — 2026-10-17 master procurement reconciliation guard.
 * HELPER ONLY: integrate into current live sync3Kings.planMaterialsTable_,
 * after reviewing the actual GAS source. This file alone changes NO live code.
 * No writes, no mutation, and no network calls.
 */
function partitionProcurementForMasterSync20261017_(existingRows, masterSourceSheet) {
  var masterSheet = masterSourceSheet || '04 Purchasing ค้างส่ง';
  var externalSheet = 'PR-QUOTATION Approved 2026-10-14';
  var preservedIds = {
    '0800abb4-cc10-431d-a466-e1317739ed6f': true,
    '0cf3e226-d14f-40c3-ad84-0b09e6ffac76': true,
    '228fb09c-0dad-440d-a291-1b530fcbf72c': true,
    '710679d7-d0c7-465e-b4c6-131995e20797': true,
    '775862af-1a3b-4753-bea2-44dbbffd5730': true,
    'af82f4d9-c133-496f-b979-6a30b57672a9': true,
    'afb1fb16-d1e9-48bc-94f3-465d5b63051e': true,
    'c9bf165b-61d1-4698-8c49-c721956efc4c': true
  };
  if (!Array.isArray(existingRows)) {
    throw new Error('Procurement reconciliation: invalid database row array; no writes');
  }
  var comparable = [], preserved = [], unrecognized = [], seen = {};
  existingRows.forEach(function(row) {
    if (!row || !row.id || !row.source_sheet || seen[row.id]) {
      throw new Error('Procurement reconciliation: incomplete/duplicate row identity; no writes');
    }
    seen[row.id] = true;
    if (row.source_sheet === masterSheet) {
      comparable.push(row);
    } else if (row.source_sheet === externalSheet && preservedIds[row.id]) {
      preserved.push(row);
    } else {
      unrecognized.push(row.id + ' [' + row.source_sheet + ']');
    }
  });
  if (unrecognized.length || preserved.length !== 8) {
    throw new Error('Procurement reconciliation: source population differs from approved 8-record exemption; no writes: ' + unrecognized.join(', '));
  }
  // CRITICAL: use comparable for ALL master-owned matching, missing-source
  // checks, update and delete plans. Never pass preserved to those operations.
  return { comparable: comparable, preserved: preserved };
}
