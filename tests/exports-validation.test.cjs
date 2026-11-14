const React = require('react')
if (!React.cache) {
  React.cache = (fn) => fn
}

const fs = require('fs')
const path = require('path')

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
const ExcelJS = require('exceljs')

test('Verify Export Generation with Paginated Batch Dataset', async (t) => {
  const { getBatchDailyReportData } = require('../src/lib/reports/daily-report-service')
  const { buildPresentBalanceSheet } = require('../src/lib/reports/excel-present-balance')
  const { buildSummarySheet } = require('../src/lib/reports/excel-summary-sheet')
  const { generateDailyStockReportWorkbook } = require('../src/lib/reports/excel-stock-report')
  const { generateMultiReportPresentBalancePDF } = require('../src/lib/reports/pdf-multi-generator')

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const date = '2026-11-09'
  const { data: allFloors } = await admin.from('floors').select('id').order('name')
  const allFloorIds = allFloors.map((f) => f.id)

  const batchRes = await getBatchDailyReportData({
    date,
    floorIds: allFloorIds,
    categories: ['NEW', 'RUNNING', 'IDLE'],
    actor: { profile: { id: 'admin', name: 'Tester' }, isSiteAdmin: true },
  })

  assert.ok(batchRes.success && batchRes.data, `Batch load failed: ${batchRes.error}`)
  const reports = batchRes.data

  await t.test('Daily Stock Excel generation with SUMMARY worksheet', async () => {
    const wb = new ExcelJS.Workbook()
    buildSummarySheet(wb, reports, date)
    for (const r of reports) {
      buildPresentBalanceSheet(wb, r)
    }
    const buffer = await wb.xlsx.writeBuffer()
    assert.ok(buffer.byteLength > 10000, 'Excel buffer size too small')
    assert.equal(wb.worksheets[0].name, 'SUMMARY', 'First worksheet must be SUMMARY')
    assert.equal(wb.worksheets.length, reports.length + 1, 'Total worksheets must match reports + 1')
  })

  await t.test('Daily Stock PDF generation with SUMMARY page', async () => {
    const pdfDoc = generateMultiReportPresentBalancePDF(reports, { includeSummary: true, date })
    const pdfOutput = pdfDoc.output('arraybuffer')
    assert.ok(pdfOutput.byteLength > 10000, 'PDF buffer size too small')
    assert.ok(pdfDoc.getNumberOfPages() > 1, 'PDF must contain multiple pages')
  })

  await t.test('Closing Stock Excel generation', async () => {
    const newReports = reports.filter((r) => r.category === 'NEW')
    const runningReports = reports.filter((r) => r.category === 'RUNNING')
    const idleReports = reports.filter((r) => r.category === 'IDLE')

    const closingBuffer = await generateDailyStockReportWorkbook({
      date,
      newReports,
      runningReports,
      idleReports,
    })
    assert.ok(closingBuffer.byteLength > 10000, 'Closing Stock buffer size too small')
  })
})
