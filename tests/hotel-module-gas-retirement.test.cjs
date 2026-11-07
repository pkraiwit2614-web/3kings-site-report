const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const source=fs.readFileSync('docs/apps-script/RetireHotelOOOWorkPlanTriggers_20261107.gs','utf8')
const trigger=(name,id)=>({
  getHandlerFunction:()=>name,
  getUniqueId:()=>id
})

test('dedicated hotel handler retirement changes only exact two trigger names',()=>{
  assert.doesNotThrow(()=>new vm.Script(source))
  const unrelated=[
    trigger('syncShiftHourly20261013','shift-hourly'),
    trigger('syncShiftPhoto0800','shift-photo'),
    trigger('sync3Kings','master'),
    trigger('smartSyncDefectsV13_15m','defects'),
    trigger('dailySiteReportPublisher','daily-report'),
    trigger('workOrderAutoSync','workorder'),
    trigger('googleCalendarAutoSync','calendar'),
  ]
  let current=[
    ...unrelated,
    trigger('hotelOOOExecuteWriteback','hotel1'),
    trigger('hotelWorkPlanSyncNow','hotel2'),
    trigger('hotelWorkPlanSyncNow','hotel3'),
  ]
  const context={ScriptApp:{
    getProjectTriggers:()=>current.slice(),
    getScriptId:()=> 'existing-3-kings-script',
    deleteTrigger:t=>{current=current.filter(record=>record!==t)}
  }}
  vm.createContext(context)
  vm.runInContext(source,context)
  const before=context.hotelModuleRetirementStatus20261107()
  assert.equal(before.retired.hotelOOOExecuteWriteback,1)
  assert.equal(before.retired.hotelWorkPlanSyncNow,2)
  assert.equal(before.unrelatedTriggerCount,unrelated.length)
  const result=context.hotelModuleRetirementApply20261107()
  assert.equal(result.ok,true)
  assert.equal(result.remainingRetiredTriggers,0)
  assert.equal(result.preservedUnrelatedTriggers,unrelated.length)
  assert.deepEqual(current.map(x=>x.getUniqueId()),unrelated.map(x=>x.getUniqueId()))
  const again=context.hotelModuleRetirementApply20261107()
  assert.equal(again.ok,true)
  assert.equal(again.deletedHandlerCounts.every(x=>x.count===0),true)
})

test('source cannot touch master syncs or database',()=>{
  assert.doesNotMatch(source,/UrlFetchApp\.fetch|DriveApp\.|SpreadsheetApp\./i)
  assert.match(source,/getUniqueId/)
  assert.match(source,/UNRELATED_TRIGGER_SET_CHANGED_STOP_AND_INVESTIGATE/)
})