---
name: curated-3kings-report-diagram
description: "Optional report-only design guidance for creating sourced 3 Kings diagrams, process maps, Gantt visuals and architecture drawings. Does not alter live Defect Flow, data sources or application routes."
---

# Curated 3 Kings — Report Diagrams

**Status:** Documentation-first trial Skill; upstream Diagram Design is **not installed**. No executable integration, automatic export, or permanent rendering service is provided here.

## Activation and source check

- Use only when asked to prepare a diagram, workflow visual or management-report illustration.
- When a requested diagram is part of any of the 17 SOP shortcuts, run the existing SOP Gate, current live Drive SOP and matching numbered Skill **first**. If live SOP cannot be read, do not write files/data or publish the report.
- For independent read-only diagrams, use only sources the user explicitly supplied or current sources verified for the requested scope; label unverified quantities and unknown stages.

## Diagram method

1. Identify the audience and one question the visual must answer; use a table if a diagram adds no value.
2. Pick the structure: process/sequence/swimlane for workflows; state diagram for approved Defect states; Gantt for scheduled activities; data-flow for sync; architecture for integrations.
3. Map source → entity/group → state → edge with no invented statuses, links, dates or room counts. For Combine, use the approved group semantics, avoid duplicate room totals, and distinguish Hotel participation from Defect completion.
4. Use an approved 3 Kings brand/profile and Thai-capable fonts. Prevent text clipping, overlapping arrows and unreadable labels; check image and print fonts against the intended output.
5. Export only the requested deliverables (SVG/PNG/HTML/PDF as supported), then open/render and QA legibility and source traceability. If a supported renderer is absent, report the limitation and produce a reviewable diagram specification rather than claiming an export.

## Boundaries

- Not a replacement for live application `Flow`, database aggregations, web UI, or the original SOP.
- Never modify existing Excel sheets, Supabase, calendar, Vercel, print templates or production web files on a diagram-only request.
- Source inspiration: https://github.com/cathrynlavery/diagram-design. The original 45-type skill, scripts, dependencies and style profiles are NOT bundled or installed by this adapter.
- No automatic data sync, upstream downloads, npm/pip installation, or external API access.
