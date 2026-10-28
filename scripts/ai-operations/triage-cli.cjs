#!/usr/bin/env node
'use strict';
// Offline-only; no network, credential reads, database connections or executor invocation.
const fs = require('node:fs');
const path = require('node:path');
const {buildReport} = require('./central-error-log.cjs');
function main(args) {
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output') {
    process.stderr.write('Usage: node triage-cli.cjs --input snapshots.json --output report.json\n');
    return 2;
  }
  const input = path.resolve(args[1]);
  const output = path.resolve(args[3]);
  if (input === output) throw Error('BLOCK_OVERWRITE_SOURCE');
  const stats = fs.statSync(input);
  if (stats.size > 1_000_000) throw Error('INPUT_TOO_LARGE');
  const records = JSON.parse(fs.readFileSync(input, 'utf8'));
  const report = buildReport(records);
  // Restrict the output to a user-selected local path, never source or production.
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag:'wx', mode:0o600});
  process.stdout.write(JSON.stringify({mode:report.mode,accepted:report.acceptedCount,
    rejected:report.rejected.length,groups:report.groups.length}) + '\n');
  return 0;
}
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { process.stderr.write(String(e.message || 'ERROR') + '\n'); process.exitCode = 1; }
}
module.exports = {main};