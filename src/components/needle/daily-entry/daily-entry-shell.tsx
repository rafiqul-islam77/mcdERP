'use client'

import * as React from 'react'
import { DailyEntryHeader } from './daily-entry-header'
import { DailyEntryTable } from './daily-entry-table'
import { TransferModal } from './transfer-modal'
import { RequisitionModal } from './requisition-modal'
import { useToast } from '@/components/ui/toast'
import {
  saveCellDraftAndEnqueueOp,
  getSheetDraft,
  getPendingOperations,
  updateOperationsStatus,
  removeConfirmedOperations,
  markOperationConflict,
  clearSyncedDraftIfClean,
  generateSheetKey,
  getCachedNeedleSheet,
  getCachedMasterMeta,
  saveAuthorizedMasterCatalogToCache,
  saveSheetSnapshotToCache,
  saveOfflineStockHistoryToCache,
  cleanExpiredStockCache,
  getAllStockCacheCoverage,
  getOfflineRollingWindow,
  isWholeUserOfflineReady,
} from '@/lib/offline/daily-entry-db'
import {
  batchSyncDailyEntryAction,
  getAuthorizedContextAction,
  getAuthorizedNeedleMasterCacheAction,
  getDailyEntrySheetAction,
  getOfflineStockHistorySyncAction,
  transferFloorStockAction,
  updateSheetRequisitionNoAction,
  updateRowRequisitionNoAction,
} from '@/app/actions/daily-entry'
import { SaveStatusIndicator, type SaveStatus } from '@/components/needle/save-status-indicator'
import type {
  CurrentUser,
  DailyEntryCategory,
  DailyEntryRowItem,
  Floor,
  PendingSyncOperation,
} from '@/types'
import { Database, RefreshCw } from 'lucide-react'

interface DailyEntryShellProps {
  defaultCategory: DailyEntryCategory
  user: CurrentUser
}

export function DailyEntryShell({
  defaultCategory,
  user,
}: DailyEntryShellProps) {
  const { toast } = useToast()

  // Form selections
  const [date, setDate] = React.useState<string>(() => {
    // Current local ISO date string: YYYY-MM-DD
    const today = new Date()
    return today.toISOString().slice(0, 10)
  })
  const [category, setCategory] = React.useState<DailyEntryCategory>(defaultCategory)
  const [floorId, setFloorId] = React.useState<string>('')

  React.useEffect(() => {
    setCategory(defaultCategory)
  }, [defaultCategory])

  const handleCategoryChange = React.useCallback((newCat: DailyEntryCategory) => {
    setCategory(newCat)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('category', newCat)
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }, [])

  // Context data
  const [authorizedFloors, setAuthorizedFloors] = React.useState<Floor[]>([])
  const [allowedCategories, setAllowedCategories] = React.useState<DailyEntryCategory[]>([])
  const [allActiveFloors, setAllActiveFloors] = React.useState<Floor[]>([])

  const authorizedFloorsRef = React.useRef<Floor[]>([])
  const allowedCategoriesRef = React.useRef<DailyEntryCategory[]>([])

  React.useEffect(() => {
    authorizedFloorsRef.current = authorizedFloors
  }, [authorizedFloors])

  React.useEffect(() => {
    allowedCategoriesRef.current = allowedCategories
  }, [allowedCategories])

  // Offline Ready state (Section 8)
  const [offlineReadiness, setOfflineReadiness] = React.useState<'idle' | 'preparing' | 'ready'>('idle')

  // Sheet data
  const [rows, setRows] = React.useState<DailyEntryRowItem[]>([])
  const [offlineNoCache, setOfflineNoCache] = React.useState<boolean>(false)
  const [coverageIncomplete, setCoverageIncomplete] = React.useState<boolean>(false)
  const [coverageError, setCoverageError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [dbReady, setDbReady] = React.useState(true)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [sheetReqNo, setSheetReqNo] = React.useState<string | null>(null)
  const [requisitionPrompt, setRequisitionPrompt] = React.useState<{ item: DailyEntryRowItem; value: number } | null>(null)
  const [manualReqModalOpen, setManualReqModalOpen] = React.useState(false)
  const [editingRowReqNo, setEditingRowReqNo] = React.useState<DailyEntryRowItem | null>(null)

  // Save & Sync state
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [pendingCount, setPendingCount] = React.useState<number>(0)
  const [conflictCount, setConflictCount] = React.useState<number>(0)

  const isSyncingRef = React.useRef(false)
  const syncDebounceTimer = React.useRef<NodeJS.Timeout | null>(null)

  // Current sheet context key
  const currentSheetKey = React.useMemo(() => {
    if (!user?.profile?.id || !date || !floorId || !category) return ''
    return generateSheetKey(user.profile.id, date, floorId, category)
  }, [user?.profile?.id, date, floorId, category])

  // Current refs for stable callbacks
  const rowsRef = React.useRef(rows)
  rowsRef.current = rows
  const sheetReqNoRef = React.useRef(sheetReqNo)
  sheetReqNoRef.current = sheetReqNo

  // Scroll tracking for floating status indicator (following Needle Master page, Image 4)
  const [isScrolled, setIsScrolled] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Transfer modal
  const [transferItem, setTransferItem] = React.useState<DailyEntryRowItem | null>(null)

  // 1. Initial load of authorized floors & categories
  React.useEffect(() => {
    let isMounted = true
    async function initContext() {
      // 1. Immediate local cache fallback if available
      try {
        const cachedMeta = await getCachedMasterMeta(user?.profile?.id)
        if (isMounted && cachedMeta && cachedMeta.floors && cachedMeta.floors.length > 0) {
          setAuthorizedFloors(cachedMeta.floors)
          setAllowedCategories(cachedMeta.allowed_categories || [])
          setAllActiveFloors(cachedMeta.all_active_floors || cachedMeta.floors)
          setFloorId((prev) => prev || cachedMeta.floors[0].id)
          if (
            cachedMeta.allowed_categories &&
            cachedMeta.allowed_categories.length > 0 &&
            !cachedMeta.allowed_categories.includes(defaultCategory)
          ) {
            setCategory(cachedMeta.allowed_categories[0])
          }
        }
      } catch {}

      // 2. Fetch fresh context online if network is available
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (user?.profile?.id) {
          getCachedMasterMeta(user.profile.id).then((meta) => {
            if (meta && meta.floors && meta.allowed_categories) {
              isWholeUserOfflineReady({
                userId: user.profile.id,
                authorizedFloorIds: meta.floors.map((f: any) => f.id),
                allowedCategories: meta.allowed_categories,
              }).then((ready) => {
                if (isMounted) setOfflineReadiness(ready ? 'ready' : 'idle')
              })
            }
          })
        }
        return
      }

      try {
        const res = await getAuthorizedContextAction()
        if (!isMounted) return
        if (res.success && res.data) {
          const ctxData = res.data
          setAuthorizedFloors(ctxData.floors)
          setAllowedCategories(ctxData.allowedCategories)
          setAllActiveFloors(ctxData.allActiveFloors)

          // Auto-select first authorized floor
          if (ctxData.floors.length > 0) {
            setFloorId((prev) => prev || ctxData.floors[0].id)
          }

          // Ensure selected category is permitted
          if (ctxData.allowedCategories.length > 0 && !ctxData.allowedCategories.includes(defaultCategory)) {
            setCategory(ctxData.allowedCategories[0])
          }

          // In background, populate the broader authorized master catalog cache and 1-month stock history
          getAuthorizedNeedleMasterCacheAction()
            .then((masterRes) => {
              if (masterRes.success && masterRes.data) {
                saveAuthorizedMasterCatalogToCache(masterRes.data).catch(() => {})
              }
            })
            .catch(() => {})

          // Pre-check readiness
          isWholeUserOfflineReady({
            userId: user.profile.id,
            authorizedFloorIds: ctxData.floors.map((f) => f.id),
            allowedCategories: ctxData.allowedCategories,
          }).then((ready) => {
            if (isMounted) setOfflineReadiness(ready ? 'ready' : 'idle')
          })

          triggerBackgroundStockSync()
        } else {
          setAuthorizedFloors((prev) => {
            if (prev.length === 0) {
              toast(res.error || 'Failed to load user permissions.', 'error')
            }
            return prev
          })
        }
      } catch (err: any) {
        if (!isMounted) return
        setAuthorizedFloors((prev) => {
          if (prev.length === 0) {
            toast(err.message || 'Error loading permissions.', 'error')
          }
          return prev
        })
      }
    }
    initContext()
    return () => {
      isMounted = false
    }
  }, [defaultCategory, toast, user?.profile?.id])

  // Helper to refresh queue counts
  const refreshQueueCounts = React.useCallback(async () => {
    if (!currentSheetKey) return
    try {
      const ops = await getPendingOperations(currentSheetKey)
      const pending = ops.filter((o: PendingSyncOperation) => o.status === 'pending' || o.status === 'syncing' || o.status === 'failed')
      const conflicts = ops.filter((o: PendingSyncOperation) => o.status === 'conflict')
      setPendingCount(pending.length)
      setConflictCount(conflicts.length)
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSaveStatus('offline')
      } else if (conflicts.length > 0) {
        setSaveStatus('conflict')
      } else if (pending.length > 0) {
        setSaveStatus('syncing')
      }
    } catch {}
  }, [currentSheetKey])

  // Drain pending sync queue to Supabase
  const drainPendingQueue = React.useCallback(async () => {
    if (!currentSheetKey || isSyncingRef.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSaveStatus('offline')
      return
    }

    try {
      const ops = await getPendingOperations(currentSheetKey)
      const pending = ops.filter((o: PendingSyncOperation) => o.status === 'pending' || o.status === 'failed')

      if (pending.length === 0) {
        const remainingConflicts = ops.filter((o: PendingSyncOperation) => o.status === 'conflict')
        setConflictCount(remainingConflicts.length)
        if (remainingConflicts.length > 0) {
          setSaveStatus('conflict')
        } else {
          setPendingCount(0)
          setSaveStatus('saved')
          await clearSyncedDraftIfClean(currentSheetKey)
        }
        return
      }

      isSyncingRef.current = true
      setSaveStatus('syncing')
      setPendingCount(pending.length)

      const opIds = pending.map((o: PendingSyncOperation) => o.id)
      await updateOperationsStatus(opIds, 'syncing')

      const res = await batchSyncDailyEntryAction({
        date,
        floorId,
        category,
        operations: pending.map((o: PendingSyncOperation) => ({
          id: o.id,
          client_operation_id: o.client_operation_id,
          needle_item_id: o.needle_item_id,
          field: o.field,
          value: o.value,
          req_no: o.req_no,
        })),
      })

      if (res.success && res.data) {
        const confirmedIds: string[] = []
        for (const r of res.data.results) {
          if (r.success) {
            confirmedIds.push(r.id)
          } else if (r.isConflict) {
            await markOperationConflict(r.id, r.error || 'Stock conflict detected.')
          } else {
            await updateOperationsStatus([r.id], 'failed', r.error)
          }
        }

        if (confirmedIds.length > 0) {
          await removeConfirmedOperations(confirmedIds)
        }

        // Apply server recalculated requisition number and rows
        if (res.data.requisitionNo) {
          setSheetReqNo(res.data.requisitionNo)
        }

        if (res.data.rows && res.data.rows.length > 0) {
          setRows(res.data.rows)
          if (user?.profile?.id) {
            saveSheetSnapshotToCache({
              userId: user.profile.id,
              date,
              floorId,
              category,
              rows: res.data.rows,
              requisitionNo: res.data.requisitionNo || sheetReqNoRef.current || null,
            }).catch(() => {})
          }
        }

        setLastSavedAt(new Date())

        // Re-check remaining queue items
        const remaining = await getPendingOperations(currentSheetKey)
        const activeUnconfirmed = remaining.filter((o: PendingSyncOperation) => o.status === 'pending' || o.status === 'failed')
        const conflicts = remaining.filter((o: PendingSyncOperation) => o.status === 'conflict')

        setPendingCount(activeUnconfirmed.length)
        setConflictCount(conflicts.length)

        if (conflicts.length > 0) {
          setSaveStatus('conflict')
          setSaveError(conflicts[0].error || 'Stock conflict')
        } else if (activeUnconfirmed.length > 0) {
          setSaveStatus('error')
        } else {
          setSaveStatus('saved')
          setSaveError(null)
          await clearSyncedDraftIfClean(currentSheetKey)
        }
      } else {
        await updateOperationsStatus(opIds, 'failed', res.error)
        setSaveStatus('error')
        setSaveError(res.error || 'Sync failed')
      }
    } catch (err: any) {
      setSaveStatus('error')
      setSaveError(err.message || 'Sync error')
    } finally {
      isSyncingRef.current = false
    }
  }, [currentSheetKey, date, floorId, category])

  const isStockSyncingRef = React.useRef(false)
  const loadSheetDataRef = React.useRef<() => Promise<void>>(async () => {})

  const triggerBackgroundStockSync = React.useCallback(
    async (opts?: { floorIds?: string[]; categories?: DailyEntryCategory[]; forceFull?: boolean }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      if (!user?.profile?.id) return
      if (isStockSyncingRef.current) return

      isStockSyncingRef.current = true
      setOfflineReadiness('preparing')
      try {
        let since: number | undefined
        if (!opts?.forceFull) {
          const allCoverage = await getAllStockCacheCoverage(user.profile.id)
          const { windowStartDate } = getOfflineRollingWindow()
          const relevantCoverage = opts?.floorIds && opts.floorIds.length > 0
            ? allCoverage.filter((c) => opts.floorIds!.includes(c.floor_id))
            : allCoverage

          const isWindowCurrent =
            relevantCoverage.length > 0 &&
            relevantCoverage.every(
              (c) =>
                c.sync_status === 'complete' &&
                c.coverage_start <= windowStartDate
            )
          if (isWindowCurrent) {
            const timestamps = relevantCoverage.map((c) => c.last_successful_sync_at)
            if (timestamps.length > 0) {
              since = Math.min(...timestamps)
            }
          }
        }

        const res = await getOfflineStockHistorySyncAction({
          floorIds: opts?.floorIds,
          categories: opts?.categories,
          since,
        })

        if (res.success && res.data) {
          await saveOfflineStockHistoryToCache(res.data)
          await cleanExpiredStockCache()

          // Immediately refresh/recalculate visible PREV/PRESENT from updated cache (Section 21)
          await loadSheetDataRef.current()

          // Check whole user offline readiness (Section 11)
          const allFloorIds = authorizedFloorsRef.current.map((f) => f.id)
          const isReady = await isWholeUserOfflineReady({
            userId: user.profile.id,
            authorizedFloorIds: allFloorIds.length > 0 ? allFloorIds : res.data.targetFloorIds,
            allowedCategories: allowedCategoriesRef.current.length > 0 ? allowedCategoriesRef.current : res.data.categories,
          })
          setOfflineReadiness(isReady ? 'ready' : 'idle')
        } else {
          const allFloorIds = authorizedFloorsRef.current.map((f) => f.id)
          const isReady = await isWholeUserOfflineReady({
            userId: user.profile.id,
            authorizedFloorIds: allFloorIds,
            allowedCategories: allowedCategoriesRef.current,
          })
          setOfflineReadiness(isReady ? 'ready' : 'idle')
        }
      } catch (err) {
        console.warn('[triggerBackgroundStockSync] error:', err)
        const allFloorIds = authorizedFloorsRef.current.map((f) => f.id)
        const isReady = await isWholeUserOfflineReady({
          userId: user.profile.id,
          authorizedFloorIds: allFloorIds,
          allowedCategories: allowedCategoriesRef.current,
        })
        setOfflineReadiness(isReady ? 'ready' : 'idle')
      } finally {
        isStockSyncingRef.current = false
      }
    },
    [user?.profile?.id]
  )


  // 2. Fetch sheet rows and recover unsynced local drafts
  const loadSheetData = React.useCallback(async () => {
    if (!floorId || !category || !date) return
    setLoading(true)
    setSaveError(null)
    setRows([]) // Reset state when date/floor/category changes to avoid stale carryover (Section 20)
    setSheetReqNo(null)
    setCoverageIncomplete(false)
    setCoverageError(null)

    let hasLocalCache = false
    if (user?.profile?.id && floorId && category && date) {
      try {
        const cached = await getCachedNeedleSheet({
          userId: user.profile.id,
          date,
          floorId,
          category,
        })

        if (cached.status === 'coverage_incomplete') {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setRows(cached.rows)
            setSheetReqNo(null)
            setCoverageIncomplete(true)
            setCoverageError(cached.coverageError || 'Connect to network to load stock data for this date.')
            setOfflineNoCache(cached.rows.length === 0)
            setLoading(false)
            return
          }
        } else if (cached.status === 'cached' && cached.rows.length > 0) {
          setRows(cached.rows)
          setSheetReqNo(cached.requisitionNo || null)
          setCoverageIncomplete(false)
          setCoverageError(null)
          setOfflineNoCache(false)
          setLoading(false)
          hasLocalCache = true
        } else if (cached.status === 'empty_assignment') {
          setRows([])
          setCoverageIncomplete(false)
          setCoverageError(null)
          setOfflineNoCache(false)
          setLoading(false)
          hasLocalCache = true
        } else if (cached.status === 'not_cached') {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setRows([])
            setCoverageIncomplete(true)
            setCoverageError('Connect to network to load stock data for this date.')
            setOfflineNoCache(true)
            setLoading(false)
            return
          }
        }
      } catch (cacheErr) {
        console.warn('[loadSheetData] local cache read error:', cacheErr)
      }
    }

    // Refresh queue counts
    await refreshQueueCounts()

    // If offline, stop here: we already rendered local cache or set offlineNoCache
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false)
      return
    }

    try {
      const res = await getDailyEntrySheetAction({
        date,
        floorId,
        category,
      })

      if (res.success && res.data) {
        let finalRows = res.data.rows

        // Recover local draft if present in IndexedDB
        if (currentSheetKey) {
          try {
            const draft = await getSheetDraft(currentSheetKey)
            const pendingOps = await getPendingOperations(currentSheetKey)
            const pendingSet = new Set(
              pendingOps.filter((o: PendingSyncOperation) => o.status !== 'conflict').map((o: PendingSyncOperation) => `${o.needle_item_id}-${o.field}`)
            )

            if (draft && draft.cells && Object.keys(draft.cells).length > 0) {
              finalRows = finalRows.map((r) => {
                const cell = draft.cells[r.needle_item_id]
                if (!cell) return r

                const rcvd = pendingSet.has(`${r.needle_item_id}-received`) && cell.received !== undefined ? cell.received : r.received
                const dvld = pendingSet.has(`${r.needle_item_id}-delivery`) && cell.delivery !== undefined ? cell.delivery : r.delivery
                const bnr = pendingSet.has(`${r.needle_item_id}-bnr`) && cell.bnr !== undefined ? cell.bnr : r.bnr
                const present = r.previous + rcvd + r.transfer_in - dvld - r.transfer_out

                return {
                  ...r,
                  received: rcvd,
                  delivery: dvld,
                  bnr,
                  present,
                  req_no: cell.req_no || r.req_no,
                }
              })
            }

            const unconfirmed = pendingOps.filter((o: PendingSyncOperation) => o.status === 'pending' || o.status === 'syncing' || o.status === 'failed')
            const conflicts = pendingOps.filter((o: PendingSyncOperation) => o.status === 'conflict')
            setPendingCount(unconfirmed.length)
            setConflictCount(conflicts.length)

            if (conflicts.length > 0) {
              setSaveStatus('conflict')
            } else if (unconfirmed.length > 0) {
              setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'syncing')
            } else {
              setSaveStatus('idle')
            }
          } catch {}
        }

        setRows(finalRows)
        setSheetReqNo(res.data.requisitionNo || finalRows.find((r) => r.req_no)?.req_no || null)
        setCoverageIncomplete(false)
        setCoverageError(null)
        setOfflineNoCache(false)
        setDbReady(res.data.dbReady)

        // Cache the authoritative sheet snapshot and row specifications
        if (user?.profile?.id) {
          saveSheetSnapshotToCache({
            userId: user.profile.id,
            date,
            floorId,
            category,
            rows: finalRows,
            requisitionNo: res.data.requisitionNo,
          }).catch(() => {})

          // Development parity validation (Section 22)
          if (process.env.NODE_ENV === 'development') {
            getCachedNeedleSheet({
              userId: user.profile.id,
              date,
              floorId,
              category,
            }).then((cachedCheck) => {
              if (cachedCheck.status === 'cached' && cachedCheck.rows.length > 0) {
                const mismatch = cachedCheck.rows.some((cRow) => {
                  const sRow = finalRows.find((r) => r.needle_item_id === cRow.needle_item_id)
                  return sRow && (sRow.previous !== cRow.previous || sRow.present !== cRow.present)
                })
                if (mismatch) {
                  console.warn('[Offline Parity Check] Discrepancy detected between online sheet and local cache for:', {
                    date,
                    floorId,
                    category,
                  })
                }
              }
            }).catch(() => {})
          }
        }

        // If online and pending items exist, trigger sync
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          drainPendingQueue()
        }
      } else {
        if (!hasLocalCache) {
          setRows([])
          toast(res.error || 'Failed to load daily sheet.', 'error')
        } else {
          setSaveStatus('offline')
        }
      }
    } catch (err: any) {
      if (!hasLocalCache) {
        setRows([])
        toast(err.message || 'Error loading daily sheet data.', 'error')
      } else {
        setSaveStatus('offline')
      }
    } finally {
      setLoading(false)
    }
  }, [date, floorId, category, currentSheetKey, drainPendingQueue, toast, user?.profile?.id, refreshQueueCounts])

  React.useEffect(() => {
    loadSheetDataRef.current = loadSheetData
  }, [loadSheetData])

  React.useEffect(() => {
    loadSheetData()
  }, [loadSheetData])

  const handleReload = React.useCallback(async () => {
    await loadSheetData()
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      triggerBackgroundStockSync({ forceFull: false })
    }
  }, [loadSheetData, triggerBackgroundStockSync])

  // Trigger background sync when floor or category changes
  React.useEffect(() => {
    if (floorId && category && typeof navigator !== 'undefined' && navigator.onLine) {
      triggerBackgroundStockSync({ floorIds: [floorId], categories: [category] })
    }
  }, [floorId, category, triggerBackgroundStockSync])


  // Connectivity detection & multi-tab recovery
  React.useEffect(() => {
    const handleOnline = async () => {
      await drainPendingQueue()
      await loadSheetDataRef.current()
      if (user?.profile?.id) {
        getAuthorizedNeedleMasterCacheAction()
          .then((res) => {
            if (res.success && res.data) {
              saveAuthorizedMasterCatalogToCache(res.data).catch(() => {})
            }
          })
          .catch(() => {})

        triggerBackgroundStockSync({ forceFull: false })
      }
    }
    const handleOffline = () => {
      setSaveStatus('offline')
      if (user?.profile?.id) {
        isWholeUserOfflineReady({
          userId: user.profile.id,
          authorizedFloorIds: authorizedFloorsRef.current.map((f) => f.id),
          allowedCategories: allowedCategoriesRef.current,
        }).then((ready) => {
          setOfflineReadiness(ready ? 'ready' : 'idle')
        })
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Unload warning if changes are pending
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingCount > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [drainPendingQueue, pendingCount, user?.profile?.id, loadSheetData])

  // 3. Handle cell changes: Instant React state -> Immediate IndexedDB draft -> Debounced sync
  const handleCellChange = React.useCallback(
    (needleItemId: string, field: 'received' | 'delivery' | 'bnr', value: number) => {
      // 1. Immediate local row recalculation for snappy responsiveness
      setRows((prev) =>
        prev.map((r) => {
          if (r.needle_item_id !== needleItemId) return r

          const newRcvd = field === 'received' ? value : r.received
          const newDvld = field === 'delivery' ? value : r.delivery
          const newBnr = field === 'bnr' ? value : r.bnr
          const newPresent = r.previous + newRcvd + r.transfer_in - newDvld - r.transfer_out
          const newReqNo =
            field === 'received'
              ? newRcvd > 0
                ? r.req_no || sheetReqNoRef.current || null
                : null
              : r.req_no

          return {
            ...r,
            received: newRcvd,
            delivery: newDvld,
            present: newPresent,
            bnr: newBnr,
            req_no: newReqNo,
          }
        })
      )

      // 2. Intercept 1st receive of the floor if no requisition number set yet
      if (field === 'received' && value > 0 && !sheetReqNoRef.current) {
        const targetItem = rowsRef.current.find((r) => r.needle_item_id === needleItemId)
        if (targetItem) {
          setRequisitionPrompt({ item: targetItem, value })
          return
        }
      }

      // 3. Save locally to IndexedDB IMMEDIATELY
      if (user?.profile?.id) {
        const targetReqNo =
          field === 'received'
            ? value > 0
              ? sheetReqNoRef.current || undefined
              : null
            : undefined

        saveCellDraftAndEnqueueOp({
          userId: user.profile.id,
          date,
          floorId,
          category,
          needleItemId,
          field,
          value,
          reqNo: targetReqNo,
        })
          .then(() => {
            refreshQueueCounts()
          })
          .catch(console.error)
      }

      // 4. Update status indicator
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSaveStatus('offline')
      } else {
        setSaveStatus('syncing')
      }

      // 5. Schedule debounced sync (800ms)
      if (syncDebounceTimer.current) {
        clearTimeout(syncDebounceTimer.current)
      }
      syncDebounceTimer.current = setTimeout(() => {
        drainPendingQueue()
      }, 800)
    },
    [user?.profile?.id, date, floorId, category, drainPendingQueue, refreshQueueCounts]
  )

  const handleManualRetry = React.useCallback(async () => {
    if (!currentSheetKey) return
    try {
      const ops = await getPendingOperations(currentSheetKey)
      const retryable = ops.filter((o: PendingSyncOperation) => o.status === 'failed' || o.status === 'conflict')
      if (retryable.length > 0) {
        await updateOperationsStatus(retryable.map((o: PendingSyncOperation) => o.id), 'pending')
      }
      setSaveStatus('syncing')
      drainPendingQueue()
    } catch (err: any) {
      toast(err.message || 'Retry failed', 'error')
    }
  }, [currentSheetKey, drainPendingQueue, toast])


  // 4. Handle Requisition Number Confirmation
  const handleConfirmRequisition = async (enteredReqNo: string, applyToAll: boolean) => {
    if (editingRowReqNo) {
      const rowItem = editingRowReqNo
      setEditingRowReqNo(null)

      if (applyToAll) {
        setSheetReqNo(enteredReqNo)
        setRows((prev) =>
          prev.map((r) => (r.received > 0 ? { ...r, req_no: enteredReqNo } : r))
        )
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.needle_item_id === rowItem.needle_item_id
              ? { ...r, req_no: enteredReqNo }
              : r
          )
        )
      }

      if (user?.profile?.id) {
        saveCellDraftAndEnqueueOp({
          userId: user.profile.id,
          date,
          floorId,
          category,
          needleItemId: rowItem.needle_item_id,
          field: 'received',
          value: rowItem.received,
          reqNo: enteredReqNo,
        })
          .then(() => refreshQueueCounts())
          .catch(console.error)

        saveSheetSnapshotToCache({
          userId: user.profile.id,
          date,
          floorId,
          category,
          rows: rowsRef.current.map((r) =>
            applyToAll
              ? (r.received > 0 ? { ...r, req_no: enteredReqNo } : r)
              : (r.needle_item_id === rowItem.needle_item_id ? { ...r, req_no: enteredReqNo } : r)
          ),
          requisitionNo: applyToAll ? enteredReqNo : (sheetReqNoRef.current || enteredReqNo),
        }).catch(() => {})
      }

      toast(`Requisition number updated: ${enteredReqNo}`, 'success')

      try {
        const res = await updateRowRequisitionNoAction({
          date,
          floorId,
          category,
          needleItemId: rowItem.needle_item_id,
          reqNo: enteredReqNo,
          applyToAll,
        })
        if (!res.success) {
          toast(res.error || 'Failed to sync requisition number online.', 'warning')
        }
      } catch (err: any) {
        toast(err.message || 'Error updating row requisition number.', 'warning')
      }
    } else if (requisitionPrompt) {
      const { item, value } = requisitionPrompt
      setRequisitionPrompt(null)
      sheetReqNoRef.current = enteredReqNo
      setSheetReqNo(enteredReqNo)

      // 1. Immediately update React state with requisition number and recalculated row
      setRows((prev) =>
        prev.map((r) =>
          r.needle_item_id === item.needle_item_id
            ? {
                ...r,
                received: value,
                present: r.previous + value + r.transfer_in - r.delivery - r.transfer_out,
                req_no: enteredReqNo,
              }
            : r.received > 0 && applyToAll
            ? { ...r, req_no: enteredReqNo }
            : r
        )
      )

      // 2. Persist to local IndexedDB draft and pending queue immediately
      if (user?.profile?.id) {
        saveCellDraftAndEnqueueOp({
          userId: user.profile.id,
          date,
          floorId,
          category,
          needleItemId: item.needle_item_id,
          field: 'received',
          value,
          reqNo: enteredReqNo,
        })
          .then(() => refreshQueueCounts())
          .catch(console.error)

        saveSheetSnapshotToCache({
          userId: user.profile.id,
          date,
          floorId,
          category,
          rows: rowsRef.current.map((r) =>
            r.needle_item_id === item.needle_item_id
              ? {
                  ...r,
                  received: value,
                  present: r.previous + value + r.transfer_in - r.delivery - r.transfer_out,
                  req_no: enteredReqNo,
                }
              : r.received > 0 && applyToAll
              ? { ...r, req_no: enteredReqNo }
              : r
          ),
          requisitionNo: enteredReqNo,
        }).catch(() => {})
      }

      toast(`Requisition number set: ${enteredReqNo}`, 'success')

      // 3. Trigger debounced sync to Supabase
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSaveStatus('offline')
      } else {
        setSaveStatus('syncing')
        if (syncDebounceTimer.current) clearTimeout(syncDebounceTimer.current)
        syncDebounceTimer.current = setTimeout(() => {
          drainPendingQueue()
        }, 400)
      }
    } else if (manualReqModalOpen) {
      setManualReqModalOpen(false)
      setSheetReqNo(enteredReqNo)
      setRows((prev) =>
        prev.map((r) => (r.received > 0 ? { ...r, req_no: enteredReqNo } : r))
      )
      if (user?.profile?.id) {
        saveSheetSnapshotToCache({
          userId: user.profile.id,
          date,
          floorId,
          category,
          rows: rowsRef.current.map((r) => (r.received > 0 ? { ...r, req_no: enteredReqNo } : r)),
          requisitionNo: enteredReqNo,
        }).catch(() => {})
      }
      toast(`Requisition number updated: ${enteredReqNo}`, 'success')
      try {
        const res = await updateSheetRequisitionNoAction({
          date,
          floorId,
          category,
          reqNo: enteredReqNo,
        })
        if (!res.success) {
          toast(res.error || 'Failed to sync requisition number online.', 'warning')
        }
      } catch (err: any) {
        toast(err.message || 'Error updating requisition number.', 'warning')
      }
    }
  }

  const handleCloseRequisition = () => {
    if (requisitionPrompt) {
      const { item } = requisitionPrompt
      setRows((prev) =>
        prev.map((r) =>
          r.needle_item_id === item.needle_item_id
            ? {
                ...r,
                received: 0,
                present: r.previous + r.transfer_in - r.delivery - r.transfer_out,
              }
            : r
        )
      )
      toast('Requisition number is mandatory for receiving stock.', 'warning')
      setRequisitionPrompt(null)
    }
    setEditingRowReqNo(null)
    setManualReqModalOpen(false)
  }

  // 5. Handle Floor Transfer
  const handleTransferConfirm = async (data: {
    toFloorId: string
    quantity: number
    receiverName: string
    reqNo?: string
  }) => {
    if (!transferItem) return { success: false, error: 'No item selected' }

    const res = await transferFloorStockAction({
      date,
      fromFloorId: floorId,
      toFloorId: data.toFloorId,
      category,
      needleItemId: transferItem.needle_item_id,
      quantity: data.quantity,
      receiverName: data.receiverName,
      reqNo: data.reqNo,
    })

    if (res.success) {
      toast(
        `Transferred ${data.quantity} of ${transferItem.item_code} successfully.`,
        'success'
      )
      loadSheetData()
    }

    return res
  }

  // Filter rows by search term
  const filteredRows = React.useMemo(() => {
    if (!searchTerm.trim()) return rows
    const term = searchTerm.toLowerCase().trim()
    return rows.filter(
      (r) =>
        r.item_code.toLowerCase().includes(term) ||
        r.needle_type.toLowerCase().includes(term) ||
        (r.size_dia && r.size_dia.toLowerCase().includes(term)) ||
        r.brand.toLowerCase().includes(term)
    )
  }, [rows, searchTerm])

  const currentFloorObj = authorizedFloors.find((f) => f.id === floorId) || null

  return (
    <div className="space-y-1.5 w-full max-w-full">
      {/* Floating Sticky Save Status & Reload on Scroll (following Needle Master, Image 4) */}
      <div
        className={`fixed top-[56px] right-4 lg:right-8 z-40 transition-all duration-300 ease-out ${
          isScrolled
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 shadow-md rounded-full">
          <SaveStatusIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            errorMessage={saveError}
            pendingCount={pendingCount}
            conflictCount={conflictCount}
            onRetry={handleManualRetry}
          />
          <button
            type="button"
            onClick={loadSheetData}
            disabled={loading}
            title="Reload sheet data"
            className="p-1 rounded-full text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Daily Entry Header Bar with inline reload button (Image 3) */}
      <DailyEntryHeader
        date={date}
        onDateChange={setDate}
        floorId={floorId}
        onFloorChange={setFloorId}
        category={category}
        onCategoryChange={handleCategoryChange}
        authorizedFloors={authorizedFloors}
        allowedCategories={allowedCategories}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        saveError={saveError}
        pendingCount={pendingCount}
        conflictCount={conflictCount}
        onRetry={handleManualRetry}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        user={user}
        onReload={handleReload}
        disabled={loading}
        offlineReadiness={offlineReadiness}
      />

      {/* Database Warning Banner (if tables awaiting migration) */}
      {!dbReady && (
        <div className="flex items-start gap-2.5 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded text-xs text-amber-900 dark:text-amber-200">
          <Database className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-xs">
              Daily Entry transaction tables not detected.
            </p>
            <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
              Please execute migration file{' '}
              <code className="px-1 py-0.2 bg-amber-100 dark:bg-amber-900/60 rounded font-mono text-[9px]">
                supabase/migrations/20261023100000_needle_daily_entry_v1.sql
              </code>{' '}
              in your Supabase SQL Editor.
            </p>
          </div>
        </div>
      )}

      {/* Full in-view Spreadsheet Table (Image 2) */}
      <DailyEntryTable
        key={currentSheetKey}
        sheetKey={currentSheetKey}
        rows={filteredRows}
        loading={loading}
        offlineNoCache={offlineNoCache}
        coverageIncomplete={coverageIncomplete}
        coverageMessage={coverageError}
        onCellChange={handleCellChange}
        onOpenTransfer={setTransferItem}
        onEditReqNo={setEditingRowReqNo}
      />

      {/* Requisition Number Modal (Image 1) */}
      <RequisitionModal
        isOpen={Boolean(requisitionPrompt) || Boolean(editingRowReqNo) || manualReqModalOpen}
        onClose={handleCloseRequisition}
        item={requisitionPrompt?.item || editingRowReqNo || rows[0] || null}
        receivedQty={requisitionPrompt?.value || editingRowReqNo?.received || 0}
        initialReqNo={editingRowReqNo?.req_no || sheetReqNo || ''}
        defaultApplyToAll={Boolean(requisitionPrompt || manualReqModalOpen)}
        onConfirm={handleConfirmRequisition}
      />

      {/* Transfer Dialog Modal */}
      <TransferModal
        isOpen={Boolean(transferItem)}
        onClose={() => setTransferItem(null)}
        item={transferItem}
        currentFloor={currentFloorObj}
        activeFloors={allActiveFloors}
        onConfirm={handleTransferConfirm}
      />
    </div>
  )
}
