# 3 Kings Daily Site Report → LINE AutoPilot: operator bridge (2026-10-19)

**Scope:** points 1–3 only, no new LINE group links/approvals; no change to Defect, payroll or other notifications.
**Source of truth:** Always read current `00-SOP_INDEX - 3Kings Construction` and the linked complete Daily Site Report SOP before any document write.
**Canonical Drive files remain private.** The Supabase bridge contains short-lived derived copies of PNGs only; this does not change Master Google Sheets or Drive file IDs.

## After owner manually says “ทำ Daily Site Report ตามเดิม”

1. Execute full latest SOP: Form rows, monthly native Sheet, PDF 4 pages, PNG 4 images.
2. Read back the **final** PDF/PNGs from the target date folder, verify source work-date, all rows, PDF layout, PNG widths, crop, no signatures, fonts, Drive file IDs and checksums. If anything is missing, **do not stage and do not send**.
3. For each of four canonical PNG sites `above_villa`, `above_condo`, `mirage`, `henessy`, use the authorized server-side Supabase connection to call `public.daily_line_stage_asset(report_date,site,drive_file_id,png_base64,sha256)`. Read back `STAGED_READBACK`; never write a guessed hash or claim Drive verification without actual re-read.
4. Only after all four assets are staged and read back, call `public.daily_line_finalize(report_date,pdf_file_id,pdf_sha256,completed_at,qa)`. The `qa` object must have independently verified booleans including `sopIndexRead`, `sopV13Read`, `sourceFresh`, `formRowsReconciled`, `monthlySheetVerified`, `sheetFormulaPreserved`, `pdf4PagesVerified`, `pdfA4LandscapeVerified`, `driveReadbackVerified`, `png4Verified`. Use the real manual completion timestamp in Asia/Bangkok, never manufacture proof.
5. Read `public.daily_line_ready(report_date)` and verify all four checksum/dimension records. **Do not directly push LINE from ChatGPT or bypass server routing.** The isolated Cloudflare worker uses its own gateway and immutable claims.
6. The image gateway is Supabase Edge Function `kings_daily_line_images`. `GET /ready` requires an existing server credential; each `/image` URL is HMAC-signed and expires after seven days. No public Drive sharing. Image must stay no larger than 1 MB.
7. The dedicated Worker cron `*/2 1-5 * * 1-6` (UTC) checks every two minutes during 08:00–12:59 Bangkok, Mon–Sat. Monday chooses Saturday; Sunday never sends. It sends Form text **before** PNG and requires the previous stage to have LINE ACK. Uses the existing atomic `line_autopilot_claim/ack` and separate `line_autopilot.daily_delivery_detail`, with stable retry keys and no blind resend.
8. Existing discovered routes: Above Villa, Above Condo A, Above Condo B. Their `approved` and `delivery_enabled` flags are deliberately **unchanged and currently false**. No Mirage/Henessy groups created; both remain BLOCKED until independently authorized. New sender flag `DAILY_SITE_LINE_ENABLED` is separate from the older `AUTOPILOT_ENABLED=false`.
9. If a dependency fails, report BLOCKED with source and downstream status; never infer message delivery from an attempted HTTP request. Preserve the original Delivery Log and original Worker webhook. Read back database and Worker settings after any change.

## What has actually been verified

- SOP v1.3 read from live Drive; production files for Saturday 17 Oct inspected.
- Four Oct 17 PNG images staged in private Supabase table (1,271,705 bytes), SQL SHA-256 readback 4/4, and manifest `QA_FINALIZED`; this is a **historical E2E storage test**, not permission to send that date.
- `anon` and `authenticated` cannot execute the bridge's image read/stage routines. Only `service_role` can.
- New Edge Function deployed active, existing Worker content updated in place with bindings preserved, both Cron expressions read back, older Worker `AUTOPILOT_ENABLED=false` preserved, separate daily flag enabled.
- Live Internet round-trip to `/ready` and the signed `/image` link has **not** been confirmed by an authenticated external HTTP probe; CI mock/test success is not E2E.
- No LINE group approvals, no LINE message sends, and no change to unrelated workloads.

## Manual QA / rollback

- Worker diagnostic path: `https://3kings-line-autopilot.p-kraiwit2614.workers.dev/daily-line/health` (does not transmit messages). Expected `gateway_http_status=200` and `gateway=true` when the report was finalized this morning.
- If the gateway health indicates 401, check whether the Worker has a modern `sb_secret_` key and the Edge Function has the matching secret in `SUPABASE_SECRET_KEYS`. Do not disclose keys in logs or chat.
- If a production anomaly appears, turn off only `DAILY_SITE_LINE_ENABLED` and remove only the extra 2-minute Cron; retain the older hourly Cron, LINE webhook, RLS and all existing records.
- Do not merge PR #164 or enable any specific group until current-head CI and real signed HTTPS image readback pass and site routing is authorized.
