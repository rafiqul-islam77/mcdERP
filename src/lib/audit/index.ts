import { getAdminClient } from '@/lib/supabase/admin'
import type { AuditEventType } from '@/types'

interface AuditParams {
  actorUserId?: string | null
  targetUserId?: string | null
  eventType: AuditEventType
  entityType?: string
  entityId?: string
  oldData?: Record<string, unknown> | null
  newData?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

/**
 * Strips sensitive fields (passwords, tokens, secrets) before logging.
 */
function sanitizeAuditPayload(obj?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!obj) return null
  const sanitized = { ...obj }
  const sensitiveKeys = [
    'password',
    'password_hash',
    'token',
    'tokenPlaintext',
    'token_encrypted',
    'TOKEN_ENCRYPTION_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'secret',
  ]
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
      sanitized[key] = '[REDACTED]'
    }
  }
  return sanitized
}

/**
 * Record an immutable audit log entry.
 * Errors during audit creation are captured to prevent blocking main business workflows.
 */
export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    const admin = getAdminClient()
    await admin.from('audit_logs').insert({
      actor_user_id: params.actorUserId || null,
      target_user_id: params.targetUserId || null,
      event_type: params.eventType,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      old_data: sanitizeAuditPayload(params.oldData),
      new_data: sanitizeAuditPayload(params.newData),
      metadata: sanitizeAuditPayload(params.metadata),
    })
  } catch (err) {
    // Non-fatal, never leak or break user action
    console.error('[AUDIT_ERROR] Failed to record audit log:', err)
  }
}
