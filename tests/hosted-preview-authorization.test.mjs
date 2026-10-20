import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRequest, validateDeployment, REPO, VERCEL_PROJECT } from '../scripts/authorize-hosted-preview.mjs'
const sha = 'a'.repeat(40)
const url = 'https://3kings-site-report-a1b2c3d4e-kraiwit-p-golfiiz-sqr.vercel.app/'
const inp={repo:REPO,actor:'pkraiwit2614-web',ref:'refs/heads/main',prNumber:'12',sha,previewUrl:url}
const pr={number:12,state:'open',draft:false,base:{ref:'main'},head:{sha,repo:{full_name:REPO}}}
const runs=[{head_sha:sha,event:'pull_request',status:'completed',conclusion:'success'}]
test('Allow only owner triggered manual verification of exact current first party green PR',()=>{
  assert.equal(validateRequest(inp,pr,runs),url)
  for(const changed of [
    {actor:'unknown'},{ref:'refs/heads/test'},{repo:'other/repo'},{sha:'b'.repeat(40)},
    {previewUrl:'https://evil.example/'}
  ]) assert.throws(()=>validateRequest({...inp,...changed},pr,runs))
  assert.throws(()=>validateRequest(inp,{...pr,head:{...pr.head,repo:{full_name:'fork/repo'}}},runs))
  assert.equal(validateRequest(inp,{...pr,draft:true},runs),url)
  assert.throws(()=>validateRequest({...inp,previewUrl:'https://3kings-site-report-git-main-kraiwit-p-golfiiz-sqr.vercel.app/'},pr,runs))
  assert.throws(()=>validateRequest(inp,pr,[{...runs[0],conclusion:'skipped'}]))
  assert.throws(()=>validateRequest(inp,pr,[{...runs[0],head_sha:'b'.repeat(40)}]))
})
test('Vercel identity must prove exact preview SHA, project and READY state',()=>{
  const d={projectId:VERCEL_PROJECT,target:null,readyState:'READY',
    url:'3kings-site-report-a1b2c3d4e-kraiwit-p-golfiiz-sqr.vercel.app',
    meta:{githubCommitSha:sha}}
  assert.equal(validateDeployment(d,sha,url),true)
  for(const x of [
    {...d,target:'production'},{...d,target:'staging'},{...d,projectId:'other'},
    {...d,readyState:'BUILDING'},{...d,meta:{githubCommitSha:'b'.repeat(40)}},
    {...d,meta:{}},{...d,url:'other.vercel.app'},
    {...d,gitSource:{sha:'b'.repeat(40)}}
  ]) assert.throws(()=>validateDeployment(x,sha,url))
})
