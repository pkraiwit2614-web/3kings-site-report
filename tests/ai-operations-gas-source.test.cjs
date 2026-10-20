const test=require('node:test');const assert=require('node:assert/strict');
const {audit}=require('../scripts/ai-operations/audit-gas-source.cjs');
test('tracked Apps Script sources have immutable fingerprints',()=>{
 const result=audit();assert.equal(result.mode,'STAGING_READ_ONLY');
 assert.equal(result.liveProjects,'UNVERIFIED');
 assert.equal(result.files.length,7);
 for(const item of result.files)assert.match(item.sha256,/^[a-f0-9]{64}$/);
});
