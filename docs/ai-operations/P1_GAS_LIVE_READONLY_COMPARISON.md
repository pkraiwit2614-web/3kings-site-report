# P1 — Google Apps Script source comparison (read-only)

## State
STAGING ONLY. PR #189 provides seven Git snapshots, not verified live source. This tool does not install triggers, change Script Properties, write any spreadsheet/DB, or change Apps Script code. P1 is NOT connected until private access is granted and a real comparison executes.

## Prerequisites
1. Identify the Google account permitted to read the real Apps Script projects. In each actual Apps Script Editor, copy the Script ID from Project Settings. Several Git files may belong to one project.
2. Enable the Apps Script API on the authorized Google Cloud project (if needed). Obtain an OAuth access token with **only** the https://www.googleapis.com/auth/script.projects.readonly scope. The existing Drive connector's authorization is not evidence that this scope is granted.
3. Keep token and private project mapping outside the public repository, GitHub Actions and ChatGPT.
4. Prepare a private JSON document containing a version field equal to 1 and exactly seven objects in targets. Each object needs: gitFile (one of the seven names in gas-source-manifest.json), scriptId (actual Apps Script project ID), remoteFile (exact Apps Script Editor file name without .gs). An optional positive versionNumber compares a specific published code version; omitted means HEAD.

Sample private mapping record for illustration only (repeat once for each of the seven Git files and replace both placeholder values):

~~~json
{"version":1,"targets":[{"gitFile":"DailySiteReportSync_2026-10-19.gs","scriptId":"REPLACE_WITH_ACTUAL_SCRIPT_ID","remoteFile":"Exact_Editor_File_Name"}]}
~~~

The one-record example is incomplete and intentionally rejected by the validator.

## Run only after OAuth consent
Set environment variables GAS_PROJECT_MAPPING_FILE to the private mapping JSON filepath and GAS_READONLY_ACCESS_TOKEN to a short-lived OAuth token carrying the readonly scope. Run:

    node scripts/ai-operations/compare-gas-live.cjs

The tool makes **GET only** calls to the official Apps Script projects.getContent endpoint. It reads code in memory and reports filenames, comparison statuses and SHA-256 checksums; it does not print project IDs, token, raw code or HTTP response text.

Exit 0 means all seven EXACT_MATCH. Exit 2 means a missing or nonidentical file. Exit 1 means an authorization, mapping or API error.

Status meanings:
- EXACT_MATCH: source text identical.
- LINE_ENDINGS_ONLY: only CRLF/LF differ; not byte-identical.
- CONTENT_DIFF: a difference was detected, no write is allowed.
- REMOTE_NOT_FOUND: exact remote name missing, do not guess.
- P1_BLOCKED: missing or denied authorization, do not assume a comparison.

IMPORTANT: Without versionNumber the API reads HEAD (used by script editor / triggers), not necessarily a separately deployed web app/add-on version. Active deployment comparisons require a distinct scope-gated project version/deployment review.

## Impact and release constraints
GitHub-only comparison script, offline tests and documentation. No access to Daily Reports, Defect, Work Plan, Materials, Payroll, LINE, RBAC/RLS, Supabase or Vercel. No changes to source code of the seven existing Apps Script files. Required offline QA: node --test tests/ai-operations-gas-source.test.cjs tests/ai-operations-gas-live.test.cjs; plus existing required GitHub Build. No hosted Vercel Preview needed.

No Merge/Production release in P1 without a separate authorized Release Gate. No real live comparison may be called PASS until valid private mapping and OAuth have run against the actual projects.
