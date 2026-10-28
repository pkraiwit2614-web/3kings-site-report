# GAS OAuth Bridge — Staging Activation Runbook
**State:** Staging implementation only; no Google consent or live API read until activation gates pass.

## Architecture
- Isolated Worker name: `3kings-gas-oauth-staging`; separate from `3kings-line-autopilot` and `3kings-i18n-qa`.
- Source: `scripts/ai-operations/gas-oauth-worker-staging.cjs`. Deploy bundler must convert CJS exports to ESM fetch handler.
- Owner-only routes use **verified Cloudflare Access JWT** (RSA signature, key ID, issuer, audience, expiration, email). Worker denies unauthenticated calls even if the workers.dev route is public.
- `GET /auth/start`: one-time random OAuth state and PKCE S256 verifier saved to private D1 with 5-minute expiry.
- `GET /auth/callback`: Access JWT owner check; atomic D1 DELETE RETURNING prevents replay; Google authorization-code exchange; exact readonly scope; AES-256-GCM encrypt refresh token at rest.
- `GET /api/status`: owner-only connected status, never token.
- `GET /api/source`: owner-only; refresh token; GET-only Apps Script `projects.getContent`; return only allowlisted remote filenames, SHA-256 and FOUND/NOT_FOUND. HEAD is **not** proof of active deployment.
- `GET /health`: no credentials, reports staging mode only, not real readiness. Other paths/methods fail closed.
- Google OAuth and API access disabled until all config and Access checks pass.

## Private bindings (do not put values in GitHub, chat or public vars)
Cloudflare **secrets**:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google Cloud Web application OAuth client)
- `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64url; independently generated and securely stored)
- `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ALLOWED_EMAIL`
- `TARGETS_JSON` (strict private allowlist of actual Script IDs and exact remote SERVER_JS file names; at most seven names)
Cloudflare **vars**:
- `BRIDGE_ENABLED` = `false` until explicitly authorized and verified
- `PUBLIC_ORIGIN` = actual HTTPS Worker URL
Cloudflare **D1 binding**: `DB`, isolated staging database with `docs/ai-operations/GAS_OAUTH_BRIDGE_STAGING_D1.sql` schema.

## Activation steps (owner-approved staging only)
1. Review GitHub PR #239 offline QA and confirm isolated Worker deployment has no existing route or cron.
2. Create isolated D1 database and apply staging SQL; do not reuse Supabase or any Production DB.
3. Enable Cloudflare Access on the staging Worker route, restrict to owner, and confirm the Access JWT audience and team domain. No public login bypass.
4. Obtain stable HTTPS Worker origin, then create **Web application** OAuth Client in the already-created `3Kings-AI-Ops-Staging` Google Cloud Project. Register exactly `<PUBLIC_ORIGIN>/auth/callback` as an authorized redirect URI. Do not change the live GAS project's Cloud Project association.
5. Owner configures Cloudflare secrets directly in the provider UI. **Never paste any secrets, tokens, private mapping or Script IDs into GitHub, ChatGPT or screenshots.**
6. Verify exact 7-file mapping against the real GAS project(s), owner coverage and active SOP revision. A single supplied Script ID does not establish mapping for all seven files.
7. Only after security/QA gates and separate activation approval, enable `BRIDGE_ENABLED=true`, authorize owner through Cloudflare Access, visit `/auth/start` and consent to Google read-only scope.
8. Read `/api/source`, compare hashes with Git source; verify HEAD vs deployed version separately. Never install triggers, send LINE, change GAS source, auto-repair, merge PR or deploy 3 Kings Production.

## Fail-closed limitations
- Cloudflare Access policy and Google OAuth client must be configured by authorized account owner; the GitHub connector cannot grant these permissions.
- Refresh tokens are encrypted but remain high-value; restrict Worker deployments, D1 access, and Cloudflare secrets permissions. Use distinct staging-only credentials.
- The Worker does not implement automatic refresh-token revocation or periodic D1 state cleanup. Expired state is rejected and can be pruned manually under change control.
- No persistent background monitoring; no automated GAS trigger inventory. These require distinct authorized access.
