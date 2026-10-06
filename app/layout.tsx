import './globals.css'
import './i18n.css'
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
import './compact-filter.css'
import './wallpaper-taskbar-safe.css'
import StableLegacyUiRuntime20261001 from '@/components/StableLegacyUiRuntime20261001'
import HeaderActionPattern20260927 from '@/components/HeaderActionPattern20260927'
import DefectDashboardDeepLinkGuard20260927 from '@/components/DefectDashboardDeepLinkGuard20260927'
import RolePermissionGuard20260927 from '@/components/RolePermissionGuard20260927'
import AccessBoundary from '@/components/AccessBoundary'
import I18nProvider from '@/components/I18nProvider'
import CompactFilterStandard20260929 from '@/components/CompactFilterStandard20260929'
import ProgressSourceAccuracy20260930 from '@/components/ProgressSourceAccuracy20260930'
import { Noto_Sans_Thai } from 'next/font/google'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  display: 'swap',
})

export const metadata: Metadata = { title: '3 Kings Site Report', description: 'Daily site reporting and management dashboard' }

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="th"><body className={notoSansThai.className}><I18nProvider><StableLegacyUiRuntime20261001 /><HeaderActionPattern20260927 /><DefectDashboardDeepLinkGuard20260927 /><RolePermissionGuard20260927 /><CompactFilterStandard20260929 /><ProgressSourceAccuracy20260930 /><AccessBoundary>{children}</AccessBoundary></I18nProvider></body></html>
}
