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
- Run relevant regressions and verify actual Preview/Production data when authorized. Do not deploy based on the presence of skills.
- Never commit private Google Drive document IDs, credentials, access tokens or secrets.

The SOP original in Drive outranks a summary in this repository. Changes to this routing system must be reviewed on a branch; do not silently change application runtime or CI gates.

## Seven guarded Superpowers process Skills

For any of the 17 SOP shortcuts, **first** run the current 3 Kings SOP Gate and open the live current SOP from Drive. Then consult `docs/agent-skills/superpowers-integration.json`; load the relevant `.agents/skills/3kings-sp-*/SKILL.md` adapter and its vendored method. Verification-before-completion applies to all 17; systematic-debugging applies to actual anomalies; planning/worktrees/TDD/code review to authorized app code work; writing-skills only to Skill maintenance.

Vendor methods are subordinate to the real 3 Kings SOP, user scope and RBAC/RLS. A read-only command stays read-only. No auto-installing plugins, bootstraps, hooks, telemetry, subagents or running third-party scripts. No inferred merge/deploy. Repository Agent Skills do not create a server-side SOP enforcement gate or automatically install across ordinary ChatGPT chats.
