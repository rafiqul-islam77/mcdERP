import * as React from 'react'

export function Skeleton({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200/80 ${className}`}
      {...props}
    />
  )
}

export interface TableSkeletonProps {
  columnCount?: number
  rowCount?: number
  showToolbar?: boolean
  columnWidths?: string[]
  headerLabels?: string[]
}

export function TableSkeleton({
  columnCount = 6,
  rowCount = 7,
  showToolbar = true,
  columnWidths,
  headerLabels,
}: TableSkeletonProps) {
  const actualCols = headerLabels ? headerLabels.length : columnCount

  return (
    <div className="space-y-4">
      {/* Optional Search Toolbar Skeleton */}
      {showToolbar && (
        <div className="bg-white p-3.5 rounded-erp-lg border border-surface-border shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 max-w-sm w-full">
            <Skeleton className="h-8 w-full rounded-erp" />
          </div>
          <Skeleton className="h-4 w-28 rounded" />
        </div>
      )}

      {/* Table Card Skeleton */}
      <div className="bg-white border border-surface-border rounded-erp-lg shadow-erp overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                {Array.from({ length: actualCols }).map((_, idx) => (
                  <th
                    key={idx}
                    style={{ width: columnWidths?.[idx] }}
                    className="py-3 px-4"
                  >
                    {headerLabels && headerLabels[idx] ? (
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        {headerLabels[idx]}
                      </span>
                    ) : (
                      <Skeleton className="h-3 w-16" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {Array.from({ length: rowCount }).map((_, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-50/50">
                  {Array.from({ length: actualCols }).map((_, colIdx) => {
                    // Make column skeleton shapes realistic
                    if (colIdx === 0) {
                      return (
                        <td key={colIdx} className="py-3.5 px-4">
                          <Skeleton className="h-4 w-12 font-mono" />
                        </td>
                      )
                    }
                    if (colIdx === 1) {
                      return (
                        <td key={colIdx} className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <Skeleton className="w-4 h-4 rounded" />
                            <Skeleton className="h-4 w-28" />
                          </div>
                        </td>
                      )
                    }
                    if (colIdx === actualCols - 1) {
                      return (
                        <td key={colIdx} className="py-3.5 px-4 text-right">
                          <div className="flex justify-end">
                            <Skeleton className="h-6 w-14 rounded-erp" />
                          </div>
                        </td>
                      )
                    }
                    // Status badge column or general cell
                    if (colIdx === actualCols - 2) {
                      return (
                        <td key={colIdx} className="py-3.5 px-4 text-center">
                          <div className="flex justify-center">
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                        </td>
                      )
                    }
                    return (
                      <td key={colIdx} className="py-3.5 px-4">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function PageSkeleton({
  title,
  subtitle,
  hasButton = true,
  tableConfig,
}: {
  title?: string
  subtitle?: string
  hasButton?: boolean
  tableConfig?: TableSkeletonProps
}) {
  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-border">
        <div>
          {title ? (
            <h1 className="text-xl font-bold text-ink">{title}</h1>
          ) : (
            <Skeleton className="h-7 w-48 mb-1 rounded" />
          )}
          {subtitle ? (
            <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>
          ) : (
            <Skeleton className="h-3.5 w-72 rounded mt-1" />
          )}
        </div>

        {hasButton && (
          <Skeleton className="h-9 w-32 rounded-erp shadow-xs" />
        )}
      </div>

      {/* Table Skeleton */}
      <TableSkeleton {...tableConfig} />
    </div>
  )
}

export function CardSkeleton({
  count = 4,
}: {
  count?: number
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white p-5 rounded-erp-lg border border-surface-border shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <Skeleton className="w-12 h-4 rounded-full" />
          </div>
          <div className="space-y-1">
            <Skeleton className="w-16 h-7 rounded" />
            <Skeleton className="w-24 h-3.5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
