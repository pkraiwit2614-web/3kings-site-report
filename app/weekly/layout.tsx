import type {ReactNode} from 'react'
import WeeklyTruthfulFreshness from '@/components/WeeklyTruthfulFreshness'

export default function WeeklyLayout({children}:{children:ReactNode}){
  return <>{children}<WeeklyTruthfulFreshness/></>
}
