/** GitHub/Vercel release queue monitor: HEAD/GET only. No merge or deploy endpoint exists here. */
import {readFile,appendFile} from 'node:fs/promises';
import {evaluateRelease} from './release-policy.mjs';
const repository=process.env.GITHUB_REPOSITORY||'pkraiwit2614-web/3kings-site-report';
const ghToken=process.env.GITHUB_TOKEN||'';
const vercelToken=process.env.KINGS_VERCEL_READ_TOKEN||'';
const projectId=process.env.KINGS_VERCEL_PROJECT_ID||'';
const teamId=process.env.KINGS_VERCEL_TEAM_ID||'';
const expectedAlias=process.env.KINGS_VERCEL_PRODUCTION_ALIAS||'';
async function readJson(url,headers) {
 const response=await fetch(url,{method:'GET',headers,signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw Error('READ_HTTP_'+response.status);
 return response.json();
}
async function gh(path){
 return readJson('https://api.github.com/repos/'+repository+path,{
  Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
  ...(ghToken?{Authorization:'Bearer '+ghToken}:{})
 });
}
async function vc(path){
 if(!vercelToken||!projectId||!teamId||!expectedAlias)throw Error('VERCEL_READ_CONFIG_MISSING');
 return readJson('https://api.vercel.com'+path+(path.includes('?')?'&':'?')+'teamId='+encodeURIComponent(teamId),
    {Authorization:'Bearer '+vercelToken});
}
async function production(){
 try{
  const list=await vc('/v6/deployments?projectId='+encodeURIComponent(projectId)+'&target=production&limit=10');
  const latest=(list.deployments||[]).filter(d=>d.target==='production').sort((a,b)=>b.created-a.created)[0];
  if(!latest||latest.state!=='READY')return {ready:false,sha:null,aliasVerified:false};
  const detail=await vc('/v13/deployments/'+encodeURIComponent(latest.uid||latest.id));
  return {ready:detail.readyState==='READY'||detail.state==='READY',
    sha:detail.meta?.githubCommitSha||latest.meta?.githubCommitSha||null,
    aliasVerified:(detail.alias||[]).includes(expectedAlias)};
 }catch{return {ready:false,sha:null,aliasVerified:false};}
}
async function preview(sha){
 try{
  const list=await vc('/v6/deployments?projectId='+encodeURIComponent(projectId)+'&sha='+sha+'&limit=10');
  const found=(list.deployments||[]).find(d=>d.meta?.githubCommitSha===sha&&
      (d.target===null||d.target==='preview')&&d.state==='READY');
  return {ready:!!found,sha:found?.meta?.githubCommitSha||null,
    environment:'preview',usesIsolatedTestData:false};
 }catch{return {ready:false,sha:null,environment:'preview',usesIsolatedTestData:false};}
}
async function evidence(entry,mainSha,prod){
 const pr=await gh('/pulls/'+entry.pr);const sha=pr.head?.sha||'';
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('BLOCK_INVALID_HEAD');
 const [runs,statuses,files,pv]=await Promise.all([
   gh('/commits/'+sha+'/check-runs?per_page=100'),
   gh('/commits/'+sha+'/statuses?per_page=100'),
   gh('/pulls/'+entry.pr+'/files?per_page=100'),
   preview(sha)
 ]);
 if(runs.total_count>100||files.length===100)throw Error('BLOCK_PAGINATION_UNVERIFIED');
 return {
  repository,mainSha,production:prod,
  pr:{number:pr.number,state:pr.state,draft:pr.draft,mergeable:pr.mergeable===true,
      base:pr.base?.ref,headSha:sha,headRepo:pr.head?.repo?.full_name},
  checks:(runs.check_runs||[]).map(c=>({name:c.name,conclusion:c.conclusion,
      head_sha:c.head_sha,source:c.app?.slug==='github-actions'?'GitHub Actions':'other'})),
  statuses:statuses.map(s=>({context:s.context,state:s.state,target_url:s.target_url})),
  changedFiles:files.map(f=>f.filename),preview:pv,
  // This runner has NO Google Drive or protected Preview/Owner proof: fail closed.
  sop:{valid:false,source:'NOT_VERIFIED_IN_RUNNER',revisionMatchesIndex:false},
  reviews:{verified:false,sha:null},
  authorization:{currentSop16:false,pr:entry.pr,headSha:sha}
 };
}
const queue=JSON.parse(await readFile(new URL('../config/release-queue.json',import.meta.url),'utf8'));
if(queue.mode!=='observe_only'||!Array.isArray(queue.entries))throw Error('BLOCK_QUEUE_MODE');
const entries=[...queue.entries].sort((a,b)=>a.priority-b.priority);
if(new Set(entries.map(x=>x.pr)).size!==entries.length)throw Error('BLOCK_QUEUE_DUPLICATE');
let mainSha=null,prod={ready:false,sha:null,aliasVerified:false};
try {mainSha=(await gh('/branches/main')).commit?.sha||null;prod=await production();}
catch(e){console.log('READ_BLOCK:',e.message);}
const result=[];
for(const entry of entries){
 if(entry.policy!=='candidate'){result.push({pr:entry.pr,decision:'HOLD',reason:entry.policy});continue;}
 try {
  const state=await evidence(entry,mainSha,prod);
  const verdict=evaluateRelease(entry,state);
  result.push({pr:entry.pr,decision:verdict.eligible?'GATE_CHECK_REQUIRED':'BLOCK',
    reason:verdict.blockers.join(', ')});
 }catch(e){result.push({pr:entry.pr,decision:'BLOCK',reason:'BLOCK_SOURCE_READ: '+e.message});}
}
const summary=['## 3 Kings Release Watch — no writes','','**NO MERGE / NO DEPLOY / NO DATABASE WRITES**',
'- GitHub main: '+(mainSha?.slice(0,12)||'UNVERIFIED'),
'- Vercel Production: '+(prod.ready?prod.sha?.slice(0,12):'UNVERIFIED'),
'- Production alias proof: '+(prod.aliasVerified?'VERIFIED':'UNVERIFIED'),
'- Vercel credentials: '+(vercelToken&&projectId&&teamId&&expectedAlias?'CONFIGURED':'MISSING'),
'', '|Priority|PR|State|Blockers|','|---:|---:|---|---|',
...result.map((r,i)=>'|'+(i+1)+'|#'+r.pr+'|'+r.decision+'|'+r.reason.replace(/\|/g,'/')+'|'),
'','This workflow is an observer. Only a separately reviewed SOP-gated release executor may merge or deploy.'];
console.log(summary.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary.join('\n')+'\n');
