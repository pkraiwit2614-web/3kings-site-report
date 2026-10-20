/**
 * Read-only calendar projection of the canonical Hotel Work Plan.
 * DO NOT insert into Google Calendar or work_calendar_events.
 * The same projection reflects both Web saves and Excel->Supabase imports.
 */
export const DEFECT_WORK_PLAN_CALENDAR={
 id:'managed:defect-work-plan',
 label:'Work Plan Defect',
 color:'#ba5b34',
} as const

export type DefectPlanDay={day_no:number;planned_date:string|null;note:string|null}
export type DefectPlanRoom={
 seq_no:number
 day_no:number
 room_no:string
 source_room:string
 planned_date_override:string|null
}

export type DefectPlanCalendarEvent={
 id:string
 calendarId:string
 calendarLabel:string
 calendarColor:string
 summary:string
 description:string
 start:{date:string}
 end:{date:string}
 managedWorkPlan:true
 firstRoom:string
 dayNo:number
}

function isDateKey(value:string|null|undefined):value is string{
 if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
 const parsed=new Date(value+'T00:00:00Z')
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value
}
function nextDay(day:string){
 const value=new Date(day+'T00:00:00Z')
 value.setUTCDate(value.getUTCDate()+1)
 return value.toISOString().slice(0,10)
}
export function defectPlanRoomLabel(roomNo:string,sourceRoom:string){
 const room=roomNo.toUpperCase()
 const alias=/^B10([1-5])$/.exec(room)
 return alias?room+' (Good-0'+alias[1]+')':room
}

/**
 * One event per (Day, effective date), containing every distinct canonical room on
 * that date. A room-specific override moves only that room; a Day-date change moves
 * only non-overridden rooms. No date means no calendar event (no invented dates).
 */
export function buildDefectPlanCalendarEvents(
 days:readonly DefectPlanDay[],
 rooms:readonly DefectPlanRoom[],
 fromDate:string,
 untilDate:string,
):DefectPlanCalendarEvent[]{
 const dates=new Map(days.map(day=>[day.day_no,day]))
 const groups=new Map<string,{
  day:number;date:string;roomMap:Map<string,{seq:number;label:string}>;sourceCount:number;dayNote:string
 }>()
 for(const row of rooms){
  const master=dates.get(row.day_no)
  if(!master||!Number.isInteger(row.seq_no)||row.seq_no<1||!Number.isInteger(row.day_no))continue
  const date=row.planned_date_override||master.planned_date
  if(!isDateKey(date)||date<fromDate||date>=untilDate)continue
  const canonical=String(row.room_no||'').trim().toUpperCase()
  if(!/^[AB]\d{3}$/.test(canonical))continue
  const groupKey=row.day_no+'@'+date
  let group=groups.get(groupKey)
  if(!group){
   group={day:row.day_no,date,roomMap:new Map(),sourceCount:0,dayNote:master.note||''}
   groups.set(groupKey,group)
  }
  group.sourceCount+=1
  const old=group.roomMap.get(canonical)
  if(!old||row.seq_no<old.seq){
   group.roomMap.set(canonical,{seq:row.seq_no,label:defectPlanRoomLabel(canonical,row.source_room)})
  }
 }
 return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.day-b.day).map(group=>{
  const roomList=[...group.roomMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
  const count=roomList.length
  const description=[
   'แผนเข้าเก็บ Defect · Day '+group.day,
   'จำนวนห้อง '+count+(group.sourceCount!==count?' ('+group.sourceCount+' รายการในแผน)':''),
   'ห้อง: '+roomList.map(([,item])=>item.label).join(', '),
   group.dayNote.trim()?'หมายเหตุ Day '+group.day+': '+group.dayNote.trim():'',
   'ข้อมูลจาก Hotel Work Plan • แก้ไขวันและรายการห้องที่หน้า Work Plan Defect',
  ].filter(Boolean).join('\n')
  return {
   id:'work-plan-day-'+group.day+'-'+group.date,
   calendarId:DEFECT_WORK_PLAN_CALENDAR.id,
   calendarLabel:DEFECT_WORK_PLAN_CALENDAR.label,
   calendarColor:DEFECT_WORK_PLAN_CALENDAR.color,
   summary:'เข้าเก็บ Defect · Day '+group.day+' · '+count+' ห้อง',
   description,
   start:{date:group.date},
   end:{date:nextDay(group.date)},
   managedWorkPlan:true as const,
   firstRoom:roomList[0]?.[0]||'',
   dayNo:group.day,
  }
 })
}
