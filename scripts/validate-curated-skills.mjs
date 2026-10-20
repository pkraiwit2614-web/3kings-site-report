#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = p => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(load('docs/agent-skills/manifest.json'));
const catalog = JSON.parse(load('docs/agent-skills/curated-skills.json'));
const workflow = load('.github/workflows/agent-skills-validation.yml');
const agentRules = load('AGENTS.md');
const errs = [];
const check = (ok, message) => {if (!ok) errs.push(message)};
check(manifest.shortcuts.length === 17, 'Expected exactly 17 unchanged SOP entries');
check(new Set(manifest.shortcuts.map(s=>s.number)).size === 17, 'Duplicate SOP ID');
check(new Set(manifest.shortcuts.map(s=>s.shortcut)).size === 17, 'Duplicate shortcut text');
check(catalog.adapters.length === 3, 'Expected exactly 3 curated adapters');
check(catalog.requires_explicit_activation === true, 'Optional invocation must be explicit');
check(catalog.auto_install === false && catalog.runtime_enforcement === false && catalog.production_deploy === false, 'Unsafe runtime/install/deploy declaration');
check(catalog.does_not_modify_sop_manifest === true, 'Cannot replace the 17 SOP manifest');
check(agentRules.includes('curated-skills.json'), 'AGENTS.md missing guarded optional routing');
check(workflow.includes('node scripts/validate-curated-skills.mjs'), 'Curated CI check absent');
for (const a of catalog.adapters) {
  check(/^curated-3kings-[a-z-]+$/.test(a.name), 'Bad curated name: ' + a.name);
  check(a.path === '.agents/skills/' + a.name + '/SKILL.md', 'Wrong adapter path: ' + a.name);
  const content = fs.existsSync(path.join(root, a.path)) ? load(a.path) : '';
  check(content.startsWith('---\nname: ' + a.name + '\n'), 'Missing skill frontmatter: ' + a.name);
  check(content.includes('3kings-sop-gate') && content.includes('SOP'), 'SOP-first gate absent: ' + a.name);
  check(/(not installed|NOT installed)/.test(content), 'Upstream install limitations missing: ' + a.name);
  check(!/BEGIN PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY\s*=|Bearer\s+[a-zA-Z0-9]{25,}/.test(content), 'Secret-like data in skill: ' + a.name);
  for (const source of a.sources) {
    check(/^[a-f0-9]{40}$/.test(source.commit), 'Unpinned source ' + source.repo);
    check(source.execution.includes('only') || source.execution.includes('no_upstream'), 'Unsafe source mode ' + source.repo);
  }
}
check(new Set(catalog.adapters.map(a=>a.name)).size === 3, 'Duplicate curated skill names');
check(!catalog.adapters.some(a=>/3kings-sp-|3kings-\d\d/.test(a.name)), 'Curated adapters collide with original Skills');
if (errs.length) { console.error('FAIL curated skill pack\n- ' + errs.join('\n- ')); process.exitCode = 1; }
else console.log('PASS: 3 optional curated adapters; 17 SOP entries; no autonomous runtime/install/deploy.');
