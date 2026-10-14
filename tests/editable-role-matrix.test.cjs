const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const moduleFixture={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/accessControl.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleFixture,exports:moduleFixture.exports})
const a=moduleFixture.exports,rows=require('./role-matrix-defaults.json')
const paths={dashboard:'/',presentation:'/presentation',schedule:'/schedule',reports:'/reports',defect:'/defect-flow',hotel:'/hotel-room-status',workplan:'/hotel-work-plan',materials:'/materials',procurement:'/procurement',calendar:'/calendar',payroll:'/reports/labour',users:'/users',activity:'/users?tab=activity',reconciliation:'/data-health'}
const edits={schedule:'canEditSchedule',reports:'canEditSiteOperations',defect:'canEditDefect',hotel:'canEditHotel',workplan:'canEditWorkPlan',materials:'canManageMaterialsTools',procurement:'canEditProcurement',calendar:'canEditCalendar',payroll:'canManageLabour'}
for(const cell of rows){
 const baseline={revision:1,rows}
 assert.equal(a.canAccessPath(cell.role,paths[cell.module],baseline),a.canAccessPath(cell.role,paths[cell.module],null),`baseline ${cell.role}/${cell.module}`)
 if(edits[cell.module])assert.equal(a[edits[cell.module]](cell.role,baseline),a[edits[cell.module]](cell.role,null))
 if(cell.locked)continue
 for(const level of ['none','view','manage']){
  const snapshot={revision:2,rows:rows.map(r=>r===cell?{...r,level}:r)}
  assert.equal(a.canAccessPath(cell.role,paths[cell.module],snapshot),level!=='none')
  if(edits[cell.module])assert.equal(a[edits[cell.module]](cell.role,snapshot),level==='manage')
  for(const other of rows.filter(r=>r.role===cell.role&&r.module!==cell.module))assert.equal(a.canAccessPath(other.role,paths[other.module],snapshot),other.level!=='none','other modules unchanged')
 }
}
const none={revision:3,rows:rows.map(r=>r.role==='viewer'?{...r,level:'none'}:r)}
assert.equal(a.defaultPathForRole('viewer',none),'/no-access')
assert.equal(a.canAccessPath('viewer','/no-access',none),true)
assert.equal(a.canAccessPath('viewer','/presentation/condo-defect',none),false)
assert.equal(a.canAccessPath('viewer','/reports/labour/record?x=1',none),false)
assert.equal(a.canEditCalendar(null,none),false)
console.log('Editable matrix: all 98 baseline cells, dynamic grant/revoke, module isolation, nested routes and no-access fallback passed')
