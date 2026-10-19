import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDailyOwnerPilot,previewSyncFailureOwnerPilot} from '../../infra/line-autopilot/worker.mjs';

// Source-backed anonymized 2026-10-19 evidence snapshot. Not synthetic "ready".
const baseline={
 reportDate:'2026-10-19',formEntries:10,masterEntries:5,
 latestSubmissionAt:'2026-10-19T03:44:58.000Z',
 pdfModifiedAt:'2026-10-19T01:56:12.643Z',
 pngPages:[
  {page:1,mimeType:'image/png',modifiedAt:'2026-10-19T02:47:00.730Z'},
  {page:2,mimeType:'image/png',modifiedAt:'2026-10-19T02:47:06.010Z'},
  {page:3,mimeType:'image/png',modifiedAt:'2026-10-19T02:47:10.541Z'},
  {page:4,mimeType:'image/png',modifiedAt:'2026-10-19T02:47:15.421Z'}
 ],
 sourceReconciled:false,pdfQaPassed:false,pngQaPassed:false,publishApproved:false
};
const status=(b)=>previewDailyOwnerPilot(b);
test('actual 19 Oct daily report is blocked by Form→Master count mismatch',()=>{
 const r=status(baseline);assert.equal(r.decision,'BLOCK_FORM_MASTER_COUNT_MISMATCH');assert.equal(r.wouldSendLine,false);
});
test('even reconciled rows fail if PDF older than final Form submission',()=>{
 const r=status({...baseline,masterEntries:10});assert.equal(r.decision,'BLOCK_PDF_PREDATES_FORM');
});
test('old PDF cannot be cleared by pretending QA passed',()=>{
 const r=status({...baseline,masterEntries:10,sourceReconciled:true,pdfQaPassed:true,pngQaPassed:true,publishApproved:true});
 assert.equal(r.decision,'BLOCK_PDF_PREDATES_FORM');
});
test('missing page 4 blocks daily report',()=>{
 const r=status({...baseline,masterEntries:10,pdfModifiedAt:'2026-10-19T03:45:00.000Z',pngPages:baseline.pngPages.slice(0,3)});
 assert.equal(r.decision,'BLOCK_PNG_SET_UNVERIFIED');
});
test('duplicate page blocks daily report',()=>{
 const r=status({...baseline,masterEntries:10,pdfModifiedAt:'2026-10-19T03:45:00.000Z',
 pngPages:baseline.pngPages.map((p,i)=>({...p,page:i===3?3:p.page,modifiedAt:'2026-10-19T03:47:00Z'}))});
 assert.equal(r.decision,'BLOCK_PNG_SET_UNVERIFIED');
});
test('matching counts but without explicit source QA and approval cannot be marked ready',()=>{
 const r=status({...baseline,masterEntries:10,pdfModifiedAt:'2026-10-19T03:45:00Z',
 pngPages:baseline.pngPages.map(p=>({...p,modifiedAt:'2026-10-19T03:46:00Z'}))});
 assert.equal(r.decision,'BLOCK_REPORT_QA_OR_APPROVAL_PENDING');
});
test('complete synthetic QA never sends LINE even if marked ready',()=>{
 const r=status({...baseline,masterEntries:10,pdfModifiedAt:'2026-10-19T03:45:00Z',
 pngPages:baseline.pngPages.map(p=>({...p,modifiedAt:'2026-10-19T03:46:00Z'})),
 sourceReconciled:true,pdfQaPassed:true,pngQaPassed:true,publishApproved:true});
 assert.equal(r.decision,'OWNER_PILOT_READY_BUT_SEND_DISABLED');assert.equal(r.destination,'owner');assert.equal(r.wouldSendLine,false);
});
test('no daily rows must not trigger report',()=>{
 const r=status({...baseline,formEntries:0,masterEntries:0});assert.equal(r.decision,'BLOCK_INVALID_ROW_COUNTS');
});
test('daily reports without report date blocked',()=>{
 assert.equal(status({...baseline,reportDate:''}).decision,'BLOCK_INVALID_REPORT_DATE');
});
const now='2026-10-19T06:52:00Z';
test('current successful Sync record triggers no alert',()=>{
 const r=previewSyncFailureOwnerPilot({id:'9bf972e9-c22a-4254-8b18-d113c5385885',
 status:'success',sync_type:'defects',created_at:'2026-10-19T06:49:13.390Z'},now);
 assert.equal(r.decision,'BLOCK_NOT_AN_EXPLICIT_SYNC_ERROR');
 assert.equal(r.wouldSendLine,false);
});
test('fresh confirmed Sync error routed only to owner, send disabled',()=>{
 const r=previewSyncFailureOwnerPilot({id:'9bf972e9-c22a-4254-8b18-d113c5385885',
 status:'error',sync_type:'defects',created_at:'2026-10-19T06:49:13.390Z'},now);
 assert.equal(r.decision,'OWNER_ERROR_DETECTED_BUT_SEND_DISABLED');
 assert.equal(r.destination,'owner');assert.equal(r.wouldSendLine,false);
});
test('historical errors cannot be replayed as current alerts',()=>{
 const r=previewSyncFailureOwnerPilot({id:'9bf972e9-c22a-4254-8b18-d113c5385885',
 status:'error',sync_type:'defects',created_at:'2026-10-17T04:19:37Z'},now);
 assert.equal(r.decision,'BLOCK_SYNC_ERROR_OUTSIDE_WINDOW');
});
test('future-dated errors cannot trigger alert',()=>{
 const r=previewSyncFailureOwnerPilot({id:'9bf972e9-c22a-4254-8b18-d113c5385885',
 status:'error',sync_type:'defects',created_at:'2026-10-19T08:49:13.390Z'},now);
 assert.equal(r.decision,'BLOCK_SYNC_ERROR_OUTSIDE_WINDOW');
});
test('unverified error identifier blocks alert',()=>{
 const r=previewSyncFailureOwnerPilot({id:'random',
 status:'error',sync_type:'defects',created_at:'2026-10-19T06:49:13.390Z'},now);
 assert.equal(r.decision,'BLOCK_UNVERIFIED_EVENT_ID');
});
