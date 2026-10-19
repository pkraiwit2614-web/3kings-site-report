'use strict';
const {createHash} = require('node:crypto');

/**
 * 3 Kings Daily Site Report -> LINE: safe, offline-plannable preflight.
 * No network requests, data mutation, LINE push, or permission changes.
 * The authorized sending implementation must be separate and owner-gated.
 */
const TZ = 'Asia/Bangkok';
const FORM_TEXT = 'ฟอร์มสำหรับกรอก รายงานหน้างานประจำวัน\nhttps://forms.gle/UDTk8uxG3iwQaW5y8';
const PAGES = Object.freeze([
  Object.freeze({site:'above_villa', suffix:'Page_01_Above_Villa'}),
  Object.freeze({site:'above_condo', suffix:'Page_02_Above_Condo'}),
  Object.freeze({site:'mirage', suffix:'Page_03_Mirage'}),
  Object.freeze({site:'henessy', suffix:'Page_04_Henessy'})
]);
const SCHEDULE = Object.freeze([
  {bangkok:'07:30', utc:'00:30', task:'prepare'},
  {bangkok:'07:50', utc:'00:50', task:'qa'},
  {bangkok:'08:00', utc:'01:00', task:'form_text'},
  {bangkok:'08:02', utc:'01:02', task:'image'},
  {bangkok:'08:05', utc:'01:05', task:'owner_log'}
]);
const ID_FORMAT = /^C[0-9a-f]{32}$/i;
const ISO_DATE = /^20\d\d-\d\d-\d\d$/;
const REQUIRED_PROOF = [
  'sopIndexRead', 'sopV13Read', 'sourceFresh', 'formColumnsVerified',
  'formRowsReconciled', 'monthlySheetVerified', 'sheetFormulaPreserved',
  'pdf4PagesVerified', 'pdfA4LandscapeVerified'
];
const IMAGE_PROOF = [
  'derivedFromFinalPdf','cropHeaderComplete','cropNotesComplete',
  'signaturesExcluded','fontMatched','textMatched','totalsMatched',
  'uniformScaleVerified','pixelsVerified','driveReadbackVerified'
];

function reportPolicyFromBangkok(now = new Date()) {
  const pieces = new Intl.DateTimeFormat('en-GB', {
    timeZone:TZ, year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(now);
  const fields = Object.fromEntries(pieces.map(p=>[p.type,p.value]));
  const todayUtc = Date.UTC(+fields.year,+fields.month-1,+fields.day);
  const weekday = new Date(todayUtc).getUTCDay();
  const reportDate = new Date(todayUtc-(weekday===1?2:1)*86400000)
    .toISOString().slice(0,10);
  return {reportDate,sendToday:weekday!==0,
    skipReason:weekday===0?'SKIP_SUNDAY':null};
}
function reportDateFromBangkok(now = new Date()) {
  return reportPolicyFromBangkok(now).reportDate;
}
function reportDateParts(iso) {
  if (typeof iso!=='string'||!ISO_DATE.test(iso)) throw Error('BLOCK_INVALID_DATE');
  const [year,month,day] = iso.split('-').map(Number);
  const parsed = new Date(Date.UTC(year,month-1,day));
  if (parsed.toISOString().slice(0,10)!==iso) throw Error('BLOCK_INVALID_DATE');
  const d = String(day).padStart(2,'0'), m = String(month).padStart(2,'0');
  return {d,m,year,dayFolder:d+m+year,label:d+'-'+m+'-'+year};
}
function expectedFiles(iso) {
  const p=reportDateParts(iso);
  return {pdf:'Daily_Site_Report_'+p.label+'.pdf',
    png:Object.fromEntries(PAGES.map(x=>[x.site,
      'Daily_Site_Report_'+p.label+'_'+x.suffix+'.png']))};
}
function uniqueAsset(assets,name,mime) {
  const found = assets.filter(x=>x && x.name===name);
  if(found.length!==1) return {ok:false,code:found.length?'BLOCK_DUPLICATE_ASSET':'BLOCK_MISSING_ASSET'};
  const a=found[0];
  if(a.mime!==mime || !Number.isInteger(a.size) || a.size<=0 || !a.fileId)
    return {ok:false,code:'BLOCK_INVALID_ASSET'};
  return {ok:true,asset:a};
}
function checkEvidence(evidence,keys) {
  if(!evidence || typeof evidence!=='object') return 'BLOCK_MISSING_QA_EVIDENCE';
  for(const key of keys) if(evidence[key]!==true) return 'BLOCK_QA_'+key;
  return null;
}
function checkImage(a,site,pdf,qa) {
  const missing=checkEvidence(qa,IMAGE_PROOF);
  if(missing)return missing;
  if(qa.site!==site || qa.pdfFileId!==pdf.fileId || qa.pngFileId!==a.fileId)
    return 'BLOCK_QA_SOURCE_ID_MISMATCH';
  if(a.width!==2947 || !Number.isInteger(a.height) || a.height<=0)
    return 'BLOCK_QA_WRONG_IMAGE_DIMENSIONS';
  if(!Number.isFinite(qa.cropWidth)||!Number.isFinite(qa.cropHeight)
    ||qa.cropWidth<=0||qa.cropHeight<=0)return 'BLOCK_QA_CROP_UNKNOWN';
  if(Math.abs((a.width/a.height)-(qa.cropWidth/qa.cropHeight))>=0.003)
    return 'BLOCK_QA_ASPECT_RATIO';
  if(qa.scaleX!==qa.scaleY || !Number.isFinite(qa.scaleX) || qa.scaleX<=0)
    return 'BLOCK_QA_NON_UNIFORM_SCALE';
  if(!qa.finalPdfChecksum || qa.pngPdfChecksum!==qa.finalPdfChecksum)
    return 'BLOCK_QA_PDF_VERSION_MISMATCH';
  return null;
}
function checkRoute(route,candidates,rules) {
  if(!route || !route.site_code)return 'BLOCK_NO_APPROVED_ROUTE';
  if(!ID_FORMAT.test(route.group_id||''))return 'BLOCK_BAD_GROUP_ID';
  const cand=(candidates||[]).find(x=>x.group_id===route.group_id);
  if(!cand||cand.verified_member!==true||cand.approved!==true)
    return 'BLOCK_GROUP_NOT_APPROVED';
  if(route.target_scope!=='site_group'||route.notifications_enabled!==true)
    return 'BLOCK_ROUTE_DISABLED';
  if(route.approved_report_page!==true || route.report_page!==route.site)
    return 'BLOCK_PAGE_MAPPING_UNAPPROVED';
  if(!(rules||[]).some(x=>x.site_code===route.site_code
    && x.alert_kind==='daily_site_report' && x.delivery_enabled===true))
    return 'BLOCK_NOTIFICATION_RULE_DISABLED';
  return null;
}
function safeGroup(groupId){return ID_FORMAT.test(groupId||'')?'C••••'+groupId.slice(-4):null;}
function deliveryKey(date,route,stage,groupId) {
  return createHash('sha256').update(
    ['3kings-daily-line-v1',date,route,stage,groupId].join('|'),'utf8'
  ).digest('hex');
}
function prepareDryRun(input) {
  const policy=reportPolicyFromBangkok(input.now || new Date());
  const date=input.reportDate || policy.reportDate;
  if(!policy.sendToday) return {
    mode:'DRY_RUN_NO_LINE',time_zone:TZ,report_date:date,
    slots:SCHEDULE,form_text:FORM_TEXT,reportOutput:[],deliveryLog:[],
    skipped:true,skip_reason:policy.skipReason,
    actual_line_messages_sent:0,send_enabled:false
  };
  const expected=expectedFiles(date);
  const assets=Array.isArray(input.assets)?input.assets:[];
  const routes=Array.isArray(input.routes)?input.routes:[];
  const filePdf=uniqueAsset(assets,expected.pdf,'application/pdf');
  const overall=checkEvidence(input.evidence,REQUIRED_PROOF);
  const reportOutput=[];
  const deliveryLog=[];
  for(const site of PAGES) {
    const file=uniqueAsset(assets,expected.png[site.site],'image/png');
    let qaError=overall || (!filePdf.ok?filePdf.code:null)
      ||(!file.ok?file.code:null);
    if(!qaError)qaError=checkImage(file.asset,site.site,filePdf.asset,
      input.imageEvidence?.[site.site]);
    const matchingRoutes=routes.filter(r=>r.report_page===site.site
      ||r.site_code===site.site ||(site.site==='above_condo' &&
         /^above_condo_[ab]$/.test(r.site_code||'')));
    if(matchingRoutes.length===0){
      reportOutput.push({site:site.site,file:expected.png[site.site],
        qa:qaError||'READY',status:'BLOCK_NO_APPROVED_ROUTE'});
      continue;
    }
    for(const route of matchingRoutes){
      const other=routes.some(r=>r!==route && r.group_id===route.group_id
        && r.report_page!==route.report_page);
      const routeError=other?'BLOCK_GROUP_ROUTED_TO_MULTIPLE_PAGES'
        :checkRoute(route,input.candidates,input.rules);
      const error=qaError || routeError;
      const status=error?'DRY_RUN_BLOCKED':'DRY_RUN_READY';
      reportOutput.push({site:site.site,route:route.site_code,
        file:expected.png[site.site],qa:qaError||'READY',
        status,reason:error||null,group:safeGroup(route.group_id)});
      for(const stage of ['form_text','image']){
        deliveryLog.push({
          mode:'DRY_RUN_NO_LINE',report_date:date,site:site.site,
          route:route.site_code,stage,group_id_masked:safeGroup(route.group_id),
          filename:stage==='image'?expected.png[site.site]:null,
          line_message_id:null,delivery_time:null,status,error:error||null,
          dedupe_key:deliveryKey(date,route.site_code,stage,route.group_id)
        });
      }
    }
  }
  return {mode:'DRY_RUN_NO_LINE',time_zone:TZ,report_date:date,
    slots:SCHEDULE,form_text:FORM_TEXT,reportOutput,deliveryLog,
    actual_line_messages_sent:0,send_enabled:false};
}

module.exports = {TZ,FORM_TEXT,PAGES,SCHEDULE,reportPolicyFromBangkok,reportDateFromBangkok,
  reportDateParts,expectedFiles,uniqueAsset,checkEvidence,checkImage,
  checkRoute,prepareDryRun};
