import type {ReactNode} from 'react'
import OwnerOnlyGate from '@/components/OwnerOnlyGate'

export default function PhotoMappingLayout({children}:{children:ReactNode}){
  return <OwnerOnlyGate>{children}</OwnerOnlyGate>
}
