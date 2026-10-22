#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const m = JSON.parse(fs.readFileSync(path.join(root, "docs/agent-skills/manifest.json"), "utf8"));
const allowed = new Set(["read_only", "document_only", "authorized_write", "code_change", "deploy"]);
const errors = [];
const skillRoot = path.join(root, ".agents/skills");
const entries = m.shortcuts ?? [];
if (entries.length !== 17) errors.push("Expected exactly 17 shortcut rows");
if (new Set(entries.map(x => x.number)).size !== 17) errors.push("Duplicate shortcut numbers");
if (new Set(entries.map(x => x.name)).size !== 17) errors.push("Duplicate skill names");
if (new Set(entries.map(x => x.shortcut)).size !== 17) errors.push("Duplicate shortcut text");
if (!fs.existsSync(path.join(root, "AGENTS.md"))) errors.push("AGENTS.md missing");
if (!fs.existsSync(path.join(skillRoot, "3kings-sop-gate/SKILL.md"))) errors.push("SOP Gate skill missing");
for (let i = 1; i <= 17; i++) {
 const v = entries.find(x=>x.number === i);
 if (!v) {errors.push("Missing number " + i); continue;}
 const fp = path.join(skillRoot, v.name, "SKILL.md");
 if (!fs.existsSync(fp)){errors.push("Missing file "+v.name);continue;}
 const s = fs.readFileSync(fp, "utf8");
 if (!s.startsWith("---\nname: "+v.name+"\n")) errors.push("Invalid YAML frontmatter name: "+v.name);
 if (!s.includes(v.shortcut) || !s.includes(v.sop_title)) errors.push("SOP/shortcut not referenced: "+v.name);
 if (!s.includes("SOP Gate") || !s.includes("readback")) errors.push("Missing preflight/readback safety: "+v.name);
 if (!allowed.has(v.mode)) errors.push("Unknown mode "+v.name);
 if (v.requires_live_drive_read !== true) errors.push("No live SOP requirement "+v.name);
 if (v.mode==="read_only" && !s.includes("No persistent mutations")) errors.push("Read-only guard missing: "+v.name);
}
const folders=fs.readdirSync(skillRoot,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name);
const expected=new Set(["3kings-sop-gate","3kings-task-observer",...entries.map(x=>x.name)]);
for(const f of folders){if(f.startsWith("3kings-") && !f.startsWith("3kings-sp-") && !expected.has(f))errors.push("Unregistered skill "+f);}
const forbidden=[/service_role\s*[:=]\s*['"]/i,/BEGIN PRIVATE KEY/,/SUPABASE_SERVICE_ROLE_KEY\s*=/];
for(const f of ["AGENTS.md","docs/agent-skills/README.md","docs/agent-skills/manifest.json"]){
 const content=fs.readFileSync(path.join(root,f),"utf8");
 for(const pattern of forbidden)if(pattern.test(content))errors.push("Possible secret in "+f);
}
// Shared canonical SOP 08+11 is one full document with independent document-only triggers.
const progress08=entries.find(x=>x.number===8);
const weekly11=entries.find(x=>x.number===11);
if (!progress08 || !weekly11 || progress08.sop_title !== weekly11.sop_title) errors.push("SOP 08 and 11 must share canonical full SOP title");
if (progress08?.mode !== "document_only" || weekly11?.mode !== "document_only") errors.push("SOP 08/11 output-only roles must remain document_only");
if(errors.length){console.error("FAIL",errors.join("\n"));process.exit(1);}
console.log("PASS: 17 SOP-linked skills + gate and agent instructions; static contract only.");
