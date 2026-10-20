# 3 Kings Task Observer — Private Google Drive Locator

**Owner-controlled store, verified on 2026-10-17.** This document contains **names only**, not private Google file or folder IDs, access tokens, raw observations, user details or direct links. Repository visibility is public.

## Discovery for authorized connected agents

1. Run the live SOP Gate and read the correct current SOP **first** for any numbered shortcut.
2. If a connected Google Drive account is available, resolve by **exact parent chain**:
   - `3Kings Construction`
   - `0-SOP & AI Commands`
   - `1-Task Observer (Private)`
3. In that folder identify these three native Google Docs by exact title, checking their actual file IDs, parent IDs, MIME type, permissions and modification metadata using Google Drive at run time:
   - `00_คู่มือ Task Observer และกฎความปลอดภัย`
   - `01_Observation Log (Private)`
   - `02_Weekly Review & Decision Log (Private)`
4. Verify the folder and **all target documents** have no unapproved user, group, domain or public permissions before reading or writing sensitive observations. If access or permissions cannot be verified, do not append; use a sanitized **NOT PERSISTED** handoff in the response.
5. Read the private operating rules and latest Observation Log. Detect any OPEN observation relevant to the current Skill. The live original SOP always outranks observations.
6. During/after actual work, capture only evidence-backed, generalized findings; append a unique `OBS-YYYYMMDD-NNN` record to the private Log with Google Docs revision-protected `insertText` at the end of the document, with verification readback. Never clear, replace, or overwrite existing observations; first read to avoid concurrent duplicate IDs.
7. For a review (user request or an independently authorized scheduled run), read the full current Log and relevant live SOPs, group by root cause/17 numbered Skills, propose minimal improvements, and append `REVIEW-YYYYMMDD` in the private Review History **only after actual write + readback**. Don't modify live SOPs, apps, DB, permissions or Production by observation authority alone.
8. No always-on ChatGPT-wide listener, cross-chat capture, server-side SOP gate or background trigger is created by these instructions. The separately configured ChatGPT weekly review is not proof that any agent can auto-capture sessions; scheduled access must be verified on its first execution.

## Permission and disclosure boundary

Only the folder's *name and path* may appear in public GitHub. Store the actual Google Drive IDs and document URLs **only in private Google Drive or the user's private automation configuration**, never in public repository files, logs, PR bodies, CI outputs, or Vercel metadata.

Do not copy raw Defect, Labour/Payroll, personal identity, passwords, tokens, receipt/PO attachments or room-specific records into observation entries. Never treat source conflicts as evidence of completion.

## State and review semantics

`OPEN` = needs review. `PROPOSED` = improvement drafted. `APPROVED` = user explicitly accepted the precise proposed change. `ACTIONED` = approved change executed **and independently read back with tests**. `DECLINED` = rejected, with reason. Derive latest state by the most recent appended status event for the OBS-ID; avoid deleting history.

**Fallback:** if Drive is unavailable in a coding-agent session, include a private session handoff marked NOT PERSISTED. Never silently persist anything to this public GitHub repo.
