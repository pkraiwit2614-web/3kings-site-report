#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const manifest=JSON.parse(read("docs/agent-skills/manifest.json"));
const integration=JSON.parse(read("docs/agent-skills/task-observer-integration.json"));
const rootSkill=".agents/skills/3kings-task-observer/";
const source=read(rootSkill+"SKILL.md");
const contract=read(rootSkill+"references/observation-contract.md");
const compatibility=read(rootSkill+"references/chatgpt-compatibility.md");
const agents=read("AGENTS.md");
const workflow=read(".github/workflows/agent-skills-validation.yml");
const errors=[];
const check=(condition,description)=>{if(!condition)errors.push(description);};

check(manifest.shortcuts?.length===17,"Manifest must retain exactly 17 shortcuts");
check(integration.shortcuts?.length===17,"Observer integration must map exactly 17 shortcuts");
check(integration.runtime_enforcement===false,"Observer must not claim runtime enforcement");
check(integration.auto_install===false,"Observer must not claim automatic install");
check(integration.writes_authorized===false,"Observer cannot authorize writes");
check(/private_only_after_verified_configuration/.test(integration.storage||""),"Private-only storage policy missing");
const sourceNums=manifest.shortcuts.map(x=>x.number);
check(new Set(integration.shortcuts.map(x=>x.number)).size===17,"Duplicate observer mappings");
check(JSON.stringify([...sourceNums].sort((a,b)=>a-b))===JSON.stringify([...integration.shortcuts.map(x=>x.number)].sort((a,b)=>a-b)),"Missing observer mappings");
for(const s of manifest.shortcuts){
 const item=integration.shortcuts.find(x=>x.number===s.number);
 if(!item){errors.push("Missing observer shortcut "+s.number);continue;}
 for(const key of ["shortcut","mode"])check(item[key]===s[key],"Observer differs on "+key+" for "+s.number);
 check(item.skill===s.name,"Observer skill name mismatch "+s.number);
 check(item.observer==="3kings-task-observer","Observer identity mismatch "+s.number);
 check(item.activation==="after_live_sop_preflight","SOP must run first "+s.number);
 check(item.observer_privilege==="advisory_read_only","Observer privilege must be read-only "+s.number);
 check(fs.existsSync(path.join(root,".agents/skills",s.name,"SKILL.md")),"Numbered Skill missing "+s.name);
}
check(source.startsWith("---\nname: 3kings-task-observer\n"),"Skill frontmatter malformed");
for(const phrase of ["SOP Gate","live Google Drive SOP","17","No universal ChatGPT hook","CC BY 4.0","references/chatgpt-compatibility.md","references/observation-contract.md"])
 check(source.includes(phrase),"Observer source missing required policy: "+phrase);
check(contract.includes("NOT PERSISTED"),"No ChatGPT handoff marking");
check(compatibility.includes("GitHub commit is NOT an installation"),"Missing ChatGPT non-install boundary");
check(agents.includes("3kings-task-observer"),"AGENTS.md does not activate observer for agent tasks");
check(workflow.includes("node scripts/validate-task-observer.mjs"),"Agent Skills CI does not run observer validator");
check(!fs.existsSync(path.join(root,"skill-observations")),"Public repo contains observation logs");
check(!fs.existsSync(path.join(root,"skill-updates")),"Public repo contains unreviewed staged skill updates");
const bad=[/BEGIN PRIVATE KEY/,/SUPABASE_SERVICE_ROLE_KEY\s*=/,/Bearer\s+[a-zA-Z0-9]{25,}/];
for(const [name,value] of [["skill",source],["contract",contract],["compatibility",compatibility],["integration",JSON.stringify(integration)]])
 for(const rule of bad)check(!rule.test(value),"Potential secret in "+name);
if(errors.length){console.error("FAIL: task-observer contract\n"+errors.map(x=>"- "+x).join("\n"));process.exit(1);}
console.log("PASS: 3kings-task-observer read-only ChatGPT adapter; all 17 mappings; no runtime/writeback or public observation logs.");
