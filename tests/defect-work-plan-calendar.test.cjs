const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')

const source=fs.readFileSync('lib/defectWorkPlanCalendar.ts','utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText
const context={exports:{},Date,Map,Set,Number}
vm.createContext(context)
vm.runInContext(compiled,context)
const {buildDefectPlanCalendarEvents,DEFECT_WORK_PLAN_CALENDAR}=context.exports

const day=(day_no,planned_date,note=null)=>({day_no,planned_date,note})
const room=(seq_no,day_no,room_no,planned_date_override=null,source_room=room_no)=>({
 seq_no,day_no,room_no,source_room,planned_date_override
})
const make=(days,rooms)=>buildDefectPlanCalendarEvents(days,rooms,'2026-10-01','2026-12-01')
const entries=fs.readFileSync('components/GoogleCalendarManager.tsx','utf8')
const page=fs.readFileSync('app/hotel-work-plan/page.tsx','utf8')

test('no dates means zero generated events; never create placeholder meetings',()=>{
 assert.equal(make([day(1,null)],[room(1,1,'A202')]).length,0)
 assert.equal(make([day(1,null)],[room(1,1,'A202','2026-10-20')]).length,1)
})
test('day change automatically moves all inherited rooms but keeps overrides',()=>{
 const rows=[room(1,1,'A202'),room(2,1,'A203'),room(3,1,'B101','2026-10-23','GOOD01')]
 const original=make([day(1,'2026-10-20')],rows)
 assert.equal(original.length,2)
 assert.equal(original.find(r=>r.start.date==='2026-10-20').summary,'เข้าเก็บ Defect · Day 1 · 2 ห้อง')
 assert.match(original.find(r=>r.start.date==='2026-10-23').description,/B101 \(Good-01\)/)
 const moved=make([day(1,'2026-10-22')],rows)
 assert.equal(moved.find(r=>r.start.date==='2026-10-20'),undefined)
 assert.equal(moved.find(r=>r.start.date==='2026-10-22').summary,'เข้าเก็บ Defect · Day 1 · 2 ห้อง')
 assert.equal(moved.find(r=>r.start.date==='2026-10-23').summary,'เข้าเก็บ Defect · Day 1 · 1 ห้อง')
 assert.ok(moved.every(event=>event.managedWorkPlan&&event.calendarId===DEFECT_WORK_PLAN_CALENDAR.id))
})
test('moving one room between Days moves the corresponding calendar group without duplicates',()=>{
 const records=[room(1,1,'A202'),room(2,1,'A203'),room(3,2,'B202')]
 const days=[day(1,'2026-10-20'),day(2,'2026-10-21')]
 assert.deepEqual(Array.from(make(days,records),x=>x.summary),[
  'เข้าเก็บ Defect · Day 1 · 2 ห้อง','เข้าเก็บ Defect · Day 2 · 1 ห้อง'
 ])
 records[1].day_no=2
 assert.deepEqual(Array.from(make(days,records),x=>x.summary),[
  'เข้าเก็บ Defect · Day 1 · 1 ห้อง','เข้าเก็บ Defect · Day 2 · 2 ห้อง'
 ])
 const distinct=make(days,[room(4,1,'B101',null,'GOOD01'),room(5,1,'B101',null,'B101')])
 assert.equal(distinct[0].summary,'เข้าเก็บ Defect · Day 1 · 1 ห้อง')
 assert.match(distinct[0].description,/2 รายการในแผน/)
})
test('removing a date removes stale event; date boundaries honored',()=>{
 const noDate=make([day(1,'2026-10-21')],[room(1,1,'A202',null)])
 assert.equal(noDate.length,1)
 assert.equal(make([day(1,null)],[room(1,1,'A202',null)]).length,0)
 assert.equal(buildDefectPlanCalendarEvents([day(1,'2026-12-01')],[room(1,1,'A202')],'2026-10-01','2026-12-01').length,0)
 assert.equal(make([day(1,'2026-10-21')],[room(1,1,'A202','bad-date')]).length,0)
})
test('calendar projection is read only and uses existing role guards, with no Google or work_calendar_events writes',()=>{
 assert.match(entries,/buildDefectPlanCalendarEvents/)
 assert.match(entries,/hotel_work_plan_days/)
 assert.match(entries,/hotel_work_plan_rooms/)
 assert.match(entries,/managedPlanSelected/)
 assert.match(entries,/window\.setInterval\(\(\)=>\{void refreshPlan\(\)\},60_000\)/)
 assert.match(entries,/canAccessPath\(role,'\/hotel-work-plan'\)/)
 assert.match(entries,/draft\.calendarId===DEFECT_WORK_PLAN_CALENDAR\.id\|\|!draft\.title\.trim\(\)/)
 assert.match(entries,/managedPlanDraft&&managedPlanRoom/)
 assert.match(entries,/calendar\.source==='web'&&editable/)
 assert.match(page,/view=work-plan-defect/)
 const executable=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'')
 assert.doesNotMatch(executable,/fetch\(|insert\(|update\(|delete\(|work_calendar_events/)
 const oldCalendar=fs.readFileSync('lib/workCalendars.ts','utf8')
 assert.doesNotMatch(oldCalendar,/managed:defect-work-plan/)
})
