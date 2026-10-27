// Safe, unauthenticated Production SSO diagnostic. Never tests authenticated UI.
// No credentials, bypass headers, cookies, mutation, or arbitrary URLs.
import { pathToFileURL } from 'node:url'
const ORIGIN = 'https://3kings-site-report.vercel.app'
const PATHS = ['/login', '/defects', '/reports']
export function classify(status, location = '', body = '') {
  if (status === 401 || status === 403) return 'PROTECTED_OR_APP_AUTH_REQUIRED'
  if (status >= 300 && status < 400) {
    // Redirects require human review; do not follow or forward credentials.
    return 'AUTH_REDIRECT_UNVERIFIED'
  }
  if (status !== 200) return 'HTTP_FAILURE'
  if (/กำลังตรวจสอบสิทธิ์|checking permissions|checking access/i.test(body))
    return 'REACHABLE_SHELL_ONLY'
  return 'REACHABLE_UNAUTHENTICATED_ONLY'
}
export async function diagnose(fetcher = fetch) {
  const results = []
  for (const path of PATHS) {
    const response = await fetcher(ORIGIN + path, {
      method: 'GET', redirect: 'manual',
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(12000)
    })
    // Do not print response bodies, cookies, tokens or redirect locations.
    const body = response.status === 200 ? (await response.text()).slice(0, 20000) : ''
    results.push({ path, http: response.status,
      classification: classify(response.status, response.headers.get('location') || '', body) })
  }
  return results
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await diagnose()
    for (const result of results)
      console.log(result.path + ' HTTP ' + result.http + ' ' + result.classification)
    console.log('Production browser E2E: NOT_VERIFIED (no application login attempted)')
    if (results.some(r => r.classification === 'HTTP_FAILURE')) process.exitCode = 1
  } catch {
    console.error('PRODUCTION_REACHABILITY_UNVERIFIED')
    process.exitCode = 1
  }
}
