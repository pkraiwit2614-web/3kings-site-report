# Curated optional Skills — release review (2026-10-19)

**Scope:** Agent instruction files and one additive static CI test only. This is not installation of upstream products. No changes to `app/`, `components/`, `lib/`, `supabase/`, `vercel.json`, `package.json`, `Data...`, Google Drive, database, or production.

## Selection and rationale

| Candidate | Selection | Reason / overlap |
| --- | --- | --- |
| Matt Pocock — domain-modeling and PR discipline | Adapt as `curated-3kings-change-quality` | Domain terms and PR evidence complement existing Superpowers. |
| Karpathy-inspired principles | Included in change-quality | Already consistent with 3 Kings surgical-edit rules; no duplicate policy authority. |
| Diagram Design | Adapt as `curated-3kings-report-diagram` | Static report diagrams only, **not** app Flow or live room counts. |
| PPT Master | Adapt as `curated-3kings-report-slides` | Source-verified presentation guidance; PPT engine not installed. |
| Matt Pocock debugging/TDD/code-review | **Do not install** | Seven existing Superpowers methods cover these. |
| Paperclip | **Do not install** | Separate multi-Agent runtime; introduces service, cost, connection and permission risks. |
| God's Eye View | **Do not install** | Unneeded GIS runtime; mixed public data licenses. |

Pinned upstream references are recorded in `curated-skills.json` for review; no source scripts are copied or executed. The adapters are newly authored guidance, not a complete upstream Diagram Design or PPT Master implementation.

## Activation priority

For any of the 17 original SOP commands:
1. Run the existing SOP Gate, fetch latest live Drive SOP, preserve the exact mode and six permanent rules.
2. Run matching numbered Skill and existing Superpowers methods; Task Observer remains advisory-only.
3. Optionally consult a curated Skill only when the specific output/task calls for it. **No curated Skill may override or bypass an earlier gate.**

For independent diagram/slides/code QA requests: verify authoritative inputs and scope; generate/report without inferred source edits, deployment or privilege changes.

## Risk / blast radius review

| Surface | Intended changes | Expected direct application impact | Verification |
| --- | --- | --- | --- |
| 17 SOP skill folders / manifest / live SOP | None | None | GitHub compare and existing SOP validator |
| Superpowers 7 + Observer | None | None | Existing validators |
| UI → API → DB → Print → i18n → Roles → Sync | None | None: no app files touched | GitHub compare file allowlist; CI application regression |
| Dependencies / hooks / secrets | None | None | No package or env change; static scan |
| Agent instruction discovery | Three optional adapters plus additive pointer in AGENTS.md | Agents may *read* optional instructions on matching tasks; behavior requires human review | Check priority language and no auto-install/auto-write claims |
| GitHub Actions | Add one static validation step to existing agent-skills PR workflow | Extra CI check; does not change existing checks | GitHub Actions run on draft PR |
| Vercel Preview / Production | No deployment command, no Vercel edit | **Preview may be created automatically by existing integration**; Production must not change from this work | Check PR checks and deployment status separately, do not infer |

## Acceptance

- Exactly 17 original shortcuts and modes preserved; no edits to the current SOP Gate, numbered Skill files, Superpowers, Observer or originals.
- New skills pass custom static guard; no code execution, remote installs, credentials, autonomous writes, or permission escalation.
- Existing three Skills validation scripts pass on PR; main application build/regression checks pass when CI is available.
- Compare `main...branch`: only new curated instruction files, this registry/review, test script, and additive AGENTS/agent-CI wiring.
- If any regression or inconsistent SOP priority is detected: **do not merge or deploy**; stage correction on the test branch and repeat tests.

## Adoption limits

Static Skill docs are discoverable to compatible repository-aware agents; a git branch does **not** add global ChatGPT Skills, install vendor Python/Node runtimes, implement a backend SOP Gate, or guarantee correct generated slides/diagrams without separate tooling and QA.
