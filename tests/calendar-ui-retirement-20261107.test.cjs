const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')

const read=(path)=>fs.readFileSync(path,'utf8')

test('retired Calendar route is blocked server side without deleting existing page',()=>{
  assert.match(read('app/calendar/layout.tsx'),/import \{notFound\} from 'next\/navigation'/)
  assert.match(read('app/calendar/layout.tsx'),/notFound\(\)/)
  assert.match(read('app/calendar/page.tsx'),/GoogleCalendarManager/)
})

test('retired Work Calendar menu is hidden while other menus remain',()=>{
  const shell=read('components/AppShell.tsx')
  assert.match(shell,/href!==['"]\/calendar['"]/)
  assert.match(shell,/canAccessPath\(presentationRole,href\)/)
  for(const href of ['/schedule','/defect-flow','/materials','/reports']) {
    assert.ok(shell.includes("['"+href+"'"),'expected retained nav item '+href)
  }
})

test('shared Schedule and procurement Calendar API still exist and were not disabled',()=>{
  assert.match(read('app/schedule/page.tsx'),/SchedulePlanActualV41/)
  assert.match(read('app/api/google-calendar/events/route.ts'),/enforceProcurementLinkGuard/)
  assert.match(read('components/GoogleCalendarManager.tsx'),/canEditProcurement/)
})
