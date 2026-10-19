# 3 Kings LINE AutoPilot — staged site routing (NO SEND)

Scope: **isolated test branch only**. The currently deployed Cloudflare Worker remains unchanged.

## What was verified

- The deployed Worker source was snapshotted before the two additive preview helpers.
- `previewLineSiteRoute` calls `public.line_autopilot_preview_route` (read-only, `SECURITY INVOKER`), which delegates to `line_autopilot.preview_site_notification` and reads existing site rules.
- `previewLineSourceEvent` resolves a canonical site from a verified project code or literal Condo building A/B. It does **not** declare source items overdue, ordered, received, completed, or eligible to notify.
- No webhook or scheduled-handler call sites were changed. Both preview functions return `wouldSendLine: false` and never call the LINE API.
- Group IDs are not stored in source or tests.
- Fail-closed conditions cover unknown sites, missing project IDs, inactive or out-of-scope projects, RPC authorization errors, incompatible events, and incorrect DB responses.
- The read-only public RPC is executable by `service_role` only; `anon` and `authenticated` are denied. Its caller identity must be verified in a controlled Worker Preview before activating ANY sending.

## Canonical mapping

| Source | Identification required | Route |
|---|---|---|
| Materials, Daily Site Report, Weekly Recap | Explicit `project_id` → active `projects.code` | `AV-P[0-9]{1,2}` or `AV-COMMON` → Villa; `CONDO-A` → Condo A; `CONDO-B` → Condo B |
| Defect Work Order | Explicit `building` = `A` or `B` | Condo A or Condo B |
| Sync failure | Verified source kind `drive_sync_log` and `status=error` | Owner only; never site group |
| Other/ambiguous | Missing or unrecognized | BLOCK |

Only **routing** is previewed; source-specific status validation and full reconciliation remain mandatory before any notification collector can become eligible.

## Validation

```sh
node --test tests/line-autopilot/*.test.mjs
```

Additionally run read-only queries on current 3 Kings Supabase tables to compare `materials` → `projects`, `defect_work_order_snapshot.building`, `daily_reports.project_id`, and the wrapper RPC decisions. No test should create rows in `line_autopilot.deliveries`.

## Activation is a separate, explicitly authorized change

Do NOT merge or deploy this branch automatically, copy secrets to the repository, enable `AUTOPILOT_ENABLED`, approve a `group_candidates` record, remove hard-disabled `CHECK` constraints, enable a `site_notification_rules` record, or call LINE push for QA.

Before any staged Worker runtime test: configure a **separate, limited preview environment** with read-only access to the RPC, verify authenticated access, and ensure no route to the LINE Push API is exercised. The existing Worker secret named `SUPABASE_SERVER_KEY` has not been proven to assume the `service_role`; an invalid/anon key must fail closed. Check end-to-end runtime results before requesting separate approval for actual sends.
