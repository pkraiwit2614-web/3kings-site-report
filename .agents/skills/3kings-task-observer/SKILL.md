---
name: 3kings-task-observer
description: "3 Kings internal, read-only meta-skill for observing repeated corrections, missed SOP steps and test gaps across the 17 SOP-backed skills; proposes reviewable improvements. Use alongside task-oriented 3 Kings agent work AFTER live SOP Gate preflight, never as an executor."
---

# 3 Kings Task Observer — ChatGPT/Codex Adapter

**Type:** Internal 3 Kings adaptation of the Task Observer methodology.
**Upstream:** Eoghan Henn / rebelytics.com, [one-skill-to-rule-them-all](https://github.com/rebelytics/one-skill-to-rule-them-all); investigated fork [SquidyInk/task-observer](https://github.com/SquidyInk/task-observer).
**Attribution/licence:** Upstream methodology licensed CC BY 4.0; attribution retained for this adaptation. Project-specific additions are internal and must not be published as operational data.

## Order, authority and activation

1. For any of the 17 shortcuts, FIRST follow `.agents/skills/3kings-sop-gate/SKILL.md`, `docs/agent-skills/manifest.json`, and the current complete **live Google Drive SOP**. Stop the underlying unsafe action if that SOP is inaccessible.
2. Load the matching numbered Skill, then the mapped Superpowers methods from `docs/agent-skills/superpowers-integration.json`. Load this observer **in parallel as a read-only advisory layer**, using `docs/agent-skills/task-observer-integration.json` for the mapping.
3. During task execution and after user feedback, observe evidence of reusable failure patterns or effective improvements. Do NOT infer a completed operation from an instruction, a CI status, or a draft.
4. If this Skill is not installed/discoverable in the current ChatGPT environment, an agent with live repository access may explicitly read it on demand. A GitHub commit alone does not enable automatic activation across ordinary ChatGPT chats.

The hierarchy is: live SOP and six permanent rules > explicit user-authorized scope and real RBAC/RLS > existing 17 Skills and guarded Superpowers > this observer. An observation never authorizes a write, deploy, permission change, or data reconciliation. For read-only shortcuts, the observed task remains read-only.

## What to capture

- **Correction:** user corrects a result or supplies a missing condition (e.g., Combine group counted twice, status confused with target).
- **Guard failure:** SOP or source-of-truth preflight skipped, unexpected writes, unverified sync/deploy claim, wrong room or alias, missing regression.
- **Useful pattern:** recurring task suitable for an internal skill, test case, SOP clarification, or reusable cross-cutting rule.
- **Do not capture:** unverified speculation, purely one-off typo without generality, private raw user data, secrets, incident-specific room records, names or links in a public log.

Identify exact affected Skill number(s), repeatability, supporting evidence reference (safe description, never token/credential), consequence, proposed minimal improvement, side-effect risk and test. Separate **observed** facts from **hypotheses**.

## Persistence and ChatGPT compatibility

Read `references/chatgpt-compatibility.md` before setting up a runtime or claiming coverage. Persistent logs live ONLY in a user-approved **private** workspace such as access-controlled 3 Kings Drive, not this PUBLIC GitHub repository. The observation store must be accessible to the executing agent and to the review process. Without a verified private writable store, collect a **session handoff in the response only** using `references/observation-contract.md` and label it NOT PERSISTED; do not claim it was stored or will appear in the next chat. Never create or commit observation logs, personal information, credentials, Drive file IDs, webhook payloads or raw Defect/Payroll data in this repository.

**Private Google Drive routing (verified folder naming only):** read `docs/agent-skills/private-observer-routing.md` whenever an authorized Google Drive connector exists. Locate the private folder/documents by names at run time, verify owner-only permissions, read the private operating rules, then append only actual evidence-backed observations using revision checks and readback. Do not commit file IDs/URLs or raw observations to GitHub. An Agent without a verified writable connector MUST produce a NOT PERSISTED handoff rather than claiming successful cross-chat storage.

No universal ChatGPT hook, filesystem watcher, cloud polling, automatic skill installation, telemetry, auto self-edit, or automatic cross-chat observation is included. A scheduled review is valid only after the scheduler's read/write access to the private store is verified separately.

## Review and changes

1. Compile observations by Skill and de-duplicate by underlying cause. Summarize impact and show affected safeguards.
2. Propose a minimal diff for an existing Skill, its test, or a NEW candidate, keeping the original SOP authoritative.
3. Stage proposed changes on a separate branch/draft PR. Do NOT edit the live SOP or numbered Skill solely because an observation exists.
4. Changes to SOP, code, source data, permissions or deployment require an explicit authorization covering the change type and scope. A standing or current approval for low-risk SOP editorial improvements may cover those changes without repeated approvals. Observation alone grants no authorization; security/RBAC/RLS/payroll/schema and Production changes must follow their respective gates.
5. Validate manifest still contains exactly 17 original shortcuts, all mapping entries remain 1:1, applicable regression checks pass, and no private data leaks; read back actual artifacts and report PASS/FAIL/UNTESTED.
6. Don't assert any independent runtime enforcement from this repository instruction.

**Safe outcome:** suggestion or reviewable documentation only. The original app, Excel/Sheets, Supabase, Apps Script, Vercel, 17 Skills, RBAC/RLS and Production remain unchanged unless separately and explicitly authorized.

## SOP v2.0 self-improvement boundaries
- Observe repeated failures, classify root cause (SOP wording / routing / executor / source / service limits), deduplicate and form a minimal policy change candidate with a negative-test or QA plan.
- Purely editorial revisions within a verified pre-approved policy may be staged automatically on a branch, with version and index checks. Never overwrite an ACTIVE SOP solely from observer output. Activation must complete full 21-row mapping validation and independent readback first.
- Never self-approve a weakened safeguard, new write authority, production deployment, secret use or customer/payroll data access. Without verified private persistence, improvement observations remain NOT PERSISTED.

## Release Gate intelligence and SOP change proposals (read-only)

For a scoped Release Gate review, apply `docs/agent-skills/release-observer-protocol.md` after reading the current live SOP 15/16 and the normal SOP Gate. Use actual GitHub PR head/base, commit statuses, check runs, changed-file inventory, and only separately verified Vercel Production/Hosted evidence. Never infer PASS from SKIPPED, a historic SHA, a draft description, a missing workflow, an expired artifact, or a website merely opening.

The optional `scripts/task-observer-release-gate.mjs` classifier and `.github/workflows/task-observer-release-audit.yml` collect **public GitHub evidence only**. They cannot verify required rulesets, Production SHA, hosted authorization, Supabase integration, or the live Drive SOP. Classifications are advisory, never an automatic release or change authorization. Read-only workflow_dispatch is on-demand; it does not build, push, deploy, create PRs, or edit SOPs.

Group observations by proven underlying cause and link exact public PR/commit/check evidence. A proposed change needs two distinct evidence-complete PRs or a verified severe safety gap, a minimal SOP/Skill/test diff suggestion, impact and QA. Append only sanitized findings to the verified private Drive Observation Log. During authorized weekly review, compare against the current ACTIVE SOP and write a review record if and only if private append/readback succeeds. **Never self-edit an ACTIVE SOP**; propose for owner review, or stage only separately authorized low-risk editorial revisions on a test branch. No extra approval rounds are added to ordinary task execution.
