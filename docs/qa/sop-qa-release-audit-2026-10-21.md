# 3 Kings QA / Release Gate surgical audit — 21 Oct 2026

**Scope:** documentation, CI report labeling and regression only. No business app code, required-check ruleset, Supabase, Vercel project settings, Apps Script, LINE, Defect data, Source of Truth, or Production deployment is changed by this PR.

## Verified facts (live, read-only)
- Google Drive LIVE SOP INDEX has all 21 v2.0 entries ACTIVE. SOP 15/16 already say GitHub affected QA first; hosted Vercel only for scoped gaps CI/Local cannot prove; reuse evidence only with equivalent exact SHA, source, config, dependencies, schema, role and environment.
- GitHub main's enforced ruleset `3Kings Main Protection` requires the first-party `build` check. Other QA jobs are useful evidence, but they are **not** a blanket main required-status-check in that ruleset. Do not confuse skipped/non-required checks with a passed required check.
- `vercel.json` points to `scripts/vercel-preview-gate.cjs`; Vercel Production builds remain allowed; automatic PR previews skip by default, with a branch+exact-SHA exception for authorized hosted-only evidence. The on-demand Hosted QA workflow takes an **existing** exact deployment URL: it does not create a Vercel deployment.
- The `scripts/preview-qa-status.mjs` PR-mode summary formerly stated `BLOCK_VERCEL_PREVIEW_NOT_VERIFIED_BY_PR` **even with green Build/Preview-contract/local RLS tests**. That message is incorrect as a universal requirement. The summary job is not a substitute for SOP16 release authorization.
- The connected Vercel Production deployment was READY at commit `2d6e9da9c7013f182b94f5d0e67019666bb4c54c` when audited; READY status alone does not prove user-visible business functions.

## Surgical change in this PR
1. `scripts/preview-qa-status.mjs`: Green PR-local QA now reports `NOT_EVALUATED_SOP16_RELEASE_GATE`, not a blanket hosted-Preview blocker; explicitly states the risk-based hosted-only decision and the separate exact-SHA production readback gate. Failed or skipped **expected** local checks still block their QA classification.
2. `tests/preview-qa-status.test.mjs`: Assert the new separation and preserve fail-closed SKIPPED/BLOCK assertions.
3. `.github/workflows/ci.yml`: Rename an informational QA job to stop claiming Preview is always necessary. **No job conditions, secrets, permissions, test commands or required check names changed.**

## SOP 01 / 13 — avoid duplicate work without reducing E2E evidence
- Perform SOP INDEX + both relevant full SOP reads **once per invocation**, and share one verified `(source ID, revision, timestamp, permission, parser/room/work identity)` snapshot. Do not call SOP13 as a separate command solely to QA a scoped SOP01 write.
- Before write, check row-level web override/writeback queue and current authoritative revision. Quarantine only conflicting Room/Work IDs, including their Combine-linked counterpart when applicable. Preserve the existing XLSX part/formula/ID protections.
- After a write, create one scoped receipt: `source→original XLSX readback→sync execution/log→Supabase row→Flow/Report/Work Order UI`; reuse unchanged evidence only within matching source/revision/config. A finished Trigger or dry-run is never a sync PASS.
- Do not run GitHub CI/Vercel Preview for a plain data edit. Do not turn a read-only `ตรวจ Sync` request into a write.

## EX / SUP-PUBLISH — independent stage receipts and resume behavior
- `ทำ Daily Site Report ตามเดิม` (unless explicitly `Google Sheets Only`) means **Form delta/backfill → native Sheets per reporting date with formula/row readback → print-copy layout QA → four-page native-derived PDF QA → four PNG QA → Google Drive file-ID/readback** for changed dates.
- State machine per report date: `SHEETS_VERIFIED → PDF_VERIFIED → PNG_VERIFIED → DRIVE_VERIFIED/READY`. Preserve previously verified artifacts when the source revision and content hash are unchanged; invalidate only a dependent stage when its input changes.
- If PDF layout is invalid, fix only print copy and regenerate that PDF and dependent PNGs; don't re-import unchanged Form rows. If a single PNG failed upload/readback, repair that PNG only if its PDF/source proof remains valid. Never send LINE as part of this document QA command.
- Keep publisher completion separate from LINE Delivery (Owner-only, idempotent, no resend for uncertain/429, do not change schedules/routes/webhooks). Do not assert production publisher synchronization merely from this document.

## Actual follow-up gates — NOT bypassed
- When a PR modifies Auth/RBAC/RLS, external OAuth callback, hosted routing, production env behavior, or remote integrations that CI/Local cannot prove, require isolated Hosted Preview at the exact PR SHA and affected-route QA.
- A missing Hosted URL after an intentional Vercel ignored build is **not a product test failure**. If hosted-only proof is necessary, use the already-specified owner-authorized branch+SHA exception, verify READY/deployment identity, run targeted QA, and revoke the exception. Real permissions/quota/SSO issues remain HOLD.
- Required `build` always needs its real passing conclusion; neither `SKIPPED` nor a green informational QA summary can bypass GitHub's ruleset.
- No Merge/Production deployment from this PR. Before any authorized release, verify intended diff, required status, hosted gap if any, main-versus-Production commits, and readback of deployed SHA plus affected feature, login and role boundaries.

## Blast radius
CI display and release-evidence classification only. No change to actual CI execution conditions or app behavior, Defect/Combine/OOO, Materials/Express, Daily/Publisher/LINE executors, Payroll, Calendar, print, locales, Auth/RBAC/RLS, XLSX sync, triggers, or credentials.

## QA plan
- GitHub Actions required `build` at this PR head: must actually PASS; run unit coverage including `tests/preview-qa-status.test.mjs`.
- Check commit diff is confined to these files and this audit.
- Hosted Preview: `NOT REQUIRED` for this CI-report-only change, unless CI reveals a newly identified hosted integration dependency.
- This audit and branch do **not** alter the live Google Drive SOPs or the real Vercel settings.
