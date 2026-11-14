const React = require('react')
if (!React.cache) {
  React.cache = (fn) => fn
}

const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      const key = match[1]
      let value = match[2] || ''
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
      process.env[key] = value.trim()
    }
  }
}

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createClient } = require('@supabase/supabase-js')

test('Report Studio Data Accuracy & Multi-Floor Parity Validation', async (t) => {
  const { getBatchDailyReportData, fetchAllRowsPaginated } = require(
    '../src/lib/reports/daily-report-service'
  )

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const date = '2026-11-09'
  const aFloorId = '760a9fae-9c62-434e-9afa-d453a7b4f1e9' // A Floor (Building 02)

  // 1. Total RUNNING transactions retrieved across all floors
  await t.test('retrieves all 1,252 RUNNING transactions without truncation', async () => {
    const { data: allFloors } = await admin.from('floors').select('id')
    const allFloorIds = allFloors.map((f) => f.id)

    const allTx = await fetchAllRowsPaginated(() =>
      admin
        .from('needle_running_transactions')
        .select('id, needle_item_id, floor_id, transaction_date, transaction_type, quantity')
        .in('floor_id', allFloorIds)
        .lte('transaction_date', date)
        .order('id', { ascending: true })
    )

    assert.equal(allTx.length, 1252, `Expected 1252 RUNNING transactions, got ${allTx.length}`)

    const aFloorTx = allTx.filter((tx) => tx.floor_id === aFloorId)
    assert.equal(aFloorTx.length, 124, `Expected 124 transactions for A Floor, got ${aFloorTx.length}`)
  })

  // 2. Parity Test: Path A (single-floor authoritative) vs Path B (batch multi-floor)
  await t.test('A Floor RUNNING exactly matches authoritative Daily Report values', async () => {
    const { data: allFloors } = await admin.from('floors').select('id')
    const allFloorIds = allFloors.map((f) => f.id)

    // Batch multi-floor fetch (all floors)
    const batchRes = await getBatchDailyReportData({
      date,
      floorIds: allFloorIds,
      categories: ['RUNNING'],
    })
    assert.ok(batchRes.success && batchRes.data, `Path B fetch failed: ${batchRes.error}`)
    const repBatch = batchRes.data.find((r) => r.floorId === aFloorId && r.category === 'RUNNING')
    assert.ok(repBatch, 'A Floor RUNNING report missing from batch results')

    // Confirm specific audited needle items
    const expectedNeedles = {
      'SN-013': { previous: 24, received: 0, delivery: 4, present: 20 },
      'SN-029': { previous: 0, received: 150, delivery: 8, present: 142 },
      'SN-036': { previous: 151, received: 0, delivery: 15, present: 136 },
      'SN-107': { previous: 424, received: 400, delivery: 106, present: 718 },
    }

    for (const [code, expected] of Object.entries(expectedNeedles)) {
      const row = repBatch.rows.find((r) => r.item_code === code)
      assert.ok(row, `Needle ${code} not found in batch report`)
      assert.equal(row.previous, expected.previous, `${code} previous mismatch`)
      assert.equal(row.received, expected.received, `${code} received mismatch`)
      assert.equal(row.delivery, expected.delivery, `${code} delivery mismatch`)
      assert.equal(row.present, expected.present, `${code} present mismatch`)
    }

    // Floor Totals Test
    assert.equal(repBatch.summary.totalPrevious, 2616, 'Total previous mismatch')
    assert.equal(repBatch.summary.totalReceived, 1100, 'Total received mismatch')
    assert.equal(repBatch.summary.totalDelivery, 236, 'Total delivery mismatch')
    assert.equal(repBatch.summary.totalPresent, 3480, 'Total present mismatch')
    assert.equal(repBatch.rows.length, 34, 'Expected 34 assigned needle rows for A Floor')

    // Direct single-floor database calculation check (authoritative Daily Entry formula)
    const { data: assignments } = await admin
      .from('normal_needle_floor_assignments')
      .select('needle_item_id, normal_needle_items(id, item_code)')
      .eq('floor_id', aFloorId)
      .eq('entry_type', 'running')

    const { data: aFloorDirectTx } = await admin
      .from('needle_running_transactions')
      .select('needle_item_id, transaction_date, transaction_type, quantity')
      .eq('floor_id', aFloorId)
      .lte('transaction_date', date)

    assert.equal(aFloorDirectTx.length, 124, 'Direct query should find 124 transactions on A Floor')

    for (const assign of assignments || []) {
      const item = assign.normal_needle_items
      if (!item) continue
      const txs = aFloorDirectTx.filter((t) => t.needle_item_id === item.id)
      let prev = 0, rcvd = 0, dlvd = 0, tin = 0, tout = 0, adj = 0
      for (const t of txs) {
        const q = Number(t.quantity) || 0
        if (t.transaction_date < date) {
          if (['OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(t.transaction_type)) prev += q
          else if (['ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'].includes(t.transaction_type)) prev -= q
        } else if (t.transaction_date === date) {
          if (t.transaction_type === 'RECEIVE') rcvd += q
          else if (t.transaction_type === 'ISSUE') dlvd += q
          else if (t.transaction_type === 'TRANSFER_IN') tin += q
          else if (t.transaction_type === 'TRANSFER_OUT') tout += q
          else if (t.transaction_type === 'ADJUSTMENT_IN') adj += q
          else if (t.transaction_type === 'ADJUSTMENT_OUT') adj -= q
        }
      }
      const pres = prev + rcvd + tin - dlvd - tout + adj
      const batchRow = repBatch.rows.find((r) => r.needle_item_id === item.id)
      assert.ok(batchRow, `Needle ${item.item_code} missing in batch report`)
      assert.equal(batchRow.previous, prev, `${item.item_code} previous mismatch vs direct DB calc`)
      assert.equal(batchRow.received, rcvd, `${item.item_code} received mismatch vs direct DB calc`)
      assert.equal(batchRow.delivery, dlvd, `${item.item_code} delivery mismatch vs direct DB calc`)
      assert.equal(batchRow.present, pres, `${item.item_code} present mismatch vs direct DB calc`)
    }
  })

  // 3. Selection Size Stability (Test A == Test B == Test C)
  await t.test('selection size stability across single-floor vs all-floors vs all-categories', async () => {
    const { data: allFloors } = await admin.from('floors').select('id')
    const allFloorIds = allFloors.map((f) => f.id)

    // Test A: A Floor only, RUNNING
    const testARes = await getBatchDailyReportData({
      date,
      floorIds: [aFloorId],
      categories: ['RUNNING'],
    })
    assert.ok(testARes.success && testARes.data, `Test A failed: ${testARes.error}`)
    const repA = testARes.data.find((r) => r.floorId === aFloorId && r.category === 'RUNNING')
    assert.ok(repA, 'repA not found')

    // Test B: All Floors, RUNNING
    const testBRes = await getBatchDailyReportData({
      date,
      floorIds: allFloorIds,
      categories: ['RUNNING'],
    })
    assert.ok(testBRes.success && testBRes.data, `Test B failed: ${testBRes.error}`)
    const repB = testBRes.data.find((r) => r.floorId === aFloorId && r.category === 'RUNNING')
    assert.ok(repB, 'repB not found')

    // Test C: All Floors, NEW + RUNNING + IDLE
    const testCRes = await getBatchDailyReportData({
      date,
      floorIds: allFloorIds,
      categories: ['NEW', 'RUNNING', 'IDLE'],
    })
    assert.ok(testCRes.success && testCRes.data, `Test C failed: ${testCRes.error}`)
    const repC = testCRes.data.find((r) => r.floorId === aFloorId && r.category === 'RUNNING')
    assert.ok(repC, 'repC not found')

    assert.deepEqual(repA.summary, repB.summary, 'Test A vs Test B summary mismatch')
    assert.deepEqual(repB.summary, repC.summary, 'Test B vs Test C summary mismatch')

    for (let i = 0; i < repA.rows.length; i++) {
      assert.equal(repA.rows[i].present, repB.rows[i].present, `Row ${i} present mismatch (A vs B)`)
      assert.equal(repB.rows[i].present, repC.rows[i].present, `Row ${i} present mismatch (B vs C)`)
    }
  })
})
