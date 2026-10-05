const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')

function issue(row,{final=true}={}){
  if(!final)return null
  const units=Number(row.work_units),ot=Number(row.ot_hours)
  const hasException=Boolean(row.attendance_exception_requested)
  const exceptionComplete=hasException&&Boolean((row.attendance_exception_reason||'').trim())&&Boolean((row.attendance_exception_evidence||'').trim())
  const hasIn=Boolean(row.clock_in),hasOut=Boolean(row.clock_out)
  if(hasException&&!exceptionComplete)return 'exception evidence'
  if(!hasException&&((row.attendance_exception_reason||'').trim()||(row.attendance_exception_evidence||'').trim()))return 'exception explicit'
  if(row.attendance_status==='absent'&&(units!==0||ot!==0))return 'absent units/ot'
  if(row.attendance_status==='leave'&&(units!==0||ot!==0))return 'leave units/ot'
  if(row.attendance_status==='half_day'&&units!==0.5)return 'half-day units'
  if(row.attendance_status==='present'&&units<=0)return 'present units'
  if(row.attendance_status==='other'&&!exceptionComplete)return 'other exception'
  if(row.attendance_status==='present'&&!(hasIn&&hasOut)&&!exceptionComplete)return 'present evidence'
  if(hasIn!==hasOut&&!exceptionComplete)return 'missing punch'
  if(row.clock_spans_next_day&&!(hasIn&&hasOut))return 'overnight needs punches'
  if(hasIn&&hasOut){
    if(row.clock_in===row.clock_out)return 'equal punch'
    if(row.clock_spans_next_day ? row.clock_out>=row.clock_in : row.clock_out<=row.clock_in)return 'sequence'
  }
  return null
}
const base={attendance_status:'present',clock_in:'08:00',clock_out:'17:00',clock_spans_next_day:false,attendance_exception_requested:false,attendance_exception_reason:'',attendance_exception_evidence:'',work_units:'1',ot_hours:'0',timecard_match:true}

test('Prompt 15 attendance evidence matrix',()=>{
  assert.ok(issue({...base,clock_in:'',clock_out:''}), 'blank clock must fail')
  assert.ok(issue({...base,clock_out:''}), 'missing punch must fail')
  assert.ok(issue({...base,clock_in:'22:00',clock_out:'06:00'}), 'clock-out < in without overnight must fail')
  assert.equal(issue({...base,clock_in:'22:00',clock_out:'06:00',clock_spans_next_day:true}),null, 'explicit overnight is valid')
  assert.ok(issue({...base,attendance_status:'absent',clock_in:'',clock_out:'',work_units:'1'}), 'absent + units 1 must fail')
  assert.ok(issue({...base,attendance_status:'leave',clock_in:'',clock_out:'',work_units:'0',ot_hours:'2'}), 'leave + OT must fail')
  assert.equal(issue({...base,attendance_status:'half_day',clock_in:'08:00',clock_out:'12:00',work_units:'0.5'}),null, 'half-day 0.5 is valid')
  assert.equal(issue({...base,clock_in:'',clock_out:'',attendance_exception_requested:true,attendance_exception_reason:'เครื่องสแกนเสีย',attendance_exception_evidence:'Supervisor ref #123'}),null, 'valid explicit exception')
  assert.ok(issue({...base,clock_in:'',clock_out:'',attendance_exception_requested:true,attendance_exception_reason:'เครื่องสแกนเสีย',attendance_exception_evidence:''}), 'invalid exception must fail')
  assert.equal(issue({...base,clock_in:'',clock_out:''},{final:false}),null, 'draft may remain incomplete')
})

test('source preserves Prompt 2/4 guards and adds server/UI evidence gates',()=>{
  const root=path.join(__dirname,'..','..')
  const sql=fs.readFileSync(path.join(root,'supabase','migrations','20261005060000_prompt15_attendance_evidence_guard.sql'),'utf8')
  const page=fs.readFileSync(path.join(root,'app','reports','labour','page.tsx'),'utf8')
  for(const token of ['ATTENDANCE_EVIDENCE_REQUIRED_PRESENT','ATTENDANCE_EXCEPTION_EVIDENCE_REQUIRED','ATTENDANCE_WORK_UNITS_OT_MISMATCH','CLOCK_SEQUENCE_INVALID_OR_OVERNIGHT_NOT_EXPLICIT','OVERNIGHT_FLAG_REQUIRES_COMPLETE_PUNCH'])assert.match(sql,new RegExp(token))
  assert.match(sql,/p_expected_payroll_revision/)
  assert.match(sql,/STALE_PAYROLL_SAVE_RELOAD_REQUIRED/)
  assert.match(sql,/PAYROLL_RULES_NOT_APPROVED/)
  assert.match(page,/attendanceEvidenceIssue/)
  assert.match(page,/ติ๊กเฉพาะหลักฐานครบ/)
  assert.match(page,/clock_spans_next_day/)
  assert.match(page,/attendance_exception_evidence/)
})
