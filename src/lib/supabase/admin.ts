// server-only – never import in browser components or Client Components.
// This module uses SUPABASE_SERVICE_ROLE_KEY which must never reach the client bundle.
import { createClient } from '@supabase/supabase-js'

/**
 * Returns a singleton Supabase admin client backed by the service role key.
 *
 * Use ONLY for privileged server-side operations:
 *  - Creating / managing auth users
 *  - Generating / revoking access tokens
 *  - Admin-level database mutations that bypass RLS
 *
 * Never pass this client instance to client-side code.
 */
let _adminClient: any = null

export function getAdminClient(): any {
  if (_adminClient) return _adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('[supabase/admin] Missing NEXT_PUBLIC_SUPABASE_URL')
  }
  if (!serviceKey) {
    throw new Error(
      '[supabase/admin] Missing SUPABASE_SERVICE_ROLE_KEY – this module is server-only',
    )
  }

  _adminClient = createClient(url, serviceKey, {
    auth: {
      // Disable automatic session persistence; admin client is stateless.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  return _adminClient
}
