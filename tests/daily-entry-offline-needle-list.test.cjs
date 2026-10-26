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
async function ensureCoverage(dbModule, userId, floorId, categories) {
  const records = categories.map((cat) => ({
    id: `${userId}:${floorId}:${cat}`,
    user_id: userId,
    floor_id: floorId,
    category: cat,
    coverage_start: '2026-09-01',
    coverage_end: '2026-11-30',
    last_successful_sync_at: Date.now(),
    sync_status: 'complete',
  }))
  await dbModule.saveStockCacheCoverage(records)
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
            const names = Array.isArray(storeNames) ? storeNames : [storeNames]
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
            }, 30)

            return tx
          },
        }

        if (isUpgrade && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req, oldVersion: 0, newVersion: version })
        }
        req.onsuccess && req.onsuccess()
      }, 0)

      return req
    },
  }
}

function setupServerMock({
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
    { id: 'norm-1', item_code: 'SN-001', needle_type: 'DB X 1', size_dia: '9', brand: 'ORGAN', active: true },
    { id: 'norm-2', item_code: 'SN-002', needle_type: 'DC X 1', size_dia: '10', brand: 'GROZ', active: true },
    { id: 'norm-3', item_code: 'SN-003', needle_type: 'UY 128', size_dia: '11', brand: 'ORGAN', active: false }, // inactive
  ]
  const idleItems = [
    { id: 'idle-1', item_code: 'IN-001', needle_type: 'DB X 1', size_dia: '9', brand: 'ORGAN', active: true },
    { id: 'idle-2', item_code: 'IN-002', needle_type: 'DV X 57', size_dia: '14', brand: 'SCHMETZ', active: true },
  ]

  const normalAssignments = [
    { needle_item_id: 'norm-1', floor_id: 'floor-1', entry_type: 'running' },
    { needle_item_id: 'norm-2', floor_id: 'floor-1', entry_type: 'new' },
    { needle_item_id: 'norm-1', floor_id: 'floor-2', entry_type: 'running' },
  ]
  const idleAssignments = [
    { needle_item_id: 'idle-1', floor_id: 'floor-1' },
    { needle_item_id: 'idle-2', floor_id: 'floor-2' },
  ]

  const tables = {
    floors,
    normal_needle_items: normalItems,
    idle_needle_items: idleItems,
    normal_needle_floor_assignments: normalAssignments,
    idle_needle_floor_assignments: idleAssignments,
    needle_running_transactions: [],
    needle_new_transactions: [],
    needle_idle_transactions: [],
    needle_bnr_records: [],
    needle_daily_sheets: [],
  }

  const admin = {
    from(table) {
      if (!tables[table]) tables[table] = []
      let rows = [...tables[table]]
      let single = false
      let start = 0
      let end = 9999

      const q = {
        select(cols = '*') { return q },
        eq(col, val) {
          rows = rows.filter((r) => r[col] === val)
          return q
        },
        in(col, vals) {
          rows = rows.filter((r) => vals.includes(r[col]))
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
          return q
        },
        then(resolve, reject) {
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

test('Offline Master Cache: getAuthorizedNeedleMasterCacheAction filters data by user floor authorization', async () => {
  // User only has floor-1
  const { actions } = setupServerMock({ isSiteAdmin: false, userFloorIds: ['floor-1'] })

  const res = await actions.getAuthorizedNeedleMasterCacheAction()
  assert.equal(res.success, true)
  assert.equal(res.data.authorizedFloorIds.length, 1)
  assert.equal(res.data.authorizedFloorIds[0], 'floor-1')

  // Floor-1 assignments only; floor-2 should NOT be exposed
  assert.equal(res.data.normalAssignments.every((a) => a.floor_id === 'floor-1'), true)
  assert.equal(res.data.idleAssignments.every((a) => a.floor_id === 'floor-1'), true)

  // Inactive needle (SN-003) should not be returned in active master items
  assert.equal(res.data.normalItems.some((item) => item.id === 'norm-3'), false)
  assert.equal(res.data.normalItems.length, 2)
})

test('Offline Master Cache: Site Admin receives all active floors and assignments', async () => {
  const { actions } = setupServerMock({ isSiteAdmin: true, userFloorIds: [] })

  const res = await actions.getAuthorizedNeedleMasterCacheAction()
  assert.equal(res.success, true)
  assert.equal(res.data.authorizedFloorIds.length, 2)
  assert.ok(res.data.authorizedFloorIds.includes('floor-1'))
  assert.ok(res.data.authorizedFloorIds.includes('floor-2'))

  // Both floor assignments returned
  assert.ok(res.data.normalAssignments.some((a) => a.floor_id === 'floor-1'))
  assert.ok(res.data.normalAssignments.some((a) => a.floor_id === 'floor-2'))
})

test('Offline Master Cache: IndexedDB caching and offline Date switching preserves needle list', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
  })

  const { actions } = setupServerMock({ isSiteAdmin: false, userFloorIds: ['floor-1'] })
  const masterRes = await actions.getAuthorizedNeedleMasterCacheAction()
  assert.equal(masterRes.success, true)

  // 1. Cache master data in IndexedDB
  await dbModule.saveAuthorizedMasterCatalogToCache(masterRes.data)
  await ensureCoverage(dbModule, 'user-001', 'floor-1', ['RUNNING', 'NEW', 'IDLE'])

  // 2. Query offline for RUNNING category on floor-1 for Date 2026-10-25
  const sheet1 = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
  })

  assert.equal(sheet1.status, 'cached')
  assert.equal(sheet1.rows.length, 1)
  assert.equal(sheet1.rows[0].item_code, 'SN-001')

  // 3. Switch Date offline to 2026-10-26 (Date must not cause needle rows to disappear)
  const sheet2 = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-26',
    floorId: 'floor-1',
    category: 'RUNNING',
  })

  assert.equal(sheet2.status, 'cached')
  assert.equal(sheet2.rows.length, 1)
  assert.equal(sheet2.rows[0].item_code, 'SN-001')
})

test('Offline Master Cache: Offline Category switching loads correct master catalog (NEW vs RUNNING vs IDLE)', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
  })

  const { actions } = setupServerMock({ isSiteAdmin: false, userFloorIds: ['floor-1'] })
  const masterRes = await actions.getAuthorizedNeedleMasterCacheAction()
  await dbModule.saveAuthorizedMasterCatalogToCache(masterRes.data)
  await ensureCoverage(dbModule, 'user-001', 'floor-1', ['RUNNING', 'NEW', 'IDLE'])

  // RUNNING -> SN-001
  const runningSheet = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
  })
  assert.equal(runningSheet.status, 'cached')
  assert.equal(runningSheet.rows.length, 1)
  assert.equal(runningSheet.rows[0].item_code, 'SN-001')

  // NEW -> SN-002
  const newSheet = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'NEW',
  })
  assert.equal(newSheet.status, 'cached')
  assert.equal(newSheet.rows.length, 1)
  assert.equal(newSheet.rows[0].item_code, 'SN-002')

  // IDLE -> IN-001
  const idleSheet = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'IDLE',
  })
  assert.equal(idleSheet.status, 'cached')
  assert.equal(idleSheet.rows.length, 1)
  assert.equal(idleSheet.rows[0].item_code, 'IN-001')
})

test('Offline Master Cache: Offline draft values merge with cached needle list', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
  })

  const { actions } = setupServerMock({ isSiteAdmin: false, userFloorIds: ['floor-1'] })
  const masterRes = await actions.getAuthorizedNeedleMasterCacheAction()
  await dbModule.saveAuthorizedMasterCatalogToCache(masterRes.data)
  await ensureCoverage(dbModule, 'user-001', 'floor-1', ['RUNNING', 'NEW', 'IDLE'])

  // Operator enters RCVD = 45 and BNR = 3 while offline
  await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'received',
    value: 45,
    reqNo: 'REQ-OFFLINE-001',
  })

  await dbModule.saveCellDraftAndEnqueueOp({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
    needleItemId: 'norm-1',
    field: 'bnr',
    value: 3,
  })

  // Re-read offline sheet: cached item + draft values merged
  const sheet = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
  })

  assert.equal(sheet.status, 'cached')
  assert.equal(sheet.rows.length, 1)
  assert.equal(sheet.rows[0].item_code, 'SN-001')
  assert.equal(sheet.rows[0].received, 45)
  assert.equal(sheet.rows[0].bnr, 3)
  assert.equal(sheet.rows[0].req_no, 'REQ-OFFLINE-001')
  assert.equal(sheet.rows[0].present, 45)
})

test('Offline Master Cache: Distinguishes genuinely empty assignment vs never cached floor', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
  })

  // Cache user with floor-1 only
  const { actions } = setupServerMock({ isSiteAdmin: false, userFloorIds: ['floor-1'] })
  const masterRes = await actions.getAuthorizedNeedleMasterCacheAction()
  await dbModule.saveAuthorizedMasterCatalogToCache(masterRes.data)

  // Case C: Floor-3 was never cached -> status must be 'not_cached'
  const neverCached = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-never-cached',
    category: 'RUNNING',
  })
  assert.equal(neverCached.status, 'not_cached')

  // Case B: Floor-1 has no IDLE needles assigned for 'floor-1' if we unassign them
  // Test empty assignment when combination was cached but has 0 items
  const meta = await dbModule.getCachedMasterMeta('user-001')
  assert.ok(meta)
  assert.ok(meta.cached_combinations.includes('floor-1:RUNNING'))
})

test('Offline Master Cache: Search Filter filters cached needle list across Code, Type, Size, and Brand', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
  })

  // Site Admin has both norm-1 (SN-001, DB X 1, 9, ORGAN) and norm-2 (SN-002, DC X 1, 10, GROZ)
  const { actions, tables } = setupServerMock({ isSiteAdmin: true, userFloorIds: ['floor-1'] })
  tables.normal_needle_floor_assignments.push({
    needle_item_id: 'norm-2',
    floor_id: 'floor-1',
    entry_type: 'running',
  })

  const masterRes = await actions.getAuthorizedNeedleMasterCacheAction()
  await dbModule.saveAuthorizedMasterCatalogToCache(masterRes.data)

  const sheet = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
  })

  assert.equal(sheet.rows.length, 2)

  // Simulation of client search filter function (identical to daily-entry-shell.tsx)
  function filterRows(rows, searchTerm) {
    if (!searchTerm.trim()) return rows
    const term = searchTerm.toLowerCase().trim()
    return rows.filter(
      (r) =>
        r.item_code.toLowerCase().includes(term) ||
        r.needle_type.toLowerCase().includes(term) ||
        (r.size_dia && r.size_dia.toLowerCase().includes(term)) ||
        r.brand.toLowerCase().includes(term)
    )
  }

  // Search by code "002"
  const byCode = filterRows(sheet.rows, '002')
  assert.equal(byCode.length, 1)
  assert.equal(byCode[0].item_code, 'SN-002')

  // Search by type "db x 1"
  const byType = filterRows(sheet.rows, 'db x 1')
  assert.equal(byType.length, 1)
  assert.equal(byType[0].item_code, 'SN-001')

  // Search by size "10"
  const bySize = filterRows(sheet.rows, '10')
  assert.equal(bySize.length, 1)
  assert.equal(bySize[0].item_code, 'SN-002')

  // Search by brand "ORGAN"
  const byBrand = filterRows(sheet.rows, 'organ')
  assert.equal(byBrand.length, 1)
  assert.equal(byBrand[0].item_code, 'SN-001')
})

test('Offline Master Cache: Master update online refreshes IndexedDB cache and removes unassigned needles', async () => {
  const mockIDB = createMockIndexedDB()
  const dbModule = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB },
  })

  const { actions, tables } = setupServerMock({ isSiteAdmin: true, userFloorIds: ['floor-1'] })

  // 1. Initial online load
  const initialRes = await actions.getAuthorizedNeedleMasterCacheAction()
  await dbModule.saveAuthorizedMasterCatalogToCache(initialRes.data)

  const sheetBefore = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
  })
  assert.equal(sheetBefore.rows.length, 1)
  assert.equal(sheetBefore.rows[0].item_code, 'SN-001')

  // 2. Needle unassigned or disabled in Needle Master
  tables.normal_needle_floor_assignments = []

  // 3. Next online refresh
  const refreshedRes = await actions.getAuthorizedNeedleMasterCacheAction()
  assert.equal(refreshedRes.data.normalAssignments.length, 0)
  await dbModule.saveAuthorizedMasterCatalogToCache(refreshedRes.data)

  const sheetAfter = await dbModule.getCachedNeedleSheet({
    userId: 'user-001',
    date: '2026-10-25',
    floorId: 'floor-1',
    category: 'RUNNING',
  })
  assert.equal(sheetAfter.status, 'empty_assignment')
  assert.equal(sheetAfter.rows.length, 0)
})

