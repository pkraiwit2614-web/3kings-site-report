# Prompt 23 QA harness

Scope: synthetic/test-only fixtures for Labour PDF contract and Verified Payroll financial handoff. No Production logic, DB migration, RPC, auth, RBAC, navigation, Drive data, or Production data is modified.

Run:

```bash
node --test tests/prompt23/labour-payroll.test.cjs
```

Coverage:
- A4 landscape contract.
- One work date = one page.
- Thai long detail deterministic layout and no overlap.
- Duplicate-date/source-row de-duplication.
- Tone 16/09 canonical merge = 3 unique workers across A+B.
- Contractor/non-person exclusion.
- Labour PDF is pre-verification evidence and is not gated on Verified.
- Financial handoff authority gate accepts only Verified Payroll statuses.

Expected BLOCKED item:
- Financial reconciliation cannot be marked PASS until an authoritative Verified Payroll fixture/export exists. This repository fixture intentionally contains no invented Rate, OT, or financial totals.

Integration limitation:
- The current repository does not contain the Labour PDF automation/renderer implementation, so this suite proves the repeatable contract/golden plan only. Renderer-level PDF integration remains BLOCKED until that implementation is available to the test runner.
