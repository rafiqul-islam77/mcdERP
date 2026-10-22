'use client'

import * as React from 'react'
import { Plus, Edit2, Search, Layers, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { createFloorAction, updateFloorAction, toggleFloorActiveAction } from '@/app/actions/floors'
import { useToast } from '@/components/ui/toast'
import type { Floor, FloorLocation } from '@/types'

export function FloorManager({
  floors,
  floorLocations = [],
  canCreate,
  canEdit,
}: {
  floors: Floor[]
  floorLocations: FloorLocation[]
  canCreate: boolean
  canEdit: boolean
}) {
  const { toast } = useToast()
  const [search, setSearch] = React.useState('')
  const [modalOpen, setModalOpen] = React.useState(false)
  const [editingFloor, setEditingFloor] = React.useState<Floor | null>(null)
  const [loading, setLoading] = React.useState(false)

  // Form states
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [floorLocationId, setFloorLocationId] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [active, setActive] = React.useState(true)
  const [sortOrder, setSortOrder] = React.useState(0)

  // Lookup map for fast location name resolution
  const locationMap = React.useMemo(() => {
    const map = new Map<string, FloorLocation>()
    for (const loc of floorLocations) {
      map.set(loc.id, loc)
    }
    return map
  }, [floorLocations])

  const openCreateModal = () => {
    setEditingFloor(null)
    setCode('')
    setName('')
    // Default to first active location if available
    const firstActive = floorLocations.find((l) => l.active)
    setFloorLocationId(firstActive ? firstActive.id : '')
    setDescription('')
    setActive(true)
    setSortOrder(floors.length + 1)
    setModalOpen(true)
  }

  const openEditModal = (floor: Floor) => {
    setEditingFloor(floor)
    setCode(floor.code || '')
    setName(floor.name)
    setFloorLocationId(floor.floor_location_id || '')
    setDescription(floor.description || '')
    setActive(floor.active)
    setSortOrder(floor.sort_order)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!floorLocationId) {
      toast('Please select a Floor Location.', 'error')
      return
    }

    setLoading(true)

    const formData = new FormData()
    formData.append('code', code)
    formData.append('name', name)
    formData.append('floor_location_id', floorLocationId)
    formData.append('description', description)
    formData.append('active', active ? 'true' : 'false')
    formData.append('sort_order', sortOrder.toString())

    let res
    if (editingFloor) {
      res = await updateFloorAction(editingFloor.id, formData)
    } else {
      res = await createFloorAction(formData)
    }

    setLoading(false)

    if (res.success) {
      toast(editingFloor ? 'Floor updated successfully.' : 'Floor created successfully.', 'success')
      setModalOpen(false)
    } else {
      toast(res.error || 'Failed to save floor.', 'error')
    }
  }

  const handleToggleActive = async (floor: Floor) => {
    const res = await toggleFloorActiveAction(floor.id, !floor.active)
    if (res.success) {
      toast(`Floor ${!floor.active ? 'activated' : 'deactivated'}.`, 'success')
    } else {
      toast(res.error || 'Action failed.', 'error')
    }
  }

  const filtered = floors.filter((f) => {
    if (!search.trim()) return true
    const q = search.toLowerCase().trim()
    const locName = f.floor_locations?.name || locationMap.get(f.floor_location_id || '')?.name || ''
    return (
      f.name.toLowerCase().includes(q) ||
      (f.code && f.code.toLowerCase().includes(q)) ||
      locName.toLowerCase().includes(q)
    )
  })

  // List of active locations for the select dropdown (or the currently selected location if inactive)
  const selectableLocations = React.useMemo(() => {
    return floorLocations.filter(
      (loc) => loc.active || (editingFloor && editingFloor.floor_location_id === loc.id)
    )
  }, [floorLocations, editingFloor])

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div>
          <h1 className="text-xl font-bold text-ink">Floor Master</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Manage factory production floors, line groupings, and building locations.
          </p>
        </div>

        {canCreate && (
          <Button onClick={openCreateModal} className="gap-1.5 shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Add Floor</span>
          </Button>
        )}
      </div>

      {/* Search Toolbar */}
      <div className="bg-white p-3.5 rounded-erp-lg border border-surface-border shadow-xs flex items-center justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-light">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search floors by name, code, or building location..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink placeholder:text-ink-light focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
          />
        </div>
        <span className="text-xs text-ink-muted font-medium">
          Total Floors: {floors.length}
        </span>
      </div>

      {/* Floors Table */}
      <div className="bg-white border border-surface-border rounded-erp-lg shadow-erp overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-20">Code</th>
                <th>Floor Name</th>
                <th>Floor Location</th>
                <th>Description</th>
                <th className="text-center w-24">Sort Order</th>
                <th className="text-center w-24">Status</th>
                {canEdit && <th className="text-right w-24">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-ink-muted">
                    No floors found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((floor) => {
                  const locationName =
                    floor.floor_locations?.name ||
                    locationMap.get(floor.floor_location_id || '')?.name ||
                    null

                  return (
                    <tr key={floor.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="font-mono font-semibold text-ink">
                        {floor.code || '—'}
                      </td>
                      <td className="font-semibold text-ink">
                        <div className="inline-flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-brand" />
                          <span>{floor.name}</span>
                        </div>
                      </td>
                      <td>
                        {locationName ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            {locationName}
                          </span>
                        ) : (
                          <span className="text-ink-muted italic">Unassigned</span>
                        )}
                      </td>
                      <td className="text-ink-muted max-w-xs truncate">{floor.description || '—'}</td>
                      <td className="text-center font-mono">{floor.sort_order}</td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => canEdit && handleToggleActive(floor)}
                          disabled={!canEdit}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                            floor.active
                              ? 'bg-success/15 text-success-dark border-success/30 hover:bg-success/25'
                              : 'bg-surface-muted text-ink-muted border-surface-border hover:bg-surface-border'
                          } transition-colors ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          {floor.active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      {canEdit && (
                        <td className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(floor)}
                            className="h-7 px-2 text-xs"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingFloor ? 'Edit Floor' : 'Create New Floor'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Floor Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. A Floor, Sample Floor"
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">
              Floor Location *
            </label>
            <select
              value={floorLocationId}
              onChange={(e) => setFloorLocationId(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs bg-white border border-surface-border rounded-erp text-ink focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
            >
              <option value="">Select a Floor Location...</option>
              {selectableLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} {loc.code ? `(${loc.code})` : ''}
                </option>
              ))}
            </select>
            {floorLocations.length === 0 && (
              <p className="text-[11px] text-danger">
                No active Floor Locations found. Please add a Floor Location first.
              </p>
            )}
          </div>

          <Input
            label="Floor Code (Optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. FL-A"
          />

          <Input
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Sewing & Assembly Floor, Line groupings, etc."
          />

          <Input
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            hint="Display order in employee selection dropdowns and tables"
          />

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="activeToggle"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded text-brand border-surface-border focus:ring-brand"
            />
            <label htmlFor="activeToggle" className="text-xs font-semibold text-ink cursor-pointer">
              Active (Visible in Employee Floor assignments)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-surface-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={loading}
              loadingText={editingFloor ? 'Updating...' : 'Saving...'}
            >
              {editingFloor ? 'Save Changes' : 'Create Floor'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
