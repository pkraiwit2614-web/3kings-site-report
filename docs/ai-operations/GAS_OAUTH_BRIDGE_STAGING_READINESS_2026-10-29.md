# OAuth bridge readiness — STAGING ONLY

Status: DESIGN / OFFLINE ONLY. This document does not establish an OAuth connection.

## Scope
- Source project: `3Kings Drive → Supabase Sync`. Script ID was supplied privately by the project owner; do not copy it into GitHub, CI logs, client bundles, or public documentation.
- Cloud project: `3Kings-AI-Ops-Staging`. Owner reports Apps Script API enabled, OAuth consent configured and `script.projects.readonly` selected. These are owner-reported, not independently verified.
- Existing source comparison: `scripts/ai-operations/compare-gas-live.cjs`, using `GET https://script.googleapis.com/v1/projects/{scriptId}/content` and bearer token with readonly scope. No OAuth token exists in the repository or ChatGPT session.

## Architecture decision (no activation)
1. Keep **OAuth client credentials and refresh/access tokens on a private, access-controlled backend**, never in browser code, GitHub Actions logs, PR comments, ChatGPT messages, or source-controlled configuration.
2. The Google OAuth client type and redirect URI **must be chosen after selecting the actual authorized runtime and its stable callback URL**. Do not create arbitrary clients, use a shared OAuth Playground, or collect tokens by chat.
3. Bridge must implement authorization code + PKCE where supported, verified state, exact redirect URI, minimal `https://www.googleapis.com/auth/script.projects.readonly` scope, encrypted credential storage, token expiry/rotation, strict user/session binding, CSRF protections, and revocation.
4. Bridge API should expose **only sanitized metadata** (file names, hashes, status), not raw GAS code, script IDs, token values, property values or arbitrary URLs. Restrict requests to a private allowlist of owner-confirmed script projects and the seven-file manifest.
5. The existing comparator expects a private 7-target mapping; one confirmed script project ID is **not** evidence that all seven files live in that project. File-to-project mapping and exact remote names must be verified individually.
6. Production code, GAS triggers/properties, Vercel Production, LINE, Supabase and Drive data are untouched. No auto-repair, deploy, merge or background monitor is authorized.

## Minimum test gates before any live OAuth
- OAuth callback domain and audience approved by owner, HTTPS enforced, exact redirect and state/PKCE validation.
- OAuth scope inspection confirms only `script.projects.readonly`; deny write-capable scopes.
- No secrets or private identifiers in public output or logs; errors redacted.
- GET-only endpoint and known-project allowlist; no generic proxy, arbitrary script IDs, or POST-to-GAS.
- Validate real seven-file mapping, version semantics (HEAD != active deployment), independent SOP revision check.
- Offline tests pass on isolated staging branch. A live owner authorization and read requires separate explicit activation confirmation.

## Current next action
Choose a backend runtime that can securely hold tokens and an HTTPS callback, e.g. an isolated staging backend. Then specify its **actual** callback URL and register a Web Application OAuth Client on the new Google Cloud project. Do not modify the Cloud project association of the live Apps Script project. Do not paste client secrets or tokens into chat.
