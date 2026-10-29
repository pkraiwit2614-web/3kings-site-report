/**
 * 3 Kings Construction — Defect Smart Sync v1.3 (2026-10-02)
 *
 * Purpose:
 * - Stop rebuilding the condo master from status-bucket columns.
 * - Read the authoritative 263-row "ข้อมูลจำแนก" sheet directly.
 * - Keep the existing 263/A162/B101 + exact-room-set safety gates.
 * - Preserve the old smartSyncDefects15m trigger as rollback until cutover.
 *
 * Prerequisites: existing sync3Kings v1.1.x helpers and Smart Sync v1.2.
 */

const DEFECT_V13 = {
  SHEET_NAME: 'ข้อมูลจำแนก',
  SOURCE_FILE_ID: '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
  SOURCE_FILE_NAME: 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
  STATE_KEY: 'SYNC_CONDO_DEFECT_MASTER_V13',
  HANDLER: 'smartSyncDefectsV13_15m',
  EXPECTED_ROOMS: 263,
  EXPECTED_A: 162,
  EXPECTED_B: 101,
};

function installDefectSyncV13Trigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    const handler = trigger.getHandlerFunction();
    if (handler === 'smartSyncDefects15m' || handler === DEFECT_V13.HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(DEFECT_V13.HANDLER)
    .timeBased()
    .everyMinutes(15)
    .create();

  console.log('Defect Sync v1.3 trigger installed.');
  return ScriptApp.getProjectTriggers().map(t => ({
    handler: t.getHandlerFunction(),
    eventType: String(t.getEventType()),
    source: String(t.getTriggerSource()),
  }));
}

function smartSyncDefectsV13_15m() {
  return runDefectSyncV13_({ dryRun: false, force: false });
}

function smartSyncDefectsV13DryRun() {
  return runDefectSyncV13_({ dryRun: true, force: true });
}

function smartSyncDefectsV13Force() {
  return runDefectSyncV13_({ dryRun: false, force: true });
}

/**
 * One-shot, strictly-scoped Pre Fur. pilot.
 * All 263 source rows and DB inventory are validated before a 5-room subset is written.
 * This never marks the full workbook revision as accepted, because other rooms may differ.
 * It does not install or modify any triggers.
 */
function smartSyncDefectsV13PfurDryRun() {
  const result = runDefectSyncV13_({
    dryRun: true, force: true,
    scopeRooms: ['A311', 'A401', 'B204', 'B502', 'B707'],
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function smartSyncDefectsV13PfurForce() {
  return runDefectSyncV13_({
    dryRun: false, force: true,
    scopeRooms: ['A311', 'A401', 'B204', 'B502', 'B707'],
  });
}

function runDefectSyncV13_(opts) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('Defect Sync v1.3 SKIP: another sync is active.');
    return { status: 'locked' };
  }

  let ctx = null;
  let file = null;
  let temp = null;

  try {
    ctx = buildContext_();

    let folder = ctx.rootFolder;
    SMART_SYNC_CFG.DEFECT_FOLDER_CHAIN.forEach(name => {
      folder = getUniqueChildFolderByName_(folder, name);
    });

    file = findLatestFile_(folder, SMART_SYNC_CFG.DEFECT_FILE_RE);
    // Reject backup, temp, or similarly named workbooks before any database write.
    if (file.getId() !== DEFECT_V13.SOURCE_FILE_ID || file.getName() !== DEFECT_V13.SOURCE_FILE_NAME) {
      throw new Error('Defect sync source is not the approved canonical workbook.');
    }
    const modifiedIso = file.getLastUpdated().toISOString();

    if (!opts.force && isUnchanged_(ctx.props, DEFECT_V13.STATE_KEY, file.getId(), modifiedIso)) {
      console.log(`Defect Sync v1.3 source unchanged, zero-write skip: ${file.getName()}`);
      return {
        status: 'skipped',
        reason: 'source-unchanged',
        file: file.getName(),
        modified: modifiedIso,
      };
    }

    temp = openSpreadsheetFromExcel_(file);
    const ss = SpreadsheetApp.openById(temp.spreadsheetId);
    const sheet = getSheetByNameLoose_(ss, DEFECT_V13.SHEET_NAME);
    if (!sheet) {
      throw new Error(`Defect v1.3 sheet not found: ${DEFECT_V13.SHEET_NAME}`);
    }

    const parsed = parseCondoDefectMasterV13_(sheet);
    const existing = sbGetAll_(
      ctx,
      '/rest/v1/condo_room_status?select=' +
      'room_no,building,floor,owner_name,hotel_participation,customer_status,current_status,status_group,' +
      'follow_up,priority,next_action,latest_source,source_note,old_overall_status,old_handover_result,' +
      'old_rental_pool_status,hotel_non_sold_flag,hotel_raw_complete,hotel_raw_not_completed,' +
      'hotel_complete_color,hotel_remarks,source_file_id,source_file_name,source_modified_at,' +
      'owner_source_file_id,owner_source_file_name,owner_source_modified_at,synced_at,defect_detail'
    );

    validateDefectInventory_(parsed.rows, existing);

    const oldByRoom = {};
    existing.forEach(r => {
      const room = normalizeRoomNo_(r.room_no);
      if (room) oldByRoom[room] = r;
    });

    const nowIso = new Date().toISOString();
    const prepared = parsed.rows.map(src => {
      const old = oldByRoom[src.room_no] || {};
      return {
        room_no: src.room_no,
        building: src.building,
        floor: src.floor,
        owner_name: old.owner_name || null,

        hotel_participation: src.hotel_participation,
        customer_status: src.customer_status,
        current_status: src.current_status,
        status_group: src.status_group,
        follow_up: src.follow_up,
        priority: src.priority,
        next_action: src.next_action,

        latest_source: src.latest_source || old.latest_source || null,
        source_note: src.source_note || old.source_note || null,

        old_overall_status: old.old_overall_status || null,
        old_handover_result: old.old_handover_result || null,
        old_rental_pool_status: old.old_rental_pool_status || null,
        hotel_non_sold_flag: old.hotel_non_sold_flag || null,
        hotel_raw_complete: old.hotel_raw_complete || null,
        hotel_raw_not_completed: old.hotel_raw_not_completed || null,

        hotel_complete_color: src.hotel_complete_color || old.hotel_complete_color || null,
        hotel_remarks: src.hotel_remarks || old.hotel_remarks || null,

        source_file_id: file.getId(),
        source_file_name: file.getName(),
        source_modified_at: modifiedIso,

        owner_source_file_id: old.owner_source_file_id || null,
        owner_source_file_name: old.owner_source_file_name || null,
        owner_source_modified_at: old.owner_source_modified_at || null,

        defect_detail: (src.defect_detail && (
          src.defect_detail.includes('รายการ Defect แจ้งผ่านแชต:') ||
          (src.room_no === 'B515' && src.defect_detail.includes('Customer Defect B515')) ||
          verifiedPdfDefectDetailV13_(src.room_no, src.defect_detail)
        )) ? src.defect_detail : old.defect_detail || null,
        synced_at: nowIso,
      };
    });

    defectDoc167PairGateV13_(prepared);
    const { changed, pendingRooms } = defectV13ScopedChanges_(prepared, oldByRoom, opts);

    if (opts.dryRun) {
      return {
        status: 'dry-run',
        rooms: prepared.length,
        changed: changed.length,
        file: file.getName(),
        modified: modifiedIso,
        validation: parsed.validation,
        changedRooms: changed.map(r => r.room_no),
        pendingOtherRooms: pendingRooms,
        scoped: Boolean(opts.scopeRooms),
      };
    }

    if (changed.length) {
      upsertComposite_(ctx, 'condo_room_status', changed, 'room_no');
    }

    logSyncRun_(ctx, {
      sync_type: 'defects',
      project_code: null,
      source_file: file.getName(),
      source_sheet: sheet.getName(),
      rows_read: prepared.length,
      rows_written: changed.length,
      status: 'success',
      message:
        `Defect Sync v1.3 validated 263 rooms (A=162, B=101, exact room set); ` +
        `${changed.length} semantic row(s) changed; ` +
        (opts.scopeRooms
          ? `SCOPED pilot only; ${pendingRooms.length} other difference(s) deliberately untouched`
          : 'full workbook'),
    });

    // A scoped import is NOT acceptance of the complete Master revision.
    if (!opts.scopeRooms) {
      saveState_(ctx.props, DEFECT_V13.STATE_KEY, file.getId(), modifiedIso);
    }

    console.log(
      `Defect Sync v1.3 SUCCESS | rooms=${prepared.length} changed=${changed.length} file=${file.getName()}`
    );

    return {
      status: 'success',
      rooms: prepared.length,
      changed: changed.length,
      file: file.getName(),
      modified: modifiedIso,
      validation: parsed.validation,
    };
  } catch (err) {
    if (ctx) {
      try {
        safeLogSyncError_(
          ctx,
          'defects',
          null,
          file ? file.getName() : null,
          DEFECT_V13.SHEET_NAME,
          err
        );
      } catch (_) {}
    }
    console.error('Defect Sync v1.3 FAILED: ' + errorMessage_(err));
    throw err;
  } finally {
    cleanupTempSpreadsheet_(temp);
    lock.releaseLock();
  }
}

function parseCondoDefectMasterV13_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const required = [
    'Building',
    'Floor',
    'Room',
    'Hotel Participation',
    'Customer Status',
    'Current Status',
    'Status Group',
    'Follow-up',
    'Priority',
    'Next Action',
  ];

  let headerIdx = -1;
  let headerMap = null;
  const scanLimit = Math.min(values.length, 12);

  for (let r = 0; r < scanLimit; r++) {
    const compactHeaders = values[r].map(compactThai_);
    const map = {};
    let found = 0;

    required.forEach(name => {
      const idx = compactHeaders.indexOf(compactThai_(name));
      map[name] = idx;
      if (idx >= 0) found++;
    });

    if (found === required.length) {
      headerIdx = r;
      headerMap = map;
      break;
    }
  }

  if (headerIdx < 0 || !headerMap) {
    throw new Error(
      `Defect Sync v1.3 cannot locate required headers in "${sheet.getName()}".`
    );
  }

  function optionalColumn(name) {
    return values[headerIdx].map(compactThai_).indexOf(compactThai_(name));
  }

  const latestSourceCol = optionalColumn('Latest Source');
  const sourceNoteCol = optionalColumn('Source Note');
  const completeColorCol = optionalColumn('Hotel Complete Color');
  const remarksCol = optionalColumn('Hotel Remarks');
  const defectDetailCol = optionalColumn('Defect Detail (Web App)');

  const rows = [];
  const seen = {};
  let aCount = 0;
  let bCount = 0;

  for (let r = headerIdx + 1; r < values.length; r++) {
    const roomNo = normalizeRoomNo_(values[r][headerMap['Room']]);
    if (!roomNo) continue;

    if (seen[roomNo]) {
      throw new Error(`Duplicate defect room ${roomNo} at source row ${r + 1}.`);
    }

    const building = (cleanText_(values[r][headerMap['Building']]) || '').toUpperCase();
    const floor = Number(cleanText_(values[r][headerMap['Floor']]));
    const hotel = cleanText_(values[r][headerMap['Hotel Participation']]);
    const customer = cleanText_(values[r][headerMap['Customer Status']]);
    const current = cleanText_(values[r][headerMap['Current Status']]);
    const group = cleanText_(values[r][headerMap['Status Group']]);
    const followUp = cleanText_(values[r][headerMap['Follow-up']]);
    const priority = cleanText_(values[r][headerMap['Priority']]);
    const nextAction = cleanText_(values[r][headerMap['Next Action']]);

    if (building !== roomNo.charAt(0)) {
      throw new Error(`Building mismatch for ${roomNo}: ${building || '-'}.`);
    }

    const expectedFloor = Number(roomNo.charAt(1));
    if (!isFinite(floor) || floor !== expectedFloor) {
      throw new Error(
        `Floor mismatch for ${roomNo}: source=${floor} expected=${expectedFloor}.`
      );
    }

    if (hotel !== 'ร่วมโรงแรม' && hotel !== 'ไม่ร่วมโรงแรม') {
      throw new Error(`Invalid Hotel Participation for ${roomNo}: ${hotel || '-'}.`);
    }

    if (customer !== 'มีลูกค้า' && customer !== 'ไม่มีลูกค้า') {
      throw new Error(`Invalid Customer Status for ${roomNo}: ${customer || '-'}.`);
    }

    if (!current || !group || !followUp || !priority || !nextAction) {
      throw new Error(`Required defect status field is blank for ${roomNo}.`);
    }

    seen[roomNo] = true;
    if (building === 'A') aCount++;
    if (building === 'B') bCount++;

    rows.push({
      room_no: roomNo,
      building,
      floor,
      hotel_participation: hotel,
      customer_status: customer,
      current_status: current,
      status_group: group,
      follow_up: followUp,
      priority,
      next_action: nextAction,
      latest_source: latestSourceCol >= 0 ? cleanText_(values[r][latestSourceCol]) || null : null,
      source_note: sourceNoteCol >= 0 ? cleanText_(values[r][sourceNoteCol]) || null : null,
      hotel_complete_color: completeColorCol >= 0 ? cleanText_(values[r][completeColorCol]) || null : null,
      hotel_remarks: remarksCol >= 0 ? cleanText_(values[r][remarksCol]) || null : null,
      defect_detail: defectDetailCol >= 0 ? cleanText_(values[r][defectDetailCol]) || null : null,
    });
  }

  rows.sort((a, b) => a.room_no.localeCompare(b.room_no));

  if (rows.length !== DEFECT_V13.EXPECTED_ROOMS) {
    throw new Error(
      `Defect Sync v1.3 parsed ${rows.length} rooms; expected ${DEFECT_V13.EXPECTED_ROOMS}.`
    );
  }
  if (aCount !== DEFECT_V13.EXPECTED_A || bCount !== DEFECT_V13.EXPECTED_B) {
    throw new Error(
      `Defect Sync v1.3 building mismatch A=${aCount} B=${bCount}; ` +
      `expected A=${DEFECT_V13.EXPECTED_A} B=${DEFECT_V13.EXPECTED_B}.`
    );
  }

  return {
    rows,
    validation: {
      rooms: rows.length,
      buildingA: aCount,
      buildingB: bCount,
      uniqueRooms: Object.keys(seen).length,
      sourceSheet: sheet.getName(),
    },
  };
}

/**
 * Shared diff guard. Regular scheduled sync retains exactly its old full-sync behavior.
 * Scoped pilot may update ONLY five chat-marked Q details, never another field.
 */
function verifiedPdfDefectDetailV13_(room, detail) {
  if (!detail || String(detail).length > 100000) return false;
  const header = String(detail).match(/^([AB]\d{3}) • [^\r\n]{2,120} Doc ID \d{1,12} • PDF \d{2}\/\d{2}\/\d{4} • Defect ใหม่ (\d{1,3}) รายการ(?:\r?\n|$)/);
  if (!header) return false;
  const sourceRoom = header[1];
  // Approved Combine mirror only. All other PDF inspections require exact room attribution.
  if (sourceRoom !== String(room) && !(sourceRoom === 'A404' && String(room) === 'A405')) return false;
  const expected = Number(header[2]);
  if (expected < 1 || expected > 200) return false;
  const numbered = String(detail).match(/^#\d{2,3}\s+\[[^\]\r\n]+\]/gm) || [];
  return numbered.length === expected &&
    numbered.every((marker, i) => Number(marker.match(/^#(\d+)/)[1]) === i + 1);
}

function defectDoc167PairGateV13_(prepared) {
  const pair = prepared.filter(row => row.room_no === 'A404' || row.room_no === 'A405');
  if (!pair.some(row => verifiedPdfDefectDetailV13_(row.room_no, row.defect_detail))) return;
  if (pair.length !== 2 ||
      pair.some(row => !verifiedPdfDefectDetailV13_(row.room_no, row.defect_detail) ||
        row.defect_detail !== pair[0].defect_detail ||
        row.current_status !== pair[0].current_status ||
        row.status_group !== pair[0].status_group)) {
    throw new Error('DOC167_COMBINE_PAIR_MISMATCH: A404/A405 fail-closed');
  }
}

function defectV13ScopedChanges_(prepared, oldByRoom, opts) {
  const all = prepared.filter(row =>
    defectMasterV13NeedsWrite_(row, oldByRoom[row.room_no] || null)
  );
  if (!opts.scopeRooms) return { changed: all, pendingRooms: [] };

  const expected = ['A311', 'A401', 'B204', 'B502', 'B707'];
  const supplied = [...new Set(opts.scopeRooms)].sort();
  if (supplied.length !== expected.length ||
      supplied.some((room, i) => room !== expected[i])) {
    throw new Error('Scoped Defect sync: exact approved five-room scope required.');
  }
  const changed = all.filter(row => supplied.includes(row.room_no));
  if (changed.length > 5 || changed.some(row => !oldByRoom[row.room_no])) {
    throw new Error('Scoped Defect sync requires existing canonical room records.');
  }

  const protectedFields = [
    'building', 'floor', 'hotel_participation', 'customer_status',
    'current_status', 'status_group', 'follow_up', 'priority', 'next_action',
    'latest_source', 'source_note', 'hotel_complete_color', 'hotel_remarks',
  ];
  changed.forEach(row => {
    const old = oldByRoom[row.room_no];
    if (!row.defect_detail ||
        !row.defect_detail.includes('รายการ Defect แจ้งผ่านแชต:')) {
      throw new Error('Scoped Defect sync rejected non-chat Detail: ' + row.room_no);
    }
    const unsafe = protectedFields.filter(key =>
      normalizeComparable_(row[key]) !== normalizeComparable_(old[key])
    );
    if (unsafe.length) {
      throw new Error('Scoped Defect sync rejected unrelated field(s) for ' +
        row.room_no + ': ' + unsafe.join(','));
    }
  });

  return {
    changed,
    pendingRooms: all.filter(row => !supplied.includes(row.room_no))
      .map(row => row.room_no),
  };
}

function defectMasterV13NeedsWrite_(row, old) {
  if (!old) return true;

  const fields = [
    'building',
    'floor',
    'hotel_participation',
    'customer_status',
    'current_status',
    'status_group',
    'follow_up',
    'priority',
    'next_action',
    'latest_source',
    'source_note',
    'hotel_complete_color',
    'hotel_remarks',
    'defect_detail',
  ];

  return fields.some(
    key => normalizeComparable_(row[key]) !== normalizeComparable_(old[key])
  );
}
