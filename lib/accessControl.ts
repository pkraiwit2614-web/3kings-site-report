export const OWNER_USER_ID='bc6ee244-3472-422f-bbf9-d551987ee9a3'

export type AccessRole=
  |'owner'
  |'admin'
  |'viewer'
  |'viewer_editor'
  |'defect_contributor'
  |'defect_editor'
  |'purchase'

const OWNER_ONLY_PREFIXES=['/photo-mapping','/data-health','/data-house','/users']
const PAYROLL_RECORD_PREFIX='/reports/labour'

function cleanPath(path:string){
  const value=String(path||'/').split('?')[0].split('#')[0]||'/'
  return value.startsWith('/')?value:'/'
}

export function resolveAccessRole(profileRole:string|undefined|null,userId:string|undefined|null):AccessRole|null{
  const role=String(profileRole||'').toLowerCase()
  if(userId===OWNER_USER_ID&&role==='manager')return 'owner'
  if(role==='admin'||role==='engineer'||role==='payroll'||role==='manager')return 'admin'
  if(role==='viewer'||role==='foreman')return 'viewer'
  if(role==='viewer_editor')return 'viewer_editor'
  if(role==='defect_contributor')return 'defect_contributor'
  if(role==='defect_editor')return 'defect_editor'
  if(role==='purchase')return 'purchase'
  return null
}

export function canAccessPath(role:AccessRole,path:string){
  const value=cleanPath(path)
  if(role==='owner')return true
  if(role==='defect_contributor'){
    return value==='/defect-flow'||value==='/defects'||value.startsWith('/defects/')
  }
  if(OWNER_ONLY_PREFIXES.some(prefix=>value===prefix||value.startsWith(prefix+'/')))return false
  return ['admin','viewer','viewer_editor','defect_editor','purchase'].includes(role)
}

export function defaultPathForRole(role:AccessRole){
  return role==='defect_contributor'?'/defect-flow':'/'
}

export function canEditSiteOperations(role:AccessRole|null){
  return role==='owner'||role==='admin'
}

export function canEditCalendar(role:AccessRole|null){
  return role==='owner'||role==='viewer_editor'
}

export function canEditSchedule(role:AccessRole|null){
  return role==='owner'||role==='viewer_editor'
}

export function canEditDefect(role:AccessRole|null){
  return role==='owner'||role==='viewer_editor'||role==='defect_contributor'||role==='defect_editor'
}

export function canEditProcurement(role:AccessRole|null){
  return role==='owner'||role==='purchase'
}

export function canManageLabour(role:AccessRole|null){
  return role==='owner'||role==='admin'
}

export function canViewPayroll(role:AccessRole|null){
  return role==='owner'||role==='admin'
}

export function isOwnerOnlyPath(path:string){
  const value=cleanPath(path)
  return OWNER_ONLY_PREFIXES.some(prefix=>value===prefix||value.startsWith(prefix+'/'))
}

export function isPayrollRecordPath(path:string){
  return cleanPath(path).startsWith(PAYROLL_RECORD_PREFIX)
}
