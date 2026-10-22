-- =============================================================================
-- Migration: 20241001000004_tokens.sql
-- Description: Encrypted one-time access tokens for activation and recovery.
--              Tokens are stored encrypted at rest (AES-256-GCM).
--              Never stored in plaintext. Disposed (token_encrypted=NULL) on use.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_access_tokens (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_encrypted   TEXT        NULL,
  token_fingerprint TEXT        NULL,
  purpose           TEXT        NOT NULL CONSTRAINT chk_tokens_purpose CHECK (purpose IN ('activation', 'recovery')),
  status            TEXT        NOT NULL DEFAULT 'active' CONSTRAINT chk_tokens_status CHECK (status IN ('active', 'used', 'revoked', 'expired')),
  expires_at        TIMESTAMPTZ NULL,
  used_at           TIMESTAMPTZ NULL,
  revoked_at        TIMESTAMPTZ NULL,
  created_by        UUID        NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.user_access_tokens IS 'One-time activation and password recovery tokens encrypted at rest.';
COMMENT ON COLUMN public.user_access_tokens.token_encrypted IS 'AES-256-GCM encrypted payload (iv:tag:ciphertext). Nullified once used.';
COMMENT ON COLUMN public.user_access_tokens.token_fingerprint IS 'Non-secret first 4 characters for UI identification, e.g. A7K9.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tokens_user_id           ON public.user_access_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_status            ON public.user_access_tokens (status);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at        ON public.user_access_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_user_purpose_stat ON public.user_access_tokens (user_id, purpose, status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_access_tokens ENABLE ROW LEVEL SECURITY;

-- Tokens are strictly managed server-side via service_role to avoid any browser leakage
CREATE POLICY "service_role_all_user_access_tokens"
  ON public.user_access_tokens
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
