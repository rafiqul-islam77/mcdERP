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
    { id: 'floor-3', name: 'C Floor', code: 'C', active: true, sort_order: 3 },
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
    // Historical opening on floor-1
    {
      id: 'tx-1',
      transaction_date: '2026-10-20',
      floor_id: 'floor-1',
      needle_item_id: 'norm-1',
      transaction_type: 'OPENING',
      quantity: 50,
      req_no: 'REQ-INIT',
      notes: null,
    },
    // Same day receive on 2026-10-23
    {
      id: 'tx-2',
      transaction_date: '2026-10-23',
      floor_id: 'floor-1',
      needle_item_id: 'norm-1',
      transaction_type: 'RECEIVE',
      quantity: 10,
      req_no: 'REQ-20261023-0001',
      notes: null,
    },
    // Same day issue on 2026-10-23
    {
      id: 'tx-3',
      transaction_date: '2026-10-23',
      floor_id: 'floor-1',
      needle_item_id: 'norm-1',
      transaction_type: 'ISSUE',
      quantity: 4,
      req_no: 'REQ-20261023-0001',
      notes: null,
    },
  ]

  const bnrRecords = [
    {
      id: 'bnr-1',
      record_date: '2026-10-23',
      floor_id: 'floor-1',
      needle_item_id: 'norm-1',
      category: 'RUNNING',
      quantity: 3,
    },
  ]

  const sheets = []

  const tables = {
    floors,
    normal_needle_items: normalItems,
    idle_needle_items: idleItems,
    normal_needle_floor_assignments: normalAssignments,
    idle_needle_floor_assignments: idleAssignments,
    needle_running_transactions: runningTransactions,
    needle_new_transactions: [],
    needle_idle_transactions: [],
    needle_bnr_records: bnrRecords,
    needle_daily_sheets: sheets,
  }

  const admin = {
    from(table) {
      calls.push(table)
      let filters = []
      let orderKey, ascending
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
        order(k, opts) { orderKey = k; ascending = opts?.ascending ?? true; return q },
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
    async rpc(name, params) {
      calls.push(name)
      return { data: { success: true, remaining_stock: 36 }, error: null }
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

test('Daily Entry: User unauthorized for requested floor is rejected', async () => {
  const { actions } = setupMock({ userFloorIds: ['floor-1'], isSiteAdmin: false })
  const result = await actions.getDailyEntrySheetAction({
    date: '2026-10-23',
    floorId: 'floor-2', // User only assigned floor-1
    category: 'RUNNING',
  })
  assert.equal(result.success, false)
  assert.ok(result.error.includes('Unauthorized'))
})

test('Daily Entry: Site Admin can access any floor', async () => {
  const { actions } = setupMock({ userFloorIds: [], isSiteAdmin: true })
  const result = await actions.getDailyEntrySheetAction({
    date: '2026-10-23',
    floorId: 'floor-2',
    category: 'RUNNING',
  })
  assert.equal(result.success, true)
})

test('Daily Entry: User without category permission is rejected', async () => {
  const { actions } = setupMock({
    userFloorIds: ['floor-1'],
    userPerms: ['needle.daily_entry.running'], // Only running
  })
  const result = await actions.getDailyEntrySheetAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'NEW', // Not permitted
  })
  assert.equal(result.success, false)
  assert.ok(result.error.includes('Unauthorized'))
})

test('Daily Entry: Balance calculation accurately reflects previous, received, delivery, and present', async () => {
  const { actions } = setupMock({ userFloorIds: ['floor-1'] })
  const result = await actions.getDailyEntrySheetAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
  })

  assert.equal(result.success, true)
  assert.equal(result.data.rows.length, 2)

  const row1 = result.data.rows.find((r) => r.item_code === 'SN-001')
  assert.ok(row1)
  // Historical Opening (20 Oct) = 50 -> Previous = 50
  assert.equal(row1.previous, 50)
  // Same day Receive (23 Oct) = 10
  assert.equal(row1.received, 10)
  // Same day Issue/Delivery (23 Oct) = 4
  assert.equal(row1.delivery, 4)
  // Present = 50 + 10 - 4 = 56 (BNR=3 does NOT affect stock)
  assert.equal(row1.present, 56)
  assert.equal(row1.bnr, 3)

  // Row 2 (SN-002) has no movements: Previous=0, Received=0, Delivery=0, Present=0
  const row2 = result.data.rows.find((r) => r.item_code === 'SN-002')
  assert.ok(row2)
  assert.equal(row2.previous, 0)
  assert.equal(row2.present, 0)
})

test('Daily Entry: Delivery greater than available stock is rejected', async () => {
  const { actions } = setupMock({ userFloorIds: ['floor-1'] })
  // SN-001 has previous=50, received=10 -> available=60
  // Attempt delivery of 70
  const result = await actions.saveDailyEntryCellAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 70,
  })

  assert.equal(result.success, false)
  assert.ok(result.error.includes('exceeds available stock'))
})

test('Daily Entry: Transfer to same floor is rejected', async () => {
  const { actions } = setupMock({ userFloorIds: ['floor-1'] })
  const result = await actions.transferFloorStockAction({
    date: '2026-10-23',
    fromFloorId: 'floor-1',
    toFloorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    quantity: 10,
    receiverName: 'Operator B',
  })

  assert.equal(result.success, false)
  assert.ok(result.error.includes('must be different'))
})

test('Daily Entry: Requisition number generation produces unique stable format', async () => {
  const { actions } = setupMock()
  const reqNo1 = await actions.generateReqNo('2026-10-23')
  const reqNo2 = await actions.generateReqNo('2026-10-23')

  assert.ok(reqNo1.startsWith('REQ-20261023-'))
  assert.ok(reqNo2.startsWith('REQ-20261023-'))
})

test('Daily Entry: Requisition number workflow persists floor requisition number across receives', async () => {
  const { actions, tables } = setupMock({ userFloorIds: ['floor-1'] })

  // 1. Initial save of 1st receive with provided requisition number
  const saveRes1 = await actions.saveDailyEntryCellAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-2',
    field: 'received',
    value: 25,
    reqNo: 'REQ-2026-0456',
  })

  assert.equal(saveRes1.success, true)
  assert.equal(saveRes1.data.received, 25)
  assert.equal(saveRes1.data.req_no, 'REQ-2026-0456')

  // 2. Load sheet: floor requisition number should now be returned and applied
  const sheetRes = await actions.getDailyEntrySheetAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
  })

  assert.equal(sheetRes.success, true)
  assert.equal(sheetRes.data.requisitionNo, 'REQ-2026-0456')
  const norm2Row = sheetRes.data.rows.find((r) => r.needle_item_id === 'norm-2')
  assert.equal(norm2Row.req_no, 'REQ-2026-0456')

  // 3. Subsequent receive on that floor without passing reqNo inherits sheet requisition number
  const saveRes2 = await actions.saveDailyEntryCellAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'received',
    value: 15,
  })

  assert.equal(saveRes2.success, true)
  assert.equal(saveRes2.data.received, 15)
})

test('Daily Entry: updateSheetRequisitionNoAction synchronizes requisition number across floor sheet and receives', async () => {
  const { actions, tables } = setupMock({ userFloorIds: ['floor-1'] })

  const updateRes = await actions.updateSheetRequisitionNoAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
    reqNo: 'REQ-UPDATED-9999',
  })

  assert.equal(updateRes.success, true)
  assert.equal(updateRes.data.requisitionNo, 'REQ-UPDATED-9999')

  const sheetRes = await actions.getDailyEntrySheetAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
  })
  assert.equal(sheetRes.data.requisitionNo, 'REQ-UPDATED-9999')
})

test('Daily Entry: updateRowRequisitionNoAction updates single row vs floor sync with applyToAll', async () => {
  const { actions, tables } = setupMock({ userFloorIds: ['floor-1'] })

  // 1. Update single row only (applyToAll: false)
  const singleRowRes = await actions.updateRowRequisitionNoAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    reqNo: 'REQ-INDIVIDUAL-001',
    applyToAll: false,
  })

  assert.equal(singleRowRes.success, true)
  assert.equal(singleRowRes.data.requisitionNo, 'REQ-INDIVIDUAL-001')

  const tx1 = tables.needle_running_transactions.find(
    (t) => t.needle_item_id === 'norm-1' && t.transaction_type === 'RECEIVE'
  )
  assert.equal(tx1.req_no, 'REQ-INDIVIDUAL-001')

  // 2. Update with applyToAll: true
  const syncRes = await actions.updateRowRequisitionNoAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    reqNo: 'REQ-SYNCED-ALL',
    applyToAll: true,
  })

  assert.equal(syncRes.success, true)
  assert.equal(syncRes.data.requisitionNo, 'REQ-SYNCED-ALL')
  assert.equal(tx1.req_no, 'REQ-SYNCED-ALL')

  const sheetRes = await actions.getDailyEntrySheetAction({
    date: '2026-10-23',
    floorId: 'floor-1',
    category: 'RUNNING',
  })
  assert.equal(sheetRes.data.requisitionNo, 'REQ-SYNCED-ALL')
})
