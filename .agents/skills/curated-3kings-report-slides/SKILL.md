---
name: curated-3kings-report-slides
description: "Optional read-only reporting workflow for editable management PowerPoint decks using verified 3 Kings progress, defects, procurement and site photos. Inspired by ppt-master; does not install it or edit application code."
---

# Curated 3 Kings — Management Slide Decks

**Status:** Optional repository-aware presentation guidance. PPT Master is **not installed**; no bundled Python workflow, renderer, image generator or model provider.

## Gate and scope

- Activate for a requested slide deck, weekly/monthly recap presentation, or a PPT template update.
- If the slide deliverable is part of one of the 17 SOP shortcuts, read `.agents/skills/3kings-sop-gate/SKILL.md` and run live SOP Gate and current Drive SOP **before** accessing source or writing output; if blocked, report UNVERIFIED, no data write.
- Generate a **new** output file; do not overwrite original source or existing approved template unless explicitly authorized. All 3 Kings project deliverables belong in the authorized workspace; no public raw operational data.

## Reporting workflow

1. Verify dates, source file IDs/versions, current data and relevant edit permissions. Distinguish site `Actual`, schedule baseline `Schedule`, future `Target`, and unknown statuses.
2. Prepare an executive narrative: current overall state, sites/projects, completed work with evidence, pending/late Defect and handovers, materials/PO follow-up, workforce, blockers, next actions and PIC/date.
3. Use original 3 Kings slide template/brand if supplied; keep 16:9, readable Thai typography, editable charts/tables and appropriately captioned photos. Avoid converting every slide to one flat screenshot unless user requests it.
4. Render every slide, inspect font consistency, clipping, content overflow, correct room/Combine counts, decimal amounts, source footnotes and image permissions. Confirm PowerPoint editability where required.
5. Report source timestamp, deliverable path and actual QA results. Unsupported native animation, chart-editability or export steps must be stated UNTESTED.

## Non-interference

- Never write back computed report numbers into Supabase, Excel, Google Drive sources, or website by producing a deck.
- Never infer delivery, deployment or data freshness from successful PPT creation.
- Existing `pptxgenjs` in the website dependencies is not permission to change or reuse the production application runtime.
- Source inspiration: https://github.com/hugohe3/ppt-master. Upstream scripts, model calls and Python dependencies are NOT installed by this adapter.
