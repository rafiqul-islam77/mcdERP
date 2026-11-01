-- Renew expired activation tokens for pending accounts whose password is not set.
-- Run the ENTIRE file in Supabase SQL Editor as postgres.
-- Preserves the SAME encrypted token and fingerprint; no encryption key is needed.
-- Valid for another 72 hours from execution (the application's normal lifetime).
-- Does not change passwords, profiles, roles, or already-valid activation tokens.
-- Only the latest activation token may be renewed. Used/revoked/missing payloads
-- are never restored. Applies to all qualifying pending accounts, not just one batch.
-- Re-running while the renewed tokens are valid makes no further changes.

BEGIN;

-- Keep account eligibility and token selection stable during this short migration.
LOCK TABLE public.profiles, public.user_access_tokens IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE renewed_activation_tokens ON COMMIT DROP AS
WITH latest AS (
  SELECT DISTINCT ON (t.user_id)
         t.id, t.user_id, t.status, t.expires_at, t.token_encrypted,
         t.used_at, t.revoked_at
  FROM public.user_access_tokens t
  JOIN public.profiles p ON p.id = t.user_id
  WHERE p.account_state = 'pending_activation'
    AND p.must_set_password = true
    AND t.purpose = 'activation'
  ORDER BY t.user_id, t.created_at DESC, t.id DESC
), eligible AS (
  SELECT l.* FROM latest l
  WHERE l.status IN ('active', 'expired')
    AND l.used_at IS NULL
    AND l.revoked_at IS NULL
    AND NULLIF(l.token_encrypted, '') IS NOT NULL
    AND (l.status = 'expired' OR l.expires_at <= now())
    -- Do not introduce a second valid activation token for an account.
    AND NOT EXISTS (
      SELECT 1 FROM public.user_access_tokens other
      WHERE other.user_id = l.user_id
        AND other.purpose = 'activation'
        AND other.status = 'active'
        AND other.expires_at > now()
    )
), renewed AS (
  UPDATE public.user_access_tokens t
  SET status = 'active', expires_at = now() + interval '72 hours'
  FROM eligible e
  WHERE t.id = e.id
  RETURNING t.id AS token_id, t.user_id, e.status AS previous_status,
            e.expires_at AS previous_expires_at, t.expires_at
)
SELECT * FROM renewed;

INSERT INTO public.audit_logs (
  target_user_id, event_type, entity_type, entity_id, old_data, new_data, metadata
)
SELECT user_id, 'ACTIVATION_TOKEN_RENEWED', 'user_access_token', token_id::text,
       jsonb_build_object('status', previous_status, 'expires_at', previous_expires_at),
       jsonb_build_object('status', 'active', 'expires_at', expires_at),
       jsonb_build_object('source', '20261101000001_renew_pending_activation_tokens',
                          'same_token_preserved', true)
FROM renewed_activation_tokens;

-- Result includes every eligible pending account, so skipped accounts are visible.
-- No token values or credentials are exposed in the output.
SELECT p.employee_id, p.name, p.account_state,
       CASE
         WHEN r.token_id IS NOT NULL THEN 'Renewed same token'
         WHEN EXISTS (
           SELECT 1 FROM public.user_access_tokens t
           WHERE t.user_id = p.id AND t.purpose = 'activation'
             AND t.status = 'active' AND t.expires_at > now()
             AND NULLIF(t.token_encrypted, '') IS NOT NULL
         ) THEN 'Already has a valid activation token'
         ELSE 'Skipped: no renewable latest token; review in Administration'
       END AS result,
       r.expires_at AS renewed_expires_at
FROM public.profiles p
LEFT JOIN renewed_activation_tokens r ON r.user_id = p.id
WHERE p.account_state = 'pending_activation' AND p.must_set_password = true
ORDER BY p.employee_id;

COMMIT;
