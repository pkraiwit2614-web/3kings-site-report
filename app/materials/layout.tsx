import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '3 Kings Site Report - Materials' }

export default function MaterialsLayout({ children }: { children: ReactNode }) {
  return children
}
