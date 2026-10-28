#!/usr/bin/env node
'use strict';
// Offline-only staging evaluator. No network, credentials, executor or deploy calls.
const fs=require('node:fs');
const path=require('node:path');
const {planOperations}=require('./staging-control-plane.cjs');
function main(args){
 if(args.length!==4||args[0]!=='--input'||args[2]!=='--output')throw Error('USAGE_INPUT_OUTPUT_REQUIRED');
 const input=path.resolve(args[1]),output=path.resolve(args[3]);
 if(input===output)throw Error('SOURCE_OVERWRITE_BLOCKED');
 if(fs.statSync(input).size>1000000)throw Error('INPUT_TOO_LARGE');
 const request=JSON.parse(fs.readFileSync(input,'utf8'));
 const result=planOperations(request);
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 process.stdout.write(JSON.stringify({mode:result.mode,source:result.phase1.source.status,events:result.phase2.triage.acceptedCount,route:result.phase3.routeStatus})+'\n');
 return 0;
}
if(require.main===module){
 try{process.exitCode=main(process.argv.slice(2))}
 catch(err){const allowed=new Set(['USAGE_INPUT_OUTPUT_REQUIRED','SOURCE_OVERWRITE_BLOCKED','INPUT_TOO_LARGE','STAGING_ACTION_FORBIDDEN','INVALID_SOURCE_EVIDENCE','INVALID_SOURCE_RESULT','CONFLICTING_SOURCE_HASH','INVALID_SOURCE_HASH','INCOMPLETE_SOURCE_RESULTS','INVALID_REQUEST','TARGET_NOT_ALLOWLISTED','EXPECTED_SOURCE_HASH_REQUIRED','INVALID_SOURCE_MANIFEST']);process.stderr.write((allowed.has(err.message)?err.message:'STAGING_EVALUATION_BLOCKED')+'\n');process.exitCode=1}
}
module.exports={main};
