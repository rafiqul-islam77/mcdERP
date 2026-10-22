import { requireActiveAccount } from '@/lib/auth'
import { requirePermission } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase/admin'
import { AuditLogClient } from './_components/audit-log-client'

export default async function AuditPage() {
  const user = await requireActiveAccount()
  await requirePermission(user.profile.id, 'admin.audit.view')

  const admin = getAdminClient()

  // Fetch recent audit logs with actor and target info
  const { data: logs } = await admin
    .from('audit_logs')
    .select(`
      *,
      actor:actor_user_id(employee_id, name),
      target:target_user_id(employee_id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  return <AuditLogClient initialLogs={logs || []} />
}
