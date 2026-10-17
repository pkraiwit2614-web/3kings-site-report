import type { PreparedAutoPilotAlert } from './lineAutoPilotNotifications'

/** A durable database queue must implement this contract before activation.
 * No in-memory locks: serverless functions may run concurrently.
 */
export type DeliveryClaim =
  | { status: 'new'; retryKey: string }
  | { status: 'already_sent' }
  | { status: 'in_flight' }
  | { status: 'blocked' }

export interface LineDeliveryLedger {
  claimOnce(eventKey: string): Promise<DeliveryClaim>
  markDelivered(eventKey: string, retryKey: string): Promise<void>
  markUncertain(eventKey: string, retryKey: string, statusCode: number | null): Promise<void>
}

export type LineDispatchResult =
  | { status: 'disabled' | 'missing_token' | 'duplicate' | 'in_flight' | 'blocked' }
  | { status: 'sent' }
  | { status: 'uncertain'; httpStatus: number | null }

export async function dispatchPreparedLineAlert(
  alert: PreparedAutoPilotAlert,
  ledger: LineDeliveryLedger,
  settings: { enabled: boolean; accessToken?: string; transport?: typeof fetch }
): Promise<LineDispatchResult> {
  // Disabled by default; requires a durable queue, credentials, reviewed SOP
  // and approved LINE OA destinations. Do not call directly from a public API.
  if (!settings.enabled) return { status: 'disabled' }
  const token = settings.accessToken
  if (!token || token.length < 20) return { status: 'missing_token' }
  if (!/^[a-f0-9]{64}$/i.test(alert.eventKey) ||
      !/^[UC][0-9a-f]{32}$/i.test(alert.to) || !alert.text ||
      alert.text.length > 4800) return { status: 'blocked' }
  if (alert.kind === 'sync_failure' && !alert.to.startsWith('U')) return { status: 'blocked' }
  if (alert.kind !== 'sync_failure' && !alert.to.startsWith('C')) return { status: 'blocked' }

  const claim = await ledger.claimOnce(alert.eventKey)
  if (claim.status === 'already_sent') return { status: 'duplicate' }
  if (claim.status === 'in_flight') return { status: 'in_flight' }
  if (claim.status === 'blocked') return { status: 'blocked' }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(claim.retryKey)) {
    return { status: 'blocked' }
  }

  let httpStatus: number | null = null
  try {
    const res = await (settings.transport || fetch)('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': claim.retryKey
      },
      body: JSON.stringify({ to: alert.to, messages: [{type: 'text', text: alert.text}] }),
      signal: AbortSignal.timeout(10000),
    })
    httpStatus = res.status
    if (!res.ok) {
      // 409 may mean the original retry key was accepted. Don't claim delivered
      // or reissue a different retry key from an uncertain API response.
      await ledger.markUncertain(alert.eventKey, claim.retryKey, httpStatus)
      return { status: 'uncertain', httpStatus }
    }
    await ledger.markDelivered(alert.eventKey, claim.retryKey)
    return { status: 'sent' }
  } catch {
    // An HTTP timeout can occur AFTER LINE has accepted a message.
    // Preserve the same retry key and require an audit check.
    await ledger.markUncertain(alert.eventKey, claim.retryKey, httpStatus)
    return { status: 'uncertain', httpStatus }
  }
}
