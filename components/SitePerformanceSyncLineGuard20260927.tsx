'use client'

import { useEffect } from 'react'

function hideDuplicateSiteSyncLines() {
  const section = document.getElementById('site-performance')
  if (!section) return

  section.querySelectorAll('small').forEach((node) => {
    const text = (node.textContent || '').trim()
    if (text.startsWith('ข้อมูล Sync:')) {
      const el = node as HTMLElement
      el.style.setProperty('display', 'none', 'important')
      el.setAttribute('aria-hidden', 'true')
    }
  })
}

export default function SitePerformanceSyncLineGuard20260927() {
  useEffect(() => {
    hideDuplicateSiteSyncLines()

    const observer = new MutationObserver(() => hideDuplicateSiteSyncLines())
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })

    return () => observer.disconnect()
  }, [])

  return null
}
