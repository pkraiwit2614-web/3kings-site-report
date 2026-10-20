# 3 Kings — Cloudflare Backup Build/Preview (test branch)

**Status:** build-only integration, **not** a deployed or authorized hosted Preview. This is a separate, reversible experiment; Vercel stays the only Production host.

## Scope / verified starting point (20 Oct 2026)

- Source: current GitHub `main` as of branch creation, Next.js 15.5.24, existing Vercel Next build.
- Cloudflare account: existing Workers `3kings-i18n-qa` and `3kings-line-autopilot` must not be modified or redeployed.
- Dedicated reserved name: `3kings-web-preview`. Existing Cloudflare Pages projects: none found in account preflight.
- Existing Supabase production, RBAC/RLS, Apps Script, LINE, Defect, Materials, Daily Reports, Payroll and Calendar are strictly out of scope.
- Current Drive authority: 00-SOP_INDEX -> SOP 15 v1.2 (20 Oct 2026). No Production release authorized by this change.

## Why OpenNext first?

This application runs Next.js **15**, including server-side `app/api/**` routes. Static Pages export is not equivalent. Cloudflare's newer vinext path is beta and its current migration guide starts with Next.js 16. OpenNext adapts existing Next.js output to Workers; this branch tests that route without touching the Next/Vercel scripts. Neither compatibility nor complete feature parity should be assumed before CI and browser QA.

## Dry-run build (safe starting point)

The branch-scoped GitHub Action `Cloudflare Backup Build (dry run)` runs:

1. `npm ci` from the existing lockfile.
2. `node --test scripts/check-cloudflare-preview.cjs` (config and security audit).
3. Installs the Cloudflare adapter and Wrangler **temporarily in CI**; no package or lockfile commit.
4. Copies Cloudflare-specific config into the build runner (no Next config change in the tracked source).
5. `opennextjs-cloudflare build` followed by `wrangler deploy --dry-run`. **No Cloudflare credentials, API calls that mutate the account, upload, Workers.dev exposure, or Production deploy.**
6. Ensures app package, lockfile and Vercel config were not changed.

A failing build should be treated as compatibility evidence, not retried through new Vercel Preview builds.

## Hosted Preview: blocked pending separate safety gates

The tracked Wrangler configuration deliberately sets `workers_dev: false` and `preview_urls: false`. This provides no public URL. **Do not toggle these flags or run a real Cloudflare deployment yet.**

Before any hosted Preview:

1. Eliminate/contain **all hard-coded production Supabase URL/key fallbacks**, not just the public NEXT_PUBLIC variables; use an isolated **test** Supabase project with synthetic data, and verify SSR, API, browser and build-time environment resolution. Production tenant writes, image access and scheduled sync must be impossible.
2. Review and adapt Node-native routes (`sharp`, `@resvg/resvg-js`), `@vercel/oidc` SOP Gate and Google Drive access, OAuth callback URLs, auth cookies, signed URLs, server actions, cron/callback routes and upload size limits.
3. Configure Cloudflare Access (private identities) **before** publishing a route/version URL. Do not expose real customer, Defect, Payroll or Daily Reports through an unprotected preview.
4. Reconcile node/runtime/build constraints and Workers Free-plan limits; ensure Worker name is **exactly** `3kings-web-preview`, with no inherited routes or triggers. Audit existing `3kings-line-autopilot` and `3kings-i18n-qa` for no change.
5. Pass Build/dry-run, isolated login smoke, role matrix (UI/API/RLS), Defect, Materials, Daily Reports, printed PNG routes, TH/EN/RU, and negative tests for nonowner access/write attempts; collect immutable commit SHA, dependency versions, config hash and QA artifacts.
6. Deploy only to isolated Cloudflare Preview after review of credentials, Access, staging data, exact target, rollout and rollback. **Do not alias Vercel Production, change DNS, merge main or create production data.**

## Independent CLI test (if a developer has the project locally)

Run on this **test branch**, not `main`, using Node 22:

```sh
npm ci
node --test scripts/check-cloudflare-preview.cjs
npm install --no-save --no-package-lock @opennextjs/cloudflare@latest wrangler@latest
cp cloudflare-preview/open-next.config.ts.template open-next.config.ts
cp cloudflare-preview/wrangler.jsonc wrangler.jsonc
NEXT_PUBLIC_SUPABASE_URL=https://preview.invalid NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_preview_placeholder npx opennextjs-cloudflare build
npx wrangler deploy --dry-run
```

Generated root config and `.open-next/` are ignored from Git. Never commit secrets or use the production Supabase credentials to test Cloudflare. Temporary installation uses `latest`; pin validated versions and capture a reproducible lockfile **before** making a release candidate.

## References

- Cloudflare Next.js Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- Cloudflare OpenNext: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- Cloudflare Preview examples: https://developers.cloudflare.com/workers/previews/examples/
