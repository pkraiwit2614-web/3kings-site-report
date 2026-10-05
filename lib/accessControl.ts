export const OWNER_USER_ID='bc6ee244-3472-422f-bbf9-d551987ee9a3'

export type AccessRole='owner'|'admin'|'viewer'|'defect_contributor'

const OWNER_ONLY_PREFIXES=['/photo-mapping','/data-health','/data-house','/users']
const REPORT_WRITE_PATHS=[
  /^\/reports\/quick\/?$/,
  /^\/reports\/new\/?$/,
  /^\/reports\/[^/]+\/edit\/?$/,
]

function cleanPath(path:string){
  const value=String(path||'/').split('?')[0].split('#')[0]||'/'
  return value.startsWith('/')?value:'/'
}

export function resolveAccessRole(profileRole:string|undefined|null,userId:string|undefined|null):AccessRole|null{
  const role=String(profileRole||'').toLowerCase()
  if(userId===OWNER_USER_ID&&role==='manager')return 'owner'
  if(role==='admin'||role==='manager'||role==='engineer'||role==='payroll')return 'admin'
  if(role==='viewer'||role==='foreman')return 'viewer'
  if(role==='defect_contributor')return 'defect_contributor'
  return null
}

export function canAccessPath(role:AccessRole,path:string){
  const value=cleanPath(path)
  if(role==='owner')return true
  if(role==='defect_contributor'){
    return value==='/defect-flow'||value==='/defects'||value.startsWith('/defects/')
  }
  if(OWNER_ONLY_PREFIXES.some(prefix=>value===prefix||value.startsWith(prefix+'/')))return false
  if(role==='viewer'&&REPORT_WRITE_PATHS.some(rx=>rx.test(value)))return false
  return role==='admin'||role==='viewer'
}

export function defaultPathForRole(role:AccessRole){
  return role==='defect_contributor'?'/defect-flow':'/'
}

export function canManageLabour(role:AccessRole|null){
  return role==='owner'||role==='admin'
}

export function canViewPayroll(role:AccessRole|null){
  return role==='owner'||role==='admin'
}
