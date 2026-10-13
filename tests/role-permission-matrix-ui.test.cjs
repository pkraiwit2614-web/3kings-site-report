const fs = require('node:fs')
const assert = require('node:assert/strict')
const ts = require('typescript')
const vm = require('node:vm')

// Verify the display matrix is derived from existing access-control functions.
// These checks do not change or grant any permissions.
const accessModule = {exports:{}}
const roleModule = {exports:{}}
const accessSrc = fs.readFileSync('lib/accessControl.ts','utf8')
vm.runInNewContext(ts.transpileModule(accessSrc,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:accessModule,exports:accessModule.exports})
const roleSrc = fs.readFileSync('lib/rolePreview.ts','utf8')
vm.runInNewContext(ts.transpileModule(roleSrc,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:roleModule,exports:roleModule.exports})
const a=accessModule.exports, labels=roleModule.exports.ROLE_PREVIEW_LABELS
const matrixSrc = fs.readFileSync('components/RolePermissionMatrix.tsx','utf8')
const usersSrc = fs.readFileSync('app/users/page.tsx','utf8')
assert.match(usersSrc,/<OwnerOnlyGate><AppShell><UsersContent/)
assert.match(usersSrc,/activeTab==='matrix'/)
assert.match(usersSrc,/<RolePermissionMatrix\/>/)
assert.match(usersSrc,/<ActivityLogPanel profiles={rows}\/>/)
assert.match(matrixSrc,/canAccessPath\(role, section.path\)/)
assert.match(matrixSrc,/MATRIX_SECTIONS\.map/)
assert.match(matrixSrc,/MATRIX_ROLES\.map/)
assert.match(matrixSrc,/readOnly: true/)
assert.match(matrixSrc,/canManage: canManageMaterialsTools/)
assert.match(matrixSrc,/canManage: canEditCalendar/)
assert.match(matrixSrc,/canManage: canEditProcurement/)
assert.match(matrixSrc,/canManage: canEditDefect/)
assert.match(matrixSrc,/canManage: canManageLabour/)
assert.match(usersSrc,/<option value="defect_contributor">Defect Viewer<\/option>/)
assert.match(usersSrc,/<option value="defect_editor">Defect Contributor<\/option>/)
assert.equal(labels.defect_contributor,'Defect Viewer')
assert.equal(labels.defect_editor,'Defect Contributor')
const roles=['owner','admin','viewer','viewer_editor','purchase','defect_contributor','defect_editor']
const rights={
  '/schedule':r=>a.canEditSchedule(r),
  '/reports':r=>a.canEditSiteOperations(r),
  '/defect-flow':r=>a.canEditDefect(r),
  '/hotel-room-status':r=>r==='owner'||r==='defect_editor',
  '/materials':r=>a.canManageMaterialsTools(r),
  '/procurement':r=>a.canEditProcurement(r),
  '/calendar':r=>a.canEditCalendar(r),
  '/reports/labour':r=>a.canManageLabour(r)
}
for(const role of roles){
  for(const [path,canManage] of Object.entries(rights)){
    const level=!a.canAccessPath(role,path)?'none':canManage(role)?'manage':'view'
    if(role==='purchase'&&path==='/reports/labour')assert.equal(level,'none')
    if(role==='purchase'&&['/materials','/procurement','/calendar'].includes(path))assert.equal(level,'manage')
    if(role==='defect_contributor'&&path==='/defect-flow')assert.equal(level,'view')
    if(role==='defect_editor'&&['/defect-flow','/hotel-room-status'].includes(path))assert.equal(level,'manage')
    if(role!=='owner'&&path==='/users')assert.equal(level,'none')
  }
}
assert.equal(a.canAccessPath('purchase','/users'),false)
assert.equal(a.canAccessPath('viewer_editor','/users'),false)
console.log('Permission Matrix UI labels and role/access regressions passed')
