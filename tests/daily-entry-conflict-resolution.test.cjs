const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function moduleFrom(file, deps = {}, globals = {}) {
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
      ...globals,
    }
  )
  return exports
}

// In-Memory IndexedDB Mock for unit testing IndexedDB offline logic in Node
function createMockIndexedDB() {
  const databases = new Map()

  return {
    open(name, version) {
      const req = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      }

      setTimeout(() => {
        let db = databases.get(name)
        let isUpgrade = false
        if (!db) {
          isUpgrade = true
          db = {
            name,
            version,
            stores: new Map(),
            objectStoreNames: {
              contains: (s) => db.stores.has(s),
            },
            createObjectStore: (sName, { keyPath }) => {
              const storeData = {
                name: sName,
                keyPath,
                records: new Map(),
                indexes: new Map(),
                createIndex: (idxName, idxKeyPath) => {
                  storeData.indexes.set(idxName, idxKeyPath)
                },
              }
              db.stores.set(sName, storeData)
              return storeData
            },
            close: () => {},
          }
          databases.set(name, db)
        }

        req.result = {
          objectStoreNames: db.objectStoreNames,
          createObjectStore: db.createObjectStore,
          close: db.close,
          transaction: (storeNames, mode) => {
            const tx = {
              oncomplete: null,
              onerror: null,
              objectStore: (sName) => {
                const s = db.stores.get(sName)
                if (!s) throw new Error(`Object store ${sName} not found`)

                return {
                  put: (val) => {
                    const key = val[s.keyPath]
                    s.records.set(key, JSON.parse(JSON.stringify(val)))
                    const r = { onsuccess: null, onerror: null }
                    queueMicrotask(() => r.onsuccess && r.onsuccess())
                    return r
                  },
                  add: (val) => {
                    const key = val[s.keyPath]
                    s.records.set(key, JSON.parse(JSON.stringify(val)))
                    const r = { onsuccess: null, onerror: null }
                    queueMicrotask(() => r.onsuccess && r.onsuccess())
                    return r
                  },
                  get: (key) => {
                    const r = { result: undefined, onsuccess: null, onerror: null }
                    queueMicrotask(() => {
                      r.result = s.records.has(key) ? JSON.parse(JSON.stringify(s.records.get(key))) : undefined
                      r.onsuccess && r.onsuccess()
                    })
                    return r
                  },
                  delete: (key) => {
                    s.records.delete(key)
                    const r = { onsuccess: null, onerror: null }
                    queueMicrotask(() => r.onsuccess && r.onsuccess())
                    return r
                  },
                  clear: () => {
                    s.records.clear()
                    const r = { onsuccess: null, onerror: null }
                    queueMicrotask(() => r.onsuccess && r.onsuccess())
                    return r
                  },
                  getAll: (queryKey) => {
                    const r = { result: [], onsuccess: null, onerror: null }
                    queueMicrotask(() => {
                      let all = Array.from(s.records.values())
                      if (queryKey !== undefined && typeof queryKey === 'string') {
                        all = all.filter((rec) => rec[s.keyPath] === queryKey)
                      }
                      r.result = JSON.parse(JSON.stringify(all))
                      r.onsuccess && r.onsuccess()
                    })
                    return r
                  },
                  index: (idxName) => {
                    const idxKeyPath = s.indexes.get(idxName)
                    return {
                      getAll: (queryVal) => {
                        const r = { result: [], onsuccess: null, onerror: null }
                        queueMicrotask(() => {
                          let matches = Array.from(s.records.values())
                          if (queryVal !== undefined) {
                            matches = matches.filter((rec) => {
                              if (Array.isArray(idxKeyPath) && Array.isArray(queryVal)) {
                                return idxKeyPath.every((k, i) => rec[k] === queryVal[i])
                              }
                              return rec[idxKeyPath] === queryVal
                            })
                          }
                          r.result = JSON.parse(JSON.stringify(matches))
                          r.onsuccess && r.onsuccess()
                        })
                        return r
                      },
                    }
                  },
                }
              },
            }

            setTimeout(() => {
              tx.oncomplete && tx.oncomplete()
            }, 5)

            return tx
          },
        }

        if (isUpgrade && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req })
        }
        if (req.onsuccess) {
          req.onsuccess()
        }
      }, 0)

      return req
    },
  }
}

// Supabase mock environment
function setupMockSupabase({ initialTransactions = [] } = {}) {
  const transactions = [...initialTransactions]

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
        lte(k, v) { filters.push([k, v, '<=']); return q },
        gte(k, v) { filters.push([k, v, '>=']); return q },
        is(k, v) { return q },
        range(s, e) { start = s; end = e; return q },
        maybeSingle() { single = true; return q },
        single() { single = true; return q },
        insert(data) { op = 'insert'; payload = data; return q },
        update(data) { op = 'update'; payload = data; return q },
        upsert(data) { op = 'upsert'; payload = data; return q },
        delete() { op = 'delete'; return q },
        then(resolve) {
          let rows = table.includes('transactions') ? [...transactions] : []

          for (const f of filters) {
            const [k, v, comp] = f
            if (comp === '<=') rows = rows.filter((r) => r[k] <= v)
            else if (comp === '>=') rows = rows.filter((r) => r[k] >= v)
            else rows = rows.filter((r) => r[k] === v)
          }

          if (op === 'insert') {
            const item = Array.isArray(payload) ? payload[0] : payload
            const created = { id: item.id || `tx-${Date.now()}-${Math.random()}`, ...item }
            transactions.push(created)
            return resolve({ data: single ? created : [created], error: null })
          }

          if (op === 'update') {
            for (const r of rows) {
              Object.assign(r, payload)
            }
            return resolve({ data: rows, error: null })
          }

          if (op === 'delete') {
            for (const r of rows) {
              const idx = transactions.findIndex((t) => t.id === r.id)
              if (idx >= 0) transactions.splice(idx, 1)
            }
            return resolve({ data: rows, error: null })
          }

          if (single) {
            return resolve({ data: rows[0] || null, error: null })
          }

          const sliced = rows.slice(start, end + 1)
          return resolve({ data: sliced, error: null })
        },
      }

      return q
    },
  }

  return { admin, transactions }
}

test('Conflict Resolution 1: Delivery > Available Stock returns isConflict and records server_available_stock', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, { window: { indexedDB: mockIDB }, crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) } })

  // 1. Enqueue an invalid delivery operation: user entered DVLD = 134
  const op = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 134,
  })

  assert.equal(op.value, 134)
  assert.equal(op.status, 'pending')

  // 2. Mark operation conflict when server validation rejects it with availableStock: 100
  await dbModule.markOperationConflict(
    op.id,
    'Delivery quantity (134) exceeds available stock (100).',
    100
  )

  // 3. Verify operation in queue has status 'conflict' and server_available_stock = 100
  const conflicts = await dbModule.getConflictOperations(op.sheet_key)
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].id, op.id)
  assert.equal(conflicts[0].status, 'conflict')
  assert.equal(conflicts[0].value, 134)
  assert.equal(conflicts[0].server_available_stock, 100)
  assert.match(conflicts[0].error, /exceeds available stock \(100\)/)
})

test('Conflict Resolution 2: Retry button distinguishes retryable failed items vs permanent conflicts', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, { window: { indexedDB: mockIDB }, crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) } })

  // Enqueue two operations: one failed network op, one business conflict
  const failedOp = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'received',
    value: 50,
  })
  await dbModule.updateOperationsStatus([failedOp.id], 'failed', 'Network timeout')

  const conflictOp = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-2',
    field: 'delivery',
    value: 134,
  })
  await dbModule.markOperationConflict(conflictOp.id, 'Delivery exceeds available stock (100).', 100)

  // Read all operations
  const allOps = await dbModule.getPendingOperations(failedOp.sheet_key)
  const retryable = allOps.filter((o) => o.status === 'failed')
  const permanentConflicts = allOps.filter((o) => o.status === 'conflict')

  assert.equal(retryable.length, 1)
  assert.equal(retryable[0].id, failedOp.id)

  assert.equal(permanentConflicts.length, 1)
  assert.equal(permanentConflicts[0].id, conflictOp.id)

  // If retryable items are retried, only failed is marked pending
  await dbModule.updateOperationsStatus(retryable.map((o) => o.id), 'pending')

  const refreshedOps = await dbModule.getPendingOperations(failedOp.sheet_key)
  const updatedFailed = refreshedOps.find((o) => o.id === failedOp.id)
  const updatedConflict = refreshedOps.find((o) => o.id === conflictOp.id)

  assert.equal(updatedFailed.status, 'pending')
  assert.equal(updatedConflict.status, 'conflict') // Permanent conflict remains in conflict status!
})

test('Conflict Resolution 3: Edit replaces invalid DVLD (134 -> 90), validates against available stock, issues fresh client_operation_id', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, { window: { indexedDB: mockIDB }, crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) } })

  const op = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 134,
  })
  const oldClientId = op.client_operation_id

  await dbModule.markOperationConflict(op.id, 'Delivery exceeds available stock (100).', 100)

  // Attempting an edit that still exceeds available stock (e.g. 110 > 100) must be rejected
  const invalidEdit = await dbModule.resolveConflictEdit({
    operationId: op.id,
    newDvld: 110,
  })
  assert.equal(invalidEdit.success, false)
  assert.match(invalidEdit.error, /exceeds available stock \(100\)/)

  // Valid edit: 134 -> 90
  const validEdit = await dbModule.resolveConflictEdit({
    operationId: op.id,
    newDvld: 90,
  })
  assert.equal(validEdit.success, true)

  // Verify queue op
  const allOps = await dbModule.getPendingOperations(op.sheet_key)
  const resolvedOp = allOps.find((o) => o.id === op.id)
  assert.equal(resolvedOp.value, 90)
  assert.equal(resolvedOp.status, 'pending')
  assert.equal(resolvedOp.error, null)
  assert.notEqual(resolvedOp.client_operation_id, oldClientId) // Fresh idempotency ID!

  // Verify draft
  const draft = await dbModule.getSheetDraft(op.sheet_key)
  assert.equal(draft.cells['norm-1'].delivery, 90)
})

test('Conflict Resolution 4: Use Available Stock sets DVLD = available stock (100) and returns to pending', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, { window: { indexedDB: mockIDB }, crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) } })

  const op = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 134,
  })

  await dbModule.markOperationConflict(op.id, 'Delivery exceeds available stock (100).', 100)

  // Resolve using available stock: 100
  const res = await dbModule.resolveConflictEdit({
    operationId: op.id,
    newDvld: 100,
  })
  assert.equal(res.success, true)

  const allOps = await dbModule.getPendingOperations(op.sheet_key)
  const resolvedOp = allOps.find((o) => o.id === op.id)
  assert.equal(resolvedOp.value, 100)
  assert.equal(resolvedOp.status, 'pending')

  const draft = await dbModule.getSheetDraft(op.sheet_key)
  assert.equal(draft.cells['norm-1'].delivery, 100)
})

test('Conflict Resolution 5: Discard removes invalid local DVLD draft, removes conflict op, restores authoritative state', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, { window: { indexedDB: mockIDB }, crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) } })

  const op = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 134,
  })

  await dbModule.markOperationConflict(op.id, 'Delivery exceeds available stock (100).', 100)

  // Verify draft has invalid delivery 134
  let draft = await dbModule.getSheetDraft(op.sheet_key)
  assert.equal(draft.cells['norm-1'].delivery, 134)

  // User chooses Discard
  const discardRes = await dbModule.discardConflictOperation({ operationId: op.id })
  assert.equal(discardRes.success, true)

  // 1. Queue operation must be deleted
  const allOps = await dbModule.getPendingOperations(op.sheet_key)
  assert.equal(allOps.find((o) => o.id === op.id), undefined)

  // 2. Draft cell must have delivery removed
  draft = await dbModule.getSheetDraft(op.sheet_key)
  assert.equal(draft.cells['norm-1']?.delivery, undefined)

  // 3. Conflict count is 0
  const conflicts = await dbModule.getConflictOperations(op.sheet_key)
  assert.equal(conflicts.length, 0)
})

test('Conflict Resolution 6: Multiple independent conflicts can be edited, set to available, and discarded separately', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, { window: { indexedDB: mockIDB }, crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) } })

  // Conflict 1: needle norm-1, entered 134, available 100
  const op1 = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 134,
  })
  await dbModule.markOperationConflict(op1.id, 'Delivery exceeds available stock (100).', 100)

  // Conflict 2: needle norm-2, entered 80, available 50
  const op2 = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-2',
    field: 'delivery',
    value: 80,
  })
  await dbModule.markOperationConflict(op2.id, 'Delivery exceeds available stock (50).', 50)

  // Conflict 3: needle norm-3, entered 200, available 120
  const op3 = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-3',
    field: 'delivery',
    value: 200,
  })
  await dbModule.markOperationConflict(op3.id, 'Delivery exceeds available stock (120).', 120)

  let conflicts = await dbModule.getConflictOperations(op1.sheet_key)
  assert.equal(conflicts.length, 3)

  // Resolve Conflict 1 via Edit: 134 -> 90
  const res1 = await dbModule.resolveConflictEdit({ operationId: op1.id, newDvld: 90 })
  assert.equal(res1.success, true)
  conflicts = await dbModule.getConflictOperations(op1.sheet_key)
  assert.equal(conflicts.length, 2)

  // Resolve Conflict 2 via Use Available Stock: 50
  const res2 = await dbModule.resolveConflictEdit({ operationId: op2.id, newDvld: 50 })
  assert.equal(res2.success, true)
  conflicts = await dbModule.getConflictOperations(op1.sheet_key)
  assert.equal(conflicts.length, 1)

  // Resolve Conflict 3 via Discard
  const res3 = await dbModule.discardConflictOperation({ operationId: op3.id })
  assert.equal(res3.success, true)
  conflicts = await dbModule.getConflictOperations(op1.sheet_key)
  assert.equal(conflicts.length, 0) // All resolved!
})

test('Conflict Resolution 7: Backward-compatibility parses available stock from legacy conflict records without clearing IndexedDB', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, { window: { indexedDB: mockIDB }, crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) } })

  // Create an old conflict item that only had error text, with server_available_stock undefined
  const op = await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-1',
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'delivery',
    value: 134,
  })

  // Simulate old markOperationConflict without 3rd parameter
  await dbModule.markOperationConflict(op.id, 'Delivery quantity (134) exceeds available stock (100).')

  // getConflictOperations must parse available stock 100 from error string
  const conflicts = await dbModule.getConflictOperations(op.sheet_key)
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].server_available_stock, 100)

  // resolveConflictEdit successfully validates against parsed available stock
  const invalidEdit = await dbModule.resolveConflictEdit({
    operationId: op.id,
    newDvld: 105,
  })
  assert.equal(invalidEdit.success, false)
  assert.match(invalidEdit.error, /exceeds available stock \(100\)/)

  const validEdit = await dbModule.resolveConflictEdit({
    operationId: op.id,
    newDvld: 95,
  })
  assert.equal(validEdit.success, true)
})

test('Conflict Resolution 8: End-to-end sync with batchSyncDailyEntryAction validates and resolves cleanly', async () => {
  const { admin, transactions } = setupMockSupabase({
    initialTransactions: [
      {
        id: 'tx-open',
        transaction_date: '2026-10-26',
        floor_id: 'floor-1',
        needle_item_id: 'norm-1',
        transaction_type: 'OPENING',
        quantity: 100,
      },
    ],
  })

  const actionsModule = moduleFrom('src/app/actions/daily-entry.ts', {
    '@/lib/supabase/admin': { getAdminClient: () => admin },
    '@/lib/supabase/server': { getAdminClient: () => admin },
    '@/lib/auth': {
      requireActiveAccount: async () => ({
        id: 'user-1',
        email: 'op@example.com',
        profile: { id: 'prof-1', name: 'Operator', employee_id: 'EMP-01' },
        permissions: ['needle.daily_entry.running'],
        isSiteAdmin: true,
      }),
    },
    '@/lib/permissions': {
      isUserAuthorizedForFloor: () => true,
      canAccessCategory: async () => true,
    },
    '@/lib/audit': {
      createAuditLog: async () => {},
    },
    'next/cache': { revalidatePath: () => {} },
  })

  // Attempt batch sync with DVLD = 134 when available stock is 100
  const syncRes1 = await actionsModule.batchSyncDailyEntryAction({
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [
      {
        id: 'op-1',
        client_operation_id: 'client-op-1',
        needle_item_id: 'norm-1',
        field: 'delivery',
        value: 134,
      },
    ],
  })

  assert.equal(syncRes1.success, true)
  assert.equal(syncRes1.data.results.length, 1)
  const res1 = syncRes1.data.results[0]
  assert.equal(res1.isConflict, true)
  assert.equal(res1.availableStock, 100)
  assert.match(res1.error, /exceeds available stock \(100\)/)

  // Resubmit with corrected DVLD = 90
  const syncRes2 = await actionsModule.batchSyncDailyEntryAction({
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
    operations: [
      {
        id: 'op-1',
        client_operation_id: 'client-op-2', // fresh client_operation_id
        needle_item_id: 'norm-1',
        field: 'delivery',
        value: 90,
      },
    ],
  })

  assert.equal(syncRes2.success, true)
  const res2 = syncRes2.data.results[0]
  assert.equal(res2.success, true)
  assert.equal(res2.isConflict, undefined)

  // Verify transaction in Supabase
  const tx = transactions.find((t) => t.needle_item_id === 'norm-1' && t.transaction_type === 'ISSUE')
  assert.ok(tx)
  assert.equal(tx.quantity, 90)
})
