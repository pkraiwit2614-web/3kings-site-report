const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const read = p => fs.readFileSync(p, 'utf8')
const gas = read('docs/apps-script/SmartSyncDefects_v1.3_2026-10-02.gs')
const route = read('app/api/sync/drive/route.ts')
const sql = read('supabase/migrations/20261020125000_defect_chat_detail_scoped_guard_20261020.sql')
const report = read('app/defects/page.tsx')
const order = read('app/work-order/page.tsx')

test('Excel chat-marked detail is read by both existing importers without changing other statuses', () => {
  assert.match(gas, /optionalColumn\('Defect Detail \(Web App\)'\)/)
  assert.match(gas, /defect_detail: defectDetailCol >= 0/)
  assert.match(gas, /src\.defect_detail\.includes\('รายการ Defect แจ้งผ่านแชต:'\)/)
  assert.match(gas, /'defect_detail',/)
  assert.match(route, /valueByHeader\(r, headers, 'Defect Detail \(Web App\)'\)/)
  assert.match(route, /detail\?\.includes\('รายการ Defect แจ้งผ่านแชต:'\)/)
  assert.match(sql, /c\.defect_detail is distinct from r->>'defect_detail'/)
  assert.match(sql, /defect_detail = case when/)
  assert.match(sql, /else c\.defect_detail end/)
  assert.match(sql, /private\.drive_sync_key_valid\(p_sync_key\)/)
  assert.match(sql, /Handover_Defect_Summary_Updated_28-09-2026\.xlsx/)
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|ALTER TABLE/i)
})

test('Non-hotel unfinished jobs appear beside, not instead of, hotel Work Orders', () => {
  assert.match(order, /members\.every\(room=>roomMap\.get\(room\)==='Hotel - Incomplete'\)/)
  assert.match(order, /members\.length===1&&members\.every\(room=>roomMap\.get\(room\)\?\.startsWith\('Non-Hotel -'\)\)/)
  assert.match(report, /members\.length===1&&members\.every\(room=>roomStatus\.get\(room\)\?\.startsWith\('Non-Hotel -'\)\)/)
  assert.match(order, /\.eq\('source_active',true\)/)
  assert.doesNotMatch(order, /\.update\(|\.delete\(|\.upsert\(|\.insert\(/)
  assert.match(order, /canAccessWorkOrder\(role\)/)
})


test('functional 263-row master: Q chat updates change only a valid room Defect Detail', () => {
  const vm = require('node:vm')
  const context = vm.createContext({
    console,
    Date,
    compactThai_: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
    cleanText_: value => String(value ?? '').trim(),
    normalizeRoomNo_: value => String(value ?? '').replace(/\s+/g, '').toUpperCase(),
    normalizeComparable_: value => String(value ?? ''),
  })
  vm.runInContext(gas, context, {timeout: 1500, filename:'SmartSyncDefects_v1.3.gs'})
  const titles = [
    'Building','Floor','Room','Hotel Participation','Customer Status',
    'Current Status','Status Group','Follow-up','Priority','Next Action',
    'Defect Detail (Web App)',
  ]
  const roomRows = []
  for (const [building, total] of [['A',162],['B',101]]) {
    for (let i=0; i<total; i++) {
      const floor = Math.floor(i/50)+1
      const room = building + floor + String(i%50+1).padStart(2,'0')
      roomRows.push([
        building, floor, room, 'ไม่ร่วมโรงแรม','มีลูกค้า',
        'Pending Handover / รอลูกค้าเข้าตรวจ','Non-Hotel - Pending Handover',
        'รอตรวจ','ปกติ','รออัปเดต',
        room === 'A101' ? '19/10/2026 — รายการ Defect แจ้งผ่านแชต: แก้ไขลามิเนตบวม' : '',
      ])
    }
  }
  const sheet={getName:()=> 'ข้อมูลจำแนก',getDataRange:()=>({getDisplayValues:()=>[titles,...roomRows]})}
  const parsed=vm.runInContext('parseCondoDefectMasterV13_',context)(sheet)
  assert.equal(parsed.rows.length,263)
  assert.equal(parsed.validation.buildingA,162)
  assert.equal(parsed.validation.buildingB,101)
  const target=parsed.rows.find(r=>r.room_no==='A101')
  const other=parsed.rows.find(r=>r.room_no==='A102')
  assert.ok(target.defect_detail.includes('แก้ไขลามิเนตบวม'))
  assert.equal(other.defect_detail,null)
  const needsWrite=vm.runInContext('defectMasterV13NeedsWrite_',context)
  assert.equal(needsWrite(target,{...target,defect_detail:null}),true)
  assert.equal(needsWrite(target,{...target}),false)
  assert.equal(needsWrite(other,{...other}),false)
  assert.equal(target.status_group,'Non-Hotel - Pending Handover')
  assert.equal(other.status_group,'Non-Hotel - Pending Handover')
})


test('scoped Pre Fur. sync writes only the five chat-marked Q details; leaves seven pending', () => {
  const vm=require('node:vm')
  const context=vm.createContext({
    console,
    normalizeComparable_: value => String(value ?? '').trim(),
  })
  vm.runInContext(gas,context,{timeout:1500,filename:'SmartSyncDefects_v1.3.gs'})
  const scoped=vm.runInContext('defectV13ScopedChanges_',context)
  const expected=['A311','A401','B204','B502','B707']
  const seven=['A212','A313','A314','A417','A418','B208','B212']
  const common={
    building:'A',floor:3,hotel_participation:'ไม่ร่วมโรงแรม',
    customer_status:'มีลูกค้า',current_status:'Handover Complete',
    status_group:'Non-Hotel - Handover Complete',follow_up:'ไม่ต้องติดตาม',
    priority:'Close',next_action:'Unchanged',
    latest_source:'Verified',source_note:null,hotel_complete_color:null,hotel_remarks:null,
  }
  const rows=expected.map(room=>({
    ...common,room_no:room,defect_detail:'19/10/2026 — รายการ Defect แจ้งผ่านแชต: งาน Pre Fur.'
  })).concat(seven.map(room=>({...common,room_no:room,next_action:'Source changed',defect_detail:null})))
  const oldByRoom=Object.fromEntries(rows.map(row=>[
    row.room_no,{...row,
      defect_detail: expected.includes(row.room_no)?null:row.defect_detail,
      next_action: seven.includes(row.room_no)?'DB older':row.next_action}
  ]))
  const dry=scoped(rows,oldByRoom,{scopeRooms:expected})
  assert.equal(dry.changed.length,5)
  assert.equal(dry.changed.map(r=>r.room_no).join(','),expected.join(','))
  assert.equal(dry.pendingRooms.length,7)
  assert.equal(dry.pendingRooms.join(','),seven.join(','))
  assert.equal(scoped(rows,oldByRoom,{}).changed.length,12)
  assert.throws(()=>scoped(rows,oldByRoom,{scopeRooms:['A311']}),/five-room scope/)
  const unsafe=rows.map(r=>({...r}))
  unsafe[0].status_group='Hotel - Checked Complete'
  assert.throws(()=>scoped(unsafe,oldByRoom,{scopeRooms:expected}),/unrelated field/)
  assert.match(gas,/if \(!opts\.scopeRooms\) \{\s+saveState_/)
  assert.match(gas,/smartSyncDefectsV13PfurDryRun/)
  assert.match(gas,/smartSyncDefectsV13PfurForce/)
})

test('scoped migration guards the live RPC and preserves override precedence', () => {
  assert.match(sql,/DEFECT_RPC_BASELINE_CHANGED_REVIEW_REQUIRED/)
  assert.match(sql,/DEFECT_OVERRIDE_TRIGGER_CHANGED_REVIEW_REQUIRED/)
  assert.match(sql,/DEFECT_FIELD_RECONCILIATION_NOT_INSTALLED/)
  assert.equal((sql.match(/v_room in \('A311','A401','B204','B502','B707'\)/g)||[]).length,2)
  assert.doesNotMatch(sql,/DROP TABLE|ALTER TABLE|DELETE FROM/i)
})
