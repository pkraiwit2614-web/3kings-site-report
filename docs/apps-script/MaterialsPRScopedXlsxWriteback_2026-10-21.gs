/**
 * 3 Kings — scoped XLSX cell writer, Google Drive original File ID.
 * Staging only. Does not install triggers, deploy an endpoint, or alter existing Defect writer.
 *
 * Run from an owner-authorized Apps Script project with scopes:
 * https://www.googleapis.com/auth/drive
 * https://www.googleapis.com/auth/script.external_request
 *
 * Script property: MATERIAL_PR_XLSX_ALLOWLIST = JSON array of approved Drive File IDs.
 * Call xlsxScopedPreview(request), then xlsxScopedApply({...request, expectedSha256,
 * expectedModifiedMs}) using exact preview values. Never put IDs or credentials in Git.
 *
 * Supports string/number edits in EXISTING worksheet rows only. No new rows, sheet
 * structure, formula, named-range, style, status, or PO modifications by inference.
 */
const XLSX_SCOPED = Object.freeze({
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  allowlistKey: 'MATERIAL_PR_XLSX_ALLOWLIST',
  maxChanges: 20,
  maxBytes: 5 * 1024 * 1024
});

function xlsxScopedAttr_(tag, name) {
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = tag.match(new RegExp('(?:^|\\s)' + safe + '="([^"]*)"'));
  return m ? m[1] : null;
}
function xlsxScopedUnescape_(s) {
  return String(s).replace(/&#(?:x([0-9a-fA-F]+)|([0-9]+));/g, function(m, hex, dec) {
    const number=parseInt(hex || dec, hex ? 16 : 10);
    return number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : m;
  }).replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function xlsxScopedEscape_(s) {
  return String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function xlsxScopedDigest_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function xlsxScopedParts_(fileBlob) {
  const items = Utilities.unzip(fileBlob), parts = {};
  items.forEach(function(part) {
    const name = part.getName();
    if (Object.prototype.hasOwnProperty.call(parts, name)) throw Error('Duplicate ZIP member');
    parts[name] = part;
  });
  if (!parts['xl/workbook.xml'] || !parts['xl/_rels/workbook.xml.rels'])
    throw Error('Not a supported XLSX workbook');
  return {items: items, parts: parts};
}
function xlsxScopedSheetPath_(parts, sheetName) {
  const workbook = parts['xl/workbook.xml'].getDataAsString();
  const links = parts['xl/_rels/workbook.xml.rels'].getDataAsString();
  const sheets = workbook.match(/<(?:[A-Za-z_][\w.-]*:)?sheet\b[^>]*\/?\s*>/g) || [];
  const hit = sheets.filter(function(tag) {
    return xlsxScopedUnescape_(xlsxScopedAttr_(tag, 'name') || '') === sheetName;
  });
  if (hit.length !== 1) throw Error('Worksheet name missing/ambiguous');
  const rid = xlsxScopedAttr_(hit[0], 'r:id');
  if (!rid) throw Error('Worksheet relation missing');
  const rels = links.match(/<(?:[A-Za-z_][\w.-]*:)?Relationship\b[^>]*\/?\s*>/g) || [];
  const rel = rels.filter(function(tag) { return xlsxScopedAttr_(tag, 'Id') === rid; });
  if (rel.length !== 1) throw Error('Worksheet relation ambiguous');
  const target = xlsxScopedAttr_(rel[0], 'Target');
  if (!target || !/^(?:\/xl\/)?worksheets\/sheet\d+\.xml$/.test(target))
    throw Error('Unsupported worksheet target');
  const path = target.startsWith('/xl/') ? target.slice(1) : 'xl/' + target;
  if (!parts[path]) throw Error('Worksheet XML missing');
  return path;
}
function xlsxScopedSharedStrings_(parts) {
  const blob = parts['xl/sharedStrings.xml'];
  if (!blob) return [];
  const xml = blob.getDataAsString();
  return (xml.match(/<(?:[A-Za-z_][\w.-]*:)?si(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?si>/g) || [])
    .map(function(si) {
      return (si.match(/<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?t>/g) || [])
        .map(function(t) {
          return xlsxScopedUnescape_(t.replace(/^<(?:[A-Za-z_][\w.-]*:)?t[^>]*>/, '')
            .replace(/<\/(?:[A-Za-z_][\w.-]*:)?t>$/, ''));
        }).join('');
    });
}
function xlsxScopedCell_(row, address, shared) {
  // Addresses are validated before patch; no regex metacharacters are permitted.
  const re = new RegExp('<(?:[A-Za-z_][\\w.-]*:)?c\\b[^>]*\\br="' + address +
    '"[^>]*(?:\\/>|>[\\s\\S]*?<\\/(?:[A-Za-z_][\\w.-]*:)?c>)');
  const match = row.match(re);
  if (!match) return {old:'',element:null,formula:false,style:null,prefix:''};
  const element=match[0];
  const kind=xlsxScopedAttr_(element,'t');
  const formula=/<(?:[A-Za-z_][\w.-]*:)?f(?:\s|>)/.test(element);
  const prefix=(element.match(/^<([A-Za-z_][\w.-]*:)?c\b/) || [,''])[1] || '';
  let value='';
  if (kind==='inlineStr') {
    value=(element.match(/<(?:[A-Za-z_][\w.-]*:)?t[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t>/) || [,''])[1];
    value=xlsxScopedUnescape_(value);
  } else {
    value=(element.match(/<(?:[A-Za-z_][\w.-]*:)?v>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?v>/) || [,''])[1];
    value=kind==='s'?(shared[Number(value)] || ''):xlsxScopedUnescape_(value);
  }
  return {old:String(value),element:element,formula:formula,style:xlsxScopedAttr_(element,'s'),prefix:prefix,kind:kind};
}
function xlsxScopedPatch_(xml, shared, changes) {
  let result=xml;
  changes.forEach(function(change) {
    const addr=change.cell;
    if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(addr)) throw Error('Bad cell address');
    if (typeof change.expected!=='string') throw Error('expected must be a string');
    if (typeof change.value!=='string' && (typeof change.value!=='number' || !isFinite(change.value)))
      throw Error('Only text/numeric values supported');
    const rowNumber=Number((addr.match(/\d+/)||[])[0]);
    const re=new RegExp('(<(?:[A-Za-z_][\\w.-]*:)?row\\b[^>]*\\br="' + rowNumber +
      '"[^>]*>)([\\s\\S]*?)(<\\/(?:[A-Za-z_][\\w.-]*:)?row>)');
    const rows=result.match(re);
    if (!rows) throw Error('Existing worksheet row not found: '+rowNumber);
    const cell=xlsxScopedCell_(rows[2],addr,shared);
    if (!cell.element) throw Error('Existing worksheet cell not found: '+addr);
    if (cell.formula || cell.kind==='e' || cell.kind==='b')
      throw Error('Refusing formula/error/boolean cell write: '+addr);
    if (cell.old!==change.expected) throw Error('Previous value changed: '+addr);
    const style=cell.style ? ' s="'+cell.style+'"' : '';
    const p=cell.prefix;
    const element=typeof change.value==='number'
      ? '<'+p+'c r="'+addr+'"'+style+'><'+p+'v>'+change.value+'</'+p+'v></'+p+'c>'
      : '<'+p+'c r="'+addr+'"'+style+' t="inlineStr"><'+p+'is><'+p+'t xml:space="preserve">' +
        xlsxScopedEscape_(change.value)+'</'+p+'t></'+p+'is></'+p+'c>';
    const body=rows[2].replace(cell.element,element);
    result=result.replace(re,function(){return rows[1]+body+rows[3]});
  });
  return result;
}
function xlsxScopedGuard_(request) {
  if (!request || !/^[a-zA-Z0-9_-]{20,}$/.test(String(request.fileId || '')))
    throw Error('Invalid Drive File ID');
  if (!request.expectedName || !request.expectedName.endsWith('.xlsx'))
    throw Error('Expected XLSX name required');
  if (!request.sheetName || typeof request.sheetName !== 'string') throw Error('Sheet name required');
  const changes = request.changes;
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > XLSX_SCOPED.maxChanges)
    throw Error('Changes outside bounded limit');
  const addresses = new Set();
  changes.forEach(function(c) {
    if (!c || addresses.has(c.cell)) throw Error('Duplicate or missing cell');
    addresses.add(c.cell);
  });
  const list = JSON.parse(PropertiesService.getScriptProperties().getProperty(XLSX_SCOPED.allowlistKey) || '[]');
  if (!Array.isArray(list) || !list.includes(request.fileId)) throw Error('BLOCK_FILE_NOT_ALLOWLISTED');
}
function xlsxScopedCheckOtherParts_(before, after, target) {
  const a = Object.keys(before).sort(), b = Object.keys(after).sort();
  if (JSON.stringify(a) !== JSON.stringify(b)) throw Error('ZIP parts changed');
  a.forEach(function(name) {
    if (name !== target && xlsxScopedDigest_(before[name].getBytes()) !== xlsxScopedDigest_(after[name].getBytes()))
      throw Error('Unrelated ZIP part modified: ' + name);
  });
}
function xlsxScopedRun_(request, apply) {
  xlsxScopedGuard_(request);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw Error('Concurrent writeback in progress');
  try {
    const file = DriveApp.getFileById(request.fileId);
    if (file.getName() !== request.expectedName || file.getMimeType() !== XLSX_SCOPED.mime)
      throw Error('Drive file identity/MIME mismatch');
    const modified = file.getLastUpdated().getTime();
    const bytes = file.getBlob().getBytes();
    if (bytes.length > XLSX_SCOPED.maxBytes) throw Error('XLSX too large for safe simple upload');
    const hash = xlsxScopedDigest_(bytes);
    if (apply && (request.expectedModifiedMs !== modified || request.expectedSha256 !== hash))
      throw Error('SOURCE_REVISION_CHANGED: rerun preview');
    const pre = xlsxScopedParts_(Utilities.newBlob(bytes, XLSX_SCOPED.mime, file.getName()));
    const path = xlsxScopedSheetPath_(pre.parts, request.sheetName);
    const originalXml = pre.parts[path].getDataAsString();
    const shared = xlsxScopedSharedStrings_(pre.parts);
    const changedXml = xlsxScopedPatch_(originalXml, shared, request.changes);
    if (changedXml === originalXml) return {ok:true, status:'NO_CHANGE', fileId:request.fileId};
    if (!apply) return {ok:true, status:'DRY_RUN_PASS', fileId:request.fileId,
      expectedSha256:hash, expectedModifiedMs:modified, changedCells:request.changes.length, sheet:request.sheetName};
    if (file.getLastUpdated().getTime() !== modified) throw Error('SOURCE_CHANGED_BEFORE_UPLOAD');
    const nextParts = pre.items.map(function(part) {
      return part.getName() === path ? Utilities.newBlob(changedXml, 'text/xml', path) : part;
    });
    // One baseline only for higher-risk batches. Small bounded edits use Drive revision history.
    if (request.changes.length > 6) xlsxScopedBackupOnce_(file);
    const packed = Utilities.zip(nextParts, file.getName());
    if (packed.getBytes().length > XLSX_SCOPED.maxBytes) throw Error('Patched XLSX too large');
    const response = UrlFetchApp.fetch(
      'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(request.fileId) +
      '?uploadType=media&fields=id,name,mimeType,modifiedTime', {
      method:'patch', contentType:XLSX_SCOPED.mime,
      headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()},
      payload:packed.getBytes(), muteHttpExceptions:true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() > 299)
      throw Error('Drive PATCH rejected HTTP ' + response.getResponseCode());
    const reread = DriveApp.getFileById(request.fileId);
    const post = xlsxScopedParts_(reread.getBlob());
    xlsxScopedCheckOtherParts_(pre.parts, post.parts, path);
    const afterXml = post.parts[path].getDataAsString();
    request.changes.forEach(function(change) {
      const expected = String(change.value);
      const rowNum = Number((change.cell.match(/\d+/) || [])[0]);
      const row = afterXml.match(new RegExp('<(?:[A-Za-z_][\\w.-]*:)?row\\b[^>]*\\br="' + rowNum + '"[^>]*>[\\s\\S]*?<\\/(?:[A-Za-z_][\\w.-]*:)?row>'));
      if (!row || xlsxScopedCell_(row[0], change.cell, xlsxScopedSharedStrings_(post.parts)).old !== expected)
        throw Error('READBACK_FAILED: ' + change.cell);
    });
    return {ok:true, status:'DRIVE_READBACK_PASS', fileId:request.fileId,
      changedCells:request.changes.length, sheet:request.sheetName,
      note:'Downstream existing Sync/DB/UI verification remains separate'};
  } finally {lock.releaseLock();}
}
function xlsxScopedBackupOnce_(file) {
  const props = PropertiesService.getScriptProperties();
  const key = 'MATERIAL_PR_XLSX_BASELINE_' + file.getId();
  if (props.getProperty(key)) return;
  const parents = file.getParents();
  if (!parents.hasNext()) throw Error('Backup parent folder unavailable');
  const parent = parents.next();
  const folder = parent.getFoldersByName('Backup');
  const destination = folder.hasNext() ? folder.next() : parent.createFolder('Backup');
  const copy = file.makeCopy('BASELINE_before_scoped_xlsx_writeback_' + file.getName(), destination);
  if (!copy || !copy.getId()) throw Error('Baseline backup unsuccessful');
  props.setProperty(key, copy.getId());
}
function xlsxScopedPreview(request) { return xlsxScopedRun_(request, false); }
function xlsxScopedApply(request) { return xlsxScopedRun_(request, true); }


/**
 * One-time owner authorization/read-access probe from the Apps Script editor.
 * Private Script Property MATERIAL_PR_XLSX_CANARY_ID must identify a disposable
 * QA .xlsx file. This function does not modify any file.
 */
function xlsxScopedConnectionProbe() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('MATERIAL_PR_XLSX_CANARY_ID');
  if (!id) throw Error('MISSING_CANARY_ID');
  const allow = JSON.parse(props.getProperty(XLSX_SCOPED.allowlistKey) || '[]');
  if (!Array.isArray(allow) || !allow.includes(id)) throw Error('BLOCK_CANARY_NOT_ALLOWLISTED');
  const file = DriveApp.getFileById(id);
  if (!/^QA_.*DO_NOT_SYNC\\.xlsx$/.test(file.getName()) || file.getMimeType() !== XLSX_SCOPED.mime)
    throw Error('BLOCK_CANARY_NOT_ISOLATED');
  const parts = xlsxScopedParts_(file.getBlob());
  return {ok:true,status:'OWNER_OAUTH_READ_PROBE_PASS',
    fileName:file.getName(),parts:Object.keys(parts.parts).length,
    warning:'This does not prove Drive write access or Apps Script remote execution'};
}

/**
 * Optional one-time write credential smoke test, ONLY on isolated QA workbook.
 * Private property MATERIAL_PR_XLSX_CANARY_REQUEST = JSON:
 * {
 *   "fileId":"<disposable QA id>",
 *   "expectedName":"QA_...DO_NOT_SYNC.xlsx",
 *   "sheetName":"<sheet>",
 *   "changes":[{"cell":"<existing text cell>","expected":"<old text>","value":"QA_CANARY_20261021"}]
 * }
 * The fixture must contain an EXISTING non-formula text cell, and the dry-run
 * must be manually reviewed first. This smoke test writes then restores it.
 * If restore fails, STOP and repair only the disposable QA workbook.
 */
function xlsxScopedCanaryWriteAndRestore() {
  const props=PropertiesService.getScriptProperties();
  const raw=props.getProperty('MATERIAL_PR_XLSX_CANARY_REQUEST');
  if (!raw) throw Error('MISSING_CANARY_REQUEST');
  const req=JSON.parse(raw);
  if (!req || !/^QA_.*DO_NOT_SYNC\\.xlsx$/.test(String(req.expectedName||'')) ||
      !Array.isArray(req.changes) || req.changes.length!==1)
    throw Error('BLOCK_CANARY_REQUEST_NOT_ISOLATED');
  if (req.fileId!==props.getProperty('MATERIAL_PR_XLSX_CANARY_ID'))
    throw Error('BLOCK_CANARY_ID_MISMATCH');
  const change=req.changes[0];
  if (typeof change.expected!=='string' || typeof change.value!=='string' ||
      !/^QA_CANARY_[A-Za-z0-9_-]+$/.test(change.value) || change.expected===change.value)
    throw Error('BLOCK_CANARY_VALUE_INVALID');
  const before=xlsxScopedPreview(req);
  if (before.status!=='DRY_RUN_PASS') throw Error('CANARY_DRY_RUN_FAILED');
  const save=xlsxScopedApply(Object.assign({},req,{
    expectedSha256:before.expectedSha256,expectedModifiedMs:before.expectedModifiedMs
  }));
  if (save.status!=='DRIVE_READBACK_PASS') throw Error('CANARY_WRITE_READBACK_FAILED');
  const revert=Object.assign({},req,{changes:[{
    cell:change.cell,expected:change.value,value:change.expected
  }]});
  const verify=xlsxScopedPreview(revert);
  if (verify.status!=='DRY_RUN_PASS') throw Error('CANARY_ROLLBACK_PREFLIGHT_FAILED');
  const restored=xlsxScopedApply(Object.assign({},revert,{
    expectedSha256:verify.expectedSha256,expectedModifiedMs:verify.expectedModifiedMs
  }));
  if (restored.status!=='DRIVE_READBACK_PASS') throw Error('CANARY_RESTORE_FAILED');
  return {ok:true,status:'QA_ONLY_SAME_ID_WRITE_AND_RESTORE_PASS',
    fileName:req.expectedName,cell:change.cell,
    warning:'No Materials/PR Master was changed; no inbound Sync or remote API connection proven'};
}
