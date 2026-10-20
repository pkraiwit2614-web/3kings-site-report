# Consolidated LINE AutoPilot — P0/P1 branch evidence and safe release plan

Date: 2026-10-20 (Asia/Bangkok). Status: DRAFT DEVELOPMENT ONLY. This file is NOT a release approval, operational trigger, SOP, or deployment instruction.

## Live source-of-truth baseline (read-only verified)
- SOP authority: active Google Drive INDEX, SOP 15 v2.0 Consolidated; Daily SOP EX v2.0 and SUP-PUBLISH v2.0 are independent protected workflows.
- GitHub main at branch cut: af0061f22cb8da4223caa857ba5ed1622eab5fef. Vercel Production READY on this SHA.
- PR #139 code source: 1e391ee768b8d36ce4cf57d4f8c8c67bd14ecb43. It contains a second Next.js webhook draft and an older Cloudflare Worker source. DO NOT publish these as additional active senders.
- PR #164 code source: b2e9a3d5becbd43b03077fe84658c9276433764b, including Daily Sender, image gateway, offline tests and legacy SQL migrations.
- Actual Cloudflare Worker: 3kings-line-autopilot, most recent deployment observed 30726a2c-b92d-48af-858e-d4ab055dbadc on 2026-10-20T02:41:36Z.
- Actual Worker Cron triggers: 0 * * * * and */2 1-5 * * 1-6, interpreted as UTC. Source control here does NOT change them.
- Cloudflare general notification flag AUTOPILOT_ENABLED is false. Daily flag DAILY_SITE_LINE_ENABLED is a secret binding whose value must not be read or inferred.
- Actual Supabase Edge Function kings_daily_line_images version 4 source matches PR #164, sha256 a52804bf25156a41b172476356041c54675b53e04c4729e54bebcdec13598f14. Source-only copy in this branch does NOT redeploy it.
- Existing Supabase line_autopilot.daily_live_routes: above_villa, above_condo_a and above_condo_b are enabled and owner-approved. General notification_types are disabled.
- Delivery ledger read-only baseline: five delivered and one uncertain; a historical HTTP 429 image entry remains uncertain, NOT replayed or reclassified.

## P0 consolidation decisions
1. Maintain exactly ONE Cloudflare Worker scheduled entry point and ONE LINE webhook endpoint. Stage its generic webhook and hourly collector code directly from the current deployed Cloudflare source, not PR #139's older version.
2. Preserve the actual deployed Daily Sender byte-for-byte as a separate cloudflare/dailySiteSendTick.mjs module imported by the Worker. It matches the module from PR #164 exactly. This is code factoring on a test branch, not a deploy.
3. Keep only one generic outbound LINE transport in the Worker and one Daily/Owner implementation in the imported module. Do not include PR #139's alternate Next.js webhook or separate app sender library.
4. Preserve deployed Edge Function v4 source and PR #164's no-send/offline Daily preflight and unit coverage. No change to Google Form, native Sheets, PDF/PNG publishing, Drive data, Calendar, Defect, Materials, Payroll, RBAC/RLS or login.
5. Do NOT bring historical PR #164 schema migrations into the executable supabase/migrations directory: two secure_bridge migrations have identical content, and other staged migrations differ from the currently deployed migration history. Reference-only SQL used in tests is under tests/fixtures and cannot be applied by normal migration tooling.
6. Do NOT include a production Wrangler config, Cloudflare API mutation, new Cron, secret, webhook switch or Supabase migration. No new active Worker or sender is created.

## P1 QA and negative tests
- Existing GitHub Actions CI is retained with one additional no-send test step; no Vercel Hosted Preview should be created just for source-only logic.
- Tests exercise consolidated handler import, HMAC verification, no outbound traffic when disabled, 3-route Daily sender, shared Condo image mapping, verified assets, publisher readiness, LINE 409/429 uncertainty, quota, retry idempotency, private Owner status, offline PDF/PNG source preflight.
- SQL policy tests read REFERENCE_ONLY fixtures, not runnable production migrations.
- QA is an exact-SHA GitHub result; CI PASS does not prove Cloudflare delivery or installed Daily Publisher automation. Failure of any required test blocks promotion.
- The current Worker and Supabase runtime are not changed by branch creation or CI testing. No real LINE send is part of CI.

## P2 / future separate release gate (NOT authorized here)
- Compare and review generated Worker bundle against current deployed Worker API/behavior, current Cloudflare bindings and existing Cron without leaking secret values.
- Confirm actual LINE Developers webhook consumer before any cutover. No need to replace LINE OA just to send push messages.
- Reconcile active Supabase schema, RPC and permissions with migration history. Do not overwrite existing functions, RLS, Delivery Ledger or unique event keys.
- Audit daily executor: fresh Google Form -> native Monthly Sheet -> approved 4-page PDF -> 4 crop-verified PNG -> verified 3-group routing -> delivery ACK -> private Owner report. Read current ACTIVE SOP for each authorized write path.
- Preserve already-sent messages and the uncertain HTTP 429 entry without blind resend. No claims of full E2E until production SHA, actual Worker deployment, Delivery Ledger and LINE response readback agree.
- Keep PR #139 and PR #164 open while functional coverage and the planned replacement are reconciled. Archive/close replaced PRs only after a separate authorized merge and verified release.

## Rollback and blast-radius
This is a new branch only. To abandon, close its draft PR; never touch the running Worker, Cron, LINE group approvals, recipient IDs, Publisher, historical assets, Supabase policies or scheduled jobs. Vercel main and Production remain unchanged.
