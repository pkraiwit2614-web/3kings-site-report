import './print.css'
import type { ReactNode } from 'react'
import DefectCombineRoomEnhancer from '@/components/DefectCombineRoomEnhancer'

export default function DefectsLayout({ children }: { children: ReactNode }){
  return <>
    <DefectCombineRoomEnhancer />
    {children}
  </>
}
