# Scoped original-ID XLSX writer — staged, not deployed (21 Oct 2026)

## Purpose and existing-system impact
- Bypass the ChatGPT Google Drive connector's file-reference shape mismatch by using the **existing authorized Apps Script OAuth token** and the documented Drive `files.update` media PATCH.
- Operate on the same **approved Drive File ID**, preserving the filename, Drive permissions, folder, and the existing inbound Materials/PR Sync mappings.
- This is a new **isolated staging utility**. Do not install it into the current 7-file Live Apps Script project, deploy a Web App endpoint, modify OAuth settings, or enable triggers based solely on this GitHub source.
- Do not touch Defect, Work Order, Daily Reports, Payroll, Calendar, RBAC/RLS, Express import, or unrelated tables/rows. No Production deployment or automatic writes are included.

## Safety contract
1. Resolve SOP 06 and SOP 13 from the current ACTIVE Google Drive SOP INDEX; verify owner/editor identity, permitted file names, IDs, and current file revisions.
2. A *separate owner-authorized* Apps Script execution environment needs OAuth scopes `drive` and `script.external_request`. Add a JSON list of approved file IDs to the **private Script Property** `MATERIAL_PR_XLSX_ALLOWLIST`. Never put this list in the public GitHub repository.
3. Request example (place real IDs and evidence only in the private execution environment):
   `{fileId:"<approved ID>",expectedName:"<existing.xlsx>",sheetName:"<existing sheet>",changes:[{cell:"D12",expected:"old value",value:"new value"}]}`
4. First call `xlsxScopedPreview(request)`. It checks identity, allowlist, existing row and exact current cell value, rejects formula edits and returns a SHA-256 fingerprint plus exact `expectedModifiedMs` — **no write**.
5. Only after comparing the dry-run result to the approved PR evidence, call `xlsxScopedApply({...request,expectedSha256:"<from preview>",expectedModifiedMs:<from preview>})`. It checks the same source fingerprint again, applies only the specified cells to the existing XLSX worksheet XML, uploads to **the original Drive ID**, then re-downloads and checks edited cells and unrelated ZIP members.
6. Up to 20 changed cells per request; strings and finite numbers only. Existing worksheet rows only. **Append/new rows, new sheets, formula edits, format shifts and workbook table-range changes are intentionally blocked** until a separately tested extension covers them. Do not force the earlier 21 October PR files through this first version.
7. Batches of up to 6 edits do not create an extra standalone backup. Larger batches create **one** file-level baseline copy if not already recorded. Drive version history is not guaranteed to retain all revisions indefinitely.
8. No auto-trigger and no unsolicited writes. If concurrent edit, stale checksum, unexpected sheet, missing allowlist, formula, or any readback discrepancy: FAIL CLOSED. The tool's `DRIVE_READBACK_PASS` means only that Drive XLSX bytes were validated; run the existing (unchanged) Materials Sync and verify target records at Source → Sync log → Supabase → Web before claiming `SYNC_PASS`.
9. Current byte-fingerprint + modified-time guards narrow the race, but Google Drive's upload API does not provide a general atomic cell-level transaction across another concurrently editing client. For high-collaboration files, schedule a short controlled write window.

## QA / activation status
- Static unit tests: `node --test tests/materials-pr-scoped-xlsx-writeback.test.cjs`
- Commit/PR code review must validate helper isolation, worksheet mapping, expected-value guards, formula preservation, no credential exposure and no change to any existing pipeline.
- Next external prerequisite: independently prove the file edit through owner-authorized Apps Script execution on a **disposable XLSX file**, with dry-run → apply → same-ID readback → rollback / version-history check. Do not do the first live test on the Materials, PR or Procurement Masters.
- After that proof and an append-row-safe implementation (if needed), apply the 21 October Plot 9 / Mirage PR update through the authorized scope and run the established Sync/readback. Until then, those Master files remain unchanged.

## One-time owner connection — NOT YET PERFORMED

**Blocker confirmed 21 Oct:** The connected ChatGPT Google Drive plugin can inspect an owned \`application/vnd.google-apps.script\` project but does not expose Apps Script \`projects.updateContent\`, \`scripts.run\`, \`deployments.create\`, or interactive OAuth consent. The existing Vercel OIDC integration is service-account-based and **cannot** call Apps Script \`scripts.run\`: see Google's official execute-function documentation. Do not alter the existing 7-file live project to bypass this limitation.

1. In the owning Google account, open **https://script.google.com/home/projects/create** and create a separate project called \`3Kings Materials PR XLSX Executor QA\`. This is a one-time **human-authorized** step (or requires Work Cloud Browser with the user signing in). Do not append the code to the current live 7-file script project.
2. Paste \`docs/apps-script/MaterialsPRScopedXlsxWriteback_2026-10-21.gs\` into the new project's \`Code.gs\`. Confirm the project has Apps Script OAuth scopes **Drive** and **external_request**. No production URLs, credentials or application secrets need be pasted into source.
3. Select a disposable test workbook from \`3Kings Construction/QA_Excel_Writeback_Test_2026-10-19_DO_NOT_SYNC\`. The private **Script Properties** should hold \`MATERIAL_PR_XLSX_ALLOWLIST\` as a JSON array containing ONLY the QA workbook's Drive ID, and \`MATERIAL_PR_XLSX_CANARY_ID\` as that same Drive ID. Do **not** add Materials/PR Masters before the QA write test passes.
4. Run \`xlsxScopedConnectionProbe\` from the Script Editor and accept Google's permission prompt as the owning user. The only valid response for this stage is \`OWNER_OAUTH_READ_PROBE_PASS\` — this establishes read access, **not** write.
5. For an isolated write permission proof, add private \`MATERIAL_PR_XLSX_CANARY_REQUEST\` JSON, using the actual QA workbook's existing nonformula text cell, current exact text and \`QA_CANARY_...\` marker. Review \`xlsxScopedPreview\` first, then run \`xlsxScopedCanaryWriteAndRestore\`. It must write and independently read the same Drive file ID, then restore the original cell with independent readback. It is valid only when \`QA_ONLY_SAME_ID_WRITE_AND_RESTORE_PASS\` is returned. If not, stop and reconcile the disposable QA file only.
6. **Remote invocation remains separate:** A successful in-editor owner run is not an API executable or a ChatGPT connector. To remotely run it, either (a) configure *user OAuth* + a standard Google Cloud project + Apps Script API executable and an authorized calling application, or (b) implement a tightly authorized *pull-based* queue with a separately permitted Apps Script time trigger and revision-locked acknowledgments. Do not use service accounts for \`scripts.run\`, expose a public unauthenticated \`doPost\`, or deploy \`Web App execute as me\` without approved authorization verification.
7. Recheck private permissions, QA fixture File ID, original XML shape, checksum and target scope before any future authorized Excel Master update. Keep the original Materials inbound Sync unchanged.

**Current status:** helper and unit tests are staged in draft PR #197; owner Google OAuth authorization, a real Apps Script \`run\`, the write-and-restore canary, the remote call bridge and the final Source→DB→UI readback have **not** been performed. No production execution is implied by GitHub CI.
