const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {stripTypeScriptTypes} = require('node:module')
const {createHash} = require('node:crypto')

// Synthetic-only regression: no real Supabase client, HTTP request or workbook.
const route = fs.readFileSync(path.join(__dirname, '../app/api/sync/drive/route.ts'), 'utf8')
const projectPage = fs.readFileSync(path.join(__dirname, '../app/projects/[id]/page.tsx'), 'utf8')
const state = {sheets: {}, rpcCalls: [], bodyReads: 0}
const compiled = stripTypeScriptTypes(route.replace(/^import .*$/gm, '').replace(/^export /gm, ''))
const api = new Function('NextResponse', 'createClient', 'readSheet', 'createHash',
  compiled + '\nreturn {POST, mapProjectFromLocation, mapProjectsFromLocation}'
)(
  {json: (data, init) => ({data, status: init?.status || 200})},
  () => ({rpc: async (name, args) => {
    state.rpcCalls.push({name, args})
    return {data: {ok: true}, error: null}
  }}),
  async (_buffer, sheet) => {
    if (!state.sheets[sheet]) throw new Error('Missing synthetic sheet: ' + sheet)
    return state.sheets[sheet]
  },
  createHash
)

function request(query) {
  return {
    url: 'https://example.test/api/sync/drive?' + query,
    headers: {get: () => 'synthetic-only-key'},
    arrayBuffer: async () => {
      state.bodyReads++
      return new Uint8Array([1]).buffer
    }
  }
}
async function main() {
  for (const alias of ['Plot 3', 'Plot3', 'plot 3', 'P3', 'AV-P3']) {
    assert.equal(api.mapProjectFromLocation(alias), 'AV-P3', alias)
  }
  for (const invalid of ['Plot 30', 'Plot 31', 'P30', 'AV-P30', 'Plot 3A', 'Plot 60', 'Plot 10', 'PR_Plot3_Working']) {
    assert.equal(api.mapProjectFromLocation(invalid), null, invalid)
  }
  for (const number of [6, 7, 8, 9]) {
    assert.equal(api.mapProjectFromLocation('Above Villa Plot ' + number), 'AV-P' + number)
    // Before this fix, bare non-P3 codes were not parsed. Keep that behavior.
    assert.equal(api.mapProjectFromLocation('P' + number), null)
    assert.equal(api.mapProjectFromLocation('AV-P' + number), null)
  }
  assert.deepEqual(api.mapProjectsFromLocation('Plot 6/7'), ['AV-P6'])
  assert.deepEqual(api.mapProjectsFromLocation('P6/P7'), [])
  assert.deepEqual(api.mapProjectsFromLocation('Plot 3/6'), ['AV-P3', 'AV-P6'])
  assert.deepEqual(api.mapProjectsFromLocation('Plot 6 / Plot 3'), ['AV-P6', 'AV-P3'])
  assert.deepEqual(api.mapProjectsFromLocation('Plot 6 + Plot 7'), ['AV-P6', 'AV-P7'])
  assert.deepEqual(api.mapProjectsFromLocation('Above Condo A / Above Condo B'), ['CONDO-A', 'CONDO-B'])

  // "Dry run" must not read body or call write-capable Materials/Schedule RPCs.
  for (const kind of ['materials', 'schedule']) {
    for (const flag of ['true', '1', 'yes']) {
      const result = await api.POST(request('kind=' + kind + '&project=AV-P3&dryRun=' + flag))
      assert.equal(result.status, 400, kind + '/' + flag)
      assert.equal(result.data.error, 'dry_run_not_supported')
      assert.equal(result.data.writes_performed, false)
    }
  }
  assert.equal(state.bodyReads, 0)
  assert.equal(state.rpcCalls.length, 0)

  for (const filename of [
    'REFERENCE_ONLY_PR_Plot3_Master_From_Plot2_2026-10-07.xlsx',
    'PR_Plot3_Working_2026-10-07.xlsx'
  ]) {
    const result = await api.POST(request('kind=materials&sourceFile=' + encodeURIComponent(filename)))
    assert.equal(result.status, 422, filename)
    assert.equal(result.data.error, 'reference_or_working_pr_not_materials_master')
  }
  assert.equal(state.bodyReads, 0)
  assert.equal(state.rpcCalls.length, 0)

  state.sheets = {
    '01 รายการทั้งหมด': [
      ['สถานที่/หลัง', 'รายการวัสดุ/งาน'],
      ['Plot 3 / Plot 6', 'Synthetic shared material']
    ]
  }
  const ambiguous = await api.POST(request('kind=materials'))
  assert.equal(ambiguous.status, 500)
  assert.match(ambiguous.data.error, /Ambiguous shared Plot 3 material/)
  assert.equal(state.rpcCalls.length, 0, 'shared Plot 3 master row must not reach database')

  // Existing single-site P6 Materials + Purchasing + Tools import stays available.
  state.sheets = {
    '01 รายการทั้งหมด': [
      ['สถานที่/หลัง', 'รายการวัสดุ/งาน'],
      ['Plot 6', 'Synthetic P6 material']
    ],
    '04 Purchasing ค้างส่ง': [
      ['ผู้ขาย/ผู้รับเหมา', 'รายการ', 'หน้างาน'],
      ['Synthetic vendor', 'Synthetic PO candidate', 'Plot 6']
    ],
    '06-Tools & Machine': [
      ['รหัสรายการ', 'รายการเครื่องมือ/เครื่องจักร'],
      ['T-SYN', 'Synthetic tool']
    ]
  }
  const material = await api.POST(request('kind=materials'))
  assert.equal(material.status, 200, 'legacy single-site materials parser')
  assert.equal(state.rpcCalls.length, 1)
  assert.equal(state.rpcCalls[0].name, 'drive_sync_replace_materials_tools')
  assert.equal(state.rpcCalls[0].args.p_materials[0].project_code, 'AV-P6')

  const scheduleHeader = [
    'ID', 'หมวดหลัก', 'Task Name ตาม Schedule', 'พื้นที่/ชั้น',
    '% หน้างานล่าสุด', 'สถานะหน้างาน', 'ปัญหา/อุปสรรค',
    'งานถัดไป/แนวทางแก้', 'วันที่อัปเดต'
  ]
  state.sheets = {
    'ติดตามความคืบหน้าP3': [
      scheduleHeader,
      ['1', 'Structure', 'Synthetic schedule task', 'F1', 0, 'Not started', '', '', '08/10/2026']
    ]
  }
  const schedule = await api.POST(request('kind=schedule&project=AV-P3'))
  assert.equal(schedule.status, 200)
  assert.equal(state.rpcCalls.length, 2)
  assert.equal(state.rpcCalls[1].name, 'drive_sync_apply_schedule')
  assert.equal(state.rpcCalls[1].args.p_project_code, 'AV-P3')
  assert.equal(state.rpcCalls[1].args.p_rows.length, 1)

  // UI: loading/read errors must never be mistaken for a zero-progress schedule.
  assert.match(projectPage, /const\[loading,setLoading\]=useState\(true\)/)
  assert.match(projectPage, /const\[loadError,setLoadError\]=useState\(false\)/)
  assert.match(projectPage, /const\[reportsError,setReportsError\]=useState\(false\)/)
  assert.match(projectPage, /Schedule Plot 3 — ยังไม่มีข้อมูลซิงก์/)
  assert.match(projectPage, /loadError&&<p role="alert"/)
  assert.doesNotMatch(projectPage, /Master Schedule Rev\.1 ลงวันที่/)
  console.log('PASS Plot 3 full-token parsing, fail-closed dry-run/PR source, no-RPC shared material, P6 import compatibility, P3 schedule and UI read states')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
