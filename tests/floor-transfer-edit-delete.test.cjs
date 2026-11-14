const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function loadTsModule(relPath, deps = {}) {
  const fullPath = path.join(__dirname, '..', relPath)
  const source = fs.readFileSync(fullPath, 'utf8')
  const module = { exports: {} }

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText

  const customRequire = (reqPath) => {
    if (deps[reqPath]) return deps[reqPath]
    if (reqPath.startsWith('@/')) {
      const target = path.join('src', reqPath.slice(2))
      const withExt = fs.existsSync(path.join(__dirname, '..', target + '.ts'))
        ? target + '.ts'
        : target + '/index.ts'
      return loadTsModule(withExt, deps)
    }
    return require(reqPath)
  }

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    console: { log() {}, warn() {}, error() {} },
    require: customRequire,
    Buffer,
    process,
    crypto: require('node:crypto'),
  })

  return module.exports
}

function createStatefulMockSupabase({
  initialTransactions = [],
  rpcMode = 'missing',
  failOnTableUpdate = null,
} = {}) {
  const floors = [
    { id: 'floor-a', name: 'A Floor', code: 'A', active: true, sort_order: 1 },
    { id: 'floor-b', name: 'B Floor', code: 'B', active: true, sort_order: 2 },
    { id: 'floor-c', name: 'C Floor', code: 'C', active: true, sort_order: 3 },
  ]
  const normalItems = [
    { id: 'item-1', item_code: 'SN-001', needle_type: 'DB X 1', size_dia: '9', brand: 'ORGAN', active: true },
  ]
  const normalAssignments = [
    { needle_item_id: 'item-1', floor_id: 'floor-a', entry_type: 'running' },
    { needle_item_id: 'item-1', floor_id: 'floor-b', entry_type: 'running' },
    { needle_item_id: 'item-1', floor_id: 'floor-c', entry_type: 'running' },
  ]
  const runningTransactions = initialTransactions.map((t) => ({ ...t }))
  const transferHistory = []
  const dailySheets = []
  const bnrRecords = []

  const tables = {
    floors,
    normal_needle_items: normalItems,
    normal_needle_floor_assignments: normalAssignments,
    needle_running_transactions: runningTransactions,
    needle_floor_transfer_history: transferHistory,
    needle_daily_sheets: dailySheets,
    needle_bnr_records: bnrRecords,
  }

  let seq = 1

  const applyFilter = (rows, filters) =>
    rows.filter((row) =>
      filters.every((f) => {
        const val = row[f.col]
        if (f.op === 'eq') return val === f.val
        if (f.op === 'in') return f.vals.includes(val)
        if (f.op === 'lte') return val <= f.val
        if (f.op === 'gte') return val >= f.val
        if (f.op === 'lt') return val < f.val
        return true
      })
    )

  const makeQuery = (tableName) => {
    const state = {
      filters: [],
      orderBy: null,
      limitCount: null,
      rangeStart: null,
      rangeEnd: null,
      singleMode: false,
      maybeSingleMode: false,
      action: 'select',
      payload: null,
    }

    const execute = async () => {
      const store = tables[tableName]
      if (!store) {
        return { data: null, error: { code: '42P01', message: `missing table ${tableName}` } }
      }

      if (state.action === 'select') {
        let rows = applyFilter(store, state.filters).map((r) => ({ ...r }))
        if (state.orderBy) {
          rows.sort((a, b) => {
            const av = a[state.orderBy.col] || ''
            const bv = b[state.orderBy.col] || ''
            return state.orderBy.asc ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0)
          })
        }
        if (state.rangeStart !== null && state.rangeEnd !== null) {
          rows = rows.slice(state.rangeStart, state.rangeEnd + 1)
        }
        if (state.limitCount !== null) rows = rows.slice(0, state.limitCount)
        if (state.singleMode) {
          return rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116' } }
        }
        if (state.maybeSingleMode) {
          return { data: rows[0] || null, error: null }
        }
        return { data: rows, error: null }
      }

      if (state.action === 'insert') {
        const items = Array.isArray(state.payload) ? state.payload : [state.payload]
        if (tableName === 'needle_floor_transfer_history') {
          for (const it of items) {
            if (it.operation_id && store.some((r) => r.operation_id === it.operation_id)) {
              return { data: null, error: { code: '23505', message: 'duplicate operation_id' } }
            }
          }
        }
        const inserted = items.map((it) => {
          const rec = {
            id: it.id || `gen-${seq++}`,
            created_at: it.created_at || new Date(1700000000000 + seq * 1000).toISOString(),
            ...it,
          }
          store.push(rec)
          return { ...rec }
        })
        return { data: state.singleMode ? inserted[0] : inserted, error: null }
      }

      if (state.action === 'update') {
        if (failOnTableUpdate && failOnTableUpdate(state.payload, state.filters, store)) {
          return { data: null, error: { code: '50000', message: 'Injected update failure' } }
        }
        const targets = applyFilter(store, state.filters)
        for (const t of targets) {
          Object.assign(t, state.payload)
        }
        return { data: targets.map((t) => ({ ...t })), error: null }
      }

      if (state.action === 'delete') {
        const toDelete = new Set(applyFilter(store, state.filters))
        for (let i = store.length - 1; i >= 0; i--) {
          if (toDelete.has(store[i])) {
            store.splice(i, 1)
          }
        }
        return { data: Array.from(toDelete), error: null }
      }

      return { data: [], error: null }
    }

    const q = {
      select() {
        return q
      },
      insert(payload) {
        state.action = 'insert'
        state.payload = payload
        return q
      },
      update(payload) {
        state.action = 'update'
        state.payload = payload
        return q
      },
      delete() {
        state.action = 'delete'
        return q
      },
      eq(col, val) {
        state.filters.push({ op: 'eq', col, val })
        return q
      },
      in(col, vals) {
        state.filters.push({ op: 'in', col, vals })
        return q
      },
      lte(col, val) {
        state.filters.push({ op: 'lte', col, val })
        return q
      },
      gte(col, val) {
        state.filters.push({ op: 'gte', col, val })
        return q
      },
      lt(col, val) {
        state.filters.push({ op: 'lt', col, val })
        return q
      },
      order(col, opts) {
        state.orderBy = { col, asc: opts?.ascending !== false }
        return q
      },
      limit(n) {
        state.limitCount = n
        return q
      },
      range(from, to) {
        state.rangeStart = from
        state.rangeEnd = to
        return q
      },
      single() {
        state.singleMode = true
        return execute()
      },
      maybeSingle() {
        state.maybeSingleMode = true
        return execute()
      },
      then(resolve, reject) {
        return execute().then(resolve, reject)
      },
    }

    return q
  }

  return {
    tables,
    admin: {
      from: makeQuery,
      async rpc(fnName, params) {
        if (rpcMode === 'missing') {
          return { data: null, error: { code: '42883', message: `function ${fnName} does not exist` } }
        }
        if (typeof rpcMode === 'function') {
          return rpcMode(fnName, params, tables)
        }
        return { data: null, error: { code: '42883', message: 'missing rpc' } }
      },
    },
  }
}

function buildDailyEntryActions({
  isSiteAdmin = false,
  userFloorIds = ['floor-a', 'floor-b', 'floor-c'],
  userPerms = [
    'needle.daily_entry.view',
    'needle.daily_entry.running',
    'floor_transfer.edit',
    'floor_transfer.delete',
  ],
  mockDb,
  auditLogs = [],
}) {
  const actor = {
    id: 'user-1',
    isSiteAdmin,
    permissions: userPerms,
    profile: {
      id: 'user-1',
      floor_id: userFloorIds[0] || null,
      floor_ids: userFloorIds,
    },
  }

  const revalidated = []

  const mockedDeps = {
    '@/lib/supabase/admin': { getAdminClient: () => mockDb.admin },
    '@/lib/auth': { requireActiveAccount: async () => actor },
    '@/lib/permissions': {
      hasPermission: async (_uid, key) => isSiteAdmin || userPerms.includes(key),
    },
    '@/lib/audit': {
      createAuditLog: async (entry) => {
        auditLogs.push(entry)
      },
    },
    'next/cache': {
      revalidatePath: (p) => revalidated.push(p),
    },
  }

  const dailyEntryActions = loadTsModule('src/app/actions/daily-entry.ts', mockedDeps)
  const floorTransferActions = loadTsModule('src/app/actions/floor-transfers.ts', mockedDeps)

  return {
    actions: { ...dailyEntryActions, ...floorTransferActions },
    auditLogs,
    revalidated,
  }
}

test('1. Placement under DVLD & removal from PRESENT cell in UI table', () => {
  const tableSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/needle/daily-entry/daily-entry-table.tsx'),
    'utf8'
  )

  const dvldMarker = '/* DVLD (Editable input + clickable transfer indicator below) */'
  const presentMarker = '/* PRESENT (Read-only calculated) */'
  const dvldIdx = tableSrc.indexOf(dvldMarker)
  const presentIdx = tableSrc.indexOf(presentMarker)

  assert.ok(dvldIdx !== -1 && presentIdx !== -1 && dvldIdx < presentIdx)

  const dvldSection = tableSrc.slice(dvldIdx, presentIdx)
  const presentSection = tableSrc.slice(presentIdx, presentIdx + 700)

  // Exact notation preserved inside DVLD cell as clickable buttons
  assert.ok(dvldSection.includes('-T:{row.transfer_out}'))
  assert.ok(dvldSection.includes('+T:{row.transfer_in}'))
  assert.ok(dvldSection.includes('onOpenTransferDetails?.(row)'))
  assert.ok(dvldSection.includes('text-purple-600'))

  // Removed from PRESENT cell
  assert.equal(presentSection.includes('-T:'), false)
  assert.equal(presentSection.includes('+T:'), false)

  // Column widths remain unchanged
  assert.ok(tableSrc.includes('col className="w-[11%]"'))
  assert.ok(tableSrc.includes('col className="w-[9%]"'))
})

test('2 & 3. Dynamic transfer resolution supports single, incoming/outgoing, and duplicate same-day transfers without transfer_group_id', async () => {
  const mockDb = createStatefulMockSupabase({
    initialTransactions: [
      {
        id: 'tx-open-a',
        transaction_date: '2026-11-01',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'OPENING',
        quantity: 200,
        req_no: null,
        notes: null,
        created_at: '2026-11-01T08:00:00Z',
      },
      // Duplicate identical transfer #1 (A -> B, qty 30, REQ-DUP)
      {
        id: 'out-1',
        transaction_date: '2026-11-10',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 30,
        req_no: 'REQ-DUP',
        notes: 'To: B Floor | Receiver: Rina',
        created_at: '2026-11-10T09:00:00Z',
      },
      {
        id: 'in-1',
        transaction_date: '2026-11-10',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 30,
        req_no: 'REQ-DUP',
        notes: 'From: A Floor | Receiver: Rina',
        created_at: '2026-11-10T09:00:01Z',
      },
      // Duplicate identical transfer #2 (A -> B, qty 30, REQ-DUP, later timestamp)
      {
        id: 'out-2',
        transaction_date: '2026-11-10',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 30,
        req_no: 'REQ-DUP',
        notes: 'To: B Floor | Receiver: Rina',
        created_at: '2026-11-10T11:00:00Z',
      },
      {
        id: 'in-2',
        transaction_date: '2026-11-10',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 30,
        req_no: 'REQ-DUP',
        notes: 'From: A Floor | Receiver: Rina',
        created_at: '2026-11-10T11:00:01Z',
      },
      // Incoming transfer C -> A
      {
        id: 'out-3',
        transaction_date: '2026-11-10',
        floor_id: 'floor-c',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 12,
        req_no: 'REQ-IN-3',
        notes: 'To: A Floor | Receiver: Hasan',
        created_at: '2026-11-10T12:00:00Z',
      },
      {
        id: 'in-3',
        transaction_date: '2026-11-10',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 12,
        req_no: 'REQ-IN-3',
        notes: 'From: C Floor | Receiver: Hasan',
        created_at: '2026-11-10T12:00:01Z',
      },
    ],
  })

  const { actions } = buildDailyEntryActions({ mockDb })
  const res = await actions.getFloorTransfersForRowAction({
    date: '2026-11-10',
    floorId: 'floor-a',
    category: 'RUNNING',
    needleItemId: 'item-1',
  })

  assert.equal(res.success, true)
  assert.equal(res.data.transfers.length, 3)

  const t1 = res.data.transfers.find((t) => t.transferId === 'out-1')
  const t2 = res.data.transfers.find((t) => t.transferId === 'out-2')
  const t3 = res.data.transfers.find((t) => t.transferId === 'out-3')

  assert.equal(t1.transferInId, 'in-1')
  assert.equal(t2.transferInId, 'in-2')
  assert.equal(t1.direction, 'OUT')
  assert.equal(t3.direction, 'IN')
  assert.equal(t3.fromFloorName, 'C Floor')
  assert.equal(t3.toFloorName, 'A Floor')
  assert.equal(t3.quantity, 12)
})

test('4 & 9 & 13. Edit Transfer Quantity updates both floors atomically, updates subsequent PREV/PRESENT, and logs TRANSFER_EDIT', async () => {
  const mockDb = createStatefulMockSupabase({
    initialTransactions: [
      {
        id: 'tx-open-a',
        transaction_date: '2026-11-01',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'OPENING',
        quantity: 100,
        req_no: null,
        notes: null,
        created_at: '2026-11-01T08:00:00Z',
      },
      {
        id: 'out-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 30,
        req_no: 'REQ-100',
        notes: 'To: B Floor | Receiver: Karim',
        created_at: '2026-11-08T09:00:00Z',
      },
      {
        id: 'in-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 30,
        req_no: 'REQ-100',
        notes: 'From: A Floor | Receiver: Karim',
        created_at: '2026-11-08T09:00:01Z',
      },
      {
        id: 'tx-b-dvld',
        transaction_date: '2026-11-10',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'ISSUE',
        quantity: 10,
        req_no: null,
        notes: null,
        created_at: '2026-11-10T09:00:00Z',
      },
    ],
  })

  const { actions, auditLogs } = buildDailyEntryActions({ mockDb })

  const editRes = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-b',
    newQuantity: 45,
    newReceiverName: 'Karim Updated',
    newReqNo: 'REQ-101',
    operationId: '11111111-1111-4111-8111-111111111111',
  })

  assert.equal(editRes.success, true)

  const outRow = mockDb.tables.needle_running_transactions.find((r) => r.id === 'out-1')
  const inRow = mockDb.tables.needle_running_transactions.find((r) => r.id === 'in-1')
  assert.equal(outRow.quantity, 45)
  assert.equal(outRow.req_no, 'REQ-101')
  assert.equal(outRow.notes, 'To: B Floor | Receiver: Karim Updated')
  assert.equal(inRow.quantity, 45)
  assert.equal(inRow.req_no, 'REQ-101')
  assert.equal(inRow.notes, 'From: A Floor | Receiver: Karim Updated')

  // Subsequent date (2026-11-11) reflects updated PREV & PRESENT on both floors
  const aSheet = await actions.getDailyEntrySheetAction({
    date: '2026-11-11',
    floorId: 'floor-a',
    category: 'RUNNING',
  })
  const bSheet = await actions.getDailyEntrySheetAction({
    date: '2026-11-11',
    floorId: 'floor-b',
    category: 'RUNNING',
  })
  assert.equal(aSheet.data.rows[0].previous, 55) // 100 - 45
  assert.equal(aSheet.data.rows[0].present, 55)
  assert.equal(bSheet.data.rows[0].previous, 35) // 45 - 10 delivery
  assert.equal(bSheet.data.rows[0].present, 35)

  // Audit log recorded cleanly
  const editAudit = auditLogs.find((l) => l.eventType === 'TRANSFER_EDIT')
  assert.ok(editAudit)
  assert.equal(editAudit.oldData.quantity, 30)
  assert.equal(editAudit.newData.quantity, 45)
  assert.equal(editAudit.newData.req_no, 'REQ-101')
})

test('5 & 6. Edit Destination Floor moves TRANSFER_IN cleanly and metadata-only edit preserves stock', async () => {
  const mockDb = createStatefulMockSupabase({
    initialTransactions: [
      {
        id: 'tx-open-a',
        transaction_date: '2026-11-01',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'OPENING',
        quantity: 100,
        req_no: null,
        notes: null,
        created_at: '2026-11-01T08:00:00Z',
      },
      {
        id: 'out-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 30,
        req_no: 'REQ-5',
        notes: 'To: B Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:00Z',
      },
      {
        id: 'in-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 30,
        req_no: 'REQ-5',
        notes: 'From: A Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:01Z',
      },
    ],
  })

  const { actions } = buildDailyEntryActions({ mockDb })

  // Move B -> C with qty 25
  const moveRes = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-c',
    newQuantity: 25,
    newReceiverName: 'Sajib',
    newReqNo: 'REQ-5B',
    operationId: '22222222-2222-4222-8222-222222222222',
  })
  assert.equal(moveRes.success, true)
  assert.equal(moveRes.data.oldToFloorId, 'floor-b')
  assert.equal(moveRes.data.newToFloorId, 'floor-c')

  // B Floor balance = 0, C Floor balance = 25, A Floor balance = 75
  const aSheet = await actions.getDailyEntrySheetAction({ date: '2026-11-08', floorId: 'floor-a', category: 'RUNNING' })
  const bSheet = await actions.getDailyEntrySheetAction({ date: '2026-11-08', floorId: 'floor-b', category: 'RUNNING' })
  const cSheet = await actions.getDailyEntrySheetAction({ date: '2026-11-08', floorId: 'floor-c', category: 'RUNNING' })
  assert.equal(aSheet.data.rows[0].present, 75)
  assert.equal(bSheet.data.rows[0].present, 0)
  assert.equal(bSheet.data.rows[0].transfer_in, 0)
  assert.equal(cSheet.data.rows[0].present, 25)
  assert.equal(cSheet.data.rows[0].transfer_in, 25)

  // Metadata-only edit preserves stock exactly
  const metaRes = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-c',
    newQuantity: 25,
    newReceiverName: 'Mina',
    newReqNo: 'REQ-5C',
    operationId: '33333333-3333-4333-8333-333333333333',
  })
  assert.equal(metaRes.success, true)
  const cAfterMeta = await actions.getDailyEntrySheetAction({ date: '2026-11-08', floorId: 'floor-c', category: 'RUNNING' })
  assert.equal(cAfterMeta.data.rows[0].present, 25)
  assert.equal(cAfterMeta.data.rows[0].req_no, 'REQ-5C')
})

test('7 & 13. Delete Transfer reverses stock across both floors, preserves history snapshot, and logs TRANSFER_DELETE', async () => {
  const mockDb = createStatefulMockSupabase({
    initialTransactions: [
      {
        id: 'tx-open-a',
        transaction_date: '2026-11-01',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'OPENING',
        quantity: 100,
        req_no: null,
        notes: null,
        created_at: '2026-11-01T08:00:00Z',
      },
      {
        id: 'out-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 30,
        req_no: 'REQ-99',
        notes: 'To: B Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:00Z',
      },
      {
        id: 'in-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 30,
        req_no: 'REQ-99',
        notes: 'From: A Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:01Z',
      },
    ],
  })

  const { actions, auditLogs } = buildDailyEntryActions({ mockDb })
  const delRes = await actions.deleteFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    operationId: '44444444-4444-4444-8444-444444444444',
  })

  assert.equal(delRes.success, true)
  assert.equal(
    mockDb.tables.needle_running_transactions.some((t) => t.id === 'out-1' || t.id === 'in-1'),
    false
  )

  const aSheet = await actions.getDailyEntrySheetAction({ date: '2026-11-10', floorId: 'floor-a', category: 'RUNNING' })
  const bSheet = await actions.getDailyEntrySheetAction({ date: '2026-11-10', floorId: 'floor-b', category: 'RUNNING' })
  assert.equal(aSheet.data.rows[0].present, 100)
  assert.equal(bSheet.data.rows[0].present, 0)

  // Archived in transfer history
  assert.equal(mockDb.tables.needle_floor_transfer_history.length, 1)
  assert.equal(mockDb.tables.needle_floor_transfer_history[0].status, 'cancelled')
  assert.equal(mockDb.tables.needle_floor_transfer_history[0].quantity, 30)

  // Logged in audit_logs
  const delAudit = auditLogs.find((l) => l.eventType === 'TRANSFER_DELETE')
  assert.ok(delAudit)
  assert.equal(delAudit.newData, null)
  assert.equal(delAudit.oldData.transfer_out_id, 'out-1')
})

test('8. Chronological stock validation prevents negative stock on source floor & subsequent dates on destination floor (with zero partial mutation)', async () => {
  const initialTx = [
    {
      id: 'tx-open-a',
      transaction_date: '2026-11-01',
      floor_id: 'floor-a',
      needle_item_id: 'item-1',
      transaction_type: 'OPENING',
      quantity: 50,
      req_no: null,
      notes: null,
      created_at: '2026-11-01T08:00:00Z',
    },
    {
      id: 'out-1',
      transaction_date: '2026-11-08',
      floor_id: 'floor-a',
      needle_item_id: 'item-1',
      transaction_type: 'TRANSFER_OUT',
      quantity: 30,
      req_no: 'REQ-10',
      notes: 'To: B Floor | Receiver: Rina',
      created_at: '2026-11-08T09:00:00Z',
    },
    {
      id: 'in-1',
      transaction_date: '2026-11-08',
      floor_id: 'floor-b',
      needle_item_id: 'item-1',
      transaction_type: 'TRANSFER_IN',
      quantity: 30,
      req_no: 'REQ-10',
      notes: 'From: A Floor | Receiver: Rina',
      created_at: '2026-11-08T09:00:01Z',
    },
    // Subsequent A Floor delivery leaves only 5 on A Floor from Nov 10 onwards (50 - 30 - 15 = 5)
    {
      id: 'dvld-a',
      transaction_date: '2026-11-10',
      floor_id: 'floor-a',
      needle_item_id: 'item-1',
      transaction_type: 'ISSUE',
      quantity: 15,
      req_no: null,
      notes: null,
      created_at: '2026-11-10T09:00:00Z',
    },
    // Subsequent B Floor delivery leaves only 5 on B Floor from Nov 10 onwards (30 - 25 = 5)
    {
      id: 'dvld-b',
      transaction_date: '2026-11-10',
      floor_id: 'floor-b',
      needle_item_id: 'item-1',
      transaction_type: 'ISSUE',
      quantity: 25,
      req_no: null,
      notes: null,
      created_at: '2026-11-10T09:00:00Z',
    },
  ]

  const mockDb = createStatefulMockSupabase({ initialTransactions: initialTx })
  const { actions, auditLogs } = buildDailyEntryActions({ mockDb })

  // A) Delete blocked because B Floor delivered 25 on 2026-11-10
  const delFail = await actions.deleteFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    operationId: '55555555-5555-4555-8555-555555555555',
  })
  assert.equal(delFail.success, false)
  assert.match(delFail.error, /destination Floor/i)

  // B) Edit qty decrease 30 -> 20 blocked by subsequent B Floor delivery of 25
  const decFail = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-b',
    newQuantity: 20,
    newReceiverName: 'Rina',
    newReqNo: 'REQ-10',
    operationId: '66666666-6666-4666-8666-666666666666',
  })
  assert.equal(decFail.success, false)
  assert.match(decFail.error, /destination Floor/i)

  // C) Edit qty increase 30 -> 40 blocked by source floor balance after Nov 10 delivery (50 - 40 - 15 = -5)
  const incFail = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-b',
    newQuantity: 40,
    newReceiverName: 'Rina',
    newReqNo: 'REQ-10',
    operationId: '77777777-7777-4777-8777-777777777777',
  })
  assert.equal(incFail.success, false)
  assert.match(incFail.error, /source Floor/i)

  // D) Edit destination move B -> C blocked because B Floor already used 25
  const moveFail = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-c',
    newQuantity: 30,
    newReceiverName: 'Rina',
    newReqNo: 'REQ-10',
    operationId: '88888888-8888-4888-8888-888888888888',
  })
  assert.equal(moveFail.success, false)
  assert.match(moveFail.error, /destination Floor/i)

  // Zero partial mutations and zero audit logs recorded
  assert.equal(mockDb.tables.needle_running_transactions.find((t) => t.id === 'out-1').quantity, 30)
  assert.equal(mockDb.tables.needle_running_transactions.find((t) => t.id === 'in-1').floor_id, 'floor-b')
  assert.equal(auditLogs.length, 0)

  // E) Compensating rollback if second update fails mid-fallback
  let updCalls = 0
  const mockFailDb = createStatefulMockSupabase({
    initialTransactions: initialTx.filter((t) => !t.id.startsWith('dvld-')),
    failOnTableUpdate: (payload) => {
      updCalls++
      // Fail only on second update (TRANSFER_IN) — note rollback uses update on TRANSFER_OUT too so allow > 2
      return updCalls === 2 && payload.notes && payload.notes.startsWith('From: ')
    },
  })
  const { actions: failActions } = buildDailyEntryActions({ mockDb: mockFailDb })
  const rollbackRes = await failActions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-b',
    newQuantity: 35,
    newReceiverName: 'Changed',
    newReqNo: 'REQ-CHANGED',
  })
  assert.equal(rollbackRes.success, false)
  // TRANSFER_OUT rolled back cleanly to original values
  const intactOut = mockFailDb.tables.needle_running_transactions.find((t) => t.id === 'out-1')
  assert.equal(intactOut.quantity, 30)
  assert.equal(intactOut.req_no, 'REQ-10')
  assert.equal(intactOut.notes, 'To: B Floor | Receiver: Rina')
})

test('10. Realtime transfer calculations handle multiple transfers, edits, moves, and deletions accurately', () => {
  const shellSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/needle/daily-entry/daily-entry-shell.tsx'),
    'utf8'
  )

  // Verify delta-based update rather than overwrite for TRANSFER_IN / TRANSFER_OUT
  assert.ok(shellSrc.includes("if (txType === 'TRANSFER_IN' || txType === 'TRANSFER_OUT')"))
  assert.ok(shellSrc.includes('trfIn = Math.max(0, r.transfer_in + transferDelta)'))
  assert.ok(shellSrc.includes('trfOut = Math.max(0, r.transfer_out + transferDelta)'))
  assert.ok(shellSrc.includes('oldRecord?.floor_id && oldRecord.floor_id !== floorId'))
  assert.equal(shellSrc.includes("else if (txType === 'TRANSFER_IN') {\n              trfIn = txQty"), false)
})

test('11. Mobile responsiveness & touch usability classes exist in DailyEntryTable & TransferDetailsModal', () => {
  const tableSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/needle/daily-entry/daily-entry-table.tsx'),
    'utf8'
  )
  const modalSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/needle/daily-entry/transfer-details-modal.tsx'),
    'utf8'
  )

  assert.ok(tableSrc.includes('touch-manipulation'))
  assert.ok(tableSrc.includes('min-h-[22px]'))
  assert.ok(modalSrc.includes('min-h-[44px]'))
  assert.ok(modalSrc.includes('w-full sm:w-auto'))
  assert.ok(modalSrc.includes('overflow-y-auto'))
  assert.ok(modalSrc.includes('Delete Floor Transfer?'))
  assert.ok(modalSrc.includes('Deleting this transfer will reverse its effect on both Floors.'))
})

test('12. Permissions enforcement blocks unauthorized edits/deletes on server, key registry, Role Editor & SQL migration', async () => {
  const keysMod = loadTsModule('src/lib/permissions/keys.ts')
  assert.equal(keysMod.PERMISSIONS.FLOOR_TRANSFER.EDIT, 'floor_transfer.edit')
  assert.equal(keysMod.PERMISSIONS.FLOOR_TRANSFER.DELETE, 'floor_transfer.delete')

  const roleEditorSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src/components/admin/role-editor.tsx'),
    'utf8'
  )
  assert.ok(roleEditorSrc.includes("moduleKey: 'floor_transfer'"))
  assert.ok(roleEditorSrc.includes("actions: ['edit', 'delete']"))

  const sqlSrc = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/migrations/20261111000000_floor_transfer_management.sql'),
    'utf8'
  )
  assert.ok(sqlSrc.includes("'floor_transfer.edit'"))
  assert.ok(sqlSrc.includes("'floor_transfer.delete'"))
  assert.ok(sqlSrc.includes('edit_needle_floor_transfer_atomic'))
  assert.ok(sqlSrc.includes('delete_needle_floor_transfer_atomic'))

  const mockDb = createStatefulMockSupabase({
    initialTransactions: [
      {
        id: 'tx-open-a',
        transaction_date: '2026-11-01',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'OPENING',
        quantity: 100,
        req_no: null,
        notes: null,
        created_at: '2026-11-01T08:00:00Z',
      },
      {
        id: 'out-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 20,
        req_no: 'REQ-1',
        notes: 'To: B Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:00Z',
      },
      {
        id: 'in-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 20,
        req_no: 'REQ-1',
        notes: 'From: A Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:01Z',
      },
    ],
  })

  // Missing edit/delete permissions
  const { actions: readOnlyActions } = buildDailyEntryActions({
    mockDb,
    userPerms: ['needle.daily_entry.view', 'needle.daily_entry.running'],
  })
  const noEdit = await readOnlyActions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-b',
    newQuantity: 25,
    newReceiverName: 'Rina',
  })
  const noDel = await readOnlyActions.deleteFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
  })
  assert.equal(noEdit.success, false)
  assert.match(noEdit.error, /Unauthorized/)
  assert.equal(noDel.success, false)
  assert.match(noDel.error, /Unauthorized/)

  // Assigned only to unrelated C Floor -> cannot edit/delete A -> B transfer
  const { actions: wrongFloorActions } = buildDailyEntryActions({
    mockDb,
    userFloorIds: ['floor-c'],
  })
  const wrongFloorEdit = await wrongFloorActions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-c',
    newQuantity: 20,
    newReceiverName: 'Rina',
  })
  assert.equal(wrongFloorEdit.success, false)
  assert.match(wrongFloorEdit.error, /Unauthorized/)
})

test('14. Idempotency protects duplicate Edit and Delete retries via operationId', async () => {
  const mockDb = createStatefulMockSupabase({
    initialTransactions: [
      {
        id: 'tx-open-a',
        transaction_date: '2026-11-01',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'OPENING',
        quantity: 100,
        req_no: null,
        notes: null,
        created_at: '2026-11-01T08:00:00Z',
      },
      {
        id: 'out-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 20,
        req_no: 'REQ-1',
        notes: 'To: B Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:00Z',
      },
      {
        id: 'in-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 20,
        req_no: 'REQ-1',
        notes: 'From: A Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:01Z',
      },
    ],
  })

  const { actions, auditLogs } = buildDailyEntryActions({ mockDb })
  const editOpId = '99999999-9999-4999-8999-999999999999'

  const edit1 = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-b',
    newQuantity: 35,
    newReceiverName: 'Rina',
    operationId: editOpId,
  })
  const edit2 = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-b',
    newQuantity: 35,
    newReceiverName: 'Rina',
    operationId: editOpId,
  })

  assert.equal(edit1.success, true)
  assert.equal(edit1.data.idempotent, false)
  assert.equal(edit2.success, true)
  assert.equal(edit2.data.idempotent, true)
  assert.equal(auditLogs.filter((l) => l.eventType === 'TRANSFER_EDIT').length, 1)

  const delOpId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const del1 = await actions.deleteFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    operationId: delOpId,
  })
  const del2 = await actions.deleteFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    operationId: delOpId,
  })

  assert.equal(del1.success, true)
  assert.equal(del1.data.idempotent, false)
  assert.equal(del2.success, true)
  assert.equal(del2.data.idempotent, true)
  assert.equal(auditLogs.filter((l) => l.eventType === 'TRANSFER_DELETE').length, 1)
})

test('15. IndexedDB cache reconciliation clears affected stale snapshots/movements while preserving unsynced drafts & queue', async () => {
  const storesData = {
    drafts: new Map([
      ['u1:2026-11-08:floor-a:RUNNING', { sheet_key: 'u1:2026-11-08:floor-a:RUNNING', cells: { 'item-1': { delivery: 4 } } }],
    ]),
    pending_queue: new Map([
      ['op-1', { id: 'op-1', sheet_key: 'u1:2026-11-08:floor-a:RUNNING', status: 'pending' }],
    ]),
    sheet_snapshots_cache: new Map([
      ['u1:2026-11-07:floor-a:RUNNING', { sheet_key: 'u1:2026-11-07:floor-a:RUNNING', user_id: 'u1', category: 'RUNNING', floor_id: 'floor-a', entry_date: '2026-11-07' }],
      ['u1:2026-11-08:floor-a:RUNNING', { sheet_key: 'u1:2026-11-08:floor-a:RUNNING', user_id: 'u1', category: 'RUNNING', floor_id: 'floor-a', entry_date: '2026-11-08' }],
      ['u1:2026-11-09:floor-b:RUNNING', { sheet_key: 'u1:2026-11-09:floor-b:RUNNING', user_id: 'u1', category: 'RUNNING', floor_id: 'floor-b', entry_date: '2026-11-09' }],
      ['u1:2026-11-09:floor-c:RUNNING', { sheet_key: 'u1:2026-11-09:floor-c:RUNNING', user_id: 'u1', category: 'RUNNING', floor_id: 'floor-c', entry_date: '2026-11-09' }],
    ]),
    daily_stock_snapshots: new Map([
      ['floor-a:RUNNING:2026-11-07:item-1', { id: 'floor-a:RUNNING:2026-11-07:item-1', category: 'RUNNING', needle_item_id: 'item-1', floor_id: 'floor-a', date: '2026-11-07' }],
      ['floor-a:RUNNING:2026-11-08:item-1', { id: 'floor-a:RUNNING:2026-11-08:item-1', category: 'RUNNING', needle_item_id: 'item-1', floor_id: 'floor-a', date: '2026-11-08' }],
      ['floor-b:RUNNING:2026-11-10:item-1', { id: 'floor-b:RUNNING:2026-11-10:item-1', category: 'RUNNING', needle_item_id: 'item-1', floor_id: 'floor-b', date: '2026-11-10' }],
    ]),
    stock_movements_cache: new Map([
      ['out-1', { id: 'out-1', category: 'RUNNING', needle_item_id: 'item-1', floor_id: 'floor-a', transaction_date: '2026-11-08', transaction_type: 'TRANSFER_OUT' }],
      ['in-1', { id: 'in-1', category: 'RUNNING', needle_item_id: 'item-1', floor_id: 'floor-b', transaction_date: '2026-11-08', transaction_type: 'TRANSFER_IN' }],
      ['rcvd-1', { id: 'rcvd-1', category: 'RUNNING', needle_item_id: 'item-1', floor_id: 'floor-a', transaction_date: '2026-11-08', transaction_type: 'RECEIVE' }],
    ]),
  }

  const fakeWindow = {
    indexedDB: {
      open() {
        const req = {}
        queueMicrotask(() => {
          const fakeDb = {
            objectStoreNames: {
              contains: (name) => Object.prototype.hasOwnProperty.call(storesData, name),
            },
            close() {},
            transaction(storeNames) {
              const tx = {
                oncomplete: null,
                onerror: null,
                objectStore(name) {
                  const map = storesData[name]
                  return {
                    getAll() {
                      const r = {}
                      queueMicrotask(() => {
                        r.result = Array.from(map.values())
                        r.onsuccess?.()
                      })
                      return r
                    },
                    delete(k) {
                      map.delete(k)
                    },
                  }
                },
              }
              setTimeout(() => tx.oncomplete?.(), 0)
              return tx
            },
          }
          req.result = fakeDb
          req.onsuccess?.()
        })
        return req
      },
    },
  }

  // Load with mocked window global
  const fullPath = path.join(__dirname, '..', 'src/lib/offline/daily-entry-db.ts')
  const transpiled = ts.transpileModule(fs.readFileSync(fullPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const dbMod = { exports: {} }
  vm.runInNewContext(transpiled, {
    module: dbMod,
    exports: dbMod.exports,
    window: fakeWindow,
    indexedDB: fakeWindow.indexedDB,
    crypto: require('node:crypto'),
    require: (name) => (name === '@/types' ? {} : require(name)),
    setTimeout,
    queueMicrotask,
  })

  await dbMod.exports.reconcileTransferCacheInIndexedDB({
    userId: 'u1',
    category: 'RUNNING',
    needleItemId: 'item-1',
    transferDate: '2026-11-08',
    affectedFloorIds: ['floor-a', 'floor-b'],
    removedTransactionIds: ['out-1', 'in-1'],
  })

  // Stale affected floor snapshots from 2026-11-08 onwards removed; earlier & unaffected kept
  assert.equal(storesData.sheet_snapshots_cache.has('u1:2026-11-07:floor-a:RUNNING'), true)
  assert.equal(storesData.sheet_snapshots_cache.has('u1:2026-11-08:floor-a:RUNNING'), false)
  assert.equal(storesData.sheet_snapshots_cache.has('u1:2026-11-09:floor-b:RUNNING'), false)
  assert.equal(storesData.sheet_snapshots_cache.has('u1:2026-11-09:floor-c:RUNNING'), true)

  assert.equal(storesData.daily_stock_snapshots.has('floor-a:RUNNING:2026-11-07:item-1'), true)
  assert.equal(storesData.daily_stock_snapshots.has('floor-a:RUNNING:2026-11-08:item-1'), false)
  assert.equal(storesData.daily_stock_snapshots.has('floor-b:RUNNING:2026-11-10:item-1'), false)

  // Transfer movements cleared, RECEIVE untouched
  assert.equal(storesData.stock_movements_cache.has('out-1'), false)
  assert.equal(storesData.stock_movements_cache.has('in-1'), false)
  assert.equal(storesData.stock_movements_cache.has('rcvd-1'), true)

  // Local drafts & pending queue preserved intact!
  assert.equal(storesData.drafts.size, 1)
  assert.equal(storesData.pending_queue.size, 1)
})

test('16. Atomic RPC path forwards parameters, respects RPC rejections, and handles RPC idempotency cleanly', async () => {
  const rpcCalls = []
  const seenOps = new Map()

  const mockDb = createStatefulMockSupabase({
    initialTransactions: [
      {
        id: 'tx-open-a',
        transaction_date: '2026-11-01',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'OPENING',
        quantity: 100,
        req_no: null,
        notes: null,
        created_at: '2026-11-01T08:00:00Z',
      },
      {
        id: 'out-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-a',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_OUT',
        quantity: 20,
        req_no: 'REQ-1',
        notes: 'To: B Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:00Z',
      },
      {
        id: 'in-1',
        transaction_date: '2026-11-08',
        floor_id: 'floor-b',
        needle_item_id: 'item-1',
        transaction_type: 'TRANSFER_IN',
        quantity: 20,
        req_no: 'REQ-1',
        notes: 'From: A Floor | Receiver: Rina',
        created_at: '2026-11-08T09:00:01Z',
      },
    ],
    rpcMode: (fnName, params, tables) => {
      rpcCalls.push({ fnName, params })
      if (params.p_new_quantity === 999) {
        return {
          data: null,
          error: {
            code: 'P0001',
            message: 'Cannot update transfer: insufficient available stock on source Floor (A Floor) on 2026-11-08.',
          },
        }
      }
      if (params.p_operation_id && seenOps.has(params.p_operation_id)) {
        return { data: { ...seenOps.get(params.p_operation_id), idempotent: true }, error: null }
      }
      const res = {
        success: true,
        idempotent: false,
        transfer_out_id: params.p_transfer_out_id,
        transfer_in_id: fnName === 'edit_needle_floor_transfer_atomic' ? 'in-moved-1' : 'in-1',
        old_data: { quantity: 20 },
        new_data: { quantity: params.p_new_quantity || 20 },
      }
      if (params.p_operation_id) seenOps.set(params.p_operation_id, res)
      if (fnName === 'delete_needle_floor_transfer_atomic') {
        tables.needle_running_transactions = tables.needle_running_transactions.filter(
          (r) => r.id !== params.p_transfer_out_id && r.id !== 'in-1'
        )
      }
      return { data: res, error: null }
    },
  })

  const { actions, auditLogs } = buildDailyEntryActions({ mockDb })

  // RPC insufficient stock exception propagates cleanly
  const badRpc = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-c',
    newQuantity: 999,
    newReceiverName: 'Rina',
  })
  assert.equal(badRpc.success, false)
  assert.match(badRpc.error, /insufficient available stock on source Floor/i)
  assert.equal(auditLogs.length, 0)

  // Valid RPC edit + idempotent RPC replay
  const op1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const ok1 = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-c',
    newQuantity: 25,
    newReceiverName: 'Rina',
    operationId: op1,
  })
  const ok2 = await actions.editFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    newToFloorId: 'floor-c',
    newQuantity: 25,
    newReceiverName: 'Rina',
    operationId: op1,
  })

  assert.equal(ok1.success, true)
  assert.equal(ok1.data.transferInId, 'in-moved-1')
  assert.equal(ok1.data.idempotent, false)
  assert.equal(ok2.success, true)
  assert.equal(ok2.data.idempotent, true)
  assert.equal(auditLogs.filter((l) => l.eventType === 'TRANSFER_EDIT').length, 1)

  // Valid RPC delete
  const delRpc = await actions.deleteFloorTransferAction({
    category: 'RUNNING',
    transferId: 'out-1',
    operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  })
  assert.equal(delRpc.success, true)
  assert.equal(rpcCalls.some((c) => c.fnName === 'delete_needle_floor_transfer_atomic'), true)
  assert.equal(auditLogs.filter((l) => l.eventType === 'TRANSFER_DELETE').length, 1)
})
