'use strict'
// Vercel Ignored Build Step: exit 0 = SKIP; exit 1 = BUILD.
// Production behavior unchanged. A Preview build is permitted only when
// TWO owner-managed, preview-only, BRANCH-SCOPED variables name the exact
// first-party branch and commit. Never use a project-wide "allow previews".
const { execFileSync } = require('node:child_process')
const SHA = /^[0-9a-f]{40}$/
const REF = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{1,248}$/

function currentGitSha() {
  try {
    const v = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return SHA.test(v) ? v : null
  } catch { return null }
}

function allowBuild(env, checkoutSha = null) {
  if (!env) return false
  if (env.VERCEL_ENV === 'production') return true // existing production behavior
  if (env.VERCEL_ENV !== 'preview') return false

  // Both variables MUST be scoped to this PR branch in Vercel Preview settings.
  // Their presence alone is not enough; bind to the actual Vercel Git metadata.
  const allowedSha = env.KINGS_HOSTED_PREVIEW_ALLOWED_SHA
  const allowedRef = env.KINGS_HOSTED_PREVIEW_ALLOWED_REF
  const actualSha = env.VERCEL_GIT_COMMIT_SHA || checkoutSha
  const actualRef = env.VERCEL_GIT_COMMIT_REF
  if (!SHA.test(allowedSha || '') || !SHA.test(actualSha || '') ||
      !REF.test(allowedRef || '') || !actualRef ||
      actualRef === 'main' || allowedRef === 'main') return false
  if (checkoutSha && checkoutSha !== actualSha) return false
  if (env.VERCEL_GIT_REPO_SLUG && env.VERCEL_GIT_REPO_SLUG !== '3kings-site-report') return false
  if (env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_OWNER !== 'pkraiwit2614-web') return false
  return allowedSha === actualSha && allowedRef === actualRef
}

if (require.main === module) {
  const env = process.env
  const allow = allowBuild(env, currentGitSha())
  console.log(allow
    ? env.VERCEL_ENV === 'production' ? 'ALLOW_PRODUCTION_BUILD' : 'ALLOW_APPROVED_EXACT_SHA_PREVIEW'
    : 'SKIP_UNAUTHORIZED_OR_AUTOMATIC_VERCEL_PREVIEW')
  process.exitCode = allow ? 1 : 0
}
module.exports = { allowBuild, currentGitSha }
