'use client'

import * as React from 'react'
import { Search, Activity } from 'lucide-react'
import { Pagination } from '@/components/ui/pagination'

export function AuditLogClient({ initialLogs }: { initialLogs: any[] }) {
  const [search, setSearch] = React.useState('')
  const [selectedEventType, setSelectedEventType] = React.useState('ALL')
  const [currentPage, setCurrentPage] = React.useState(1)
  const pageSize = 20

  // Event types for filter
  const eventTypes = React.useMemo(() => {
    const set = new Set<string>()
    initialLogs.forEach((l) => set.add(l.event_type))
    return Array.from(set).sort()
  }, [initialLogs])

  const filtered = initialLogs.filter((log) => {
    if (selectedEventType !== 'ALL' && log.event_type !== selectedEventType) {
      return false
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim()
      const matchesEvent = log.event_type.toLowerCase().includes(q)
      const matchesActor =
        log.actor?.name?.toLowerCase().includes(q) ||
        log.actor?.employee_id?.toLowerCase().includes(q)
      const matchesEntity = log.entity_type?.toLowerCase().includes(q)
      if (!matchesEvent && !matchesActor && !matchesEntity) return false
    }

    return true
  })

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const getEventBadge = (type: string) => {
    if (type.includes('CREATED') || type.includes('SUCCESS') || type.includes('ENABLED')) {
      return 'bg-success/15 text-success-dark border-success/30'
    }
    if (type.includes('DISABLED') || type.includes('DELETED') || type.includes('FAILURE')) {
      return 'bg-danger/15 text-danger-dark border-danger/30'
    }
    if (type.includes('RESET') || type.includes('TOKEN')) {
      return 'bg-warning/15 text-warning-dark border-warning/30'
    }
    return 'bg-surface-muted text-ink-muted border-surface-border'
  }

  const formatSummary = (log: any) => {
    const parts: string[] = []
    if (log.metadata) {
      for (const [k, v] of Object.entries(log.metadata)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          parts.push(`${k}: ${v}`)
        }
      }
    }
    if (log.newData && typeof log.newData === 'object') {
      const keys = Object.keys(log.newData).slice(0, 3)
      if (keys.length > 0) {
        parts.push(`fields: ${keys.join(', ')}`)
      }
    }
    return parts.length > 0 ? parts.join(' • ') : '—'
  }

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div>
          <h1 className="text-xl font-bold text-ink">Audit Log Trail</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Immutable operational security event logs and system audit records.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-muted bg-white border border-surface-border px-3 py-1.5 rounded-erp shadow-xs">
          <Activity className="w-4 h-4 text-brand" />
          <span>Showing latest {initialLogs.length} events</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-erp-lg border border-surface-border shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-light">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search events, actor ID, or entity..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink placeholder:text-ink-light focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
          />
        </div>

        <div>
          <select
            value={selectedEventType}
            onChange={(e) => {
              setSelectedEventType(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-surface-border rounded-erp text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="ALL">All Event Types</option>
            {eventTypes.map((et) => (
              <option key={et} value={et}>
                {et}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-surface-border rounded-erp-lg shadow-erp overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="w-40">Date / Time</th>
                <th>Actor</th>
                <th className="text-center w-48">Event</th>
                <th>Target Staff</th>
                <th>Entity</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border text-xs">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-ink-muted">
                    No audit records matching your criteria.
                  </td>
                </tr>
              ) : (
                paginated.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Timestamp */}
                    <td className="text-ink-muted font-mono whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    {/* Actor */}
                    <td className="font-semibold text-ink whitespace-nowrap">
                      {log.actor ? (
                        <span>
                          {log.actor.name}{' '}
                          <span className="text-ink-muted font-normal text-[11px]">
                            ({log.actor.employee_id})
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink-muted">System / Bootstrap</span>
                      )}
                    </td>

                    {/* Event Type */}
                    <td className="text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${getEventBadge(
                          log.event_type
                        )}`}
                      >
                        {log.event_type}
                      </span>
                    </td>

                    {/* Target Staff */}
                    <td className="text-ink whitespace-nowrap">
                      {log.target ? (
                        <span>
                          {log.target.name}{' '}
                          <span className="text-ink-muted text-[11px]">
                            ({log.target.employee_id})
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Entity Type */}
                    <td className="text-ink-muted whitespace-nowrap">
                      {log.entity_type || '—'}
                    </td>

                    {/* Summary */}
                    <td className="text-ink-muted max-w-xs truncate" title={formatSummary(log)}>
                      {formatSummary(log)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-surface-border">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemsPerPage={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>
    </div>
  )
}
