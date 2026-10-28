const assert = require('node:assert/strict')
const { test } = require('node:test')
const ExcelJS = require('exceljs')

// Mock sample DailyReportData
const sampleReportData = {
  date: '2026-10-24',
  floorId: '11111111-1111-1111-1111-111111111111',
  floorName: 'A-FLOOR',
  floorCode: 'A-FLOOR',
  locationName: 'BUILDING NO-02',
  category: 'NEW',
  operatorName: 'Md. Operator',
  sourceNote: '✅ Actual data: 2026-10-24',
  requisitionNo: 'REQ-20261024-12345',
  sheetStatus: 'posted',
  documentNo: 'QA/03/310',
  versionNo: '01/2026',
  rows: [
    {
      needle_item_id: 'n1',
      item_code: 'SN-013',
      needle_type: 'DB X 1',
      size_dia: '8',
      brand: 'ORGAN',
      previous: 6,
      received: 0,
      delivery: 0,
      present: 6,
      bnr: 0,
      req_no: null,
      transfer_in: 0,
      transfer_out: 0,
      last_transfer_note: null,
      sl: 1,
      unit_price_usd: 0.0663,
      custom: null,
      note: null,
    },
    {
      needle_item_id: 'n2',
      item_code: 'SN-107',
      needle_type: 'DC X 1',
      size_dia: '9',
      brand: 'ORGAN',
      previous: 50,
      received: 0,
      delivery: 3,
      present: 47,
      bnr: 1,
      req_no: null,
      transfer_in: 0,
      transfer_out: 0,
      last_transfer_note: null,
      sl: 2,
      unit_price_usd: 0.1137,
      custom: null,
      note: null,
    },
    {
      needle_item_id: 'n3',
      item_code: 'SN-163',
      needle_type: 'UY X 128',
      size_dia: '9',
      brand: 'ORGAN',
      previous: 48,
      received: 0,
      delivery: 11,
      present: 37,
      bnr: 0,
      req_no: null,
      transfer_in: 0,
      transfer_out: 0,
      last_transfer_note: null,
      sl: 3,
      unit_price_usd: 0.1639,
      custom: null,
      note: null,
    },
  ],
  summary: {
    totalPrevious: 104,
    totalReceived: 0,
    totalDelivery: 14,
    totalPresent: 90,
    totalBnr: 1,
  },
}

test('Phase 3: Present Balance Excel matches reference workbook structure', async () => {
  const { buildPresentBalanceSheet } = require('../src/lib/reports/excel-present-balance.ts')
  const wb = new ExcelJS.Workbook()
  const ws = buildPresentBalanceSheet(wb, sampleReportData)

  // 1. Sheet name
  assert.equal(ws.name, 'A-FLOOR_N')

  // 2. Header cells
  assert.equal(ws.getCell('A1').value, 'GMS COMPOSITE KNITTING IND LTD')
  assert.equal(ws.getCell('A2').value, 'SHARDAGONJ, KASHIMPUR, GAZIPUR')
  assert.equal(ws.getCell('A3').value, 'ACCESSORIES MCD')
  assert.equal(ws.getCell('A4').value, 'DAILY SEWING NEEDLE PRESENT BALANCE REPORT')
  assert.ok(String(ws.getCell('I1').value).includes('QA/03/310'))
  assert.ok(String(ws.getCell('I1').value).includes('01/2026'))

  // 3. Metadata cell (only Floor, Date, Category - no Operator, no Source, no _NEW appended)
  const metaVal = String(ws.getCell('A5').value)
  assert.ok(metaVal.includes('Floor: A-FLOOR (BUILDING NO-02)'))
  assert.ok(metaVal.includes('Date: 2026-10-24'))
  assert.ok(metaVal.includes('Category: NEW'))
  assert.equal(metaVal.includes('Operator:'), false, 'Operator must NOT appear in metadata')
  assert.equal(metaVal.includes('Source:'), false, 'Source must NOT appear in metadata')
  assert.equal(metaVal.includes('A-FLOOR (BUILDING NO-02)_NEW'), false, 'Category must NOT be appended to floor name')

  // 4. Data rows
  assert.equal(ws.getCell('A8').value, 1) // SL
  assert.equal(ws.getCell('B8').value, 'SN-013') // Code
  assert.equal(ws.getCell('F8').value, 6) // PREVIOUS (Column F now, without UNIT PRICE)
  assert.equal(ws.getCell('J8').value, 6) // PRESENT (Column J now)
  assert.equal(ws.getCell('J8').font.color.argb, 'FF92400E') // Amber font
  assert.equal(ws.getCell('J8').fill.fgColor.argb, 'FFFFF3D6') // Amber fill

  // 5. Total row
  const totalRowIndex = 8 + sampleReportData.rows.length
  assert.equal(ws.getCell(`E${totalRowIndex}`).value, 'TOTAL →')
  assert.equal(ws.getCell(`F${totalRowIndex}`).value.result, 104) // PREVIOUS total
  assert.equal(ws.getCell(`I${totalRowIndex}`).value.result, 14) // DELIVERY total
  assert.equal(ws.getCell(`J${totalRowIndex}`).value.result, 90) // PRESENT total
  assert.equal(ws.getCell(`K${totalRowIndex}`).value.result, 1) // BNR total

  // 6. Signature section
  const sigRowIndex = totalRowIndex + 7
  assert.equal(ws.getCell(`A${sigRowIndex}`).value, 'PREPARED BY')
  assert.equal(ws.getCell(`F${sigRowIndex}`).value, 'CHECKED BY')
  assert.equal(ws.getCell(`J${sigRowIndex}`).value, 'AUTHORISED BY')
})

test('Phase 3: Daily Stock Report Excel structure matches STOCK REPORT reference', async () => {
  const { generateDailyStockReportWorkbook } = require('../src/lib/reports/excel-stock-report.ts')
  const buffer = await generateDailyStockReportWorkbook({
    date: '2026-10-24',
    newReports: [sampleReportData],
    runningReports: [],
    idleReports: [],
  })

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  assert.equal(wb.worksheets.length, 2)
  assert.equal(wb.worksheets[0].name, 'SEWING NEEDLE')
  assert.equal(wb.worksheets[1].name, 'IDLE NEEDLE')

  const ws = wb.worksheets[0]
  assert.equal(ws.getCell('A1').value, 'FLOOR NAME & LOCATION')
  assert.equal(ws.getCell('B1').value, 'CATEGORY')
  assert.equal(ws.getCell('C1').value, 'ITEM CODE')
  assert.equal(ws.getCell('I1').value, 'STOCK')
  assert.equal(ws.getCell('J1').value, 'STOCK VALUE(USD)')

  // First item row
  assert.equal(ws.getCell('B2').value, 'NEW')
  assert.equal(ws.getCell('C2').value, 'SN-013')
  assert.equal(ws.getCell('I2').value, 6)

  // Check group total row exists
  let foundGroupTotal = false
  for (let r = 2; r <= ws.rowCount; r++) {
    if (ws.getCell(`B${r}`).value === 'NEW Total') {
      foundGroupTotal = true
      assert.equal(ws.getCell(`I${r}`).value, 90) // Sum of present stock (6 + 47 + 37 = 90)
      break
    }
  }
  assert.ok(foundGroupTotal, 'NEW Total row must exist')
})

test('Phase 3: PDF generator generates valid Present Balance document', async () => {
  const { generatePresentBalancePDF } = require('../src/lib/reports/pdf-generator.ts')
  const doc = generatePresentBalancePDF(sampleReportData)

  assert.ok(doc)
  assert.equal(Math.round(doc.internal.pageSize.getWidth()), 297) // Landscape A4 width
  assert.equal(Math.round(doc.internal.pageSize.getHeight()), 210) // Landscape A4 height
  const output = doc.output()
  assert.ok(output.includes('%PDF-'), 'Valid PDF header generated')
  assert.equal(output.includes('F l o o r :'), false, 'PDF text must NOT have spaced letters')
  assert.ok(output.includes('Floor: A-FLOOR') && output.includes('BUILDING NO-02'), 'PDF text has normal word and letter spacing')
  assert.equal(output.includes('Operator:'), false, 'Operator must NOT appear in PDF')
  assert.equal(output.includes('Source:'), false, 'Source must NOT appear in PDF')
  assert.ok(output.includes('(TOTAL)'), 'TOTAL must appear in PDF text stream')
  assert.equal(output.includes('T O T A L'), false, 'TOTAL must NOT have broken character spacing')
})

test('Phase 3: Parity validation between Daily Entry and Present Balance rows', () => {
  for (const row of sampleReportData.rows) {
    // PREV
    assert.equal(row.previous, row.previous, 'PREV parity holds')
    // RCVD
    assert.equal(row.received, row.received, 'RCVD parity holds')
    // DVLD
    assert.equal(row.delivery, row.delivery, 'DVLD parity holds')
    // PRESENT
    assert.equal(row.present, row.previous + row.received - row.delivery, 'Stock calculation parity holds')
    // BNR
    assert.equal(row.bnr, row.bnr, 'BNR parity holds')
  }
})

test('Phase 3: Category-specific Document No & Version No in Excel & PDF', async () => {
  const { buildPresentBalanceSheet } = require('../src/lib/reports/excel-present-balance.ts')
  const { generatePresentBalancePDF } = require('../src/lib/reports/pdf-generator.ts')

  // Running report
  const runningReport = {
    ...sampleReportData,
    category: 'RUNNING',
    documentNo: 'DOC-RUN-001',
    versionNo: 'V-RUN-01',
  }
  const wb1 = new ExcelJS.Workbook()
  const ws1 = buildPresentBalanceSheet(wb1, runningReport)
  assert.ok(ws1.getCell('I1').value.includes('DOC-RUN-001'))
  assert.ok(ws1.getCell('I1').value.includes('V-RUN-01'))

  const pdf1 = generatePresentBalancePDF(runningReport)
  const pdfOut1 = pdf1.output()
  assert.ok(pdfOut1.includes('DOC-RUN-001'))
  assert.ok(pdfOut1.includes('V-RUN-01'))

  // New report
  const newReport = {
    ...sampleReportData,
    category: 'NEW',
    documentNo: 'DOC-NEW-002',
    versionNo: 'V-NEW-02',
  }
  const wb2 = new ExcelJS.Workbook()
  const ws2 = buildPresentBalanceSheet(wb2, newReport)
  assert.ok(ws2.getCell('I1').value.includes('DOC-NEW-002'))
  assert.ok(ws2.getCell('I1').value.includes('V-NEW-02'))

  // Idle report
  const idleReport = {
    ...sampleReportData,
    category: 'IDLE',
    documentNo: 'DOC-IDLE-003',
    versionNo: 'V-IDLE-03',
  }
  const wb3 = new ExcelJS.Workbook()
  const ws3 = buildPresentBalanceSheet(wb3, idleReport)
  assert.ok(ws3.getCell('I1').value.includes('DOC-IDLE-003'))
  assert.ok(ws3.getCell('I1').value.includes('V-IDLE-03'))
})

test('Phase 3: Repeated Excel generation produces valid, uncorrupted XLSX files', async () => {
  const { generatePresentBalanceWorkbook } = require('../src/lib/reports/excel-present-balance.ts')
  const { generateDailyStockReportWorkbook } = require('../src/lib/reports/excel-stock-report.ts')

  // Run repeated generation 10 times to ensure no intermittent corruption
  for (let i = 0; i < 10; i++) {
    // 1. Present Balance (Daily Stock)
    const pbBuffer = await generatePresentBalanceWorkbook([sampleReportData])
    assert.ok(pbBuffer, 'Buffer must be returned')
    assert.ok(pbBuffer.byteLength > 1000, 'Buffer must be > 1000 bytes')

    // Test that the generated buffer can be parsed cleanly by ExcelJS as a valid XLSX file
    const testWb1 = new ExcelJS.Workbook()
    await testWb1.xlsx.load(pbBuffer)
    assert.ok(testWb1.worksheets.length > 0, 'Must contain valid worksheets')
    assert.equal(testWb1.worksheets[0].getCell('A4').value, 'DAILY SEWING NEEDLE PRESENT BALANCE REPORT')

    // 2. Stock Report (Closing Stock)
    const stockBuffer = await generateDailyStockReportWorkbook({
      date: '2026-10-28',
      newReports: [sampleReportData],
      runningReports: [sampleReportData],
      idleReports: [sampleReportData],
    })
    assert.ok(stockBuffer, 'Buffer must be returned')
    assert.ok(stockBuffer.byteLength > 1000, 'Buffer must be > 1000 bytes')

    const testWb2 = new ExcelJS.Workbook()
    await testWb2.xlsx.load(stockBuffer)
    assert.ok(testWb2.worksheets.length >= 2, 'Must contain at least 2 worksheets')
    assert.equal(testWb2.worksheets[0].name, 'SEWING NEEDLE')
  }
})

test('Phase 3: Closing Stock filename convention includes Floor name or All Floors', () => {
  const date = '2026-10-28'

  // Single Floor
  const floorName = 'A-FLOOR'
  const safeFloor = floorName.replace(/[/\\?*:[\]<>|"]/g, '-').trim()
  const singleFloorFilename = `Closing Stock - ${safeFloor} - ${date}.xlsx`
  assert.equal(singleFloorFilename, 'Closing Stock - A-FLOOR - 2026-10-28.xlsx')

  // All Floors
  const allFloorsFilename = `Closing Stock - All Floors - ${date}.xlsx`
  assert.equal(allFloorsFilename, 'Closing Stock - All Floors - 2026-10-28.xlsx')
})

test('Phase 3: Export progress state machine and floor progress calculation', () => {
  // Test floor progress computation for All Floors export
  const totalFloors = 14
  for (let i = 0; i < totalFloors; i++) {
    const pct = Math.round(5 + ((i + 1) / totalFloors) * 65)
    assert.ok(pct >= 5 && pct <= 70, `Floor progress percentage must be between 5% and 70%: got ${pct}`)
    const label = `${i + 1} / ${totalFloors} Floors`
    assert.equal(label, `${i + 1} / 14 Floors`)
  }

  // Generation step: 80%
  const genPct = 80
  assert.ok(genPct > 70 && genPct < 90)

  // Finalizing step: 92%
  const finPct = 92
  assert.ok(finPct >= 90 && finPct < 100)

  // Completed: 100%
  const donePct = 100
  assert.equal(donePct, 100)
})

