'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {compare,validateMapping}=require('../scripts/ai-operations/compare-gas-live.cjs');
const root=path.resolve(__dirname,'..');
const manifest=require('../docs/ai-operations/gas-source-manifest.json');
const targets=manifest.paths.map((name,i)=>({gitFile:name,scriptId:'fake-script-project-'+String(i).padStart(2,'0'),remoteFile:'Remote_'+i}));
const mapping={version:1,targets};
const originals=targets.map(t=>fs.readFileSync(path.join(root,'docs/apps-script',t.gitFile),'utf8'));
function mock(getSource=(i)=>originals[i]){
 const requests=[];
 const fetchFn=async(url,opts)=>{
  requests.push({url,opts});
  const i=targets.findIndex(t=>url.includes(t.scriptId));
  assert.notEqual(i,-1);
  return{ok:true,status:200,json:async()=>({files:[{name:targets[i].remoteFile,type:'SERVER_JS',source:getSource(i)}]})};
 };
 return{requests,fetchFn};
}
test('all 7 Git snapshots compared through GET only; no token or Script IDs in report',async()=>{
 const {requests,fetchFn}=mock();
 const result=await compare({root,mapping,token:'TEST_ONLY_DO_NOT_USE',fetchFn});
 assert.equal(result.checked,7);
 assert.ok(result.results.every(x=>x.status==='EXACT_MATCH'));
 assert.equal(requests.length,7);
 for(const {url,opts} of requests){assert.equal(new URL(url).hostname,'script.googleapis.com');assert.equal(opts.method,'GET');assert.ok(!opts.body);}
 assert.ok(!JSON.stringify(result).includes('TEST_ONLY_DO_NOT_USE'));
 assert.ok(!JSON.stringify(result).includes('fake-script-project'));
});
test('detects changed source and CRLF-only differences without leaking source',async()=>{
 const {fetchFn}=mock(i=>i===0?originals[i]+'\n//CHANGED_PRIVATE':i===1?(originals[i].includes('\r\n')?originals[i].replace(/\r\n/g,'\n'):originals[i].replace(/\n/g,'\r\n')):originals[i]);
 const result=await compare({root,mapping,token:'TEST_ONLY_DO_NOT_USE',fetchFn});
 assert.equal(result.results[0].status,'CONTENT_DIFF');
 assert.equal(result.results[1].status,'LINE_ENDINGS_ONLY');
 assert.ok(!JSON.stringify(result).includes('CHANGED_PRIVATE'));
});
test('rejects missing or unsafe mappings',()=>{
 assert.throws(()=>validateMapping(root,{version:1,targets:targets.slice(0,6)}),/MAPPING_INCOMPLETE/);
 assert.throws(()=>validateMapping(root,{version:1,targets:[{...targets[0],scriptId:'bad'}].concat(targets.slice(1))}),/MAPPING_INVALID/);
});
test('fails closed when Google API denies access or token missing',async()=>{
 await assert.rejects(compare({root,mapping,token:'TEST_ONLY_DO_NOT_USE',fetchFn:async()=>({ok:false,status:403,json:async()=>({error:{message:'secret'}})})}),/GOOGLE_API_HTTP_403/);
 await assert.rejects(compare({root,mapping,token:''}),/READONLY_TOKEN_REQUIRED/);
});
test('missing remote file is reported, never silently matched',async()=>{
 const {fetchFn}=mock(i=>i===0?undefined:originals[i]);
 const result=await compare({root,mapping,token:'TEST_ONLY_DO_NOT_USE',fetchFn});
 assert.equal(result.results[0].status,'REMOTE_NOT_FOUND');
 assert.equal(result.results[0].liveSha256,undefined);
});
