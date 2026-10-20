# 3 Kings Construction — Coding Agent Instructions

This file guides coding agents operating on this repository. It does not grant application permissions or create a technical runtime lock.

## Mandatory 3 Kings SOP routing

Before interpreting any of the 17 standard 3 Kings shortcut commands:
- Read `.agents/skills/3kings-sop-gate/SKILL.md` and `docs/agent-skills/manifest.json`.
- Load the matching `.agents/skills/<name>/SKILL.md`.
- Retrieve the latest SOP INDEX and the current complete SOP document from connected Google Drive before acting. If unavailable, **do not mutate files, database, permissions, Apps Script or deployments**; report the missing verification.
- User instructions for a review or verification do not grant permission to edit or deploy.

## Change safety

- Base work on newest GitHub main, relevant Vercel Production and Supabase sources, as available and appropriate.
- Preserve backwards compatibility and production-critical Defect/Combine, Materials/PR/PO, Daily Reports, Payroll, Calendar, Auth/RLS/RBAC, role reset, XLSX/Drive sync, print layout, and three UI languages.
- Never change code, data or statuses not within the explicitly requested scope. Avoid touching any folder starting `Data`.
- Analyse UI→API→DB→Print→i18n→Roles→Sync blast radius before source change.
- Keep status differences explicit (Actual vs Target vs Schedule vs Unknown). Do not infer successful sync or deployment.
- Run affected-scope regressions. Hosted Preview is conditional on unprovable local/CI integration behavior, not a default gate; Production verification only for authorized releases. Do not deploy based on the presence of skills.
- Never commit private Google Drive document IDs, credentials, access tokens or secrets.

The SOP original in Drive outranks a summary in this repository. Changes to this routing system must be reviewed on a branch; do not silently change application runtime or CI gates.

## Seven guarded Superpowers process Skills

For any of the 17 SOP shortcuts, **first** run the current 3 Kings SOP Gate and open the live current SOP from Drive. Then consult `docs/agent-skills/superpowers-integration.json`; load the relevant `.agents/skills/3kings-sp-*/SKILL.md` adapter and its vendored method. Verification-before-completion applies to all 17; systematic-debugging applies to actual anomalies; planning/worktrees/TDD/code review to authorized app code work; writing-skills only to Skill maintenance.

Vendor methods are subordinate to the real 3 Kings SOP, user scope and RBAC/RLS. A read-only command stays read-only. No auto-installing plugins, bootstraps, hooks, telemetry, subagents or running third-party scripts. No inferred merge/deploy. Repository Agent Skills do not create a server-side SOP enforcement gate or automatically install across ordinary ChatGPT chats.

## Read-only Task Observer (17 skills)

For task-oriented sessions involving any of the 17 SOP shortcuts, complete the **live SOP Gate preflight first**. Then load the numbered Skill and mapped Superpowers methods; also read `.agents/skills/3kings-task-observer/SKILL.md` and `docs/agent-skills/task-observer-integration.json` for **advisory read-only** observation of repeatable corrections, skill gaps and safety/test issues. The observer does not interrupt the user's task, weaken any SOP mode, grant writes, edit live SOP, or deploy. Capture only supported, privacy-safe generalized improvements and stage a reviewable proposal; user-approved low-risk documentation changes may follow the authorized policy without repeated substep approval, but no observer-granted data write or deployment.

Authorized connected coding agents should also read `docs/agent-skills/private-observer-routing.md` and resolve the owner-controlled Drive folder by **names only**, rechecking permissions and actual write/readback each session. This config does not create a global ChatGPT listener or guarantee that a scheduled review can access the connector.

The application repository is public: never commit observation logs, handoffs with private content, raw incident details, secrets or access identifiers. Unless a verified writable **private** observation store is configured, report a user-visible session handoff labeled NOT PERSISTED; do not imply cross-chat memory or automation. GitHub repository instructions support repository-aware agents such as Codex, but **do not auto-install** a Skill or activate a universal listener in ordinary ChatGPT chats. No automatic review schedule or Production/runtime change is created.

## Optional curated quality / reporting Skills

For explicitly authorized quality-review or report-visual tasks, agents may consult `docs/agent-skills/curated-skills.json` and its three `.agents/skills/curated-3kings-*/SKILL.md` adapters **after** all applicable 17-command SOP Gate, live full Drive SOP, numbered Skill, Superpowers and Task Observer requirements. Never substitute these optional methods for mandatory preflight. A missing live SOP blocks writes/deployment regardless of curated guidance.

The curated adapters add domain/PR discipline and report diagram/slide *instructions*; the upstream Matt Pocock, Karpathy, Diagram Design and PPT Master executables/skills are NOT installed by these files. No auto execution, hook, new network/service, self-edit, DB/writeback, skill installation, production deploy or universal ChatGPT activation. Read-only work remains read-only. See `docs/agent-skills/curated-skills-review.md` for impact and QA.


## 2026-10-20 — Single-Command Fast-Track precedence (SOP simplification)
- **Current authority**: resolve the live Google Drive ACTIVE SOP INDEX and complete current SOP document once per user invocation. Never use a hardcoded/previous revision if the index points elsewhere. The INDEX has 17 numbered + four supporting SOP entries.
- **Single authorization**: an explicit user instruction that authorizes a scoped operation and a verified underlying ACL is sufficient for its ordinary substeps (read → scoped write → original sync where applicable → targeted QA/readback). Do not ask for repeated approval or split into a new command merely to run a supporting SOP. Read-only requests remain read-only.
- **Work-type gates**: Drive document/Sheets/Excel/photo rename/Calendar updates and inspections do not require Git branch, CI, Vercel Preview or Production deploy. For changes to code, database schema or runtime config, keep authorized branch, diff, risk-based CI/Preview gates; reuse existing artifacts only if SHA/config/dependencies/schema/environment/role are proven unchanged. Never create redundant builds or claim an absent build was tested.
- **Nonblocking helpers**: load only relevant Superpowers methods when they add value; the Task Observer is advisory and must never block or add a permission round. Reuse one live SOP read and one verified snapshot within the same invocation. Internal preflight is not an extra user approval step.
- **No implicit production changes**: this policy affects agent guidance, not web runtime enforcement, auto-triggering, external permissions, or deployment. Keep all six central safety rules, backend RBAC/RLS and destination readback proof.

## SOP v2.0 Consolidated activation and risk-based execution
- The live Google Drive INDEX is authoritative for **all 21 entries** (17 core + EX, SUP-PR, SUP-VO, SUP-PUBLISH). The 21 v2.0 documents are not authoritative until INDEX explicitly marks them ACTIVE; do not select STAGING solely because the GitHub manifest lists their titles.
- One explicit scoped instruction with verified effective ACL authorizes ordinary internal substeps, downstream supporting SOPs and bounded readback. Read-only shortcuts never gain write permissions. Independently conflicting items are quarantined while safe items proceed.
- Classify work as read-only / document-only / scoped data write / code change / Production release / critical permissions-schema-payroll. No Git CI/Preview for routine documents or data; run GitHub affected QA for code and use Hosted Preview only when necessary. Do not waive actual required branch protection or RLS. Evidence reuse requires exact SHA, config, dependencies, schema, environment, role and source revision match.
- SOP/Skill improvements may be proposed from evidence and promoted automatically only in explicitly pre-authorized low-risk editorial scope with source readback and index-mapping validation; changes to safety policy, RBAC/RLS, Payroll, schema, Source of Truth or Production require risk-specific authorization. No unattended autonomous service exists merely by committing these documents.
- After verifying the new 21-row ACTIVE INDEX and all links, archive superseded copies; never archive before an independently verified activation. Do not touch any unrelated subsystem.

## Preview QA execution preference — GitHub Actions first (2026-10-20)
- Continue code edits on review branches and keep normal PR CI `build`/regression checks. Do **not** treat every PR as requiring a Vercel Preview deployment.
- When rendered UI QA is needed, first use GitHub Actions `Supabase Local Viewer E2E (no hosted DB)` through `workflow_dispatch` on the intended ref; review its synthetic-data screenshots and test logs. Its ephemeral localhost server is a **test Preview**, not a hosted public Preview URL or Production parity.
- Require a separately authorized hosted Preview only for tests that cannot be proved locally (e.g., hosted OAuth/cookies, real deployment edge behavior, remote integrations, actual Vercel routing). Document why before temporarily enabling a hosted Preview. Do not weaken Preview/release gates when a hosted deployment is truly needed.
- Keep Vercel Production builds/merges controlled by SOP 16, do not trigger unnecessary builds while quota-limited, and verify actual deployed SHA and live behavior. Never put real customer or payroll data in GitHub Actions artifacts.
