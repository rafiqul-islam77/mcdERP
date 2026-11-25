/**
 * Compact numeric label formatter for chart data labels.
 * Keeps labels readable on bars/lines while full exact values remain in tooltips.
 */
export function formatCompactChartNumber(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ''
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 10_000) return `${(num / 1_000).toFixed(1)}K`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}
