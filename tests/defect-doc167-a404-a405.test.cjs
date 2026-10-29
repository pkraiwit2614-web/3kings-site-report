const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const gas = fs.readFileSync('docs/apps-script/SmartSyncDefects_v1.3_2026-10-02.gs','utf8')
const route = fs.readFileSync('app/api/sync/drive/route.ts','utf8')
const sql = fs.readFileSync('supabase/migrations/20261029160000_defect_doc167_a404_a405_detail_gate.sql','utf8')
const source = 'A404 • Art House Group Doc ID 167 • PDF 28/10/2026 • Defect ใหม่ 43 รายการ\n' +
  Array.from({length:43},(_,i)=>'#'+String(i+1).padStart(2,'0')+' [PFur] verified point '+(i+1)).join('\n')
const context=vm.createContext({console,Date,normalizeComparable_: (v) => v == null ? '' : String(v).trim()})
vm.runInContext(gas,context,{timeout:1500,filename:'SmartSyncDefects_v1.3.gs'})
const allowed=vm.runInContext('verifiedPdfDefectDetailV13_',context)
const pairGate=vm.runInContext('defectDoc167PairGateV13_',context)

test('A404+A405 exact Doc167 43 points accepted; malformed and unrelated content rejected',()=>{
  assert.equal(allowed('A404',source),true)
  assert.equal(allowed('A405',source),true)
  assert.equal(allowed('A401',source),false)
  assert.equal(allowed('B515',source),false)
  assert.equal(allowed('A404',source.replace('#43','BAD')),false)
  assert.equal(allowed('A404',source.replace('Doc ID 167','Doc ID 168')),true)
  assert.equal(allowed('A404','No evidence'),false)
})
test('new verified PDF details work for future room and document without parser edits',()=>{
  const fresh = 'A512 • Building Engineer Doc ID 168 • PDF 29/10/2026 • Defect ใหม่ 2 รายการ\n' +
    '#01 [MEP] Verified item\n#02 [Wet] Verified item';
  assert.equal(allowed('A512',fresh),true)
  assert.equal(allowed('A513',fresh),false)
  assert.equal(allowed('A512',fresh.replace('2 รายการ','3 รายการ')),false)
  assert.equal(allowed('A512',fresh.replace('#02','#01')),false)
  assert.equal(allowed('A405',source),true)
})
test('Combine pair rejects mismatch without inventing a Hotel OK or changing statuses',()=>{
  const row=(room,detail=source)=>({room_no:room,defect_detail:detail,current_status:'Pending Handover / รอลูกค้าเข้าตรวจ',status_group:'Non-Hotel - Pending Handover'})
  assert.doesNotThrow(()=>pairGate([row('A404'),row('A405')]))
  assert.throws(()=>pairGate([row('A404'),row('A405',null)]),/DOC167_COMBINE_PAIR_MISMATCH/)
  assert.throws(()=>pairGate([row('A404'),{...row('A405'),current_status:'Hotel - Checked Complete'}]),/DOC167_COMBINE_PAIR_MISMATCH/)
})
test('Scoped A404/A405 is atomic, detail-only and refuses unilateral or status changes',()=>{
  const scoped = vm.runInContext('defectV13ScopedChanges_',context)
  const row = (room)=>({
    room_no:room,defect_detail:source,
    current_status:'Pending Handover / รอลูกค้าเข้าตรวจ',
    status_group:'Non-Hotel - Pending Handover'
  })
  const old = (room)=>({...row(room),defect_detail:null})
  const updated = [row('A404'),row('A405')]
  const before = {A404:old('A404'),A405:old('A405')}
  const result = scoped(updated,before,{scopeRooms:['A404','A405']})
  assert.equal(result.changed.length,2)
  assert.throws(()=>scoped(updated,before,{scopeRooms:['A404']}),/unapproved room scope/)
  assert.throws(()=>scoped(updated,{...before,A405:row('A405')},{scopeRooms:['A404','A405']}),/atomically/)
  assert.throws(()=>scoped([{...updated[0],current_status:'Hotel - Checked Complete'},updated[1]],before,
    {scopeRooms:['A404','A405']}),/DOC167_COMBINE_PAIR_MISMATCH|unrelated field/)
})
test('Existing chat and B515 paths, Web override, Work Order and unrelated modules preserved',()=>{
  assert.match(gas,/src\.defect_detail\.includes\('รายการ Defect แจ้งผ่านแชต:'\)/)
  assert.match(gas,/src\.room_no === 'B515' && src\.defect_detail\.includes\('Customer Defect B515'\)/)
  assert.match(route,/detail\?\.includes\('รายการ Defect แจ้งผ่านแชต:'\)/)
  assert.match(route,/roomNo === 'B515' && detail\?\.includes\('Customer Defect B515'\)/)
  assert.match(sql,/DOC167_WEB_OVERRIDE_TRIGGER_CHANGED/)
  assert.match(sql,/DOC167_COMBINE_PAIR_MISMATCH/)
  assert.match(sql,/source_sync_state <> 'synced'/)
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.defect_web_override_protect/)
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.defect_work_order_sync_import/)
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM public|TRUNCATE/i)
})
