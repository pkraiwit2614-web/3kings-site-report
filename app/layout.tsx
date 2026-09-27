import './globals.css'
import './v33.css'
import './mobile-nav.css'
import './dashboard-control.css'
import './site-performance-compact.css'
import './v36.css'
import './condo-dashboard-fix.css'
import './executive-presentation-status.css'
import './executive-fullscreen.css'
import './materials-status-colors.css'
import './report-print.css'
import './sidebar-scroll.css'
import './sidebar-compact.css'
import TaskDropdownOrder from '@/components/TaskDropdownOrder'
import UiPolish20260927 from '@/components/UiPolish20260927'
import UiRequestedChanges20260927 from '@/components/UiRequestedChanges20260927'
import RequestedFixes20260927V2 from '@/components/RequestedFixes20260927V2'
import ExecutivePowerPointParity20260927 from '@/components/ExecutivePowerPointParity20260927'
import HeaderActionPattern20260927 from '@/components/HeaderActionPattern20260927'
import DefectDashboardDeepLinkGuard20260927 from '@/components/DefectDashboardDeepLinkGuard20260927'
import ExecutiveDownloadLabelGuard20260927 from '@/components/ExecutiveDownloadLabelGuard20260927'
import HeaderLayoutFix20260927 from '@/components/HeaderLayoutFix20260927'
import { Noto_Sans_Thai } from 'next/font/google'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  display: 'swap',
})

export const metadata: Metadata = { title: '3 Kings Site Report', description: 'Daily site reporting and management dashboard' }

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="th"><body className={notoSansThai.className}><TaskDropdownOrder /><UiPolish20260927 /><UiRequestedChanges20260927 /><RequestedFixes20260927V2 /><ExecutivePowerPointParity20260927 /><HeaderActionPattern20260927 /><DefectDashboardDeepLinkGuard20260927 /><ExecutiveDownloadLabelGuard20260927 /><HeaderLayoutFix20260927 />{children}</body></html>
}
