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
  getProjectTriggers: () => []
};

// Import the executor module
const executorPath = path.resolve(__dirname, '../docs/apps-script/DailyLineGatewayExecutor_20261024.js');
const {
  GATEWAY_CFG,
  getBangkokReportDate_,
  getPngDimensions_,
  sha256Hex_,
  timingSafeEqual_,
  verifyMasterTab_,
  runGatewayFlow_,
  doGet,
  doPost,
  dailyLineGatewayScheduled0730
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

test('1. Bangkok Report Date Policy: Sunday SKIP, Monday uses Saturday, Tuesday-Saturday uses yesterday', () => {
  // Sunday 2026-10-25 07:30 Bangkok -> SKIP (null)
  const sunday = new Date('2026-10-25T00:30:00Z'); // 07:30 Bangkok
  assert.equal(getBangkokReportDate_(sunday), null);

  // Monday 2026-10-26 07:30 Bangkok -> Saturday 2026-10-24
  const monday = new Date('2026-10-26T00:30:00Z');
  assert.equal(getBangkokReportDate_(monday), '2026-10-24');

  // Tuesday 2026-10-27 07:30 Bangkok -> Monday 2026-10-26
  const tuesday = new Date('2026-10-27T00:30:00Z');
  assert.equal(getBangkokReportDate_(tuesday), '2026-10-26');

  // Wednesday 2026-10-28 07:30 Bangkok -> Tuesday 2026-10-27
  const wednesday = new Date('2026-10-28T00:30:00Z');
  assert.equal(getBangkokReportDate_(wednesday), '2026-10-27');
});

test('2. PNG Parser and Dimension QA: requires exactly width 2947px', () => {
  const validPng = createSyntheticPng(2947, 1850);
  const dims = getPngDimensions_(validPng);
  assert.equal(dims.width, 2947);
  assert.equal(dims.height, 1850);

  // Invalid width
  const wrongWidthPng = createSyntheticPng(2000, 1000);
  const wrongDims = getPngDimensions_(wrongWidthPng);
  assert.notEqual(wrongDims.width, 2947);

  // Invalid PNG signature
  assert.throws(() => {
    getPngDimensions_(Buffer.from('not a png file at all! this has 30 bytes'));
  }, /Invalid PNG signature/);

  // File too small (< 24 bytes)
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

test('5. Web App Security: unauthenticated doGet returns ONLY basic health, no sensitive info', () => {
  // Probe with no token
  const res = doGet({});
  const data = JSON.parse(res.text);
  assert.equal(data.service, '3kings_daily_line_gateway_executor');
  assert.equal(data.status, 'ACTIVE');
  assert.equal(data.authenticated, false);
  assert.equal(data.inspection, undefined, 'Must NOT expose inspection without authentication');
  assert.equal(data.triggers, undefined, 'Must NOT expose triggers without authentication');
});

test('6. Web App Security: authenticated doGet returns inspection with valid token', () => {
  // Mock Drive and Spreadsheet for inspection
  global.SpreadsheetApp = {
    openById: () => ({
      getSheetByName: () => ({
        getRange: (addr) => ({
          getDisplayValue: () => '23-10-2026',
          getValue: () => (addr === 'A6' ? 67 : addr === 'C6' ? 9 : addr === 'E6' ? 76 : addr === 'G6' ? 11 : 0)
        })
      })
    })
  };

  const samplePng = createSyntheticPng(2947, 1800);
  const samplePdf = Buffer.from('%PDF-1.4 4-page test pdf content');

  global.DriveApp = {
    getFileById: (id) => ({
      getId: () => id,
      getName: () => 'sample_file',
      getBlob: () => ({
        getBytes: () => (id.includes('pdf') || id === GATEWAY_CFG.PDF_FILE_ID ? samplePdf : samplePng)
      })
    })
  };

  const secret = mockScriptProperties.DAILY_LINE_GATEWAY_WEBHOOK_SECRET;
  const res = doGet({ parameter: { token: secret } });
  const data = JSON.parse(res.text);
  assert.equal(data.service, '3kings_daily_line_gateway_executor');
  assert.equal(data.status, 'ACTIVE');
  assert.equal(data.authenticated, true);
  assert.ok(data.inspection);
  assert.equal(data.inspection.status, 'INSPECTED');
  assert.equal(data.inspection.details.masterQa.headcountVerified, true);
});

test('7. doPost Authentication and Replay Protection', () => {
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

  // 4. Valid invocation -> 200
  const r4 = doPost({
    postData: { contents: JSON.stringify({ token: secret, timestamp: now, nonce, action: 'inspect_only' }) }
  });
  assert.equal(JSON.parse(r4.text).status, 'INSPECTED');

  // 5. Replayed nonce -> 403
  const r5 = doPost({
    postData: { contents: JSON.stringify({ token: secret, timestamp: now, nonce, action: 'inspect_only' }) }
  });
  assert.equal(JSON.parse(r5.text).error, 'REPLAY_REJECTED');
});

test('8. Idempotency Gate: if daily_line_ready already true, skips staging and finalization', () => {
  let stageCalled = 0;
  let finalizeCalled = 0;

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      const payload = JSON.parse(opts.payload);
      if (url.includes('daily_line_ready')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ ready: true, report_date: '2026-10-23' })
        };
      }
      if (url.includes('daily_line_stage_asset')) {
        stageCalled++;
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ staged: true }) };
      }
      if (url.includes('daily_line_finalize')) {
        finalizeCalled++;
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ finalized: true }) };
      }
      return { getResponseCode: () => 200, getContentText: () => '{}' };
    }
  };

  const result = runGatewayFlow_('stage_and_finalize', false, '2026-10-23');
  assert.equal(result.status, 'ALREADY_READY');
  assert.equal(stageCalled, 0, 'Must not stage assets when already ready');
  assert.equal(finalizeCalled, 0, 'Must not finalize when already ready');
});

test('9. Full Flow Execution: stages 4 assets, finalizes with SOP v3.2 & DB evidence, verifies ready', () => {
  let stageCalls = [];
  let finalizePayload = null;
  let readyCheckCount = 0;

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      const payload = JSON.parse(opts.payload);
      if (url.includes('daily_line_ready')) {
        readyCheckCount++;
        // First check returns not ready; second check after finalize returns ready
        const ready = readyCheckCount > 1;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            ready: ready,
            report_date: '2026-10-23',
            assets: ready ? [
              { site: 'above_villa', sha256: 'a'.repeat(64) },
              { site: 'above_condo', sha256: 'b'.repeat(64) },
              { site: 'mirage', sha256: 'c'.repeat(64) },
              { site: 'henessy', sha256: 'd'.repeat(64) }
            ] : []
          })
        };
      }
      if (url.includes('daily_line_stage_asset')) {
        stageCalls.push(payload);
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'staged', site: payload.p_site })
        };
      }
      if (url.includes('daily_line_finalize')) {
        finalizePayload = payload;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ status: 'finalized', report_date: payload.p_report_date })
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
  assert.equal(finalizePayload.p_qa.sopSheetsV2Read, true);
  assert.equal(finalizePayload.p_qa.sopPublishV2Read, true);
  assert.equal(finalizePayload.p_qa.sopCanonicalV32Read, true);
  assert.equal(finalizePayload.p_qa.sopIndexDocId, '1ZUO3eGCFd88l_R2aCH2EnIMJ-rlbyIoMxD3sY-9j1Pg');
  assert.equal(finalizePayload.p_qa.sopCanonicalDocId, '1SG3Ptvt2GFjbyPeMT4tIAZEXr5NUjKhIjTYx9Neu1uk');

  // Verify ready result
  assert.equal(result.readyResult.ready, true);
});

test('10. PNG Size Guard: rejects assets > 1MB or < 100 bytes', () => {
  // Test oversized PNG (> 1MB)
  const hugePng = createSyntheticPng(2947, 1800, 1048576 + 500);
  global.DriveApp.getFileById = (id) => ({
    getId: () => id,
    getName: () => 'huge.png',
    getBlob: () => ({ getBytes: () => hugePng })
  });

  assert.throws(() => {
    runGatewayFlow_('inspect_only', false, '2026-10-23');
  }, /ASSET_TOO_LARGE/);

  // Test undersized PNG (< 100 bytes)
  const tinyPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  global.DriveApp.getFileById = (id) => ({
    getId: () => id,
    getName: () => 'tiny.png',
    getBlob: () => ({ getBytes: () => tinyPng })
  });

  assert.throws(() => {
    runGatewayFlow_('inspect_only', false, '2026-10-23');
  }, /ASSET_TOO_SMALL/);
});

test('11. Scheduled 07:30 Trigger skips on Sunday without stage or finalize', () => {
  let invoked = false;
  global.UrlFetchApp = {
    fetch: () => { invoked = true; return { getResponseCode: () => 200, getContentText: () => '{}' }; }
  };

  // Mock Date for Sunday
  const origDate = Date;
  function MockDate(arg) {
    if (arg) return new origDate(arg);
    return new origDate('2026-10-25T00:30:00Z'); // Sunday 07:30 Bangkok
  }
  MockDate.now = () => new origDate('2026-10-25T00:30:00Z').getTime();
  MockDate.prototype = origDate.prototype;
  global.Date = MockDate;

  try {
    const outcome = dailyLineGatewayScheduled0730();
    assert.equal(outcome.status, 'SUNDAY_SKIP');
    assert.equal(invoked, false, 'UrlFetchApp must not be called on Sunday');
  } finally {
    global.Date = origDate;
  }
});
