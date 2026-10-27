'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');

// Mock Google Apps Script environment for isolated testing
const mockScriptProperties = {
  'DAILY_LINE_GATEWAY_WEBHOOK_SECRET': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'SUPABASE_URL': 'https://example.supabase.co',
  'SUPABASE_SERVICE_ROLE_KEY': 'mock-service-role-key-test-only'
};

const mockCache = new Map();
let mockCreatedTriggers = [];

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => mockScriptProperties[k] || null,
    setProperty: (k, v) => { mockScriptProperties[k] = String(v); }
  })
};

global.CacheService = {
  getScriptCache: () => ({
    get: (k) => mockCache.get(k) || null,
    put: (k, v, ttl) => { mockCache.set(k, v); }
  })
};

global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  computeDigest: (algo, bytes) => {
    const buf = Buffer.from(bytes);
    const hash = crypto.createHash('sha256').update(buf).digest();
    return Array.from(hash).map(b => (b > 127 ? b - 256 : b));
  },
  base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
  getUuid: () => crypto.randomUUID(),
  newBlob: (str) => ({
    getBytes: () => Buffer.from(str, 'utf8')
  })
};

global.ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: (text) => ({
    text,
    setMimeType: () => ({ text })
  })
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    releaseLock: () => {}
  })
};

global.ScriptApp = {
  getProjectTriggers: () => mockCreatedTriggers,
  deleteTrigger: (trig) => {
    mockCreatedTriggers = mockCreatedTriggers.filter(t => t !== trig);
  },
  newTrigger: (fnName) => {
    let delayMs = 0;
    const builder = {
      timeBased: () => builder,
      atHour: () => builder,
      nearMinute: () => builder,
      everyDays: () => builder,
      inTimezone: () => builder,
      after: (ms) => { delayMs = ms; return builder; },
      create: () => {
        const trig = {
          getHandlerFunction: () => fnName,
          delayMs
        };
        mockCreatedTriggers.push(trig);
        return trig;
      }
    };
    return builder;
  }
};

// Import the executor module
const executorPath = path.resolve(__dirname, '../docs/apps-script/DailyLineGatewayExecutor_20261024.js');
const {
  GATEWAY_CFG,
  getBangkokReportDate_,
  getBangkokHour_,
  resolveDateFolder_,
  findFileInFolder_,
  getPngDimensions_,
  verifyPdfProperties_,
  verifyFormReconciliation_,
  sha256Hex_,
  timingSafeEqual_,
  verifyMasterTab_,
  runGatewayFlow_,
  doGet,
  doPost,
  dailyLineGatewayScheduled0730,
  dailyLineGatewayCatchUp,
  installDailyLineGatewayTrigger
} = require(executorPath);

// Helper to construct synthetic standard PNG bytes with specified width & height
function createSyntheticPng(width, height, payloadSize = 250) {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0); // chunk length = 13
  ihdrChunk.write('IHDR', 4); // chunk type
  ihdrChunk.writeUInt32BE(width, 8); // offset 8 in chunk = offset 16 in file!
  ihdrChunk.writeUInt32BE(height, 12); // offset 12 in chunk = offset 20 in file!
  ihdrChunk[16] = 8; // bit depth
  ihdrChunk[17] = 2; // color type RGB
  ihdrChunk[18] = 0; // compression
  ihdrChunk[19] = 0; // filter
  ihdrChunk[20] = 0; // interlace
  ihdrChunk.writeUInt32BE(0x12345678, 21); // dummy CRC
  const pad = Buffer.alloc(Math.max(0, payloadSize - 8 - ihdrChunk.length), 0xaa);
  return Buffer.concat([header, ihdrChunk, pad]);
}

// Helper to construct synthetic A4 Landscape 4-page PDF bytes
function createSyntheticPdf(pages = 4, landscape = true) {
  const mediaBox = landscape ? '[0 0 841.89 595.28]' : '[0 0 595.28 841.89]';
  let body = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  body += '2 0 obj\n<< /Type /Pages /Count ' + pages + ' /Kids [';
  for (let i = 0; i < pages; i++) {
    body += (3 + i) + ' 0 R ';
  }
  body += '] >>\nendobj\n';
  for (let i = 0; i < pages; i++) {
    body += (3 + i) + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ' + mediaBox + ' >>\nendobj\n';
  }
  body += 'xref\n0 ' + (3 + pages) + '\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
  return Buffer.from(body);
}

function makeIterator(items) {
  let idx = 0;
  return {
    hasNext: () => idx < items.length,
    next: () => {
      if (idx >= items.length) throw new Error('No more items');
      return items[idx++];
    }
  };
}

// Standard Mock setup for Drive and Sheets
function setupStandardMocks(overrides = {}) {
  const validPdfBytes = overrides.pdfBytes || createSyntheticPdf(4, true);
  const validPngBytes = overrides.pngBytes || createSyntheticPng(2947, 1800);

  global.SpreadsheetApp = {
    openById: (id) => ({
      getSheetByName: (name) => {
        if (overrides.missingTab && name === overrides.missingTab) return null;
        if (name === GATEWAY_CFG.FORM_TAB_NAME) {
          if (overrides.formEmpty) {
            return { getLastRow: () => 0 };
          }
          return {
            getLastRow: () => 10,
            getRange: () => ({
              getDisplayValues: () => overrides.formDates || [
                ['23/10/2026'], ['24/10/2026'], ['26/10/2026'], ['27/10/2026']
              ]
            })
          };
        }
        return {
          getRange: (addr) => ({
            getDisplayValue: () => '23-10-2026',
            getValue: () => {
              if (overrides.headcountMismatch && addr === 'E6') return 999;
              return (addr === 'A6' ? 67 : addr === 'C6' ? 9 : addr === 'E6' ? 76 : addr === 'G6' ? 11 : 0);
            },
            getFormula: () => (overrides.noFormula && addr === 'E6' ? '' : '=A6+C6')
          })
        };
      }
    })
  };

  const createDateFolder = (id = 'date_folder_1', parentId = 'month_folder_1') => ({
    getId: () => id,
    getName: () => 'date_folder',
    getParents: () => makeIterator([{ getId: () => parentId }]),
    getFilesByName: (name) => {
      if (overrides.duplicateFileName && name.includes('.pdf')) {
        return makeIterator([
          { getId: () => 'f1', getName: () => name, getBlob: () => ({ getBytes: () => validPdfBytes }) },
          { getId: () => 'f2', getName: () => name, getBlob: () => ({ getBytes: () => validPdfBytes }) }
        ]);
      }
      if (overrides.missingPdf && name.includes('.pdf')) {
        return makeIterator([]);
      }
      return makeIterator([{
        getId: () => 'found_file_id',
        getName: () => name,
        getBlob: () => ({
          getBytes: () => (name.includes('.pdf') ? validPdfBytes : validPngBytes)
        })
      }]);
    }
  });

  const createMonthFolder = (id = 'month_folder_1') => ({
    getId: () => id,
    getName: () => 'October 2026',
    getFoldersByName: (subName) => {
      if (overrides.duplicateDateFolder && subName === '24102026') {
        return makeIterator([createDateFolder('d1', id), createDateFolder('d2', id)]);
      }
      if (overrides.invalidParent && subName === '24102026') {
        return makeIterator([createDateFolder('d1', 'wrong_parent')]);
      }
      return makeIterator([createDateFolder('date_folder_1', id)]);
    }
  });

  global.DriveApp = {
    getFileById: (id) => {
      const isTrashed = overrides.trashedDocId === id;
      return {
        getId: () => id,
        getName: () => 'sample_file_' + id,
        isTrashed: () => isTrashed,
        getBlob: () => ({
          getBytes: () => (id.includes('pdf') || id === GATEWAY_CFG.PDF_FILE_ID ? validPdfBytes : validPngBytes)
        })
      };
    },
    getFolderById: (id) => ({
      getId: () => id,
      getName: () => 'folder_' + id,
      getFoldersByName: (name) => {
        if (overrides.missingMonth && name.includes('October')) {
          return makeIterator([]);
        }
        if (overrides.duplicateMonthFolder && name.includes('October')) {
          return makeIterator([createMonthFolder('m1'), createMonthFolder('m2')]);
        }
        return makeIterator([createMonthFolder('month_folder_1')]);
      },
      getFilesByName: (name) => {
        if (overrides.duplicateFileName && name.includes('.pdf')) {
          return makeIterator([
            { getId: () => 'f1', getName: () => name, getBlob: () => ({ getBytes: () => validPdfBytes }) },
            { getId: () => 'f2', getName: () => name, getBlob: () => ({ getBytes: () => validPdfBytes }) }
          ]);
        }
        if (overrides.missingPdf && name.includes('.pdf')) {
          return makeIterator([]);
        }
        return makeIterator([{
          getId: () => 'found_file_id',
          getName: () => name,
          getBlob: () => ({
            getBytes: () => (name.includes('.pdf') ? validPdfBytes : validPngBytes)
          })
        }]);
      }
    })
  };
}

test('1. Bangkok Report Date Policy: Sunday SKIP, Monday uses Saturday, Tuesday-Saturday uses yesterday', () => {
  const sunday = new Date('2026-10-25T00:30:00Z'); // 07:30 Bangkok
  assert.equal(getBangkokReportDate_(sunday), null);

  const monday = new Date('2026-10-26T00:30:00Z');
  assert.equal(getBangkokReportDate_(monday), '2026-10-24');

  const tuesday = new Date('2026-10-27T00:30:00Z');
  assert.equal(getBangkokReportDate_(tuesday), '2026-10-26');

  const wednesday = new Date('2026-10-28T00:30:00Z');
  assert.equal(getBangkokReportDate_(wednesday), '2026-10-27');
});

test('2. PNG Parser and Dimension QA: requires exactly width 2947px', () => {
  const validPng = createSyntheticPng(2947, 1850);
  const dims = getPngDimensions_(validPng);
  assert.equal(dims.width, 2947);
  assert.equal(dims.height, 1850);

  const wrongWidthPng = createSyntheticPng(2000, 1000);
  const wrongDims = getPngDimensions_(wrongWidthPng);
  assert.notEqual(wrongDims.width, 2947);

  assert.throws(() => {
    getPngDimensions_(Buffer.from('not a png file at all! this has 30 bytes'));
  }, /Invalid PNG signature/);

  assert.throws(() => {
    getPngDimensions_(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
  }, /File too small to be PNG/);
});

test('3. SHA-256 Checksum Calculation matches standard crypto digest', () => {
  const data = Buffer.from('3 Kings Construction Daily Report Test Content');
  const expectedSha = crypto.createHash('sha256').update(data).digest('hex');
  const computedSha = sha256Hex_(data);
  assert.equal(computedSha, expectedSha);
});

test('4. Timing-Safe Comparison protects authentication token', () => {
  const secret = 'secret-key-32-bytes-minimum-length-guard';
  assert.equal(timingSafeEqual_(secret, secret), true);
  assert.equal(timingSafeEqual_(secret, secret.slice(0, 10)), false);
  assert.equal(timingSafeEqual_(secret, 'wrong-key-same-length-padding-here!'), false);
  assert.equal(timingSafeEqual_(secret, null), false);
  assert.equal(timingSafeEqual_(undefined, secret), false);
});

test('5. PDF Properties QA: verifies 4 pages and A4 landscape orientation', () => {
  const pdf4Landscape = createSyntheticPdf(4, true);
  const r1 = verifyPdfProperties_(pdf4Landscape);
  assert.equal(r1.valid, true);
  assert.equal(r1.pages, 4);
  assert.equal(r1.landscape, true);

  // 3 pages fails
  const pdf3Landscape = createSyntheticPdf(3, true);
  const r2 = verifyPdfProperties_(pdf3Landscape);
  assert.equal(r2.valid, false);
  assert.equal(r2.pages, 3);

  // Portrait fails
  const pdf4Portrait = createSyntheticPdf(4, false);
  const r3 = verifyPdfProperties_(pdf4Portrait);
  assert.equal(r3.valid, false);
  assert.equal(r3.landscape, false);
});

test('6. Web App Security: doGet returns ONLY basic health without token exposure', () => {
  const res = doGet({});
  const data = JSON.parse(res.text);
  assert.equal(data.service, '3kings_daily_line_gateway_executor');
  assert.equal(data.status, 'ACTIVE');
  assert.equal(data.health, 'OK');
  assert.equal(data.inspection, undefined, 'Must NEVER expose inspection or tokens via doGet');
});

test('7. doPost Authentication, Replay Protection, and Delivery Guard', () => {
  setupStandardMocks();
  const secret = mockScriptProperties.DAILY_LINE_GATEWAY_WEBHOOK_SECRET;
  const nonce = 'unique-nonce-1234567890123456';
  const now = Date.now();

  // 1. Missing body -> 400
  const r1 = doPost({});
  assert.equal(JSON.parse(r1.text).error, 'BAD_REQUEST');

  // 2. Missing/Invalid token -> 401
  const r2 = doPost({
    postData: { contents: JSON.stringify({ token: 'wrong-token', timestamp: now, nonce }) }
  });
  assert.equal(JSON.parse(r2.text).error, 'UNAUTHORIZED');

  // 3. Stale timestamp (> 5 min) -> 403
  const staleTime = now - (6 * 60 * 1000);
  const r3 = doPost({
    postData: { contents: JSON.stringify({ token: secret, timestamp: staleTime, nonce }) }
  });
  assert.equal(JSON.parse(r3.text).error, 'REPLAY_REJECTED');

  // 4. Delivery Guard: force === true prohibited -> 403
  const nonce2 = 'unique-nonce-2222222222222222';
  const rForce = doPost({
    postData: { contents: JSON.stringify({ token: secret, timestamp: now, nonce: nonce2, action: 'stage_and_finalize', force: true }) }
  });
  assert.equal(JSON.parse(rForce.text).error, 'DELIVERY_GUARD_BLOCKED');

  // 5. Delivery Guard: historical date staging prohibited -> 403
  const nonce3 = 'unique-nonce-3333333333333333';
  const rHist = doPost({
    postData: { contents: JSON.stringify({ token: secret, timestamp: now, nonce: nonce3, action: 'stage_and_finalize', targetDate: '2026-10-01' }) }
  });
  assert.equal(JSON.parse(rHist.text).error, 'DELIVERY_GUARD_BLOCKED');
});

test('8. Negative Test: daily_line_ready returns ready=false -> GATEWAY_NOT_READY', () => {
  setupStandardMocks();
  const pdfSha = crypto.createHash('sha256').update(createSyntheticPdf(4, true)).digest('hex');
  const pngSha = crypto.createHash('sha256').update(createSyntheticPng(2947, 1800)).digest('hex');

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      const payload = JSON.parse(opts.payload);
      if (url.includes('daily_line_ready')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ ready: false, report_date: '2026-10-23' })
        };
      }
      if (url.includes('daily_line_stage_asset')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'STAGED_READBACK', site: payload.p_site, sha256: payload.p_sha256 })
        };
      }
      if (url.includes('daily_line_finalize')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'QA_FINALIZED', png_count: 4 })
        };
      }
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    }
  };

  const result = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(result.status, 'GATEWAY_NOT_READY');
  assert.equal(result.readyResult.ready, false);
});

test('9. Negative Test: Finalize returns non-QA_FINALIZED status -> FINALIZE_FAILED', () => {
  setupStandardMocks();
  global.UrlFetchApp = {
    fetch: (url, opts) => {
      const payload = JSON.parse(opts.payload);
      if (url.includes('daily_line_ready')) {
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ready: false }) };
      }
      if (url.includes('daily_line_stage_asset')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'STAGED_READBACK', site: payload.p_site, sha256: payload.p_sha256 })
        };
      }
      if (url.includes('daily_line_finalize')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'REJECTED_MANUAL_NOT_VERIFIED' })
        };
      }
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    }
  };

  const result = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(result.status, 'FINALIZE_FAILED');
});

test('10. Negative Test: SHA mismatch between Drive and Gateway -> PDF_SHA_MISMATCH & ASSET_SHA_MISMATCH', () => {
  setupStandardMocks();
  const pdfSha = crypto.createHash('sha256').update(createSyntheticPdf(4, true)).digest('hex');
  const pngSha = crypto.createHash('sha256').update(createSyntheticPng(2947, 1800)).digest('hex');

  // Test PDF SHA mismatch
  let readyCheckPdf = 0;
  global.UrlFetchApp = {
    fetch: (url, opts) => {
      const payload = JSON.parse(opts.payload);
      if (url.includes('daily_line_ready')) {
        readyCheckPdf++;
        const ready = readyCheckPdf > 1;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            ready: ready,
            report_date: '2026-10-23',
            pdf_sha256: ready ? 'tampered-pdf-sha-differs-from-drive-calculated-sha-00000000000000' : null,
            assets: ready ? [
              { site: 'above_villa', sha256: pngSha },
              { site: 'above_condo', sha256: pngSha },
              { site: 'mirage', sha256: pngSha },
              { site: 'henessy', sha256: pngSha }
            ] : []
          })
        };
      }
      if (url.includes('daily_line_stage_asset')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'STAGED_READBACK', site: payload.p_site, sha256: payload.p_sha256 })
        };
      }
      if (url.includes('daily_line_finalize')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'QA_FINALIZED', png_count: 4 })
        };
      }
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    }
  };

  const rPdfMismatch = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(rPdfMismatch.status, 'PDF_SHA_MISMATCH');

  // Test Asset SHA mismatch
  let readyCheckAsset = 0;
  global.UrlFetchApp.fetch = (url, opts) => {
    const payload = JSON.parse(opts.payload);
    if (url.includes('daily_line_ready')) {
      readyCheckAsset++;
      const ready = readyCheckAsset > 1;
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          ready: ready,
          report_date: '2026-10-23',
          pdf_sha256: ready ? pdfSha : null,
          assets: ready ? [
            { site: 'above_villa', sha256: 'wrong-sha-for-villa-000000000000000000000000000000000000000000000' },
            { site: 'above_condo', sha256: pngSha },
            { site: 'mirage', sha256: pngSha },
            { site: 'henessy', sha256: pngSha }
          ] : []
        })
      };
    }
    if (url.includes('daily_line_stage_asset')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ status: 'STAGED_READBACK', site: payload.p_site, sha256: payload.p_sha256 })
      };
    }
    if (url.includes('daily_line_finalize')) {
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ status: 'QA_FINALIZED', png_count: 4 })
      };
    }
    return { getResponseCode: () => 200, getContentText: () => '{}' };
  };

  const rAssetMismatch = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(rAssetMismatch.status, 'ASSET_SHA_MISMATCH');
  assert.equal(rAssetMismatch.site, 'above_villa');
});

test('11. Negative Test: QA Evidence incomplete -> HOLD_QA_EVIDENCE_INCOMPLETE', () => {
  // Test 1: PDF has 3 pages instead of 4
  setupStandardMocks({ pdfBytes: createSyntheticPdf(3, true) });
  const r1 = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(r1.status, 'HOLD_QA_EVIDENCE_INCOMPLETE');
  assert.match(r1.reason, /PDF_QA_FAILED/);

  // Test 2: Master formula missing
  setupStandardMocks({ noFormula: true, headcountMismatch: true });
  const r2 = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(r2.status, 'PENDING_SOURCE_FILES'); // Headcount verification failed

  // Test 3: SOP Canonical doc trashed/inaccessible
  setupStandardMocks({ trashedDocId: GATEWAY_CFG.SOP_CANONICAL_DOC_ID });
  const r3 = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(r3.status, 'HOLD_QA_EVIDENCE_INCOMPLETE');
  assert.match(r3.reason, /SOP_DOCUMENTS_NOT_VERIFIED/);
});

test('12. Idempotency Gate: if daily_line_ready already true, returns ALREADY_READY without writes', () => {
  setupStandardMocks();
  let stageCalled = 0;
  let finalizeCalled = 0;

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      if (url.includes('daily_line_ready')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ ready: true, report_date: '2026-10-23' })
        };
      }
      if (url.includes('daily_line_stage_asset')) {
        stageCalled++;
        return { getResponseCode: () => 200, getContentText: () => '{}' };
      }
      if (url.includes('daily_line_finalize')) {
        finalizeCalled++;
        return { getResponseCode: () => 200, getContentText: () => '{}' };
      }
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    }
  };

  const result = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(result.status, 'ALREADY_READY');
  assert.equal(stageCalled, 0, 'Must NOT stage assets when already ready');
  assert.equal(finalizeCalled, 0, 'Must NOT finalize when already ready');
});

test('13. Full Flow Execution: Stages 4/4 assets with STAGED_READBACK, finalizes QA_FINALIZED, and returns SUCCESS', () => {
  setupStandardMocks();
  const pdfSha = crypto.createHash('sha256').update(createSyntheticPdf(4, true)).digest('hex');
  const pngSha = crypto.createHash('sha256').update(createSyntheticPng(2947, 1800)).digest('hex');

  let stageCalls = [];
  let finalizePayload = null;
  let readyCheckCount = 0;

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      const payload = JSON.parse(opts.payload);
      if (url.includes('daily_line_ready')) {
        readyCheckCount++;
        const ready = readyCheckCount > 1;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            ready: ready,
            report_date: '2026-10-23',
            pdf_sha256: pdfSha,
            assets: ready ? [
              { site: 'above_villa', sha256: pngSha },
              { site: 'above_condo', sha256: pngSha },
              { site: 'mirage', sha256: pngSha },
              { site: 'henessy', sha256: pngSha }
            ] : []
          })
        };
      }
      if (url.includes('daily_line_stage_asset')) {
        stageCalls.push(payload);
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'STAGED_READBACK', site: payload.p_site, sha256: payload.p_sha256 })
        };
      }
      if (url.includes('daily_line_finalize')) {
        finalizePayload = payload;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'QA_FINALIZED', date: payload.p_report_date, png_count: 4 })
        };
      }
      throw new Error('Unexpected RPC call: ' + url);
    }
  };

  const result = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(result.status, 'SUCCESS');
  assert.equal(stageCalls.length, 4, 'Must stage exactly 4 assets');
  assert.deepEqual(stageCalls.map(s => s.p_site), ['above_villa', 'above_condo', 'mirage', 'henessy']);

  // Validate QA evidence in finalize payload
  assert.ok(finalizePayload, 'daily_line_finalize must be called');
  assert.equal(finalizePayload.p_report_date, '2026-10-23');
  assert.equal(finalizePayload.p_qa.sopIndexRead, true);
  assert.equal(finalizePayload.p_qa.pdf4PagesVerified, true);
  assert.equal(finalizePayload.p_qa.pdfA4LandscapeVerified, true);
  assert.equal(finalizePayload.p_qa.sopCanonicalV32Read, true);
  assert.equal(finalizePayload.p_qa.sopIndexDocId, GATEWAY_CFG.SOP_INDEX_DOC_ID);
  assert.equal(finalizePayload.p_qa.sopCanonicalDocId, GATEWAY_CFG.SOP_CANONICAL_DOC_ID);

  // Verify ready result
  assert.equal(result.readyResult.ready, true);
  assert.equal(result.readyResult.pdf_sha256, pdfSha);
});

test('14. Catch-Up Trigger: schedules 15-minute catch-up on PENDING_SOURCE_FILES', () => {
  setupStandardMocks({ missingTab: '261026' });
  mockCreatedTriggers = [];

  const res = dailyLineGatewayScheduled0730();
  assert.equal(res.status, 'PENDING_SOURCE_FILES');
  assert.equal(mockCreatedTriggers.length, 1, 'Must schedule one catch-up trigger');
  assert.equal(mockCreatedTriggers[0].getHandlerFunction(), 'dailyLineGatewayCatchUp');
});

test('15. Folder Resolver & Strict Parent Chain: rejects duplicate folders and wrong parent chain', () => {
  // Test duplicate month folder
  setupStandardMocks({ duplicateMonthFolder: true });
  assert.throws(() => {
    resolveDateFolder_('root_id', '24102026', '2026', '10');
  }, /DUPLICATE_MONTH_FOLDER/);

  // Test duplicate date folder
  setupStandardMocks({ duplicateDateFolder: true });
  assert.throws(() => {
    resolveDateFolder_('root_id', '24102026', '2026', '10');
  }, /DUPLICATE_DATE_FOLDER/);

  // Test invalid parent chain
  setupStandardMocks({ invalidParent: true });
  assert.throws(() => {
    resolveDateFolder_('root_id', '24102026', '2026', '10');
  }, /INVALID_PARENT_CHAIN/);
});

test('16. File Finder: rejects duplicate files with identical name in the same folder', () => {
  setupStandardMocks({ duplicateFileName: true });
  assert.throws(() => {
    findFileInFolder_('date_folder_id', 'Daily_Site_Report_24-10-2026.pdf');
  }, /DUPLICATE_FILE_NAME/);
});
