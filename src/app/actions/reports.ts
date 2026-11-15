'use server'

import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import { getDailyReportData, getBatchDailyReportData } from '@/lib/reports/daily-report-service'
import {
  getMonthlyReportData,
  getBatchMonthlyReportData,
} from '@/lib/reports/monthly-report-service'
import { generatePresentBalanceWorkbook } from '@/lib/reports/excel-present-balance'
import { generateDailyStockReportWorkbook } from '@/lib/reports/excel-stock-report'
import { generateMonthlyBalanceWorkbook } from '@/lib/reports/excel-monthly-report'
import type { FloorProgressItem } from '@/components/reports/export-progress-modal'
import type {
  ActionResult,
  DailyEntryCategory,
  DailyReportData,
  MonthlyReportData,
  Floor,
} from '@/types'

/**
 * Check if the user is authorized to view daily reports for a given category.
 */
export async function canViewDailyReport(
  actorId: string,
  isSiteAdmin: boolean,
  category: DailyEntryCategory
): Promise<boolean> {
  if (isSiteAdmin) return true

  switch (category) {
    case 'RUNNING':
      return await hasPermission(actorId, 'needle.daily_report.view')
    case 'NEW':
      return await hasPermission(actorId, 'broken.daily_report.view')
    case 'IDLE':
      return await hasPermission(actorId, 'idle.daily_report.view')
  }
}

/**
 * Get authorized categories for Daily Report based on role permissions.
 */
export async function getAuthorizedDailyReportCategories(
  actorId: string,
  isSiteAdmin: boolean
): Promise<DailyEntryCategory[]> {
  if (isSiteAdmin) {
    return ['RUNNING', 'NEW', 'IDLE']
  }
  const categories: DailyEntryCategory[] = []
  if (await canViewDailyReport(actorId, isSiteAdmin, 'RUNNING')) categories.push('RUNNING')
  if (await canViewDailyReport(actorId, isSiteAdmin, 'NEW')) categories.push('NEW')
  if (await canViewDailyReport(actorId, isSiteAdmin, 'IDLE')) categories.push('IDLE')
  return categories
}

/**
 * Get authorized floors and categories specifically for Daily Report.
 */
export async function getAuthorizedDailyReportContextAction(): Promise<
  ActionResult<{
    floors: Floor[]
    allowedCategories: DailyEntryCategory[]
  }>
> {
  const actor = await requireActiveAccount()
  const entryContextRes = await getAuthorizedContextAction()
  if (!entryContextRes.success || !entryContextRes.data) {
    return { success: false, error: entryContextRes.error || 'Failed to load authorized floors.' }
  }

  const allowedCategories = await getAuthorizedDailyReportCategories(actor.profile.id, actor.isSiteAdmin)

  return {
    success: true,
    data: {
      floors: entryContextRes.data.floors,
      allowedCategories,
    },
  }
}

/**
 * Fetch authoritative Daily Report for a single Floor, Date, and Category
 */
export async function getDailyReportAction(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
}): Promise<ActionResult<DailyReportData>> {
  const actor = await requireActiveAccount()
  const canView = await canViewDailyReport(actor.profile.id, actor.isSiteAdmin, params.category)

  if (!canView) {
    return {
      success: false,
      error: `Unauthorized: You do not have permission to view ${params.category} daily reports.`,
    }
  }

  return await getDailyReportData(params)
}

/**
 * Fetch authoritative Daily Reports for ALL authorized floors (optimized with batch service)
 */
export async function getAllFloorsDailyReportAction(params: {
  date: string
  category: DailyEntryCategory
}): Promise<ActionResult<DailyReportData[]>> {
  const actor = await requireActiveAccount()
  const canView = await canViewDailyReport(actor.profile.id, actor.isSiteAdmin, params.category)

  if (!canView) {
    return {
      success: false,
      error: `Unauthorized: You do not have permission to view ${params.category} daily reports.`,
    }
  }

  // Get authorized floors for this user
  const contextRes = await getAuthorizedContextAction()
  if (!contextRes.success || !contextRes.data) {
    return { success: false, error: contextRes.error || 'Failed to load authorized floors.' }
  }

  const authorizedFloors: Floor[] = contextRes.data.floors
  if (authorizedFloors.length === 0) {
    return { success: true, data: [] }
  }

  const floorIds = authorizedFloors.map((f) => f.id)
  return await getBatchDailyReportData({
    date: params.date,
    floorIds,
    categories: [params.category],
  })
}

/**
 * Fetch datasets required for Daily Stock Report (NEW + RUNNING + IDLE)
 * Optimized using Step 2 (load metadata once) and Step 3 (batch multi-floor queries).
 */
export async function getDailyStockReportDataAction(params: {
  date: string
  floorId?: string
  floorIds?: string[]
  categories?: DailyEntryCategory[]
}): Promise<
  ActionResult<{
    newReports: DailyReportData[]
    runningReports: DailyReportData[]
    idleReports: DailyReportData[]
  }>
> {
  const actor = await requireActiveAccount()
  const contextRes = await getAuthorizedContextAction()
  if (!contextRes.success || !contextRes.data) {
    return { success: false, error: contextRes.error || 'Failed to load authorized floors.' }
  }

  const allAuthFloors: Floor[] = contextRes.data.floors

  let targetFloors: Floor[] = allAuthFloors
  if (params.floorIds && params.floorIds.length > 0) {
    const allowedSet = new Set(params.floorIds)
    targetFloors = allAuthFloors.filter((f) => allowedSet.has(f.id))
  } else if (params.floorId && params.floorId !== 'all') {
    targetFloors = allAuthFloors.filter((f) => f.id === params.floorId)
  }

  const targetFloorIds = targetFloors.map((f) => f.id)
  if (targetFloorIds.length === 0) {
    return {
      success: true,
      data: { newReports: [], runningReports: [], idleReports: [] },
    }
  }

  const canViewNew = await canViewDailyReport(actor.profile.id, actor.isSiteAdmin, 'NEW')
  const canViewRunning = await canViewDailyReport(actor.profile.id, actor.isSiteAdmin, 'RUNNING')
  const canViewIdle = await canViewDailyReport(actor.profile.id, actor.isSiteAdmin, 'IDLE')

  const authorizedCategories: DailyEntryCategory[] = []
  if (canViewNew) authorizedCategories.push('NEW')
  if (canViewRunning) authorizedCategories.push('RUNNING')
  if (canViewIdle) authorizedCategories.push('IDLE')

  let categoriesToFetch = authorizedCategories
  if (params.categories && params.categories.length > 0) {
    const requested = new Set(params.categories)
    categoriesToFetch = authorizedCategories.filter((c) => requested.has(c))
  }

  if (categoriesToFetch.length === 0) {
    return {
      success: true,
      data: { newReports: [], runningReports: [], idleReports: [] },
    }
  }

  const batchRes = await getBatchDailyReportData({
    date: params.date,
    floorIds: targetFloorIds,
    categories: categoriesToFetch,
  })

  if (!batchRes.success || !batchRes.data) {
    return { success: false, error: batchRes.error || 'Failed to load stock reports.' }
  }

  const newReports = batchRes.data.filter((r) => r.category === 'NEW')
  const runningReports = batchRes.data.filter((r) => r.category === 'RUNNING')
  const idleReports = batchRes.data.filter((r) => r.category === 'IDLE')

  return {
    success: true,
    data: {
      newReports,
      runningReports,
      idleReports,
    },
  }
}

/**
 * Direct Single-Pass Export for Daily Stock Excel
 * Eliminates duplicate client/server query cycles.
 */
export async function exportDailyStockExcelAction(params: {
  date: string
  floorId: string
  category: DailyEntryCategory
}): Promise<
  ActionResult<{
    base64: string
    filename: string
    floorItems: FloorProgressItem[]
  }>
> {
  const actor = await requireActiveAccount()

  const permKey =
    params.category === 'NEW'
      ? 'broken.daily_report.export_present_excel'
      : params.category === 'IDLE'
      ? 'idle.daily_report.export_present_excel'
      : 'needle.daily_report.export_present_excel'

  const hasPerm =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, permKey)) ||
    (await hasPermission(actor.profile.id, 'daily_report.export_present_excel')) ||
    (await hasPermission(actor.profile.id, 'needle.daily_report.export')) ||
    (await hasPermission(actor.profile.id, 'broken.daily_report.export')) ||
    (await hasPermission(actor.profile.id, 'idle.daily_report.export'))

  if (!hasPerm) {
    return { success: false, error: 'Forbidden: Present balance export permission denied.' }
  }

  let reports: DailyReportData[] = []
  let filename = `Daily Stock - All Floors - ${params.date}.xlsx`

  if (params.floorId === 'all') {
    const res = await getAllFloorsDailyReportAction({ date: params.date, category: params.category })
    if (!res.success || !res.data) {
      return { success: false, error: res.error || 'Failed to generate report' }
    }
    reports = res.data
  } else {
    const res = await getDailyReportAction({ date: params.date, floorId: params.floorId, category: params.category })
    if (!res.success || !res.data) {
      return { success: false, error: res.error || 'Failed to generate report' }
    }
    reports = [res.data]
    const cleanFloor = (res.data.floorCode || res.data.floorName).replace(/[/\\?*:[\]<>|"]/g, '-').trim()
    filename = `Daily Stock - ${cleanFloor} - ${params.category} - ${params.date}.xlsx`
  }

  if (reports.length === 0) {
    return { success: false, error: 'No data available for export' }
  }

  const buffer = await generatePresentBalanceWorkbook(reports)

  const floorItems: FloorProgressItem[] = reports.map((r) => ({
    id: r.floorId,
    floorName: r.floorName,
    category: r.category,
    date: r.date,
    itemsCount: r.rows.length,
    presentStock: r.summary.totalPresent,
    source: r.sourceNote?.includes('Carry') ? 'carry' : 'actual',
  }))

  return {
    success: true,
    data: {
      base64: Buffer.from(buffer).toString('base64'),
      filename,
      floorItems,
    },
  }
}

/**
 * Direct Single-Pass Export for Closing Stock Excel
 * Eliminates duplicate client/server query cycles.
 */
export async function exportClosingStockExcelAction(params: {
  date: string
  floorId: string
}): Promise<
  ActionResult<{
    base64: string
    filename: string
    floorItems: FloorProgressItem[]
  }>
> {
  const actor = await requireActiveAccount()

  const hasPerm =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, 'daily_report.export_stock_excel')) ||
    (await hasPermission(actor.profile.id, 'needle.daily_report.export_stock_excel')) ||
    (await hasPermission(actor.profile.id, 'broken.daily_report.export_stock_excel')) ||
    (await hasPermission(actor.profile.id, 'idle.daily_report.export_stock_excel')) ||
    (await hasPermission(actor.profile.id, 'needle.daily_report.export'))

  if (!hasPerm) {
    return { success: false, error: 'Forbidden: Stock report export permission denied.' }
  }

  const stockDataRes = await getDailyStockReportDataAction({ date: params.date, floorId: params.floorId })
  if (!stockDataRes.success || !stockDataRes.data) {
    return { success: false, error: stockDataRes.error || 'Failed to generate stock report' }
  }

  const buffer = await generateDailyStockReportWorkbook({
    date: params.date,
    newReports: stockDataRes.data.newReports,
    runningReports: stockDataRes.data.runningReports,
    idleReports: stockDataRes.data.idleReports,
  })

  let floorLabel = 'All Floors'
  if (params.floorId !== 'all') {
    const firstRep =
      stockDataRes.data.runningReports[0] ||
      stockDataRes.data.newReports[0] ||
      stockDataRes.data.idleReports[0]
    floorLabel = firstRep ? (firstRep.floorCode || firstRep.floorName) : 'Floor'
  }
  const safeFloor = floorLabel.replace(/[/\\?*:[\]<>|"]/g, '-').trim()
  const filename = `Closing Stock - ${safeFloor} - ${params.date}.xlsx`

  const floorMap = new Map<string, FloorProgressItem>()
  const allReps = [
    ...(stockDataRes.data.runningReports || []),
    ...(stockDataRes.data.newReports || []),
    ...(stockDataRes.data.idleReports || []),
  ]
  for (const r of allReps) {
    const existing = floorMap.get(r.floorId) || {
      id: r.floorId,
      floorName: r.floorName,
      date: params.date,
      itemsCount: 0,
      presentStock: 0,
      source: 'actual' as const,
    }
    existing.itemsCount += r.rows.length
    existing.presentStock += r.summary.totalPresent
    if (r.sourceNote?.includes('Carry')) existing.source = 'carry'
    floorMap.set(r.floorId, existing)
  }

  return {
    success: true,
    data: {
      base64: Buffer.from(buffer).toString('base64'),
      filename,
      floorItems: Array.from(floorMap.values()),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Monthly Report Server Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the user is authorized to view monthly reports for a given category.
 */
export async function canViewMonthlyReport(
  actorId: string,
  isSiteAdmin: boolean,
  category: DailyEntryCategory
): Promise<boolean> {
  if (isSiteAdmin) return true

  switch (category) {
    case 'RUNNING':
      return (
        (await hasPermission(actorId, 'needle.monthly_report.view')) ||
        (await hasPermission(actorId, 'monthly_report.view'))
      )
    case 'NEW':
      return (
        (await hasPermission(actorId, 'broken.monthly_report.view')) ||
        (await hasPermission(actorId, 'monthly_report.view'))
      )
    case 'IDLE':
      return (
        (await hasPermission(actorId, 'idle.monthly_report.view')) ||
        (await hasPermission(actorId, 'monthly_report.view'))
      )
  }
}

/**
 * Get authorized categories for Monthly Report based on role permissions.
 */
export async function getAuthorizedMonthlyReportCategories(
  actorId: string,
  isSiteAdmin: boolean
): Promise<DailyEntryCategory[]> {
  if (isSiteAdmin) {
    return ['RUNNING', 'NEW', 'IDLE']
  }
  const categories: DailyEntryCategory[] = []
  if (await canViewMonthlyReport(actorId, isSiteAdmin, 'RUNNING')) categories.push('RUNNING')
  if (await canViewMonthlyReport(actorId, isSiteAdmin, 'NEW')) categories.push('NEW')
  if (await canViewMonthlyReport(actorId, isSiteAdmin, 'IDLE')) categories.push('IDLE')
  return categories
}

/**
 * Get authorized floors and categories specifically for Monthly Report.
 */
export async function getAuthorizedMonthlyReportContextAction(): Promise<
  ActionResult<{
    floors: Floor[]
    allowedCategories: DailyEntryCategory[]
  }>
> {
  const actor = await requireActiveAccount()
  const entryContextRes = await getAuthorizedContextAction()
  if (!entryContextRes.success || !entryContextRes.data) {
    return { success: false, error: entryContextRes.error || 'Failed to load authorized floors.' }
  }

  const allowedCategories = await getAuthorizedMonthlyReportCategories(
    actor.profile.id,
    actor.isSiteAdmin
  )

  return {
    success: true,
    data: {
      floors: entryContextRes.data.floors,
      allowedCategories,
    },
  }
}

/**
 * Fetch authoritative Monthly Report for a single Floor, Month, and Category.
 */
export async function getMonthlyReportAction(params: {
  month: string | { year: number; month: number }
  floorId: string
  category: DailyEntryCategory
}): Promise<ActionResult<MonthlyReportData>> {
  const actor = await requireActiveAccount()
  const canView = await canViewMonthlyReport(actor.profile.id, actor.isSiteAdmin, params.category)

  if (!canView) {
    return {
      success: false,
      error: `Unauthorized: You do not have permission to view ${params.category} monthly reports.`,
    }
  }

  return await getMonthlyReportData({
    month: params.month,
    floorId: params.floorId,
    category: params.category,
    actor,
  })
}

/**
 * Fetch authoritative Monthly Reports for ALL authorized floors.
 */
export async function getAllFloorsMonthlyReportAction(params: {
  month: string | { year: number; month: number }
  category: DailyEntryCategory
}): Promise<ActionResult<MonthlyReportData[]>> {
  const actor = await requireActiveAccount()
  const canView = await canViewMonthlyReport(actor.profile.id, actor.isSiteAdmin, params.category)

  if (!canView) {
    return {
      success: false,
      error: `Unauthorized: You do not have permission to view ${params.category} monthly reports.`,
    }
  }

  const contextRes = await getAuthorizedContextAction()
  if (!contextRes.success || !contextRes.data) {
    return { success: false, error: contextRes.error || 'Failed to load authorized floors.' }
  }

  const authFloorIds = contextRes.data.floors.map((f) => f.id)
  return await getBatchMonthlyReportData({
    month: params.month,
    floorIds: authFloorIds,
    categories: [params.category],
    actor,
  })
}

/**
 * Batch Monthly Stock Report Data Action for Report Studio and bulk exports.
 */
export async function getMonthlyStockReportDataAction(params: {
  month: string | { year: number; month: number }
  floorId?: string
  floorIds?: string[]
  categories?: DailyEntryCategory[]
}): Promise<ActionResult<MonthlyReportData[]>> {
  const actor = await requireActiveAccount()
  const contextRes = await getAuthorizedContextAction()
  if (!contextRes.success || !contextRes.data) {
    return { success: false, error: contextRes.error || 'Failed to load authorized floors.' }
  }

  const allAuthFloors = contextRes.data.floors
  let targetFloorIds: string[] = []

  if (params.floorIds && params.floorIds.length > 0) {
    const requested = new Set(params.floorIds)
    targetFloorIds = allAuthFloors.filter((f) => requested.has(f.id)).map((f) => f.id)
  } else if (params.floorId && params.floorId !== 'all') {
    const f = allAuthFloors.find((fl) => fl.id === params.floorId)
    if (f) targetFloorIds = [f.id]
  } else {
    targetFloorIds = allAuthFloors.map((f) => f.id)
  }

  if (targetFloorIds.length === 0) {
    return { success: false, error: 'No authorized floors found for report generation.' }
  }

  let targetCategories: DailyEntryCategory[] = params.categories || ['RUNNING', 'NEW']
  if (!actor.isSiteAdmin) {
    const allowed = await getAuthorizedMonthlyReportCategories(actor.profile.id, actor.isSiteAdmin)
    targetCategories = targetCategories.filter((c) => allowed.includes(c))
  }

  if (targetCategories.length === 0) {
    return { success: false, error: 'No permitted categories selected for monthly report.' }
  }

  return await getBatchMonthlyReportData({
    month: params.month,
    floorIds: targetFloorIds,
    categories: targetCategories,
    actor,
  })
}

/**
 * Direct Single-Pass Export for Monthly Stock Excel
 */
export async function exportMonthlyStockExcelAction(params: {
  month: string | { year: number; month: number }
  floorId: string
  category: DailyEntryCategory
}): Promise<
  ActionResult<{
    base64: string
    filename: string
    floorItems: FloorProgressItem[]
  }>
> {
  const actor = await requireActiveAccount()

  const permKey =
    params.category === 'NEW'
      ? 'broken.monthly_report.export_excel'
      : params.category === 'IDLE'
      ? 'idle.monthly_report.export_excel'
      : 'needle.monthly_report.export_excel'

  const hasPerm =
    actor.isSiteAdmin ||
    (await hasPermission(actor.profile.id, permKey)) ||
    (await hasPermission(actor.profile.id, 'monthly_report.export_excel')) ||
    (await hasPermission(actor.profile.id, 'needle.monthly_report.export')) ||
    (await hasPermission(actor.profile.id, 'broken.monthly_report.export')) ||
    (await hasPermission(actor.profile.id, 'idle.monthly_report.export'))

  if (!hasPerm) {
    return { success: false, error: 'Forbidden: Monthly report export permission denied.' }
  }

  let reports: MonthlyReportData[] = []
  const monthStr =
    typeof params.month === 'string'
      ? params.month
      : `${params.month.year}-${String(params.month.month).padStart(2, '0')}`
  let filename = `Monthly Stock - All Floors - ${monthStr}.xlsx`

  if (params.floorId === 'all') {
    const res = await getAllFloorsMonthlyReportAction({ month: params.month, category: params.category })
    if (!res.success || !res.data) {
      return { success: false, error: res.error || 'Failed to generate report' }
    }
    reports = res.data
  } else {
    const res = await getMonthlyReportAction({ month: params.month, floorId: params.floorId, category: params.category })
    if (!res.success || !res.data) {
      return { success: false, error: res.error || 'Failed to generate report' }
    }
    reports = [res.data]
    const cleanFloor = (res.data.floorCode || res.data.floorName).replace(/[/\\?*:[\]<>|"]/g, '-').trim()
    filename = `Monthly Stock - ${cleanFloor} - ${params.category} - ${res.data.month}.xlsx`
  }

  if (reports.length === 0) {
    return { success: false, error: 'No data available for export' }
  }

  const buffer = await generateMonthlyBalanceWorkbook(reports)

  const floorItems: FloorProgressItem[] = reports.map((r) => ({
    id: r.floorId,
    floorName: r.floorName,
    category: r.category,
    date: r.month,
    itemsCount: r.rows.length,
    presentStock: r.summary.totalPresent,
    source: r.sourceNote?.includes('Carry') ? 'carry' : 'actual',
  }))

  return {
    success: true,
    data: {
      base64: Buffer.from(buffer).toString('base64'),
      filename,
      floorItems,
    },
  }
}

