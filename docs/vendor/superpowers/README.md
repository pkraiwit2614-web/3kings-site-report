# Seven pinned Superpowers methods

Original: https://github.com/obra/superpowers

Upstream commit: `bb92a77741419a4ab5f06e711a283343f1ada0c3`

License: MIT; see `LICENSE` (© 2025 Jesse Vincent).

Twenty original Skills/reference files are vendored without modification under `skills/`. Their upstream Git blob SHA-1 hashes are recorded in `docs/agent-skills/superpowers-integration.json`. Seven 3 Kings adapters in `.agents/skills/3kings-sp-*/SKILL.md` contain all project-specific safeguards.

The full Superpowers plugin, bootstrap hook, session hooks, telemetry, auto-start, new dependencies and automatic script execution are NOT installed. Vendored scripts are optional reference material and not executed by our CI or runtime. These local method Skills do not implement server-side authorization or make ChatGPT load them in every conversation.
