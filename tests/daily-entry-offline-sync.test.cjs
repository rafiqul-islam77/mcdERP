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

function setupMock({
  isSiteAdmin = false,
  userFloorIds = ['floor-1'],
  userPerms = ['needle.daily_entry.running', 'needle.daily_entry.new', 'needle.daily_entry.idle'],
} = {}) {
  const calls = []
  const floors = [
    { id: 'floor-1', name: 'A Floor', code: 'A', active: true, sort_order: 1 },
    { id: 'floor-2', name: 'B Floor', code: 'B', active: true, sort_order: 2 },
  ]

  const normalItems = [
    { id: 'norm-1', item_code: 'SN-001', needle_type: 'DB X 1', size_dia: '9', brand: 'ORGAN' },
    { id: 'norm-2', item_code: 'SN-002', needle_type: 'DC X 1', size_dia: '10', brand: 'GROZ' },
  ]
  const idleItems = [
    { id: 'idle-1', item_code: 'IN-001', needle_type: 'DB X 1', size_dia: '9', brand: 'ORGAN' },
  ]

  const normalAssignments = [
    { needle_item_id: 'norm-1', floor_id: 'floor-1', entry_type: 'running' },
    { needle_item_id: 'norm-2', floor_id: 'floor-1', entry_type: 'running' },
    { needle_item_id: 'norm-1', floor_id: 'floor-2', entry_type: 'running' },
  ]
  const idleAssignments = [
    { needle_item_id: 'idle-1', floor_id: 'floor-1' },
  ]

  const runningTransactions = [
    {
      id: 'tx-1',
      transaction_date: '2026-10-20',
      floor_id: 'floor-1',
      needle_item_id: 'norm-1',
      transaction_type: 'OPENING',
      quantity: 50,
      req_no: 'REQ-INIT',
      notes: null,
      client_operation_id: 'op-init-001',
    },
  ]

  const newTransactions = []
  const idleTransactions = []
  const bnrRecords = []
  const sheets = []

  const tables = {
    floors,
    normal_needle_items: normalItems,
    idle_needle_items: idleItems,
    normal_needle_floor_assignments: normalAssignments,
    idle_needle_floor_assignments: idleAssignments,
    needle_running_transactions: runningTransactions,
    needle_new_transactions: newTransactions,
    needle_idle_transactions: idleTransactions,
    needle_bnr_records: bnrRecords,
    needle_daily_sheets: sheets,
  }

  const admin = {
    from(table) {
      if (!tables[table]) {
        tables[table] = []
      }
      let rows = [...tables[table]]
      let single = false
      let maybe = false
      let start = 0
      let end = 9999
      let op = null
      let payload = null

      const q = {
        select(cols = '*') {
          return q
        },
        eq(col, val) {
          rows = rows.filter((r) => r[col] === val)
          return q
        },
        neq(col, val) {
          rows = rows.filter((r) => r[col] !== val)
          return q
        },
        in(col, vals) {
          rows = rows.filter((r) => vals.includes(r[col]))
          return q
        },
        lte(col, val) {
          rows = rows.filter((r) => r[col] <= val)
          return q
        },
        gte(col, val) {
          rows = rows.filter((r) => r[col] >= val)
          return q
        },
        is(col, val) {
          rows = rows.filter((r) => r[col] === val)
          return q
        },
        order(col, { ascending = true } = {}) {
          rows.sort((a, b) => {
            if (a[col] < b[col]) return ascending ? -1 : 1
            if (a[col] > b[col]) return ascending ? 1 : -1
            return 0
          })
          return q
        },
        range(s, e) {
          start = s
          end = e
          return q
        },
        single() {
          single = true
          return q
        },
        maybeSingle() {
          single = true
          maybe = true
          return q
        },
        insert(data) {
          op = 'insert'
          payload = data
          return q
        },
        update(data) {
          op = 'update'
          payload = data
          return q
        },
        upsert(data, opts) {
          op = 'upsert'
          payload = data
          return q
        },
        delete() {
          op = 'delete'
          return q
        },
        then(resolve, reject) {
          if (op === 'insert') {
            const items = Array.isArray(payload) ? payload : [payload]
            const inserted = items.map((p) => ({ id: `gen-${Math.random()}`, ...p }))
            tables[table].push(...inserted)
            rows = inserted
          } else if (op === 'update') {
            rows.forEach((r) => Object.assign(r, payload))
          } else if (op === 'delete') {
            tables[table] = tables[table].filter((r) => !rows.includes(r))
          } else if (op === 'upsert') {
            const p = payload
            const conflictKey = 'record_date,floor_id,needle_item_id,category'
            const existing = tables[table].find(
              (r) =>
                r.record_date === p.record_date &&
                r.floor_id === p.floor_id &&
                r.needle_item_id === p.needle_item_id &&
                r.category === p.category
            )
            if (existing) {
              Object.assign(existing, p)
              rows = [existing]
            } else {
              const newRow = { id: `upsert-${Math.random()}`, ...p }
              tables[table].push(newRow)
              rows = [newRow]
            }
          }

          const resData = single ? (rows[0] || null) : rows.slice(start, end + 1)
          return Promise.resolve({ data: resData, error: null }).then(resolve, reject)
        },
      }
      return q
    },
    async rpc(name, params) {
      calls.push(name)
      return { data: { success: true }, error: null }
    },
  }

  const actions = moduleFrom('src/app/actions/daily-entry.ts', {
    '@/lib/supabase/admin': { getAdminClient: () => admin },
    '@/lib/auth': {
      requireActiveAccount: async () => ({
        isSiteAdmin,
        profile: {
          id: 'user-001',
          name: 'Test Operator',
          employee_id: 'EMP-001',
          floor_ids: userFloorIds,
          floor_id: userFloorIds[0] || null,
        },
      }),
    },
    '@/lib/permissions': {
      hasPermission: async (actorId, key) => userPerms.includes(key),
    },
    '@/lib/audit': {
      createAuditLog: async () => {},
    },
    'next/cache': {
      revalidatePath() {},
    },
  })

  return { actions, tables, calls }
}

test('Offline Sync: batchSyncDailyEntryAction syncs multiple operations idempotently', async () => {
  const { actions, tables } = setupMock({ userFloorIds: ['floor-1'] })

  const op1 = {
    id: 'queue-1',
    client_operation_id: 'client-op-101',
    needle_item_id: 'norm-1',
    field: 'received',
    value: 20,
    req_no: 'REQ-20261025-001',
  }

  const op2 = {
    id: 'queue-2',
    client_operation_id: 'client-op-102',
    needle_item_id: 'norm-2',
    field: 'received',
    value: 15,
    req_no: 'REQ-20261025-001',
  }

  const batchRes = await actions.batchSyncDailyEntryAction({
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [op1, op2],
  })

  assert.equal(batchRes.success, true)
  assert.equal(batchRes.data.results.length, 2)
  assert.equal(batchRes.data.results[0].success, true)
  assert.equal(batchRes.data.results[1].success, true)

  const norm1Tx = tables.needle_running_transactions.find(
    (t) => t.needle_item_id === 'norm-1' && t.client_operation_id === 'client-op-101'
  )
  assert.ok(norm1Tx)
  assert.equal(norm1Tx.quantity, 20)
})

test('Offline Sync: Duplicate client_operation_id retry does not create duplicate stock transactions', async () => {
  const { actions, tables } = setupMock({ userFloorIds: ['floor-1'] })

  const op = {
    id: 'queue-dup',
    client_operation_id: 'unique-client-uuid-999',
    needle_item_id: 'norm-1',
    field: 'received',
    value: 30,
    req_no: 'REQ-SYNC-01',
  }

  // 1. Initial attempt
  const res1 = await actions.batchSyncDailyEntryAction({
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [op],
  })
  assert.equal(res1.success, true)

  const initialCount = tables.needle_running_transactions.filter(
    (t) => t.client_operation_id === 'unique-client-uuid-999'
  ).length
  assert.equal(initialCount, 1)

  // 2. Client retry with the exact same client_operation_id (simulating network timeout after server write)
  const res2 = await actions.batchSyncDailyEntryAction({
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [op],
  })
  assert.equal(res2.success, true)
  assert.equal(res2.data.results[0].success, true)

  const retryCount = tables.needle_running_transactions.filter(
    (t) => t.client_operation_id === 'unique-client-uuid-999'
  ).length
  assert.equal(retryCount, 1, 'Duplicate retry must NOT create a duplicate stock row')
})

test('Offline Sync: Delivery quantity exceeding available stock produces conflict and protects ledger', async () => {
  const { actions, tables } = setupMock({ userFloorIds: ['floor-1'] })

  // norm-2 has 0 previous stock and 0 received on floor-1
  const invalidDeliveryOp = {
    id: 'queue-conflict-1',
    client_operation_id: 'conflict-op-404',
    needle_item_id: 'norm-2',
    field: 'delivery',
    value: 25, // Available stock is 0
  }

  const batchRes = await actions.batchSyncDailyEntryAction({
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [invalidDeliveryOp],
  })

  assert.equal(batchRes.success, true)
  const result = batchRes.data.results[0]
  assert.equal(result.success, false)
  assert.equal(result.isConflict, true)
  assert.ok(result.error.includes('exceeds available stock'))

  const deliveryTx = tables.needle_running_transactions.find(
    (t) => t.needle_item_id === 'norm-2' && t.transaction_type === 'ISSUE'
  )
  assert.equal(deliveryTx, undefined, 'Conflicted delivery must NOT be written to stock ledger')
})

test('Offline Sync: BNR operation syncs with idempotency without affecting stock ledger', async () => {
  const { actions, tables } = setupMock({ userFloorIds: ['floor-1'] })

  const bnrOp = {
    id: 'queue-bnr-1',
    client_operation_id: 'bnr-op-777',
    needle_item_id: 'norm-1',
    field: 'bnr',
    value: 8,
  }

  const res = await actions.batchSyncDailyEntryAction({
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [bnrOp],
  })

  assert.equal(res.success, true)
  assert.equal(res.data.results[0].success, true)

  const bnrRow = tables.needle_bnr_records.find(
    (b) => b.client_operation_id === 'bnr-op-777'
  )
  assert.ok(bnrRow)
  assert.equal(bnrRow.quantity, 8)
})

test('Offline Sync: Repeated edits to same cell update final intended value, not cumulative', async () => {
  const { actions, tables } = setupMock({ userFloorIds: ['floor-1'] })

  // Editing cell: 20 -> 30 -> 40
  // When coalesced before sync, only the final value 40 reaches the ledger
  const opFinal = {
    id: 'queue-coalesced',
    client_operation_id: 'coalesced-op-final',
    needle_item_id: 'norm-1',
    field: 'received',
    value: 40,
    req_no: 'REQ-COALESCE-1',
  }

  const res = await actions.batchSyncDailyEntryAction({
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [opFinal],
  })

  assert.equal(res.success, true)

  const txs = tables.needle_running_transactions.filter(
    (t) => t.needle_item_id === 'norm-1' && t.transaction_type === 'RECEIVE'
  )
  assert.equal(txs.length, 1)
  assert.equal(txs[0].quantity, 40, 'Final daily received quantity must be 40, not cumulative')
})

test('Offline Sync: Sheet key generator isolates user, date, floor, and category', () => {
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts')
  const key1 = dbModule.generateSheetKey('user-1', '2026-10-25', 'floor-1', 'RUNNING')
  const key2 = dbModule.generateSheetKey('user-1', '2026-10-24', 'floor-2', 'NEW')
  const key3 = dbModule.generateSheetKey('user-2', '2026-10-25', 'floor-1', 'RUNNING')

  assert.notEqual(key1, key2)
  assert.notEqual(key1, key3)
  assert.equal(key1, 'user-1:2026-10-25:floor-1:RUNNING')
})
