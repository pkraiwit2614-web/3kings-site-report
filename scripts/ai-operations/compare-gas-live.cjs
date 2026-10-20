'use strict';
// Apps Script P1: GET-only comparison; no source, token, script ID or response body in output.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const unix=text=>text.replace(/\r\n/g,'\n');
const safeName=value=>typeof value==='string'&&value.length>0&&!/[\\/\r\n]/.test(value)&&value!=='.'&&value!=='..';
function validateMapping(root,mapping){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/ai-operations/gas-source-manifest.json'),'utf8'));
 if(manifest.mode!=='staging'||!Array.isArray(manifest.paths)||manifest.paths.length!==7||new Set(manifest.paths).size!==7||!manifest.paths.every(name=>safeName(name)&&name.endsWith('.gs')&&!name.includes('..')))throw Error('INVALID_GIT_MANIFEST');
 if(mapping?.version!==1||!Array.isArray(mapping.targets)||mapping.targets.length!==manifest.paths.length)throw Error('MAPPING_INCOMPLETE');
 const seen=new Set();
 for(const t of mapping.targets){
  if(!manifest.paths.includes(t.gitFile)||seen.has(t.gitFile)||!safeName(t.remoteFile)||!/^[A-Za-z0-9_-]{12,200}$/.test(t.scriptId||'')||(t.versionNumber!==undefined&&(!Number.isSafeInteger(t.versionNumber)||t.versionNumber<1)))throw Error('MAPPING_INVALID');
  seen.add(t.gitFile);
 }
 return manifest.paths.map(name=>mapping.targets.find(t=>t.gitFile===name));
}
async function compare({root=ROOT,mapping,token,fetchFn=globalThis.fetch}){
 if(typeof token!=='string'||token.length<10)throw Error('READONLY_TOKEN_REQUIRED');
 const targets=validateMapping(root,mapping);
 const cache=new Map(),findings=[];
 for(const t of targets){
  const key=JSON.stringify([t.scriptId,t.versionNumber||null]);
  if(!cache.has(key)){
   const url=new URL('https://script.googleapis.com/v1/projects/'+encodeURIComponent(t.scriptId)+'/content');
   if(t.versionNumber)url.searchParams.set('versionNumber',String(t.versionNumber));
   let response;
   try{response=await fetchFn(url.toString(),{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});}
   catch{throw Error('GOOGLE_API_REQUEST_FAILED');}
   if(!response?.ok)throw Error('GOOGLE_API_HTTP_'+(Number(response?.status)||'UNKNOWN'));
   let data;
   try{data=await response.json();}catch{throw Error('GOOGLE_API_INVALID_JSON');}
   if(!Array.isArray(data?.files))throw Error('GOOGLE_API_INVALID_CONTENT');
   cache.set(key,data.files);
  }
  const local=fs.readFileSync(path.join(root,'docs/apps-script',t.gitFile),'utf8');
  const matches=cache.get(key).filter(f=>f?.name===t.remoteFile&&f?.type==='SERVER_JS');
  if(matches.length>1)throw Error('AMBIGUOUS_REMOTE_FILE');
  const remote=matches[0]?.source;
  if(remote===undefined){findings.push({gitFile:t.gitFile,version:t.versionNumber??'HEAD',status:'REMOTE_NOT_FOUND'});continue;}
  if(typeof remote!=='string')throw Error('GOOGLE_API_INVALID_SOURCE');
  const status=local===remote?'EXACT_MATCH':unix(local)===unix(remote)?'LINE_ENDINGS_ONLY':'CONTENT_DIFF';
  findings.push({gitFile:t.gitFile,version:t.versionNumber??'HEAD',status,gitSha256:hash(local),liveSha256:hash(remote)});
 }
 return{mode:'READ_ONLY_GET',codeOrigin:'GOOGLE_APPS_SCRIPT_API',verification:'HEAD_OR_EXPLICIT_VERSION_NOT_LIVE_DEPLOYMENT',checked:findings.length,results:findings};
}
if(require.main===module){
 (async()=>{
  const mappingFile=process.env.GAS_PROJECT_MAPPING_FILE;
  if(!mappingFile)throw Error('PRIVATE_MAPPING_FILE_REQUIRED');
  const mapping=JSON.parse(fs.readFileSync(mappingFile,'utf8'));
  const result=await compare({mapping,token:process.env.GAS_READONLY_ACCESS_TOKEN});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.results.some(x=>x.status!=='EXACT_MATCH'))process.exitCode=2;
 })().catch(err=>{process.stderr.write('P1_BLOCKED: '+String(err.message).replace(/[^A-Z0-9_]/g,'')+'\n');process.exitCode=1;});
}
module.exports={compare,validateMapping};
