'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
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

  return {previewRole,presentationRole,targets,ready,startPreview,exitPreview}
}
