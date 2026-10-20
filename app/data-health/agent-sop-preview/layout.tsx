import {notFound} from 'next/navigation'
import type {ReactNode} from 'react'

// The QA interface is intentionally never served in Production.
// The separate API has its own server-side Owner gate and Production enable flag.
export default function AgentSopPreviewLayout({children}:{children:ReactNode}){
  if(process.env.VERCEL_ENV!=='preview')notFound()
  return children
}
