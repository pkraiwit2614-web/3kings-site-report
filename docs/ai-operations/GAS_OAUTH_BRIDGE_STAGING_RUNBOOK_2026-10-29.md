# 3 Kings GAS Google-only OAuth Bridge — STAGING runbook
Updated 2026-10-29. This design does **not** require Cloudflare Zero Trust, Cloudflare Access, or a credit card. Existing Workers and Production remain untouched.

## Installed
- Isolated Worker: `3kings-gas-oauth-staging` at `https://3kings-gas-oauth-staging.p-kraiwit2614.workers.dev`.
- Isolated D1 database `3kings-gas-oauth-staging` with one-time state, encrypted refresh token, private session and rate-limit tables.
- Google-only owner login verifies Google ID token signature using Google's JWKS, issuer, audience, expiry, nonce, verified email and exact owner allowlist. OAuth PKCE S256, state + HttpOnly SameSite=Lax browser-binding cookie and atomic single-use D1 state are required.
- Private sessions use random opaque HttpOnly Secure SameSite=Strict cookies; only SHA-256 session hashes are stored in D1. Session expires after one hour; `POST /auth/logout` requires matching Origin.
- Refresh token encrypted with AES-256-GCM and owner-bound additional authenticated data. Google token exchange is POST, but GAS API is **GET-only** and returns hashes/status for allowlisted source files; no raw code, tokens or Script IDs.
- `GET /health` reports staging mode only; `GET /api/status` and `GET /api/source` require a valid owner session.
- Default `BRIDGE_ENABLED=false` until the Google OAuth client is installed and a controlled activation test is approved.

## Already installed privately
- `TOKEN_ENCRYPTION_KEY`: random 256-bit secret, generated inside Cloudflare API tool and installed without printing the value.
- `ALLOWED_EMAIL`: owner allowlist configured privately.
- D1 `DB` binding and `PUBLIC_ORIGIN` set to staging Worker URL.

## Owner action (no card, approximately 5 minutes)
1. Go to <https://console.cloud.google.com/auth/clients> and select the existing `3Kings-AI-Ops-Staging` Google Cloud project. If the URL redirects, navigate **Google Auth Platform → Clients**.
2. Click **Create Client** and choose **Web application**. Name it `3Kings GAS Readonly Staging`.
3. Set **Authorized redirect URI** to exactly:
   `https://3kings-gas-oauth-staging.p-kraiwit2614.workers.dev/auth/callback`
   (No need to add a JavaScript origin; the OAuth flow is server-side.)
4. Save the Client ID and Client Secret **privately**. Do not paste them into ChatGPT, GitHub, a screenshot or PR.
5. Open <https://dash.cloudflare.com/> → **Workers & Pages** → `3kings-gas-oauth-staging` → **Settings → Variables and Secrets**. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as **Secret**, not plaintext variables. Keep `BRIDGE_ENABLED=false`.
6. Ensure the Google Auth Platform consent screen includes the owner's Gmail as a **test user** if the app is in Testing. The Google scopes required by the Worker are `openid email https://www.googleapis.com/auth/script.projects.readonly`. Do not add write scopes.
7. Tell ChatGPT only **"ตั้ง OAuth Client และ Secrets แล้ว"**, without exposing any values. ChatGPT can verify the presence (not contents) of secret bindings and run staged activation checks.

## After owner action
- Verify secret names, Worker deployment and D1 schema. Confirm no existing OAuth token/session.
- Review OAuth consent scope and allowlist. Then, with owner's authorization, set `BRIDGE_ENABLED=true` for isolated Staging only.
- Owner opens `https://3kings-gas-oauth-staging.p-kraiwit2614.workers.dev/auth/start`, signs in with the owner Gmail and approves the **read-only** permission. Do not authorize any unexpected scopes.
- Verify `/api/status` reports `connected:true` and `/api/source` only after exact GAS project/file allowlist is installed in `TARGETS_JSON` (Cloudflare Secret). Empty targets are permitted for login but cannot read source.
- A Google Cloud OAuth consent screen in **External / Testing** may issue refresh tokens that expire after seven days. Reauthorization may be needed; do not silently switch to Production verification.
- Google Apps Script API may impose restrictions on which Cloud project/OAuth client can read a given Script project; verify the real API response rather than assuming cross-project access.

## Known limitations
- No ChatGPT-native connector for this custom Worker is currently connected. A functioning browser OAuth login does **not** automatically allow ChatGPT to read the private endpoint. A separate explicitly authorized connector/workflow is needed for ChatGPT-to-Worker access.
- No real Google OAuth consent has occurred; no live GAS content has been read or compared. HEAD source is not proof of deployed version.
- No automatic token revocation/cleanup scheduler. No auto-repair, no triggers, no LINE, no GAS writes, no Production deployment, no merge.
