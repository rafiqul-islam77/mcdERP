'use server'

import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { getAuthorizedContextAction } from '@/app/actions/daily-entry'
import { getDailyReportData } from '@/lib/reports/daily-report-service'
import type { ActionResult, DailyEntryCategory, DailyReportData, Floor } from '@/types'

/**
 * Check if the user is authorized to view daily reports for a given category.
 */
async function canViewDailyReport(
  actorId: string,
  isSiteAdmin: boolean,
  category: DailyEntryCategory
): Promise<boolean> {
  if (isSiteAdmin) return true
  const generalView = await hasPermission(actorId, 'daily_report.view')
  if (generalView) return true

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
 * Fetch authoritative Daily Reports for ALL authorized floors (for All Floors export)
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

  const reports: DailyReportData[] = []
  for (const floor of authorizedFloors) {
    const repRes = await getDailyReportData({
      date: params.date,
      floorId: floor.id,
      category: params.category,
    })
    if (repRes.success && repRes.data) {
      reports.push(repRes.data)
    }
  }

  return { success: true, data: reports }
}

/**
 * Fetch datasets required for Daily Stock Report (NEW + RUNNING + IDLE)
 */
export async function getDailyStockReportDataAction(params: {
  date: string
  floorId?: string
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
  const targetFloors = params.floorId && params.floorId !== 'all'
    ? allAuthFloors.filter((f) => f.id === params.floorId)
    : allAuthFloors

  const newReports: DailyReportData[] = []
  const runningReports: DailyReportData[] = []
  const idleReports: DailyReportData[] = []

  const canViewNew = await canViewDailyReport(actor.profile.id, actor.isSiteAdmin, 'NEW')
  const canViewRunning = await canViewDailyReport(actor.profile.id, actor.isSiteAdmin, 'RUNNING')
  const canViewIdle = await canViewDailyReport(actor.profile.id, actor.isSiteAdmin, 'IDLE')

  for (const floor of targetFloors) {
    if (canViewNew) {
      const rep = await getDailyReportData({ date: params.date, floorId: floor.id, category: 'NEW' })
      if (rep.success && rep.data) newReports.push(rep.data)
    }
    if (canViewRunning) {
      const rep = await getDailyReportData({ date: params.date, floorId: floor.id, category: 'RUNNING' })
      if (rep.success && rep.data) runningReports.push(rep.data)
    }
    if (canViewIdle) {
      const rep = await getDailyReportData({ date: params.date, floorId: floor.id, category: 'IDLE' })
      if (rep.success && rep.data) idleReports.push(rep.data)
    }
  }

  return {
    success: true,
    data: {
      newReports,
      runningReports,
      idleReports,
    },
  }
}
