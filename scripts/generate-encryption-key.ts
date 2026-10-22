#!/usr/bin/env node
/**
 * GMS ERP - Generate Token Encryption Key
 * Generates a cryptographically secure 256-bit (32 byte) key formatted as 64 hex characters.
 * 
 * Usage: npx tsx scripts/generate-encryption-key.ts
 */

import { randomBytes } from 'crypto'

const key = randomBytes(32).toString('hex')

console.log('\n======================================================')
console.log('  GMS ERP - TOKEN_ENCRYPTION_KEY Generated')
console.log('======================================================\n')
console.log(`TOKEN_ENCRYPTION_KEY=${key}\n`)
console.log('Copy this key into your .env.local file or deployment environment.')
console.log('SECURITY WARNING:')
console.log(' - NEVER expose this key to browser bundles.')
console.log(' - Keep the same key across restarts to allow decrypting active tokens.')
console.log('======================================================\n')
