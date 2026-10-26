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
          req.onupgradeneeded({ target: req, oldVersion: 0, newVersion: version })
        }
        if (req.onsuccess) {
          req.onsuccess()
        }
      }, 5)

      return req
    },
  }
}

test('Parity Test 1: Exact 26-Sep / A Floor / RUNNING regression test with all rows', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'usr-admin-1'
  const floorId = 'floor-a'
  const category = 'RUNNING'

  const needles = [
    { id: 'n1', item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN' },
    { id: 'n2', item_code: 'SN-002', needle_type: 'GROZ', size_dia: '16', brand: 'GROZ-BECKERT' },
    { id: 'n3', item_code: 'SN-003', needle_type: 'DOTEC', size_dia: '11', brand: 'DOTEC' },
    { id: 'n4', item_code: 'SN-004', needle_type: 'SCHMETZ', size_dia: '18', brand: 'SCHMETZ' },
  ]

  // Master catalog
  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: [category],
    floors: [{ id: floorId, name: 'A Floor', code: 'A' }],
    allActiveFloors: [{ id: floorId, name: 'A Floor', code: 'A' }],
    normalItems: needles.map((n) => ({ ...n, active: true })),
    idleItems: [],
    normalAssignments: needles.map((n) => ({ floor_id: floorId, needle_item_id: n.id, entry_type: 'running' })),
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  // Synchronize 1-month offline stock window (26-Sep-2026 to 26-Nov-2026)
  // On 26-Sep-2026, all needles have 0 stock.
  // On 26-Oct-2026, needles have accumulated 250 stock.
  const syncBatchId = 'batch_20261026_test'
  const snapshots = []

  // 26-Sep snapshots: PREV = 0, PRESENT = 0
  for (const n of needles) {
    snapshots.push({
      id: `${floorId}:${category}:2026-09-26:${n.id}`,
      date: '2026-09-26',
      floor_id: floorId,
      category,
      needle_item_id: n.id,
      previous: 0,
      received: 0,
      delivery: 0,
      transfer_in: 0,
      transfer_out: 0,
      adjustment_in: 0,
      adjustment_out: 0,
      present: 0,
      bnr: 0,
      req_no: null,
      last_transfer_note: null,
      server_updated_at: Date.now(),
      sync_batch_id: syncBatchId,
    })
  }

  // 26-Oct snapshots: PREV = 250, PRESENT = 250
  for (const n of needles) {
    snapshots.push({
      id: `${floorId}:${category}:2026-10-26:${n.id}`,
      date: '2026-10-26',
      floor_id: floorId,
      category,
      needle_item_id: n.id,
      previous: 250,
      received: 0,
      delivery: 0,
      transfer_in: 0,
      transfer_out: 0,
      adjustment_in: 0,
      adjustment_out: 0,
      present: 250,
      bnr: 0,
      req_no: null,
      last_transfer_note: null,
      server_updated_at: Date.now(),
      sync_batch_id: syncBatchId,
    })
  }

  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId,
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-11-26',
    targetFloorIds: [floorId],
    categories: [category],
    snapshots,
    baselines: needles.map((n) => ({
      id: `${floorId}:${category}:${n.id}`,
      floor_id: floorId,
      category,
      needle_item_id: n.id,
      baseline_date: '2026-09-26',
      balance: 0,
      updated_at: Date.now(),
    })),
    movements: [],
    sheets: [],
    assignedNeedleCounts: { [`${floorId}:${category}`]: needles.length },
    syncedAt: Date.now(),
  })

  // Test 26-Sep-2026 OFFLINE
  const sheetSep26 = await dbModule.getCachedNeedleSheet({
    userId,
    date: '2026-09-26',
    floorId,
    category,
  })

  assert.equal(sheetSep26.status, 'cached')
  assert.equal(sheetSep26.rows.length, needles.length, 'Every needle must be present in the sheet')

  for (let i = 0; i < needles.length; i++) {
    const row = sheetSep26.rows[i]
    assert.equal(row.item_code, needles[i].item_code)
    assert.equal(row.previous, 0, `${row.item_code} on 26-Sep must have PREV = 0 (never 250!)`)
    assert.equal(row.received, 0, `${row.item_code} on 26-Sep must have RCVD = 0`)
    assert.equal(row.delivery, 0, `${row.item_code} on 26-Sep must have DVLD = 0`)
    assert.equal(row.present, 0, `${row.item_code} on 26-Sep must have PRESENT = 0 (never 250!)`)
    assert.equal(row.is_stock_known, true)
  }

  // Test 26-Oct-2026 OFFLINE
  const sheetOct26 = await dbModule.getCachedNeedleSheet({
    userId,
    date: '2026-10-26',
    floorId,
    category,
  })

  assert.equal(sheetOct26.status, 'cached')
  for (let i = 0; i < needles.length; i++) {
    const row = sheetOct26.rows[i]
    assert.equal(row.previous, 250, `${row.item_code} on 26-Oct must have PREV = 250`)
    assert.equal(row.present, 250, `${row.item_code} on 26-Oct must have PRESENT = 250`)
  }
})

test('Parity Test 2: Stock Introduction Later in Time (Section 27)', async () => {
  // 26-Sep = 0
  // 01-Oct = 100 received
  // 05-Oct = 100 present
  // Verify 26-Sep remains 0 offline and does not get polluted backwards
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'usr-admin-1'
  const floorId = 'floor-b'
  const category = 'RUNNING'
  const itemId = 'item-sn001'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: [category],
    floors: [{ id: floorId, name: 'B Floor', code: 'B' }],
    allActiveFloors: [{ id: floorId, name: 'B Floor', code: 'B' }],
    normalItems: [{ id: itemId, item_code: 'SN-001', needle_type: 'ORGAN', size_dia: '14', brand: 'ORGAN', active: true }],
    idleItems: [],
    normalAssignments: [{ floor_id: floorId, needle_item_id: itemId, entry_type: 'running' }],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  const syncBatchId = 'batch_timeline'
  const snapshots = [
    {
      id: `${floorId}:${category}:2026-09-26:${itemId}`,
      date: '2026-09-26',
      floor_id: floorId,
      category,
      needle_item_id: itemId,
      previous: 0,
      received: 0,
      delivery: 0,
      transfer_in: 0,
      transfer_out: 0,
      adjustment_in: 0,
      adjustment_out: 0,
      present: 0,
      bnr: 0,
      req_no: null,
      last_transfer_note: null,
      server_updated_at: Date.now(),
      sync_batch_id: syncBatchId,
    },
    {
      id: `${floorId}:${category}:2026-10-01:${itemId}`,
      date: '2026-10-01',
      floor_id: floorId,
      category,
      needle_item_id: itemId,
      previous: 0,
      received: 100,
      delivery: 0,
      transfer_in: 0,
      transfer_out: 0,
      adjustment_in: 0,
      adjustment_out: 0,
      present: 100,
      bnr: 0,
      req_no: 'REQ-OCT-01',
      last_transfer_note: null,
      server_updated_at: Date.now(),
      sync_batch_id: syncBatchId,
    },
    {
      id: `${floorId}:${category}:2026-10-05:${itemId}`,
      date: '2026-10-05',
      floor_id: floorId,
      category,
      needle_item_id: itemId,
      previous: 100,
      received: 0,
      delivery: 0,
      transfer_in: 0,
      transfer_out: 0,
      adjustment_in: 0,
      adjustment_out: 0,
      present: 100,
      bnr: 0,
      req_no: null,
      last_transfer_note: null,
      server_updated_at: Date.now(),
      sync_batch_id: syncBatchId,
    },
  ]

  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId,
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-11-26',
    targetFloorIds: [floorId],
    categories: [category],
    snapshots,
    baselines: [{
      id: `${floorId}:${category}:${itemId}`,
      floor_id: floorId,
      category,
      needle_item_id: itemId,
      baseline_date: '2026-09-26',
      balance: 0,
      updated_at: Date.now(),
    }],
    movements: [],
    sheets: [],
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: Date.now(),
  })

  // 1. Verify 26-Sep = 0
  const sep26 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-09-26', floorId, category })
  assert.equal(sep26.rows[0].previous, 0)
  assert.equal(sep26.rows[0].present, 0)

  // 2. Verify 01-Oct = PREV 0, RCVD 100, PRESENT 100
  const oct01 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-01', floorId, category })
  assert.equal(oct01.rows[0].previous, 0)
  assert.equal(oct01.rows[0].received, 100)
  assert.equal(oct01.rows[0].present, 100)

  // 3. Verify 05-Oct = PREV 100, PRESENT 100
  const oct05 = await dbModule.getCachedNeedleSheet({ userId, date: '2026-10-05', floorId, category })
  assert.equal(oct05.rows[0].previous, 100)
  assert.equal(oct05.rows[0].present, 100)

  // 4. Double check 26-Sep again: must remain 0!
  const sep26Again = await dbModule.getCachedNeedleSheet({ userId, date: '2026-09-26', floorId, category })
  assert.equal(sep26Again.rows[0].previous, 0)
  assert.equal(sep26Again.rows[0].present, 0)
})

test('Parity Test 3: Multiple Historical Dates Parity (Section 25)', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const userId = 'usr-op-1'
  const floorId = 'floor-c'
  const category = 'NEW'
  const itemId = 'item-sn002'

  await dbModule.saveAuthorizedMasterCatalogToCache({
    userId,
    authorizedFloorIds: [floorId],
    allowedCategories: [category],
    floors: [{ id: floorId, name: 'C Floor', code: 'C' }],
    allActiveFloors: [{ id: floorId, name: 'C Floor', code: 'C' }],
    normalItems: [{ id: itemId, item_code: 'SN-002', needle_type: 'GROZ', size_dia: '16', brand: 'GROZ-BECKERT', active: true }],
    idleItems: [],
    normalAssignments: [{ floor_id: floorId, needle_item_id: itemId, entry_type: 'new' }],
    idleAssignments: [],
    cachedAt: Date.now(),
  })

  const testDates = [
    { date: '2026-09-26', prev: 50, rcvd: 0, dvld: 0, pres: 50 },
    { date: '2026-10-10', prev: 50, rcvd: 30, dvld: 10, pres: 70 },
    { date: '2026-10-25', prev: 70, rcvd: 0, dvld: 20, pres: 50 },
    { date: '2026-10-26', prev: 50, rcvd: 0, dvld: 0, pres: 50 },
  ]

  const syncBatchId = 'batch_dates'
  const snapshots = testDates.map((td) => ({
    id: `${floorId}:${category}:${td.date}:${itemId}`,
    date: td.date,
    floor_id: floorId,
    category,
    needle_item_id: itemId,
    previous: td.prev,
    received: td.rcvd,
    delivery: td.dvld,
    transfer_in: 0,
    transfer_out: 0,
    adjustment_in: 0,
    adjustment_out: 0,
    present: td.pres,
    bnr: 0,
    req_no: null,
    last_transfer_note: null,
    server_updated_at: Date.now(),
    sync_batch_id: syncBatchId,
  }))

  await dbModule.saveOfflineStockHistoryToCache({
    userId,
    syncBatchId,
    windowStartDate: '2026-09-26',
    windowEndDate: '2026-11-26',
    targetFloorIds: [floorId],
    categories: [category],
    snapshots,
    baselines: [{
      id: `${floorId}:${category}:${itemId}`,
      floor_id: floorId,
      category,
      needle_item_id: itemId,
      baseline_date: '2026-09-26',
      balance: 50,
      updated_at: Date.now(),
    }],
    movements: [],
    sheets: [],
    assignedNeedleCounts: { [`${floorId}:${category}`]: 1 },
    syncedAt: Date.now(),
  })

  // Check each date offline
  for (const td of testDates) {
    const sheet = await dbModule.getCachedNeedleSheet({ userId, date: td.date, floorId, category })
    assert.equal(sheet.rows[0].previous, td.prev, `Date ${td.date} previous mismatch`)
    assert.equal(sheet.rows[0].received, td.rcvd, `Date ${td.date} received mismatch`)
    assert.equal(sheet.rows[0].delivery, td.dvld, `Date ${td.date} delivery mismatch`)
    assert.equal(sheet.rows[0].present, td.pres, `Date ${td.date} present mismatch`)
  }
})
