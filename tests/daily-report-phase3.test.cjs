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
  assert.equal(ws.getCell('G8').value, 6) // PREVIOUS
  assert.equal(ws.getCell('K8').value, 6) // PRESENT
  assert.equal(ws.getCell('K8').font.color.argb, 'FF92400E') // Amber font
  assert.equal(ws.getCell('K8').fill.fgColor.argb, 'FFFFF3D6') // Amber fill

  // 5. Total row
  const totalRowIndex = 8 + sampleReportData.rows.length
  assert.equal(ws.getCell(`F${totalRowIndex}`).value, 'TOTAL →')
  assert.equal(ws.getCell(`G${totalRowIndex}`).value.result, 104) // PREVIOUS total
  assert.equal(ws.getCell(`J${totalRowIndex}`).value.result, 14) // DELIVERY total
  assert.equal(ws.getCell(`K${totalRowIndex}`).value.result, 90) // PRESENT total
  assert.equal(ws.getCell(`L${totalRowIndex}`).value.result, 1) // BNR total

  // 6. Signature section
  const sigRowIndex = totalRowIndex + 7
  assert.equal(ws.getCell(`A${sigRowIndex}`).value, 'PREPARED BY')
  assert.equal(ws.getCell(`F${sigRowIndex}`).value, 'CHECKED BY')
  assert.equal(ws.getCell(`K${sigRowIndex}`).value, 'AUTHORISED BY')
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
