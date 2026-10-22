'use client'

import * as React from 'react'
import { Plus, Edit2, Search, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import {
  createFloorLocationAction,
  updateFloorLocationAction,
  toggleFloorLocationActiveAction,
} from '@/app/actions/floor-locations'
import { useToast } from '@/components/ui/toast'
import type { FloorLocation } from '@/types'

export function FloorLocationManager({
  floorLocations,
  canCreate,
  canEdit,
}: {
  floorLocations: FloorLocation[]
  canCreate: boolean
  canEdit: boolean
}) {
  const { toast } = useToast()
  const [search, setSearch] = React.useState('')
  const [modalOpen, setModalOpen] = React.useState(false)
  const [editingLocation, setEditingLocation] = React.useState<FloorLocation | null>(null)
  const [loading, setLoading] = React.useState(false)

  // Form states
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [active, setActive] = React.useState(true)
  const [sortOrder, setSortOrder] = React.useState(0)

  const openCreateModal = () => {
    setEditingLocation(null)
    setCode('')
    setName('')
    setDescription('')
    setActive(true)
    setSortOrder(floorLocations.length + 1)
    setModalOpen(true)
  }

  const openEditModal = (loc: FloorLocation) => {
    setEditingLocation(loc)
    setCode(loc.code || '')
    setName(loc.name)
    setDescription(loc.description || '')
    setActive(loc.active)
    setSortOrder(loc.sort_order)
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData()
    formData.append('code', code)
    formData.append('name', name)
    formData.append('description', description)
    formData.append('active', active ? 'true' : 'false')
    formData.append('sort_order', sortOrder.toString())

    let res
    if (editingLocation) {
      res = await updateFloorLocationAction(editingLocation.id, formData)
    } else {
      res = await createFloorLocationAction(formData)
    }

    setLoading(false)

    if (res.success) {
      toast(
        editingLocation
          ? 'Floor location updated successfully.'
          : 'Floor location created successfully.',
        'success'
      )
      setModalOpen(false)
    } else {
      toast(res.error || 'Failed to save floor location.', 'error')
    }
  }

  const handleToggleActive = async (loc: FloorLocation) => {
    const res = await toggleFloorLocationActiveAction(loc.id, !loc.active)
    if (res.success) {
      toast(`Floor location ${!loc.active ? 'activated' : 'deactivated'}.`, 'success')
    } else {
      toast(res.error || 'Action failed.', 'error')
    }
  }

  const filtered = floorLocations.filter((loc) => {
    if (!search.trim()) return true
    const q = search.toLowerCase().trim()
    return (
      loc.name.toLowerCase().includes(q) ||
      (loc.code && loc.code.toLowerCase().includes(q)) ||
      (loc.description && loc.description.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div>
          <h1 className="text-xl font-bold text-ink">Floor Locations Master</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Manage factory buildings and physical locations to which floors are assigned.
          </p>
        </div>

        {canCreate && (
          <Button onClick={openCreateModal} className="gap-1.5 shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Add Floor Location</span>
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
            placeholder="Search locations by building name, code, or description..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink placeholder:text-ink-light focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
          />
        </div>
        <span className="text-xs text-ink-muted font-medium">
          Total Locations: {floorLocations.length}
        </span>
      </div>

      {/* Locations Table */}
      <div className="bg-white border border-surface-border rounded-erp-lg shadow-erp overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-24">Code</th>
                <th>Location / Building Name</th>
                <th>Description</th>
                <th className="text-center w-24">Sort Order</th>
                <th className="text-center w-24">Status</th>
                {canEdit && <th className="text-right w-24">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-ink-muted">
                    No floor locations found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((loc) => (
                  <tr key={loc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="font-mono font-semibold text-ink">
                      {loc.code || '—'}
                    </td>
                    <td className="font-semibold text-ink">
                      <div className="inline-flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-brand" />
                        <span>{loc.name}</span>
                      </div>
                    </td>
                    <td className="text-ink-muted">{loc.description || '—'}</td>
                    <td className="text-center font-mono">{loc.sort_order}</td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => canEdit && handleToggleActive(loc)}
                        disabled={!canEdit}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          loc.active
                            ? 'bg-success/15 text-success-dark border-success/30 hover:bg-success/25'
                            : 'bg-surface-muted text-ink-muted border-surface-border hover:bg-surface-border'
                        } transition-colors ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {loc.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    {canEdit && (
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(loc)}
                          className="h-7 px-2 text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLocation ? 'Edit Floor Location' : 'Create Floor Location'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Location / Building Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Building 02, Building 6A, Building 03 (Sample)"
          />

          <Input
            label="Location Code (Optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. LOC-B02, BLD-02"
          />

          <Input
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Main production building, Annex, Technical unit, etc."
          />

          <Input
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            hint="Display order in dropdown selections"
          />

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="locActiveToggle"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded text-brand border-surface-border focus:ring-brand"
            />
            <label htmlFor="locActiveToggle" className="text-xs font-semibold text-ink cursor-pointer">
              Active (Available for Floor assignments)
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
              loadingText={editingLocation ? 'Updating...' : 'Saving...'}
            >
              {editingLocation ? 'Save Changes' : 'Create Location'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
