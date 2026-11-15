---
name: 3kings-document-qa
description: "Scoped automatic 4-gate QA guidance for 3 Kings XLSX/PDF/PPTX/PNG document edits and exports; subordinate to live Drive SOP."
---

# 3 Kings Document QA — agent routing (15 Nov 2026)

## Auto-selection on ordinary document tasks
When a user asks a repository-aware agent to CREATE, EDIT, EXPORT or REVISE a **3 Kings XLSX, PDF, PPTX or PNG** deliverable, the agent MUST select this skill within the same user request after the mandatory live 00-SOP_INDEX + six common rules + complete ACTIVE module SOP are read. The user does not need to say "QA" or ask for another approval. This document does not activate a ChatGPT Global Skill or a server-side watcher.

## Always preserve
- The existing GPT + connected Google Drive/Docs/Sheets editing path, Source-of-Truth and exact original file ID where the module SOP requires in-place editing.
- Module-specific formulas, formatting, OOXML media, screenshots, language, dates, approvals and source-by-source evidence.
- Operational/READ_ONLY boundaries. A document QA task never authorizes Defect/Materials/Daily Report/Payroll/Calendar/RBAC-RLS/GAS/LINE/Sync/Production changes.
- User-specific file IDs and raw documents remain private in Google Drive. Never commit these identifiers or binary copies to this public repository.

## One-command execution
1. Resolve the exact source, file type, cell/page/slide/image-region allowlist, output path, and risk-based backup requirement from the ACTIVE SOP.
2. Edit ONLY the authorized source delta with the existing authorized connector, preserving file ID when required. If NO_CHANGE, verify the existing output without re-publishing.
3. DATA_QA: compare source records and all material numbers, formulas, supplier prices/VAT, text and cross-file values; do not guess missing source.
4. STRUCTURE_QA: call the tested Python read-only verifier on the before/after files, with a bounded allowlist; no pass on REVIEW/FAIL. The owner-controlled isolated pilot executable is in Drive folder by name: `3Kings Construction/AI Operations/Document QA Pilot (Isolated)/3Kings_Document_QA_Pilot_v1.2_4Gate_E2E_20261115.zip`. Use it only when the execution environment actually supports Python/file access; never pretend the ZIP is an installed skill.
5. VISUAL_QA: render final output and inspect every PDF page/PPTX slide and relevant Excel print regions/PNG images at legible scale; check Thai/English typography, tables, cropped images, signatures, missing pages, overlap and confidentiality.
6. DRIVE_READBACK: write to the exact authorized Drive destination and then download via returned actual File ID; verify bytes SHA-256 when supported as well as source values, formulas, document structure, and page/image counts.
7. Before declaring PASS, require actual proof for all four gates. Any missing data/visual/renderer/provider access => PARTIAL/HOLD on that document. Fix only the offending delta and rerun the relevant gates in the same invocation.

## Evidence and current scope
- Pilot test on 15/11/2026: **four isolated real-document copies (XLSX, PDF, PPTX, PNG) passed all four gates**, regression 10/10 and negative gate tests 12/12; exact Google Drive readback hashes matched.
- Auto command routing was tested **inside an isolated CLI harness**; ordinary ChatGPT sessions and global runtime automatic triggering remain unverified.
- Never describe repository AGENTS/Skill text alone as Production QA or a globally installed ChatGPT hook.
- Full rules are in the live `GLOBAL-WRITER` SOP addendum (15/11/2026), indexed in the existing `00-SOP_INDEX`. The live Drive document outranks this mirrored guidance.
