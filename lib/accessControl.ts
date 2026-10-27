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

export function canAccessPath(role:AccessRole,path:string,snapshot?:PermissionSnapshot|null){
  if(cleanPath(path)==='/no-access')return true
  if(cleanPath(path)==='/work-order')return canAccessWorkOrder(role,snapshot)
  const module=moduleForPath(path)
  if(module==='contact_book'){
    const source=snapshot===undefined?(typeof window!=='undefined'?browserPermissions:null):snapshot
    return Boolean(source?.rows.some(x=>x.role===role&&x.module==='contact_book'&&x.level!=='none'))
  }
  if(module)return permissionDecision(role,module,'view',legacyCanAccessPath(role,path),snapshot)
  return legacyCanAccessPath(role,path)
}

function legacyCanAccessPath(role:AccessRole,path:string){
  const value=cleanPath(path)
  if(role==='owner')return true
  // Shared Viewer identities must not receive the password-change route.
  if(value==='/account'||value==='/reset-password')return canChangeOwnPassword(role)
  if(value===PAYROLL_RECORD_PREFIX||value.startsWith(PAYROLL_RECORD_PREFIX+'/'))return role==='admin'
  if(role==='defect_contributor'||role==='defect_editor'){
    return value==='/defect-flow'||value==='/defects'||value.startsWith('/defects/')||value==='/hotel-room-status'||value==='/hotel-work-plan'
  }
  if(OWNER_ONLY_PREFIXES.some(prefix=>value===prefix||value.startsWith(prefix+'/')))return false
  return ['admin','viewer','viewer_editor','defect_editor','purchase'].includes(role)
}

export function defaultPathForRole(role:AccessRole,snapshot?:PermissionSnapshot|null){
  const paths=role==='defect_contributor'||role==='defect_editor'?['/defect-flow','/hotel-room-status','/']:['/','/defect-flow','/hotel-room-status']
  return [...paths,'/hotel-work-plan','/schedule','/reports','/materials','/procurement','/calendar','/reports/labour','/presentation'].find(p=>canAccessPath(role,p,snapshot))||'/no-access'
}

export function canEditSiteOperations(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return permissionDecision(role,'reports','manage',role==='owner'||role==='admin',snapshot)
}

export function canEditCalendar(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return permissionDecision(role,'calendar','manage',role==='owner'||role==='viewer_editor'||role==='purchase',snapshot)
}

export function canEditSchedule(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return permissionDecision(role,'schedule','manage',role==='owner'||role==='viewer_editor',snapshot)
}

// Internal 3 Kings dispatch only; hotel Defect roles remain unchanged.
export function canAccessWorkOrder(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return Boolean(role&&['owner','admin','viewer_editor'].includes(role)&&permissionDecision(role,'defect','view',true,snapshot))
}

export function canEditDefect(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return permissionDecision(role,'defect','manage',role==='owner'||role==='defect_editor'||role==='viewer_editor',snapshot)
}

export function canEditProcurement(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return permissionDecision(role,'procurement','manage',role==='owner'||role==='purchase',snapshot)
}

export function canManageMaterialsTools(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return permissionDecision(role,'materials','manage',role==='owner'||role==='purchase',snapshot)
}

export function canManageLabour(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return permissionDecision(role,'payroll','manage',role==='owner'||role==='admin',snapshot)
}

export function canViewPayroll(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
  return permissionDecision(role,'payroll','view',role!==null&&['owner','admin'].includes(role),snapshot)
}

export function isOwnerOnlyPath(path:string){
  const value=cleanPath(path)
  return OWNER_ONLY_PREFIXES.some(prefix=>value===prefix||value.startsWith(prefix+'/'))
}

export function isPayrollRecordPath(path:string){
  return cleanPath(path).startsWith(PAYROLL_RECORD_PREFIX)
}

export type PermissionLevel = 'none'|'view'|'manage'
export type PermissionRow = {role:AccessRole; module:string; level:PermissionLevel; default_level:PermissionLevel; locked:boolean}
export type PermissionSnapshot = {revision:number; rows:PermissionRow[]}
let browserPermissions:PermissionSnapshot|null=null
export function setBrowserPermissions(value:PermissionSnapshot){
  if(typeof window!=='undefined')browserPermissions=value
}
export function moduleForPath(path:string):string|null{
  const p=cleanPath(path)
  if(p==='/reports/labour'||p.startsWith('/reports/labour/'))return 'payroll'
  if(p==='/users')return path.includes('tab=activity')?'activity':'users'
  if(p==='/defects'||p.startsWith('/defects/')||p==='/defect-flow'||p==='/work-order')return 'defect'
  if(p==='/hotel-room-status')return 'hotel'
  if(p==='/hotel-work-plan')return 'workplan'
  if(p==='/')return 'dashboard'
  if(p==='/presentation'||p.startsWith('/presentation/')||p==='/site-photos')return 'presentation'
  if(p==='/weekly'||p.startsWith('/projects/'))return 'reports'
  if(p==='/wallpaper')return 'dashboard'
  if(p.startsWith('/schedule'))return 'schedule'
  if(p==='/reports'||p.startsWith('/reports/'))return 'reports'
  if(p==='/contact-book')return 'contact_book'
  if(p==='/materials')return 'materials'
  if(p==='/procurement')return 'procurement'
  if(p==='/calendar')return 'calendar'
  if(['/photo-mapping','/data-health','/data-house'].some(x=>p===x||p.startsWith(x+'/')))return 'reconciliation'
  return null
}
export function permissionDecision(role:AccessRole|null,module:string,action:'view'|'manage',fallback:boolean,snapshot?:PermissionSnapshot|null){
  if(!role)return false
  const source=snapshot===undefined?(typeof window!=='undefined'?browserPermissions:null):snapshot
  const cell=source?.rows.find(x=>x.role===role&&x.module===module)
  if(!cell)return fallback
  return action==='manage'?cell.level==='manage':cell.level!=='none'
}
export function canEditHotel(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
 return permissionDecision(role,'hotel','manage',role==='owner'||role==='defect_editor',snapshot)
}

export function canEditWorkPlan(role:AccessRole|null,snapshot?:PermissionSnapshot|null){
 return permissionDecision(role,'workplan','manage',role==='owner'||role==='defect_editor',snapshot)
}
export function canChangeOwnPassword(role:AccessRole|null){
  return role!==null&&['owner','admin','viewer_editor','defect_editor','purchase'].includes(role)
}
