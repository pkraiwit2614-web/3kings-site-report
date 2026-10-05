import { getSupabase } from '@/lib/supabase'

export type ActivityEventType =
  | 'login'
  | 'logout'
  | 'app_open'
  | 'page_view'
  | 'click'
  | 'submit'
  | 'control_change'

type ActivityInput = {
  userId: string
  eventType: ActivityEventType
  path?: string | null
  action?: string | null
  target?: string | null
  metadata?: Record<string, unknown>
}

const SESSION_KEY = '3kings:activity-client-session'

function cleanText(value: unknown, max = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

export function cleanActivityPath(value: unknown) {
  const raw = cleanText(value, 500)
  if (!raw) return null
  try {
    if (typeof window !== 'undefined') {
      const parsed = new URL(raw, window.location.origin)
      return parsed.pathname.slice(0, 500)
    }
  } catch {}
  return raw.split('?')[0].split('#')[0].slice(0, 500)
}

export function getActivitySessionId() {
  if (typeof window === 'undefined') return ''
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const next = crypto.randomUUID()
    window.sessionStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return crypto.randomUUID()
  }
}

export function getActivityLabel(element: Element | null) {
  if (!element) return null
  const aria = element.getAttribute('aria-label')
  const title = element.getAttribute('title')
  const text = element.textContent
  return cleanText(aria || title || text, 160)
}

export async function logActivity(input: ActivityInput) {
  if (!input.userId || typeof window === 'undefined') return false

  const row = {
    user_id: input.userId,
    client_session_id: getActivitySessionId(),
    event_type: input.eventType,
    path: cleanActivityPath(input.path ?? window.location.pathname),
    action: cleanText(input.action, 200),
    target: cleanText(input.target, 120),
    metadata: input.metadata || {},
    user_agent: cleanText(window.navigator.userAgent, 500),
  }

  try {
    const { error } = await getSupabase().from('activity_logs').insert(row)
    return !error
  } catch {
    return false
  }
}
