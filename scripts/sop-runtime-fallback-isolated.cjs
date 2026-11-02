'use strict';
// Pure isolated SOP execution-path selector for CI; NOT wired to GAS, Supabase or Production.
// Never call live services from this module or treat simulation output as live PASS.
const ORDER = Object.freeze(['connected_api','same_project_editor','approved_endpoint']);
const READ_ONLY = new Set(['read_only','inspect','po_check_read_only','count_read_only']);
const ALLOWED = new Set(['authorized_write','publish_only','document_only']);
function result(status, extra={}) { return {status, ...extra, liveProductionPass:false}; }
function present(x) { return typeof x === 'string' && x.trim().length>0; }
async function isolatedFallback(scenario) {
  const s=scenario||{}, tried=[];
  if(READ_ONLY.has(s.mode)) return result('READ_ONLY_NO_EXECUTION',{tried});
  if(!ALLOWED.has(s.mode)) return result('BLOCKED_UNSUPPORTED_MODE',{tried});
  if(s.errorCode !== 'NOT_FOUND') return result('NON_NOT_FOUND_ERROR',{tried,errorCode:s.errorCode||'UNKNOWN'});
  const t=s.target||{};
  if(!s.authorized || !present(t.scriptId) || !present(t.functionName) ||
     !present(t.sourceFileId) || !present(t.deltaKey))
    return result('BLOCKED_UNVERIFIED_SCOPE',{tried});
  if(s.approvalState !== 'APPROVED') return result('HOLD_APPROVAL',{tried});
  if(s.priorRun === 'COMPLETE') return result('NO_CHANGE_ALREADY_EXECUTED',{tried});
  if(s.priorRun !== 'NOT_EXECUTED') return result('HOLD_AMBIGUOUS_PRIOR_RUN',{tried});
  // The adapters in tests are synthetic; module has no network, shell or GAS imports.
  const adapters=s.adapters||{};
  for(const name of ORDER) {
    const a=adapters[name];
    if(!a || a.available !== true || typeof a.invoke !== 'function') continue;
    tried.push(name);
    let response;
    try {
      response=await a.invoke(Object.freeze({...t,simulationOnly:true}));
    } catch(e) {
      response={code:e?.code||'UNKNOWN',error:String(e?.message||e)};
    }
    if(response?.code==='NOT_FOUND')continue;
    if(response?.code==='PERMISSION_DENIED' || response?.code==='UNAUTHORIZED')
      return result('BLOCKED_PROVIDER_AUTHORIZATION',{tried});
    if(response?.status==='EXECUTED' && present(response.executionId) &&
       response.exactTarget === true)
      return result('EXECUTION_EVIDENCE_PENDING_DOWNSTREAM_QA',{tried,path:name,executionId:response.executionId});
    return result('BLOCKED_EXECUTION_UNVERIFIED',{tried,path:name});
  }
  if(adapters.existing_trigger?.available===true)
    return result('WAIT_EXISTING_TRIGGER_OBSERVATION',{tried}); // Never invoke trigger.
  return result('BLOCKED_EXECUTION_PATH',{tried});
}
module.exports={isolatedFallback,ORDER};
