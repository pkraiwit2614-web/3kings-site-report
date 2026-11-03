const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { createHash } = require('node:crypto');

// Load route.ts
const route = fs.readFileSync(path.join(__dirname, '../app/api/sync/drive/route.ts'), 'utf8');
const state = { sheets: {}, rpcCalls: [] };
const compiled = stripTypeScriptTypes(route.replace(/^import .*$/gm, '').replace(/^export /gm, ''));
const api = new Function('NextResponse', 'createClient', 'readSheet', 'createHash',
  compiled + '\nreturn {POST, pct, normalizeHeader, parseSchedule}'
)(
  { json: (data, init) => ({ data, status: init?.status || 200 }) },
  () => ({
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      return { data: { ok: true }, error: null };
    }
  }),
  async (_buffer, sheet) => {
    if (!state.sheets[sheet]) throw new Error('Missing synthetic sheet: ' + sheet);
    return state.sheets[sheet];
  },
  createHash
);

function request(query) {
  return {
    url: 'https://example.test/api/sync/drive?' + query,
    headers: { get: () => 'synthetic-sync-key' },
    arrayBuffer: async () => new Uint8Array([1]).buffer
  };
}

async function runTests() {
  console.log('Testing pct() edge cases...');
  assert.equal(api.pct(null), null);
  assert.equal(api.pct(''), null);
  assert.equal(api.pct('-'), null);
  assert.equal(api.pct(0), 0);
  assert.equal(api.pct('0%'), 0);
  assert.equal(api.pct(0.01), 0.01);
  assert.equal(api.pct('1%'), 0.01);
  assert.equal(api.pct(0.75), 0.75);
  assert.equal(api.pct('75%'), 0.75);
  assert.equal(api.pct(75), 0.75);
  assert.equal(api.pct(1), 1);
  assert.equal(api.pct('100%'), 1);
  assert.equal(api.pct('abc'), null);

  console.log('Testing schedule parse with Blank/NULL preservation...');
  const scheduleHeaders = [
    'ID', 'หมวดหลัก', 'Task Name ตาม Schedule', 'พื้นที่/ชั้น',
    '% หน้างานล่าสุด', 'สถานะหน้างาน', 'ปัญหา/อุปสรรค',
    'งานถัดไป/แนวทางแก้', 'วันที่อัปเดต'
  ];

  state.sheets = {
    'ติดตามความคืบหน้าP6': [
      scheduleHeaders,
      ['1', 'Structure', 'Task 1 - Genuine Zero', 'F1', 0, 'Not started', '', '', '01/11/2026'],
      ['2', 'Structure', 'Task 2 - Blank Progress', 'F1', null, 'In progress', '', '', '01/11/2026'],
      ['3', 'Structure', 'Task 3 - Empty String', 'F1', '', 'In progress', '', '', '01/11/2026'],
      ['4', 'Structure', 'Task 4 - 75 Percent', 'F1', 0.75, 'In progress', '', '', '01/11/2026'],
      ['5', 'Structure', 'Task 5 - 1 Percent String', 'F1', '1%', 'In progress', '', '', '01/11/2026']
    ]
  };

  const res = await api.POST(request('kind=schedule&project=AV-P6'));
  assert.equal(res.status, 200);
  const rpc = state.rpcCalls.find(c => c.name === 'drive_sync_apply_schedule');
  assert.ok(rpc, 'drive_sync_apply_schedule was called');
  
  const rows = rpc.args.p_rows;
  assert.equal(rows.length, 5);
  
  // Verify Task 1: Genuine zero is 0
  assert.equal(rows[0].actual_progress, 0, 'Genuine zero should be 0');
  
  // Verify Task 2: Blank cell is null (NOT 0!)
  assert.equal(rows[1].actual_progress, null, 'Blank cell should be null, not 0');
  
  // Verify Task 3: Empty string is null (NOT 0!)
  assert.equal(rows[2].actual_progress, null, 'Empty string should be null, not 0');
  
  // Verify Task 4: 75% is 0.75
  assert.equal(rows[3].actual_progress, 0.75, '75% should be 0.75');
  
  // Verify Task 5: 1% string is 0.01 (NOT 1.00!)
  assert.equal(rows[4].actual_progress, 0.01, '1% string should be 0.01');

  console.log('Testing fail-closed on malformed progress...');
  state.sheets['ติดตามความคืบหน้าP6'] = [
    scheduleHeaders,
    ['1', 'Structure', 'Malformed Task', 'F1', 'INVALID_TEXT', 'In progress', '', '', '01/11/2026']
  ];
  const malformedRes = await api.POST(request('kind=schedule&project=AV-P6'));
  assert.equal(malformedRes.status, 500);
  assert.match(malformedRes.data.error, /Invalid actual progress value at row 2/);

  console.log('PASS: All schedule progress preservation and fail-closed tests passed successfully!');
}

runTests().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

