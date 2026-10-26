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

// In-Memory IndexedDB Mock supporting single and composite index lookups
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
// TEST SUITE: OFFLINE PREVIOUS / PRESENT FORWARD CALCULATION & REQUISITION SYNC
// ─────────────────────────────────────────────────────────────────────────────

test('Task Test 1 (Screenshot Scenario): 18-Oct closing balance 230 carries forward into 19-Oct PREV=230 offline', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-floor-mgr-1'
  const floorId = 'floor-prod-1'
  const category = 'RUNNING'
  const itemId = 'item-sn001'

  // Master catalog
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

  // Set up complete stock cache coverage for this test
  if (typeof floorId2 !== 'undefined') {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
      { id: `${userId}:${floorId2}:${category}`, user_id: userId, floor_id: floorId2, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  } else {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  }

  // Pre-existing snapshot for 18-Oct with PREV = 210
  await dbModule.saveSheetSnapshotToCache({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    rows: [
      { needle_item_id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', previous: 210, received: 0, delivery: 0, present: 210, bnr: 0, req_no: null, transfer_in: 0, transfer_out: 0, last_transfer_note: null },
    ],
    requisitionNo: null,
  })

  // User enters 18-Oct RCVD = 20 offline
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    needleItemId: itemId,
    field: 'received',
    value: 20,
    reqNo: 'REQ-18-001',
  })

  // 18-Oct sheet check
  const sheet18 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-18', floorId, category })
  assert.equal(sheet18.rows[0].previous, 210)
  assert.equal(sheet18.rows[0].received, 20)
  assert.equal(sheet18.rows[0].present, 230)

  // Switch to 19-Oct offline:
  // Must show PREV = 230, RCVD = 0, DVLD = 0, PRESENT = 230
  const sheet19 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-19', floorId, category })
  assert.equal(sheet19.rows[0].previous, 230, '19-Oct PREV must carry forward 18-Oct closing balance of 230')
  assert.equal(sheet19.rows[0].received, 0, '19-Oct received must be 0')
  assert.equal(sheet19.rows[0].delivery, 0, '19-Oct delivery must be 0')
  assert.equal(sheet19.rows[0].present, 230, '19-Oct PRESENT must be 230')
})

test('Task Test 2: Multiple Dates Chronological Chain (18-Oct to 23-Oct)', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-floor-mgr-1'
  const floorId = 'floor-prod-1'
  const category = 'RUNNING'
  const itemId = 'item-sn001'

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

  // Set up complete stock cache coverage for this test
  if (typeof floorId2 !== 'undefined') {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
      { id: `${userId}:${floorId2}:${category}`, user_id: userId, floor_id: floorId2, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  } else {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  }

  // Starting anchor: 18-Oct baseline/snapshot balance = 210
  await dbModule.saveSheetSnapshotToCache({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    rows: [
      { needle_item_id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', previous: 210, received: 0, delivery: 0, present: 210, bnr: 0, req_no: null, transfer_in: 0, transfer_out: 0, last_transfer_note: null },
    ],
    requisitionNo: null,
  })

  // 18-Oct Receive 20
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    needleItemId: itemId,
    field: 'received',
    value: 20,
  })

  // 20-Oct Receive 10
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-20',
    floorId,
    category,
    needleItemId: itemId,
    field: 'received',
    value: 10,
  })

  // 22-Oct Delivery 5
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-22',
    floorId,
    category,
    needleItemId: itemId,
    field: 'delivery',
    value: 5,
  })

  // Verify full chronological chain across all dates:
  // 19-Oct: carries 18-Oct closing (210 + 20 = 230)
  const d19 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-19', floorId, category })
  assert.equal(d19.rows[0].previous, 230)
  assert.equal(d19.rows[0].present, 230)

  // 20-Oct: PREV 230, RCVD 10, PRESENT 240
  const d20 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-20', floorId, category })
  assert.equal(d20.rows[0].previous, 230)
  assert.equal(d20.rows[0].received, 10)
  assert.equal(d20.rows[0].present, 240)

  // 21-Oct: carries 20-Oct closing (240)
  const d21 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-21', floorId, category })
  assert.equal(d21.rows[0].previous, 240)
  assert.equal(d21.rows[0].present, 240)

  // 22-Oct: PREV 240, DVLD 5, PRESENT 235
  const d22 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-22', floorId, category })
  assert.equal(d22.rows[0].previous, 240)
  assert.equal(d22.rows[0].delivery, 5)
  assert.equal(d22.rows[0].present, 235)

  // 23-Oct: carries 22-Oct closing (235)
  const d23 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-23', floorId, category })
  assert.equal(d23.rows[0].previous, 235)
  assert.equal(d23.rows[0].present, 235)
})

test('Task Test 3: Historical Edit Propagation (Change 18-Oct Receive 20 -> 30)', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-floor-mgr-1'
  const floorId = 'floor-prod-1'
  const category = 'RUNNING'
  const itemId = 'item-sn001'

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

  // Set up complete stock cache coverage for this test
  if (typeof floorId2 !== 'undefined') {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
      { id: `${userId}:${floorId2}:${category}`, user_id: userId, floor_id: floorId2, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  } else {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  }

  await dbModule.saveSheetSnapshotToCache({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    rows: [
      { needle_item_id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', previous: 210, received: 0, delivery: 0, present: 210, bnr: 0, req_no: null, transfer_in: 0, transfer_out: 0, last_transfer_note: null },
    ],
    requisitionNo: null,
  })

  // User initially enters 20 on 18-Oct
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    needleItemId: itemId,
    field: 'received',
    value: 20,
  })

  // User later changes 18-Oct to 30
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    needleItemId: itemId,
    field: 'received',
    value: 30,
  })

  // 18-Oct Present should be 210 + 30 = 240
  const d18 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-18', floorId, category })
  assert.equal(d18.rows[0].present, 240)

  // 19-Oct PREV should automatically be 240
  const d19 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-19', floorId, category })
  assert.equal(d19.rows[0].previous, 240)
  assert.equal(d19.rows[0].present, 240)
})

test('Task Test 4: Multiple Needles Independence across dates', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-floor-mgr-1'
  const floorId = 'floor-prod-1'
  const category = 'RUNNING'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: ['RUNNING'],
    floors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    allActiveFloors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    normalItems: [
      { id: 'item-1', item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', active: true },
      { id: 'item-2', item_code: 'SN-002', needle_type: 'GROZ', size_dia: '16', brand: 'GROZ', active: true },
      { id: 'item-3', item_code: 'SN-003', needle_type: 'SCHMETZ', size_dia: '18', brand: 'SCHMETZ', active: true },
    ],
    idleItems: [],
    normalAssignments: [
      { floor_id: floorId, needle_item_id: 'item-1', entry_type: 'running' },
      { floor_id: floorId, needle_item_id: 'item-2', entry_type: 'running' },
      { floor_id: floorId, needle_item_id: 'item-3', entry_type: 'running' },
    ],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Set up complete stock cache coverage for this test
  if (typeof floorId2 !== 'undefined') {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
      { id: `${userId}:${floorId2}:${category}`, user_id: userId, floor_id: floorId2, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  } else {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  }

  // 18-Oct snapshot:
  // SN-001 PREV=100
  // SN-002 PREV=200
  // SN-003 PREV=50
  await dbModule.saveSheetSnapshotToCache({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    rows: [
      { needle_item_id: 'item-1', item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', previous: 100, received: 0, delivery: 0, present: 100, bnr: 0, req_no: null, transfer_in: 0, transfer_out: 0, last_transfer_note: null },
      { needle_item_id: 'item-2', item_code: 'SN-002', needle_type: 'GROZ', size_dia: '16', brand: 'GROZ', previous: 200, received: 0, delivery: 0, present: 200, bnr: 0, req_no: null, transfer_in: 0, transfer_out: 0, last_transfer_note: null },
      { needle_item_id: 'item-3', item_code: 'SN-003', needle_type: 'SCHMETZ', size_dia: '18', brand: 'SCHMETZ', previous: 50, received: 0, delivery: 0, present: 50, bnr: 0, req_no: null, transfer_in: 0, transfer_out: 0, last_transfer_note: null },
    ],
    requisitionNo: null,
  })

  // 18-Oct:
  // SN-001 RCVD = 20 -> PRESENT = 120
  // SN-002 RCVD = 40 -> PRESENT = 240
  // SN-003 DVLD = 5  -> PRESENT = 45
  await dbModule.saveCellDraftAndEnqueueOp({ userId, date: '2026-10-18', floorId, category, needleItemId: 'item-1', field: 'received', value: 20 })
  await dbModule.saveCellDraftAndEnqueueOp({ userId, date: '2026-10-18', floorId, category, needleItemId: 'item-2', field: 'received', value: 40 })
  await dbModule.saveCellDraftAndEnqueueOp({ userId, date: '2026-10-18', floorId, category, needleItemId: 'item-3', field: 'delivery', value: 5 })

  // Switch to 19-Oct: verify each needle independently carries closing balance
  const d19 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-19', floorId, category })
  const r1 = d19.rows.find((r) => r.needle_item_id === 'item-1')
  const r2 = d19.rows.find((r) => r.needle_item_id === 'item-2')
  const r3 = d19.rows.find((r) => r.needle_item_id === 'item-3')

  assert.equal(r1.previous, 120, 'SN-001 19-Oct PREV must be 120')
  assert.equal(r1.present, 120, 'SN-001 19-Oct PRESENT must be 120')

  assert.equal(r2.previous, 240, 'SN-002 19-Oct PREV must be 240')
  assert.equal(r2.present, 240, 'SN-002 19-Oct PRESENT must be 240')

  assert.equal(r3.previous, 45, 'SN-003 19-Oct PREV must be 45')
  assert.equal(r3.present, 45, 'SN-003 19-Oct PRESENT must be 45')
})

test('Task Test 5: Requisition Number Workflow (1st receive prompts, subsequent receives reuse same req_no)', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-floor-mgr-1'
  const floorId = 'floor-prod-1'
  const category = 'RUNNING'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: ['RUNNING'],
    floors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    allActiveFloors: [{ id: floorId, name: 'Floor 1', code: 'F1' }],
    normalItems: [
      { id: 'item-1', item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', active: true },
      { id: 'item-2', item_code: 'SN-002', needle_type: 'GROZ', size_dia: '16', brand: 'GROZ', active: true },
    ],
    idleItems: [],
    normalAssignments: [
      { floor_id: floorId, needle_item_id: 'item-1', entry_type: 'running' },
      { floor_id: floorId, needle_item_id: 'item-2', entry_type: 'running' },
    ],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Set up complete stock cache coverage for this test
  if (typeof floorId2 !== 'undefined') {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
      { id: `${userId}:${floorId2}:${category}`, user_id: userId, floor_id: floorId2, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  } else {
    await dbModule.saveStockCacheCoverage([
      { id: `${userId}:${floorId}:${category}`, user_id: userId, floor_id: floorId, category, coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' }
    ])
  }

  // 1st receive of the floor: user enters req_no = 'REQ-2026-FLOOR1'
  const enteredReqNo = 'REQ-2026-FLOOR1'
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    needleItemId: 'item-1',
    field: 'received',
    value: 50,
    reqNo: enteredReqNo,
  })

  // 2nd receive on same floor and day: inherits the same requisition number
  await dbModule.saveCellDraftAndEnqueueOp({
    userId,
    date: '2026-10-18',
    floorId,
    category,
    needleItemId: 'item-2',
    field: 'received',
    value: 30,
    reqNo: enteredReqNo,
  })

  const sheet = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-18', floorId, category })
  assert.equal(sheet.requisitionNo, enteredReqNo)
  assert.equal(sheet.rows[0].req_no, enteredReqNo)
  assert.equal(sheet.rows[1].req_no, enteredReqNo)
})

test('Task Test 6: Floor and Category Isolation', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'user-floor-mgr-1'
  const floorA = 'floor-A'
  const floorB = 'floor-B'
  const itemId = 'item-1'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorA, floorB],
    allowedCategories: ['RUNNING', 'NEW'],
    floors: [
      { id: floorA, name: 'Floor A', code: 'FA' },
      { id: floorB, name: 'Floor B', code: 'FB' },
    ],
    allActiveFloors: [
      { id: floorA, name: 'Floor A', code: 'FA' },
      { id: floorB, name: 'Floor B', code: 'FB' },
    ],
    normalItems: [
      { id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', active: true },
    ],
    idleItems: [],
    normalAssignments: [
      { floor_id: floorA, needle_item_id: itemId, entry_type: 'running' },
      { floor_id: floorB, needle_item_id: itemId, entry_type: 'running' },
    ],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Set up complete stock cache coverage for Floor A and Floor B
  await dbModule.saveStockCacheCoverage([
    { id: `${userId}:${floorA}:RUNNING`, user_id: userId, floor_id: floorA, category: 'RUNNING', coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
    { id: `${userId}:${floorB}:RUNNING`, user_id: userId, floor_id: floorB, category: 'RUNNING', coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
    { id: `${userId}:${floorA}:NEW`, user_id: userId, floor_id: floorA, category: 'NEW', coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
    { id: `${userId}:${floorB}:NEW`, user_id: userId, floor_id: floorB, category: 'NEW', coverage_start: '2026-09-01', coverage_end: '2026-11-30', last_successful_sync_at: Date.now(), sync_status: 'complete' },
  ])

  // Floor A has baseline 100
  // Floor B has baseline 500
  await dbModule.saveSheetSnapshotToCache({
    userId,
    date: '2026-10-18',
    floorId: floorA,
    category: 'RUNNING',
    rows: [{ needle_item_id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', previous: 100, received: 0, delivery: 0, present: 100, bnr: 0, req_no: null, transfer_in: 0, transfer_out: 0, last_transfer_note: null }],
    requisitionNo: null,
  })
  await dbModule.saveSheetSnapshotToCache({
    userId,
    date: '2026-10-18',
    floorId: floorB,
    category: 'RUNNING',
    rows: [{ needle_item_id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', previous: 500, received: 0, delivery: 0, present: 500, bnr: 0, req_no: null, transfer_in: 0, transfer_out: 0, last_transfer_note: null }],
    requisitionNo: null,
  })

  // User enters RCVD = 50 on Floor A
  await dbModule.saveCellDraftAndEnqueueOp({ userId, date: '2026-10-18', floorId: floorA, category: 'RUNNING', needleItemId: itemId, field: 'received', value: 50 })

  // 19-Oct on Floor A should be 150
  const d19A = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-19', floorId: floorA, category: 'RUNNING' })
  assert.equal(d19A.rows[0].previous, 150)
  assert.equal(d19A.rows[0].present, 150)

  // 19-Oct on Floor B must remain untouched at 500
  const d19B = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-19', floorId: floorB, category: 'RUNNING' })
  assert.equal(d19B.rows[0].previous, 500)
  assert.equal(d19B.rows[0].present, 500)
})