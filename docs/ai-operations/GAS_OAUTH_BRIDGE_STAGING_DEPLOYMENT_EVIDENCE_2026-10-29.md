# OAuth Bridge Staging — Deployment Evidence
Recorded: 2026-10-29 Asia/Bangkok. Scope: isolated staging resources only.

## Verified via Cloudflare API
- Connected Cloudflare account: owner-controlled account; no changes to existing Workers `3kings-line-autopilot` or `3kings-i18n-qa`.
- New Worker: `3kings-gas-oauth-staging`, deployed via Cloudflare Workers API with latest staging source from PR #239.
- Staging URL: `https://3kings-gas-oauth-staging.p-kraiwit2614.workers.dev`; workers.dev subdomain enabled; preview URLs disabled.
- Runtime bindings: `BRIDGE_ENABLED=false`, `PUBLIC_ORIGIN` set to staging URL, isolated D1 binding `DB`.
- Isolated D1 database: `3kings-gas-oauth-staging`; schema `oauth_state` and `oauth_token` created and verified via read-only SQL. No OAuth tokens have been issued or saved.
- Worker deployment API reported success and 100% of the new Worker's traffic on its own deployment. **No production system was changed.**
- No schedules/cron triggers installed on this Worker.
- Public HTTP smoke test was attempted but external network resolver did not confirm a response; **HTTP response remains UNVERIFIED**, not a PASS.

## Verified blockers
1. **Cloudflare Access is NOT enabled on this account**. Access API returned `access.api.error.not_enabled` (HTTP 403). Account owner must enable Cloudflare Zero Trust/Access in the Cloudflare dashboard before owner-only JWT policy can be configured.
2. No Google Cloud OAuth **Web application client** (client ID + secret + exact redirect URI) is connected to this Worker. Consent-screen setup alone is not sufficient.
3. No Cloudflare secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ALLOWED_EMAIL`, `TARGETS_JSON`) are configured; all sensitive values must be supplied privately via provider UI, never via chat or GitHub.
4. Exact mapping of the seven tracked GAS files to actual Script projects remains unverified. One Script ID has been provided privately; no live Google API read has occurred.
5. No ChatGPT-facing OAuth connector is connected; a protected Worker endpoint does not itself grant ChatGPT permission to call it.

## Safety / next actions
- Keep `BRIDGE_ENABLED=false` until Access, OAuth client, private secrets, exact mapping and independent live security tests pass.
- Owner: enable Cloudflare Access once via dashboard. After that, create an Access application for the **staging Worker only**, with owner-only allow policy, and verify Access JWT audience and team domain.
- Register Google OAuth Web client with redirect URI `https://3kings-gas-oauth-staging.p-kraiwit2614.workers.dev/auth/callback`.
- Configure secrets only in Cloudflare secure UI and verify via masked bindings.
- Re-run offline CI, then explicit owner-approved Staging activation and live GET-only QA.
- Do not change GAS Production project, Apps Script properties/triggers, LINE, Supabase, Vercel, main branch, or auto-repair settings.
