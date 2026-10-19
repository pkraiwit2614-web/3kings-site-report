# Daily Site Report → LINE AutoPilot: verified manual publishing handoff

**Revision: 2026-10-19. Scope:** only Above Villa / Above Condo A / Above Condo B. No Mirage/Henessy live routing, and no unrelated notifications.

## Live SOPs (MUST read before each write)
- Google Drive **00-SOP_INDEX - 3Kings Construction** is authoritative.
- `ทำ Daily Site Report ตามเดิม`: **SOP v1.4 (Google Sheets ONLY)**. Form → native monthly Sheet, delta upsert and readback. This command alone DOES NOT publish PDF/PNG or send LINE.
- `เผยแพร่ Daily Site Report PDF/PNG`: **SOP SUP-PUBLISH v1.0**, separately ordered. Native Sheets QA → PDF 4 A4 landscape pages → 4 correct PNG (2947 px width, height from actual crop) → same Drive day folder → full source/pixel/Drive QA.
- For the requested same-chat manual workflow use **both** operations explicitly: `ทำ Daily Site Report ตามเดิม แล้วเผยแพร่ Daily Site Report PDF/PNG เพื่อส่ง LINE AutoPilot`. Do not imply the short Sheets-only command triggers publishing without an additional explicit owner request.

## Manual operator bridge after publisher QA (no LINE push in chat)
1. Validate SOP INDEX and the two latest full SOPs, Form source work-date, native sheet rows/formulas, PDF A4 landscape 4 pages and all 4 PNGs. Verify Drive readback with exact file IDs and SHA-256, work date selection in Asia/Bangkok, no stale filename match. The 4 image pages are required even though only 3 LINE groups have verified routes.
2. Stage the **4 actual Drive PNGs**, one by one, using the existing service-role-only `public.daily_line_stage_asset(report_date,site,drive_file_id,png_base64,sha256)`. Preserve Drive file IDs and exact images; stop only the affected site if any QA fails.
3. Finalize `public.daily_line_finalize(report_date,pdf_file_id,pdf_sha256,completed_at,qa)` only with truthful checked facts. For reports dated 19 Oct 2026 onward, required QA includes `sopIndexRead`, `sopSheetsV14Read`, `sopPublishV1Read`, `sourceFresh`, `formRowsReconciled`, `monthlySheetVerified`, `sheetFormulaPreserved`, `sheetReadbackVerified`, `pdf4PagesVerified`, `pdfA4LandscapeVerified`, `driveReadbackVerified`, `png4Verified`. No synthetic proof.
4. Read `public.daily_line_ready(report_date)` with service role. `ready=true` only after the same-day (Asia/Bangkok) manual completion and all 4 staged PNGs; never finalize yesterday's files from old cached Drive data. Do not push LINE from GPT; the isolated Worker does that after the gateway confirms ready.
5. Worker `3kings-line-autopilot` retains original LINE webhook and original hourly Cron. A separate UTC `*/2 1-5 * * 1-6` Cron checks Mon–Sat from 08:00 through 12:58 Bangkok. On Mondays it selects Saturday, Sunday never sends. It sends each verified site's Form message first; only after its LINE 2xx ACK it sends its corresponding PNG in a subsequent 2-minute tick. Failures/uncertain LINE replies never get a fresh retry key or duplicate send claim.
6. The Supabase Edge Function `kings_daily_line_images` serves an authenticated manifest and HMAC-signed HTTPS PNGs (48-hour URL expiry). It also provides a **strictly allowlisted** `/rpc` service-to-service bridge. An independent 48-byte random `DAILY_LINE_BRIDGE_TOKEN` is held as a Cloudflare secret; only its SHA-256 is in the Supabase private `line_autopilot.daily_bridge_keys` table. Never print or expose any server key or image URL. Legacy `SUPABASE_SERVER_KEY` is deliberately NOT used for Daily LINE RPCs.
7. Three confirmed routes live only in the private `line_autopilot.daily_live_routes` table with owner-approval time; the original `group_candidates`, `site_group_routes`, `site_notification_rules` and `notification_types` remain STAGED/OFF and their hard false constraints are preserved. Condo A/B both use the single approved `Page_02_Above_Condo` asset. Mirage/Henessy remain without confirmed routes.
8. `line_autopilot.daily_delivery_detail` logs each route/date/stage before `line_autopilot_claim`. Existing `line_autopilot_ack` uses the same event-key/retry-key, preventing duplicate push. Owner delivery summary currently exists only in DB/Worker logs; a separate LINE owner DM is not implemented and must not be claimed.

## Evidence and gating
- Historical 17 Oct PDF and all 4 PNGs staged and checksum-read back; 4/4 width=2947, 1,271,705 total bytes, historical QA manifest available.
- GitHub Actions `LINE AutoPilot live HTTP no-send` checks actual deployed Edge health, 401 on unauthorized ready, 403 on invalid image signature, and Cloudflare → Edge authentication, scoped RPC, signed PNG fetch with SHA-256 verification. These are actual HTTPS reads, **not LINE delivery**.
- The three-group routing, Form-then-image and retry-idempotency tests are synthetic and run without credentials.
- Actual LINE delivery for 20 Oct is **conditional on manually completing Sheets + Publisher + QA staging**. The previous Saturday test manifest is not acceptable for the new report date. If the manual step does not happen or any gate fails, **zero LINE sends**.
- Before claiming live success on 20 Oct, query the database per site and stage, check all LINE ACK statuses and the Worker log; do not equate a 2xx HTTP attempt with confirmed user receipt.

## Rollback and safety
- Disable only the new Cloudflare secret `DAILY_SITE_LINE_ENABLED` or set it to `false`, and disable only the dedicated daily route rows; preserve old Worker webhook, original hourly Cron, all RLS/RBAC and original staged tables.
- All live-scope changes require readback; never enable a source/route solely because SOP or GitHub CI passed.
- Public read-only diagnostic: `https://3kings-line-autopilot.p-kraiwit2614.workers.dev/daily-line/health`, returning only health booleans and HTTP status. Never expose private group IDs or signed asset links here.
