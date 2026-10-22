'use client'

import * as React from 'react'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems?: number
  itemsPerPage?: number
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage = 10,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems ?? currentPage * itemsPerPage)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-2">
      {totalItems !== undefined && (
        <p className="text-xs text-ink-muted">
          Showing <span className="font-semibold text-ink">{startItem}</span> to{' '}
          <span className="font-semibold text-ink">{endItem}</span> of{' '}
          <span className="font-semibold text-ink">{totalItems}</span> results
        </p>
      )}

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-2.5 py-1 text-xs font-medium border border-surface-border rounded-erp bg-white hover:bg-surface-muted text-ink disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          Previous
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
          .map((page, idx, arr) => {
            const prev = arr[idx - 1]
            return (
              <React.Fragment key={page}>
                {prev && page - prev > 1 && <span className="px-1 text-xs text-ink-muted">...</span>}
                <button
                  onClick={() => onPageChange(page)}
                  className={`w-7 h-7 text-xs font-medium rounded-erp transition-colors ${
                    page === currentPage
                      ? 'bg-brand text-white shadow-sm'
                      : 'border border-surface-border bg-white hover:bg-surface-muted text-ink'
                  }`}
                >
                  {page}
                </button>
              </React.Fragment>
            )
          })}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-2.5 py-1 text-xs font-medium border border-surface-border rounded-erp bg-white hover:bg-surface-muted text-ink disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}
