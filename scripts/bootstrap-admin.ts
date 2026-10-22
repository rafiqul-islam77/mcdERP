#!/usr/bin/env node
/**
 * GMS ERP - First Site Admin Bootstrap CLI
 * 
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts
 * 
 * Or pass parameters via environment:
 *   ADMIN_EMP_ID=EMP-001 ADMIN_NAME="Site Admin" ADMIN_EMAIL="admin@gms.com" npx tsx scripts/bootstrap-admin.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'
import { randomBytes, createCipheriv } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

// Attempt to load .env.local if present
try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let val = (match[2] || '').trim()
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
} catch (e) {}

// AES-256-GCM Token encryption
function encryptToken(plaintext: string): string {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Run: npm run generate-key')
  }
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':')
}

function generateTokenPlaintext(): string {
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const chars: string[] = []
  while (chars.length < 8) {
    const byte = randomBytes(1)[0]
    if (byte < Math.floor(256 / CHARSET.length) * CHARSET.length) {
      chars.push(CHARSET[byte % CHARSET.length])
    }
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

async function main() {
  console.log('\n======================================================')
  console.log('   GMS NEEDLE MANAGEMENT ERP - BOOTSTRAP SITE ADMIN   ')
  console.log('======================================================\n')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const encKey = process.env.TOKEN_ENCRYPTION_KEY

  if (!supabaseUrl || !serviceKey || !encKey) {
    console.error('ERROR: Required environment variables are missing:')
    if (!supabaseUrl) console.error(' - NEXT_PUBLIC_SUPABASE_URL')
    if (!serviceKey) console.error(' - SUPABASE_SERVICE_ROLE_KEY')
    if (!encKey) console.error(' - TOKEN_ENCRYPTION_KEY')
    console.error('\nPlease ensure your .env.local file is configured.\n')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  try {
    const empIdInput =
      process.env.ADMIN_EMP_ID ||
      (await prompt(rl, 'Enter Employee ID [default: EMP-001]: '))
    const employeeId = (empIdInput.trim() || 'EMP-001').toUpperCase()

    const nameInput =
      process.env.ADMIN_NAME ||
      (await prompt(rl, 'Enter Full Name [default: System Administrator]: '))
    const name = nameInput.trim() || 'System Administrator'

    const emailInput =
      process.env.ADMIN_EMAIL ||
      (await prompt(rl, 'Enter Email Address: '))
    const email = emailInput.trim().toLowerCase()

    if (!email || !email.includes('@')) {
      console.error('ERROR: A valid email address is required.')
      rl.close()
      process.exit(1)
    }

    console.log(`\nInitializing Site Admin for ${employeeId} (${email})...`)

    // 1. Check if Site Admin role exists
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'Site Admin')
      .single()

    if (roleError || !role) {
      console.error('ERROR: "Site Admin" role not found in database.')
      console.error('Please run database migrations first: npx supabase db reset')
      rl.close()
      process.exit(1)
    }

    // 2. Check if employee already exists in profiles
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, employee_id, email')
      .or(`employee_id.eq.${employeeId},email.eq.${email}`)
      .maybeSingle()

    if (existing) {
      console.error(`ERROR: A profile with Employee ID "${employeeId}" or Email "${email}" already exists.`)
      rl.close()
      process.exit(1)
    }

    // 3. Create Supabase Auth user (temporary random password)
    const tempPassword = randomBytes(24).toString('hex')
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { employee_id: employeeId, name },
    })

    if (authError || !authUser.user) {
      console.error(`ERROR creating Supabase Auth user: ${authError?.message}`)
      rl.close()
      process.exit(1)
    }

    const userId = authUser.user.id

    // 4. Create Profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      employee_id: employeeId,
      name,
      email,
      role_id: role.id,
      account_state: 'pending_activation',
      must_set_password: true,
    })

    if (profileError) {
      console.error(`ERROR creating profile record: ${profileError.message}`)
      await supabase.auth.admin.deleteUser(userId)
      rl.close()
      process.exit(1)
    }

    // 5. Generate Activation Token & Encrypt
    const tokenPlaintext = generateTokenPlaintext()
    const tokenEncrypted = encryptToken(tokenPlaintext)
    const tokenFingerprint = tokenPlaintext.slice(0, 4)
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()

    const { error: tokenError } = await supabase.from('user_access_tokens').insert({
      user_id: userId,
      token_encrypted: tokenEncrypted,
      token_fingerprint: tokenFingerprint,
      purpose: 'activation',
      status: 'active',
      expires_at: expiresAt,
      created_by: userId,
    })

    if (tokenError) {
      console.error(`ERROR saving activation token: ${tokenError.message}`)
      rl.close()
      process.exit(1)
    }

    // 6. Record Audit Log
    await supabase.from('audit_logs').insert({
      actor_user_id: userId,
      target_user_id: userId,
      event_type: 'USER_CREATED',
      entity_type: 'profile',
      entityId: userId,
      metadata: { bootstrap: true, employee_id: employeeId },
    })

    rl.close()

    console.log('\n======================================================')
    console.log('      SITE ADMIN ACCOUNT CREATED SUCCESSFULLY!       ')
    console.log('======================================================\n')
    console.log(`  Employee ID     : ${employeeId}`)
    console.log(`  Name            : ${name}`)
    console.log(`  Email           : ${email}`)
    console.log(`  Role            : Site Admin (Full Access)`)
    console.log(`  Account State   : pending_activation\n`)
    console.log('------------------------------------------------------')
    console.log('  ONE-TIME ACTIVATION TOKEN (valid for 72 hours):')
    console.log(`  >>>  ${tokenPlaintext}  <<<`)
    console.log('------------------------------------------------------\n')
    console.log('Instructions:')
    console.log(' 1. Start the application: npm run dev')
    console.log(' 2. Navigate to: http://localhost:3000/activate')
    console.log(` 3. Enter Employee ID: ${employeeId}`)
    console.log(` 4. Enter Token: ${tokenPlaintext}`)
    console.log(' 5. Set your new password to activate your account.\n')
    console.log('======================================================\n')
  } catch (err) {
    console.error('Unexpected error during bootstrap:', err)
    rl.close()
    process.exit(1)
  }
}

main()
