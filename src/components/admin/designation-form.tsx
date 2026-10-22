'use client'

import * as React from 'react'
import { Plus, Edit2, Search, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import {
  createDesignationAction,
  updateDesignationAction,
  toggleDesignationActiveAction,
} from '@/app/actions/designations'
import { useToast } from '@/components/ui/toast'
import type { Designation } from '@/types'

export function DesignationManager({
  designations,
  canCreate,
  canEdit,
}: {
  designations: Designation[]
  canCreate: boolean
  canEdit: boolean
}) {
  const { toast } = useToast()
  const [search, setSearch] = React.useState('')
  const [modalOpen, setModalOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState<Designation | null>(null)
  const [loading, setLoading] = React.useState(false)

  // Form states
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [active, setActive] = React.useState(true)
  const [sortOrder, setSortOrder] = React.useState(0)

  const openCreateModal = () => {
    setEditingItem(null)
    setCode('')
    setName('')
    setDescription('')
    setActive(true)
    setSortOrder(designations.length + 1)
    setModalOpen(true)
  }

  const openEditModal = (item: Designation) => {
    setEditingItem(item)
    setCode(item.code || '')
    setName(item.name)
    setDescription(item.description || '')
    setActive(item.active)
    setSortOrder(item.sort_order)
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
    if (editingItem) {
      res = await updateDesignationAction(editingItem.id, formData)
    } else {
      res = await createDesignationAction(formData)
    }

    setLoading(false)

    if (res.success) {
      toast(editingItem ? 'Designation updated.' : 'Designation created.', 'success')
      setModalOpen(false)
    } else {
      toast(res.error || 'Failed to save designation.', 'error')
    }
  }

  const handleToggleActive = async (item: Designation) => {
    const res = await toggleDesignationActiveAction(item.id, !item.active)
    if (res.success) {
      toast(`Designation ${!item.active ? 'activated' : 'deactivated'}.`, 'success')
    } else {
      toast(res.error || 'Action failed.', 'error')
    }
  }

  const filtered = designations.filter((d) => {
    if (!search.trim()) return true
    const q = search.toLowerCase().trim()
    return d.name.toLowerCase().includes(q) || (d.code && d.code.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div>
          <h1 className="text-xl font-bold text-ink">Designation Master</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Manage official staff ranks, designations, and job title hierarchy.
          </p>
        </div>

        {canCreate && (
          <Button onClick={openCreateModal} className="gap-1.5 shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Add Designation</span>
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
            placeholder="Search designations by title or code..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink placeholder:text-ink-light focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
          />
        </div>
        <span className="text-xs text-ink-muted font-medium">
          Total Designations: {designations.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-surface-border rounded-erp-lg shadow-erp overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-24">Code</th>
                <th>Designation Title</th>
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
                    No designations found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="font-mono font-semibold text-ink">
                      {item.code || '—'}
                    </td>
                    <td className="font-semibold text-ink flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 text-ink-light" />
                      {item.name}
                    </td>
                    <td className="text-ink-muted">{item.description || '—'}</td>
                    <td className="text-center font-mono">{item.sort_order}</td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => canEdit && handleToggleActive(item)}
                        disabled={!canEdit}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          item.active
                            ? 'bg-success/15 text-success-dark border-success/30 hover:bg-success/25'
                            : 'bg-surface-muted text-ink-muted border-surface-border hover:bg-surface-border'
                        } transition-colors ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {item.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    {canEdit && (
                      <td className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(item)}
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
        title={editingItem ? 'Edit Designation' : 'Create New Designation'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Designation Title *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Executive, Assistant Manager, Operator"
          />

          <Input
            label="Code (Optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. DES-MGR"
          />

          <Input
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Role scope or rank level"
          />

          <Input
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
            hint="Order in which this designation appears in selection dropdowns"
          />

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="activeToggleDes"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded text-brand border-surface-border focus:ring-brand"
            />
            <label htmlFor="activeToggleDes" className="text-xs font-semibold text-ink cursor-pointer">
              Active (Visible in Employee Designation dropdowns)
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
              loadingText={editingItem ? 'Updating...' : 'Saving...'}
            >
              {editingItem ? 'Save Changes' : 'Create Designation'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
