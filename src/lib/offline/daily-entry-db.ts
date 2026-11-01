import type {
  AuthorizedMasterCatalogData,
  CacheSyncStatus,
  CachedFloorAssignment,
  CachedMasterMeta,
  CachedMasterNeedleItem,
  CachedSheetHeader,
  CachedSheetSnapshot,
  DailyEntryCategory,
  DailyEntryRowItem,
  DailyStockSnapshotRecord,
  LocalDailySheetDraft,
  OfflineStockHistorySyncData,
  PendingSyncOperation,
  StockBaselineRecord,
  StockCacheCoverageRecord,
  StockMovementRecord,
} from '@/types'

const DB_NAME = 'mcd_erp_daily_entry_v1'
const DB_VERSION = 5

export const STORE_DRAFTS = 'drafts'
export const STORE_QUEUE = 'pending_queue'
export const STORE_NORMAL_MASTER = 'normal_master_cache'
export const STORE_IDLE_MASTER = 'idle_master_cache'
export const STORE_ASSIGNMENTS = 'floor_assignments_cache'
export const STORE_SNAPSHOTS = 'sheet_snapshots_cache'
export const STORE_META = 'master_cache_meta'
export const STORE_STOCK_BASELINES = 'stock_baselines_cache'
export const STORE_STOCK_MOVEMENTS = 'stock_movements_cache'
export const STORE_SHEET_HEADERS = 'daily_sheet_headers_cache'
export const STORE_COVERAGE = 'stock_cache_coverage'
export const STORE_DAILY_SNAPSHOTS = 'daily_stock_snapshots'

function getUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function generateSheetKey(
  userId: string,
  date: string,
  floorId: string,
  category: string
): string {
  return `${userId}:${date}:${floorId}:${category}`
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not available in this environment.'))
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // 1. Store for local grid state drafts
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'sheet_key' })
      }

      // 2. Store for pending sync queue
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
        queueStore.createIndex('sheet_key', 'sheet_key', { unique: false })
        queueStore.createIndex('status', 'status', { unique: false })
        queueStore.createIndex('cell_lookup', ['sheet_key', 'needle_item_id', 'field'], {
          unique: false,
        })
      }

      // 3. Store for normal needle master items
      if (!db.objectStoreNames.contains(STORE_NORMAL_MASTER)) {
        const normalStore = db.createObjectStore(STORE_NORMAL_MASTER, { keyPath: 'id' })
        normalStore.createIndex('item_code', 'item_code', { unique: false })
      }

      // 4. Store for idle needle master items
      if (!db.objectStoreNames.contains(STORE_IDLE_MASTER)) {
        const idleStore = db.createObjectStore(STORE_IDLE_MASTER, { keyPath: 'id' })
        idleStore.createIndex('item_code', 'item_code', { unique: false })
      }

      // 5. Store for floor assignments
      if (!db.objectStoreNames.contains(STORE_ASSIGNMENTS)) {
        const assignStore = db.createObjectStore(STORE_ASSIGNMENTS, { keyPath: 'id' })
        assignStore.createIndex('floor_category', ['floor_id', 'category'], { unique: false })
        assignStore.createIndex('floor_id', 'floor_id', { unique: false })
      }

      // 6. Store for full sheet snapshots per date/floor/category
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'sheet_key' })
      }

      // 7. Store for cache metadata per user
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'user_id' })
      }

      // 8. Store for 1-month stock baselines
      if (!db.objectStoreNames.contains(STORE_STOCK_BASELINES)) {
        const baseStore = db.createObjectStore(STORE_STOCK_BASELINES, { keyPath: 'id' })
        baseStore.createIndex('floor_category', ['floor_id', 'category'], { unique: false })
      }

      // 9. Store for 1-month rolling transactions / stock movements
      if (!db.objectStoreNames.contains(STORE_STOCK_MOVEMENTS)) {
        const moveStore = db.createObjectStore(STORE_STOCK_MOVEMENTS, { keyPath: 'id' })
        moveStore.createIndex('floor_category_date', ['floor_id', 'category', 'transaction_date'], {
          unique: false,
        })
        moveStore.createIndex('floor_category', ['floor_id', 'category'], { unique: false })
        moveStore.createIndex('needle_item_id', 'needle_item_id', { unique: false })
        moveStore.createIndex('floor_cat_item_date', ['floor_id', 'category', 'needle_item_id', 'transaction_date'], {
          unique: false,
        })
      }

      // 10. Store for 1-month daily sheet headers
      if (!db.objectStoreNames.contains(STORE_SHEET_HEADERS)) {
        const headerStore = db.createObjectStore(STORE_SHEET_HEADERS, { keyPath: 'id' })
        headerStore.createIndex('floor_category', ['floor_id', 'category'], { unique: false })
        headerStore.createIndex('lookup', ['floor_id', 'category', 'entry_date'], { unique: false })
      }

      // 11. Store for stock cache coverage metadata per user, floor, category
      if (!db.objectStoreNames.contains(STORE_COVERAGE)) {
        const covStore = db.createObjectStore(STORE_COVERAGE, { keyPath: 'id' })
        covStore.createIndex('user_id', 'user_id', { unique: false })
        covStore.createIndex('floor_category', ['floor_id', 'category'], { unique: false })
      }

      // 12. Store for authoritative daily stock snapshots per date/floor/category/needle
      if (!db.objectStoreNames.contains(STORE_DAILY_SNAPSHOTS)) {
        const snapStore = db.createObjectStore(STORE_DAILY_SNAPSHOTS, { keyPath: 'id' })
        snapStore.createIndex('floor_cat_date', ['floor_id', 'category', 'date'], { unique: false })
        snapStore.createIndex('floor_cat_needle', ['floor_id', 'category', 'needle_item_id'], { unique: false })
        snapStore.createIndex('date', 'date', { unique: false })
        snapStore.createIndex('sync_batch_id', 'sync_batch_id', { unique: false })
      }

      // Safe cache reset for version 5 migration (Section 36)
      // Discard unreliable legacy snapshot cache while strictly preserving drafts & sync queue
      if (event.oldVersion < 5) {
        if (db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          const trans = (event.target as IDBOpenDBRequest).transaction
          if (trans) {
            try {
              trans.objectStore(STORE_SNAPSHOTS).clear()
            } catch {
              // Ignore if already clear
            }
          }
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'))
  })
}

/**
 * Save changed cell to local draft and enqueue/coalesce pending sync operation.
 * Runs instantly before network sync.
 */
export async function saveCellDraftAndEnqueueOp(params: {
  userId: string
  date: string
  floorId: string
  category: DailyEntryCategory
  needleItemId: string
  field: 'received' | 'delivery' | 'bnr'
  value: number
  reqNo?: string | null
}): Promise<PendingSyncOperation> {
  const db = await openDB()
  const sheetKey = generateSheetKey(
    params.userId,
    params.date,
    params.floorId,
    params.category
  )
  const now = Date.now()

  return new Promise<PendingSyncOperation>((resolve, reject) => {
    const tx = db.transaction([STORE_DRAFTS, STORE_QUEUE], 'readwrite')
    const draftsStore = tx.objectStore(STORE_DRAFTS)
    const queueStore = tx.objectStore(STORE_QUEUE)

    let createdOrUpdatedOp: PendingSyncOperation | null = null

    // 1. Update draft store
    const draftGetReq = draftsStore.get(sheetKey)
    draftGetReq.onsuccess = () => {
      const existingDraft: LocalDailySheetDraft = draftGetReq.result || {
        sheet_key: sheetKey,
        user_id: params.userId,
        entry_date: params.date,
        floor_id: params.floorId,
        category: params.category,
        cells: {},
        updated_at: now,
      }

      const existingCell = existingDraft.cells[params.needleItemId] || {}
      existingDraft.cells[params.needleItemId] = {
        ...existingCell,
        [params.field]: params.value,
        ...(params.reqNo !== undefined ? { req_no: params.reqNo } : {}),
      }
      existingDraft.updated_at = now

      draftsStore.put(existingDraft)

      // 2. Find and coalesce existing pending queue item for this cell
      const cellIndex = queueStore.index('cell_lookup')
      const cellQuery = cellIndex.getAll([sheetKey, params.needleItemId, params.field])

      cellQuery.onsuccess = () => {
        const matches: PendingSyncOperation[] = cellQuery.result || []
        // Look for existing pending, failed or conflict entry
        const unconfirmed = matches.find(
          (m) => m.status === 'pending' || m.status === 'failed' || m.status === 'syncing' || m.status === 'conflict'
        )

        if (unconfirmed) {
          // Coalesce: update value and generate new operation ID for the latest intent
          unconfirmed.value = params.value
          if (params.reqNo !== undefined) {
            unconfirmed.req_no = params.reqNo
          }
          unconfirmed.client_operation_id = getUUID()
          unconfirmed.status = 'pending'
          unconfirmed.error = null
          unconfirmed.updated_at = now

          queueStore.put(unconfirmed)
          createdOrUpdatedOp = unconfirmed
        } else {
          // Create new pending operation
          const newOp: PendingSyncOperation = {
            id: getUUID(),
            client_operation_id: getUUID(),
            sheet_key: sheetKey,
            user_id: params.userId,
            entry_date: params.date,
            floor_id: params.floorId,
            category: params.category,
            needle_item_id: params.needleItemId,
            field: params.field,
            value: params.value,
            req_no: params.reqNo ?? null,
            status: 'pending',
            retry_count: 0,
            error: null,
            created_at: now,
            updated_at: now,
            last_attempt_at: null,
          }

          queueStore.add(newOp)
          createdOrUpdatedOp = newOp
        }
      }
    }

    tx.oncomplete = () => {
      db.close()
      if (createdOrUpdatedOp) {
        resolve(createdOrUpdatedOp)
      } else {
        reject(new Error('Transaction completed without creating an operation.'))
      }
    }

    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to persist draft to IndexedDB.'))
    }
  })
}

/**
 * Get local draft for a daily sheet context.
 */
export async function getSheetDraft(sheetKey: string): Promise<LocalDailySheetDraft | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DRAFTS, 'readonly')
    const store = tx.objectStore(STORE_DRAFTS)
    const request = store.get(sheetKey)

    request.onsuccess = () => {
      db.close()
      resolve(request.result || null)
    }
    request.onerror = () => {
      db.close()
      reject(request.error || new Error('Failed to read draft.'))
    }
  })
}

/**
 * Retrieve pending operations, optionally filtered by sheet_key.
 */
export async function getPendingOperations(
  sheetKey?: string
): Promise<PendingSyncOperation[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly')
    const store = tx.objectStore(STORE_QUEUE)

    let request: IDBRequest<PendingSyncOperation[]>
    if (sheetKey) {
      const index = store.index('sheet_key')
      request = index.getAll(sheetKey)
    } else {
      request = store.getAll()
    }

    request.onsuccess = () => {
      db.close()
      resolve(request.result || [])
    }
    request.onerror = () => {
      db.close()
      reject(request.error || new Error('Failed to fetch pending operations.'))
    }
  })
}

/**
 * Update status of pending operations (e.g. to 'syncing' or 'failed').
 */
export async function updateOperationsStatus(
  ids: string[],
  status: 'pending' | 'syncing' | 'failed',
  errorMessage?: string
): Promise<void> {
  if (ids.length === 0) return
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite')
    const store = tx.objectStore(STORE_QUEUE)
    const now = Date.now()

    ids.forEach((id) => {
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const item: PendingSyncOperation | undefined = getReq.result
        if (item) {
          item.status = status
          item.updated_at = now
          item.last_attempt_at = now
          if (status === 'syncing') {
            item.retry_count = (item.retry_count || 0) + 1
          }
          if (errorMessage !== undefined) {
            item.error = errorMessage
          }
          store.put(item)
        }
      }
    })

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to update operations status.'))
    }
  })
}

/**
 * Mark a specific operation as conflicted (e.g. stock was depleted by another user).
 */
export async function markOperationConflict(
  id: string,
  conflictMessage: string,
  serverAvailableStock?: number
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite')
    const store = tx.objectStore(STORE_QUEUE)
    const getReq = store.get(id)

    getReq.onsuccess = () => {
      const item: PendingSyncOperation | undefined = getReq.result
      if (item) {
        item.status = 'conflict'
        item.error = conflictMessage
        item.updated_at = Date.now()
        if (serverAvailableStock !== undefined) {
          item.server_available_stock = serverAvailableStock
        } else {
          // Backward compatibility: parse available stock from conflict message if present
          const match = conflictMessage.match(/available stock[^\d]*(\d+)/i)
          if (match && match[1]) {
            item.server_available_stock = parseInt(match[1], 10)
          }
        }
        store.put(item)
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to mark operation conflict.'))
    }
  })
}

/**
 * Retrieve conflict operations, normalizing server_available_stock for legacy conflict items.
 */
export async function getConflictOperations(
  sheetKey?: string
): Promise<PendingSyncOperation[]> {
  const ops = await getPendingOperations(sheetKey)
  return ops
    .filter((o) => o.status === 'conflict')
    .map((o) => {
      if (o.server_available_stock === undefined || o.server_available_stock === null) {
        const match = o.error?.match(/available stock[^\d]*(\d+)/i)
        if (match && match[1]) {
          return {
            ...o,
            server_available_stock: parseInt(match[1], 10),
          }
        }
      }
      return o
    })
}

/**
 * Resolve a conflicted operation by replacing the invalid delivery value with a valid quantity.
 * Updates local draft, sets new client_operation_id for idempotency, resets status to 'pending', and clears error.
 */
export async function resolveConflictEdit(params: {
  operationId: string
  newDvld: number
}): Promise<{ success: boolean; error?: string; operation?: PendingSyncOperation }> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DRAFTS, STORE_QUEUE], 'readwrite')
    const queueStore = tx.objectStore(STORE_QUEUE)
    const draftsStore = tx.objectStore(STORE_DRAFTS)

    let updatedOp: PendingSyncOperation | undefined

    const getReq = queueStore.get(params.operationId)
    getReq.onsuccess = () => {
      const op: PendingSyncOperation | undefined = getReq.result
      if (!op) {
        return resolve({ success: false, error: 'Conflict operation not found in queue.' })
      }

      // Check available stock
      let availableStock = op.server_available_stock
      if (availableStock === undefined || availableStock === null) {
        const match = op.error?.match(/available stock[^\d]*(\d+)/i)
        if (match && match[1]) {
          availableStock = parseInt(match[1], 10)
        }
      }

      if (params.newDvld < 0) {
        return resolve({ success: false, error: 'Delivery quantity cannot be negative.' })
      }

      if (availableStock !== undefined && availableStock !== null && params.newDvld > availableStock) {
        return resolve({
          success: false,
          error: `Delivery quantity (${params.newDvld}) exceeds available stock (${availableStock}).`,
        })
      }

      const now = Date.now()

      // 1. Update queue operation with fresh idempotency identity
      op.value = params.newDvld
      op.status = 'pending'
      op.client_operation_id = getUUID()
      op.error = null
      op.retry_count = 0
      op.updated_at = now
      queueStore.put(op)
      updatedOp = op

      // 2. Update local draft store
      const draftReq = draftsStore.get(op.sheet_key)
      draftReq.onsuccess = () => {
        const draft: LocalDailySheetDraft | undefined = draftReq.result
        if (draft && draft.cells) {
          const cell = draft.cells[op.needle_item_id] || {}
          cell[op.field] = params.newDvld
          draft.cells[op.needle_item_id] = cell
          draft.updated_at = now
          draftsStore.put(draft)
        }
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve({ success: true, operation: updatedOp })
    }

    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to resolve conflict edit.'))
    }
  })
}

/**
 * Discard a conflicted operation:
 * Removes operation from queue, clears the invalid cell field from draft,
 * allowing authoritative server data to be restored without deleting server ledger transactions.
 */
export async function discardConflictOperation(params: {
  operationId: string
}): Promise<{ success: boolean; error?: string; discardedOp?: PendingSyncOperation }> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DRAFTS, STORE_QUEUE], 'readwrite')
    const queueStore = tx.objectStore(STORE_QUEUE)
    const draftsStore = tx.objectStore(STORE_DRAFTS)

    let discardedOp: PendingSyncOperation | undefined

    const getReq = queueStore.get(params.operationId)
    getReq.onsuccess = () => {
      discardedOp = getReq.result
      if (!discardedOp) {
        return resolve({ success: false, error: 'Conflict operation not found in queue.' })
      }

      // 1. Delete operation from queue
      queueStore.delete(params.operationId)

      // 2. Remove cell field from draft store
      const draftReq = draftsStore.get(discardedOp.sheet_key)
      draftReq.onsuccess = () => {
        const draft: LocalDailySheetDraft | undefined = draftReq.result
        if (draft && draft.cells && draft.cells[discardedOp!.needle_item_id]) {
          delete draft.cells[discardedOp!.needle_item_id][discardedOp!.field]
          const cell = draft.cells[discardedOp!.needle_item_id]
          if (
            cell.received === undefined &&
            cell.delivery === undefined &&
            cell.bnr === undefined &&
            !cell.req_no
          ) {
            delete draft.cells[discardedOp!.needle_item_id]
          }
          draft.updated_at = Date.now()
          draftsStore.put(draft)
        }
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve({ success: true, discardedOp })
    }

    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to discard conflict operation.'))
    }
  })
}

/**
 * Remove confirmed operations from the pending queue.
 */
export async function removeConfirmedOperations(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite')
    const store = tx.objectStore(STORE_QUEUE)

    ids.forEach((id) => {
      store.delete(id)
    })

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to remove confirmed operations.'))
    }
  })
}

/**
 * Remove local draft when all pending items have been confirmed.
 */
export async function clearSyncedDraftIfClean(sheetKey: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_DRAFTS, STORE_QUEUE], 'readwrite')
    const queueIndex = tx.objectStore(STORE_QUEUE).index('sheet_key')
    const queueReq = queueIndex.getAll(sheetKey)

    queueReq.onsuccess = () => {
      const pending: PendingSyncOperation[] = queueReq.result || []
      const hasUnresolved = pending.some(
        (p) => p.status === 'pending' || p.status === 'syncing' || p.status === 'conflict'
      )
      if (!hasUnresolved) {
        tx.objectStore(STORE_DRAFTS).delete(sheetKey)
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to clear clean draft.'))
    }
  })
}

/**
 * Persist the user's authorized Needle Master items, Idle items, and floor assignments.
 * Prunes obsolete assignments for the authorized floors so deleted assignments do not linger.
 */
export async function saveAuthorizedMasterCatalogToCache(
  data: AuthorizedMasterCatalogData
): Promise<void> {
  const db = await openDB()
  const now = data.cachedAt || Date.now()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_NORMAL_MASTER, STORE_IDLE_MASTER, STORE_ASSIGNMENTS, STORE_META],
      'readwrite'
    )

    const normalStore = tx.objectStore(STORE_NORMAL_MASTER)
    const idleStore = tx.objectStore(STORE_IDLE_MASTER)
    const assignStore = tx.objectStore(STORE_ASSIGNMENTS)
    const metaStore = tx.objectStore(STORE_META)

    // 1. Put normal needle master items
    data.normalItems.forEach((item) => {
      normalStore.put({
        id: item.id,
        item_code: item.item_code,
        needle_type: item.needle_type,
        size_dia: item.size_dia,
        brand: item.brand,
        active: item.active !== false,
        updated_at: now,
      })
    })

    // 2. Put idle needle master items
    data.idleItems.forEach((item) => {
      idleStore.put({
        id: item.id,
        item_code: item.item_code,
        needle_type: item.needle_type,
        size_dia: item.size_dia,
        brand: item.brand,
        active: item.active !== false,
        updated_at: now,
      })
    })

    // 3. Put floor assignments
    const cachedCombinations = new Set<string>()

    data.normalAssignments.forEach((a) => {
      const category: DailyEntryCategory = a.entry_type === 'running' ? 'RUNNING' : 'NEW'
      const id = `${a.floor_id}:${category}:${a.needle_item_id}`
      cachedCombinations.add(`${a.floor_id}:${category}`)
      assignStore.put({
        id,
        floor_id: a.floor_id,
        needle_item_id: a.needle_item_id,
        category,
        active: true,
        updated_at: now,
      })
    })

    data.idleAssignments.forEach((a) => {
      const id = `${a.floor_id}:IDLE:${a.needle_item_id}`
      cachedCombinations.add(`${a.floor_id}:IDLE`)
      assignStore.put({
        id,
        floor_id: a.floor_id,
        needle_item_id: a.needle_item_id,
        category: 'IDLE',
        active: true,
        updated_at: now,
      })
    })

    // Also include combinations that were authorized even if they have 0 assignments
    data.authorizedFloorIds.forEach((floorId) => {
      data.allowedCategories.forEach((cat) => {
        cachedCombinations.add(`${floorId}:${cat}`)
      })
    })

    // 4. Prune assignments for these authorized floors that were not in the fresh server list
    const floorIndex = assignStore.index('floor_id')
    data.authorizedFloorIds.forEach((floorId) => {
      const getReq = floorIndex.getAll(floorId)
      getReq.onsuccess = () => {
        const existing: CachedFloorAssignment[] = getReq.result || []
        existing.forEach((assign) => {
          if (assign.updated_at < now) {
            assignStore.delete(assign.id)
          }
        })
      }
    })

    // 5. Update metadata store
    metaStore.put({
      user_id: data.userId,
      authorized_floor_ids: data.authorizedFloorIds,
      allowed_categories: data.allowedCategories,
      floors: data.floors,
      all_active_floors: data.allActiveFloors,
      cached_combinations: Array.from(cachedCombinations),
      cached_at: now,
      version: DB_VERSION,
    })

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to save master catalog to IndexedDB.'))
    }
  })
}

/**
 * Cache full sheet row data when an online fetch succeeds.
 * Also ensures individual needle master items and assignments are cached.
 */
export async function saveSheetSnapshotToCache(params: {
  userId: string
  date: string
  floorId: string
  category: DailyEntryCategory
  rows: DailyEntryRowItem[]
  requisitionNo: string | null
}): Promise<void> {
  const db = await openDB()
  const sheetKey = generateSheetKey(params.userId, params.date, params.floorId, params.category)
  const now = Date.now()

  return new Promise((resolve, reject) => {
    const existingStores = db.objectStoreNames
    const storesToOpen = [
      STORE_SNAPSHOTS,
      STORE_NORMAL_MASTER,
      STORE_IDLE_MASTER,
      STORE_ASSIGNMENTS,
      STORE_META,
    ]
    if (existingStores.contains(STORE_DAILY_SNAPSHOTS)) {
      storesToOpen.push(STORE_DAILY_SNAPSHOTS)
    }
    if (existingStores.contains(STORE_COVERAGE)) {
      storesToOpen.push(STORE_COVERAGE)
    }

    const tx = db.transaction(storesToOpen, 'readwrite')

    const snapStore = tx.objectStore(STORE_SNAPSHOTS)
    const normalStore = tx.objectStore(STORE_NORMAL_MASTER)
    const idleStore = tx.objectStore(STORE_IDLE_MASTER)
    const assignStore = tx.objectStore(STORE_ASSIGNMENTS)
    const metaStore = tx.objectStore(STORE_META)
    const dailySnapStore = existingStores.contains(STORE_DAILY_SNAPSHOTS)
      ? tx.objectStore(STORE_DAILY_SNAPSHOTS)
      : null
    const covStore = existingStores.contains(STORE_COVERAGE)
      ? tx.objectStore(STORE_COVERAGE)
      : null

    // Save snapshot
    snapStore.put({
      sheet_key: sheetKey,
      user_id: params.userId,
      entry_date: params.date,
      floor_id: params.floorId,
      category: params.category,
      rows: params.rows,
      requisition_no: params.requisitionNo,
      updated_at: now,
    })

    // Populate master item cache and assignment for each row, plus daily snapshot
    params.rows.forEach((row) => {
      const itemRecord = {
        id: row.needle_item_id,
        item_code: row.item_code,
        needle_type: row.needle_type,
        size_dia: row.size_dia,
        brand: row.brand,
        active: true,
        updated_at: now,
      }
      if (params.category === 'IDLE') {
        idleStore.put(itemRecord)
      } else {
        normalStore.put(itemRecord)
      }

      const assignId = `${params.floorId}:${params.category}:${row.needle_item_id}`
      assignStore.put({
        id: assignId,
        floor_id: params.floorId,
        needle_item_id: row.needle_item_id,
        category: params.category,
        active: true,
        updated_at: now,
      })

      if (dailySnapStore) {
        dailySnapStore.put({
          id: `${params.floorId}:${params.category}:${params.date}:${row.needle_item_id}`,
          date: params.date,
          floor_id: params.floorId,
          category: params.category,
          needle_item_id: row.needle_item_id,
          previous: row.previous,
          received: row.received,
          delivery: row.delivery,
          transfer_in: row.transfer_in,
          transfer_out: row.transfer_out,
          adjustment_in: 0,
          adjustment_out: 0,
          present: row.present,
          bnr: row.bnr,
          req_no: row.req_no,
          last_transfer_note: row.last_transfer_note || null,
          server_updated_at: now,
          sync_batch_id: 'live_snapshot',
        })
      }
    })

    // Mark combination in meta
    const metaGetReq = metaStore.get(params.userId)
    metaGetReq.onsuccess = () => {
      const meta: CachedMasterMeta = metaGetReq.result || {
        user_id: params.userId,
        authorized_floor_ids: [params.floorId],
        allowed_categories: [params.category],
        floors: [],
        all_active_floors: [],
        cached_combinations: [],
        cached_at: now,
        version: DB_VERSION,
      }
      const comboKey = `${params.floorId}:${params.category}`
      if (!meta.cached_combinations.includes(comboKey)) {
        meta.cached_combinations.push(comboKey)
      }
      metaStore.put(meta)
    }

    // Save stock cache coverage for this sheet so it can be loaded offline
    if (covStore) {
      const covId = `${params.userId}:${params.floorId}:${params.category}`
      const covReq = covStore.get(covId)
      covReq.onsuccess = () => {
        const existing = covReq.result as StockCacheCoverageRecord | undefined
        const finalStart =
          existing && existing.coverage_start <= params.date
            ? existing.coverage_start
            : params.date
        const finalEnd =
          existing && existing.coverage_end >= params.date
            ? existing.coverage_end
            : params.date

        const cov: StockCacheCoverageRecord = {
          id: covId,
          user_id: params.userId,
          floor_id: params.floorId,
          category: params.category,
          coverage_start: finalStart,
          coverage_end: finalEnd,
          sync_batch_id: 'live_snapshot',
          record_count: (existing?.record_count || 0) + params.rows.length,
          needle_count: params.rows.length,
          last_successful_sync_at: now,
          sync_status: 'complete',
        }
        covStore.put(cov)
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to save sheet snapshot to IndexedDB.'))
    }
  })
}

/**
 * Retrieve cached metadata and authorized floors/categories for the user.
 */
export async function getCachedMasterMeta(userId?: string): Promise<CachedMasterMeta | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly')
    const store = tx.objectStore(STORE_META)

    if (userId) {
      const req = store.get(userId)
      req.onsuccess = () => {
        db.close()
        resolve(req.result || null)
      }
      req.onerror = () => {
        db.close()
        reject(req.error || new Error('Failed to get master meta.'))
      }
    } else {
      const req = store.getAll()
      req.onsuccess = () => {
        db.close()
        const all: CachedMasterMeta[] = req.result || []
        resolve(all[0] || null)
      }
      req.onerror = () => {
        db.close()
        reject(req.error || new Error('Failed to get master meta.'))
      }
    }
  })
}

/**
 * Calculate the rolling offline window based on the application's current date.
 * Current Date - 30 days through Current Date (e.g. 2026-10-26 - 30 days = 2026-09-26 through 2026-10-26)
 */
export function getOfflineRollingWindow(currentDateStr?: string): {
  windowStartDate: string
  windowEndDate: string
} {
  const base = currentDateStr ? new Date(currentDateStr + 'T00:00:00') : new Date()

  // Previous 30 calendar days: Current Date - 30 days
  const past = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 30)

  const toYMD = (dt: Date) => {
    const yr = dt.getFullYear()
    const mo = String(dt.getMonth() + 1).padStart(2, '0')
    const dy = String(dt.getDate()).padStart(2, '0')
    return `${yr}-${mo}-${dy}`
  }

  return {
    windowStartDate: toYMD(past),
    windowEndDate: toYMD(base),
  }
}

/**
 * Determine if a specific target date falls within complete offline cache coverage.
 */
export function isDateWithinCoverage(
  coverage: StockCacheCoverageRecord | null | undefined,
  date: string
): boolean {
  if (!coverage) return false
  if (coverage.sync_status !== 'complete') return false
  return date >= coverage.coverage_start && date <= coverage.coverage_end
}

/**
 * Check if ALL authorized floors and categories for a user have complete coverage for the rolling 30-day window.
 */
export async function isWholeUserOfflineReady(params: {
  userId: string
  authorizedFloorIds: string[]
  allowedCategories: DailyEntryCategory[]
  currentDateStr?: string
}): Promise<boolean> {
  if (!params.userId || params.authorizedFloorIds.length === 0 || params.allowedCategories.length === 0) {
    return false
  }

  const { windowStartDate, windowEndDate } = getOfflineRollingWindow(params.currentDateStr)
  const allCoverage = await getAllStockCacheCoverage(params.userId)

  const covMap = new Map<string, StockCacheCoverageRecord>()
  for (const c of allCoverage) {
    covMap.set(`${c.floor_id}:${c.category}`, c)
  }

  for (const floorId of params.authorizedFloorIds) {
    for (const cat of params.allowedCategories) {
      const cov = covMap.get(`${floorId}:${cat}`)
      if (!cov) return false
      if (cov.sync_status !== 'complete') return false
      if (cov.coverage_start > windowStartDate) return false
      if (cov.coverage_end < windowEndDate) return false
    }
  }

  return true
}

/**
 * Retrieve coverage metadata for a user, floor, and category.
 */
export async function getStockCacheCoverage(
  userId: string,
  floorId: string,
  category: DailyEntryCategory
): Promise<StockCacheCoverageRecord | null> {
  const db = await openDB()
  const id = `${userId}:${floorId}:${category}`
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE_COVERAGE)) {
      db.close()
      return resolve(null)
    }
    const tx = db.transaction(STORE_COVERAGE, 'readonly')
    const store = tx.objectStore(STORE_COVERAGE)
    const req = store.get(id)
    req.onsuccess = () => {
      db.close()
      resolve(req.result || null)
    }
    req.onerror = () => {
      db.close()
      reject(req.error || new Error('Failed to read stock cache coverage.'))
    }
  })
}

/**
 * Retrieve all coverage metadata records for a user.
 */
export async function getAllStockCacheCoverage(
  userId: string
): Promise<StockCacheCoverageRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE_COVERAGE)) {
      db.close()
      return resolve([])
    }
    const tx = db.transaction(STORE_COVERAGE, 'readonly')
    const store = tx.objectStore(STORE_COVERAGE)
    const index = store.index('user_id')
    const req = index.getAll(userId)
    req.onsuccess = () => {
      db.close()
      resolve(req.result || [])
    }
    req.onerror = () => {
      db.close()
      reject(req.error || new Error('Failed to read all stock cache coverage.'))
    }
  })
}

/**
 * Save explicit stock cache coverage records to IndexedDB.
 */
export async function saveStockCacheCoverage(
  records: StockCacheCoverageRecord[]
): Promise<void> {
  if (records.length === 0) return
  const db = await openDB()
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE_COVERAGE)) {
      db.close()
      return resolve()
    }
    const tx = db.transaction(STORE_COVERAGE, 'readwrite')
    const store = tx.objectStore(STORE_COVERAGE)
    records.forEach((r) => store.put(r))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to save stock cache coverage.'))
    }
  })
}

/**
 * Update sync status of cache coverage (e.g. to 'syncing' or 'failed').
 */
export async function updateStockCacheCoverageStatus(
  userId: string,
  floorId: string,
  category: DailyEntryCategory,
  status: CacheSyncStatus
): Promise<void> {
  const db = await openDB()
  const id = `${userId}:${floorId}:${category}`
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(STORE_COVERAGE)) {
      db.close()
      return resolve()
    }
    const tx = db.transaction(STORE_COVERAGE, 'readwrite')
    const store = tx.objectStore(STORE_COVERAGE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const existing: StockCacheCoverageRecord | undefined = getReq.result
      if (existing) {
        existing.sync_status = status
        store.put(existing)
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to update coverage status.'))
    }
  })
}

export interface CachedNeedleSheetResult {
  status: 'cached' | 'empty_assignment' | 'not_cached' | 'coverage_incomplete'
  rows: DailyEntryRowItem[]
  requisitionNo: string | null
  coverageError?: string | null
}

/**
 * Persist 1-month rolling baseline balances, authoritative daily snapshots, movements, and sheet headers to IndexedDB.
 */
export async function saveOfflineStockHistoryToCache(
  data: OfflineStockHistorySyncData
): Promise<void> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const existingStores = db.objectStoreNames
    const storesToOpen = [
      STORE_STOCK_BASELINES,
      STORE_STOCK_MOVEMENTS,
      STORE_SHEET_HEADERS,
    ]
    if (existingStores.contains(STORE_COVERAGE)) {
      storesToOpen.push(STORE_COVERAGE)
    }
    if (existingStores.contains(STORE_DAILY_SNAPSHOTS)) {
      storesToOpen.push(STORE_DAILY_SNAPSHOTS)
    }

    const tx = db.transaction(storesToOpen, 'readwrite')

    const baseStore = tx.objectStore(STORE_STOCK_BASELINES)
    const moveStore = tx.objectStore(STORE_STOCK_MOVEMENTS)
    const sheetStore = tx.objectStore(STORE_SHEET_HEADERS)
    const covStore = existingStores.contains(STORE_COVERAGE)
      ? tx.objectStore(STORE_COVERAGE)
      : null
    const snapStore = existingStores.contains(STORE_DAILY_SNAPSHOTS)
      ? tx.objectStore(STORE_DAILY_SNAPSHOTS)
      : null

    data.baselines.forEach((b) => baseStore.put(b))
    data.movements.forEach((m) => moveStore.put(m))
    data.sheets.forEach((s) => sheetStore.put(s))

    if (snapStore && data.snapshots && data.snapshots.length > 0) {
      data.snapshots.forEach((s) => snapStore.put(s))
    }

    // Automatically register/update complete coverage for target floors and categories
    if (covStore && data.targetFloorIds && data.categories) {
      data.targetFloorIds.forEach((floorId) => {
        data.categories.forEach((cat) => {
          const comboKey = `${floorId}:${cat}`
          const snapCount = (data.snapshots || []).filter(
            (s) => s.floor_id === floorId && s.category === cat
          ).length
          const needleCount = data.assignedNeedleCounts?.[comboKey] ?? 0
          const covId = `${data.userId}:${floorId}:${cat}`

          const covReq = covStore.get(covId)
          covReq.onsuccess = () => {
            const existing = covReq.result as StockCacheCoverageRecord | undefined
            const finalStart =
              existing && existing.coverage_start < data.windowStartDate
                ? existing.coverage_start
                : data.windowStartDate
            const finalRecordCount = existing
              ? (existing.record_count || 0) + snapCount
              : snapCount

            const cov: StockCacheCoverageRecord = {
              id: covId,
              user_id: data.userId,
              floor_id: floorId,
              category: cat,
              coverage_start: finalStart,
              coverage_end: data.windowEndDate,
              sync_batch_id: data.syncBatchId,
              record_count: finalRecordCount,
              needle_count: needleCount || existing?.needle_count || 0,
              last_successful_sync_at: data.syncedAt,
              sync_status: 'complete',
            }
            covStore.put(cov)
          }
        })
      })
    }

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to save stock history cache to IndexedDB.'))
    }
  })
}

/**
 * Retrieve needle rows for a given Floor and Category from local IndexedDB cache.
 * Validates stock cache coverage first:
 * - If coverage is incomplete, returns safe placeholder rows (PREV/PRESENT as null) without guessing.
 * - If coverage is complete, calculates PREV accurately from rolling baseline + movements + prior drafts.
 * Calculates PRESENT accurately from PREV + received + transfer_in - delivery - transfer_out.
 * Isolates drafts per date so switching dates never carries over inputs visually.
 */
export async function getCachedNeedleSheet(params: {
  userId: string
  date: string
  floorId: string
  category: DailyEntryCategory
}): Promise<CachedNeedleSheetResult> {
  const db = await openDB()
  const comboKey = `${params.floorId}:${params.category}`

  return new Promise((resolve, reject) => {
    const existingStores = db.objectStoreNames
    const storesToOpen = [
      STORE_META,
      STORE_SNAPSHOTS,
      STORE_ASSIGNMENTS,
      STORE_NORMAL_MASTER,
      STORE_IDLE_MASTER,
      STORE_DRAFTS,
      STORE_QUEUE,
      STORE_STOCK_BASELINES,
      STORE_STOCK_MOVEMENTS,
      STORE_SHEET_HEADERS,
      STORE_COVERAGE,
      STORE_DAILY_SNAPSHOTS,
    ].filter((s) => existingStores.contains(s))

    const tx = db.transaction(storesToOpen, 'readonly')

    const metaStore = tx.objectStore(STORE_META)
    const assignStore = tx.objectStore(STORE_ASSIGNMENTS)
    const normalStore = tx.objectStore(STORE_NORMAL_MASTER)
    const idleStore = tx.objectStore(STORE_IDLE_MASTER)
    const snapStore = existingStores.contains(STORE_SNAPSHOTS) ? tx.objectStore(STORE_SNAPSHOTS) : null
    const draftStore = existingStores.contains(STORE_DRAFTS) ? tx.objectStore(STORE_DRAFTS) : null
    const queueStore = existingStores.contains(STORE_QUEUE) ? tx.objectStore(STORE_QUEUE) : null
    const baseStore = existingStores.contains(STORE_STOCK_BASELINES) ? tx.objectStore(STORE_STOCK_BASELINES) : null
    const moveStore = existingStores.contains(STORE_STOCK_MOVEMENTS) ? tx.objectStore(STORE_STOCK_MOVEMENTS) : null
    const headerStore = existingStores.contains(STORE_SHEET_HEADERS) ? tx.objectStore(STORE_SHEET_HEADERS) : null
    const dailySnapStore = existingStores.contains(STORE_DAILY_SNAPSHOTS) ? tx.objectStore(STORE_DAILY_SNAPSHOTS) : null

    const metaReq = metaStore.get(params.userId)

    metaReq.onsuccess = () => {
      const meta: CachedMasterMeta | undefined = metaReq.result

      // Authorization guard: if user metadata exists, ensure user is authorized for floor
      if (
        meta &&
        meta.authorized_floor_ids &&
        meta.authorized_floor_ids.length > 0 &&
        !meta.authorized_floor_ids.includes(params.floorId)
      ) {
        return resolve({ status: 'not_cached', rows: [], requisitionNo: null })
      }

      // 2. Check floor assignments
      const assignIndex = assignStore.index('floor_category')
      const assignReq = assignIndex.getAll([params.floorId, params.category])

      assignReq.onsuccess = () => {
        const assignments: CachedFloorAssignment[] = assignReq.result || []

        if (assignments.length === 0) {
          const isComboCached = meta?.cached_combinations?.includes(comboKey)
          if (isComboCached) {
            return resolve({ status: 'empty_assignment', rows: [], requisitionNo: null })
          }
          return resolve({ status: 'not_cached', rows: [], requisitionNo: null })
        }

        // Fetch master item specifications
        const masterStore = params.category === 'IDLE' ? idleStore : normalStore
        const itemsReq = masterStore.getAll()

        itemsReq.onsuccess = () => {
          const allItems: CachedMasterNeedleItem[] = itemsReq.result || []
          const assignedIds = new Set(assignments.map((a) => a.needle_item_id))
          const matchedItems = allItems.filter(
            (item) => assignedIds.has(item.id) && item.active !== false
          )

          if (matchedItems.length === 0) {
            return resolve({ status: 'empty_assignment', rows: [], requisitionNo: null })
          }

          matchedItems.sort((a, b) => a.item_code.localeCompare(b.item_code))

          // 3. COVERAGE VALIDATION GUARD
          // Offline stock calculation is allowed ONLY when coverage is complete for this date
          // or an authoritative sheet snapshot exists for this sheet!
          const covStore = existingStores.contains(STORE_COVERAGE)
            ? tx.objectStore(STORE_COVERAGE)
            : null
          const covId = `${params.userId}:${params.floorId}:${params.category}`
          const sheetKey = generateSheetKey(params.userId, params.date, params.floorId, params.category)

          const checkCoverageAndProceed = (
            covRecord: StockCacheCoverageRecord | null | undefined,
            hasCachedSnapshot: boolean
          ) => {
            const showCoverageIncomplete = () => {
              // Stock history is incomplete for this date!
              // DO NOT calculate from partial cache or guess!
              // Keep needle list visible with placeholders '—' for PREV and PRESENT
              const placeholderRows: DailyEntryRowItem[] = matchedItems.map((item) => ({
                needle_item_id: item.id,
                item_code: item.item_code,
                needle_type: item.needle_type,
                size_dia: item.size_dia,
                brand: item.brand,
                previous: 0,
                received: 0,
                delivery: 0,
                present: 0,
                bnr: 0,
                req_no: null,
                transfer_in: 0,
                transfer_out: 0,
                last_transfer_note: null,
                is_stock_known: false,
              }))

              return resolve({
                status: 'coverage_incomplete',
                rows: placeholderRows,
                requisitionNo: null,
                coverageError: 'Connect to network to load stock data for this date.',
              })
            }

            const hasCompleteCoverage = hasCachedSnapshot || isDateWithinCoverage(covRecord, params.date)

            if (!hasCompleteCoverage) {
              // Section 2: If user creates future-date data locally while offline, continue using existing local draft/stock-chain
              if (
                draftStore &&
                covRecord &&
                covRecord.sync_status === 'complete' &&
                params.date > covRecord.coverage_end
              ) {
                const draftKey = generateSheetKey(params.userId, params.date, params.floorId, params.category)
                const dReq = draftStore.get(draftKey)
                dReq.onsuccess = () => {
                  const draft = dReq.result as LocalDailySheetDraft | undefined
                  if (draft && draft.cells && Object.keys(draft.cells).length > 0) {
                    return gatherSupportingDataAndCalculate()
                  }
                  showCoverageIncomplete()
                }
                dReq.onerror = () => showCoverageIncomplete()
                return
              }

              return showCoverageIncomplete()
            }

            // Coverage is complete: Proceed with forward stock calculation
            gatherSupportingDataAndCalculate()
          }

          let covRecord: StockCacheCoverageRecord | null | undefined = null
          let hasCachedSnapshot = false
          let covDone = false
          let snapDone = false

          const checkBothDone = () => {
            if (covDone && snapDone) {
              checkCoverageAndProceed(covRecord, hasCachedSnapshot)
            }
          }

          if (covStore) {
            const covReq = covStore.get(covId)
            covReq.onsuccess = () => {
              covRecord = covReq.result || null
              covDone = true
              checkBothDone()
            }
            covReq.onerror = () => {
              covRecord = null
              covDone = true
              checkBothDone()
            }
          } else {
            covDone = true
            checkBothDone()
          }

          if (snapStore) {
            const snapReq = snapStore.get(sheetKey)
            snapReq.onsuccess = () => {
              hasCachedSnapshot = Boolean(snapReq.result && snapReq.result.rows && snapReq.result.rows.length > 0)
              snapDone = true
              checkBothDone()
            }
            snapReq.onerror = () => {
              hasCachedSnapshot = false
              snapDone = true
              checkBothDone()
            }
          } else {
            snapDone = true
            checkBothDone()
          }

          function gatherSupportingDataAndCalculate() {
            // Gather supporting data asynchronously
            let baselines: StockBaselineRecord[] = []
            let movements: StockMovementRecord[] = []
            let sheetHeader: CachedSheetHeader | null = null
            let allSnapshots: CachedSheetSnapshot[] = []
            let allDrafts: LocalDailySheetDraft[] = []
            let queueOps: PendingSyncOperation[] = []
            let dailySnapshots: DailyStockSnapshotRecord[] = []

            let remainingQueries = 7

            function onQueryDone() {
              remainingQueries--
              if (remainingQueries === 0) {
                computeAndResolveRows()
              }
            }

            // 1. Baselines
            if (baseStore) {
              const bReq = baseStore.index('floor_category').getAll([params.floorId, params.category])
              bReq.onsuccess = () => {
                baselines = bReq.result || []
                onQueryDone()
              }
              bReq.onerror = () => onQueryDone()
            } else {
              onQueryDone()
            }

            // 2. Movements
            if (moveStore) {
              const mReq = moveStore.index('floor_category').getAll([params.floorId, params.category])
              mReq.onsuccess = () => {
                movements = mReq.result || []
                onQueryDone()
              }
              mReq.onerror = () => onQueryDone()
            } else {
              onQueryDone()
            }

            // 3. Sheet Header
            if (headerStore) {
              const hReq = headerStore.get(`${params.floorId}:${params.category}:${params.date}`)
              hReq.onsuccess = () => {
                sheetHeader = hReq.result || null
                onQueryDone()
              }
              hReq.onerror = () => onQueryDone()
            } else {
              onQueryDone()
            }

            // 4. All Snapshots for chronological stock-chain resolution
            if (snapStore) {
              const sReq = snapStore.getAll()
              sReq.onsuccess = () => {
                allSnapshots = sReq.result || []
                onQueryDone()
              }
              sReq.onerror = () => onQueryDone()
            } else {
              onQueryDone()
            }

            // 5. All Drafts for chronological stock-chain resolution
            if (draftStore) {
              const dReq = draftStore.getAll()
              dReq.onsuccess = () => {
                allDrafts = dReq.result || []
                onQueryDone()
              }
              dReq.onerror = () => onQueryDone()
            } else {
              onQueryDone()
            }

            // 6. Queue Ops
            if (queueStore) {
              const qReq = queueStore.getAll()
              qReq.onsuccess = () => {
                queueOps = qReq.result || []
                onQueryDone()
              }
              qReq.onerror = () => onQueryDone()
            } else {
              onQueryDone()
            }

            // 7. Authoritative Daily Stock Snapshots
            if (dailySnapStore) {
              const dsReq = dailySnapStore.getAll()
              dsReq.onsuccess = () => {
                dailySnapshots = dsReq.result || []
                onQueryDone()
              }
              dsReq.onerror = () => onQueryDone()
            } else {
              onQueryDone()
            }

            function computeAndResolveRows() {
              // Filter local store records for the target floor and category
              const floorSnapshots = allSnapshots.filter(
                (s) => s.floor_id === params.floorId && s.category === params.category
              )
              const floorDrafts = allDrafts.filter(
                (d) => d.floor_id === params.floorId && d.category === params.category
              )
              const floorQueueOps = queueOps.filter(
                (q) =>
                  q.floor_id === params.floorId &&
                  q.category === params.category &&
                  q.status !== 'conflict'
              )
              const floorDailySnaps = dailySnapshots.filter(
                (s) => s.floor_id === params.floorId && s.category === params.category
              )

              // Map baselines by needle_item_id
              const baselineMap = new Map<string, { balance: number; date: string }>()
              baselines.forEach((b) => {
                baselineMap.set(b.needle_item_id, { balance: b.balance, date: b.baseline_date })
              })

              // Index daily snapshots by `${date}:${needle_item_id}`
              const snapByDateNeedle = new Map<string, DailyStockSnapshotRecord>()
              floorDailySnaps.forEach((s) => {
                snapByDateNeedle.set(`${s.date}:${s.needle_item_id}`, s)
              })

              const computedRows: DailyEntryRowItem[] = matchedItems.map((item) => {
                // Check if this needle has any unsynced drafts or pending queue operations on or before params.date
                const priorOrCurDraftDates = floorDrafts
                  .filter((d) => d.entry_date <= params.date && d.cells?.[item.id] && Object.keys(d.cells[item.id]).length > 0)
                  .map((d) => d.entry_date)
                const priorOrCurQueueDates = floorQueueOps
                  .filter((q) => q.entry_date <= params.date && q.needle_item_id === item.id)
                  .map((q) => q.entry_date)

                const allEditDates = Array.from(new Set([...priorOrCurDraftDates, ...priorOrCurQueueDates])).sort()

                // Helper to resolve effective values on date t
                function resolveDayValues(t: string) {
                  let rcvd: number | undefined
                  let dvld: number | undefined
                  let bnr: number | undefined
                  let trfIn: number | undefined
                  let trfOut: number | undefined
                  let reqNo: string | null | undefined
                  let note: string | null = null

                  // Priority 1: Pending Draft / Queue
                  const draft = floorDrafts.find((d) => d.entry_date === t)
                  const cell = draft?.cells?.[item.id]
                  const qOps = floorQueueOps.filter((q) => q.entry_date === t && q.needle_item_id === item.id)

                  if (cell) {
                    if (cell.received !== undefined) rcvd = cell.received
                    if (cell.delivery !== undefined) dvld = cell.delivery
                    if (cell.bnr !== undefined) bnr = cell.bnr
                    if (cell.req_no !== undefined) reqNo = cell.req_no
                  }
                  for (const q of qOps) {
                    if (q.field === 'received') rcvd = q.value
                    if (q.field === 'delivery') dvld = q.value
                    if (q.field === 'bnr') bnr = q.value
                    if (q.req_no) reqNo = q.req_no
                  }

                  // Priority 2: Authoritative Daily Stock Snapshot
                  const snap = snapByDateNeedle.get(`${t}:${item.id}`)
                  if (snap) {
                    if (rcvd === undefined) rcvd = snap.received
                    if (dvld === undefined) dvld = snap.delivery
                    if (bnr === undefined) bnr = snap.bnr
                    if (trfIn === undefined) trfIn = snap.transfer_in
                    if (trfOut === undefined) trfOut = snap.transfer_out
                    if (reqNo === undefined) reqNo = snap.req_no
                    note = snap.last_transfer_note || null
                  }

                  // Priority 3: Fallback from legacy sheet snapshot if daily snapshot absent
                  if (snap === undefined) {
                    const legSnap = floorSnapshots.find((s) => s.entry_date === t)
                    const snapRow = legSnap?.rows?.find((r) => r.needle_item_id === item.id)
                    if (snapRow) {
                      if (rcvd === undefined) rcvd = snapRow.received
                      if (dvld === undefined) dvld = snapRow.delivery
                      if (bnr === undefined) bnr = snapRow.bnr
                      if (trfIn === undefined) trfIn = snapRow.transfer_in
                      if (trfOut === undefined) trfOut = snapRow.transfer_out
                      if (reqNo === undefined) reqNo = snapRow.req_no
                      note = snapRow.last_transfer_note || null
                    }
                  }

                  // Priority 4: Fallback from movements
                  const dayMoves = movements.filter(
                    (m) => m.transaction_date === t && m.needle_item_id === item.id
                  )
                  if (dayMoves.length > 0) {
                    if (rcvd === undefined) {
                      rcvd = dayMoves.filter((m) => m.transaction_type === 'RECEIVE').reduce((acc, m) => acc + m.quantity, 0)
                    }
                    if (dvld === undefined) {
                      dvld = dayMoves.filter((m) => m.transaction_type === 'ISSUE').reduce((acc, m) => acc + m.quantity, 0)
                    }
                    if (trfIn === undefined) {
                      trfIn = dayMoves.filter((m) => m.transaction_type === 'TRANSFER_IN').reduce((acc, m) => acc + m.quantity, 0)
                    }
                    if (trfOut === undefined) {
                      trfOut = dayMoves.filter((m) => m.transaction_type === 'TRANSFER_OUT').reduce((acc, m) => acc + m.quantity, 0)
                    }
                    if (reqNo === undefined) {
                      reqNo = dayMoves.find((m) => m.transaction_type === 'RECEIVE' && m.req_no)?.req_no
                    }
                  }

                  const finalRcvd = rcvd ?? 0
                  const finalDvld = dvld ?? 0
                  const finalBnr = bnr ?? 0
                  const finalTrfIn = trfIn ?? 0
                  const finalTrfOut = trfOut ?? 0
                  const delta = finalRcvd + finalTrfIn - finalDvld - finalTrfOut

                  return {
                    rcvd: finalRcvd,
                    dvld: finalDvld,
                    bnr: finalBnr,
                    trfIn: finalTrfIn,
                    trfOut: finalTrfOut,
                    reqNo: reqNo || null,
                    note,
                    delta,
                  }
                }

                // CASE 1: No unsynced local edits on or before params.date
                if (allEditDates.length === 0) {
                  const snap = snapByDateNeedle.get(`${params.date}:${item.id}`)
                  if (snap) {
                    return {
                      needle_item_id: item.id,
                      item_code: item.item_code,
                      needle_type: item.needle_type,
                      size_dia: item.size_dia,
                      brand: item.brand,
                      previous: snap.previous,
                      received: snap.received,
                      delivery: snap.delivery,
                      present: snap.present,
                      bnr: snap.bnr,
                      req_no: snap.req_no,
                      transfer_in: snap.transfer_in,
                      transfer_out: snap.transfer_out,
                      last_transfer_note: snap.last_transfer_note,
                      is_stock_known: true,
                    }
                  }

                  // Fallback: check legacy snapshot for target date
                  const legSnap = floorSnapshots.find((s) => s.entry_date === params.date)
                  const legRow = legSnap?.rows?.find((r) => r.needle_item_id === item.id)
                  if (legRow) {
                    return {
                      needle_item_id: item.id,
                      item_code: item.item_code,
                      needle_type: item.needle_type,
                      size_dia: item.size_dia,
                      brand: item.brand,
                      previous: legRow.previous,
                      received: legRow.received,
                      delivery: legRow.delivery,
                      present: legRow.present,
                      bnr: legRow.bnr,
                      req_no: legRow.req_no,
                      transfer_in: legRow.transfer_in,
                      transfer_out: legRow.transfer_out,
                      last_transfer_note: legRow.last_transfer_note,
                      is_stock_known: true,
                    }
                  }

                  // Date without authoritative snapshot: do NOT guess stock or reuse other dates
                  return {
                    needle_item_id: item.id,
                    item_code: item.item_code,
                    needle_type: item.needle_type,
                    size_dia: item.size_dia,
                    brand: item.brand,
                    previous: 0,
                    received: 0,
                    delivery: 0,
                    present: 0,
                    bnr: 0,
                    req_no: null,
                    transfer_in: 0,
                    transfer_out: 0,
                    last_transfer_note: null,
                    is_stock_known: false,
                  }
                }

                // CASE 2: Unsynced local edits exist on or before params.date
                // Anchor at the earliest edit date T_edit
                const T_edit = allEditDates[0]
                const editSnap = snapByDateNeedle.get(`${T_edit}:${item.id}`)
                const editLegSnap = floorSnapshots.find((s) => s.entry_date === T_edit)
                const editLegRow = editLegSnap?.rows?.find((r) => r.needle_item_id === item.id)

                let runningBalance = 0
                if (editSnap) {
                  runningBalance = editSnap.previous
                } else if (editLegRow) {
                  runningBalance = editLegRow.previous
                } else {
                  // If no snapshot on T_edit, find latest before T_edit or baseline
                  const priorDaily = floorDailySnaps
                    .filter((s) => s.needle_item_id === item.id && s.date < T_edit)
                    .sort((a, b) => b.date.localeCompare(a.date))
                  const priorLeg = floorSnapshots
                    .filter((s) => s.entry_date < T_edit && s.rows?.some((r) => r.needle_item_id === item.id))
                    .sort((a, b) => b.entry_date.localeCompare(a.entry_date))

                  if (priorDaily.length > 0 && priorLeg.length > 0) {
                    runningBalance = priorDaily[0].date >= priorLeg[0].entry_date
                      ? priorDaily[0].present
                      : priorLeg[0].rows.find((r) => r.needle_item_id === item.id)!.present
                  } else if (priorDaily.length > 0) {
                    runningBalance = priorDaily[0].present
                  } else if (priorLeg.length > 0) {
                    runningBalance = priorLeg[0].rows.find((r) => r.needle_item_id === item.id)!.present
                  } else if (baselineMap.has(item.id)) {
                    runningBalance = baselineMap.get(item.id)!.balance
                  }
                }

                // Distinct dates from T_edit up to params.date
                const datesToAccumulate = new Set<string>()
                allEditDates.forEach((d) => datesToAccumulate.add(d))
                floorDailySnaps
                  .filter((s) => s.needle_item_id === item.id && s.date >= T_edit && s.date < params.date)
                  .forEach((s) => datesToAccumulate.add(s.date))
                floorSnapshots
                  .filter((s) => s.entry_date >= T_edit && s.entry_date < params.date && s.rows?.some((r) => r.needle_item_id === item.id))
                  .forEach((s) => datesToAccumulate.add(s.entry_date))

                const priorDates = Array.from(datesToAccumulate)
                  .filter((d) => d >= T_edit && d < params.date)
                  .sort()

                for (const pDate of priorDates) {
                  const dayVal = resolveDayValues(pDate)
                  runningBalance += dayVal.delta
                }

                const prev = runningBalance
                const targetDay = resolveDayValues(params.date)
                const present = prev + targetDay.rcvd + targetDay.trfIn - targetDay.dvld - targetDay.trfOut

                return {
                  needle_item_id: item.id,
                  item_code: item.item_code,
                  needle_type: item.needle_type,
                  size_dia: item.size_dia,
                  brand: item.brand,
                  previous: prev,
                  received: targetDay.rcvd,
                  delivery: targetDay.dvld,
                  present,
                  bnr: targetDay.bnr,
                  req_no: targetDay.reqNo,
                  transfer_in: targetDay.trfIn,
                  transfer_out: targetDay.trfOut,
                  last_transfer_note: targetDay.note,
                  is_stock_known: true,
                }
              })

              // Resolve requisition number for target date
              const targetSnap = snapByDateNeedle.get(`${params.date}:${matchedItems[0]?.id}`)
              const targetDraft = floorDrafts.find((d) => d.entry_date === params.date)
              const resolvedSheetReqNo: string | null =
                (targetDraft?.cells &&
                  Object.values(targetDraft.cells).find((c) => c.req_no)?.req_no) ||
                sheetHeader?.req_no ||
                targetSnap?.req_no ||
                null

              if (resolvedSheetReqNo) {
                computedRows.forEach((r) => {
                  if (r.received > 0 && !r.req_no) {
                    r.req_no = resolvedSheetReqNo
                  }
                })
              }

              resolve({
                status: 'cached',
                rows: computedRows,
                requisitionNo: resolvedSheetReqNo,
              })
            }
          }
        }
      }
    }

    tx.oncomplete = () => {
      db.close()
    }

    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to query cached needle sheet.'))
    }
  })
}

/**
 * Automatically clean expired stock-history cache data older than 1 month,
 * while safely preserving:
 * 1. Required baselines for the current rolling window start.
 * 2. Unsynced local daily drafts (STORE_DRAFTS).
 * 3. Pending sync operations, conflicts, and retry items (STORE_QUEUE).
 * 4. Bounded future window (Current Date + 1 Month).
 */
export async function cleanExpiredStockCache(currentDateStr?: string): Promise<{
  deletedMovements: number
  deletedHeaders: number
  deletedSnapshots: number
}> {
  const db = await openDB()
  const { windowStartDate, windowEndDate } = getOfflineRollingWindow(currentDateStr)

  return new Promise((resolve, reject) => {
    const existingStores = db.objectStoreNames
    const storesToOpen = [
      STORE_DRAFTS,
      STORE_QUEUE,
      STORE_STOCK_BASELINES,
      STORE_STOCK_MOVEMENTS,
      STORE_SHEET_HEADERS,
      STORE_SNAPSHOTS,
      STORE_DAILY_SNAPSHOTS,
    ].filter((s) => existingStores.contains(s))

    const tx = db.transaction(storesToOpen, 'readwrite')

    const draftStore = existingStores.contains(STORE_DRAFTS) ? tx.objectStore(STORE_DRAFTS) : null
    const queueStore = existingStores.contains(STORE_QUEUE) ? tx.objectStore(STORE_QUEUE) : null
    const baseStore = existingStores.contains(STORE_STOCK_BASELINES) ? tx.objectStore(STORE_STOCK_BASELINES) : null
    const moveStore = existingStores.contains(STORE_STOCK_MOVEMENTS) ? tx.objectStore(STORE_STOCK_MOVEMENTS) : null
    const headerStore = existingStores.contains(STORE_SHEET_HEADERS) ? tx.objectStore(STORE_SHEET_HEADERS) : null
    const snapStore = existingStores.contains(STORE_SNAPSHOTS) ? tx.objectStore(STORE_SNAPSHOTS) : null
    const dailySnapStore = existingStores.contains(STORE_DAILY_SNAPSHOTS) ? tx.objectStore(STORE_DAILY_SNAPSHOTS) : null

    const protectedDates = new Set<string>()
    const validBaselineCombos = new Set<string>()

    let draftsLoaded = false
    let queueLoaded = false
    let baselinesLoaded = false

    function checkReadyAndPrune() {
      if (!draftsLoaded || !queueLoaded || !baselinesLoaded) return

      let deletedMovements = 0
      let deletedHeaders = 0
      let deletedSnapshots = 0

      // 1. Prune stock movements older than windowStartDate or newer than windowEndDate
      if (moveStore) {
        const moveReq = moveStore.getAll()
        moveReq.onsuccess = () => {
          const movements: StockMovementRecord[] = moveReq.result || []
          movements.forEach((m) => {
            const isOld = m.transaction_date < windowStartDate
            const isTooFarFuture = m.transaction_date > windowEndDate

            if (isOld || isTooFarFuture) {
              if (protectedDates.has(m.transaction_date)) return

              if (isOld) {
                const combo = `${m.floor_id}:${m.category}`
                if (!validBaselineCombos.has(combo)) {
                  // Do not delete old movement without confirmed new baseline!
                  return
                }
              }

              moveStore.delete(m.id)
              deletedMovements++
            }
          })
        }
      }

      // 2. Prune sheet headers outside window
      if (headerStore) {
        const hReq = headerStore.getAll()
        hReq.onsuccess = () => {
          const headers: CachedSheetHeader[] = hReq.result || []
          headers.forEach((h) => {
            if (
              (h.entry_date < windowStartDate || h.entry_date > windowEndDate) &&
              !protectedDates.has(h.entry_date)
            ) {
              headerStore.delete(h.id)
              deletedHeaders++
            }
          })
        }
      }

      // 3. Prune sheet snapshots outside window
      if (snapStore) {
        const sReq = snapStore.getAll()
        sReq.onsuccess = () => {
          const snapshots: CachedSheetSnapshot[] = sReq.result || []
          snapshots.forEach((s) => {
            if (
              (s.entry_date < windowStartDate || s.entry_date > windowEndDate) &&
              !protectedDates.has(s.entry_date)
            ) {
              snapStore.delete(s.sheet_key)
              deletedSnapshots++
            }
          })
        }
      }

      // 3b. Prune daily stock snapshots outside window
      if (dailySnapStore) {
        const dsReq = dailySnapStore.getAll()
        dsReq.onsuccess = () => {
          const dSnaps: DailyStockSnapshotRecord[] = dsReq.result || []
          dSnaps.forEach((ds) => {
            if (
              (ds.date < windowStartDate || ds.date > windowEndDate) &&
              !protectedDates.has(ds.date)
            ) {
              dailySnapStore.delete(ds.id)
            }
          })
        }
      }

      // 4. Prune old baselines < windowStartDate only if a baseline with baseline_date >= windowStartDate exists for the needle
      if (baseStore) {
        const bReq = baseStore.getAll()
        bReq.onsuccess = () => {
          const baselines: StockBaselineRecord[] = bReq.result || []
          const needlesWithCurrentBaseline = new Set<string>()
          baselines.forEach((b) => {
            if (b.baseline_date >= windowStartDate) {
              needlesWithCurrentBaseline.add(`${b.floor_id}:${b.category}:${b.needle_item_id}`)
            }
          })

          baselines.forEach((b) => {
            if (b.baseline_date < windowStartDate) {
              const needleKey = `${b.floor_id}:${b.category}:${b.needle_item_id}`
              if (needlesWithCurrentBaseline.has(needleKey)) {
                baseStore.delete(b.id)
              }
            }
          })
        }
      }

      tx.oncomplete = () => {
        db.close()
        resolve({ deletedMovements, deletedHeaders, deletedSnapshots })
      }
    }

    if (draftStore) {
      const dReq = draftStore.getAll()
      dReq.onsuccess = () => {
        const drafts: LocalDailySheetDraft[] = dReq.result || []
        drafts.forEach((d) => {
          if (d.cells && Object.keys(d.cells).length > 0) {
            protectedDates.add(d.entry_date)
          }
        })
        draftsLoaded = true
        checkReadyAndPrune()
      }
      dReq.onerror = () => {
        draftsLoaded = true
        checkReadyAndPrune()
      }
    } else {
      draftsLoaded = true
    }

    if (queueStore) {
      const qReq = queueStore.getAll()
      qReq.onsuccess = () => {
        const ops: PendingSyncOperation[] = qReq.result || []
        ops.forEach((op) => {
          protectedDates.add(op.entry_date)
        })
        queueLoaded = true
        checkReadyAndPrune()
      }
      qReq.onerror = () => {
        queueLoaded = true
        checkReadyAndPrune()
      }
    } else {
      queueLoaded = true
    }

    if (baseStore) {
      const bReq = baseStore.getAll()
      bReq.onsuccess = () => {
        const baselines: StockBaselineRecord[] = bReq.result || []
        baselines.forEach((b) => {
          if (b.baseline_date >= windowStartDate) {
            validBaselineCombos.add(`${b.floor_id}:${b.category}`)
          }
        })
        baselinesLoaded = true
        checkReadyAndPrune()
      }
      bReq.onerror = () => {
        baselinesLoaded = true
        checkReadyAndPrune()
      }
    } else {
      baselinesLoaded = true
    }

    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to clean expired stock cache.'))
    }
  })
}

/**
 * Remove cached metadata when user logs out or switches accounts.
 */
export async function clearStaleMasterCacheForUser(userId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META], 'readwrite')
    tx.objectStore(STORE_META).delete(userId)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('Failed to clear user master cache.'))
    }
  })
}
