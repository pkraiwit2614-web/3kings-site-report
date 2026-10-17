# Compatibility: ChatGPT, Codex and the 3 Kings observer

| Environment | Capability | Boundary |
| --- | --- | --- |
| Codex / compatible repository-aware coding agents | Read AGENTS.md and .agents/skills/3kings-task-observer/SKILL.md, observe the current coding task | Instructions are guidance, not server-side authorization; activation needs a compatible agent/session |
| ChatGPT with connected GitHub | Can retrieve repo files during supported chats when explicitly asked | GitHub availability varies by plan/surface; repository changes alone do not auto-load this Skill or observe unrelated sessions |
| ChatGPT Skills feature (eligible workspaces) | Installed Skills can be selected automatically when suitable | Requires actual workspace eligibility and installation; this GitHub commit is NOT an installation |
| Ordinary ChatGPT without mounted private storage | Provide a structured, user-visible session handoff | No cross-chat persistence or autonomous monitoring claim |
| Private persistent agent workspace | Store sanitized observations if the user approves and verified write access exists | Scheduler separately needs access; never place the log in public GitHub |
| 3 Kings Next.js/Vercel/Supabase runtime | No change required to app or database for a documentation-only adapter | No observer middleware, API route, webhook, trigger, telemetry or Production deployment is installed |

Activation path for a supported coding session:
1. Read AGENTS.md, check the requested numbered shortcut against manifest.
2. Open current live Google Drive SOP via SOP Gate BEFORE any execution, then invoke corresponding numbered Skill and Superpowers.
3. Load this observer to capture reusable evidence during/after the session, but never replace the verification or authorization workflow.
4. Stage recommendations for review; never write SOP, data, app or deployment from observer observations alone.

**Security:** the repo is public. Log only sanitized methodological observations in a verified private store. Do not add the logs to git, PR descriptions, CI artifacts or test fixtures. Keep direct source identifiers private.

**Compatibility verdict:** agent-Skill format is compatible; automatic always-on ChatGPT observation is NOT supplied by the code repository. Test session invocation explicitly in each supported surface before marking as available.
