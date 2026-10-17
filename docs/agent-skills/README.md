# 3 Kings Agent Skills — 17 SOP-linked shortcuts

Status: **development branch only / agent guidance**. No existing web application route, Supabase migration, Google Apps Script, production trigger, sync path, package dependency, or Vercel configuration is changed by these files.

## What is included

- `AGENTS.md`: scoped coding-agent safety instructions.
- `.agents/skills/3kings-sop-gate/SKILL.md`: mandatory SOP routing/preflight description.
- `.agents/skills/3kings-01-*/SKILL.md` … `3kings-17-*/SKILL.md`: one skill for every confirmed shortcut.
- `docs/agent-skills/manifest.json`: machine-readable exact 17-command registry.
- `scripts/validate-agent-skills.mjs`: local syntax/completeness/static safety check.
- `.github/workflows/agent-skills-validation.yml`: separate GitHub Actions validation for PRs editing agent skills only.

## Authority and confidentiality

The live Google Drive document **00-SOP_INDEX - 3Kings Construction**, in **3Kings Construction/0-SOP & AI Commands**, maps each shortcut to its current SOP document. Fetch and read the latest full SOP every invocation. Repository descriptions are summaries, not offline replacements. Google Drive file IDs and potentially private direct links are deliberately not committed to this public repository.

Mode definitions:
- `read_only`: never change source, app, database, role, trigger or deployment.
- `document_only`: produce requested document, never change source.
- `authorized_write`: change only explicitly authorized verified rows/files.
- `code_change`: surgical isolated branch; no inferred Production release.
- `deploy`: separate explicit release authority and live verification.

## How to validate

```bash
node scripts/validate-agent-skills.mjs
```

The checker enforces 17 unique IDs/shortcuts, 17 matching on-disk skills, a gate, SOP link titles, modes and text checks. It **cannot verify live Drive permissions, current SOP version, app behavior, DB, Vercel or data sync**. Those checks remain per SOP.

## Source of truth

The six central rules and official 17 command titles have been cross-checked with the live SOP Index (2026-10-17). The index currently contains 17 command SOP documents plus a separate Daily Site Report SOP, which is not part of the numbered 17 skills.

## Adoption boundary

These files support capable coding agents that read repository instructions and Agent Skills (e.g., Codex). They **do not auto-install** in ordinary ChatGPT conversations, nor can they enforce a server-side write lock. A later API/Gateway/Executor implementation needs distinct scope, risk review, authentication and tests. No new deployment permission is granted.

No changes to the existing SOP files in Google Drive or to the existing repository application runtime are included.

## Superpowers selected methodology (17 SOP routes)

Seven pinned Superpowers Skills are vendored verbatim under `docs/vendor/superpowers/skills/` (MIT license in `docs/vendor/superpowers/LICENSE`). Seven guarded Agent Skill adapters live in `.agents/skills/3kings-sp-*/`. The `superpowers-integration.json` registry maps the seven process methods against all 17 original SOP shortcuts without changing their existing read-only/document-only/write/code/deploy classes.

Local validation: `node scripts/validate-agent-skills.mjs && node scripts/validate-superpowers-integration.mjs`. Original source files and Git blob hashes are pinned at commit `bb92a77741419a4ab5f06e711a283343f1ada0c3`.

Only instructions for compatible coding agents have been added: no Supabase/Apps Script/Next.js runtime code, hidden hooks, auto-start plugin, network telemetry, dependencies or unapproved deployments. These cannot force ordinary ChatGPT chats to auto-load or act as a server-side SOP Gate.

## 3 Kings Task Observer — ChatGPT/Codex adapter (review branch)

- `.agents/skills/3kings-task-observer/SKILL.md`: read-only observer for corrections, repeated failure patterns, missing checks and skill candidates.
- `docs/agent-skills/task-observer-integration.json`: **17** explicit one-to-one links; preserves each existing mode and requires the live SOP Gate first.
- `scripts/validate-task-observer.mjs`: checks link coverage, read-only privilege, attribution, non-install caveats, and private-log policy. GitHub Actions validates it on agent-related PRs.
- `.agents/skills/3kings-task-observer/references/`: private observation handoff template and ChatGPT compatibility matrix.

**Compatibility:** A compatible repository-aware coding agent can read these instructions; ChatGPT with GitHub can read them on request; native ChatGPT Skills may require an eligible workspace and separate installation. This PR is **not** a globally installed ChatGPT Skill or background observer. No observation logs go in this public repository, and the observer neither alters the 17 live Drive SOPs nor the Next.js/DB/Excel/Production application.

Upstream adapted methodology: Eoghan Henn / rebelytics, [one-skill-to-rule-them-all](https://github.com/rebelytics/one-skill-to-rule-them-all), CC BY 4.0; reviewed fork [SquidyInk/task-observer](https://github.com/SquidyInk/task-observer).
