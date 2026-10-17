# LINE AutoPilot for 3 Kings — webhook stage 1 (preview branch)

Created 16 October 2026. This branch installs **only a signed receiver** and a **fail-closed routing helper**. It DOES NOT connect a real LINE OA, send any message, register user/group IDs, change or replace the current company webhook, modify Defect, Payroll or sync, or deploy to Production.

## Reusing the existing company LINE account

The company LINE must be a LINE Official Account with Messaging API. A normal personal LINE profile or LINE group is not itself a Messaging API channel.

A Messaging API channel supports **only one webhook URL**. If another chatbot/CRM currently uses its webhook, preserve that integration first; do not replace the configured URL. If group IDs can be obtained safely from the current channel owner, outgoing notifications can potentially use the same token without changing the existing webhook.

The owner must add the company OA as a LINE friend to receive private alerts. Project groups must separately invite the OA (LINE allows only one OA per group). The user/group IDs must be captured from a verified webhook and approved; a group name is not an ID.

## Files

- app/api/line/webhook/route.ts: HMAC-SHA256 verification on the unmodified HTTP body, fail closed on missing secret or wrong signature; LINE test-webhook event array of zero events is accepted after verification. No raw payload, secrets, IDs or messages logged.
- lib/lineAutopilotSecurity.ts: system -> owner only; management -> approved main group; site -> approved exact project group only. No recipient fallbacks.
- tests/line-autopilot-webhook.test.cjs: security checks for signature tampering and strict routing.

## Future Vercel server-only environment configuration

- LINE_CHANNEL_SECRET: required inbound webhook secret
- LINE_BOT_DESTINATION_ID: optional but recommended matching LINE bot destination
- LINE_CHANNEL_ACCESS_TOKEN: future outbound sender token; NOT used by receiver
- LINE_OWNER_USER_ID: owner's private LINE user ID
- LINE_GROUP_MAIN_ID: main operations group
- LINE_SITE_GROUPS_JSON: approved site-to-group map. Do not invent or guess IDs.

## Remaining integration steps

1. Confirm company LINE OA status and whether it has an existing webhook, chatbot, provider or customer support integration.
2. Confirm the chosen HTTPS URL is reachable from LINE without Vercel deployment-protection SSO; do not disable protection for the whole Web App as a shortcut.
3. Store channel credentials only in approved server-side environment variables, never in GitHub, chat, local files or frontend.
4. Add secure admin enrollment of user/group IDs, reliable persistence, idempotent alert queue, LINE push sender, rate/quota handling and per-project routing from verified project codes.
5. Confirm existing OA replies and all 3 Kings permission and data sync flows are unaffected.
6. Run unit tests, Preview build, LINE Verify and actual private/group message tests; separately authorize Production cutover.

Official LINE references:
- https://developers.line.biz/en/docs/messaging-api/building-bot/
- https://developers.line.biz/en/docs/messaging-api/group-chats/
- https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- https://developers.line.biz/en/tips/2026/07/23/using-multiple-api-tools/

## Phase 2 configuration — confirmed 17 October 2026

**User-approved notification scope: exactly five alert types.** No notification types outside the matrix below may be enabled without a new request.

| Alert kind | Audience | When eligible | Required evidence |
|---|---|---|---|
| sync_failure | Owner's private LINE only | Verified failed sync, never mere completed script or no-change run | SOP ตรวจ Sync, Drive source revisions + Sync Log + DB readback |
| defect_overdue | Main group, or explicitly mapped site group | Real overdue work older than 7 Bangkok calendar days, with Combine/connecting room and closed job reconciliation | SOP ตรวจ Defect 7 วัน + Defect, Work Order and hotel evidence |
| po_materials | Main group, or explicitly mapped site group | Verified PR/PO/material outstanding state, vendor and receipt evidence if claiming received | SOP เช็ก PO + 5-Purchase/PO/receipts |
| daily_site_report | Main group, or explicitly mapped site group | Verified Form-to-native-Sheet totals; PDF status must be separately verified | Original SOP ทำ Daily Site Report, source Form, native Sheets, final PDF when available |
| weekly_recap | Main group, or explicitly mapped site group | Verified Mon–Fri actual data. If Friday morning, label Friday actual pending until received | SOP สรุป Weekly Recap, daily reports, schedule, defects, materials |

No "every successful sync" alerts. Technical/security alerts MUST NOT enter project groups. Unknown site-scoped target is BLOCKED with no fallback to main group. Main-group summary is explicitly sent to the approved company group.

### Implemented in this preview branch

- lib/lineAutoPilotNotifications.ts: five-type allowlist, pinned SOP IDs, source evidence preflight, exact owner/group/site routing, deterministic event key.
- lib/lineAutoPilotDelivery.ts: sender adapter disabled by default. It requires a durable atomic claim ledger and stable LINE retry UUID. Timeouts/uncertain LINE responses never count as delivered.
- tests/line-autopilot-five-types.test.cjs: mock-transport and fail-closed tests without real LINE calls.
- Receiver remains signature-verified, receiver-only; CI and other operations remain intact.

Source verification flags must be produced by a REVIEWED server-side collector/Gate; do not accept browser/client-supplied flags as authorization. The SOP Gate architecture in Drive remains DESIGN ONLY. This branch is NOT an installed runtime SOP Gate.

### Proposed cadence (NOT INSTALLED)

- sync_failure: after confirmed error and source check, owner only
- defect_overdue: morning digest if actual verified actionable cases exist
- po_materials: morning digest if documented pending items exist
- daily_site_report: after Form, native Sheet, and PDF state inspection
- weekly_recap: Friday morning preliminary with Friday Actual expressly pending when unavailable; full weekly recap only after all actual daily reports verified

Before installing Cron check Vercel plan: Hobby Cron supports at most once per day and does not guarantee precise execution. Do not install duplicate Google Apps Script triggers or extra Apps Script properties. A ChatGPT scheduled task does not automatically relay to LINE.

### HARD BLOCKS before real activation

1. Confirm existing 3 Kings company LINE is an OA with Messaging API; identify current live webhook owner and preserve existing CRM/chatbot routes; do not rotate secrets blindly.
2. Obtain owner's private LINE user ID and approved group IDs via verified events or already approved integration. The owner must add OA as a friend, and OA must be a member of each destination group.
3. Store channel credentials exclusively in server environment variables; never in chat, browser or source control. Server-only secrets: LINE_CHANNEL_SECRET for webhook, LINE_CHANNEL_ACCESS_TOKEN for outgoing, optional LINE_BOT_DESTINATION_ID; approved private/group routing IDs.
4. Implement persistent database delivery ledger with atomic claim, retry and audit, plus LINE quota checks. Retry uncertainty MUST reuse the same LINE Retry Key; no in-memory-only de-dup.
5. Implement source-backed read-only collectors for five alert types and server-side SOP Gate, pinned revision readback and evidence-based FAIL/WARN/PASS.
6. Solve LINE webhook HTTPS reachability without globally disabling Vercel SSO/Deployment Protection.
7. Run LINE Verify, owner private message, main group, approved site group, CI and production regressions before separately approved Production deployment.

**Current state:** no live LINE send; no source, DB, Trigger, payroll or Production changes were made by this PR.