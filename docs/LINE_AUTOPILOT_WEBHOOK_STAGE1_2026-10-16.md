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
