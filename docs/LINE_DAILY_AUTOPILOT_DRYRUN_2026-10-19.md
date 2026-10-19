# 3 Kings Daily Site Report -> LINE AutoPilot: dry-run/approval gate

**Checked:** 2026-10-19, Asia/Bangkok. **Mode:** STAGED / NO LINE SEND.
This is an isolated preflight engine, NOT an installed scheduler, Apps Script
trigger, PNG renderer, Supabase schema migration, approved site route, or a live
LINE integration. It never calls LINE. Do not report an E2E or Production PASS.

## Source of truth / preflight
- Google Drive 00-SOP_INDEX (latest read 2026-10-19).
- Linked `SOP_Daily_Site_Report_GSheets_PDF_PNG_v1.3_2026-10-19.md`
  (Drive file revision modified 2026-10-19).
- Form Responses: `Daily Site Report Entry (การตอบกลับ)`, native,
  tab `การตอบแบบฟอร์ม 1`, 13 populated header columns.
- Monthly master: `Daily Report - Oct 26`, **native** Sheet, not `.xlsx`.
  Its document time zone is currently `America/Los_Angeles`; ALWAYS select
  report date using `Asia/Bangkok` and source work-date values, not the
  spreadsheet's default timezone.
- Supabase `line_autopilot` has `group_candidates`, `site_group_routes`,
  `site_notification_rules`; their current delivery flags are OFF.
- Cloudflare script `3kings-line-autopilot` has an existing hourly UTC
  schedule `0 * * * *` and `AUTOPILOT_ENABLED=false`. DO NOT replace, edit,
  or reuse that script's cron to run Daily Reports while the E2E preflight
  is incomplete.
- Independent daily-site Supabase importer Apps Script installation/triggers
  were **not verified**; GitHub script file is not evidence of GAS installation.

## Scheduled local-time stages (not installed)
| Bangkok | UTC (Cloudflare schedule) | Action | Precondition |
|---|---|---|---|
| 07:30 | 00:30 | Process yesterday, rerun the current SOP and prepare PDF/4 PNG | Fresh form and monthly native sheet, confirmed executor access |
| 07:50 | 00:50 | Per-site QA, preserve valid sites | Latest final 4-page A4 landscape PDF and 4 images read back from Drive |
| 08:00 | 01:00 | Send form text FIRST per allowed group | Signed owner approval, group mapping, durable claim, LINE send feature gate |
| 08:02 | 01:02 | Send matching image only after text ACK | Site-specific QA PASS, correct approved group, HTTPS expiring image URL |
| 08:05 | 01:05 | Persist separate per-site delivery log; owner-only status | Server readback/ACK, never infer success from push attempts |

Text must be exactly:
`ฟอร์มสำหรับกรอก รายงานหน้างานประจำวัน`
then `https://forms.gle/UDTk8uxG3iwQaW5y8`.

SOP page mapping (fixed): Above Villa=Page_01_Above_Villa;
Above Condo=Page_02_Above_Condo; Mirage=Page_03_Mirage;
Henessy=Page_04_Henessy (filename spelled **Henessy** by SOP).
PNG must originate from latest PDF vector crop (header through notes,
no signature), 2947 px wide, variable aspect-preserving height; QA ratio
error <0.003 and X/Y uniform scale. Preserve 4 pages even zero entries.

## Actual Drive read-only evidence (not an E2E PNG QA)
- 2026-10-17 folder: last PDF plus all 4 named PNG assets exist.
- 2026-10-19 folder: PDF plus all 4 named PNG assets exist.
- 2026-10-18: no daily folder/PDF/PNG found within October 2026;
  do not borrow 17th or 19th's image to fill the gap.
- Presence/file size is NOT proof of image dimensions, crop, font,
  exact source-row parity or PDF checksum. Mark those UNTESTED.

## Actual group routing read-only evidence
| Site route in DB | Candidate verified | Candidate approved | Route enabled | Daily rule enabled |
|---|---|---|---|---|
| `above_villa` | Yes | No | No | No |
| `above_condo_a` | Yes | No | No | No |
| `above_condo_b` | Yes | No | No | No |
| `mirage` | Not mapped | No | No | No |
| `henessy` / Hennessy | Not mapped | No | No | No |

Condo is ONE combined PNG but TWO routes (A and B). Do not assume
it is permitted to broadcast a combined A+B report to both groups.
Each route must explicitly specify its approved report page; if uncertain,
block that route only. Reject a single group mapped to conflicting pages.

## Current branch scope
- `lib/dailyLineAutopilotCore.cjs` computes yesterday in Bangkok time,
  checks SOP/data/asset/PNG QA proof, verifies explicit candidate and
  per-site destination gates, rejects duplicates, emits masked per-site
  dry-run delivery records and SHA-256 dedupe keys. Network sends = zero.
- `tests/daily-line-autopilot.test.cjs` tests time/date, exact filenames,
  missing data, disabled route, split-Condo approval, duplicates,
  aspect ratio, uniform scaling, and dry-run no-send behavior.
- `.github/workflows/daily-line-autopilot.yml` runs those tests for PR.
- No shared application UI/components, Defect/Materials/Payroll,
  Supabase schema, Google Sheets/Drive data, existing Worker,
  secrets, or Triggers were modified.

## Strict conditions before further rollout
1. Confirm trusted execution path capable of reading latest SOP/Drive,
   modifying only the native monthly sheet as allowed, PDF generating,
   Drive PNG upload/readback and producing unforgeable QA manifest.
2. Validate the *real* Form->native Sheet->PDF->PNG for each site in
   staging; simulate 07:30-08:05 on real read-only evidence while
   recording blocked sites separately.
3. Approve the A/B Condo shared-image routing policy; discover/verify
   Mirage/Hennessy Group IDs and route eligibility; keep existing
   `approved=false` until explicit owner approval.
4. Provide server-owned durable delivery ledger with uniqueness constraint
   on report date+site+group+stage, atomic claim and fixed retry key;
   only acknowledged text allows image; ambiguous ACK must not blind-resend.
5. For LINE images, use authorized HTTPS URLs with narrowly scoped expiry
   and no public Drive sharing; confirm LINE can retrieve them before enabling.
6. Add a **separate** isolated scheduler after full E2E QA, avoiding edits
   to the existing hourly Worker cron and Apps Script triggers.
7. Before live dispatch require explicit new Owner approval, server-side
   `LINE_DAILY_SEND_ENABLED` OFF->ON and per-site allowlist; provide
   independent emergency kill switch default OFF; test user rights.
8. Perform readback for actual scheduler execution, produced images,
   route choices, delivery logs, LINE response/message IDs and owner-only
   system reports. Stop on discrepancies.

## Delivery ledger expected schema
- report_date (Bangkok ISO date), site_code, route_code, group_id,
  filename, stage(text/image), attempted_at, delivered_at,
  status(BLOCKED/READY/PENDING/SENT/UNCERTAIN), LINE message_id,
  fixed retry_key, error_code, pdf_sha256 and png_sha256,
  source_revision, qa_manifest_hash.
- For public reports and PR output, MASK group IDs and never include tokens.
- Daily summary to Owner only; no LINE messaging of any kind in dry-run.

**Current decision:** Do not deploy sending, do not install a live cron, and
do not mark E2E PASS until missing executor, verified route approval,
source-row parity, image QA and atomic delivery ledger have been checked.
