const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const read=p=>fs.readFileSync(p,'utf8')

test('both retired hotel routes return 404 without mounting legacy pages',()=>{
  for(const name of ['hotel-work-plan','hotel-room-status']){
    const layout=read('app/'+name+'/layout.tsx')
    assert.match(layout,/import \{notFound\} from 'next\/navigation'/)
    assert.match(layout,/notFound\(\)/)
    // Keep page sources for rollback; a new layout prevents route access.
    assert.ok(fs.existsSync('app/'+name+'/page.tsx'))
  }
})

test('no retired hotel pages, sync reads or UI links remain in active screens',()=>{
  const nav=read('components/AppShell.tsx')
  const defect=read('app/defects/page.tsx')
  const calendar=read('components/GoogleCalendarManager.tsx')
  const matrix=read('components/RolePermissionMatrix.tsx')
  const health=read('app/data-health/page.tsx')
  const print=read('app/defects/print.css')
  assert.doesNotMatch(nav,/hotel-work-plan|hotel-room-status|OOO\/OOS/)
  assert.doesNotMatch(defect,/hotel_work_plan|hotel_room_availability|hotel-work-plan|Work Plan \/ Hotel Status/)
  assert.doesNotMatch(matrix,/path: '\/hotel-work-plan'|path: '\/hotel-room-status'/)
  assert.doesNotMatch(health,/HotelRoomReconciliationPanel/)
  assert.match(calendar,/const canViewDefectPlan=false/)
  assert.doesNotMatch(calendar,/setSelected\(\[DEFECT_WORK_PLAN_CALENDAR\.id\]\)/)
  assert.match(print,/nth-child\(9\).*display:none!important/)
  assert.doesNotMatch(print,/nth-child\(10\).*display:none!important/)
})

test('retirement leaves Defect, Work Order, Schedule, regular Calendar and source scripts intact',()=>{
  const nav=read('components/AppShell.tsx')
  for(const path of ['/defect-flow','/defects','/work-order','/calendar','/schedule','/materials','/procurement'])
    assert.ok(nav.includes(path),'existing route missing: '+path)
  const defect=read('app/defects/page.tsx')
  assert.match(defect,/from\('condo_room_status'\)/)
  assert.match(defect,/from\('defect_work_order_snapshot'\)/)
  const calendar=read('components/GoogleCalendarManager.tsx')
  assert.match(calendar,/from\('work_calendar_events'\)/)
  assert.match(calendar,/api-google-calendar|\/api\/google-calendar\/events/)
  const gs=read('docs/apps-script/ShiftSyncScheduler_2026-10-13.gs')
  assert.match(gs,/syncShiftHourly20261013/)
  assert.match(gs,/syncShiftPhoto0800/)
  const hotelGroups=read('lib/hotelRoomGroups.ts')
  assert.match(hotelGroups,/hotelRoomMembers/)
})
