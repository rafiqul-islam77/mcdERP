'use client'

import * as React from 'react'
import {
  Search,
  Plus,
  RefreshCw,
  Trash2,
  X,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Modal } from '@/components/ui/modal'
import { SaveStatusIndicator, type SaveStatus } from './save-status-indicator'
import {
  getNeedleMasterDataAction,
  inlineUpdateNeedleCellAction,
  createNeedleAction,
  deleteNeedleAction,
  toggleNeedleFloorAction,
  bulkSetNeedleFloorsAction,
} from '@/app/actions/needle'
import type { NeedleGroup, NeedleRowItem, Floor } from '@/types'

interface NeedleTableProps {
  needleGroup: NeedleGroup
  pageTitle: string
  pageDescription: string
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
}

export function NeedleTable({
  needleGroup,
  pageTitle,
  pageDescription,
  canCreate,
  canEdit,
  canDelete,
}: NeedleTableProps) {
  const { toast } = useToast()

  // Data states
  const [items, setItems] = React.useState<NeedleRowItem[]>([])
  const [floors, setFloors] = React.useState<(Floor & { location_name?: string })[]>([])
  const [distinctBrands, setDistinctBrands] = React.useState<string[]>([])
  const [distinctNeedleTypes, setDistinctNeedleTypes] = React.useState<string[]>([])
  const [dbReady, setDbReady] = React.useState(true)
  const [loading, setLoading] = React.useState(true)

  // Scroll tracking for floating status indicator
  const [isScrolled, setIsScrolled] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Filter states
  const [search, setSearch] = React.useState('')
  const [floorFilter, setFloorFilter] = React.useState('')
  const [brandFilter, setBrandFilter] = React.useState('')
  const [needleTypeFilter, setNeedleTypeFilter] = React.useState('')

  // Save states
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  // Draft row state (for "Add Needle")
  const [draftRow, setDraftRow] = React.useState<NeedleRowItem | null>(null)
  const [isSubmittingDraft, setIsSubmittingDraft] = React.useState(false)

  // Delete modal state
  const [itemToDelete, setItemToDelete] = React.useState<NeedleRowItem | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Debounce timers map
  const debounceTimers = React.useRef<Record<string, NodeJS.Timeout>>({})

  // Fetch data
  const fetchData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getNeedleMasterDataAction({
        needleGroup,
        floorId: floorFilter || undefined,
        brand: brandFilter || undefined,
        needleType: needleTypeFilter || undefined,
        search: search || undefined,
      })

      if (res.success && res.data) {
        setItems(res.data.items)
        setFloors(res.data.floors)
        setDistinctBrands(res.data.distinctBrands)
        setDistinctNeedleTypes(res.data.distinctNeedleTypes)
        setDbReady(res.data.dbReady)
      } else {
        setItems([])
        setDbReady(false)
        toast(res.error || 'Failed to load needles.', 'error')
      }
    } catch (err: any) {
      setItems([])
      setDbReady(false)
      toast(err.message || 'Error loading needle records.', 'error')
    } finally {
      setLoading(false)
    }
  }, [needleGroup, floorFilter, brandFilter, needleTypeFilter, search, toast])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle cell edit for text/numbers with smooth debounced auto-save
  const handleCellChange = (
    itemId: string,
    field: string,
    value: any
  ) => {
    if (!canEdit) return

    // 1. Optimistically update local state immediately
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return { ...item, [field]: value }
        }
        return item
      })
    )

    setSaveStatus('draft')

    // 2. Clear existing debounce timer for this field
    const timerKey = `${itemId}-${field}`
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey])
    }

    // 3. Set debounce timer for server save (500ms)
    debounceTimers.current[timerKey] = setTimeout(async () => {
      setSaveStatus('saving')
      setSaveError(null)

      try {
        const res = await inlineUpdateNeedleCellAction({
          item_id: itemId,
          field,
          value,
          needle_group: needleGroup,
        })

        if (res.success) {
          setSaveStatus('saved')
          setLastSavedAt(new Date())
        } else {
          setSaveStatus('error')
          setSaveError(res.error || 'Save failed')
          toast(res.error || 'Unable to save change.', 'error')
        }
      } catch (err: any) {
        setSaveStatus('error')
        setSaveError(err.message || 'Save failed')
      }
    }, 500)
  }

  // Handle cell edit for floors (multi-floor toggle, supporting NEW & RUNNING for normal needles)
  const handleToggleFloor = async (
    itemId: string,
    floorId: string,
    checked: boolean,
    entryType?: 'new' | 'running'
  ) => {
    if (!canEdit) return
    const isNormal = needleGroup === 'needle'
    const eType = entryType || 'new'

    // Optimistically update local state
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          if (isNormal) {
            if (eType === 'new') {
              const current = item.new_floor_ids || []
              const next = checked
                ? Array.from(new Set([...current, floorId]))
                : current.filter((id) => id !== floorId)
              return { ...item, new_floor_ids: next }
            } else {
              const current = item.running_floor_ids || []
              const next = checked
                ? Array.from(new Set([...current, floorId]))
                : current.filter((id) => id !== floorId)
              return { ...item, running_floor_ids: next }
            }
          } else {
            const currentIds = item.floor_ids || []
            const nextIds = checked
              ? Array.from(new Set([...currentIds, floorId]))
              : currentIds.filter((id) => id !== floorId)
            return { ...item, floor_ids: nextIds }
          }
        }
        return item
      })
    )

    setSaveStatus('saving')
    setSaveError(null)

    try {
      const res = await toggleNeedleFloorAction({
        item_id: itemId,
        floor_id: floorId,
        checked,
        needle_group: needleGroup,
        entry_type: isNormal ? eType : undefined,
      })

      if (res.success) {
        setSaveStatus('saved')
        setLastSavedAt(new Date())
        if (res.data?.floor_ids) {
          setItems((prev) =>
            prev.map((item) => {
              if (item.id === itemId) {
                if (isNormal) {
                  return eType === 'new'
                    ? { ...item, new_floor_ids: res.data!.floor_ids }
                    : { ...item, running_floor_ids: res.data!.floor_ids }
                } else {
                  return { ...item, floor_ids: res.data!.floor_ids }
                }
              }
              return item
            })
          )
        }
      } else {
        setSaveStatus('error')
        setSaveError(res.error || 'Floor update failed')
        toast(res.error || 'Failed to update floor assignment.', 'error')
        fetchData()
      }
    } catch (err: any) {
      setSaveStatus('error')
      setSaveError(err.message || 'Floor update failed')
      fetchData()
    }
  }

  // Handle Check All / Clear All Floors for a Needle (supporting NEW & RUNNING)
  const handleBulkSetFloors = async (
    itemId: string,
    newFloorIds: string[],
    entryType?: 'new' | 'running'
  ) => {
    if (!canEdit) return
    const isNormal = needleGroup === 'needle'
    const eType = entryType || 'new'

    // Optimistically update local state
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          if (isNormal) {
            return eType === 'new'
              ? { ...item, new_floor_ids: newFloorIds }
              : { ...item, running_floor_ids: newFloorIds }
          } else {
            return { ...item, floor_ids: newFloorIds }
          }
        }
        return item
      })
    )

    setSaveStatus('saving')
    setSaveError(null)

    try {
      const res = await bulkSetNeedleFloorsAction({
        item_id: itemId,
        floor_ids: newFloorIds,
        needle_group: needleGroup,
        entry_type: isNormal ? eType : undefined,
      })

      if (res.success) {
        setSaveStatus('saved')
        setLastSavedAt(new Date())
      } else {
        setSaveStatus('error')
        setSaveError(res.error || 'Floor update failed')
        toast(res.error || 'Failed to update floors.', 'error')
        fetchData()
      }
    } catch (err: any) {
      setSaveStatus('error')
      setSaveError(err.message || 'Floor update failed')
      fetchData()
    }
  }

  // Add new needle draft row
  const handleAddNewNeedle = () => {
    if (!canCreate) return

    setDraftRow({
      id: 'draft-row',
      item_id: 'draft-item',
      description_item: 'GMTS SEWING NEEDLE',
      item_code: '',
      tac_inventory_item_code: '',
      needle_type: '',
      size_dia: '',
      brand: distinctBrands[0] || 'GROZ(FFG)',
      unit_price_bdt: 0,
      unit_price_usd: 0,
      active: true,
      floor_ids: [],
      new_floor_ids: [],
      running_floor_ids: [],
      needle_group: needleGroup,
      is_draft: true,
    })
    setSaveStatus('draft')
  }

  // Cancel draft row
  const handleCancelDraft = () => {
    setDraftRow(null)
    setSaveStatus('idle')
  }

  // Save draft row
  const handleSaveDraft = async () => {
    if (!draftRow) return

    if (!draftRow.item_code.trim()) {
      toast('Item Code is required.', 'error')
      return
    }
    if (!draftRow.needle_type.trim()) {
      toast('Needle Type is required.', 'error')
      return
    }
    if (!draftRow.size_dia.trim()) {
      toast('Size/Dia is required.', 'error')
      return
    }

    setIsSubmittingDraft(true)
    setSaveStatus('saving')

    try {
      const res = await createNeedleAction({
        description_item: draftRow.description_item,
        item_code: draftRow.item_code,
        tac_inventory_item_code: draftRow.tac_inventory_item_code || null,
        needle_type: draftRow.needle_type,
        size_dia: draftRow.size_dia,
        brand: draftRow.brand,
        unit_price_bdt: draftRow.unit_price_bdt,
        unit_price_usd: draftRow.unit_price_usd,
        floor_ids: draftRow.floor_ids,
        new_floor_ids: draftRow.new_floor_ids,
        running_floor_ids: draftRow.running_floor_ids,
        needle_group: needleGroup,
        active: draftRow.active,
      })

      if (res.success && res.data) {
        setItems((prev) => [res.data!, ...prev])
        setDraftRow(null)
        setSaveStatus('saved')
        setLastSavedAt(new Date())
        toast('New needle item created successfully.', 'success')
      } else {
        setSaveStatus('error')
        toast(res.error || 'Failed to create needle item.', 'error')
      }
    } catch (err: any) {
      setSaveStatus('error')
      toast(err.message || 'Error creating needle item.', 'error')
    } finally {
      setIsSubmittingDraft(false)
    }
  }

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return
    setIsDeleting(true)
    try {
      const res = await deleteNeedleAction({
        item_id: itemToDelete.item_id,
        needle_group: needleGroup,
      })

      if (res.success) {
        setItems((prev) => prev.filter((it) => it.id !== itemToDelete.id))
        toast('Needle record deleted.', 'success')
      } else {
        toast(res.error || 'Failed to delete needle.', 'error')
      }
    } catch (err: any) {
      toast(err.message || 'Error deleting needle.', 'error')
    } finally {
      setIsDeleting(false)
      setItemToDelete(null)
    }
  }

  // Filtered rows
  const totalItems = items.length

  const isFiltered = Boolean(search || floorFilter || brandFilter || needleTypeFilter)

  const clearFilters = () => {
    setSearch('')
    setFloorFilter('')
    setBrandFilter('')
    setNeedleTypeFilter('')
  }

  return (
    <div className="space-y-4">
      {/* Floating Sticky Save Status & Refresh on Scroll (§User Image 1 & 2) */}
      <div
        className={`fixed top-[56px] right-4 lg:right-8 z-40 transition-all duration-300 ease-out ${
          isScrolled
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-md rounded-full">
          <SaveStatusIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            errorMessage={saveError}
          />
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            title="Refresh needle data"
            className="p-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-surface-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-ink">{pageTitle}</h1>
            <Badge variant="neutral" className="font-mono text-xs">
              {totalItems} items
            </Badge>
            {needleGroup === 'ideal_needle' && (
              <Badge variant="info" className="text-xs">
                Idle Spec
              </Badge>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-0.5">{pageDescription}</p>
        </div>

        {/* Top Right Controls & Save Status */}
        <div className="flex items-center gap-3">
          <SaveStatusIndicator
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            errorMessage={saveError}
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            title="Refresh needle data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          {canCreate && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddNewNeedle}
              disabled={Boolean(draftRow) || loading || !dbReady}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Needle</span>
            </Button>
          )}
        </div>
      </div>

      {/* Database Warning Banner (if Supabase migration pending) */}
      {!dbReady && (
        <div className="flex items-start gap-3 p-3 text-xs bg-amber-50 border border-amber-200 rounded-erp text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Needle catalog unavailable. </span>
            Ask your administrator to complete the catalog setup or restore the database connection.
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2.5 p-3 bg-surface-card border border-surface-border rounded-erp shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Search code, type, brand, size..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Floor Filter */}
        <select
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
          className="text-xs bg-white border border-surface-border rounded-erp px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand min-w-[150px]"
        >
          <option value="">All Floors</option>
          <option value="unassigned">-- Unassigned --</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} {f.location_name ? `(${f.location_name})` : ''}
            </option>
          ))}
        </select>

        {/* Brand Filter */}
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="text-xs bg-white border border-surface-border rounded-erp px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand min-w-[120px]"
        >
          <option value="">All Brands</option>
          {distinctBrands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        {/* Needle Type Filter */}
        <select
          value={needleTypeFilter}
          onChange={(e) => setNeedleTypeFilter(e.target.value)}
          className="text-xs bg-white border border-surface-border rounded-erp px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-brand max-w-[180px]"
        >
          <option value="">All Needle Types</option>
          {distinctNeedleTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Clear filters button */}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-xs text-ink-muted hover:text-ink gap-1 px-2 py-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear</span>
          </Button>
        )}
      </div>

      {/* Spreadsheet Editable Table Container */}
      <div className="bg-white border border-surface-border rounded-erp shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-surface-border text-slate-700 font-semibold tracking-wide uppercase text-[11px]">
                <th className="py-2.5 px-3 w-12 text-center">SL</th>
                <th className="py-2.5 px-3 min-w-[140px]">Description Item</th>
                <th className="py-2.5 px-3 min-w-[110px]">Item Code</th>
                <th className="py-2.5 px-3 min-w-[110px]">TAC Inventory Code</th>
                <th className="py-2.5 px-3 min-w-[130px]">Needle Type</th>
                <th className="py-2.5 px-3 w-20 text-center">Size/Dia</th>
                <th className="py-2.5 px-3 min-w-[110px]">Brand</th>
                <th className="py-2.5 px-3 w-28 text-right">Unit Price BDT</th>
                <th className="py-2.5 px-3 w-32 text-right">Unit Price USD</th>
                {/* Floor Column with Multi-Floor Selection Header (NEW & RUNNING for normal needles) */}
                <th className={`py-2.5 px-3 ${needleGroup === 'needle' ? 'min-w-[460px]' : 'min-w-[210px]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      {needleGroup === 'needle' ? 'Floor Allocation (NEW & RUNNING)' : 'Floor'}
                    </span>
                    {needleGroup === 'needle' ? (
                      <div className="flex items-center gap-1.5 text-[9px] font-bold">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wide">
                          NEW Issue
                        </span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
                          RUNNING Issue
                        </span>
                      </div>
                    ) : (
                      <span className="text-[9px] lowercase font-normal text-slate-400">
                        (multi-select)
                      </span>
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-3 w-20 text-center">Status</th>
                {canDelete && <th className="py-2.5 px-3 w-16 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border font-normal">
              {/* Draft New Row (If active) */}
              {draftRow && (
                <tr className="bg-blue-50/70 border-b-2 border-brand/40">
                  <td className="py-2 px-3 text-center text-brand font-bold">New</td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={draftRow.description_item}
                      onChange={(e) =>
                        setDraftRow({ ...draftRow, description_item: e.target.value })
                      }
                      className="w-full px-2 py-1 text-xs bg-white border border-blue-300 rounded focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      placeholder={needleGroup === 'ideal_needle' ? 'e.g. IN-042' : 'e.g. SN-500'}
                      value={draftRow.item_code}
                      onChange={(e) =>
                        setDraftRow({ ...draftRow, item_code: e.target.value.toUpperCase() })
                      }
                      className="w-full px-2 py-1 text-xs bg-white border border-blue-300 rounded font-semibold text-brand focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      placeholder="e.g. SNG-500"
                      value={draftRow.tac_inventory_item_code || ''}
                      onChange={(e) =>
                        setDraftRow({ ...draftRow, tac_inventory_item_code: e.target.value })
                      }
                      className="w-full px-2 py-1 text-xs bg-white border border-blue-300 rounded focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      placeholder="e.g. DB X 1"
                      value={draftRow.needle_type}
                      onChange={(e) =>
                        setDraftRow({ ...draftRow, needle_type: e.target.value })
                      }
                      className="w-full px-2 py-1 text-xs bg-white border border-blue-300 rounded focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      placeholder="e.g. 11"
                      value={draftRow.size_dia}
                      onChange={(e) =>
                        setDraftRow({ ...draftRow, size_dia: e.target.value })
                      }
                      className="w-full px-2 py-1 text-xs bg-white border border-blue-300 rounded focus:ring-1 focus:ring-brand focus:outline-none text-center font-bold"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      placeholder="e.g. GROZ(FFG)"
                      value={draftRow.brand}
                      onChange={(e) => setDraftRow({ ...draftRow, brand: e.target.value })}
                      className="w-full px-2 py-1 text-xs bg-white border border-blue-300 rounded focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      step="0.000001"
                      value={draftRow.unit_price_bdt ?? ''}
                      onChange={(e) =>
                        setDraftRow({
                          ...draftRow,
                          unit_price_bdt: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="w-full px-2 py-1 text-xs text-right bg-white border border-blue-300 rounded focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      step="0.00000001"
                      value={draftRow.unit_price_usd ?? ''}
                      onChange={(e) =>
                        setDraftRow({
                          ...draftRow,
                          unit_price_usd: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="w-full px-2 py-1 text-xs text-right bg-white border border-blue-300 rounded focus:ring-1 focus:ring-brand focus:outline-none"
                    />
                  </td>
                  {/* Draft Floor Checkbox Grid */}
                  <td className="py-2 px-2">
                    {needleGroup === 'needle' ? (
                      <div className="flex items-start gap-4">
                        {/* NEW floors */}
                        <div className="flex-1 bg-emerald-50/40 p-2 rounded border border-emerald-200/60">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1 px-0.5 pb-1 border-b border-emerald-200/50">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                                NEW
                              </span>
                              <span className="font-mono text-[9px] text-slate-400">
                                {(draftRow.new_floor_ids || []).length}/{floors.length}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px]">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftRow({
                                    ...draftRow,
                                    new_floor_ids: floors.map((f) => f.id),
                                  })
                                }
                                className="text-emerald-700 hover:underline font-semibold"
                              >
                                All
                              </button>
                              <span>·</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftRow({ ...draftRow, new_floor_ids: [] })
                                }
                                className="text-slate-400 hover:text-rose-600 hover:underline"
                              >
                                None
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 w-max">
                            {floors.map((f) => {
                              const isChecked = (draftRow.new_floor_ids || []).includes(f.id)
                              const code = f.code || f.name
                              return (
                                <label
                                  key={f.id}
                                  className={`inline-flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap transition-all ${
                                    isChecked
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold'
                                      : 'text-slate-600 hover:bg-white border border-transparent font-medium'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const current = draftRow.new_floor_ids || []
                                      const next = e.target.checked
                                        ? [...current, f.id]
                                        : current.filter((id) => id !== f.id)
                                      setDraftRow({ ...draftRow, new_floor_ids: next })
                                    }}
                                    className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-0 cursor-pointer"
                                  />
                                  <span>{code}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        {/* RUNNING floors */}
                        <div className="flex-1 bg-blue-50/40 p-2 rounded border border-blue-200/60">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1 px-0.5 pb-1 border-b border-blue-200/50">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 uppercase">
                                RUNNING
                              </span>
                              <span className="font-mono text-[9px] text-slate-400">
                                {(draftRow.running_floor_ids || []).length}/{floors.length}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px]">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftRow({
                                    ...draftRow,
                                    running_floor_ids: floors.map((f) => f.id),
                                  })
                                }
                                className="text-blue-700 hover:underline font-semibold"
                              >
                                All
                              </button>
                              <span>·</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftRow({ ...draftRow, running_floor_ids: [] })
                                }
                                className="text-slate-400 hover:text-rose-600 hover:underline"
                              >
                                None
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 w-max">
                            {floors.map((f) => {
                              const isChecked = (draftRow.running_floor_ids || []).includes(f.id)
                              const code = f.code || f.name
                              return (
                                <label
                                  key={f.id}
                                  className={`inline-flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap transition-all ${
                                    isChecked
                                      ? 'bg-blue-100 text-blue-900 border border-blue-300 font-bold'
                                      : 'text-slate-600 hover:bg-white border border-transparent font-medium'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const current = draftRow.running_floor_ids || []
                                      const next = e.target.checked
                                        ? [...current, f.id]
                                        : current.filter((id) => id !== f.id)
                                      setDraftRow({ ...draftRow, running_floor_ids: next })
                                    }}
                                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-0 cursor-pointer"
                                  />
                                  <span>{code}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1 px-0.5">
                          <span className="font-mono text-[9px] uppercase tracking-wider">
                            {draftRow.floor_ids.length}/{floors.length} selected
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setDraftRow({ ...draftRow, floor_ids: floors.map((f) => f.id) })
                              }
                              className="text-brand hover:underline font-semibold"
                            >
                              All
                            </button>
                            <span>·</span>
                            <button
                              type="button"
                              onClick={() => setDraftRow({ ...draftRow, floor_ids: [] })}
                              className="text-slate-500 hover:text-rose-600 hover:underline"
                            >
                              None
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 w-max">
                          {floors.map((f) => {
                            const isChecked = draftRow.floor_ids.includes(f.id)
                            const code = f.code || f.name
                            return (
                              <label
                                key={f.id}
                                className={`inline-flex items-center gap-1.5 cursor-pointer select-none px-2 py-0.5 rounded text-[11px] whitespace-nowrap transition-all ${
                                  isChecked
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs font-bold'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent font-medium'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...draftRow.floor_ids, f.id]
                                      : draftRow.floor_ids.filter((id) => id !== f.id)
                                    setDraftRow({ ...draftRow, floor_ids: next })
                                  }}
                                  className="w-3.5 h-3.5 text-brand rounded border-slate-300 focus:ring-0 cursor-pointer"
                                />
                                <span>{code}</span>
                              </label>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <Badge variant="success" className="text-[10px]">
                      Active
                    </Badge>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="primary"
                        size="sm"
                        loading={isSubmittingDraft}
                        onClick={handleSaveDraft}
                        className="h-6 px-2 text-xs"
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSubmittingDraft}
                        onClick={handleCancelDraft}
                        className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Rows */}
              {loading && items.length === 0 ? (
                <tr>
                  <td
                    colSpan={canDelete ? 12 : 11}
                    className="py-12 text-center text-ink-muted text-xs"
                  >
                    <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-brand" />
                    Loading needle master records...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={canDelete ? 12 : 11}
                    className="py-12 text-center text-ink-muted text-xs"
                  >
                    No needles match your active filters.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const sl = index + 1
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition-colors group align-top"
                    >
                      {/* SL */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {sl}
                      </td>

                      {/* Description Item */}
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <input
                            type="text"
                            value={item.description_item}
                            onChange={(e) =>
                              handleCellChange(item.id, 'description_item', e.target.value)
                            }
                            className="w-full px-2 py-1 text-xs bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-brand rounded focus:ring-1 focus:ring-brand focus:outline-none text-ink"
                          />
                        ) : (
                          <span className="text-ink truncate block">
                            {item.description_item}
                          </span>
                        )}
                      </td>

                      {/* Item Code */}
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <input
                            type="text"
                            value={item.item_code}
                            onChange={(e) =>
                              handleCellChange(item.id, 'item_code', e.target.value.toUpperCase())
                            }
                            className="w-full px-2 py-1 text-xs font-semibold text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-brand rounded focus:ring-1 focus:ring-brand focus:outline-none font-mono"
                          />
                        ) : (
                          <span className="font-semibold text-slate-800 font-mono">
                            {item.item_code}
                          </span>
                        )}
                      </td>

                      {/* TAC Inventory Code */}
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <input
                            type="text"
                            value={item.tac_inventory_item_code || ''}
                            placeholder="—"
                            onChange={(e) =>
                              handleCellChange(item.id, 'tac_inventory_item_code', e.target.value)
                            }
                            className="w-full px-2 py-1 text-xs text-slate-600 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-brand rounded focus:ring-1 focus:ring-brand focus:outline-none font-mono"
                          />
                        ) : (
                          <span className="text-slate-600 font-mono">
                            {item.tac_inventory_item_code || '—'}
                          </span>
                        )}
                      </td>

                      {/* Needle Type */}
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <input
                            type="text"
                            value={item.needle_type}
                            onChange={(e) =>
                              handleCellChange(item.id, 'needle_type', e.target.value)
                            }
                            className="w-full px-2 py-1 text-xs text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-brand rounded focus:ring-1 focus:ring-brand focus:outline-none font-medium"
                          />
                        ) : (
                          <span className="font-medium text-slate-800">
                            {item.needle_type}
                          </span>
                        )}
                      </td>

                      {/* Size/Dia */}
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <input
                            type="text"
                            value={item.size_dia}
                            onChange={(e) =>
                              handleCellChange(item.id, 'size_dia', e.target.value)
                            }
                            className="w-full px-2 py-1 text-xs text-slate-800 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-brand rounded focus:ring-1 focus:ring-brand focus:outline-none font-semibold text-center"
                          />
                        ) : (
                          <span className="font-semibold text-slate-800 text-center block">
                            {item.size_dia}
                          </span>
                        )}
                      </td>

                      {/* Brand */}
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <input
                            type="text"
                            value={item.brand}
                            onChange={(e) =>
                              handleCellChange(item.id, 'brand', e.target.value)
                            }
                            className="w-full px-2 py-1 text-xs text-slate-700 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-brand rounded focus:ring-1 focus:ring-brand focus:outline-none"
                          />
                        ) : (
                          <span className="text-slate-700">{item.brand}</span>
                        )}
                      </td>

                      {/* Unit Price BDT */}
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <input
                            type="number"
                            step="0.000001"
                            value={item.unit_price_bdt ?? ''}
                            onChange={(e) =>
                              handleCellChange(item.id, 'unit_price_bdt', e.target.value === '' ? null : Number(e.target.value))
                            }
                            className="w-full px-2 py-1 text-xs text-right font-mono bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-brand rounded focus:ring-1 focus:ring-brand focus:outline-none text-slate-800"
                          />
                        ) : (
                          <span className="text-right block font-mono text-slate-800">
                            {item.unit_price_bdt?.toFixed(6) ?? '-'}
                          </span>
                        )}
                      </td>

                      {/* Unit Price USD */}
                      <td className="py-2 px-2">
                        {canEdit ? (
                          <input
                            type="number"
                            step="0.00000001"
                            value={item.unit_price_usd ?? ''}
                            onChange={(e) =>
                              handleCellChange(item.id, 'unit_price_usd', e.target.value === '' ? null : Number(e.target.value))
                            }
                            className="w-full px-2 py-1 text-xs text-right font-mono bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-300 focus:border-brand rounded focus:ring-1 focus:ring-brand focus:outline-none text-slate-800"
                          />
                        ) : (
                          <span className="text-right block font-mono text-slate-800">
                            {item.unit_price_usd?.toFixed(8) ?? '-'}
                          </span>
                        )}
                      </td>

                      {/* Floor Column: NEW and RUNNING independent matrices for Normal Needle, or single for Idle */}
                      <td className="py-2 px-2">
                        {needleGroup === 'needle' ? (
                          <div className="flex items-start gap-3">
                            {/* NEW Floor Assignment Panel */}
                            <div className="flex-1 bg-emerald-50/30 p-2 rounded-erp border border-emerald-200/50">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 px-0.5 pb-1 border-b border-emerald-200/50">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                                    NEW
                                  </span>
                                  <span className="font-mono text-[9px] text-slate-500 font-semibold">
                                    {(item.new_floor_ids || []).length}/{floors.length}
                                  </span>
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-1 text-[10px] opacity-70 group-hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleBulkSetFloors(item.id, floors.map((f) => f.id), 'new')
                                      }
                                      className="text-emerald-700 hover:underline font-bold"
                                      title="Select all floors for NEW entry sheet"
                                    >
                                      All
                                    </button>
                                    <span>·</span>
                                    <button
                                      type="button"
                                      onClick={() => handleBulkSetFloors(item.id, [], 'new')}
                                      className="text-slate-400 hover:text-rose-600 hover:underline font-medium"
                                      title="Deselect all floors for NEW entry sheet"
                                    >
                                      None
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1 w-max">
                                {floors.map((f) => {
                                  const isChecked = (item.new_floor_ids || []).includes(f.id)
                                  const code = f.code || f.name

                                  return (
                                    <label
                                      key={f.id}
                                      className={`inline-flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap transition-all ${
                                        isChecked
                                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold'
                                          : 'text-slate-600 hover:bg-white border border-transparent font-medium'
                                      } ${!canEdit ? 'opacity-80 cursor-default' : ''}`}
                                      title={`NEW Issue: ${f.name}${f.location_name ? ` (${f.location_name})` : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!canEdit}
                                        onChange={() =>
                                          handleToggleFloor(item.id, f.id, !isChecked, 'new')
                                        }
                                        className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-0 cursor-pointer disabled:cursor-default"
                                      />
                                      <span className="leading-tight">{code}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>

                            {/* RUNNING Floor Assignment Panel */}
                            <div className="flex-1 bg-blue-50/30 p-2 rounded-erp border border-blue-200/50">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 px-0.5 pb-1 border-b border-blue-200/50">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 uppercase tracking-wide">
                                    RUNNING
                                  </span>
                                  <span className="font-mono text-[9px] text-slate-500 font-semibold">
                                    {(item.running_floor_ids || []).length}/{floors.length}
                                  </span>
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-1 text-[10px] opacity-70 group-hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleBulkSetFloors(item.id, floors.map((f) => f.id), 'running')
                                      }
                                      className="text-blue-700 hover:underline font-bold"
                                      title="Select all floors for RUNNING entry sheet"
                                    >
                                      All
                                    </button>
                                    <span>·</span>
                                    <button
                                      type="button"
                                      onClick={() => handleBulkSetFloors(item.id, [], 'running')}
                                      className="text-slate-400 hover:text-rose-600 hover:underline font-medium"
                                      title="Deselect all floors for RUNNING entry sheet"
                                    >
                                      None
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1 w-max">
                                {floors.map((f) => {
                                  const isChecked = (item.running_floor_ids || []).includes(f.id)
                                  const code = f.code || f.name

                                  return (
                                    <label
                                      key={f.id}
                                      className={`inline-flex items-center gap-1.5 cursor-pointer select-none px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap transition-all ${
                                        isChecked
                                          ? 'bg-blue-100 text-blue-900 border border-blue-300 font-bold'
                                          : 'text-slate-600 hover:bg-white border border-transparent font-medium'
                                      } ${!canEdit ? 'opacity-80 cursor-default' : ''}`}
                                      title={`RUNNING Issue: ${f.name}${f.location_name ? ` (${f.location_name})` : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={!canEdit}
                                        onChange={() =>
                                          handleToggleFloor(item.id, f.id, !isChecked, 'running')
                                        }
                                        className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-0 cursor-pointer disabled:cursor-default"
                                      />
                                      <span className="leading-tight">{code}</span>
                                    </label>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Check all at once quick action header */}
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1 px-0.5">
                              <span className="font-mono text-[9px] uppercase tracking-wider">
                                {(item.floor_ids || []).length}/{floors.length} selected
                              </span>
                              {canEdit && (
                                <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleBulkSetFloors(item.id, floors.map((f) => f.id))
                                    }
                                    className="text-brand hover:underline font-semibold"
                                    title="Check all floors at once"
                                  >
                                    All
                                  </button>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    onClick={() => handleBulkSetFloors(item.id, [])}
                                    className="text-slate-400 hover:text-rose-600 hover:underline"
                                    title="Clear all floors"
                                  >
                                    None
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Checkbox Grid (Matching Image 2: 2 columns of checkboxes with floor codes) */}
                            <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 w-max">
                              {floors.map((f) => {
                                const isChecked = (item.floor_ids || []).includes(f.id)
                                const code = f.code || f.name

                                return (
                                  <label
                                    key={f.id}
                                    className={`inline-flex items-center gap-1.5 cursor-pointer select-none px-2 py-0.5 rounded text-[11px] whitespace-nowrap transition-all ${
                                      isChecked
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent font-medium'
                                    } ${!canEdit ? 'opacity-80 cursor-default' : ''}`}
                                    title={`${f.name}${f.location_name ? ` (${f.location_name})` : ''} - Click to toggle`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={!canEdit}
                                      onChange={() =>
                                        handleToggleFloor(item.id, f.id, !isChecked)
                                      }
                                      className="w-3.5 h-3.5 text-brand rounded border-slate-300 focus:ring-0 cursor-pointer disabled:cursor-default"
                                    />
                                    <span className="leading-tight">{code}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-2 text-center">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleCellChange(item.id, 'active', !item.active)
                            }
                            className="focus:outline-none"
                            title="Click to toggle active state"
                          >
                            <Badge
                              variant={item.active ? 'success' : 'neutral'}
                              className="text-[10px] cursor-pointer"
                            >
                              {item.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </button>
                        ) : (
                          <Badge
                            variant={item.active ? 'success' : 'neutral'}
                            className="text-[10px]"
                          >
                            {item.active ? 'Active' : 'Inactive'}
                          </Badge>
                        )}
                      </td>

                      {/* Actions */}
                      {canDelete && (
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => setItemToDelete(item)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 rounded hover:bg-rose-50"
                            title="Delete needle master item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer: Item Count Summary */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-t border-surface-border text-xs text-slate-600 font-medium">
          <div className="flex items-center gap-2">
            <span>
              Total: <strong className="text-slate-800 font-semibold">{totalItems}</strong> needle{totalItems === 1 ? '' : 's'} listed
            </span>
            {isFiltered && (
              <span className="text-slate-400 text-[11px]">(filtered)</span>
            )}
          </div>
          <span className="text-slate-400 text-[11px]">
            Displaying all records
          </span>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(itemToDelete)}
        onClose={() => setItemToDelete(null)}
        title="Delete Needle Master Item"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Are you sure you want to delete needle master item{' '}
            <strong className="text-slate-900 font-mono">
              {itemToDelete?.item_code}
            </strong>{' '}
            ({itemToDelete?.needle_type} - {itemToDelete?.brand})?
          </p>
          <p className="text-xs text-rose-600">
            This will permanently remove the needle item and all its floor assignments.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setItemToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isDeleting}
              onClick={handleConfirmDelete}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
