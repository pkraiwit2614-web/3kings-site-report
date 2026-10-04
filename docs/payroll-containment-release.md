# Payroll containment rollout

User authorized this phase on 2026-10-05: protect financial verification now; supply approved accounting rules later.

- Draft/timecard_checked keep working without rates. Labour PDF/sync unchanged.
- Reject client money, rates and calculated/manual/excluded status. Preserve signed pending adjustments.
- Reject invalid/null/out-of-range/excess-precision units and OT; no silent clamps.
- Block verified/external_verified at RPC and table levels until approved server-side calculation is implemented.
- Preserve existing authorization, RLS, Prompt 01 triggers, headcount and Work Date rules.
- Requires existing Prompt 01 assertion function. Refuse to replace a changed payroll RPC. Validate all new constraints atomically with a 5-second lock timeout; never rewrite existing records.

QA on release candidate: isolated PostgreSQL tests 46/46 (with live Prompt 01 guards + synthetic authenticated identity and payroll RLS); repository regression tests 33/33; TypeScript and Next.js production build passed. Browser click-through remains BLOCKED: browser download returned an invalid archive; no live user payroll was modified for testing. UI fixture harness is included but must not be described as passed.

Privacy: production readback/snapshot and test baseline stay outside this public release branch. Only requested app/migration changes and synthetic browser fixtures are published.

Rollback: previous application baseline cf5eb5f. Prefer keeping financial guards enabled and rolling the UI back if necessary. Restore the pre-change RPC/column types from the separately retained predeploy backup only under explicit approval: database rollback reopens the previous financial-validation weakness. Do not replay the original broad payroll migration or remove Prompt 01 triggers. Approved formula/rate/rounding/version snapshot implementation remains a separate blocked phase, not completed by this containment release.
