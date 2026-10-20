import test from "node:test";
import assert from "node:assert/strict";
import { assessSnapshot, proposeImprovements } from "../scripts/task-observer-release-gate.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);
function snapshot(number = 1, overrides = {}) {
  return {
    number, head_sha: A, draft: false, changed_files: 1, files: ["docs/readme.md"],
    checks_complete: true, statuses_complete: true, files_complete: true,
    check_runs: [{ name: "CI", head_sha: A, status: "completed", conclusion: "success" }],
    statuses: [{ state: "success", sha: A, description: "CI passed" }],
    ...overrides
  };
}
test("matching green GitHub checks remain review-only, never release PASS", () => {
  const v = assessSnapshot(snapshot());
  assert.equal(v.state, "CHECKS_REVIEW_ONLY");
  assert.ok(v.notes.includes("PRODUCTION_SHA_UNVERIFIED"));
  assert.ok(v.notes.includes("REQUIRED_RULESET_UNVERIFIED"));
  assert.equal(v.evidence, true);
});
test("skipped cannot be treated as PASS", () => {
  const v = assessSnapshot(snapshot(2, {check_runs: [{name: "Hosted Preview",head_sha:A,status:"completed",conclusion:"skipped"}]}));
  assert.ok(v.notes.includes("CHECK_NOT_PROVEN_PASS"));
  assert.notEqual(v.state, "RELEASE_READY");
});
test("mismatched SHA cannot reuse CI proof", () => {
  const v = assessSnapshot(snapshot(3, {check_runs: [{name:"CI",head_sha:B,status:"completed",conclusion:"success"}]}));
  assert.ok(v.blockers.includes("CHECK_SHA_MISMATCH"));
  assert.equal(v.state, "HOLD_OR_UNVERIFIED");
});
test("incomplete evidence is a HOLD, not a confirmed recurring failure", () => {
  const v = assessSnapshot(snapshot(4, {files_complete:false}));
  assert.ok(v.blockers.includes("GITHUB_EVIDENCE_PARTIAL"));
  assert.equal(v.evidence, false);
});
test("recognizes provider quota signal without triggering any build", () => {
  const v = assessSnapshot(snapshot(5, {statuses:[{state:"error",sha:A,description:"build-rate-limit api-deployments-free-per-day"}]}));
  assert.ok(v.notes.includes("EXTERNAL_BUILD_QUOTA_SIGNAL"));
  assert.ok(v.blockers.includes("COMMIT_STATUS_FAILED"));
});
test("needs two DISTINCT evidence-complete PRs for SOP proposal", () => {
  const failed = n=>assessSnapshot(snapshot(n,{check_runs:[{name:"build",head_sha:A,status:"completed",conclusion:"failure"}]}));
  const props = proposeImprovements([failed(21), failed(22), failed(22)]);
  assert.equal(props.length, 1);
  assert.deepEqual(props[0].pr_numbers,[21,22]);
  assert.equal(props[0].status,"PROPOSED_ONLY");
  assert.equal(props[0].sop,"SOP 15");
});
test("incomplete snapshots cannot create SOP change candidates", () => {
  const partial = n=>assessSnapshot(snapshot(n,{read_error:true}));
  assert.deepEqual(proposeImprovements([partial(31),partial(32)]),[]);
});
test("high impact paths are flagged for review without claiming regression", () => {
  const v=assessSnapshot(snapshot(6,{files:["supabase/migrations/123.sql"]}));
  assert.ok(v.notes.includes("HIGH_IMPACT_PATH_REVIEW"));
});
test("missing head identity is unverified", () => {
  const v=assessSnapshot({number:7,head_sha:"not-a-sha"});
  assert.equal(v.state,"UNVERIFIED");
});
