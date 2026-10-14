'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import {loadPermissions,PERMISSION_EVENT} from '@/lib/permissionClient'
import type {AccessRole} from '@/lib/accessControl'
import {
  ROLE_PREVIEW_EVENT,
  canUseRolePreview,
  clearRolePreview,
  effectivePresentationRole,
  previewTargetsFor,
  readRolePreview,
  setRolePreview,
} from '@/lib/rolePreview'

export default function useRolePreview(actualRole:AccessRole|null){
  const [previewRole,setPreviewRoleState]=useState<AccessRole|null>(null)
  const [ready,setReady]=useState(false)
  const [permissionsReady,setPermissionsReady]=useState(false)
  const [permissionRevision,setPermissionRevision]=useState(0)
  useEffect(()=>{
    if(!actualRole){setPermissionsReady(false);return}
    let alive=true
    const sync=()=>{void loadPermissions().then(()=>{if(alive){setPermissionsReady(true);setPermissionRevision(v=>v+1)}}).catch(()=>{if(alive)setPermissionsReady(false)})}
    const changed=()=>setPermissionRevision(v=>v+1)
    sync()
    window.addEventListener(PERMISSION_EVENT,changed)
    window.addEventListener('focus',sync)
    const timer=window.setInterval(sync,30000)
    return()=>{alive=false;window.clearInterval(timer);window.removeEventListener(PERMISSION_EVENT,changed);window.removeEventListener('focus',sync)}
  },[actualRole])

  useEffect(()=>{
    if(!actualRole){
      setPreviewRoleState(null)
      setReady(false)
      return
    }
    if(!canUseRolePreview(actualRole)){
      clearRolePreview()
      setPreviewRoleState(null)
      setReady(true)
      return
    }

    const sync=()=>{
      setPreviewRoleState(readRolePreview(actualRole))
      setReady(true)
    }
    sync()
    window.addEventListener(ROLE_PREVIEW_EVENT,sync)
    return()=>window.removeEventListener(ROLE_PREVIEW_EVENT,sync)
  },[actualRole])

  const targets=useMemo(()=>previewTargetsFor(actualRole),[actualRole])
  const presentationRole=useMemo(
    ()=>effectivePresentationRole(actualRole,previewRole),
    [actualRole,previewRole]
  )

  const startPreview=useCallback((target:AccessRole)=>{
    if(!actualRole)return false
    return setRolePreview(actualRole,target)
  },[actualRole])

  const exitPreview=useCallback(()=>clearRolePreview(),[])

  return {previewRole,presentationRole,targets,ready:ready&&permissionsReady,permissionRevision,startPreview,exitPreview}
}
