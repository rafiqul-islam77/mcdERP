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
                  getAll: (queryKey) => {
                    const r = { result: [], onsuccess: null, onerror: null }
                    queueMicrotask(() => {
                      let all = Array.from(s.records.values())
                      if (queryKey !== undefined) {
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
                              if (Array.isArray(idxKeyPath)) {
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
            }, 10)

            return tx
          },
        }

        if (isUpgrade && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req })
        }
        if (req.onsuccess) {
          req.onsuccess()
        }
      }, 5)

      return req
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Rolling 30-Day Window Calculation
// ─────────────────────────────────────────────────────────────────────────────
test('Window Calc: Computes rolling window from Current Date - 30 days through Current Date', () => {
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts')

  // Example from task: 26-Oct-2026 -> 26-Sep-2026 through 26-Oct-2026
  const window1 = dbModule.getOfflineRollingWindow('2026-10-26')
  assert.equal(window1.windowStartDate, '2026-09-26')
  assert.equal(window1.windowEndDate, '2026-10-26')

  // Example: 15-May-2026 -> 15-Apr-2026 through 15-May-2026
  const window2 = dbModule.getOfflineRollingWindow('2026-05-15')
  assert.equal(window2.windowStartDate, '2026-04-15')
  assert.equal(window2.windowEndDate, '2026-05-15')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Cache Coverage Validation Guard (isDateWithinCoverage)
// ─────────────────────────────────────────────────────────────────────────────
test('Coverage Validation: Complete vs Incomplete vs Outside Window', () => {
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts')

  const completeCov = {
    id: 'user-1:floor-1:RUNNING',
    user_id: 'user-1',
    floor_id: 'floor-1',
    category: 'RUNNING',
    coverage_start: '2026-09-26',
    coverage_end: '2026-11-26',
    last_successful_sync_at: Date.now(),
    sync_status: 'complete',
  }

  // Inside complete window -> true
  assert.equal(dbModule.isDateWithinCoverage(completeCov, '2026-10-26'), true)
  assert.equal(dbModule.isDateWithinCoverage(completeCov, '2026-09-26'), true)
  assert.equal(dbModule.isDateWithinCoverage(completeCov, '2026-11-26'), true)

  // Before coverage start -> false (Must not guess or calculate!)
  assert.equal(dbModule.isDateWithinCoverage(completeCov, '2026-09-20'), false)

  // After coverage end -> false
  assert.equal(dbModule.isDateWithinCoverage(completeCov, '2026-12-01'), false)

  // If status is not 'complete' (syncing, failed, stale) -> false
  const syncingCov = { ...completeCov, sync_status: 'syncing' }
  assert.equal(dbModule.isDateWithinCoverage(syncingCov, '2026-10-26'), false)

  const failedCov = { ...completeCov, sync_status: 'failed' }
  assert.equal(dbModule.isDateWithinCoverage(failedCov, '2026-10-26'), false)

  const staleCov = { ...completeCov, sync_status: 'stale' }
  assert.equal(dbModule.isDateWithinCoverage(staleCov, '2026-10-26'), false)

  // Null or undefined -> false
  assert.equal(dbModule.isDateWithinCoverage(null, '2026-10-26'), false)
  assert.equal(dbModule.isDateWithinCoverage(undefined, '2026-10-26'), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Partial Cache Must NOT Be Used When Coverage Incomplete
// ─────────────────────────────────────────────────────────────────────────────
test('Offline Security: Incomplete coverage blocks stock calculation and preserves list with placeholders', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-001'
  const floorId = 'floor-prod-1'
  const category = 'RUNNING'
  const itemId = 'item-sn001'

  // Master catalog is cached (needle master available)
  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: ['RUNNING'],
    floors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    allActiveFloors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    normalItems: [
      { id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', active: true },
    ],
    idleItems: [],
    normalAssignments: [{ floor_id: floorId, needle_item_id: itemId, entry_type: 'running' }],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Simulate partial transactions existing from 2026-09-15 without complete coverage metadata
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-11-26',
    targetFloorIds: [floorId],
    categories: ['RUNNING'],
    baselines: [{ id: `${floorId}:${category}:${itemId}`, floor_id: floorId, category, needle_item_id: itemId, baseline_date: '2026-09-26', balance: 100, updated_at: Date.now() }],
    movements: [{ id: 'm-1', transaction_date: '2026-09-15', floor_id: floorId, category, needle_item_id: itemId, transaction_type: 'RECEIVE', quantity: 50, updated_at: Date.now() }],
    sheets: [],
    syncedAt: Date.now(),
  })

  // User requests 20-Sep-2026 (outside safe coverage: 26-Sep to 26-Nov)
  const resultUncovered = await dbModule.getCachedNeedleSheet({
    userId,
    date: '2026-09-20',
    floorId,
    category,
  })

  // Must block calculation from partial data!
  assert.equal(resultUncovered.status, 'coverage_incomplete')
  assert.equal(resultUncovered.coverageError, 'Connect to network to load stock data for this date.')
  // Needle list remains visible with placeholders
  assert.equal(resultUncovered.rows.length, 1)
  assert.equal(resultUncovered.rows[0].item_code, 'SN-001')
  assert.equal(resultUncovered.rows[0].is_stock_known, false)
  assert.equal(resultUncovered.rows[0].previous, 0)
  assert.equal(resultUncovered.rows[0].present, 0)

  // But user requests 26-Oct-2026 (inside complete coverage)
  const resultCovered = await dbModule.getCachedNeedleSheet({
    userId,
    date: '2026-10-26',
    floorId,
    category,
  })
  assert.equal(resultCovered.status, 'cached')
  assert.equal(resultCovered.rows[0].previous, 100)
  assert.equal(resultCovered.rows[0].present, 100)
  assert.notEqual(resultCovered.rows[0].is_stock_known, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Future Empty Date Carries Forward Without Fake Transactions
// ─────────────────────────────────────────────────────────────────────────────
test('Future Dates: Date with no entries carries forward previous balance without fake rows', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-001'
  const floorId = 'floor-1'
  const category = 'RUNNING'
  const itemId = 'item-sn001'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: ['RUNNING'],
    floors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    allActiveFloors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    normalItems: [{ id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', active: true }],
    idleItems: [],
    normalAssignments: [{ floor_id: floorId, needle_item_id: itemId, entry_type: 'running' }],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Complete coverage from 26-Sep through 26-Nov
  // Baseline on 26-Sep is 100, 26-Oct has no movements
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-11-26',
    targetFloorIds: [floorId],
    categories: ['RUNNING'],
    baselines: [{ id: `${floorId}:${category}:${itemId}`, floor_id: floorId, category, needle_item_id: itemId, baseline_date: '2026-09-26', balance: 100, updated_at: Date.now() }],
    movements: [],
    sheets: [],
    syncedAt: Date.now(),
  })

  // Select 29-Oct (future date with no entries)
  const sheet29 = await dbModule.getCachedNeedleSheet({
    userId,
    date: '2026-10-29',
    floorId,
    category,
  })

  assert.equal(sheet29.status, 'cached')
  assert.equal(sheet29.rows[0].previous, 100, 'PREV must carry forward 100')
  assert.equal(sheet29.rows[0].received, 0)
  assert.equal(sheet29.rows[0].delivery, 0)
  assert.equal(sheet29.rows[0].bnr, 0)
  assert.equal(sheet29.rows[0].present, 100, 'PRESENT must carry forward 100')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Future Offline Entry & Server Existing Future Entry
// ─────────────────────────────────────────────────────────────────────────────
test('Future Workflow: Local entry propagates, and server future entry is calculated', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-001'
  const floorId = 'floor-1'
  const category = 'RUNNING'
  const itemId = 'item-sn001'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: ['RUNNING'],
    floors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    allActiveFloors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    normalItems: [{ id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', active: true }],
    idleItems: [],
    normalAssignments: [{ floor_id: floorId, needle_item_id: itemId, entry_type: 'running' }],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Existing server future entry on 30-Oct: ISSUE (delivery) = 10
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-11-26',
    targetFloorIds: [floorId],
    categories: ['RUNNING'],
    baselines: [{ id: `${floorId}:${category}:${itemId}`, floor_id: floorId, category, needle_item_id: itemId, baseline_date: '2026-09-26', balance: 100, updated_at: Date.now() }],
    movements: [
      { id: 'm-future', transaction_date: '2026-10-30', floor_id: floorId, category, needle_item_id: itemId, transaction_type: 'ISSUE', quantity: 10, updated_at: Date.now() },
    ],
    sheets: [],
    syncedAt: Date.now(),
  })

  // User enters local offline entry on 27-Oct: RCVD = 20
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-27',
    floorId,
    category,
    needleItemId: itemId,
    field: 'received',
    value: 20,
    reqNo: 'REQ-27-01',
  })

  // 1. Check 27-Oct: PREV = 100, RCVD = 20, PRESENT = 120
  const sheet27 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-27', floorId, category })
  assert.equal(sheet27.rows[0].previous, 100)
  assert.equal(sheet27.rows[0].received, 20)
  assert.equal(sheet27.rows[0].present, 120)

  // 2. Check 28-Oct: PREV = 120, PRESENT = 120
  const sheet28 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-28', floorId, category })
  assert.equal(sheet28.rows[0].previous, 120)
  assert.equal(sheet28.rows[0].present, 120)

  // 3. Check 30-Oct (has server DVLD = 10): PREV = 120, DVLD = 10, PRESENT = 110
  const sheet30 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-30', floorId, category })
  assert.equal(sheet30.rows[0].previous, 120)
  assert.equal(sheet30.rows[0].delivery, 10)
  assert.equal(sheet30.rows[0].present, 110)
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Rolling Cache Cleanup & Pending Data Protection
// ─────────────────────────────────────────────────────────────────────────────
test('Cleanup: Safely prunes expired movements only after baseline exists, NEVER deletes pending drafts', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-001'
  const floorId = 'floor-1'
  const category = 'RUNNING'
  const itemId = 'item-sn001'

  // Suppose today is 2026-10-26 (Window: 2026-09-26 to 2026-10-26)
  // Put historical movements from 2026-09-01 (older than 30 days)
  // Put valid baseline at 2026-09-26
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: [floorId],
    categories: ['RUNNING'],
    baselines: [{ id: `${floorId}:${category}:${itemId}`, floor_id: floorId, category, needle_item_id: itemId, baseline_date: '2026-09-26', balance: 200, updated_at: Date.now() }],
    movements: [
      { id: 'm-old-safe', transaction_date: '2026-09-05', floor_id: floorId, category, needle_item_id: itemId, transaction_type: 'RECEIVE', quantity: 30, updated_at: Date.now() },
      { id: 'm-current', transaction_date: '2026-10-10', floor_id: floorId, category, needle_item_id: itemId, transaction_type: 'RECEIVE', quantity: 15, updated_at: Date.now() },
    ],
    sheets: [
      { id: `${floorId}:${category}:2026-09-05`, floor_id: floorId, category, entry_date: '2026-09-05', req_no: null, status: 'posted', updated_at: Date.now() },
      { id: `${floorId}:${category}:2026-10-10`, floor_id: floorId, category, entry_date: '2026-10-10', req_no: null, status: 'posted', updated_at: Date.now() },
    ],
    syncedAt: Date.now(),
  })

  // User has an unsynced draft on 2026-09-10 (older than 1 month, but pending!)
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-09-10',
    floorId,
    category,
    needleItemId: itemId,
    field: 'received',
    value: 5,
  })

  // Run cleanup for current date 2026-10-26
  const cleanupResult = await dbModule.cleanExpiredStockCache('2026-10-26')
  assert.equal(cleanupResult.deletedMovements, 1, 'Only safe expired movement m-old-safe should be deleted')
  assert.equal(cleanupResult.deletedHeaders, 1, 'Old header from 2026-09-05 should be deleted')

  // Verify that pending draft on 2026-09-10 was NOT deleted!
  const draftKey = dbModule.generateSheetKey(userId, '2026-09-10', floorId, category)
  const pendingDraft = await dbModule.getSheetDraft(draftKey)
  assert.notEqual(pendingDraft, null, 'Pending draft must NEVER be deleted by cleanup')
  assert.equal(pendingDraft.cells[itemId].received, 5)

  const pendingOps = await dbModule.getPendingOperations(draftKey)
  assert.equal(pendingOps.length, 1, 'Pending queue operation must be preserved')
})
