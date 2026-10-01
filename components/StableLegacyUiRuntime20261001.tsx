'use client'

import {useLayoutEffect} from 'react'
import {usePathname} from 'next/navigation'
import TaskDropdownOrder from '@/components/TaskDropdownOrder'
import UiPolish20260927 from '@/components/UiPolish20260927'
import UiRequestedChanges20260927 from '@/components/UiRequestedChanges20260927'
import RequestedFixes20260927V2 from '@/components/RequestedFixes20260927V2'
import ExecutivePowerPointParity20260927 from '@/components/ExecutivePowerPointParity20260927'
import ExecutiveDownloadLabelGuard20260927 from '@/components/ExecutiveDownloadLabelGuard20260927'
import DefectFlowDashboardButton20260929 from '@/components/DefectFlowDashboardButton20260929'
import HeaderLayoutFix20260927 from '@/components/HeaderLayoutFix20260927'
import SitePerformanceSyncLineGuard20260927 from '@/components/SitePerformanceSyncLineGuard20260927'

export default function StableLegacyUiRuntime20261001(){
  const path=usePathname()
  const isPresentation=path==='/presentation'

  useLayoutEffect(()=>{
    if(isPresentation)document.body.classList.add('ui-executive-page')
    return()=>{document.body.classList.remove('ui-executive-page')}
  },[isPresentation])

  // /presentation must keep React ownership of its slide tree, controls and the
  // surrounding AppShell. The legacy helpers below reorder/create/remove DOM
  // nodes and are therefore intentionally not mounted on the presentation route.
  if(isPresentation)return null

  return <>
    <TaskDropdownOrder />
    <UiPolish20260927 />
    <UiRequestedChanges20260927 />
    <RequestedFixes20260927V2 />
    <ExecutivePowerPointParity20260927 />
    <ExecutiveDownloadLabelGuard20260927 />
    <DefectFlowDashboardButton20260929 />
    <HeaderLayoutFix20260927 />
    <SitePerformanceSyncLineGuard20260927 />
  </>
}
