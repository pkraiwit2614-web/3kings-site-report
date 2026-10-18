import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const HOST = /^3kings-site-report-[a-z0-9-]+\.vercel\.app$/

export function choosePreviewUrl(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      if (url.protocol !== 'https:' || !HOST.test(url.hostname) ||
          url.port || url.username || url.password || url.pathname !== '/' ||
          url.search || url.hash) continue
      return url.href
    } catch { /* not a verified preview URL */ }
  }
  throw new Error('BLOCK_PREVIEW_URL_UNVERIFIED')
}

export async function inspectPreview(candidates, fetcher = fetch) {
  const url = choosePreviewUrl(candidates)
  const response = await fetcher(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(15000)
  })
  const http = response.status
  if (http === 401 || http === 403) return { status: 'BLOCK_PREVIEW_AUTH_REQUIRED', http }
  if (http >= 300 && http < 400) return { status: 'UNVERIFIED_REDIRECT', http }
  if (http !== 200) return { status: 'FAIL_PREVIEW_HTTP', http }
  if (!String(response.headers.get('content-type') || '').toLowerCase().includes('text/html'))
    return { status: 'FAIL_NON_HTML', http }
  return { status: 'REACHABLE_ONLY', http }
}

async function main() {
  let result
  try {
    result = await inspectPreview([process.env.PREVIEW_ENV_URL, process.env.PREVIEW_STATUS_URL])
  } catch (error) {
    result = { status: String(error.message).startsWith('BLOCK_') ? error.message : 'FAIL_PREVIEW_REQUEST', http: 'N/A' }
  }
  const lines = [
    '### Preview HTTP reachability — read-only',
    '',
    '| Item | Result |', '| --- | --- |',
    '| HTTP probe | ' + result.status + ' |',
    '| Status | ' + result.http + ' |',
    '',
    'This check only establishes unauthenticated HTTP reachability. It does NOT verify login, Owner/Viewer RBAC, API/RLS, data sync, forms, PDF/PNG, user interactions, or readiness for Production.',
    '',
    'Blocked or unverified results must not be treated as approval to merge or deploy.'
  ]
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  console.log(result.status + ' HTTP ' + result.http + ' — Preview reachability only; not Production QA')
  if (result.status !== 'REACHABLE_ONLY') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
