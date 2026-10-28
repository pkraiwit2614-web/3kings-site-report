'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'

const BASE_TITLE = '3 Kings Site Report'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/login': 'Login',
  '/no-access': 'Access Denied',
  '/account': 'My Account',
  '/reset-password': 'Reset Password',
  '/presentation': 'Executive Presentation',
  '/schedule': 'Schedule',
  '/materials': 'Materials',
  '/procurement': 'Procurement',
  '/defect-flow': 'Defect Flow',
  '/defects': 'Defect Report',
  '/work-order': 'Work Order',
  '/hotel-work-plan': 'Work Plan',
  '/hotel-room-status': 'Hotel Room Status',
  '/reports': 'Site Operations',
  '/reports/quick': 'Quick Report',
  '/reports/labour': 'Labour Cost',
  '/site-photos': 'Site Photos',
  '/weekly': 'Weekly Report',
  '/calendar': 'Work Calendar',
  '/contact-book': 'Contact Book',
  '/users': 'System & Access',
  '/photo-mapping': 'Photo Mapping',
  '/data-health': 'Data Health',
  '/data-house': 'Data House',
  '/wallpaper': 'Wallpaper',
}

export function browserTabTitleForPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  let label = PAGE_TITLES[path]

  if (!label) {
    if (path.startsWith('/projects/')) label = 'Project Details'
    else if (path.startsWith('/defects/')) label = 'Defect Report'
    else if (path.startsWith('/reports/labour/')) label = 'Labour Cost'
    else if (path.startsWith('/reports/')) label = 'Site Operations'
    else if (path.startsWith('/presentation/')) label = 'Executive Presentation'
    else {
      // Fall back to the section name without exposing IDs or query parameters.
      const section = path.split('/').filter(Boolean)[0] || 'Dashboard'
      label = section.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    }
  }

  return `${BASE_TITLE} - ${label}`
}

export default function BrowserTabTitle20261028() {
  const pathname = usePathname()

  useLayoutEffect(() => {
    document.title = browserTabTitleForPath(pathname || '/')
  }, [pathname])

  return null
}
