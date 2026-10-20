'use strict'
// Read-only PR-scoped release gate for #187. No network calls, no LINE delivery,
// no Drive/Sheets writes, no outbound webhooks and no Vercel deployments.
const { execFileSync } = require('node:child_process')

const ALLOWED = Object.freeze([
  '.github/workflows/ci.yml',
  '.github/workflows/hosted-preview-on-demand.yml',
  'docs/preview-routing-policy.md',
  'scripts/authorize-hosted-preview.mjs',
  'scripts/vercel-preview-gate.cjs',
  'scripts/daily-line-merge-gate.cjs',
  'tests/hosted-preview-authorization.test.mjs',
  'tests/vercel-preview-gate.test.cjs',
  'tests/daily-line-merge-gate.test.cjs',
  'vercel.json'
])
// These are core, tracked inputs. Cloudflare Worker/Cron, Google Drive PDF/PNG
// and Delivery Gateway state are EXTERNAL, read-only release checks, not CI PASS.
const DAILY_LINE_SOURCES = Object.freeze([
  'docs/apps-script/DailySiteReportSync_2026-10-19.gs',
  '.github/workflows/daily-site-importer.yml',
  'tests/daily-site-importer.test.cjs',
  'docs/DAILY_SITE_SYNC_ISOLATED_RUNBOOK_2026-10-19.md'
])
function classify(changed) {
  const disallowed = changed.filter(p => !ALLOWED.includes(p))
  return {
    pass: disallowed.length === 0 && changed.length > 0,
    disallowed,
    protectedScopes: {
      dailyReport: !changed.some(p => /daily|report|apps-script|sync/i.test(p) && !ALLOWED.includes(p)),
      png: !changed.some(p => /png|pdf|image|report-print/i.test(p) && !ALLOWED.includes(p)),
      lineGateway: !changed.some(p => /line|delivery|gateway|cloudflare|worker|cron/i.test(p) && !ALLOWED.includes(p))
    }
  }
}
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 }).trim()
}
function checkMerge() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request')
    throw Error('BLOCK_NOT_PULL_REQUEST')
  if (process.env.GITHUB_REPOSITORY !== 'pkraiwit2614-web/3kings-site-report')
    throw Error('BLOCK_WRONG_REPOSITORY')
  if (String(process.env.PR_NUMBER) !== '187')
    throw Error('BLOCK_WRONG_PR')
  // Actions pull_request checkout is a synthetic merge commit. HEAD^1 is
  // current PR base; comparing to HEAD catches all future branch changes.
  const parts = git('rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/)
  if (parts.length !== 3) throw Error('BLOCK_NO_PR_MERGE_COMMIT')
  const base = parts[1]
  const changed = git('diff', '--name-only', '--no-renames', base, 'HEAD')
    .split('\n').map(p => p.trim()).filter(Boolean)
  const classification = classify(changed)
  if (!classification.pass)
    throw Error('BLOCK_UNRELATED_CHANGE:' + classification.disallowed.join(','))
  for (const path of DAILY_LINE_SOURCES) {
    const before = git('rev-parse', base + ':' + path)
    const after = git('rev-parse', 'HEAD:' + path)
    if (!before || before !== after) throw Error('BLOCK_DAILY_LINE_SOURCE_CHANGED:' + path)
  }
  console.log('PASS_PR187_DAILY_REPORT_PNG_LINE_GATEWAY_SOURCE_UNCHANGED')
  console.log('PASS_PR187_STRICT_PREVIEW_ONLY_DIFF_' + changed.length + '_FILES')
  console.log('EXTERNAL_DELIVERY_AND_GOOGLE_DRIVE_RUNTIME_UNTESTED_READ_ONLY')
  console.log('NO_LINE_SEND_OR_GATEWAY_WRITE_EXECUTED')
  return classification
}
if (require.main === module) {
  try { checkMerge() } catch (error) {
    console.error(String(error.message || error))
    process.exitCode = 1
  }
}
module.exports = { ALLOWED, DAILY_LINE_SOURCES, classify, checkMerge }
