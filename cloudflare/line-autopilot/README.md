# LINE AutoPilot — Cloudflare Workers + existing Supabase

Installed 17 Oct 2026. **Infrastructure staged; sending is OFF.** The expired n8n webhook stays unchanged during verification.

## Actual infrastructure
- New Worker: 3kings-line-autopilot. Existing 3kings-i18n-qa untouched.
- Cloudflare workers.dev subdomain: p-kraiwit2614. Expected health URL: https://3kings-line-autopilot.p-kraiwit2614.workers.dev/health
- Cloudflare control plane confirms Worker uploaded and deployed at 100%. Independent public HTTP health check was inconclusive. The status must not be called end-to-end verified.
- Worker supports HMAC-signed POST /line/webhook, default-off health check, and read-only confirmed sync-error collector.
- Cron: 0 * * * * (once hourly, UTC). Configured but actual trigger execution not yet observed. AUTOPILOT_ENABLED=false.
- Supabase project: wtqubwdduzedmcvyhbgs, migration line_autopilot_delivery_ledger_20261017.
- Private line_autopilot.deliveries table: RLS enabled, stores no tokens or recipient IDs.
- RPC line_autopilot_claim and line_autopilot_ack: service_role only; anon and authenticated cannot execute.
- Draft PR #139 on branch feature/line-autopilot-webhook-20261016. No merge to main or Vercel Production.

## Exact five alert types and readiness
| Type | Audience | Source integration |
| --- | --- | --- |
| sync_failure | Owner private DM only | Collector implemented: latest explicit error records in drive_sync_runs (65-minute window); Supabase atomic event claim and stable LINE retry UUID. OFF until credentials/approval. |
| defect_overdue | Company/approved site group | Not enabled; must reconcile combined rooms and stale completed Work Orders against Defect. |
| po_materials | Company/approved site group | Not enabled; PR/PO and receipts require primary-source evidence. |
| daily_site_report | Company/approved site group | Not enabled; must read native Google Sheet and Form, validate totals, PDF status. |
| weekly_recap | Company/approved site group | Not enabled; requires checked Mon–Fri actuals, Defect, Materials, schedule and pending-Friday marker. |

## Required server bindings
Configure using Cloudflare Workers dashboard > 3kings-line-autopilot > Settings > Variables and Secrets. Never put values in chat, repository or browser.
- LINE_CHANNEL_SECRET — LINE OA Messaging API webhook signature key, keep existing channel intact.
- LINE_CHANNEL_ACCESS_TOKEN — verified OA push-message token.
- LINE_OWNER_USER_ID — verified user ID (U + 32 hexadecimal digits).
- LINE_MAIN_GROUP_ID — verified company group ID (C + 32 hexadecimal digits).
- LINE_BOT_DESTINATION_ID — optional expected bot destination.
- SUPABASE_URL — https://wtqubwdduzedmcvyhbgs.supabase.co
- SUPABASE_SERVER_KEY — privileged, strictly server-side secret. Requires controlled Worker security and further least-privilege review.
- AUTOPILOT_ENABLED — currently plain-text false. Only set true after all prerequisites and explicit approval.

## Go-live blocks
1. Preserve the current LINE Developers Webhook URL to expired n8n Cloud until a verified cutover decision. It may host unrelated features.
2. Verify publicly accessible health endpoint and signed LINE webhook (missing/invalid signature blocked).
3. Obtain and store secrets and approved private/group IDs without disclosing them in ChatGPT.
4. Implement genuine source collectors and SOP Gate for all 4 unfinished notification categories; no fabricated status, dates, PO, receipt or source success.
5. Verify owner DM and approved group delivery, Supabase ledger readback, stable retry key and LINE monthly quota.
6. Only then approve changing LINE Developers webhook; outbound-only LINE Push may not need any webhook change.
7. Check hourly Cron execution and source freshness before claiming Production success.

Rollback: set AUTOPILOT_ENABLED=false first; then disable only this Worker's Cron if necessary. Do not touch 3kings-i18n-qa, existing n8n flows, Data... folders, Labour, Payroll, or old Defect/Materials sheets.

Current status: Cloudflare deployment and Supabase isolated migration verified; LINE secret, recipients, live sends and HTTP E2E not yet verified.

## Approved group onboarding (prepared, disabled)
- LINE OA group IDs do not come from a group name or bot token. A group message to the actual Messaging API webhook contains source.groupId.
- The signed webhook receiver can collect candidates only when LINE_GROUP_DISCOVERY_ENABLED=true, and only after independently verifying membership using LINE GET /v2/bot/group/{groupId}/summary.
- Stores groupId and verified groupName as **unapproved** candidates in private line_autopilot.group_candidates, RLS/service_role only. This does not enable LINE sending or auto-approve groups.
- To populate, LINE Developers webhook must temporarily or permanently point to this Worker, then a message must be sent in the approved company group. Since n8n URL might have unrelated automations, **do not change it until the user explicitly approves cutover**.
- Verify candidate name with user, approve specific group, store LINE_MAIN_GROUP_ID as a Worker Secret. Never infer or auto-fallback to another group.
- Candidate capture and active notification sending are independent: AUTOPILOT_ENABLED stays false during discovery.
