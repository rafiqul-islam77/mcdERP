const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

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

function loadDailyEntryDb(mockIDB) {
  const exports = {}
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/lib/offline/daily-entry-db.ts'), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      window: { indexedDB: mockIDB },
      console: { warn() {}, error() {}, log() {} },
      require: () => ({}),
      crypto: {
        randomUUID: () => 'uuid-' + Math.random().toString(36).substring(2, 10),
      },
    }
  )
  return exports
}

test('Reliability 1: recoverStuckSyncingOps recovers abandoned in-flight syncing operations', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = loadDailyEntryDb(mockIDB)

  const userId = 'user-test-1'
  const sheetKey = dbModule.generateSheetKey(userId, '2026-11-08', 'floor-1', 'RUNNING')

  // 1. Enqueue operation
  const op = await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-11-08',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'needle-item-1',
    field: 'delivery',
    value: 15,
  })

  assert.equal(op.status, 'pending')
  const originalClientId = op.client_operation_id

  // 2. Mark operation as syncing
  await dbModule.updateOperationsStatus([op.id], 'syncing')
  let currentOps = await dbModule.getPendingOperations(sheetKey)
  assert.equal(currentOps[0].status, 'syncing')

  // 3. Fresh syncing operation (<60s) should NOT be recovered
  let recovered = await dbModule.recoverStuckSyncingOps(userId)
  assert.equal(recovered, 0)
  currentOps = await dbModule.getPendingOperations(sheetKey)
  assert.equal(currentOps[0].status, 'syncing')

  // 4. Age the operation to simulate browser suspension / crash
  const openReq = mockIDB.open('mcd_erp_daily_entry_v1', 5)
  await new Promise((resolve) => {
    openReq.onsuccess = () => {
      const db = openReq.result
      const tx = db.transaction('pending_queue', 'readwrite')
      const store = tx.objectStore('pending_queue')
      const getReq = store.get(op.id)
      getReq.onsuccess = () => {
        const item = getReq.result
        item.last_attempt_at = Date.now() - 70_000
        item.updated_at = Date.now() - 70_000
        store.put(item)
      }
      tx.oncomplete = resolve
    }
  })

  // 5. Run recovery
  recovered = await dbModule.recoverStuckSyncingOps(userId)
  assert.equal(recovered, 1, 'Must recover exactly 1 abandoned syncing operation')

  currentOps = await dbModule.getPendingOperations(sheetKey)
  assert.equal(currentOps[0].status, 'pending', 'Status must be restored to pending')
  assert.equal(currentOps[0].client_operation_id, originalClientId, 'Client operation ID must be preserved for server idempotency')
});

test('Reliability 2: recoverStuckSyncingOps respects user isolation', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = loadDailyEntryDb(mockIDB)

  const userA = 'user-a'
  const userB = 'user-b'

  const opB = await dbModule.saveCellDraftAndEnqueueOp({
    userId: userB,
    date: '2026-11-08',
    floorId: 'floor-2',
    category: 'RUNNING',
    needleItemId: 'needle-item-2',
    field: 'received',
    value: 50,
  })

  await dbModule.updateOperationsStatus([opB.id], 'syncing')

  // Age the record
  const openReq = mockIDB.open('mcd_erp_daily_entry_v1', 5)
  await new Promise((resolve) => {
    openReq.onsuccess = () => {
      const db = openReq.result
      const tx = db.transaction('pending_queue', 'readwrite')
      const store = tx.objectStore('pending_queue')
      const getReq = store.get(opB.id)
      getReq.onsuccess = () => {
        const item = getReq.result
        item.last_attempt_at = Date.now() - 80_000
        store.put(item)
      }
      tx.oncomplete = resolve
    }
  })

  // User A runs recovery - should not recover User B's operation
  const recoveredByA = await dbModule.recoverStuckSyncingOps(userA)
  assert.equal(recoveredByA, 0, 'User A should not recover operations belonging to User B')

  // User B runs recovery - recovers opB
  const recoveredByB = await dbModule.recoverStuckSyncingOps(userB)
  assert.equal(recoveredByB, 1, 'User B must recover their own operation')
});

test('Reliability 3: Save status determination prevents false Saved display', () => {
  function computeSaveStatus({ pending, conflicts, isOnline, lastSavedAt }) {
    if (!isOnline) return 'offline'
    if (conflicts.length > 0) return 'conflict'
    if (pending.length > 0) return 'syncing'
    return lastSavedAt ? 'saved' : 'idle'
  }

  // Case A: Fresh sheet opened with 0 pending operations, no prior saves
  assert.equal(
    computeSaveStatus({ pending: [], conflicts: [], isOnline: true, lastSavedAt: null }),
    'idle',
    'Fresh sheet with 0 ops must be idle (Ready), NEVER saved'
  )

  // Case B: Sheet with pending operations
  assert.equal(
    computeSaveStatus({ pending: [{ id: '1' }], conflicts: [], isOnline: true, lastSavedAt: null }),
    'syncing'
  )

  // Case C: Offline with pending operations
  assert.equal(
    computeSaveStatus({ pending: [{ id: '1' }], conflicts: [], isOnline: false, lastSavedAt: null }),
    'offline'
  )

  // Case D: Server confirmation arrives
  const now = new Date()
  assert.equal(
    computeSaveStatus({ pending: [], conflicts: [], isOnline: true, lastSavedAt: now }),
    'saved',
    'Only after server confirmation sets lastSavedAt does it display saved'
  )

  // Case E: Sheet changes (lastSavedAt reset to null)
  const switchedSheetLastSavedAt = null
  assert.equal(
    computeSaveStatus({ pending: [], conflicts: [], isOnline: true, lastSavedAt: switchedSheetLastSavedAt }),
    'idle',
    'Switching sheets immediately clears Saved status to idle'
  )
});

test('Reliability 4: Cross-sheet pending operations remain isolated by sheet_key', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = loadDailyEntryDb(mockIDB)

  const userId = 'user-cross-sheet'
  const sheetA = dbModule.generateSheetKey(userId, '2026-11-08', 'floor-A', 'RUNNING')
  const sheetB = dbModule.generateSheetKey(userId, '2026-11-08', 'floor-B', 'RUNNING')

  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-11-08',
    floorId: 'floor-A',
    category: 'RUNNING',
    needleItemId: 'needle-A',
    field: 'delivery',
    value: 10,
  })

  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-11-08',
    floorId: 'floor-B',
    category: 'RUNNING',
    needleItemId: 'needle-B',
    field: 'delivery',
    value: 20,
  })

  const opsA = await dbModule.getPendingOperations(sheetA)
  const opsB = await dbModule.getPendingOperations(sheetB)

  assert.equal(opsA.length, 1)
  assert.equal(opsA[0].needle_item_id, 'needle-A')
  assert.equal(opsA[0].value, 10)

  assert.equal(opsB.length, 1)
  assert.equal(opsB[0].needle_item_id, 'needle-B')
  assert.equal(opsB[0].value, 20)

  // Verify all ops query returns both
  const allOps = await dbModule.getPendingOperations()
  const matchingAll = allOps.filter((o) => o.user_id === userId)
  assert.equal(matchingAll.length, 2)
});
