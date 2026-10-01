'use client'

import {useLayoutEffect} from 'react'
import {usePathname} from 'next/navigation'
import UiPolish20260927 from '@/components/UiPolish20260927'
import UiRequestedChanges20260927 from '@/components/UiRequestedChanges20260927'
import ExecutivePowerPointParity20260927 from '@/components/ExecutivePowerPointParity20260927'
import ExecutiveDownloadLabelGuard20260927 from '@/components/ExecutiveDownloadLabelGuard20260927'

export default function StableLegacyUiRuntime20261001(){
  const path=usePathname()
  const isPresentation=path==='/presentation'

  useLayoutEffect(()=>{
    if(isPresentation)document.body.classList.add('ui-executive-page')
    return()=>{document.body.classList.remove('ui-executive-page')}
  },[isPresentation])

  // The legacy presentation polishers move/create/remove nodes inside React-owned
  // slide controls and metric panels. Keep them on the routes they were written
  // for, but do not mount them on /presentation where React owns the slide tree.
  if(isPresentation)return null

  return <>
    <UiPolish20260927 />
    <UiRequestedChanges20260927 />
    <ExecutivePowerPointParity20260927 />
    <ExecutiveDownloadLabelGuard20260927 />
  </>
}
