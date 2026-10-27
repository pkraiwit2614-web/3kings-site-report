'use strict';
// #201: offline, fail-closed three-field SmartSync projection patch.
// Never reads Google credentials, calls an API, or modifies the provided source.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const rules = [
  ['current_status: webConfirmed ? old.current_status : src.current_status,', 'current_status: src.current_status,'],
  ['status_group: webConfirmed ? old.status_group : src.status_group,', 'status_group: src.status_group,'],
  ['next_action: webConfirmed ? old.next_action : src.next_action,', 'next_action: src.next_action,'],
];
function patch(source) {
  if (typeof source !== 'string' || source.length < 100) throw Error('INVALID_SOURCE');
  const required = [
    /EXPECTED_ROOMS:\s*263\b/,
    /EXPECTED_A:\s*162\b/,
    /EXPECTED_B:\s*101\b/,
    /validateDefectInventory_\s*\(/,
    /defectV13ScopedChanges_\s*\(/,
    /file\.getId\(\)\s*!==\s*DEFECT_V13\.SOURCE_FILE_ID/,
    /latest_source:\s*webConfirmed\s*\?\s*old\.latest_source/,
    /source_note:\s*webConfirmed\s*\?/,
  ];
  if (!required.every(re => re.test(source))) throw Error('LIVE_SAFETY_GUARD_MISMATCH');
  let output = source;
  for (const [before, after] of rules) {
    const found = output.split(before).length - 1;
    if (found !== 1) throw Error('UNEXPECTED_LIVE_PROJECTION_MATCH_COUNT');
    output = output.replace(before, after);
  }
  if (output === source) throw Error('NO_DIFF');
  if (!/latest_source:\s*webConfirmed\s*\?\s*old\.latest_source/.test(output) ||
      !/source_note:\s*webConfirmed\s*\?/.test(output)) throw Error('PROVENANCE_GUARD_CHANGED');
  return {content:output,changedFields:['current_status','status_group','next_action'],
    originalSha256:hash(source),candidateSha256:hash(output)};
}
if (require.main === module) {
  try {
    const [input,output] = process.argv.slice(2);
    if (!input || !output) throw Error('INPUT_OUTPUT_REQUIRED');
    const sourcePath = path.resolve(input),outputPath=path.resolve(output);
    if (sourcePath === outputPath) throw Error('IN_PLACE_WRITE_FORBIDDEN');
    const repoRoot = path.resolve(__dirname,'../..') + path.sep;
    if (outputPath.startsWith(repoRoot)) throw Error('OUTPUT_MUST_BE_PRIVATE');
    const r = patch(fs.readFileSync(sourcePath,'utf8'));
    fs.writeFileSync(outputPath,r.content,{encoding:'utf8',flag:'wx',mode:0o600});
    process.stdout.write(JSON.stringify({mode:'OFFLINE_CANDIDATE_ONLY',changedFields:r.changedFields,
      originalSha256:r.originalSha256,candidateSha256:r.candidateSha256})+'\n');
  } catch (err) {
    process.stderr.write('BLOCKED: '+String(err.message).slice(0,90)+'\n');
    process.exitCode=1;
  }
}
module.exports={patch};
