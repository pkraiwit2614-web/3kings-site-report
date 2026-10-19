/** 3 Kings read-only, fail-closed release preflight. No network or write operations. */
const shaPattern = /^[a-f0-9]{40}$/;
const sensitive = /^(?:app\/api\/|lib\/|supabase\/(?:migrations|functions)\/|docs\/apps-script\/|scripts\/.*(?:sync|writeback)|\.env|vercel\.json)/i;
export function evaluateRelease(item, state = {}) {
  const blockers = [];
  const block = (bad, reason) => { if (bad) blockers.push(reason); };
  const pr = state.pr || {}, prod = state.production || {}, preview = state.preview || {};
  block(item?.policy !== 'candidate', 'BLOCK_QUEUE_HOLD');
  block(state.sop?.valid !== true || state.sop?.source !== 'live_drive_full_sop' || state.sop?.revisionMatchesIndex !== true, 'BLOCK_LIVE_SOP_ATTESTATION');
  block(pr.state !== 'open' || pr.draft === true || pr.mergeable !== true || pr.base !== 'main', 'BLOCK_PR_NOT_READY');
  block(pr.number !== item?.pr || !shaPattern.test(pr.headSha || '') || pr.headRepo !== state.repository, 'BLOCK_PR_IDENTITY');
  block(!shaPattern.test(state.mainSha || '') || !shaPattern.test(prod.sha || '') || prod.sha !== state.mainSha, 'BLOCK_MAIN_PRODUCTION_DRIFT');
  block(prod.ready !== true || prod.aliasVerified !== true, 'BLOCK_PRODUCTION_UNVERIFIED');
  block((state.statuses || []).some(s => s.context === 'Vercel' && ['failure','error'].includes(s.state) &&
      /build-rate-limit/i.test(s.target_url || '')), 'BLOCK_BUILD_RATE_LIMIT');
  const ci = new Set((state.checks || []).filter(c => c.conclusion === 'success' && c.head_sha === pr.headSha &&
      c.source === 'GitHub Actions').map(c => c.name));
  block(!item?.ci_checks?.length || item.ci_checks.some(name => !ci.has(name)), 'BLOCK_REQUIRED_CI');
  block(preview.ready !== true || preview.sha !== pr.headSha || preview.environment !== 'preview', 'BLOCK_EXACT_PREVIEW');
  block(preview.usesIsolatedTestData !== true, 'BLOCK_PREVIEW_ISOLATION');
  block(state.reviews?.verified !== true || state.reviews?.sha !== pr.headSha, 'BLOCK_SCOPED_REVIEW');
  block(!state.changedFiles?.length || state.changedFiles.some(name => sensitive.test(name)), 'BLOCK_SENSITIVE_DIFF');
  block(state.authorization?.currentSop16 !== true || state.authorization?.pr !== item?.pr ||
    state.authorization?.headSha !== pr.headSha, 'BLOCK_EXPLICIT_RELEASE_AUTH');
  return {pr:item?.pr,eligible:blockers.length===0,blockers:[...new Set(blockers)]};
}
export function orderedDecision(queue, evidence = {}) {
  if (queue?.mode !== 'observe_only' || !Array.isArray(queue.entries)) throw Error('BLOCK_UNSUPPORTED_QUEUE_MODE');
  const entries = [...queue.entries].sort((a,b)=>a.priority-b.priority);
  if(new Set(entries.map(x=>x.pr)).size!==entries.length ||
     new Set(entries.map(x=>x.priority)).size!==entries.length) throw Error('BLOCK_DUPLICATE_QUEUE_ID');
  let previousBlocked=false;
  return entries.map(item => {
    const verdict=evaluateRelease(item,evidence[item.pr]);
    if(item.policy==='candidate' && previousBlocked && verdict.eligible) {
      verdict.eligible=false;verdict.blockers.push('BLOCK_PREVIOUS_PRIORITY');
    }
    if(item.policy==='candidate' && !verdict.eligible) previousBlocked=true;
    return verdict;
  });
}
