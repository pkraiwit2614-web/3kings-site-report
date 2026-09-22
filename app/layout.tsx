import './globals.css'
import './v33.css'
import './mobile-nav.css'
import './dashboard-control.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: '3 Kings Site Report', description: 'Daily site reporting and management dashboard' }

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>
}
