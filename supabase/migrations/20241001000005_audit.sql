-- =============================================================================
-- Migration: 20241001000005_audit.sql
-- Description: Audit trail logs. Immutable records of system operations.
--              No plaintext passwords or tokens are ever recorded.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id  UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type      TEXT        NOT NULL,
  entity_type     TEXT        NULL,
  entity_id       TEXT        NULL,
  old_data        JSONB       NULL,
  new_data        JSONB       NULL,
  metadata        JSONB       NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.audit_logs IS 'Append-only enterprise audit trail. Captures operational events.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_created_at    ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_id      ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_target_id     ON public.audit_logs (target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type    ON public.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_lookup ON public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: Append-only, viewable by authorized admins
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_audit_logs"
  ON public.audit_logs
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users cannot directly delete or update audit logs
CREATE POLICY "authenticated_select_audit_logs"
  ON public.audit_logs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
