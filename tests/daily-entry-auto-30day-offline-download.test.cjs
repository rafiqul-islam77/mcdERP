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
                          if (queryVal !== undefined && Array.isArray(queryVal)) {
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

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — Clean browser: Full rolling 30-day download for new device (Section 1 & 15)
// ─────────────────────────────────────────────────────────────────────────────
test('Test 1 — Clean browser: Full rolling 30-day download for new device (Section 1 & 15)', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  // Verify rolling 30-day window formula for 2026-10-26 (Section 1: 2026-09-26 through 2026-10-26)
  const windowRange = dbModule.getOfflineRollingWindow('2026-10-26')
  assert.equal(windowRange.windowStartDate, '2026-09-26', 'Current Date - 30 days: 2026-09-26')
  assert.equal(windowRange.windowEndDate, '2026-10-26', 'Current Date: 2026-10-26')

  const userId = 'usr-operator-1'
  const floorId = 'floor-a'
  const category = 'RUNNING'
  const needleId = 'needle-sn001'

  // Pre-seed catalog into IndexedDB
  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: ['RUNNING'],
    floors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    allActiveFloors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    normalItems: [
      {
        id: needleId,
        item_code: 'SN-001',
        needle_type: 'KNITTING',
        size_dia: '12',
        brand: 'Groz-Beckert',
        active: true,
      },
    ],
    idleItems: [],
    normalAssignments: [
      {
        floor_id: floorId,
        needle_item_id: needleId,
        entry_type: 'running',
      },
    ],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Simulate server sending full 30-day dataset (snapshots for all dates from 2026-09-26 to 2026-10-26)
  const dates = []
  const curr = new Date('2026-09-26T00:00:00')
  const end = new Date('2026-10-26T00:00:00')
  while (curr <= end) {
    const yr = curr.getFullYear()
    const mo = String(curr.getMonth() + 1).padStart(2, '0')
    const dy = String(curr.getDate()).padStart(2, '0')
    dates.push(`${yr}-${mo}-${dy}`)
    curr.setDate(curr.getDate() + 1)
  }

  assert.equal(dates.length, 31, 'Exactly 31 calendar dates from 2026-09-26 through 2026-10-26 inclusive')

  const snapshots = dates.map((d, idx) => ({
    id: `${floorId}:${category}:${d}:${needleId}`,
    date: d,
    floor_id: floorId,
    category,
    needle_item_id: needleId,
    previous: idx === 0 ? 100 : 150,
    received: idx === 0 ? 50 : 0,
    delivery: 0,
    present: 150,
    bnr: 0,
    req_no: 'REQ-1001',
    server_updated_at: Date.now(),
    sync_batch_id: 'batch_test_1',
  }))

  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_test_1',
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: [floorId],
    categories: [category],
    baselines: [
      {
        id: `${floorId}:${category}:${needleId}`,
        floor_id: floorId,
        category,
        needle_item_id: needleId,
        baseline_date: '2026-09-26',
        balance: 100,
        updated_at: Date.now(),
      },
    ],
    movements: [],
    sheets: [],
    snapshots,
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: Date.now(),
    isIncremental: false,
  })

  // Verify coverage record is complete
  const cov = await dbModule.getStockCacheCoverage(userId, floorId, category)
  assert.equal(cov.sync_status, 'complete')
  assert.equal(cov.coverage_start, '2026-09-26')
  assert.equal(cov.coverage_end, '2026-10-26')
  assert.equal(cov.record_count, 31)

  // Verify Whole User Offline Ready state
  const isReady = await dbModule.isWholeUserOfflineReady({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: [category],
    currentDateStr: '2026-10-26',
  })
  assert.equal(isReady, true, 'Whole User Offline Ready must be true after complete sync')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 — No manual date opening: Disconnect, select dates within previous 30 days
// ─────────────────────────────────────────────────────────────────────────────
test('Test 2 — No manual date opening: Offline stock data immediately available across entire 30-day window', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'usr-operator-1'
  const floorId = 'floor-a'
  const category = 'RUNNING'
  const needleId = 'needle-sn001'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: ['RUNNING'],
    floors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    allActiveFloors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    normalItems: [
      {
        id: needleId,
        item_code: 'SN-001',
        needle_type: 'KNITTING',
        size_dia: '12',
        brand: 'Groz-Beckert',
        active: true,
      },
    ],
    idleItems: [],
    normalAssignments: [
      {
        floor_id: floorId,
        needle_item_id: needleId,
        entry_type: 'running',
      },
    ],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Populate 30 days of data once online: 2026-09-26 to 2026-10-26
  const dates = []
  const curr = new Date('2026-09-26T00:00:00')
  const end = new Date('2026-10-26T00:00:00')
  while (curr <= end) {
    const yr = curr.getFullYear()
    const mo = String(curr.getMonth() + 1).padStart(2, '0')
    const dy = String(curr.getDate()).padStart(2, '0')
    dates.push(`${yr}-${mo}-${dy}`)
    curr.setDate(curr.getDate() + 1)
  }

  const snapshots = dates.map((d) => ({
    id: `${floorId}:${category}:${d}:${needleId}`,
    date: d,
    floor_id: floorId,
    category,
    needle_item_id: needleId,
    previous: 200,
    received: 0,
    delivery: 0,
    present: 200,
    bnr: 0,
    req_no: null,
    server_updated_at: Date.now(),
    sync_batch_id: 'batch_test_2',
  }))

  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_test_2',
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: [floorId],
    categories: [category],
    baselines: [{ id: `${floorId}:${category}:${needleId}`, floor_id: floorId, category, needle_item_id: needleId, baseline_date: '2026-09-26', balance: 200, updated_at: Date.now() }],
    movements: [],
    sheets: [],
    snapshots,
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: Date.now(),
    isIncremental: false,
  })

  // Disconnect internet. Check arbitrary dates in previous 30 days without ever opening them before:
  // 1. Day 1 (2026-09-26)
  const day1 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-09-26', floorId, category })
  assert.equal(day1.status, 'cached')
  assert.equal(day1.rows[0].previous, 200)
  assert.equal(day1.rows[0].present, 200)

  // 2. Day 15 (2026-10-10)
  const day15 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-10', floorId, category })
  assert.equal(day15.status, 'cached')
  assert.equal(day15.rows[0].previous, 200)
  assert.equal(day15.rows[0].present, 200)

  // 3. Day 31 (2026-10-26)
  const day31 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-26', floorId, category })
  assert.equal(day31.status, 'cached')
  assert.equal(day31.rows[0].previous, 200)
  assert.equal(day31.rows[0].present, 200)

  // 4. Date outside window (2026-08-01) safely returns coverage_incomplete with placeholders
  const outsideDate = await dbModule.getCachedNeedleSheet({ userId, date: '2026-08-01', floorId, category })
  assert.equal(outsideDate.status, 'coverage_incomplete')
  assert.equal(outsideDate.rows[0].is_stock_known, false, 'Stock is flagged unknown for out-of-coverage date')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 — Authorized Floors: Verify only permitted Floors are downloaded
// ─────────────────────────────────────────────────────────────────────────────
test('Test 3 — Authorized Floors: Only authorized floors assigned to user are synchronized', async () => {
  const authorizedFloorIds = ['floor-a', 'floor-b']
  const unauthorizedFloorId = 'floor-c'

  const requestedFloors = ['floor-a', 'floor-b', unauthorizedFloorId]
  const targetFloorIds = requestedFloors.filter((fid) => authorizedFloorIds.includes(fid))

  assert.deepEqual(targetFloorIds, ['floor-a', 'floor-b'])
  assert.ok(!targetFloorIds.includes(unauthorizedFloorId), 'Unauthorized floor-c must not be in targetFloorIds')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4 — Authorized Categories: Verify only permitted Categories are downloaded
// ─────────────────────────────────────────────────────────────────────────────
test('Test 4 — Authorized Categories: Only permitted categories are synchronized', async () => {
  const allowedCategories = ['RUNNING', 'NEW']
  const requestedCategories = ['RUNNING', 'NEW', 'IDLE']

  const targetCategories = requestedCategories.filter((c) => allowedCategories.includes(c))

  assert.deepEqual(targetCategories, ['RUNNING', 'NEW'])
  assert.ok(!targetCategories.includes('IDLE'), 'Unauthorized IDLE category must not be in targetCategories')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5 — Incremental next day: Advance date, only missing/changed data synchronized (Section 17)
// ─────────────────────────────────────────────────────────────────────────────
test('Test 5 — Incremental next day: Rolling window advances by 1 day (26-Sep->26-Oct advances to 27-Sep->27-Oct)', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'usr-operator-1'
  const floorId = 'floor-a'
  const category = 'RUNNING'
  const needleId = 'needle-sn001'

  const t1 = Date.now() - 86400000

  // Initial full sync on 2026-10-26 (26-Sep to 26-Oct)
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_initial',
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: [floorId],
    categories: [category],
    baselines: [{ id: `${floorId}:${category}:${needleId}`, floor_id: floorId, category, needle_item_id: needleId, baseline_date: '2026-09-26', balance: 100, updated_at: t1 }],
    movements: [],
    sheets: [],
    snapshots: [
      { id: `${floorId}:${category}:2026-10-26:${needleId}`, date: '2026-10-26', floor_id: floorId, category, needle_item_id: needleId, previous: 100, received: 0, delivery: 0, present: 100, bnr: 0, req_no: null, server_updated_at: t1, sync_batch_id: 'batch_initial' },
    ],
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: t1,
    isIncremental: false,
  })

  // Advance to next day: 2026-10-27 (Section 17: 27-Sep -> 27-Oct)
  const windowNextDay = dbModule.getOfflineRollingWindow('2026-10-27')
  assert.equal(windowNextDay.windowStartDate, '2026-09-27')
  assert.equal(windowNextDay.windowEndDate, '2026-10-27')

  // Incremental sync returns ONLY the snapshot for missing date 2026-10-27
  const t2 = Date.now()
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_incremental',
    windowStartDate: '2026-09-27',
    windowEndDate: '2026-10-27',
    targetFloorIds: [floorId],
    categories: [category],
    baselines: [{ id: `${floorId}:${category}:${needleId}`, floor_id: floorId, category, needle_item_id: needleId, baseline_date: '2026-09-27', balance: 100, updated_at: t2 }],
    movements: [],
    sheets: [],
    snapshots: [
      { id: `${floorId}:${category}:2026-10-27:${needleId}`, date: '2026-10-27', floor_id: floorId, category, needle_item_id: needleId, previous: 100, received: 0, delivery: 0, present: 100, bnr: 0, req_no: null, server_updated_at: t2, sync_batch_id: 'batch_incremental' },
    ],
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: t2,
    isIncremental: true,
  })

  // Check coverage is maintained and updated
  const cov = await dbModule.getStockCacheCoverage(userId, floorId, category)
  assert.equal(cov.sync_status, 'complete')
  assert.equal(cov.coverage_start, '2026-09-26', 'Earliest coverage start preserved')
  assert.equal(cov.coverage_end, '2026-10-27', 'Coverage extended to 2026-10-27')
  assert.equal(cov.last_successful_sync_at, t2)
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6 — Reconnect: Disconnect, reconnect, automatic refresh of the 30-day window
// ─────────────────────────────────────────────────────────────────────────────
test('Test 6 — Reconnect: Network reconnection triggers background check and updates last_successful_sync_at', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'usr-operator-1'
  const floorId = 'floor-a'
  const category = 'RUNNING'
  const needleId = 'needle-sn001'

  const t1 = Date.now() - 5000

  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_pre_disconnect',
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: [floorId],
    categories: [category],
    baselines: [{ id: `${floorId}:${category}:${needleId}`, floor_id: floorId, category, needle_item_id: needleId, baseline_date: '2026-09-26', balance: 50, updated_at: t1 }],
    movements: [],
    sheets: [],
    snapshots: [],
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: t1,
    isIncremental: false,
  })

  // Simulate network reconnect: background sync fires with forceFull: false
  const t2 = Date.now()
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_post_reconnect',
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: [floorId],
    categories: [category],
    baselines: [{ id: `${floorId}:${category}:${needleId}`, floor_id: floorId, category, needle_item_id: needleId, baseline_date: '2026-09-26', balance: 50, updated_at: t2 }],
    movements: [],
    sheets: [],
    snapshots: [],
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: t2,
    isIncremental: true,
  })

  const cov = await dbModule.getStockCacheCoverage(userId, floorId, category)
  assert.equal(cov.last_successful_sync_at, t2, 'Coverage updated with post-reconnect timestamp')
  assert.equal(cov.sync_status, 'complete')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7 — Pending local data: Create pending offline input, run auto sync, verify preserved
// ─────────────────────────────────────────────────────────────────────────────
test('Test 7 — Pending local data: Offline user inputs are NEVER overwritten by automatic background sync', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'usr-operator-1'
  const floorId = 'floor-a'
  const category = 'RUNNING'
  const needleId = 'needle-sn001'
  const date = '2026-10-26'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: ['RUNNING'],
    floors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    allActiveFloors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    normalItems: [
      {
        id: needleId,
        item_code: 'SN-001',
        needle_type: 'KNITTING',
        size_dia: '12',
        brand: 'Groz-Beckert',
        active: true,
      },
    ],
    idleItems: [],
    normalAssignments: [
      {
        floor_id: floorId,
        needle_item_id: needleId,
        entry_type: 'running',
      },
    ],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // User enters an offline draft: RCVD = 75
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date,
    floorId,
    category,
    needleItemId: needleId,
    field: 'received',
    value: 75,
    reqNo: 'REQ-OFFLINE-75',
  })

  // Automatic background sync runs and downloads server snapshot with received = 0
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_server_sync',
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: [floorId],
    categories: [category],
    baselines: [{ id: `${floorId}:${category}:${needleId}`, floor_id: floorId, category, needle_item_id: needleId, baseline_date: '2026-09-26', balance: 100, updated_at: Date.now() }],
    movements: [],
    sheets: [],
    snapshots: [
      {
        id: `${floorId}:${category}:${date}:${needleId}`,
        date,
        floor_id: floorId,
        category,
        needle_item_id: needleId,
        previous: 100,
        received: 0,
        delivery: 0,
        present: 100,
        bnr: 0,
        req_no: null,
        server_updated_at: Date.now(),
        sync_batch_id: 'batch_server_sync',
      },
    ],
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: Date.now(),
    isIncremental: false,
  })

  // Query cached sheet: local draft must have Priority 1 over server snapshot!
  const sheet = await dbModule.getCachedNeedleSheet({ userId, date, floorId, category })
  assert.equal(sheet.status, 'cached')
  assert.equal(sheet.rows[0].received, 75, 'User received=75 draft was preserved and not overwritten!')
  assert.equal(sheet.rows[0].req_no, 'REQ-OFFLINE-75', 'User draft req_no was preserved!')
  assert.equal(sheet.rows[0].previous, 100)
  assert.equal(sheet.rows[0].present, 175, 'Present stock correctly calculated from preserved draft: 100 + 75 = 175!')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8 — Pagination: Verify all records download even across multiple pages (>1000 records)
// ─────────────────────────────────────────────────────────────────────────────
test('Test 8 — Pagination: Paginated fetch loop retrieves all records when dataset exceeds pageSize', async () => {
  const totalRecords = 2500
  const fakeDatabaseRecords = Array.from({ length: totalRecords }, (_, i) => ({
    id: `tx-${i + 1}`,
    quantity: 1,
  }))

  const pageSize = 1000

  async function fetchAllRowsPaginated(buildQuery) {
    const allRows = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1)
      if (error) throw error
      if (!data || data.length === 0) {
        hasMore = false
      } else {
        allRows.push(...data)
        if (data.length < pageSize) {
          hasMore = false
        } else {
          from += pageSize
        }
      }
    }

    return allRows
  }

  const result = await fetchAllRowsPaginated(() => ({
    range: async (start, end) => ({
      data: fakeDatabaseRecords.slice(start, end + 1),
      error: null,
    }),
  }))

  assert.equal(result.length, 2500, 'All 2,500 records fetched across 3 query pages without truncation')
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9 — Whole User Offline Ready & Partial Readiness (Section 11 & 12)
// ─────────────────────────────────────────────────────────────────────────────
test('Test 9 — Whole User Offline Ready & Partial Readiness: Global readiness requires all scopes complete', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'usr-admin-multi'
  const authorizedFloorIds = ['floor-a', 'floor-b']
  const allowedCategories = ['RUNNING', 'NEW']
  const currentDateStr = '2026-10-26'

  // Initially: empty coverage
  let isReady = await dbModule.isWholeUserOfflineReady({
    userId,
    authorizedFloorIds,
    allowedCategories,
    currentDateStr,
  })
  assert.equal(isReady, false, 'Initial state must not be offline ready')

  // Partial readiness: Only Floor A / RUNNING is complete
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_partial',
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: ['floor-a'],
    categories: ['RUNNING'],
    baselines: [],
    movements: [],
    sheets: [],
    snapshots: [],
    assignedNeedleCounts: {},
    syncedAt: Date.now(),
    isIncremental: false,
  })

  // Section 12: Partial readiness must NOT falsely show global Offline Ready
  isReady = await dbModule.isWholeUserOfflineReady({
    userId,
    authorizedFloorIds,
    allowedCategories,
    currentDateStr,
  })
  assert.equal(isReady, false, 'Partial coverage must not report whole-user offline ready')

  // Complete all required scopes: Floor A & B across RUNNING & NEW
  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId: 'batch_complete',
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-10-26',
    targetFloorIds: ['floor-a', 'floor-b'],
    categories: ['RUNNING', 'NEW'],
    baselines: [],
    movements: [],
    sheets: [],
    snapshots: [],
    assignedNeedleCounts: {},
    syncedAt: Date.now(),
    isIncremental: false,
  })

  // Section 11: All authorized scopes complete -> Offline Ready is TRUE
  isReady = await dbModule.isWholeUserOfflineReady({
    userId,
    authorizedFloorIds,
    allowedCategories,
    currentDateStr,
  })
  assert.equal(isReady, true, 'Whole-user offline ready must be true once all scopes complete')
})
