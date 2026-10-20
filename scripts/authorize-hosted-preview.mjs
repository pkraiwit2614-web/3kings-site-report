// Read-only on-demand Hosted Preview gate. This code runs from trusted main,
// never from the PR being examined, and never with deploy/write credentials.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { choosePreviewUrl } from './preview-readonly-smoke.mjs'

export const REPO = 'pkraiwit2614-web/3kings-site-report'
export const VERCEL_PROJECT = 'prj_2iuWN5ueawgdH9KXUNG5J5ERs6X8'
export const VERCEL_TEAM = 'team_el2ch8nepuJK8ZVtAJRGdpQ5'
const SHA = /^[a-f0-9]{40}$/

function block(code) { throw new Error('BLOCK_' + code) }
export function validateRequest({ repo, actor, ref, prNumber, sha, previewUrl }, pr, runs) {
  if (repo !== REPO || actor !== 'pkraiwit2614-web' || ref !== 'refs/heads/main') block('UNAUTHORIZED_DISPATCH')
  if (!/^[1-9][0-9]{0,5}$/.test(String(prNumber || '')) || !SHA.test(sha || '')) block('BAD_PR_OR_SHA')
  const url = choosePreviewUrl([previewUrl])
  // Exact deployment URLs are immutable. Branch aliases can move after verification.
  if (!/^3kings-site-report-[a-z0-9]{9}-kraiwit-p-golfiiz-sqr\.vercel\.app$/.test(new URL(url).hostname))
    block('MUTABLE_OR_NONDEPLOYMENT_URL')
  if (!pr || pr.number !== Number(prNumber) || pr.state !== 'open' ||
      pr.base?.ref !== 'main' || pr.head?.repo?.full_name !== REPO ||
      pr.head?.sha !== sha) block('PR_SHA_NOT_CURRENT_FIRST_PARTY')
  const ok = (runs || []).some(r => r.head_sha === sha && r.event === 'pull_request' &&
    r.status === 'completed' && r.conclusion === 'success')
  if (!ok) block('CI_NOT_GREEN_FOR_SHA')
  return url
}
export function validateDeployment(raw, sha, url) {
  if (!SHA.test(sha || '')) block('BAD_SHA')
  const host = new URL(choosePreviewUrl([url])).hostname
  const deployment = raw?.result || raw
  if (!deployment || deployment.projectId !== VERCEL_PROJECT ||
      (deployment.target != null && deployment.target !== 'preview') || deployment.readyState !== 'READY' ||
      deployment.url !== host) block('PREVIEW_DEPLOYMENT_IDENTITY')
  // Two metadata sources must agree if both exist.
  const gitSHA = deployment.gitSource?.sha
  const metaSHA = deployment.meta?.githubCommitSha
  if (!gitSHA && !metaSHA) block('DEPLOYMENT_SHA_UNKNOWN')
  if ((gitSHA && gitSHA !== sha) || (metaSHA && metaSHA !== sha)) block('DEPLOYMENT_SHA_MISMATCH')
  return true
}
function api(path) {
  return JSON.parse(execFileSync('gh', ['api','--method','GET',path], {
    encoding:'utf8',timeout:15000,maxBuffer:1024*1024
  }))
}
async function main() {
  const input={
    repo:process.env.GITHUB_REPOSITORY, actor:process.env.GITHUB_ACTOR,
    ref:process.env.GITHUB_REF, prNumber:process.env.PR_NUMBER,
    sha:process.env.PR_SHA, previewUrl:process.env.PREVIEW_ENV_URL
  }
  // Validate untrusted inputs BEFORE any network request.
  if (input.repo !== REPO || input.actor !== 'pkraiwit2614-web' ||
      input.ref !== 'refs/heads/main' ||
      !/^[1-9][0-9]{0,5}$/.test(input.prNumber || '') ||
      !SHA.test(input.sha || '')) block('DISPATCH_INPUTS')
  choosePreviewUrl([input.previewUrl])
  const pr=api('repos/' + REPO + '/pulls/' + input.prNumber)
  const results=api('repos/' + REPO + '/actions/workflows/ci.yml/runs?head_sha=' +
    input.sha + '&event=pull_request&per_page=30')
  validateRequest(input,pr,results.workflow_runs)
  if (process.argv[2] === 'verify-deployment') {
    const file=process.env.VERCEL_DEPLOYMENT_JSON
    if (!file) block('DEPLOYMENT_EVIDENCE_MISSING')
    validateDeployment(JSON.parse(readFileSync(file,'utf8')),input.sha,input.previewUrl)
    console.log('AUTHORIZED_HOSTED_PREVIEW_SHA_MATCH')
  } else console.log('AUTHORIZED_HOSTED_PREVIEW_REQUEST')
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(e => { console.error(String(e.message || 'BLOCK_HOSTED_PREVIEW')); process.exitCode=1 })
