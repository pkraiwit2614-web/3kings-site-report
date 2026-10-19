const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const read = p => fs.readFileSync(p, 'utf8')
const gas = read('docs/apps-script/SmartSyncDefects_v1.3_2026-10-02.gs')
const route = read('app/api/sync/drive/route.ts')
const sql = read('supabase/migrations/20261019162500_defect_excel_chat_detail_sync.sql')
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
