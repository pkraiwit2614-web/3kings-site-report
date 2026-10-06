import type {AccessRole} from '@/lib/accessControl'

export const ROLE_PREVIEW_STORAGE_KEY='3kings:role-preview'
export const ROLE_PREVIEW_EVENT='3kings:role-preview-change'

export const ROLE_PREVIEW_LABELS:Record<AccessRole,string>={
  owner:'Owner',
  admin:'Admin',
  viewer:'Viewer',
  viewer_editor:'Viewer & Editor',
  defect_contributor:'Defect Contributor',
  defect_editor:'Defect Contributor Editor',
  purchase:'Purchase',
}

export function canUseRolePreview(actualRole:AccessRole|null){
  return actualRole==='owner'||actualRole==='admin'
}

export function previewTargetsFor(actualRole:AccessRole|null):AccessRole[]{
  if(actualRole==='owner')return ['admin','viewer','viewer_editor','defect_contributor','defect_editor','purchase']
  if(actualRole==='admin')return ['viewer','defect_contributor']
  return []
}

export function isAllowedRolePreview(actualRole:AccessRole|null,target:unknown):target is AccessRole{
  return typeof target==='string'&&previewTargetsFor(actualRole).includes(target as AccessRole)
}

export function effectivePresentationRole(actualRole:AccessRole|null,previewRole:AccessRole|null){
  return previewRole&&isAllowedRolePreview(actualRole,previewRole)?previewRole:actualRole
}

export function readRolePreview(actualRole:AccessRole|null):AccessRole|null{
  if(typeof window==='undefined'||!canUseRolePreview(actualRole))return null
  const stored=window.sessionStorage.getItem(ROLE_PREVIEW_STORAGE_KEY)
  return isAllowedRolePreview(actualRole,stored)?stored:null
}

function emitRolePreviewChange(role:AccessRole|null){
  if(typeof window==='undefined')return
  window.dispatchEvent(new CustomEvent(ROLE_PREVIEW_EVENT,{detail:{role}}))
}

export function setRolePreview(actualRole:AccessRole|null,target:AccessRole){
  if(typeof window==='undefined'||!isAllowedRolePreview(actualRole,target))return false
  window.sessionStorage.setItem(ROLE_PREVIEW_STORAGE_KEY,target)
  emitRolePreviewChange(target)
  return true
}

export function clearRolePreview(){
  if(typeof window==='undefined')return
  window.sessionStorage.removeItem(ROLE_PREVIEW_STORAGE_KEY)
  emitRolePreviewChange(null)
}
