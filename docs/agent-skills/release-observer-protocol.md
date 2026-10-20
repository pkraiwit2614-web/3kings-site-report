# 3 Kings — Task Observer Release Gate Intelligence

Scope: read-only advisory. Authority: latest LIVE Drive SOP INDEX and full ACTIVE SOP 15/16, then GitHub PR/commit/check evidence and independently verified Vercel or DB evidence. This protocol adds no new release gate or permission.

## Evidence procedure
1. Verify PR base/head SHA, draft state, changed files and required dependency scope; inspect checks and commit statuses on the exact head SHA. Branch-protection required checks must be verified separately.
2. Distinguish SUCCESS, FAILED, PENDING, SKIPPED, SHA-MISMATCH and provider quota signals. SKIPPED never counts as PASS.
3. Reuse prior QA only if SHA, code/dependencies, environment, configuration revision, schema, roles, tests and artifacts match. If not, request only affected checks, not redundant builds.
4. Hosted Preview is required only if local/CI cannot verify actual hosted integration such as OAuth, cookies, callback, domain or routing. Never waive a truly required check because of Vercel quota.
5. GitHub-only public evidence never proves Production SHA, feature/role login, real DB integration, or release authorization. Never output RELEASE_READY or DONE from this observer.

## Classification
- CHECKS_REVIEW_ONLY: check evidence gathered; full Release Gate not certified.
- HOLD_OR_UNVERIFIED: failed, pending, skipped, mismatched or incomplete evidence; give exact blocker.
- UNVERIFIED: PR identity is invalid or missing.
- EXTERNAL_BUILD_QUOTA_SIGNAL: GitHub metadata references quota; not proof of reset time.
- PROPOSED_ONLY: SOP/Skill/test improvement candidate, not an ACTIVE SOP edit.

## Automatic candidate proposal
Group independently verified observations by root cause. Propose a minimal SOP 15/16 or Skill/Test change only after two DISTINCT evidence-complete PRs with the same pattern, or a separately verified critical safety gap. Check whether the current ACTIVE SOP already solves it. Prefer improving executor or tests to adding repetitive user approvals. Include: evidence, proposed text, impacted numbered skills, blast radius, a negative regression test and what remains UNVERIFIED. No private raw incidents or Drive IDs in public GitHub.

Observer authority is read-only. It may propose; it cannot edit ACTIVE Drive SOP, source spreadsheets, app code on its own, database, permissions, Preview configuration or Production. Separately authorized coding changes use their normal isolated-branch SOP and QA.

## Implementation and usage
- The Node 22+ script at scripts/task-observer-release-gate.mjs reads public GitHub REST metadata for at most 20 open PRs using a read-scoped GitHub token. It produces sanitized JSON with GitHub evidence only.
- The GitHub Actions workflow task-observer-release-audit.yml uses workflow_dispatch only; it runs synthetic tests and optionally stores the sanitized JSON artifact for seven days. It neither builds the Next.js app nor deploys.
- The existing ChatGPT automation 3 Kings Skill Review can review live PR evidence with connected GitHub and the owner-only Drive log every Monday. Scheduled access must be independently verified. This does not automatically observe every other conversation.
- If the private observation store is inaccessible or a revision-protected append/readback fails, report NOT PERSISTED. Do not fake persistence.

## Scope and QA
Affected files: standalone observer script/test/workflow; agent observer instruction; this document; existing agent-skill validation workflow. No changes to Next.js UI/API/print, Defect, Daily, Materials, Payroll, Calendar, LINE AutoPilot, Excel Sync, RBAC/RLS, Supabase, secrets, Vercel or Production.

Test with node --test tests/task-observer-release-gate.test.mjs, node scripts/validate-task-observer.mjs and the existing 17-Skill validator. Verify branch changed-file diff and CI readback before claiming PASS. A branch commit does not mean merged or deployed.
