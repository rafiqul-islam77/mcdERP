const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function moduleFrom(file, deps = {}) {
  const exports = {}
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      console: { warn() {}, error() {}, log() {} },
      require: (name) => deps[name] || require(name),
    }
  )
  return exports
}

function setupTestEnvironment({ userPerms = [], isSiteAdmin = false } = {}) {
  const floors = [
    { id: 'floor-1', name: 'Floor A', code: 'A', active: true, sort_order: 1 },
    { id: 'floor-2', name: 'Floor B', code: 'B', active: true, sort_order: 2 },
  ]

  const mockAdmin = {
    from(table) {
      const q = {
        select() { return q },
        eq() { return q },
        order() { return q },
        then(resolve) {
          if (table === 'floors') return Promise.resolve({ data: floors, error: null }).then(resolve)
          return Promise.resolve({ data: [], error: null }).then(resolve)
        },
      }
      return q
    },
  }

  const dailyEntryActions = moduleFrom('src/app/actions/daily-entry.ts', {
    '@/lib/supabase/admin': { getAdminClient: () => mockAdmin },
    '@/lib/auth': {
      requireActiveAccount: async () => ({
        id: 'user-1',
        profile: { id: 'prof-1', floor_id: 'floor-1' },
        isSiteAdmin,
      }),
    },
    '@/lib/permissions': {
      hasPermission: async (actorId, key) => userPerms.includes(key),
    },
    '@/lib/audit': { createAuditLog: async () => {} },
    'next/cache': { revalidatePath() {} },
  })

  const reportActions = moduleFrom('src/app/actions/reports.ts', {
    '@/lib/auth': {
      requireActiveAccount: async () => ({
        id: 'user-1',
        profile: { id: 'prof-1', floor_id: 'floor-1' },
        isSiteAdmin,
      }),
    },
    '@/lib/permissions': {
      hasPermission: async (actorId, key) => userPerms.includes(key),
    },
    '@/app/actions/daily-entry': {
      getAuthorizedContextAction: dailyEntryActions.getAuthorizedContextAction,
    },
    '@/lib/reports/daily-report-service': {
      getDailyReportData: async () => ({ success: true, data: {} }),
      getBatchDailyReportData: async () => ({ success: true, data: [] }),
    },
    '@/lib/reports/excel-present-balance': { generatePresentBalanceWorkbook: async () => Buffer.from('') },
    '@/lib/reports/excel-stock-report': { generateDailyStockReportWorkbook: async () => Buffer.from('') },
  })

  return { dailyEntryActions, reportActions }
}

test('Daily Entry: User with RUNNING and IDLE only CANNOT see NEW in allowedCategories', async () => {
  const { dailyEntryActions } = setupTestEnvironment({
    userPerms: ['needle.daily_entry.view', 'idle.daily_entry.view'],
  })

  const res = await dailyEntryActions.getAuthorizedContextAction()
  assert.equal(res.success, true)
  assert.deepEqual(Array.from(res.data.allowedCategories), ['RUNNING', 'IDLE'])
  assert.equal(res.data.allowedCategories.includes('NEW'), false)
})

test('Daily Entry: User without broken.daily_entry.view is REJECTED when requesting NEW sheet', async () => {
  const { dailyEntryActions } = setupTestEnvironment({
    userPerms: ['needle.daily_entry.view', 'idle.daily_entry.view'],
  })

  const res = await dailyEntryActions.getDailyEntrySheetAction({
    date: '2026-11-02',
    floorId: 'floor-1',
    category: 'NEW',
  })
  assert.equal(res.success, false)
  assert.ok(res.error.toLowerCase().includes('unauthorized'))
})

test('Daily Entry: User with NEW permission enabled CAN access NEW category', async () => {
  const { dailyEntryActions } = setupTestEnvironment({
    userPerms: ['needle.daily_entry.view', 'broken.daily_entry.view', 'idle.daily_entry.view'],
  })

  const res = await dailyEntryActions.getAuthorizedContextAction()
  assert.equal(res.success, true)
  assert.deepEqual(Array.from(res.data.allowedCategories), ['RUNNING', 'NEW', 'IDLE'])
})

test('Daily Entry: Site Admin accesses all categories regardless of specific keys', async () => {
  const { dailyEntryActions } = setupTestEnvironment({
    userPerms: [],
    isSiteAdmin: true,
  })

  const res = await dailyEntryActions.getAuthorizedContextAction()
  assert.equal(res.success, true)
  assert.deepEqual(Array.from(res.data.allowedCategories), ['RUNNING', 'NEW', 'IDLE'])
})

test('Daily Report: User with RUNNING and IDLE report permission only CANNOT see NEW in report categories', async () => {
  const { reportActions } = setupTestEnvironment({
    userPerms: [
      'needle.daily_entry.view',
      'idle.daily_entry.view',
      'needle.daily_report.view',
      'idle.daily_report.view',
      'daily_report.view', // Legacy general permission MUST NOT grant NEW access
    ],
  })

  const allowed = await reportActions.getAuthorizedDailyReportCategories('prof-1', false)
  assert.deepEqual(Array.from(allowed), ['RUNNING', 'IDLE'])
  assert.equal(allowed.includes('NEW'), false)

  const contextRes = await reportActions.getAuthorizedDailyReportContextAction()
  assert.equal(contextRes.success, true)
  assert.deepEqual(Array.from(contextRes.data.allowedCategories), ['RUNNING', 'IDLE'])
})

test('Daily Report: User without broken.daily_report.view is REJECTED when querying NEW report', async () => {
  const { reportActions } = setupTestEnvironment({
    userPerms: [
      'needle.daily_report.view',
      'idle.daily_report.view',
      'daily_report.view', // Legacy bypass must not allow NEW
    ],
  })

  const singleRes = await reportActions.getDailyReportAction({
    date: '2026-11-02',
    floorId: 'floor-1',
    category: 'NEW',
  })
  assert.equal(singleRes.success, false)
  assert.ok(singleRes.error.toLowerCase().includes('unauthorized'))

  const allFloorsRes = await reportActions.getAllFloorsDailyReportAction({
    date: '2026-11-02',
    category: 'NEW',
  })
  assert.equal(allFloorsRes.success, false)
  assert.ok(allFloorsRes.error.toLowerCase().includes('unauthorized'))
})

test('Daily Report: User with broken.daily_report.view CAN view NEW report', async () => {
  const { reportActions } = setupTestEnvironment({
    userPerms: ['broken.daily_report.view'],
  })

  const allowed = await reportActions.getAuthorizedDailyReportCategories('prof-1', false)
  assert.deepEqual(Array.from(allowed), ['NEW'])

  const singleRes = await reportActions.getDailyReportAction({
    date: '2026-11-02',
    floorId: 'floor-1',
    category: 'NEW',
  })
  assert.equal(singleRes.success, true)
})

test('Daily Report: Category permissions are individually toggleable (RUNNING OFF, NEW OFF, IDLE OFF)', async () => {
  // RUNNING OFF
  const env1 = setupTestEnvironment({ userPerms: ['broken.daily_report.view', 'idle.daily_report.view'] })
  assert.deepEqual(Array.from(await env1.reportActions.getAuthorizedDailyReportCategories('prof-1', false)), ['NEW', 'IDLE'])

  // NEW OFF
  const env2 = setupTestEnvironment({ userPerms: ['needle.daily_report.view', 'idle.daily_report.view'] })
  assert.deepEqual(Array.from(await env2.reportActions.getAuthorizedDailyReportCategories('prof-1', false)), ['RUNNING', 'IDLE'])

  // IDLE OFF
  const env3 = setupTestEnvironment({ userPerms: ['needle.daily_report.view', 'broken.daily_report.view'] })
  assert.deepEqual(Array.from(await env3.reportActions.getAuthorizedDailyReportCategories('prof-1', false)), ['RUNNING', 'NEW'])
})
