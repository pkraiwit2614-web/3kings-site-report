'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Browser-tab text is presentation only. Never alter navigation, URL, or page state.
const PAGES: Record<string, string> = {
  '/': 'Dashboard',
  '/login': 'Login',
  '/no-access': 'Access Denied',
  '/account': 'My Account',
  '/reset-password': 'Reset Password',
  '/presentation': 'Executive',
  '/schedule': 'Schedule',
  '/materials': 'Materials',
  '/procurement': 'Procurement',
  '/defect-flow': 'Defect Flow',
  '/defects': 'Defect Report',
  '/work-order': 'Work Order',
  '/hotel-work-plan': 'Work Plan',
  '/hotel-room-status': 'Hotel OOO/OOS',
  '/reports': 'Site Operations',
  '/reports/quick': 'Quick Report',
  '/reports/labour': 'Labour Cost',
  '/site-photos': 'Site Photos',
  '/weekly': 'Weekly Report',
  '/calendar': 'Work Calendar',
  '/contact-book': 'Contact Book',
  '/users': 'User & Access',
  '/photo-mapping': 'Photo Mapping',
  '/data-health': 'Data Health',
  '/data-house': 'Data House',
  '/wallpaper': 'Wallpaper',
}

const FLOW_LABELS: Record<string, string> = {
  sales: 'Flow รวม',
  hotel: 'Flow โรงแรม',
  combine: 'Flow Combine=1',
  'hotel-combine': 'Flow โรงแรม Combine=1',
}

function subtabForPath(path: string): string | null {
  if (path === '/defect-flow') {
    const selected = document.querySelector<HTMLButtonElement>('.flow-view-tabs .flow-view-tab[aria-pressed="true"]')
    const pressed = Array.from(document.querySelectorAll<HTMLButtonElement>('.flow-view-tabs .flow-view-tab'))
      .indexOf(selected as HTMLButtonElement)
    const keys = ['sales', 'hotel', 'combine', 'hotel-combine']
    if (pressed >= 0) return FLOW_LABELS[keys[pressed]]
    const query = new URLSearchParams(window.location.search).get('view') || 'sales'
    return FLOW_LABELS[query] || FLOW_LABELS.sales
  }

  if (path === '/defects') return 'Condo'
  if (path === '/defects/common') return 'Common'

  if (path === '/hotel-work-plan') {
    const selected = document.querySelector<HTMLElement>('.work-days .work-day.current strong')
    return selected?.textContent?.trim() || 'All'
  }

  if (path === '/work-order') {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.wo-kpis .wo-kpi'))
    const selected = buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true')
    return ['All', 'Building A', 'Building B', 'Overdue'][selected] || 'All'
  }

  if (path === '/users') {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.user-access-tabs button'))
    const selected = buttons.findIndex(button => button.classList.contains('active'))
    return ['Users', 'Permission Matrix', 'Activity Log'][selected] || 'Users'
  }

  if (path === '/calendar') {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.gcal-view-tabs button'))
    const selected = buttons.findIndex(button => button.classList.contains('active'))
    return ['Month', 'Week', 'Agenda'][selected] || null
  }

  return null
}

export function browserTitleForPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  let page = PAGES[path]

  if (!page) {
    if (path.startsWith('/projects/')) page = 'Project Details'
    else if (path.startsWith('/defects/')) page = 'Defect Report'
    else if (path.startsWith('/reports/labour/')) page = 'Labour Cost'
    else if (path.startsWith('/reports/')) page = 'Site Operations'
    else if (path.startsWith('/presentation/')) page = 'Executive'
    else page = 'Site Report'
  }

  const subtab = subtabForPath(path)
  // Show the current page first so it remains identifiable on narrow browser tabs.
  return `${page}${subtab ? ' - ' + subtab : ''} | 3 Kings Site Report`
}

export default function BrowserTabTitleSubtabs20261028() {
  const pathname = usePathname()

  useEffect(() => {
    let frame: number | null = null
    const syncTitle = () => {
      const title = browserTitleForPath(pathname || '/')
      if (document.title !== title) document.title = title
    }
    const scheduleSync = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        syncTitle()
      })
    }

    // Next.js can write streaming route metadata after hydration or navigation.
    // The head observer keeps only the tab title consistent with the visible UI.
    const headObserver = new MutationObserver(syncTitle)
    headObserver.observe(document.head, { childList: true, subtree: true, characterData: true })

    // Covers state-only tabs without URL changes (Flow, Day, Work Order, Users, Calendar).
    // Coalesce React DOM mutations into one read per animation frame.
    const bodyObserver = new MutationObserver(scheduleSync)
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-pressed', 'aria-selected', 'aria-current'],
    })

    window.addEventListener('popstate', scheduleSync)
    window.addEventListener('pageshow', scheduleSync)
    window.addEventListener('focus', scheduleSync)
    syncTitle()
    return () => {
      headObserver.disconnect()
      bodyObserver.disconnect()
      window.removeEventListener('popstate', scheduleSync)
      window.removeEventListener('pageshow', scheduleSync)
      window.removeEventListener('focus', scheduleSync)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [pathname])

  return null
}
