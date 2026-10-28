'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireActiveAccount } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import type { ActionResult, SystemSetting } from '@/types'

const DEFAULT_SETTINGS: SystemSetting[] = [
  {
    id: '1',
    setting_key: 'daily_report.document_no',
    setting_value: 'QA/03/310',
    setting_type: 'string',
    section: 'daily_report',
    label: 'Document No.',
    description: 'Document identification number for Daily Sewing Needle Present Balance reports',
    updated_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    setting_key: 'daily_report.version_no',
    setting_value: '01/2026',
    setting_type: 'string',
    section: 'daily_report',
    label: 'Version No.',
    description: 'Document version number for Daily Sewing Needle Present Balance reports',
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

    if (!data || data.length === 0) {
      return { success: true, data: DEFAULT_SETTINGS }
    }

    return { success: true, data: data as SystemSetting[] }
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

  // Validate non-empty values
  for (const item of updates) {
    if (!item.setting_value || !item.setting_value.trim()) {
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

    // 2. Upsert each setting
    for (const update of updates) {
      const cleanVal = update.setting_value.trim()
      const oldVal = existingMap.get(update.setting_key) ?? ''

      const { error: upsertErr } = await admin.from('system_settings').upsert(
        {
          setting_key: update.setting_key,
          setting_value: cleanVal,
          updated_by: actor.profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'setting_key' }
      )

      if (upsertErr) {
        throw upsertErr
      }

      // 3. Record Audit Log for change
      await createAuditLog({
        actorUserId: actor.profile.id,
        eventType: 'SYSTEM_SETTING_UPDATED',
        entityType: 'system_settings',
        entityId: update.setting_key,
        oldData: { [update.setting_key]: oldVal },
        newData: { [update.setting_key]: cleanVal },
      })
    }

    revalidatePath('/administration/system-settings')
    return { success: true, message: 'Settings saved successfully.' }
  } catch (err: any) {
    console.error('[updateSystemSettingsAction] error:', err)
    return { success: false, error: err.message || 'Failed to update system settings.' }
  }
}
