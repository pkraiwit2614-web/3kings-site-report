# OAuth Bridge — Verified staging deployment evidence (Google-only revision)
Date: 2026-10-29 Asia/Bangkok.

## Verified via Cloudflare API
- Isolated Worker `3kings-gas-oauth-staging` deployed using the Google-only OIDC source from GitHub PR #239.
- workers.dev route enabled, preview URLs disabled. URL:
  `https://3kings-gas-oauth-staging.p-kraiwit2614.workers.dev`
- Binding `BRIDGE_ENABLED=false`: no live Google authorization or GAS reads possible.
- Existing Workers `3kings-line-autopilot` and `3kings-i18n-qa` unchanged.
- Isolated staging D1 has four tables: `oauth_state`, `oauth_token`, `oauth_session`, `oauth_rate`.
- Cloudflare secret bindings `TOKEN_ENCRYPTION_KEY` (random 256-bit key generated inside provider tooling, never printed) and `ALLOWED_EMAIL` (owner allowlist) are installed; verified only by binding names.
- OAuth Client ID and Client Secret are not installed yet. No owner consent, OAuth tokens or GAS API read performed.
- The Worker does not depend on Cloudflare Access or Cloudflare Zero Trust; no credit card required for this authentication design.
- GitHub Actions offline staging QA passed for Google-only code at commit `dd0ba97e210e3dd089c6aa101ab2275ad14d88aa` and at docs commit `4522d771858db34e73ec90030d21a2f311c7b34d`.
- External HTTP smoke verification **NOT VERIFIED**: container DNS resolution unavailable; Cloudflare tool outbound fetch returned an explicit 403 tool allowlist restriction. Do not call this an HTTP PASS.

## Owner-only blocker
Create a Google OAuth **Web application** client in the existing `3Kings-AI-Ops-Staging` Google Cloud project with exact redirect:
`https://3kings-gas-oauth-staging.p-kraiwit2614.workers.dev/auth/callback`
Then install `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Cloudflare Worker **Secrets** (not plaintext, never in chat or GitHub). Owner must authorize Google OAuth via the Worker in their browser after staging activation. See `GAS_OAUTH_BRIDGE_STAGING_RUNBOOK_2026-10-29.md`.

## Not completed
- No Google OAuth client or live consent.
- No verified seven-file mapping or source comparison.
- No native ChatGPT-to-Worker connector.
- No GAS/Production writes, merges, triggers, LINE sends, or Production deployments.
