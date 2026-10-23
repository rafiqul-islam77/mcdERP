#!/usr/bin/env node
/**
 * GMS ERP - Reseed both separate catalogs from source-derived JSON (does not delete extra items)
 *
 * Usage:
 *   npx tsx scripts/seed-needles.ts
 */

import { createClient } from '@supabase/supabase-js'
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
} catch {}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase URL and service role key are required.')
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const catalogs = [
    { kind: 'normal', prefix: 'SN' },
    { kind: 'idle', prefix: 'IN' },
  ].map(catalog => ({
    ...catalog,
    items: JSON.parse(fs.readFileSync(path.resolve(`src/lib/data/${catalog.kind}-needle-seed.json`), 'utf8')) as Record<string, unknown>[],
  }))
  // Validate both catalogs before any writes. This command requires the reset migration.
  for (const catalog of catalogs) {
    if (catalog.items.some(item => !String(item.item_code).startsWith(catalog.prefix))) {
      throw new Error(`Invalid codes in ${catalog.kind} seed data.`)
    }
    for (const table of [`${catalog.kind}_needle_items`, `${catalog.kind}_needle_floor_assignments`]) {
      const { error } = await db.from(table).select('id').limit(1)
      if (error) throw new Error(`Cannot access ${table}. Run 20261023000002_reset_separate_needle_catalogs.sql first. ${error.message}`)
    }
  }
  const floors: { id: string }[] = []
  while (true) {
    const { data, error } = await db.from('floors').select('id').eq('active', true)
      .order('id').range(floors.length, floors.length + 999)
    if (error) throw error
    if (!data.length) break
    floors.push(...data)
  }
  if (!floors.length) throw new Error('Create or enable floors before seeding needles.')
  for (const catalog of catalogs) {
    for (let offset = 0; offset < catalog.items.length; offset += 50) {
      const batch = catalog.items.slice(offset, offset + 50)
      const { data, error } = await db.from(`${catalog.kind}_needle_items`)
        .upsert(batch, { onConflict: 'item_code' }).select('id')
      if (error) throw error
      if (data.length !== batch.length) throw new Error('Incomplete seed response; floor assignments were not confirmed.')
      const links = data.flatMap(item => floors.map(floor => ({ needle_item_id: item.id, floor_id: floor.id })))
      for (let i = 0; i < links.length; i += 200) {
        const { error } = await db.from(`${catalog.kind}_needle_floor_assignments`)
          .upsert(links.slice(i, i + 200), { onConflict: 'needle_item_id,floor_id' })
        if (error) throw error
      }
    }
    console.log(`Seeded ${catalog.items.length} ${catalog.kind} needles; selected all ${floors.length} active floors.`)
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
