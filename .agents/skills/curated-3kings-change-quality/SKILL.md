---
name: curated-3kings-change-quality
description: "Optional 3 Kings engineering QA: verify domain terminology, minimal scoped changes, PR evidence and regression risks; complements, never replaces, SOP Gate and the seven existing Superpowers adapters."
---

# Curated 3 Kings — Change Quality

**Status:** Optional repository-aware agent guidance. No server-side enforcement or auto-install. Adapted principles, **not** an installation of third-party runtime/plugins.

## Authority and activation

- Activate ONLY for an explicitly authorized 3 Kings code/agent-skill change or a read-only code review. Never invoke as a standalone permission to write.
- For any of the 17 shortcuts, **FIRST** read `.agents/skills/3kings-sop-gate/SKILL.md`, `docs/agent-skills/manifest.json`, and the current full SOP from the live Drive Index. If unavailable, do not modify source/data or deploy.
- Preserve the existing 17 Skills, six central rules, seven Superpowers adapters, Task Observer, canonical sources, RBAC/RLS, and user's narrower instructions.
- Existing `3kings-sp-systematic-debugging`, `3kings-sp-test-driven-development`, `3kings-sp-requesting-code-review` and `3kings-sp-verification-before-completion` already own debugging/TDD/review/verification. Do **not** duplicate, reinstall or override them.

## Complementary QA method

1. **Domain language (inspired by Matt Pocock's domain-modeling):** Check exact meanings of Defect stages, Hotel participation vs acceptance, Combine group identity, work-order state, Target vs Actual, and PO vs receipt against verified project sources; flag ambiguity instead of inventing mappings.
2. **Think before coding (Karpathy-inspired):** Name verified source, intended diff, uncertainty, alternatives and potential affected modules. Stop when material evidence is missing.
3. **Surgical implementation:** Edit only the lines necessary for the authorized request; do not rename, reformat, reorganize, update dependencies or "clean up" unrelated modules. Do not edit protected `Data...` folders.
4. **Evidence-rich PR (inspired by Matt Pocock's PR discipline):** Show intent, changed files, before/after, tests, security/permissions, UI→API→DB→Print→i18n→Roles→Sync blast radius, reversibility and unresolved risk.
5. **Goal-driven validation:** Define measurable pass criteria; use existing Superpowers methods for regression, failure diagnosis and independent readback. Report PASS, FAIL or UNTESTED, citing real results, not intent.

## Output contract

Return a compact scope/risk/evidence table and explicit merge recommendation. If CI, Preview or Production readback cannot be verified, say UNTESTED. Do not merge, deploy, edit live SOP, or write DB/Drive/Apps Script automatically. A read-only review stays read-only.

## Source and adoption limits

Based on methodology documented at:
- https://github.com/mattpocock/skills (specifically domain-modeling and PR evidence discipline)
- https://github.com/multica-ai/andrej-karpathy-skills (think before coding, simplicity, surgical changes, goal-driven execution)

Upstream Matt Pocock and Karpathy Skills are not installed. No external executable, hook, dependency, telemetry, or runtime tool is installed by this file.
