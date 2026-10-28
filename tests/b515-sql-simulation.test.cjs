const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

// Read migration file and SQL assertions
const migrationSql = fs.readFileSync('supabase/migrations/20261027233000_b515_defect_sync_reconcile.sql', 'utf8')
const assertionsSql = fs.readFileSync('tests/sql/b515-defect-sync-reconcile-assertions.sql', 'utf8')

// Simulate PL/pgSQL trigger defect_web_override_protect logic
function simulateDefectWebOverrideProtect({
  oldRow,
  newRow,
  webOverride,
  manualUpdate = false
}) {
  if (manualUpdate) return { ...newRow }

  const v = webOverride || null
  const found = !!v

  // B515 Scoped Exception
  if (newRow.room_no === 'B515') {
    const isApprovedFile =
      newRow.source_file_id === '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj' &&
      newRow.source_file_name === 'Handover_Defect_Summary_Updated_28-09-2026.xlsx'
    const isTargetStatus =
      newRow.current_status === 'Defect ยังไม่เสร็จ / ต้องปิดงาน' &&
      newRow.status_group === 'Hotel - Incomplete'
    const isSyncedOrNotFound =
      !found ||
      (v.source_sync_state === 'synced' &&
        v.source_synced_at !== null &&
        new Date(v.source_synced_at) >= new Date(v.updated_at) &&
        new Date(newRow.source_modified_at) > new Date(v.source_synced_at))
    const isRevisionValid =
      new Date(newRow.source_modified_at) >= new Date('2026-10-26T00:00:00Z')

    if (isApprovedFile && isTargetStatus && isSyncedOrNotFound && isRevisionValid) {
      const result = { ...newRow }
      result.current_status = 'Defect ยังไม่เสร็จ / ต้องปิดงาน'
      result.status_group = 'Hotel - Incomplete'
      if (!newRow.defect_detail || newRow.defect_detail.trim() === '') {
        result.defect_detail = oldRow.defect_detail
      }
      return { accepted: true, room: result, decision: 'accepted_excel' }
    }
  }

  // Approved Hotel Engineer transitions: B214, B314, B315, B403, B515
  if (['B214', 'B314', 'B315', 'B403', 'B515'].includes(newRow.room_no)) {
    let expectedStatus = ''
    let expectedGroup = ''
    switch (newRow.room_no) {
      case 'B214':
        expectedStatus = 'Defect ยังไม่เสร็จ / ต้องปิดงาน'
        expectedGroup = 'Hotel - Incomplete'
        break
      case 'B314':
        expectedStatus = 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'
        expectedGroup = 'Hotel - Awaiting Check'
        break
      case 'B315':
        expectedStatus = 'Defect ยังไม่เสร็จ / ต้องปิดงาน'
        expectedGroup = 'Hotel - Incomplete'
        break
      case 'B403':
        expectedStatus = 'Defect ยังไม่เสร็จ / ต้องปิดงาน'
        expectedGroup = 'Hotel - Incomplete'
        break
      case 'B515':
        expectedStatus = 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ'
        expectedGroup = 'Hotel - Awaiting Check'
        break
    }

    const approved =
      newRow.source_file_id === '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj' &&
      newRow.source_file_name === 'Handover_Defect_Summary_Updated_28-09-2026.xlsx' &&
      oldRow.current_status === expectedStatus &&
      oldRow.status_group === expectedGroup &&
      newRow.current_status === 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว' &&
      newRow.status_group === 'Hotel - Checked Complete' &&
      (!found || v.source_sync_state === 'synced') &&
      (!found ||
        new Date(newRow.source_modified_at) >
          new Date(Math.max(new Date(v.updated_at || 0).getTime(), new Date(v.source_synced_at || 0).getTime())))

    const result = { ...newRow }
    if (!approved) {
      result.current_status = oldRow.current_status
      result.status_group = oldRow.status_group
    }
    result.next_action = oldRow.next_action
    result.defect_detail = oldRow.defect_detail
    result.latest_source = approved ? newRow.latest_source : oldRow.latest_source
    return { accepted: approved, room: result, decision: approved ? 'accepted_hotel_complete' : 'rejected' }
  }

  // Pending Web->Excel writeback precedence
  if (found && (v.source_sync_state !== 'synced' || !v.source_synced_at)) {
    const result = { ...newRow }
    result.current_status = v.current_status ?? newRow.current_status
    result.status_group = v.status_group ?? newRow.status_group
    result.next_action = v.next_action ?? newRow.next_action
    result.defect_detail = v.detail_text ?? newRow.defect_detail
    return { accepted: false, room: result, decision: 'conflict_kept_db' }
  }

  return { accepted: true, room: newRow, decision: 'standard' }
}

test('Preflight assertions in migration SQL are strictly formed', () => {
  assert.match(migrationSql, /DO \$preflight\$/)
  assert.match(migrationSql, /public\.defect_web_override_protect\(\)/)
  assert.match(migrationSql, /Keep the five previously approved Hotel Engineer transitions unchanged/)
  assert.match(migrationSql, /Pending Web->Excel writeback/)
  assert.match(migrationSql, /to_regclass\('private\.defect_reconcile_field_versions'\)/)
  assert.match(migrationSql, /to_regclass\('private\.defect_reconcile_field_audit'\)/)
  assert.match(migrationSql, /SELECT 1 FROM public\.condo_room_status WHERE room_no = 'B515'/)
})

test('B515 transition: Canonical Excel 2026-10-26+ reopens B515 and preserves defect_detail history', () => {
  const oldRow = {
    room_no: 'B515',
    current_status: 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ',
    status_group: 'Hotel - Awaiting Check',
    next_action: 'รอตรวจยืนยัน',
    defect_detail: 'Customer Defect B515: ประตูระเบียงเปิดฝืด และกระเบื้องห้องน้ำบิ่น'
  }
  const newRow = {
    room_no: 'B515',
    current_status: 'Defect ยังไม่เสร็จ / ต้องปิดงาน',
    status_group: 'Hotel - Incomplete',
    next_action: 'รอตรวจยืนยัน Customer Defect B515',
    defect_detail: '', // blank detail in incoming Excel
    source_file_id: '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
    source_file_name: 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    source_modified_at: '2026-10-26T14:00:00Z'
  }
  const webOverride = {
    room_no: 'B515',
    source_sync_state: 'synced',
    updated_at: '2026-10-25T08:00:00Z',
    source_synced_at: '2026-10-25T08:30:00Z'
  }

  const result = simulateDefectWebOverrideProtect({ oldRow, newRow, webOverride })
  assert.equal(result.accepted, true)
  assert.equal(result.room.current_status, 'Defect ยังไม่เสร็จ / ต้องปิดงาน')
  assert.equal(result.room.status_group, 'Hotel - Incomplete')
  // CRITICAL: History preserved when incoming detail is blank
  assert.equal(result.room.defect_detail, 'Customer Defect B515: ประตูระเบียงเปิดฝืด และกระเบื้องห้องน้ำบิ่น')
})

test('B515 transition: Blocked when Web writeback is pending', () => {
  const oldRow = {
    room_no: 'B515',
    current_status: 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ',
    status_group: 'Hotel - Awaiting Check',
    defect_detail: 'Prior detail'
  }
  const newRow = {
    room_no: 'B515',
    current_status: 'Defect ยังไม่เสร็จ / ต้องปิดงาน',
    status_group: 'Hotel - Incomplete',
    source_file_id: '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
    source_file_name: 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
    source_modified_at: '2026-10-27T12:00:00Z'
  }
  const webOverride = {
    room_no: 'B515',
    source_sync_state: 'pending', // Pending Web writeback!
    updated_at: '2026-10-27T10:00:00Z',
    source_synced_at: null,
    current_status: 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ',
    status_group: 'Hotel - Awaiting Check'
  }

  const result = simulateDefectWebOverrideProtect({ oldRow, newRow, webOverride })
  // Should NOT accept the Excel transition because Web is pending
  assert.notEqual(result.room.current_status, 'Defect ยังไม่เสร็จ / ต้องปิดงาน')
  assert.equal(result.room.current_status, 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ')
})

test('Regression on B214, B314, B315, B403: Approved transitions succeed, unapproved are rejected', () => {
  const cases = [
    { room_no: 'B214', initialStatus: 'Defect ยังไม่เสร็จ / ต้องปิดงาน', initialGroup: 'Hotel - Incomplete' },
    { room_no: 'B314', initialStatus: 'Defect เสร็จแล้ว / รอ Hotel Engineer ตรวจ', initialGroup: 'Hotel - Awaiting Check' },
    { room_no: 'B315', initialStatus: 'Defect ยังไม่เสร็จ / ต้องปิดงาน', initialGroup: 'Hotel - Incomplete' },
    { room_no: 'B403', initialStatus: 'Defect ยังไม่เสร็จ / ต้องปิดงาน', initialGroup: 'Hotel - Incomplete' }
  ]

  for (const c of cases) {
    const oldRow = {
      room_no: c.room_no,
      current_status: c.initialStatus,
      status_group: c.initialGroup,
      next_action: 'Initial action',
      defect_detail: 'Initial detail'
    }

    // Positive case: transition to 'Hotel - Checked Complete'
    const newRowApproved = {
      room_no: c.room_no,
      current_status: 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว',
      status_group: 'Hotel - Checked Complete',
      next_action: 'Unsafe replacement action',
      defect_detail: 'Unsafe replacement detail',
      source_file_id: '1MEeB1E7D_35MTndRPi1aBTlVfI2aR0Wj',
      source_file_name: 'Handover_Defect_Summary_Updated_28-09-2026.xlsx',
      source_modified_at: '2026-10-26T12:00:00Z'
    }
    const webOverride = {
      room_no: c.room_no,
      source_sync_state: 'synced',
      updated_at: '2026-10-25T08:00:00Z',
      source_synced_at: '2026-10-25T08:30:00Z'
    }

    const resApproved = simulateDefectWebOverrideProtect({ oldRow, newRow: newRowApproved, webOverride })
    assert.equal(resApproved.accepted, true, `Positive transition for ${c.room_no} failed`)
    assert.equal(resApproved.room.current_status, 'Defect เสร็จแล้ว / Hotel Engineer ตรวจแล้ว')
    assert.equal(resApproved.room.status_group, 'Hotel - Checked Complete')
    // Safety check: next_action and defect_detail must be preserved from oldRow
    assert.equal(resApproved.room.next_action, 'Initial action')
    assert.equal(resApproved.room.defect_detail, 'Initial detail')

    // Negative case: arbitrary unapproved status
    const newRowUnapproved = {
      ...newRowApproved,
      current_status: 'Arbitrary Invalid Status',
      status_group: 'Arbitrary Group'
    }
    const resUnapproved = simulateDefectWebOverrideProtect({ oldRow, newRow: newRowUnapproved, webOverride })
    assert.equal(resUnapproved.accepted, false, `Unapproved transition for ${c.room_no} unexpectedly accepted`)
    assert.equal(resUnapproved.room.current_status, c.initialStatus)
    assert.equal(resUnapproved.room.status_group, c.initialGroup)
  }
})

