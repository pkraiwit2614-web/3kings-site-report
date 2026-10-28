/**
 * 3 Kings — XLSX append/new-tab SAME-ID QA gate, 22 Oct 2026.
 * Isolated QA COPY ONLY. Never writes the Materials/PR masters or Supabase.
 * Add as a NEW script file to the verified 3 Kings GAS project.
 * Run expressBridgeAppendSafeQA20261022() once; send EXPRESS_BRIDGE_APPEND_QA log.
 * Uses Drive media PATCH to keep QA copy's original ID; checks every existing ZIP part.
 * QA tabs use small deterministic *synthetic* examples, not purchase records.
 */
const EXPRESS_BRIDGE_APPEND_QA_20261022 = Object.freeze({
  originalId: '1Yr9iNVo54g4PrB2ntFb6E_ouI_ohHqSn',
  expectedOriginalHash: '3ab818826c1a4da6dd4848ec94c5b857d5af7aadbd71085b95928e1e692b7394',
  folderId: '1jjjd1Xlw9xEbGpbH533ZAWSvPEyHKbgZ',
  stateKey: 'EXPRESS_BRIDGE_APPEND_QA_FILE_ID_20261022',
  qaFilename: 'QA_Express_Append_OriginalWorkbook_SameID_2026-10-22.xlsx',
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  maxBytes: 6000000,
  sheetNames: ['Express_Docs_QA', 'Express_Lines_QA'],
  sheetPaths: ['xl/worksheets/sheet12.xml', 'xl/worksheets/sheet13.xml'],
  rIds: ['RExpressBridgeQA20261022Docs', 'RExpressBridgeQA20261022Lines']
});

function expressBridgeAppendQASha_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(n) { return ('0' + ((n + 256) % 256).toString(16)).slice(-2); }).join('');
}
function expressBridgeAppendQAXml_(value) {
  return String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function expressBridgeAppendQAParts_(blob) {
  const pieces = Utilities.unzip(Utilities.newBlob(blob.getBytes(), 'application/zip', 'express_qa.zip'));
  const lookup = Object.create(null);
  pieces.forEach(function(p) {
    if (Object.prototype.hasOwnProperty.call(lookup, p.getName())) throw Error('DUPLICATE_ZIP_MEMBER');
    lookup[p.getName()] = p;
  });
  ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml'].forEach(function(n) {
    if (!lookup[n]) throw Error('XLSX_REQUIRED_PART_MISSING: ' + n);
  });
  return {list: pieces, map: lookup};
}
function expressBridgeAppendQAOnlyOnce_(body, token, replacement, part) {
  if (body.indexOf(token) === -1 || body.indexOf(token) !== body.lastIndexOf(token))
    throw Error('XML_INSERTION_ANCHOR_NOT_UNIQUE_' + part);
  return body.replace(token, replacement + token);
}
function expressBridgeAppendQASheetXml_(rows) {
  const data = rows.map(function(row, i) {
    const r = i + 1;
    const cells = row.map(function(v, j) {
      let k = j, col = '';
      do { col = String.fromCharCode(65 + k % 26) + col; k = Math.floor(k / 26) - 1; } while (k >= 0);
      return '<c r="' + col + r + '" t="inlineStr"><is><t xml:space="preserve">' +
        expressBridgeAppendQAXml_(v) + '</t></is></c>';
    }).join('');
    return '<row r="' + r + '">' + cells + '</row>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:F' + rows.length + '"/>' +
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/><sheetData>' + data + '</sheetData></worksheet>';
}
function expressBridgeAppendQAExpected_() {
  return [
    expressBridgeAppendQASheetXml_([
      ['Document Type', 'Document No', 'Project', 'Status', 'Source', 'QA Only'],
      ['PO_PL', 'QA-ONLY-PO-01', 'UNASSIGNED', 'NOT_IMPORTED', 'synthetic fixture', 'DO NOT SYNC']
    ]),
    expressBridgeAppendQASheetXml_([
      ['Document Type', 'Document No', 'Line', 'Item', 'Quantity', 'QA Only'],
      ['PO_PL', 'QA-ONLY-PO-01', '1', 'Synthetic fixture', '1.00', 'DO NOT SYNC']
    ])
  ];
}
function expressBridgeAppendQAValidateSource_(decoded) {
  const p = decoded.map;
  const book = p['xl/workbook.xml'].getDataAsString('UTF-8');
  const rel = p['xl/_rels/workbook.xml.rels'].getDataAsString('UTF-8');
  const types = p['[Content_Types].xml'].getDataAsString('UTF-8');
  if ((book.match(/<x:sheet\s/g) || []).length !== 11 ||
      (book.match(/\bsheetId="\d+"/g) || []).length !== 11)
    throw Error('QA_EXPECTED_11_MASTER_SHEETS');
  if (!/<\/x:sheets>/.test(book) || !/<\/Relationships>/.test(rel) || !/<\/Types>/.test(types))
    throw Error('QA_UNSUPPORTED_ORIGINAL_XML_SCHEMA');
  if (EXPRESS_BRIDGE_APPEND_QA_20261022.sheetPaths.some(function(s) {return !!p[s]}))
    throw Error('QA_SHEET_PATH_ALREADY_EXISTS_IN_ORIGINAL');
  if (EXPRESS_BRIDGE_APPEND_QA_20261022.sheetNames.some(function(n) {return book.indexOf('name="' + n + '"')>=0}))
    throw Error('QA_SHEET_NAME_ALREADY_EXISTS_IN_ORIGINAL');
  return {book:book, rel:rel, types:types};
}
function expressBridgeAppendQAInspectExisting_(before, after, expectedXml) {
  const b = before.map, a = after.map;
  const orig = Object.keys(b).sort();
  const now = Object.keys(a).sort();
  const added = now.filter(function(k) { return !Object.prototype.hasOwnProperty.call(b, k); });
  if (JSON.stringify(added.sort()) !== JSON.stringify(EXPRESS_BRIDGE_APPEND_QA_20261022.sheetPaths.slice().sort()))
    throw Error('QA_UNEXPECTED_NEW_PACKAGE_PARTS: ' + added.join(','));
  if (orig.length !== 59 || now.length !== 61) throw Error('QA_PACKAGE_MEMBER_COUNTS_CHANGED');
  const allowedChanged = new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml']);
  orig.forEach(function(k) {
    if (!a[k]) throw Error('QA_ORIGINAL_PACKAGE_PART_DELETED: ' + k);
    if (!allowedChanged.has(k) && expressBridgeAppendQASha_(a[k].getBytes()) !==
        expressBridgeAppendQASha_(b[k].getBytes())) throw Error('QA_UNRELATED_PACKAGE_PART_CHANGED: ' + k);
  });
  EXPRESS_BRIDGE_APPEND_QA_20261022.sheetPaths.forEach(function(path, i) {
    if (!a[path] || a[path].getDataAsString('UTF-8') !== expectedXml[i])
      throw Error('QA_NEW_SHEET_READBACK_FAILED: ' + path);
  });
  const workbook = a['xl/workbook.xml'].getDataAsString('UTF-8');
  const rels = a['xl/_rels/workbook.xml.rels'].getDataAsString('UTF-8');
  const types = a['[Content_Types].xml'].getDataAsString('UTF-8');
  EXPRESS_BRIDGE_APPEND_QA_20261022.sheetNames.forEach(function(n, i) {
    if (workbook.indexOf('name="' + n + '"') < 0 ||
        rels.indexOf('Id="' + EXPRESS_BRIDGE_APPEND_QA_20261022.rIds[i] + '"') < 0 ||
        types.indexOf('PartName="/' + EXPRESS_BRIDGE_APPEND_QA_20261022.sheetPaths[i] + '"') < 0)
      throw Error('QA_WORKBOOK_RELATION_OR_CONTENT_TYPE_MISSING: ' + n);
  });
  return {newSheetCount:2, untouchedOriginalParts:orig.length-allowedChanged.size,
    picturePartCount:orig.filter(function(k){return k.indexOf('xl/media/')===0}).length};
}
function expressBridgeAppendSafeQA20261022() {
  const cfg = EXPRESS_BRIDGE_APPEND_QA_20261022;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw Error('QA_LOCK_BUSY');
  try {
    const master = DriveApp.getFileById(cfg.originalId);
    if (master.getMimeType()!==cfg.mime || master.getName()!=='ABOVE_MATERIALS_STATUS_Stock_Updated_2026-09-20.xlsx')
      throw Error('MATERIALS_MASTER_IDENTITY_CHANGED');
    const originalBlob = master.getBlob();
    const originalHash = expressBridgeAppendQASha_(originalBlob.getBytes());
    if (originalHash !== cfg.expectedOriginalHash) throw Error('MATERIALS_MASTER_REVISION_CHANGED_RERUN_PREFLIGHT');
    if (originalBlob.getBytes().length > cfg.maxBytes) throw Error('MASTER_TOO_LARGE');
    const before = expressBridgeAppendQAParts_(originalBlob);
    const xml = expressBridgeAppendQAValidateSource_(before);
    const fixtures = expressBridgeAppendQAExpected_();
    const props = PropertiesService.getScriptProperties();
    let qaId = props.getProperty(cfg.stateKey);
    let qaFile = null;
    if (qaId) {
      qaFile = DriveApp.getFileById(qaId);
      if (qaFile.getName()!==cfg.qaFilename || qaFile.getMimeType()!==cfg.mime)
        throw Error('QA_FILE_IDENTITY_DRIFT');
    } else {
      qaFile = master.makeCopy(cfg.qaFilename, DriveApp.getFolderById(cfg.folderId));
      qaId = qaFile.getId();
      props.setProperty(cfg.stateKey, qaId);
    }
    const qaBefore = expressBridgeAppendQAParts_(qaFile.getBlob());
    if (qaBefore.map[cfg.sheetPaths[0]] || qaBefore.map[cfg.sheetPaths[1]]) {
      const v = expressBridgeAppendQAInspectExisting_(before, qaBefore, fixtures);
      const result = {status:'QA_PASS_NO_CHANGE',qaFileId:qaId,originalId:cfg.originalId,
        originalSha256:originalHash,qaSameId:true,mutationOriginal:0,details:v};
      console.log('EXPRESS_BRIDGE_APPEND_QA ' + JSON.stringify(result));
      return result;
    }
    if (expressBridgeAppendQASha_(qaFile.getBlob().getBytes())!==originalHash)
      throw Error('QA_COPY_NOT_EXACT_ORIGINAL');
    const updated = {};
    updated['xl/workbook.xml'] = expressBridgeAppendQAOnlyOnce_(xml.book, '</x:sheets>',
      '<x:sheet name="Express_Docs_QA" sheetId="12" r:id="'+cfg.rIds[0]+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" />'+
      '<x:sheet name="Express_Lines_QA" sheetId="13" r:id="'+cfg.rIds[1]+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" />', 'workbook');
    updated['xl/_rels/workbook.xml.rels'] = expressBridgeAppendQAOnlyOnce_(xml.rel,'</Relationships>',
      '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet12.xml" Id="'+cfg.rIds[0]+'" />'+
      '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet13.xml" Id="'+cfg.rIds[1]+'" />', 'relationships');
    updated['[Content_Types].xml'] = expressBridgeAppendQAOnlyOnce_(xml.types,'</Types>',
      '<Override PartName="/xl/worksheets/sheet12.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />'+
      '<Override PartName="/xl/worksheets/sheet13.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />', 'contenttypes');
    const out = before.list.map(function(part) {
      return Object.prototype.hasOwnProperty.call(updated, part.getName())
        ? Utilities.newBlob(updated[part.getName()], 'text/xml', part.getName()) : part;
    });
    for(let i=0;i<2;i++) out.push(Utilities.newBlob(fixtures[i],'text/xml',cfg.sheetPaths[i]));
    const candidate = Utilities.zip(out, 'QA_Express_Append.xlsx');
    if (candidate.getBytes().length > cfg.maxBytes) throw Error('QA_PATCHED_TOO_LARGE');
    // Pre-upload package-level invariant check.
    const candidateParts = expressBridgeAppendQAParts_(candidate);
    expressBridgeAppendQAInspectExisting_(before,candidateParts,fixtures);
    if (expressBridgeAppendQASha_(qaFile.getBlob().getBytes())!==originalHash)
      throw Error('QA_COPY_CHANGED_BEFORE_WRITE');
    const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files/' +
      encodeURIComponent(qaId) + '?uploadType=media&fields=id,mimeType,modifiedTime', {
      method:'patch', contentType:cfg.mime,
      headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
      payload:candidate.getBytes(), muteHttpExceptions:true
    });
    if (response.getResponseCode()<200 || response.getResponseCode()>=300)
      throw Error('QA_DRIVE_PATCH_HTTP_' + response.getResponseCode());
    let info={};try{info=JSON.parse(response.getContentText())}catch(_){}
    if (info.id && info.id!==qaId) throw Error('QA_DRIVE_FILE_ID_CHANGED');
    const reread = DriveApp.getFileById(qaId);
    const after = expressBridgeAppendQAParts_(reread.getBlob());
    const verified = expressBridgeAppendQAInspectExisting_(before,after,fixtures);
    if (reread.getMimeType()!==cfg.mime || reread.getId()!==qaId) throw Error('QA_ID_OR_MIME_DRIFT');
    if (expressBridgeAppendQASha_(master.getBlob().getBytes())!==originalHash)
      throw Error('ORIGINAL_CHANGED_DURING_QA');
    const result={status:'APPEND_SAME_ID_QA_PASS',qaFileId:qaId,
      qaLink:'https://drive.google.com/file/d/'+qaId+'/view',
      originalId:cfg.originalId,originalSha256:originalHash,qaSameId:true,
      mutationOriginal:0,mutationSupabase:0,details:verified,
      nextGate:'SAFE_FULL_IMPORT_IMPLEMENTATION_AND_SYNC_MAPPING'};
    console.log('EXPRESS_BRIDGE_APPEND_QA ' + JSON.stringify(result));
    return result;
  } finally {lock.releaseLock()}
}
