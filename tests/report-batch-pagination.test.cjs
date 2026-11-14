const React = require('react')
if (!React.cache) {
  React.cache = (fn) => fn
}

const assert = require('node:assert/strict')
const { test } = require('node:test')

// Test suite for Report Studio Batch Pagination & Data Accuracy Fix
test('fetchAllRowsPaginated - Pagination Boundary Tests', async (t) => {
  // Dynamically import fetchAllRowsPaginated from daily-report-service
  const { fetchAllRowsPaginated } = await import('../src/lib/reports/daily-report-service')

  const boundaryCases = [
    { count: 0, label: '0 records (empty set)' },
    { count: 499, label: '499 records (less than 1 page)' },
    { count: 500, label: '500 records (exact 1 page)' },
    { count: 501, label: '501 records (1 page + 1 record)' },
    { count: 999, label: '999 records (< 2 pages)' },
    { count: 1000, label: '1000 records (exact 2 pages / previous PostgREST limit)' },
    { count: 1001, label: '1001 records (2 pages + 1 record / crosses 1000 threshold)' },
    { count: 1500, label: '1500 records (exact 3 pages)' },
    { count: 1750, label: '1750 records (> 3 pages)' },
  ]

  for (const { count, label } of boundaryCases) {
    await t.test(`fetches exactly ${label}`, async () => {
      // Generate deterministic synthetic dataset
      const dataset = Array.from({ length: count }, (_, i) => ({
        id: `id-${String(i).padStart(6, '0')}`,
        index: i,
        data: `item-${i}`,
      }))

      let callCount = 0

      // Mock query builder factory with .range(from, to)
      const mockBuildQuery = () => ({
        range: async (from, to) => {
          callCount++
          const slice = dataset.slice(from, to + 1)
          return { data: slice, error: null }
        },
      })

      const results = await fetchAllRowsPaginated(mockBuildQuery, 500)

      // 1. Every record is retrieved
      assert.equal(results.length, count, `Expected ${count} records, got ${results.length}`)

      // 2. No duplicates
      const uniqueIds = new Set(results.map((r) => r.id))
      assert.equal(uniqueIds.size, count, `Expected ${count} unique IDs`)

      // 3. Deterministic ordering
      for (let i = 0; i < results.length; i++) {
        assert.equal(results[i].index, i, `Record at index ${i} has wrong order`)
      }

      // 4. Expected page fetch calls
      const expectedCalls = count === 0 ? 1 : Math.floor(count / 500) + 1
      assert.equal(callCount, expectedCalls, `Expected ${expectedCalls} range calls, got ${callCount}`)
    })
  }

  await t.test('propagates query failure and does not return partial data', async () => {
    let callCount = 0
    const mockBuildQuery = () => ({
      range: async (from, to) => {
        callCount++
        if (from >= 500) {
          return { data: null, error: new Error('Postgres connection timeout at page 2') }
        }
        return {
          data: Array.from({ length: 500 }, (_, i) => ({ id: `id-${i}` })),
          error: null,
        }
      },
    })

    await assert.rejects(
      async () => {
        await fetchAllRowsPaginated(mockBuildQuery, 500)
      },
      /Postgres connection timeout at page 2/,
      'Should rethrow database error when pagination fails'
    )
    assert.equal(callCount, 2, 'Should fail on second page call')
  })
})
