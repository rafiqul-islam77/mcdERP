// server-only – never import in browser components or Client Components.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12  // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16

/**
 * Resolves and validates TOKEN_ENCRYPTION_KEY from env.
 * Must be a 64-character hex string (= 32 bytes = 256 bits).
 */
function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY

  if (!raw) {
    throw new Error(
      '[encryption/tokens] TOKEN_ENCRYPTION_KEY environment variable is not set. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
  }

  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      '[encryption/tokens] TOKEN_ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes).',
    )
  }

  return Buffer.from(raw, 'hex')
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @returns Base64-encoded string in the format: `<iv>:<authTag>:<ciphertext>`
 *          All three segments are individually base64-encoded.
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/**
 * Decrypts a token previously encrypted by {@link encryptToken}.
 *
 * @param encrypted – Base64 string in the format `<iv>:<authTag>:<ciphertext>`
 * @returns The original plaintext string
 * @throws If the format is invalid, the key is wrong, or the auth tag fails
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey()

  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error(
      '[encryption/tokens] Invalid encrypted token format. Expected iv:authTag:ciphertext',
    )
  }

  const [ivB64, authTagB64, ciphertextB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')

  if (iv.length !== IV_LENGTH) {
    throw new Error('[encryption/tokens] Corrupted IV length in encrypted token.')
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('[encryption/tokens] Corrupted auth tag length in encrypted token.')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    throw new Error(
      '[encryption/tokens] Decryption failed – token may be tampered with or the key is incorrect.',
    )
  }
}
