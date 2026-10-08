const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm')
const m={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/accessControl.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports})
const a=m.exports
const matrix={viewer:[false,false,false,false,false],viewer_editor:[true,false,false,false,true],purchase:[false,false,false,true,false],admin:[false,true,false,false,false],defect_contributor:[false,false,false,false,false],defect_editor:[false,false,true,false,false],owner:[true,true,true,true,true]}
const fns=['canEditSchedule','canEditSiteOperations','canEditDefect','canEditProcurement','canEditCalendar']
let checks=0
for(const [role,expected] of Object.entries(matrix)){
 fns.forEach((f,i)=>{assert.equal(a[f](role),expected[i],`${role} ${f}`);checks++})
 const restricted=['defect_contributor','defect_editor'].includes(role)
 for(const path of ['/','/schedule','/calendar','/procurement','/reports','/reports/labour','/materials','/weekly','/presentation','/site-photos']){assert.equal(a.canAccessPath(role,path),!restricted,`${role} ${path}`);checks++}
 for(const path of ['/defect-flow','/defects','/defects/A101']){assert.equal(a.canAccessPath(role,path),true);checks++}
 for(const path of ['/users','/users?tab=activity','/photo-mapping','/data-health','/data-house']){assert.equal(a.canAccessPath(role,path),role==='owner');checks++}
 assert.equal(a.defaultPathForRole(role),restricted?'/defect-flow':'/');checks++
 assert.equal(a.canViewPayroll(role),!restricted);checks++
 assert.equal(a.canManageLabour(role),role==='owner'||role==='admin');checks++
}
assert.equal(a.resolveAccessRole('manager',a.OWNER_USER_ID),'owner')
assert.equal(a.canEditDefect(null),false)
console.log(`Role matrix passed: ${checks+2} allow/deny assertions`)
