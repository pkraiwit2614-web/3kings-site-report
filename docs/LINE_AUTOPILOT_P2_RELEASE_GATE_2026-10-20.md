# P2 Release Gate — Consolidated LINE AutoPilot PR #188
**Review date:** 2026-10-20 (Asia/Bangkok). **Verdict:** HOLD MERGE/DEPLOY pending real publisher-to-asset-to-LINE evidence and SOP contract reconciliation. This document records a read-only release review and proposed staged fixes, not a source of truth, permission grant, deploy instruction or automated scheduler.

## Baselines from connected production (read-only)
- GitHub main: `af0061f22cb8da4223caa857ba5ed1622eab5fef`. Vercel Production was READY on that SHA when checked; no PR #188 merge occurred.
- The live Cloudflare Worker is `3kings-line-autopilot`, deployment `30726a2c-b92d-48cd-858e-d4ab055dbadc`; its schedules are `0 * * * *` and `*/2 1-5 * * 1-6` (UTC). The live Worker, configured LINE OA webhook, secrets, and Cron are **not modified** by this PR.
- Supabase project `wtqubwdduzedmcvyhbgs` has the active `kings_daily_line_images` Edge Function v4, delivery ledger, PDF/PNG staging tables and the three owner-approved daily routes. No SQL migration or Edge redeployment in this PR.
- Historical 19 Oct delivery in `line_autopilot.deliveries`: 5 accepted with HTTP 200, 1 image for Above Condo B marked **uncertain (HTTP 429)**. No automatic replay or status rewrite is permitted.

## Publisher → Drive → Gateway readback (PARTIAL PASS, FULL E2E UNTESTED)
- The authoritative Form native Sheet is `Daily Site Report Entry (การตอบกลับ)` (file ID `1-ZSZXulxaje4vDP1ztvUBXsjlmffjAcDu0w1OHRnpUw`), and the target is the native `Daily Report - Oct 26` (ID `1z57u9sJEDtEAsSORONGRaeNDmUvhS6dw2YkVCv2ovhQ`), not the distinct .xlsx file.
- The target has date tab `201026`; this does **not** prove a published PDF/PNG for report date 20 Oct. There was not yet a `20102026` child folder under the canonical October root as of this evening's read-only audit.
- **CORRECTION AFTER DIRECT FILE-ID READBACK:** An initial Google Drive folder search incorrectly omitted image results and suggested that folders `17102026` and `19102026` contained only PDFs. The four PNG files for EACH date were subsequently found by their authoritative Supabase `daily_report_assets.drive_file_id` via Google Drive `get_file_metadata`: all eight are `image/png`, with matching standard filename, Drive parent folder for that exact date, and byte-size equal to the stored Supabase PNG. The claim that these PNGs were missing was false and is withdrawn.
- Historical PNG **existence/parent/name/size** readback PASSED. The independent PNG byte SHA256/pixel-to-PDF crop/font comparison was not repeated during this audit; do not upgrade the historical comparison to a new image-content E2E PASS.
- The separate ChatGPT automation `3 Kings Daily AutoFlow` is enabled for 07:45 Asia/Bangkok beginning **21 Oct 2026**, following the ACTIVE SOP EX v2.0 then SUP-PUBLISH v2.0 and only staging verified assets to the existing gateway; it had **not run for the first time** as of this review. The 20 Oct PDF/PNG and the complete fresh Form→Sheet→Drive→Gateway execution remain UNTESTED until the first real run readback.

## ACTIVE SOP ↔ deployed PostgreSQL finalize gate mismatch (RELEASE BLOCKER)
- Drive SOP_INDEX lists SOP EX v2.0 (native monthly Sheet only) and SOP SUP-PUBLISH v2.0 (PDF 4 A4 landscape pages, PNG four images, same Drive daily folder).
- Live `public.daily_line_finalize(date,text,text,timestamptz,jsonb)` references legacy evidence tokens `sopSheetsV14Read` and `sopPublishV1Read` (historical `sopV13Read` for old dates), not `sopSheetsV2Read` / `sopPublishV2Read` required by the current branch offline verification.
- Do **not** send counterfeit legacy-SOP evidence or change the live function. Prepare a separately reviewed additive/fail-closed migration with date/revision compatibility and rollback, then validate on isolated Supabase Local; production DB changes require an independently authorized release gate.
- Confirm 4 verified source PNGs, correct SHA256, 2947px width with proportional crop, file IDs, same-day completedAt, approved routes and mutually consistent reportDate before asserting `READY_FOR_LINE`.

## Preventing duplicate or out-of-order LINE sends
- The original deployed Worker sent FORM text and PNG together in a single LINE API push. The explicitly requested new P2 branch behavior changes the proposed sender to **FORM text → provider accepted → database ACK → subsequent Worker tick PNG**.
- The new branch-only implementation holds any `in_flight` / `uncertain` stage rather than reattempting automatically at 08:12/08:32/etc., and similarly holds uncertain owner DM. Provider/recipient reconciliation must precede any manually authorized resend. This change is **not deployed**, and therefore is not yet parity-tested against the real Cloudflare runtime.
- Exact per-group/date/stage event key and stable retry key, route approvals, quota, image signing, 409 accepted-request evidence, owner-only aggregated status, and the split Condo A/B destination policy remain protected. Previously accepted stages must never be duplicated.

## Release gates and evidence
| Gate | Required before Merge/Deploy | Status now |
|---|---|---|
| GitHub branch/mergeability/mandatory build | exact PR HEAD, no unrelated files, green Actions after last code change | RECHECK AFTER P2 PATCH |
| Worker code package / HMAC / sender order | build/Node synthetic no-send and Cloudflare module compatibility | MOCK QA RECHECK; REAL HOST UNTESTED |
| Daily Form → Native Sheet | source rows, actual work date, preserved formulas, readback | SOURCE PRESENT; RUN-E2E UNTESTED |
| Native Sheet → PDF 4 pages → PNG 4 images in Drive | correct 4 pages/image content, crop, SHA, Drive file IDs | PARTIAL PASS: historical 17/19 Oct have 4 PNGs each, matching parent/name/size; fresh 20 Oct run/byte SHA/image QA UNTESTED |
| SOP v2 evidence → `daily_line_finalize` → `ready` | server-side acceptance under current ACTIVE v2, no legacy spoofing | HOLD: live gate recognizes older tokens |
| Line group send | provider ACK for text before image; no uncertain auto-retry; durable idempotency | MOCK ONLY; LIVE NOT RUN |
| Daily 07:45 automated run | actual next-run readback, no new sender or Cron, private owner summary | UNTESTED: first run 21 Oct |
| Production exact SHA, Worker version, rollback | deliberate release and readback | NOT AUTHORIZED IN THIS PR |

**Decision:** maintain PR #188 as **Draft** and DO NOT merge/deploy or alter production. The blocker is current v2 Publisher Gate incompatibility plus missing fresh automated E2E evidence, **not** missing historical PNGs. Reuse original GitHub CI when exact SHA matches, run only targeted tests after any changed SHA. Follow-up should reconcile publisher automation, server SOP gate, actual readback and Cloudflare Worker compatibility without blind LINE sends. Close PR #139 and #164 only after a later verified consolidated release.
