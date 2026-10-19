import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateRelease,orderedDecision} from '../scripts/release-policy.mjs';
const sha='a'.repeat(40), main='b'.repeat(40);
const item={priority:1,pr:155,policy:'candidate',ci_checks:['build']};
function valid() { return {
 repository:'pkraiwit2614-web/3kings-site-report',
 sop:{valid:true,source:'live_drive_full_sop',revisionMatchesIndex:true},
 pr:{number:155,state:'open',draft:false,mergeable:true,base:'main',headSha:sha,headRepo:'pkraiwit2614-web/3kings-site-report'},
 mainSha:main,production:{sha:main,ready:true,aliasVerified:true},
 statuses:[],checks:[{name:'build',conclusion:'success',head_sha:sha,source:'GitHub Actions'}],
 preview:{sha,ready:true,environment:'preview',usesIsolatedTestData:true},
 reviews:{verified:true,sha},changedFiles:['tests/safe.test.mjs'],
 authorization:{currentSop16:true,pr:155,headSha:sha}
};}
test('hypothetical authorized evidence passes policy, NOT actual release',()=>assert.equal(evaluateRelease(item,valid()).eligible,true));
function blocked(name,mutate,reason){test(name,()=>{const x=valid();mutate(x);assert.ok(evaluateRelease(item,x).blockers.includes(reason));});}
blocked('build rate limit',x=>x.statuses=[{context:'Vercel',state:'failure',target_url:'https://vercel.com/?upgradeToPro=build-rate-limit'}],'BLOCK_BUILD_RATE_LIMIT');
blocked('no current live SOP',x=>x.sop.valid=false,'BLOCK_LIVE_SOP_ATTESTATION');
blocked('Production behind main',x=>x.production.sha='c'.repeat(40),'BLOCK_MAIN_PRODUCTION_DRIFT');
blocked('Preview wrong SHA',x=>x.preview.sha='c'.repeat(40),'BLOCK_EXACT_PREVIEW');
blocked('Preview uses real database',x=>x.preview.usesIsolatedTestData=false,'BLOCK_PREVIEW_ISOLATION');
blocked('missing CI',x=>x.checks=[],'BLOCK_REQUIRED_CI');
blocked('unverified review',x=>x.reviews.verified=false,'BLOCK_SCOPED_REVIEW');
blocked('database migration',x=>x.changedFiles=['supabase/migrations/test.sql'],'BLOCK_SENSITIVE_DIFF');
blocked('wrong PR',x=>x.pr.number=170,'BLOCK_PR_IDENTITY');
blocked('authorization revoked',x=>x.authorization.currentSop16=false,'BLOCK_EXPLICIT_RELEASE_AUTH');
test('no evidence always fails closed',()=>assert.equal(evaluateRelease(item,{}).eligible,false));
test('all other work held',()=>{const d=orderedDecision({mode:'observe_only',entries:[item,{priority:2,pr:170,policy:'hold'}]},{155:valid()});assert.equal(d[0].eligible,true);assert.ok(d[1].blockers.includes('BLOCK_QUEUE_HOLD'));});
test('duplicate IDs fail',()=>assert.throws(()=>orderedDecision({mode:'observe_only',entries:[item,item]},{}),/DUPLICATE/));
test('execution mode impossible',()=>assert.throws(()=>orderedDecision({mode:'execute',entries:[item]},{}),/UNSUPPORTED/));
