#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fail=[];
const read=p=>fs.readFileSync(path.join(root,p));
const policy=JSON.parse(read('docs/agent-skills/superpowers-integration.json'));
const manifest=JSON.parse(read('docs/agent-skills/manifest.json'));
const names=(policy.selected_skills||[]).map(x=>x.name);
if(names.length!==7 || new Set(names).size!==7)fail.push('Must have 7 selected skills');
if(policy.upstream.repository!=='obra/superpowers'|| !/^[a-f0-9]{40}$/.test(policy.upstream.commit))fail.push('Upstream commit not pinned');
if(policy.shortcuts.length!==17 || manifest.shortcuts.length!==17)fail.push('17 SOP mappings missing');
if(!fs.existsSync(path.join(root,'docs/vendor/superpowers/LICENSE')))fail.push('MIT license missing');
for(const item of policy.selected_skills){
 const fp='.agents/skills/'+item.adapter+'/SKILL.md';
 if(!fs.existsSync(path.join(root,fp))||!fs.existsSync(path.join(root,item.source_path))){fail.push('Missing adapter/source '+item.name);continue}
 const c=read(fp).toString('utf8');
 if(!c.startsWith('---\nname: '+item.adapter+'\n'))fail.push('Bad metadata '+item.name);
 if(!c.includes(item.source_path)||!c.includes('3kings-sop-gate')||!c.includes('Read-only')||!c.includes('user authorization')||!c.includes('server-side'))fail.push('Unsafe adapter '+item.name);
}
if(policy.vendored_blobs.length!==20)fail.push('Expected 20 source files');
for(const item of policy.vendored_blobs){
 if(!item.path.startsWith('docs/vendor/superpowers/skills/')||item.path.includes('..')){fail.push('Unsafe path '+item.path);continue}
 if(!fs.existsSync(path.join(root,item.path))){fail.push('Missing vendor file '+item.path);continue}
 const buf=read(item.path);
 const sha=createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
 if(sha!==item.sha1)fail.push('Vendor SHA mismatch '+item.path);
}
for(let i=0;i<17;i++){
 const a=policy.shortcuts[i],b=manifest.shortcuts[i];
 if(!a || a.number!==b.number || a.shortcut!==b.shortcut || a.mode!==b.mode){fail.push('SOP mapping drift '+(i+1));continue}
 if(!a.process_skills.includes('verification-before-completion'))fail.push('Missing verification '+(i+1));
 for(const name of a.process_skills)if(!names.includes(name))fail.push('Invalid process '+name);
 if(['read_only','document_only'].includes(a.mode)&&a.process_skills.some(n=>['using-git-worktrees','test-driven-development','writing-plans','writing-skills','requesting-code-review'].includes(n)))fail.push('Unauthorized code process on '+(i+1));
}
const dirs=fs.readdirSync(path.join(root,'.agents/skills')).filter(x=>x.startsWith('3kings-sp-')).sort();
if(JSON.stringify(dirs)!==JSON.stringify(policy.selected_skills.map(x=>x.adapter).sort()))fail.push('Extra/missing adapter');
if(!read('AGENTS.md').toString().includes('superpowers-integration.json')||!read('.agents/skills/3kings-sop-gate/SKILL.md').toString().includes('superpowers-integration.json'))fail.push('SOP routing not connected');
if(fail.length){console.error('FAIL\n'+fail.join('\n'));process.exit(1)}
console.log('PASS: seven Superpowers adapters; 17 protected SOP mappings; 20 source file hashes; MIT attribution');
