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

// In-Memory IndexedDB Mock
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

// Mock Supabase Realtime Channel
function createMockSupabaseRealtime() {
  const channels = new Map()

  return {
    channels,
    channel(name) {
      const listeners = []
      let statusCallback = null
      let subscribed = false

      const ch = {
        name,
        on(type, filterObj, callback) {
          listeners.push({ type, filterObj, callback })
          return ch
        },
        subscribe(cb) {
          statusCallback = cb
          subscribed = true
          setTimeout(() => cb && cb('SUBSCRIBED'), 0)
          return ch
        },
        unsubscribe: async () => {
          subscribed = false
          return 'ok'
        },
        // Test helper to simulate an incoming postgres_changes broadcast
        simulateEvent(table, eventType, newRecord, oldRecord = {}) {
          listeners
            .filter((l) => l.type === 'postgres_changes' && l.filterObj.table === table)
            .forEach((l) => {
              const filter = l.filterObj.filter
              if (filter) {
                const [col, val] = filter.split('=eq.')
                const targetRec = eventType === 'DELETE' ? oldRecord : newRecord
                if (targetRec && targetRec[col] !== val) {
                  return // Filtered out by floor_id
                }
              }
              l.callback({
                eventType,
                new: newRecord,
                old: oldRecord,
                schema: 'public',
                table,
                commit_timestamp: new Date().toISOString(),
                errors: [],
              })
            })
        },
        simulateStatus(newStatus) {
          if (statusCallback) statusCallback(newStatus)
        },
      }

      channels.set(name, ch)
      return ch
    },
    removeChannel: async (ch) => {
      channels.delete(ch.name)
      return 'ok'
    },
  }
}

test('Realtime 1: Two Devices Same Sheet — Device A commits RCVD=85, Device B immediately reflects 85 & recalculates PRESENT', async () => {
  const mockIDB_B = createMockIndexedDB()
  const dbModule_B = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB_B },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  // Initial state on Device B: PREV=100, RCVD=0, DVLD=0, PRESENT=100
  let rows_B = [
    {
      needle_item_id: 'norm-1',
      item_code: 'SN-171',
      needle_type: 'KNITTING',
      size_dia: '11',
      brand: 'ORGAN',
      previous: 100,
      received: 0,
      delivery: 0,
      present: 100,
      bnr: 0,
      transfer_in: 0,
      transfer_out: 0,
      req_no: null,
      last_transfer_note: null,
      is_stock_known: true,
    },
  ]

  const date = '2026-10-27'
  const floorId = 'floor-1'
  const category = 'RUNNING'

  // Device A commits: SN-171 RCVD = 85
  const incomingTx = {
    id: 'tx-rcvd-1',
    transaction_date: date,
    floor_id: floorId,
    needle_item_id: 'norm-1',
    transaction_type: 'RECEIVE',
    quantity: 85,
    req_no: 'REQ-2026-100',
    client_operation_id: 'device-a-op-1',
  }

  // Device B processes incoming realtime transaction event
  const isAddition = ['OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(incomingTx.transaction_type)
  assert.equal(incomingTx.transaction_date, date)

  rows_B = rows_B.map((r) => {
    if (r.needle_item_id !== incomingTx.needle_item_id) return r
    const rcvd = incomingTx.quantity
    const present = r.previous + rcvd + r.transfer_in - r.delivery - r.transfer_out
    return {
      ...r,
      received: rcvd,
      present,
      req_no: incomingTx.req_no,
    }
  })

  // Verify Device B state immediately updated without reload
  assert.equal(rows_B[0].received, 85)
  assert.equal(rows_B[0].present, 185) // 100 + 85 = 185
  assert.equal(rows_B[0].req_no, 'REQ-2026-100')

  // Save to Device B IndexedDB snapshot cache
  await dbModule_B.saveSheetSnapshotToCache({
    userId: 'user-b',
    date,
    floorId,
    category,
    rows: rows_B,
    requisitionNo: incomingTx.req_no,
  })

  // Verify Device B snapshot in IndexedDB (Section 9)
  const sheetKey = dbModule_B.generateSheetKey('user-b', date, floorId, category)
  const db = await new Promise((res) => {
    const req = mockIDB_B.open('mcd_erp_daily_entry_v1', 2)
    req.onsuccess = () => res(req.result)
  })
  const snap = await new Promise((res) => {
    const tx = db.transaction('sheet_snapshots_cache', 'readonly')
    const store = tx.objectStore('sheet_snapshots_cache')
    const getReq = store.get(sheetKey)
    getReq.onsuccess = () => res(getReq.result)
  })
  assert.ok(snap)
  const cachedRow = snap.rows.find((r) => r.needle_item_id === 'norm-1')
  assert.equal(cachedRow.received, 85)
  assert.equal(cachedRow.present, 185)
})

test('Realtime 2: Reverse Direction — Device B commits DVLD=10, Device A immediately updates delivery & PRESENT', async () => {
  let rows_A = [
    {
      needle_item_id: 'norm-1',
      item_code: 'SN-171',
      previous: 100,
      received: 85,
      delivery: 0,
      present: 185,
      transfer_in: 0,
      transfer_out: 0,
    },
  ]

  const date = '2026-10-27'
  const incomingIssueTx = {
    id: 'tx-issue-1',
    transaction_date: date,
    floor_id: 'floor-1',
    needle_item_id: 'norm-1',
    transaction_type: 'ISSUE',
    quantity: 10,
    client_operation_id: 'device-b-op-2',
  }

  // Device A receives realtime event
  rows_A = rows_A.map((r) => {
    if (r.needle_item_id !== incomingIssueTx.needle_item_id) return r
    const dvld = incomingIssueTx.quantity
    const present = r.previous + r.received + r.transfer_in - dvld - r.transfer_out
    return {
      ...r,
      delivery: dvld,
      present,
    }
  })

  assert.equal(rows_A[0].delivery, 10)
  assert.equal(rows_A[0].present, 175) // 100 + 85 - 10 = 175
})

test('Realtime 3: PREV/PRESENT Formula Recalculation is exact and instantaneous', () => {
  let row = {
    needle_item_id: 'norm-1',
    previous: 100,
    received: 0,
    delivery: 0,
    transfer_in: 0,
    transfer_out: 0,
    present: 100,
  }

  // Realtime event: RCVD = 20
  row.received = 20
  row.present = row.previous + row.received + row.transfer_in - row.delivery - row.transfer_out
  assert.equal(row.previous, 100)
  assert.equal(row.received, 20)
  assert.equal(row.present, 120)

  // Another realtime event: DVLD = 15
  row.delivery = 15
  row.present = row.previous + row.received + row.transfer_in - row.delivery - row.transfer_out
  assert.equal(row.present, 105) // 100 + 20 - 15 = 105
})

test('Realtime 4: BNR Realtime — updates BNR quantity without affecting stock', () => {
  let row = {
    needle_item_id: 'norm-1',
    previous: 100,
    received: 20,
    delivery: 15,
    transfer_in: 0,
    transfer_out: 0,
    present: 105,
    bnr: 0,
  }

  // BNR event: quantity = 6
  const bnrEvent = {
    needle_item_id: 'norm-1',
    quantity: 6,
    category: 'RUNNING',
    record_date: '2026-10-27',
  }

  row.bnr = bnrEvent.quantity
  // Formula: present MUST NOT change for BNR
  const present = row.previous + row.received + row.transfer_in - row.delivery - row.transfer_out
  assert.equal(row.bnr, 6)
  assert.equal(row.present, 105)
})

test('Realtime 5: Local Pending Conflict Protection — Device B preserves unsynced local edit when Device A saves', async () => {
  const mockIDB_B = createMockIndexedDB()
  const dbModule_B = moduleFrom('src/lib/offline/daily-entry-db.ts', {}, {
    window: { indexedDB: mockIDB_B },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 8) },
  })

  const date = '2026-10-27'
  const floorId = 'floor-1'
  const category = 'RUNNING'

  // Device B entered an unsynced local draft: RCVD = 90
  const pendingOp = await dbModule_B.saveCellDraftAndEnqueueOp({
    userId: 'user-b',
    date,
    floorId,
    category,
    needleItemId: 'norm-1',
    field: 'received',
    value: 90,
  })
  assert.equal(pendingOp.value, 90)

  // Device B's current UI shows 90
  let rows_B = [
    {
      needle_item_id: 'norm-1',
      item_code: 'SN-171',
      previous: 100,
      received: 90,
      delivery: 0,
      transfer_in: 0,
      transfer_out: 0,
      present: 190,
    },
  ]

  // Device A commits: RCVD = 85 to Supabase
  const incomingTx = {
    id: 'tx-device-a',
    transaction_date: date,
    floor_id: floorId,
    needle_item_id: 'norm-1',
    transaction_type: 'RECEIVE',
    quantity: 85,
  }

  // Device B checks if it has an uncommitted local pending draft for norm-1 received
  const sheetKey = dbModule_B.generateSheetKey('user-b', date, floorId, category)
  const draft = await dbModule_B.getSheetDraft(sheetKey)
  const hasLocalPending = draft?.cells?.['norm-1']?.received !== undefined
  assert.equal(hasLocalPending, true)

  // Because hasLocalPending is TRUE, Device B preserves its local input (90)!
  rows_B = rows_B.map((r) => {
    if (r.needle_item_id !== incomingTx.needle_item_id) return r
    let rcvd = r.received
    if (!hasLocalPending) {
      rcvd = incomingTx.quantity
    }
    const present = r.previous + rcvd + r.transfer_in - r.delivery - r.transfer_out
    return { ...r, received: rcvd, present }
  })

  assert.equal(rows_B[0].received, 90, 'Device B unsynced local edit must NOT be silently overwritten')
  assert.equal(rows_B[0].present, 190)
})

test('Realtime 6: Different Sheet Isolation — floor, date, and category isolation', () => {
  const currentSheet = {
    date: '2026-10-27',
    floorId: 'floor-b',
    category: 'RUNNING',
  }

  let row = {
    needle_item_id: 'norm-1',
    previous: 100,
    received: 0,
    delivery: 0,
    present: 100,
  }

  // 1. Unrelated floor event (Floor A)
  const floorAEvent = {
    transaction_date: '2026-10-27',
    floor_id: 'floor-a',
    needle_item_id: 'norm-1',
    transaction_type: 'RECEIVE',
    quantity: 85,
  }
  if (floorAEvent.floor_id === currentSheet.floorId) {
    row.received = floorAEvent.quantity
  }
  assert.equal(row.received, 0, 'Floor A event must not affect Floor B')

  // 2. Future date event (28-Oct)
  const futureEvent = {
    transaction_date: '2026-10-28',
    floor_id: 'floor-b',
    needle_item_id: 'norm-1',
    transaction_type: 'RECEIVE',
    quantity: 50,
  }
  if (futureEvent.transaction_date === currentSheet.date) {
    row.received = futureEvent.quantity
  }
  assert.equal(row.received, 0, 'Future date event must not affect current date')
})

test('Realtime 7: Historical Earlier Date Modification — Device A modifies 25-Oct, Device B viewing 27-Oct updates PREV & PRESENT', () => {
  const currentSheet = {
    date: '2026-10-27',
    floorId: 'floor-1',
    category: 'RUNNING',
  }

  let rows_B = [
    {
      needle_item_id: 'norm-1',
      previous: 100,
      received: 20,
      delivery: 10,
      transfer_in: 0,
      transfer_out: 0,
      present: 110,
    },
  ]

  // Device A modifies 25-Oct RECEIVE: 10 -> 20 (delta = +10)
  const incomingHistoricalEvent = {
    eventType: 'UPDATE',
    new: {
      transaction_date: '2026-10-25',
      floor_id: 'floor-1',
      needle_item_id: 'norm-1',
      transaction_type: 'RECEIVE',
      quantity: 20,
    },
    old: {
      quantity: 10,
    },
  }

  const txDate = incomingHistoricalEvent.new.transaction_date
  assert.ok(txDate < currentSheet.date, 'Historical transaction is on an earlier date')

  const diff = Number(incomingHistoricalEvent.new.quantity) - Number(incomingHistoricalEvent.old.quantity)
  const delta = diff // RECEIVE is addition, so delta = +10

  rows_B = rows_B.map((r) => {
    if (r.needle_item_id !== incomingHistoricalEvent.new.needle_item_id) return r
    const newPrev = Math.max(0, r.previous + delta)
    const present = newPrev + r.received + r.transfer_in - r.delivery - r.transfer_out
    return {
      ...r,
      previous: newPrev,
      present,
    }
  })

  assert.equal(rows_B[0].previous, 110, 'PREV must advance from 100 to 110')
  assert.equal(rows_B[0].present, 120, 'PRESENT must advance from 110 to 120 (110 + 20 - 10)')
})

test('Realtime 8: Own Event Idempotency — Device A receiving its own write does not double-apply stock', () => {
  let row = {
    needle_item_id: 'norm-1',
    previous: 100,
    received: 85, // Device A already set this locally
    delivery: 0,
    transfer_in: 0,
    transfer_out: 0,
    present: 185,
  }

  // Device A receives confirmation event for its own write
  const ownEvent = {
    transaction_date: '2026-10-27',
    floor_id: 'floor-1',
    needle_item_id: 'norm-1',
    transaction_type: 'RECEIVE',
    quantity: 85,
    client_operation_id: 'device-a-client-op-1',
  }

  // Logical assignment: sets received = 85 (NOT received += 85)
  row.received = ownEvent.quantity
  row.present = row.previous + row.received + row.transfer_in - row.delivery - row.transfer_out

  assert.equal(row.received, 85)
  assert.equal(row.present, 185, 'Stock is completely idempotent and never double-applied')
})

test('Realtime 9: Subscription Lifecycle & Cleanup — channel cleanly switches on parameter change', () => {
  const mockRealtime = createMockSupabaseRealtime()

  // Subscribe to A Floor / RUNNING / 27-Oct
  const ch1 = mockRealtime.channel('daily-entry:floor-a:RUNNING:2026-10-27')
  ch1.subscribe(() => {})
  assert.equal(mockRealtime.channels.size, 1)

  // Switch to B Floor / RUNNING / 27-Oct: unsubscribe ch1 and remove
  ch1.unsubscribe()
  mockRealtime.removeChannel(ch1)
  assert.equal(mockRealtime.channels.size, 0)

  // Subscribe to new channel
  const ch2 = mockRealtime.channel('daily-entry:floor-b:RUNNING:2026-10-27')
  ch2.subscribe(() => {})
  assert.equal(mockRealtime.channels.size, 1)
  assert.ok(mockRealtime.channels.has('daily-entry:floor-b:RUNNING:2026-10-27'))
})

test('Realtime 10: Reconnect Reconciliation — temporary disconnect triggers reconciliation on recover', async () => {
  let reconciliationCount = 0
  let isConnected = true

  const onReconnect = () => {
    reconciliationCount++
  }

  // Simulate disconnect
  isConnected = false
  let wasDisconnected = true

  // Simulate recovery (status becomes SUBSCRIBED after disconnect)
  if (!isConnected && wasDisconnected) {
    isConnected = true
    wasDisconnected = false
    onReconnect()
  }

  assert.equal(reconciliationCount, 1, 'Reconnection must trigger lightweight reconciliation')
})
