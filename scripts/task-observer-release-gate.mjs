#!/usr/bin/env node
// 3 Kings Release Gate Observer. Read-only, public GitHub metadata only.
// Never performs merge, deploy, PR comment, SOP edit, or production check.
import { fileURLToPath } from "node:url";

const MATCH_LIMIT = /(build.rate.limit|api.deployments.free.per.day|quota.exceeded|http 402|too many deployments)/i;
const RISK_PATH = /^(supabase\/migrations\/|src\/app\/api\/|app\/api\/|middleware\.|src\/middleware\.|\.github\/workflows\/|scripts\/.*(?:sync|deploy|release))/i;
const FAIL = new Set(["failure", "cancelled", "timed_out", "action_required"]);
const OK = new Set(["success"]);

export function assessSnapshot(input) {
  if (!input || !Number.isInteger(input.number) || !/^[0-9a-f]{40}$/i.test(input.head_sha || "")) {
    return { number: input?.number ?? null, state: "UNVERIFIED", blockers: ["HEAD_UNVERIFIED"], notes: [], evidence: false };
  }
  const blockers = [];
  const notes = [];
  const runs = Array.isArray(input.check_runs) ? input.check_runs : [];
  const statuses = Array.isArray(input.statuses) ? input.statuses : [];
  if (input.read_error || !input.checks_complete || !input.statuses_complete || !input.files_complete) {
    blockers.push("GITHUB_EVIDENCE_PARTIAL");
  }
  if (input.draft) notes.push("DRAFT_PR");
  if (!runs.length && !statuses.length) blockers.push("CHECKS_NOT_FOUND");
  let limitEvidence = false;
  const checks = [];
  for (const c of runs) {
    if (!c || c.head_sha !== input.head_sha) {
      blockers.push("CHECK_SHA_MISMATCH");
      continue;
    }
    const conclusion = c.conclusion ?? "pending";
    const status = c.status ?? "unknown";
    checks.push({ name: c.name ?? "unnamed", conclusion, head_matches: true });
    if (FAIL.has(conclusion)) blockers.push("CHECK_FAILED");
    if (!OK.has(conclusion)) {
      if (conclusion === "skipped" || conclusion === "neutral") {
        blockers.push("CHECK_NOT_PROVEN_PASS");
        notes.push("CHECK_NOT_PROVEN_PASS");
      }
      else if (!FAIL.has(conclusion)) blockers.push("CHECK_PENDING_OR_UNKNOWN");
    }
    if (MATCH_LIMIT.test(String(c.summary || ""))) limitEvidence = true;
    if (MATCH_LIMIT.test(String(c.name || ""))) limitEvidence = true;
    if (status !== "completed") blockers.push("CHECK_PENDING_OR_UNKNOWN");
  }
  for (const s of statuses) {
    if (!s || (s.sha && s.sha !== input.head_sha)) {
      blockers.push("STATUS_SHA_MISMATCH");
      continue;
    }
    if (s.state === "failure" || s.state === "error") blockers.push("COMMIT_STATUS_FAILED");
    if (!["success", "failure", "error"].includes(s.state)) blockers.push("COMMIT_STATUS_PENDING");
    if (MATCH_LIMIT.test(String(s.description || ""))) limitEvidence = true;
  }
  if (limitEvidence) notes.push("EXTERNAL_BUILD_QUOTA_SIGNAL");
  const files = Array.isArray(input.files) ? input.files : [];
  if (files.some(f => RISK_PATH.test(f))) notes.push("HIGH_IMPACT_PATH_REVIEW");
  if (input.changed_files > files.length) blockers.push("DIFF_INCOMPLETE");
  // The GitHub token does not prove Vercel Production SHA, branch ruleset,
  // hosted integration, or actual user-authenticated functionality.
  notes.push("REQUIRED_RULESET_UNVERIFIED", "PRODUCTION_SHA_UNVERIFIED", "HOSTED_NEED_UNASSESSED");
  const unique = [...new Set(blockers)];
  return {
    number: input.number,
    head_sha: input.head_sha,
    state: unique.length ? "HOLD_OR_UNVERIFIED" : "CHECKS_REVIEW_ONLY",
    blockers: unique,
    notes: [...new Set(notes)],
    evidence: !input.read_error && !!input.checks_complete && !!input.statuses_complete && !!input.files_complete,
    checks,
    source: "public GitHub REST evidence"
  };
}

export function proposeImprovements(results) {
  const suggestions = [];
  const recurring = [
    ["CHECK_PENDING_OR_UNKNOWN", "SOP 16", "Reuse exact-SHA evidence; keep pending checks HOLD instead of triggering redundant QA."],
    ["CHECK_FAILED", "SOP 15", "Group failures by affected test and rerun only relevant checks after fixing the cause."],
    ["GITHUB_EVIDENCE_PARTIAL", "SOP 16", "Add one bounded evidence collection checkpoint; never infer readiness from an incomplete query."],
    ["CHECK_SHA_MISMATCH", "SOP 16", "Require head-SHA match for every reused check before release review."],
    ["DIFF_INCOMPLETE", "SOP 16", "Fetch the complete changed-file list before scope and dependency review."]
  ];
  for (const [signal, sop, proposal] of recurring) {
    const prs = [...new Set(results.filter(x => x.evidence && x.blockers.includes(signal)).map(x => x.number))];
    if (prs.length < 2) continue;
    suggestions.push({ signal, sop, pr_numbers: prs, status: "PROPOSED_ONLY", proposal, action: "human review; no SOP mutation" });
  }
  const quota = [...new Set(results.filter(x => x.evidence && x.notes.includes("EXTERNAL_BUILD_QUOTA_SIGNAL")).map(x => x.number))];
  if (quota.length >= 2) suggestions.push({
    signal: "EXTERNAL_BUILD_QUOTA_SIGNAL", sop: "SOP 15/16", pr_numbers: quota,
    status: "PROPOSED_ONLY",
    proposal: "Prefer existing SHA-matched GitHub Actions evidence. Hosted Preview only where integration demands it; never waive required checks.",
    action: "human review; no SOP mutation"
  });
  return suggestions;
}

async function githubGet(repo, path, token) {
  const res = await fetch("https://api.github.com/repos/" + repo + path, {
    headers: {
      authorization: "Bearer " + token,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "3kings-readonly-release-observer"
    }
  });
  if (!res.ok) throw new Error("GitHub read HTTP " + res.status + " on " + path.split("?")[0]);
  return res.json();
}

export async function collectGitHub(repo, token, maxPrs = 20) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) throw new Error("Invalid repository");
  if (!token) throw new Error("GITHUB_TOKEN not set");
  const prs = await githubGet(repo, "/pulls?state=open&per_page=" + Math.min(maxPrs, 50), token);
  const snapshots = [];
  for (const pr of prs.slice(0, maxPrs)) {
    const snap = { number: pr.number, head_sha: pr.head.sha, draft: pr.draft,
      changed_files: pr.changed_files ?? null, checks_complete: false,
      statuses_complete: false, files_complete: false };
    const sha = pr.head.sha;
    try {
      const [checkData, statusData, fileData] = await Promise.all([
        githubGet(repo, "/commits/" + sha + "/check-runs?per_page=100", token),
        githubGet(repo, "/commits/" + sha + "/status", token),
        githubGet(repo, "/pulls/" + pr.number + "/files?per_page=100", token)
      ]);
      snap.checks_complete = checkData.total_count <= 100;
      snap.statuses_complete = (statusData.statuses || []).length <= 100;
      snap.changed_files = Number.isInteger(pr.changed_files) ? pr.changed_files : (fileData.length < 100 ? fileData.length : null);
      snap.files_complete = snap.changed_files !== null && snap.changed_files <= 100 && fileData.length === snap.changed_files;
      snap.check_runs = (checkData.check_runs || []).map(c => ({
        name: c.name, head_sha: c.head_sha, status: c.status,
        conclusion: c.conclusion, summary: c.output?.summary?.slice(0, 200) ?? ""
      }));
      snap.statuses = (statusData.statuses || []).map(s => ({
        state: s.state, description: (s.description || "").slice(0, 200), sha
      }));
      snap.files = fileData.map(f => f.filename);
    } catch {
      snap.read_error = true;
      snap.check_runs = [];
      snap.statuses = [];
      snap.files = [];
    }
    snapshots.push(snap);
  }
  return snapshots;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY || "pkraiwit2614-web/3kings-site-report";
  const snapshot = await collectGitHub(repo, process.env.GITHUB_TOKEN, 20);
  const results = snapshot.map(assessSnapshot);
  const output = {
    kind: "3kings-release-observation",
    date_utc: new Date().toISOString(),
    source: "GitHub REST (read-only), not Vercel/Supabase Production",
    results,
    proposed_sop_improvements: proposeImprovements(results),
    guarantees: ["NO_MERGE", "NO_DEPLOY", "NO_SOP_EDIT", "NO_SOURCE_DATA_WRITE"],
    verification_missing: ["current Drive ACTIVE SOP and ACL", "branch rulesets", "Vercel Production SHA", "hosted/auth integration when applicable"]
  };
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error("READ_ONLY_AUDIT_FAILED: " + error.message); process.exitCode = 1; });
}
