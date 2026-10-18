import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

// Only the verified 3 Kings project on its Vercel team hostname.
// Never send a project-wide protection bypass credential to arbitrary URLs.
const HOST = /^3kings-site-report-[a-z0-9-]+-kraiwit-p-golfiiz-sqr\.vercel\.app$/
const SECRET = /^[A-Za-z0-9]{32}$/

export function choosePreviewUrl(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if (url.protocol !== 'https:' || !HOST.test(url.hostname) ||
          url.port || url.username || url.password || url.pathname !== '/' ||
          url.search || url.hash) continue
      return url.href
    } catch { /* unverified preview URL */ }
  }
  throw new Error('BLOCK_PREVIEW_URL_UNVERIFIED')
}

export async function inspectPreview(candidates, fetcher = fetch, bypassSecret = '') {
  // Fail closed before any request without an explicitly configured secret.
  if (!SECRET.test(bypassSecret)) return { status: 'BLOCK_PREVIEW_SECRET_NOT_CONFIGURED', http: 'N/A' }
  const url = choosePreviewUrl(candidates)
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Accept: 'text/html',
      'x-vercel-protection-bypass': bypassSecret
    },
    signal: AbortSignal.timeout(15000)
  })
  const http = response.status
  if (http === 401 || http === 403) return { status: 'BLOCK_PREVIEW_AUTH_REQUIRED', http }
  if (http >= 300 && http < 400) return { status: 'UNVERIFIED_REDIRECT', http }
  if (http !== 200) return { status: 'FAIL_PREVIEW_HTTP', http }
  if (!String(response.headers.get('content-type') || '').toLowerCase().includes('text/html'))
    return { status: 'FAIL_NON_HTML', http }
  // This is NOT verification of application authorization or content correctness.
  return { status: 'REACHABLE_ONLY', http }
}

async function main() {
  let result
  try {
    result = await inspectPreview(
      [process.env.PREVIEW_ENV_URL, process.env.PREVIEW_STATUS_URL],
      fetch,
      process.env.KINGS_VERCEL_PREVIEW_BYPASS || ''
    )
  } catch (error) {
    result = {
      status: String(error.message).startsWith('BLOCK_')
        ? error.message : 'FAIL_PREVIEW_REQUEST',
      http: 'N/A'
    }
  }
  const lines = [
    '### Preview HTTP reachability (protected) — read-only',
    '',
    '| Item | Result |', '| --- | --- |',
    '| HTTP probe | ' + result.status + ' |',
    '| Status | ' + result.http + ' |',
    '',
    'A bypass token unlocks Vercel Deployment Protection for this check only; Vercel SSO remains enabled for normal visitors.',
    'This does NOT log in to the 3 Kings app or verify Owner/Viewer RBAC, API/RLS, data sync, forms, PDF/PNG or readiness for Production.',
    'Never configure the token on unreviewed/untrusted workflows or include it in logs, URLs or test artifacts.',
    '',
    'Blocked or unverified results must not authorize merge or deployment.'
  ]
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  console.log(result.status + ' HTTP ' + result.http + ' — Preview reachability only; not Production QA')
  if (result.status !== 'REACHABLE_ONLY') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
