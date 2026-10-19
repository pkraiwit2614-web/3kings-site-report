'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PAGES,FORM_TEXT,SCHEDULE,reportPolicyFromBangkok,reportDateFromBangkok,expectedFiles,
  checkRoute,prepareDryRun}=require('../lib/dailyLineAutopilotCore.cjs');
const TRUE_EVIDENCE={
  sopIndexRead:true,sopV13Read:true,sourceFresh:true,formColumnsVerified:true,
  formRowsReconciled:true,monthlySheetVerified:true,sheetFormulaPreserved:true,
  pdf4PagesVerified:true,pdfA4LandscapeVerified:true
};
const IMG_EVIDENCE={
  derivedFromFinalPdf:true,cropHeaderComplete:true,cropNotesComplete:true,
  signaturesExcluded:true,fontMatched:true,textMatched:true,totalsMatched:true,
  uniformScaleVerified:true,pixelsVerified:true,driveReadbackVerified:true
};
const ID='C'+'a'.repeat(32);
function fixture(date='2026-10-19'){
  const files=expectedFiles(date),pdf={name:files.pdf,mime:'application/pdf',
    size:90019,fileId:'synthetic-pdf'};
  const pngs=PAGES.map((site,i)=>({name:files.png[site.site],mime:'image/png',
    size:100000+i,fileId:'synthetic-image-'+i,width:2947,height:2947}));
  const imageEvidence=Object.fromEntries(PAGES.map((s,i)=>[s.site,{
    ...IMG_EVIDENCE,site:s.site,pdfFileId:pdf.fileId,
    pngFileId:pngs[i].fileId,cropWidth:500,cropHeight:500,
    scaleX:5.894,scaleY:5.894,finalPdfChecksum:'fixture',
    pngPdfChecksum:'fixture'
  }]));
  return {reportDate:date,now:new Date('2026-10-19T00:30:00Z'),evidence:{...TRUE_EVIDENCE},assets:[pdf,...pngs],
    imageEvidence,routes:[],candidates:[],rules:[]};
}
test('Bangkok weekdays: Monday selects Saturday; Tuesday-Saturday use yesterday',()=>{
  assert.equal(reportDateFromBangkok(new Date('2026-10-18T17:30:00Z')),
    '2026-10-17'); // Monday morning in Bangkok
  assert.equal(reportDateFromBangkok(new Date('2026-10-19T00:30:00Z')),
    '2026-10-17'); // Monday at 07:30
  assert.equal(reportDateFromBangkok(new Date('2026-10-19T17:30:00Z')),
    '2026-10-19'); // Tuesday in Bangkok
  assert.equal(reportDateFromBangkok(new Date('2027-01-01T00:30:00Z')),
    '2026-12-31'); // New Year's cross-year
  assert.equal(reportDateFromBangkok(new Date('2026-11-01T17:30:00Z')),
    '2026-10-31'); // Monday cross-month
});
test('Sunday is completely suppressed, including explicitly selected report dates',()=>{
  const sunday=new Date('2026-10-18T00:30:00Z');
  const p=reportPolicyFromBangkok(sunday);
  assert.equal(p.sendToday,false);
  assert.equal(p.skipReason,'SKIP_SUNDAY');
  const input=fixture('2026-10-17');
  input.now=sunday;
  const output=prepareDryRun(input);
  assert.equal(output.skipped,true);
  assert.equal(output.skip_reason,'SKIP_SUNDAY');
  assert.deepEqual(output.reportOutput,[]);
  assert.deepEqual(output.deliveryLog,[]);
  assert.equal(output.actual_line_messages_sent,0);
});
test('Monday dry-run uses Saturday report even if Sunday files are missing',()=>{
  const input=fixture('2026-10-17');
  delete input.reportDate;
  const output=prepareDryRun(input);
  assert.equal(output.report_date,'2026-10-17');
  assert.match(output.reportOutput[0].file,/17-10-2026_Page_01_Above_Villa/);
  assert.equal(output.actual_line_messages_sent,0);
});
test('Sunday records stay available for explicit historical replay on a weekday',()=>{
  const input=fixture('2026-10-18');
  const output=prepareDryRun(input);
  assert.equal(output.report_date,'2026-10-18');
  assert.notEqual(output.skipped,true);
  assert.equal(output.actual_line_messages_sent,0);
});
test('SOP exact names; Henessy filename is intentionally not Hennessy',()=>{
  const f=expectedFiles('2026-10-18');
  assert.equal(f.png.henessy,
    'Daily_Site_Report_18-10-2026_Page_04_Henessy.png');
  assert.match(FORM_TEXT,/forms\.gle\/UDTk8uxG3iwQaW5y8/);
  assert.deepEqual(SCHEDULE.map(x=>x.bangkok),
    ['07:30','07:50','08:00','08:02','08:05']);
  assert.throws(()=>expectedFiles('2026-02-30'),/BLOCK_INVALID_DATE/);
});
test('real 19 October folder file names alone cannot bypass missing QA/mapping',()=>{
  // File names/sizes are from an observed Drive listing, not a rendering E2E proof.
  const input=fixture();
  input.evidence={};
  input.imageEvidence={};
  input.assets[0].size=90019;
  [348429,218190,147319,148688].forEach((n,i)=>input.assets[i+1].size=n);
  const result=prepareDryRun(input);
  assert.equal(result.actual_line_messages_sent,0);
  assert.equal(result.send_enabled,false);
  assert.equal(result.reportOutput.length,4);
  assert(result.reportOutput.every(x=>x.status==='BLOCK_NO_APPROVED_ROUTE'));
});
test('18 Oct missing artifacts: never guess from 17 Oct or 19 Oct',()=>{
  const input=fixture('2026-10-18');input.assets=[];
  const result=prepareDryRun(input);
  assert(result.reportOutput.every(x=>x.qa==='BLOCK_MISSING_ASSET'));
  assert.equal(result.deliveryLog.length,0);
});
test('unapproved and disabled routes cannot reach ready state',()=>{
  const input=fixture();input.routes=[{
    site_code:'above_villa',site:'above_villa',report_page:'above_villa',
    group_id:ID,target_scope:'site_group',notifications_enabled:false,
    approved_report_page:true
  }];
  input.candidates=[{group_id:ID,verified_member:true,approved:false}];
  input.rules=[{site_code:'above_villa',alert_kind:'daily_site_report',
    delivery_enabled:false}];
  const result=prepareDryRun(input),log=result.deliveryLog;
  assert.equal(result.reportOutput[0].status,'DRY_RUN_BLOCKED');
  assert.equal(result.reportOutput[0].reason,'BLOCK_GROUP_NOT_APPROVED');
  assert.equal(log.length,2);
  assert(log.every(x=>x.line_message_id===null&&x.delivery_time===null));
  assert.equal(result.actual_line_messages_sent,0);
});
test('correct synthetic approvals produce dry-run ready, never deliver',()=>{
  const input=fixture();
  input.routes=[{site_code:'above_villa',site:'above_villa',
    report_page:'above_villa',group_id:ID,target_scope:'site_group',
    approved_report_page:true,notifications_enabled:true}];
  input.candidates=[{group_id:ID,verified_member:true,approved:true}];
  input.rules=[{site_code:'above_villa',alert_kind:'daily_site_report',
    delivery_enabled:true}];
  const result=prepareDryRun(input);
  assert.equal(result.reportOutput[0].status,'DRY_RUN_READY');
  assert.equal(result.actual_line_messages_sent,0);
  assert.equal(result.send_enabled,false);
  assert.equal(result.deliveryLog.length,2);
});
test('Above Condo A/B cannot silently inherit one combined image',()=>{
  const route={site_code:'above_condo_a',site:'above_condo',
    report_page:'above_condo',group_id:ID,target_scope:'site_group',
    approved_report_page:false,notifications_enabled:true};
  const candidates=[{group_id:ID,verified_member:true,approved:true}];
  const rules=[{site_code:'above_condo_a',alert_kind:'daily_site_report',
    delivery_enabled:true}];
  assert.equal(checkRoute(route,candidates,rules),
    'BLOCK_PAGE_MAPPING_UNAPPROVED');
});
test('duplicated asset name fails closed for its site',()=>{
  const input=fixture();input.assets.push({...input.assets[1]});
  input.routes=[{site_code:'above_villa',site:'above_villa',
    report_page:'above_villa',group_id:ID,target_scope:'site_group',
    approved_report_page:true,notifications_enabled:true}];
  input.candidates=[{group_id:ID,verified_member:true,approved:true}];
  input.rules=[{site_code:'above_villa',alert_kind:'daily_site_report',
    delivery_enabled:true}];
  const result=prepareDryRun(input);
  assert.equal(result.reportOutput[0].status,'DRY_RUN_BLOCKED');
  assert.equal(result.reportOutput[0].reason,'BLOCK_DUPLICATE_ASSET');
});
test('aspect mismatch or nonuniform scaling blocks only affected site',()=>{
  const input=fixture();
  input.routes=[{site_code:'above_villa',site:'above_villa',
    report_page:'above_villa',group_id:ID,target_scope:'site_group',
    approved_report_page:true,notifications_enabled:true}];
  input.candidates=[{group_id:ID,verified_member:true,approved:true}];
  input.rules=[{site_code:'above_villa',alert_kind:'daily_site_report',
    delivery_enabled:true}];
  input.imageEvidence.above_villa.scaleY=6;
  const result=prepareDryRun(input);
  assert.equal(result.reportOutput[0].reason,'BLOCK_QA_NON_UNIFORM_SCALE');
  assert.equal(result.reportOutput.length,4);
});
