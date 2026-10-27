// 3 Kings P0 QA state machine. Do not treat skipped jobs as passing tests.
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function classify(result) {
  if (result === 'success') return 'PASS'
  if (result === 'skipped') return 'SKIPPED'
  return 'BLOCK'
}

export function report({ mode, build, contract, local, probe, browser }) {
  const deployment = mode === 'deployment'
  const checks = deployment
    ? [['Protected Preview HTTP', classify(probe)], ['Anonymous browser', classify(browser)]]
    : [['Existing CI build/regressions', classify(build)], ['Preview safety contracts', classify(contract)],
       ['Synthetic Supabase Local Viewer UI/API/RLS', classify(local)]]
  const mandatoryPass = checks.every(([, state]) => state === 'PASS')
  // Authenticated Vercel Preview remains disabled while Preview shares Production DB.
  const release = deployment
    ? (mandatoryPass ? 'BLOCK_AUTHENTICATED_PREVIEW_NOT_ISOLATED' : 'BLOCK_PREVIEW_CHECKS_INCOMPLETE')
    : (mandatoryPass ? 'NOT_EVALUATED_SOP16_RELEASE_GATE' : 'BLOCK_LOCAL_QA_INCOMPLETE')
  const details = [
    '### 3 Kings Preview QA — P0 result matrix', '',
    '| Evidence | State |', '| --- | --- |',
    ...checks.map(([name, state]) => '| ' + name + ' | **' + state + '** |'),
    '| Authenticated Vercel Viewer | **SKIPPED — isolated DB unavailable** |',
    deployment ? '| Hosted Preview purpose | **Specific hosted-only evidence; no Production authorization** |' : '| Hosted Preview requirement | **RISK-BASED: NOT REQUIRED when CI/Local fully covers changed behavior and security; otherwise validate hosted gap separately** |',
    '| Production release authorization | **' + release + '** |', '',
    'A skipped, canceled, or failed required check is not PASS. Local E2E uses synthetic data only.',
    'A green local QA summary is not a release approval. SOP 16 still requires actual GitHub required checks, risk-based integration evidence, exact SHA and Production readback.',
    'This workflow performs **no Vercel build/deploy**, no Production write and no release approval.',
    'Evidence is valid only for this commit and matching source/config/schema.'
  ]
  return { checks, mandatoryPass, release, markdown: details.join('\n') + '\n' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = report({
    mode: process.env.QA_MODE || 'pr', build: process.env.QA_BUILD,
    contract: process.env.QA_CONTRACT, local: process.env.QA_LOCAL,
    probe: process.env.QA_PROBE, browser: process.env.QA_BROWSER
  })
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output.markdown)
  console.log('QA_CHECKS=' + output.checks.map(([name, state]) => name + ':' + state).join(','))
  console.log('RELEASE=' + output.release)
  if (!output.mandatoryPass) process.exitCode = 1
}
