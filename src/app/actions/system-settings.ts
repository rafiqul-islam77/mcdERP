'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import type { ActionResult, SystemSetting } from '@/types'

const DASHBOARD_SETTING_META: Record<
  string,
  { label: string; description: string; section: string; setting_type: string }
> = {
  total_needle_booth: {
    label: 'Total Needle Booth',
    description: 'Configured factory-wide count of needle booths displayed on the Dashboard',
    section: 'dashboard',
    setting_type: 'integer',
  },
  total_manpower: {
    label: 'Total Manpower',
    description: 'Configured factory-wide needle section manpower displayed on the Dashboard',
    section: 'dashboard',
    setting_type: 'integer',
  },
}

const DEFAULT_SETTINGS: SystemSetting[] = [
  // RUNNING
  {
    id: 'daily_report.running.document_no',
    setting_key: 'daily_report.running.document_no',
    setting_value: 'QA/03/310',
    setting_type: 'string',
    section: 'daily_report',
    label: 'Document No.',
    description: 'Document identification number for Regular Needle Present Balance reports',
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'daily_report.running.version_no',
    setting_key: 'daily_report.running.version_no',
    setting_value: '01/2026',
    setting_type: 'string',
    section: 'daily_report',
    label: 'Version No.',
    description: 'Document version number for Regular Needle Present Balance reports',
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  // NEW
  {
    id: 'daily_report.new.document_no',
    setting_key: 'daily_report.new.document_no',
    setting_value: 'QA/03/310',
    setting_type: 'string',
    section: 'daily_report',
    label: 'Document No.',
    description: 'Document identification number for New Needle Present Balance reports',
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'daily_report.new.version_no',
    setting_key: 'daily_report.new.version_no',
    setting_value: '01/2026',
    setting_type: 'string',
    section: 'daily_report',
    label: 'Version No.',
    description: 'Document version number for New Needle Present Balance reports',
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  // IDLE
  {
    id: 'daily_report.idle.document_no',
    setting_key: 'daily_report.idle.document_no',
    setting_value: 'QA/03/310',
    setting_type: 'string',
    section: 'daily_report',
    label: 'Document No.',
    description: 'Document identification number for Idle Needle Present Balance reports',
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'daily_report.idle.version_no',
    setting_key: 'daily_report.idle.version_no',
    setting_value: '01/2026',
    setting_type: 'string',
    section: 'daily_report',
    label: 'Version No.',
    description: 'Document version number for Idle Needle Present Balance reports',
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  // DASHBOARD GENERAL INFORMATION (unset by default -> empty string)
  {
    id: 'total_needle_booth',
    setting_key: 'total_needle_booth',
    setting_value: '',
    setting_type: 'integer',
    section: 'dashboard',
    label: 'Total Needle Booth',
    description: DASHBOARD_SETTING_META.total_needle_booth.description,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'total_manpower',
    setting_key: 'total_manpower',
    setting_value: '',
    setting_type: 'integer',
    section: 'dashboard',
    label: 'Total Manpower',
    description: DASHBOARD_SETTING_META.total_manpower.description,
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

/**
 * Fetch all system settings. Protected by admin.settings.view or site admin.
 */
export async function getSystemSettingsAction(): Promise<ActionResult<SystemSetting[]>> {
  const actor = await requireActiveAccount()
  const canView = actor.isSiteAdmin || (await hasPermission(actor.profile.id, 'admin.settings.view'))

  if (!canView) {
    return { success: false, error: 'Unauthorized: You do not have permission to view system settings.' }
  }

  const admin = getAdminClient()

  try {
    const { data, error } = await admin
      .from('system_settings')
      .select('*')
      .order('section', { ascending: true })
      .order('setting_key', { ascending: true })

    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code)) {
        return { success: true, data: DEFAULT_SETTINGS }
      }
      throw error
    }

    const existingMap = new Map<string, string>()
    for (const item of (data || []) as SystemSetting[]) {
      existingMap.set(item.setting_key, item.setting_value)
    }

    // Legacy fallback
    const legacyDoc = existingMap.get('daily_report.document_no') || 'QA/03/310'
    const legacyVer = existingMap.get('daily_report.version_no') || '01/2026'

    const nowIso = new Date().toISOString()

    const categorySettings: SystemSetting[] = [
      {
        id: 'daily_report.running.document_no',
        setting_key: 'daily_report.running.document_no',
        setting_value: existingMap.get('daily_report.running.document_no') || legacyDoc,
        setting_type: 'string',
        section: 'daily_report',
        label: 'Document No.',
        description: 'Document identification number for Regular Needle Present Balance reports',
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'daily_report.running.version_no',
        setting_key: 'daily_report.running.version_no',
        setting_value: existingMap.get('daily_report.running.version_no') || legacyVer,
        setting_type: 'string',
        section: 'daily_report',
        label: 'Version No.',
        description: 'Document version number for Regular Needle Present Balance reports',
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'daily_report.new.document_no',
        setting_key: 'daily_report.new.document_no',
        setting_value: existingMap.get('daily_report.new.document_no') || legacyDoc,
        setting_type: 'string',
        section: 'daily_report',
        label: 'Document No.',
        description: 'Document identification number for New Needle Present Balance reports',
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'daily_report.new.version_no',
        setting_key: 'daily_report.new.version_no',
        setting_value: existingMap.get('daily_report.new.version_no') || legacyVer,
        setting_type: 'string',
        section: 'daily_report',
        label: 'Version No.',
        description: 'Document version number for New Needle Present Balance reports',
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'daily_report.idle.document_no',
        setting_key: 'daily_report.idle.document_no',
        setting_value: existingMap.get('daily_report.idle.document_no') || legacyDoc,
        setting_type: 'string',
        section: 'daily_report',
        label: 'Document No.',
        description: 'Document identification number for Idle Needle Present Balance reports',
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'daily_report.idle.version_no',
        setting_key: 'daily_report.idle.version_no',
        setting_value: existingMap.get('daily_report.idle.version_no') || legacyVer,
        setting_type: 'string',
        section: 'daily_report',
        label: 'Version No.',
        description: 'Document version number for Idle Needle Present Balance reports',
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'total_needle_booth',
        setting_key: 'total_needle_booth',
        setting_value: existingMap.has('total_needle_booth')
          ? (existingMap.get('total_needle_booth') ?? '')
          : '',
        setting_type: 'integer',
        section: 'dashboard',
        label: 'Total Needle Booth',
        description: DASHBOARD_SETTING_META.total_needle_booth.description,
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        id: 'total_manpower',
        setting_key: 'total_manpower',
        setting_value: existingMap.has('total_manpower')
          ? (existingMap.get('total_manpower') ?? '')
          : '',
        setting_type: 'integer',
        section: 'dashboard',
        label: 'Total Manpower',
        description: DASHBOARD_SETTING_META.total_manpower.description,
        updated_by: null,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ]

    return { success: true, data: categorySettings }
  } catch (err: any) {
    console.error('[getSystemSettingsAction] error:', err)
    return { success: true, data: DEFAULT_SETTINGS }
  }
}

/**
 * Update system settings. Protected by admin.settings.edit or site admin.
 */
export async function updateSystemSettingsAction(
  updates: { setting_key: string; setting_value: string }[]
): Promise<ActionResult> {
  const actor = await requireActiveAccount()
  const canEdit = actor.isSiteAdmin || (await hasPermission(actor.profile.id, 'admin.settings.edit'))

  if (!canEdit) {
    return { success: false, error: 'Unauthorized: You do not have permission to modify system settings.' }
  }

  if (!updates || updates.length === 0) {
    return { success: false, error: 'No settings provided to update.' }
  }

  // Validate values per setting type
  for (const item of updates) {
    const trimmed = (item.setting_value ?? '').trim()
    if (item.setting_key in DASHBOARD_SETTING_META) {
      // Allow empty string (clears/unsets to "Not Available"), or strictly non-negative whole integer (including "0")
      if (trimmed !== '' && !/^\d+$/.test(trimmed)) {
        const label = DASHBOARD_SETTING_META[item.setting_key].label
        return {
          success: false,
          error: `${label} must be a non-negative whole number (0 or greater).`,
        }
      }
    } else if (!trimmed) {
      return { success: false, error: `Setting value for ${item.setting_key} cannot be empty.` }
    }
  }

  const admin = getAdminClient()

  try {
    // 1. Fetch current values for audit comparison
    const keys = updates.map((u) => u.setting_key)
    const { data: existingData } = await admin
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', keys)

    const existingMap = new Map<string, string>()
    for (const item of existingData || []) {
      existingMap.set(item.setting_key, item.setting_value)
    }

    // 2. Upsert (or clear) each setting
    for (const update of updates) {
      const trimmed = (update.setting_value ?? '').trim()
      const dashboardMeta = DASHBOARD_SETTING_META[update.setting_key]
      const isDashboardInt = Boolean(dashboardMeta)

      if (isDashboardInt && trimmed === '') {
        // Unset value: remove existing row if previously stored, otherwise skip no-op
        if (existingMap.has(update.setting_key)) {
          const oldVal = existingMap.get(update.setting_key) ?? ''
          const { error: delErr } = await admin
            .from('system_settings')
            .delete()
            .eq('setting_key', update.setting_key)

          if (delErr) throw delErr

          if (oldVal !== '') {
            await createAuditLog({
              actorUserId: actor.profile.id,
              eventType: 'SYSTEM_SETTING_UPDATED',
              entityType: 'system_settings',
              entityId: update.setting_key,
              oldData: { [update.setting_key]: oldVal },
              newData: { [update.setting_key]: null },
              metadata: {
                label: dashboardMeta.label,
                change: `${oldVal} → Not Available`,
                changed_by: actor.profile.name,
              },
            })
          }
        }
        continue
      }

      const cleanVal = isDashboardInt ? String(parseInt(trimmed, 10)) : trimmed
      const oldVal = existingMap.get(update.setting_key) ?? ''

      const upsertPayload: Record<string, unknown> = {
        setting_key: update.setting_key,
        setting_value: cleanVal,
        updated_by: actor.profile.id,
        updated_at: new Date().toISOString(),
      }

      if (dashboardMeta) {
        upsertPayload.setting_type = dashboardMeta.setting_type
        upsertPayload.section = dashboardMeta.section
        upsertPayload.label = dashboardMeta.label
        upsertPayload.description = dashboardMeta.description
      }

      const { error: upsertErr } = await admin
        .from('system_settings')
        .upsert(upsertPayload, { onConflict: 'setting_key' })

      if (upsertErr) {
        throw upsertErr
      }

      // 3. Record Audit Log for change
      if (!isDashboardInt || oldVal !== cleanVal) {
        await createAuditLog({
          actorUserId: actor.profile.id,
          eventType: 'SYSTEM_SETTING_UPDATED',
          entityType: 'system_settings',
          entityId: update.setting_key,
          oldData: { [update.setting_key]: oldVal || (isDashboardInt ? null : '') },
          newData: { [update.setting_key]: cleanVal },
          metadata: dashboardMeta
            ? {
                label: dashboardMeta.label,
                change: `${oldVal !== '' ? oldVal : 'Not Available'} → ${cleanVal}`,
                changed_by: actor.profile.name,
              }
            : undefined,
        })
      }
    }

    revalidatePath('/administration/system-settings')
    revalidatePath('/dashboard')
    return { success: true, message: 'Settings saved successfully.' }
  } catch (err: any) {
    console.error('[updateSystemSettingsAction] error:', err)
    return { success: false, error: err.message || 'Failed to update system settings.' }
  }
}
