#!/usr/bin/env node
/**
 * GMS ERP - Seed Needle Master Items from Excel/initial-needles.json
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
  console.log('\n=========================================')
  console.log('  GMS ERP - Seed Needle Master Data')
  console.log('=========================================\n')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('ERROR: Required environment variables missing:')
    console.error('  NEXT_PUBLIC_SUPABASE_URL')
    console.error('  SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load JSON items
  const jsonPath = path.resolve(process.cwd(), 'src/lib/data/initial-needles.json')
  if (!fs.existsSync(jsonPath)) {
    console.error('ERROR: src/lib/data/initial-needles.json not found.')
    process.exit(1)
  }

  const items = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  console.log(`Loaded ${items.length} needle items from ${jsonPath}`)

  // Check if table exists
  const { error: testErr } = await supabase.from('needle_items').select('id').limit(1)
  if (testErr) {
    console.error('\nERROR: needle_items table does not exist in Supabase yet.')
    console.error('Please run the migration in Supabase SQL Editor:')
    console.error('  supabase/migrations/20241001000008_needle_master.sql')
    process.exit(1)
  }

  console.log('\nSeeding needle items into needle_items...')
  const batchSize = 50
  let inserted = 0

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const { error } = await supabase.from('needle_items').upsert(batch, {
      onConflict: 'item_code',
    })

    if (error) {
      console.error(`Error inserting batch ${i} - ${i + batch.length}:`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`  Seeded ${inserted}/${items.length} items...\r`)
    }
  }

  console.log(`\n✅ Successfully seeded ${inserted} needle master items!`)

  // Assign ALL active floors to every needle item for 'needle' and 'ideal_needle' groups
  const { data: floors } = await supabase
    .from('floors')
    .select('id, code, name')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (floors && floors.length > 0) {
    console.log(`\nAssigning baseline needles to ALL ${floors.length} active floors...`)

    const { data: allItems } = await supabase.from('needle_items').select('id, item_code')
    if (allItems && allItems.length > 0) {
      const assignments: { needle_item_id: string; floor_id: string; needle_group: string }[] = []

      for (const item of allItems) {
        for (const floor of floors) {
          assignments.push({
            needle_item_id: item.id,
            floor_id: floor.id,
            needle_group: 'needle',
          })
          assignments.push({
            needle_item_id: item.id,
            floor_id: floor.id,
            needle_group: 'ideal_needle',
          })
        }
      }

      console.log(`Inserting ${assignments.length} floor assignments in batches...`)
      for (let i = 0; i < assignments.length; i += 200) {
        const batch = assignments.slice(i, i + 200)
        await supabase.from('needle_floor_assignments').upsert(batch, {
          onConflict: 'needle_item_id,floor_id,needle_group',
        })
      }

      console.log('✅ Baseline floor assignments established for ALL floors!')
    }
  }

  console.log('\nDone!\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
