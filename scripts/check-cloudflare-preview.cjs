'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const configPath = path.join(root, 'cloudflare-preview', 'wrangler.jsonc')
const workflowPath = path.join(root, '.github', 'workflows', 'cloudflare-backup-build.yml')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const workflow = fs.readFileSync(workflowPath, 'utf8')

test('Cloudflare Worker name is isolated from existing 3 Kings Workers', () => {
  assert.equal(config.name, '3kings-web-preview')
  assert.notEqual(config.name, '3kings-line-autopilot')
  assert.notEqual(config.name, '3kings-i18n-qa')
  assert.equal(config.main, '.open-next/worker.js')
  assert.ok(config.compatibility_flags.includes('nodejs_compat'))
})

test('Cloudflare preview is private and inert by default', () => {
  assert.equal(config.workers_dev, false)
  assert.equal(config.preview_urls, false)
  assert.equal(config.routes, undefined)
  assert.equal(config.route, undefined)
  assert.equal(config.triggers, undefined)
  assert.equal(config.vars, undefined)
})

test('workflow is restricted to test branch and dry-run only', () => {
  assert.match(workflow, /feature\\/cloudflare-backup-preview-20261020/)
  assert.match(workflow, /wrangler deploy --dry-run/)
  assert.doesNotMatch(workflow, /wrangler deploy --dry-run[\\s\\S]*?--env production/)
  assert.doesNotMatch(workflow, /\\bwrangler publish\\b/)
  assert.doesNotMatch(workflow, /cloudflare\\/wrangler-action/)
  assert.match(workflow, /permissions:\\s*\\n\\s*contents: read/)
})

test('ordinary Next/Vercel configuration has not been replaced', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts.build, 'next build')
  assert.equal(pkg.scripts.start, 'next start')
  assert.equal(pkg.dependencies.next, '15.5.24')
})

test('audit flags runtime risks before any hosted preview is enabled', () => {
  let supabaseFallbacks = 0
  let vercelOidcReferences = 0
  let nodeNativeModules = 0
  for (const dir of ['app', 'lib']) {
    const visit = (folder) => {
      if (!fs.existsSync(folder)) return
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        const full = path.join(folder, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== 'Backup') visit(full)
        } else if (/\\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
          const source = fs.readFileSync(full, 'utf8')
          if (/\\.supabase\\.co/.test(source)) supabaseFallbacks++
          if (/@vercel\\/oidc|x-vercel-oidc-token|VERCEL_OIDC_TOKEN/.test(source)) vercelOidcReferences++
          if (/@resvg\\/resvg-js|from ['"]sharp['"]/.test(source)) nodeNativeModules++
        }
      }
    }
    visit(path.join(root, dir))
  }
  console.log(JSON.stringify({ cloudflare_risk_audit: {
    files_with_supabase_host: supabaseFallbacks,
    files_with_vercel_oidc: vercelOidcReferences,
    files_with_native_imaging: nodeNativeModules,
    hosted_preview_approved: false
  }}))
  assert.equal(process.env.CF_ALLOW_PUBLIC_PREVIEW, undefined,
    'Cloudflare public preview requires separate staging-backend and access review')
})
