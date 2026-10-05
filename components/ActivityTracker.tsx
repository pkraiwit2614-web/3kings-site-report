'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import {
  cleanActivityPath,
  getActivityLabel,
  getActivitySessionId,
  logActivity,
} from '@/lib/activityLog'

function elementFromTarget(target: EventTarget | null) {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

function targetName(element: Element) {
  const id = element.getAttribute('id')
  const name = element.getAttribute('name')
  return [element.tagName.toLowerCase(), id ? `#${id}` : '', name ? `[name="${name}"]` : ''].join('').slice(0, 120)
}

export default function ActivityTracker({ userId }: { userId: string }) {
  const path = usePathname()
  const lastPage = useRef('')

  useEffect(() => {
    if (!userId) return
    const currentPath = cleanActivityPath(path || window.location.pathname) || '/'
    if (lastPage.current === currentPath) return
    lastPage.current = currentPath
    void logActivity({ userId, eventType: 'page_view', path: currentPath })
  }, [path, userId])

  useEffect(() => {
    if (!userId) return

    const sessionId = getActivitySessionId()
    const openMarker = `3kings:activity-open:${sessionId}`
    try {
      if (!window.sessionStorage.getItem(openMarker)) {
        window.sessionStorage.setItem(openMarker, '1')
        void logActivity({ userId, eventType: 'app_open', path: window.location.pathname })
      }
    } catch {
      void logActivity({ userId, eventType: 'app_open', path: window.location.pathname })
    }

    const onClick = (event: MouseEvent) => {
      const origin = elementFromTarget(event.target)
      const control = origin?.closest('button,a,[role="button"],input[type="button"],input[type="submit"]')
      if (!control) return

      const href = control instanceof HTMLAnchorElement ? cleanActivityPath(control.href) : null
      void logActivity({
        userId,
        eventType: 'click',
        path: window.location.pathname,
        action: getActivityLabel(control) || 'click',
        target: targetName(control),
        metadata: href ? { href } : {},
      })
    }

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null
      if (!form) return
      void logActivity({
        userId,
        eventType: 'submit',
        path: window.location.pathname,
        action: getActivityLabel(form) || form.getAttribute('name') || form.getAttribute('id') || 'form_submit',
        target: targetName(form),
      })
    }

    const onChange = (event: Event) => {
      const element = elementFromTarget(event.target)
      if (!element) return
      const control = element.closest('select,input[type="checkbox"],input[type="radio"]')
      if (!control) return
      const controlType = control instanceof HTMLSelectElement ? 'select' : control.getAttribute('type') || 'input'
      void logActivity({
        userId,
        eventType: 'control_change',
        path: window.location.pathname,
        action: getActivityLabel(control) || control.getAttribute('name') || control.getAttribute('id') || controlType,
        target: targetName(control),
        metadata: { control_type: controlType },
      })
    }

    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('change', onChange, true)

    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
      document.removeEventListener('change', onChange, true)
    }
  }, [userId])

  return null
}
