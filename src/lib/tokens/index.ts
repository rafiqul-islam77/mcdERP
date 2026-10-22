// server-only – never import in browser components or Client Components.
import { randomBytes, timingSafeEqual } from 'crypto'
import { getAdminClient } from '@/lib/supabase/admin'
import { encryptToken, decryptToken } from '@/lib/encryption/tokens'
import type { TokenPurpose } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure 8-character uppercase alphanumeric
 * token in XXXX-XXXX format.
 *
 * Uses rejection sampling over crypto.randomBytes to avoid modulo bias.
 */
export function generateTokenPlaintext(): string {
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const CHARSET_LEN = CHARSET.length
  const TOKEN_CHARS = 8

  const chars: string[] = []
  while (chars.length < TOKEN_CHARS) {
    const byte = randomBytes(1)[0]
    // Reject bytes >= floor(256/CHARSET_LEN)*CHARSET_LEN to eliminate modulo bias
    if (byte < Math.floor(256 / CHARSET_LEN) * CHARSET_LEN) {
      chars.push(CHARSET[byte % CHARSET_LEN])
    }
  }

  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

// ─── Core token operations ────────────────────────────────────────────────────

/**
 * Creates a new access token for the given user+purpose.
 *
 * Steps:
 * 1. Revoke all existing active tokens for this user+purpose.
 * 2. Generate a new plaintext token.
 * 3. Encrypt it for storage.
 * 4. Persist the record.
 * 5. Return the plaintext (shown to admin ONCE – not stored in plaintext).
 */
export async function createToken(
  userId: string,
  purpose: TokenPurpose,
  createdBy: string,
  expiryHours = 72,
): Promise<{ tokenPlaintext: string; tokenId: string }> {
  const admin = getAdminClient()

  // 1. Revoke existing active tokens for this user+purpose
  await revokeUserTokens(userId, purpose)

  // 2. Generate plaintext token
  const tokenPlaintext = generateTokenPlaintext()

  // 3. Encrypt
  const tokenEncrypted = encryptToken(tokenPlaintext)

  // 4. Token fingerprint = first 4 chars (before the dash), used for hint display
  const tokenFingerprint = tokenPlaintext.slice(0, 4)

  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()

  // 5. Persist
  const { data, error } = await admin
    .from('user_access_tokens')
    .insert({
      user_id: userId,
      token_encrypted: tokenEncrypted,
      token_fingerprint: tokenFingerprint,
      purpose,
      status: 'active',
      expires_at: expiresAt,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(
      `[tokens] Failed to persist token for user ${userId}: ${error?.message ?? 'No data returned'}`,
    )
  }

  return { tokenPlaintext, tokenId: data.id }
}

/**
 * Verifies a submitted token against the stored encrypted token.
 *
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyToken(
  userId: string,
  submittedToken: string,
  purpose: TokenPurpose,
): Promise<{ valid: boolean; tokenId?: string; reason?: string }> {
  const admin = getAdminClient()

  // Fetch the active, non-expired token record
  const { data, error } = await admin
    .from('user_access_tokens')
    .select('id, token_encrypted, expires_at')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error) {
    console.error('[tokens] verifyToken db error:', error.message)
    return { valid: false, reason: 'Database error during token lookup' }
  }

  if (!data || !data.token_encrypted) {
    return { valid: false, reason: 'No active token found' }
  }

  // Decrypt the stored token
  let storedPlaintext: string
  try {
    storedPlaintext = decryptToken(data.token_encrypted)
  } catch (err) {
    console.error('[tokens] verifyToken decryption error:', err)
    return { valid: false, reason: 'Token decryption failed' }
  }

  // Constant-time comparison
  const submittedBuf = Buffer.from(submittedToken.trim().toUpperCase(), 'utf8')
  const storedBuf = Buffer.from(storedPlaintext, 'utf8')

  if (submittedBuf.length !== storedBuf.length) {
    return { valid: false, reason: 'Token mismatch' }
  }

  const match = timingSafeEqual(submittedBuf, storedBuf)

  if (!match) {
    return { valid: false, reason: 'Token mismatch' }
  }

  return { valid: true, tokenId: data.id }
}

/**
 * Marks a token as used and clears its encrypted value.
 * Call immediately after a successful token verification.
 */
export async function consumeToken(tokenId: string): Promise<void> {
  const admin = getAdminClient()

  const { error } = await admin
    .from('user_access_tokens')
    .update({
      status: 'used',
      used_at: new Date().toISOString(),
      token_encrypted: null,
    })
    .eq('id', tokenId)

  if (error) {
    throw new Error(`[tokens] consumeToken failed for id=${tokenId}: ${error.message}`)
  }
}

/**
 * Revokes all active tokens for a user, optionally scoped to a specific purpose.
 */
export async function revokeUserTokens(
  userId: string,
  purpose?: TokenPurpose,
): Promise<void> {
  const admin = getAdminClient()

  let query = admin
    .from('user_access_tokens')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'active')

  if (purpose) {
    query = query.eq('purpose', purpose)
  }

  const { error } = await query

  if (error) {
    throw new Error(
      `[tokens] revokeUserTokens failed for user=${userId}: ${error.message}`,
    )
  }
}

/**
 * Reveals the plaintext of an active token for admin inspection.
 * Returns null if no active token exists.
 *
 * ⚠ This should only be called by an authorised admin and the call must
 * be logged via createAuditLog (ACTIVATION_TOKEN_REVEALED / RECOVERY_TOKEN_REVEALED).
 */
export async function revealToken(
  userId: string,
  purpose: TokenPurpose,
): Promise<string | null> {
  const admin = getAdminClient()

  const { data, error } = await admin
    .from('user_access_tokens')
    .select('token_encrypted')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error) {
    throw new Error(
      `[tokens] revealToken db error for user=${userId}: ${error.message}`,
    )
  }

  if (!data?.token_encrypted) return null

  return decryptToken(data.token_encrypted)
}
