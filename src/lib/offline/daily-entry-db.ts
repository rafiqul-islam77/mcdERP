import type {
  DailyEntryCategory,
  LocalDailySheetDraft,
  PendingSyncOperation,
} from '@/types'

const DB_NAME = 'mcd_erp_daily_entry_v1'
const DB_VERSION = 1

const STORE_DRAFTS = 'drafts'
const STORE_QUEUE = 'pending_queue'

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
        // Look for existing pending or failed entry
        const unconfirmed = matches.find(
          (m) => m.status === 'pending' || m.status === 'failed' || m.status === 'syncing'
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
  conflictMessage: string
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
