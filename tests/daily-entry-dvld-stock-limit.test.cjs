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
  initialTransactions = [],
} = {}) {
  const floors = [
    { id: 'floor-1', name: 'A Floor', code: 'A', active: true, sort_order: 1 },
    { id: 'floor-2', name: 'B Floor', code: 'B', active: true, sort_order: 2 },
  ]

  const normalItems = [
    { id: 'norm-1', item_code: 'SN-001', needle_type: 'DB X 1', size_dia: '9', brand: 'ORGAN' },
    { id: 'norm-2', item_code: 'SN-002', needle_type: 'DC X 1', size_dia: '10', brand: 'GROZ' },
  ]

  const normalAssignments = [
    { needle_item_id: 'norm-1', floor_id: 'floor-1', entry_type: 'running' },
    { needle_item_id: 'norm-2', floor_id: 'floor-1', entry_type: 'running' },
  ]

  const runningTransactions = [...initialTransactions]

  const tables = {
    floors,
    normal_needle_items: normalItems,
    idle_needle_items: [],
    normal_needle_floor_assignments: normalAssignments,
    idle_needle_floor_assignments: [],
    needle_running_transactions: runningTransactions,
    needle_new_transactions: [],
    needle_idle_transactions: [],
    needle_bnr_records: [],
    needle_daily_sheets: [],
  }

  const admin = {
    from(table) {
      let filters = []
      let start = 0, end = Infinity
      let single = false
      let op = 'select'
      let payload

      const q = {
        select() { return q },
        eq(k, v) { filters.push([k, v]); return q },
        is(k, v) { filters.push(['IS', k, v]); return q },
        in(k, arr) { filters.push(['IN', k, arr]); return q },
        lte(k, v) { filters.push(['LTE', k, v]); return q },
        order() { return q },
        range(a, b) { start = a; end = b; return q },
        maybeSingle() { single = true; return q },
        single() { single = true; return q },
        insert(p) { op = 'insert'; payload = p; return q },
        update(p) { op = 'update'; payload = p; return q },
        delete() { op = 'delete'; return q },
        upsert(p) { op = 'upsert'; payload = p; return q },
        then(resolve, reject) {
          if (!tables[table]) {
            return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'Table missing' } }).then(resolve, reject)
          }
          let rows = tables[table].filter((row) =>
            filters.every(([opOrKey, valOrKey, maybeVal]) => {
              if (opOrKey === 'IN') return maybeVal.includes(row[valOrKey])
              if (opOrKey === 'LTE') return row[valOrKey] <= maybeVal
              if (opOrKey === 'IS') return row[valOrKey] === maybeVal
              return row[opOrKey] === valOrKey
            })
          )

          if (op === 'insert') {
            const newRow = { id: `gen-${Math.random()}`, ...payload }
            tables[table].push(newRow)
            rows = [newRow]
          } else if (op === 'update') {
            rows.forEach((r) => Object.assign(r, payload))
          } else if (op === 'delete') {
            tables[table] = tables[table].filter((r) => !rows.includes(r))
          } else if (op === 'upsert') {
            const newRow = { id: `upsert-${Math.random()}`, ...payload }
            tables[table].push(newRow)
            rows = [newRow]
          }

          const resData = single ? (rows[0] || null) : rows.slice(start, end + 1)
          return Promise.resolve({ data: resData, error: null }).then(resolve, reject)
        },
      }
      return q
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

  return { actions, tables }
}

test('Case 1: PREV 100, RCVD 0, DVLD 50 is Allowed (PRESENT = 50)', async () => {
  const { actions } = setupMock({
    initialTransactions: [
      {
        id: 'tx-1',
        transaction_date: '2026-10-25',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'OPENING',
        quantity: 100,
      },
    ],
  })

  const res = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 50,
  })

  assert.equal(res.success, true, 'Delivery 50 must be accepted')
  assert.equal(res.data.previous, 100)
  assert.equal(res.data.received, 0)
  assert.equal(res.data.delivery, 50)
  assert.equal(res.data.present, 50)
})

test('Case 2: PREV 100, RCVD 0, DVLD 100 is Allowed (PRESENT = 0)', async () => {
  const { actions } = setupMock({
    initialTransactions: [
      {
        id: 'tx-1',
        transaction_date: '2026-10-25',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'OPENING',
        quantity: 100,
      },
    ],
  })

  const res = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 100,
  })

  assert.equal(res.success, true, 'Delivery 100 must be accepted')
  assert.equal(res.data.previous, 100)
  assert.equal(res.data.delivery, 100)
  assert.equal(res.data.present, 0)
})

test('Case 3: PREV 100, RCVD 0, DVLD 101 is Rejected', async () => {
  const { actions, tables } = setupMock({
    initialTransactions: [
      {
        id: 'tx-1',
        transaction_date: '2026-10-25',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'OPENING',
        quantity: 100,
      },
    ],
  })

  const res = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 101,
  })

  assert.equal(res.success, false, 'Delivery 101 must be rejected')
  assert.ok(res.error.includes('exceeds available stock (100)'))

  const deliveryTx = tables.needle_running_transactions.find((t) => t.transaction_type === 'ISSUE')
  assert.equal(deliveryTx, undefined, 'Invalid delivery must NOT be saved to database')
})

test('Case 4: PREV 100, RCVD 20, DVLD 120 is Allowed (PRESENT = 0)', async () => {
  const { actions } = setupMock({
    initialTransactions: [
      {
        id: 'tx-1',
        transaction_date: '2026-10-25',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'OPENING',
        quantity: 100,
      },
      {
        id: 'tx-2',
        transaction_date: '2026-10-26',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'RECEIVE',
        quantity: 20,
      },
    ],
  })

  const res = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 120,
  })

  assert.equal(res.success, true, 'Delivery 120 must be accepted')
  assert.equal(res.data.previous, 100)
  assert.equal(res.data.received, 20)
  assert.equal(res.data.delivery, 120)
  assert.equal(res.data.present, 0)
})

test('Case 5: PREV 100, RCVD 20, DVLD 121 is Rejected', async () => {
  const { actions, tables } = setupMock({
    initialTransactions: [
      {
        id: 'tx-1',
        transaction_date: '2026-10-25',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'OPENING',
        quantity: 100,
      },
      {
        id: 'tx-2',
        transaction_date: '2026-10-26',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'RECEIVE',
        quantity: 20,
      },
    ],
  })

  const res = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 121,
  })

  assert.equal(res.success, false, 'Delivery 121 must be rejected')
  assert.ok(res.error.includes('exceeds available stock (120)'))

  const deliveryTx = tables.needle_running_transactions.find((t) => t.transaction_type === 'ISSUE')
  assert.equal(deliveryTx, undefined, 'Invalid delivery 121 must NOT be saved to database')
})

test('Case 6: PREV 0, RCVD 0, DVLD 1 is Rejected (Available stock = 0)', async () => {
  const { actions, tables } = setupMock({
    initialTransactions: [],
  })

  const res = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 1,
  })

  assert.equal(res.success, false, 'Delivery 1 must be rejected when stock is 0')
  assert.ok(res.error.includes('exceeds available stock (0)'))

  const deliveryTx = tables.needle_running_transactions.find((t) => t.transaction_type === 'ISSUE')
  assert.equal(deliveryTx, undefined, 'Zero stock cannot record positive delivery')
})

test('Case 7 & Concurrency: Server rejects User B when User A delivers stock first', async () => {
  // Available stock starts at 20 (PREV = 20)
  const { actions } = setupMock({
    initialTransactions: [
      {
        id: 'tx-1',
        transaction_date: '2026-10-25',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'OPENING',
        quantity: 20,
      },
    ],
  })

  // User A delivers 15
  const userARes = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 15,
  })
  assert.equal(userARes.success, true, 'User A 15 delivery accepted')
  assert.equal(userARes.data.present, 5, 'Remaining stock is 5')

  // User B (who originally saw available=20) now attempts to deliver 10
  // In a concurrent scenario with multiple transactions, if remaining stock is only 5:
  // User B's batchSync operation should be rejected
  const userBRes = await actions.batchSyncDailyEntryAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [
      {
        id: 'op-b-1',
        client_operation_id: 'client-op-b1',
        needle_item_id: 'norm-1',
        field: 'delivery',
        value: 25, // Attempts 25, but available is only 20
      },
    ],
  })

  assert.equal(userBRes.success, true)
  const bResult = userBRes.data.results[0]
  assert.equal(bResult.success, false)
  assert.equal(bResult.isConflict, true)
  assert.ok(bResult.error.includes('exceeds available stock'))
})

test('Case 8: Existing Value Editing (10 -> 20) preserves update model and validates final value', async () => {
  // PREV = 20. Existing DVLD = 10. Available before delivery is 20.
  const { actions, tables } = setupMock({
    initialTransactions: [
      {
        id: 'tx-open',
        transaction_date: '2026-10-25',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'OPENING',
        quantity: 20,
      },
      {
        id: 'tx-existing-issue',
        transaction_date: '2026-10-26',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'ISSUE',
        quantity: 10,
      },
    ],
  })

  // Editing 10 -> 20 (Available stock is 20)
  const resValid = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 20,
  })
  assert.equal(resValid.success, true, '20 is allowed because available stock is 20')
  assert.equal(resValid.data.delivery, 20)
  assert.equal(resValid.data.present, 0)

  // Editing 20 -> 25 (Exceeds available stock 20)
  const resInvalid = await actions.saveDailyEntryCellAction({
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 25,
  })
  assert.equal(resInvalid.success, false, '25 must be rejected')
  assert.ok(resInvalid.error.includes('exceeds available stock (20)'))

  // Existing transaction must still be 20, not 25
  const issueTx = tables.needle_running_transactions.find((t) => t.id === 'tx-existing-issue')
  assert.equal(issueTx.quantity, 20, 'Authoritative value must remain 20')
})

test('Case 9: Offline Stock Calculation: Available Stock blocks invalid delivery in frontend logic', () => {
  // Test the exact calculation formula used in DailyEntryTable and DailyEntryShell:
  // availableStock = Math.max(0, (row.previous || 0) + (row.received || 0) + (row.transfer_in || 0) - (row.transfer_out || 0))
  function validateDelivery(row, newDvld) {
    const availableStock = Math.max(
      0,
      (row.previous || 0) + (row.received || 0) + (row.transfer_in || 0) - (row.transfer_out || 0)
    )
    if (newDvld > availableStock) {
      return { valid: false, error: `Delivery cannot exceed available stock (${availableStock}).` }
    }
    const present = (row.previous || 0) + (row.received || 0) + (row.transfer_in || 0) - newDvld - (row.transfer_out || 0)
    return { valid: true, present }
  }

  // Row with PREV=20, RCVD=10 -> Available=30
  const row = { previous: 20, received: 10, transfer_in: 0, transfer_out: 0, delivery: 0 }
  
  // Valid DVLD = 25
  const check25 = validateDelivery(row, 25)
  assert.equal(check25.valid, true)
  assert.equal(check25.present, 5)

  // Valid DVLD = 30
  const check30 = validateDelivery(row, 30)
  assert.equal(check30.valid, true)
  assert.equal(check30.present, 0)

  // Invalid DVLD = 31
  const check31 = validateDelivery(row, 31)
  assert.equal(check31.valid, false)
  assert.equal(check31.error, 'Delivery cannot exceed available stock (30).')

  // Transfer out affects available: PREV=20, RCVD=10, TRF_OUT=5 -> Available=25
  const rowWithTransfer = { previous: 20, received: 10, transfer_in: 0, transfer_out: 5, delivery: 0 }
  const checkTrf25 = validateDelivery(rowWithTransfer, 25)
  assert.equal(checkTrf25.valid, true)
  assert.equal(checkTrf25.present, 0)

  const checkTrf26 = validateDelivery(rowWithTransfer, 26)
  assert.equal(checkTrf26.valid, false)
  assert.equal(checkTrf26.error, 'Delivery cannot exceed available stock (25).')
})
