import ExcelJS from 'exceljs'
import type { DailyReportData } from '@/types'
import { formatFloorDisplayName } from './report-utils'

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
}

const BORDER_BOX: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
}

/**
 * Build a single Present Balance Worksheet inside the given ExcelJS Workbook
 */
export function buildPresentBalanceSheet(
  workbook: ExcelJS.Workbook,
  report: DailyReportData,
  sheetNameOverride?: string
): ExcelJS.Worksheet {
  // Determine clean sheet name (Excel limits sheet names to 31 chars and no / \ ? * : [ ])
  const catSuffix = report.category === 'NEW' ? '_N' : report.category === 'RUNNING' ? '_R' : '_IDLE'
  let rawSheetName = sheetNameOverride || `${report.floorCode || report.floorName}${catSuffix}`
  rawSheetName = rawSheetName.replace(/[/\\?*:[\]]/g, '-').trim().slice(0, 31)

  // Ensure unique sheet name
  let sheetName = rawSheetName
  let counter = 1
  while (workbook.getWorksheet(sheetName)) {
    sheetName = `${rawSheetName.slice(0, 28)}_${counter}`
    counter++
  }

  const ws = workbook.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.3,
        bottom: 0.3,
        header: 0.1,
        footer: 0.1,
      },
      horizontalCentered: true,
    },
    views: [
      {
        state: 'frozen',
        ySplit: 7,
        activeCell: 'A8',
        showGridLines: true,
      },
    ],
  })

  // Set explicit column widths according to official template
  const columnWidths = [
    5,  // A: SL
    11, // B: CODE
    22, // C: TYPE
    8,  // D: SIZE
    14, // E: BRAND
    11, // F: UNIT PRICE
    11, // G: PREVIOUS
    10, // H: RECEIVED
    16, // I: REQ NO
    10, // J: DELIVERY
    15, // K: PRESENT BALANCE
    10, // L: BNR
    8,  // M: CUSTOM
    22, // N: NOTE
  ]

  columnWidths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width
  })

  // Row 1: Company Name & Document No
  ws.getRow(1).height = 26
  ws.mergeCells('A1:H1')
  const a1 = ws.getCell('A1')
  a1.value = 'GMS COMPOSITE KNITTING IND LTD'
  a1.font = { name: 'Calibri', size: 18, bold: true, underline: true, color: { argb: 'FF0F172A' } }
  a1.alignment = { horizontal: 'center', vertical: 'middle' }

  // Document & Version block (I1:N2)
  ws.mergeCells('I1:N2')
  const i1 = ws.getCell('I1')
  i1.value = `DOCUMENT NO : ${report.documentNo || 'QA/03/310'}\nVERSION NO : ${report.versionNo || '01/2026'}`
  i1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  i1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  i1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }

  // Apply border to I1:N2 block
  for (let r = 1; r <= 2; r++) {
    for (let c = 9; c <= 14; c++) {
      ws.getCell(r, c).border = BORDER_BOX
    }
  }

  // Row 2: Address
  ws.getRow(2).height = 16
  ws.mergeCells('A2:H2')
  const a2 = ws.getCell('A2')
  a2.value = 'SHARDAGONJ, KASHIMPUR, GAZIPUR'
  a2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF475569' } }
  a2.alignment = { horizontal: 'center', vertical: 'middle' }

  // Row 3: Department & Empty I3:N3
  ws.getRow(3).height = 16
  ws.mergeCells('A3:H3')
  const a3 = ws.getCell('A3')
  a3.value = 'ACCESSORIES MCD'
  a3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF2563EB' } }
  a3.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('I3:N3')

  // Row 4: Report Title
  ws.getRow(4).height = 24
  ws.mergeCells('A4:N4')
  const a4 = ws.getCell('A4')
  a4.value = 'DAILY SEWING NEEDLE PRESENT BALANCE REPORT'
  a4.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }
  a4.alignment = { horizontal: 'center', vertical: 'middle' }
  a4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

  // Row 5: Metadata line
  ws.getRow(5).height = 20
  ws.mergeCells('A5:N5')
  const a5 = ws.getCell('A5')
  const floorDesc = formatFloorDisplayName(report.floorName, report.locationName)
  a5.value = `Floor: ${floorDesc}   |   Date: ${report.date}   |   Category: ${report.category}`
  a5.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
  a5.alignment = { horizontal: 'left', vertical: 'middle' }
  a5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

  // Row 6: blank separator
  ws.getRow(6).height = 8

  // Row 7: Column Headers
  ws.getRow(7).height = 22
  const headers = [
    'SL',
    'CODE',
    'TYPE',
    'SIZE',
    'BRAND',
    'UNIT PRICE',
    'PREVIOUS',
    'RECEIVED',
    'REQ NO',
    'DELIVERY',
    'PRESENT BALANCE',
    'BNR',
    'CUSTOM',
    'NOTE',
  ]

  headers.forEach((h, idx) => {
    const colIdx = idx + 1
    const cell = ws.getCell(7, colIdx)
    cell.value = h
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.border = BORDER_THIN
  })

  // Data rows (Row 8+)
  let currentRow = 8
  const startDataRow = currentRow

  report.rows.forEach((row, i) => {
    const r = ws.getRow(currentRow)
    r.height = 18

    // SL
    const c1 = r.getCell(1)
    c1.value = i + 1
    c1.alignment = { horizontal: 'center', vertical: 'middle' }

    // CODE
    const c2 = r.getCell(2)
    c2.value = row.item_code
    c2.alignment = { horizontal: 'center', vertical: 'middle' }

    // TYPE
    const c3 = r.getCell(3)
    c3.value = row.needle_type
    c3.alignment = { horizontal: 'left', vertical: 'middle' }

    // SIZE
    const c4 = r.getCell(4)
    c4.value = row.size_dia || ''
    c4.alignment = { horizontal: 'center', vertical: 'middle' }

    // BRAND
    const c5 = r.getCell(5)
    c5.value = row.brand
    c5.alignment = { horizontal: 'center', vertical: 'middle' }

    // UNIT PRICE
    const c6 = r.getCell(6)
    if (row.unit_price_usd !== null && row.unit_price_usd !== undefined) {
      c6.value = Number(row.unit_price_usd)
      c6.numFmt = '0.0000'
    } else {
      c6.value = ''
    }
    c6.alignment = { horizontal: 'right', vertical: 'middle' }

    // PREVIOUS
    const c7 = r.getCell(7)
    c7.value = Number(row.previous) || 0
    c7.numFmt = '#,##0'
    c7.alignment = { horizontal: 'right', vertical: 'middle' }

    // RECEIVED
    const c8 = r.getCell(8)
    c8.value = Number(row.received) || 0
    c8.numFmt = '#,##0'
    c8.alignment = { horizontal: 'right', vertical: 'middle' }

    // REQ NO
    const c9 = r.getCell(9)
    c9.value = row.req_no || ''
    c9.alignment = { horizontal: 'center', vertical: 'middle' }

    // DELIVERY
    const c10 = r.getCell(10)
    c10.value = Number(row.delivery) || 0
    c10.numFmt = '#,##0'
    c10.alignment = { horizontal: 'right', vertical: 'middle' }

    // PRESENT BALANCE (amber highlight)
    const c11 = r.getCell(11)
    c11.value = Number(row.present) || 0
    c11.numFmt = '#,##0'
    c11.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } }
    c11.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } }
    c11.alignment = { horizontal: 'right', vertical: 'middle' }

    // BNR
    const c12 = r.getCell(12)
    c12.value = Number(row.bnr) || 0
    c12.numFmt = '#,##0'
    c12.alignment = { horizontal: 'right', vertical: 'middle' }

    // CUSTOM
    const c13 = r.getCell(13)
    c13.value = row.custom || ''
    c13.alignment = { horizontal: 'center', vertical: 'middle' }

    // NOTE
    const c14 = r.getCell(14)
    c14.value = row.note || ''
    c14.alignment = { horizontal: 'left', vertical: 'middle' }

    // Borders & Base Font for row
    for (let col = 1; col <= 14; col++) {
      const cell = r.getCell(col)
      cell.border = BORDER_THIN
      if (col !== 11) {
        cell.font = { name: 'Calibri', size: 10 }
      }
    }

    currentRow++
  })

  // TOTAL Row
  const totalRow = ws.getRow(currentRow)
  totalRow.height = 20

  for (let col = 1; col <= 14; col++) {
    const cell = totalRow.getCell(col)
    cell.border = BORDER_THIN
    cell.font = { name: 'Calibri', size: 10, bold: true }
  }

  // Label TOTAL -> in column F (col 6)
  const lblCell = totalRow.getCell(6)
  lblCell.value = 'TOTAL →'
  lblCell.alignment = { horizontal: 'right', vertical: 'middle' }
  lblCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }

  // Numeric totals (Columns G, H, J, K, L)
  const endDataRow = currentRow - 1
  if (endDataRow >= startDataRow) {
    // PREVIOUS (G)
    const totPrev = totalRow.getCell(7)
    totPrev.value = { formula: `SUM(G${startDataRow}:G${endDataRow})`, result: report.summary.totalPrevious }
    totPrev.numFmt = '#,##0'
    totPrev.alignment = { horizontal: 'right', vertical: 'middle' }

    // RECEIVED (H)
    const totRcvd = totalRow.getCell(8)
    totRcvd.value = { formula: `SUM(H${startDataRow}:H${endDataRow})`, result: report.summary.totalReceived }
    totRcvd.numFmt = '#,##0'
    totRcvd.alignment = { horizontal: 'right', vertical: 'middle' }

    // DELIVERY (J)
    const totDvld = totalRow.getCell(10)
    totDvld.value = { formula: `SUM(J${startDataRow}:J${endDataRow})`, result: report.summary.totalDelivery }
    totDvld.numFmt = '#,##0'
    totDvld.alignment = { horizontal: 'right', vertical: 'middle' }

    // PRESENT BALANCE (K)
    const totPres = totalRow.getCell(11)
    totPres.value = { formula: `SUM(K${startDataRow}:K${endDataRow})`, result: report.summary.totalPresent }
    totPres.numFmt = '#,##0'
    totPres.alignment = { horizontal: 'right', vertical: 'middle' }
    totPres.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } }
    totPres.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } }

    // BNR (L)
    const totBnr = totalRow.getCell(12)
    totBnr.value = { formula: `SUM(L${startDataRow}:L${endDataRow})`, result: report.summary.totalBnr }
    totBnr.numFmt = '#,##0'
    totBnr.alignment = { horizontal: 'right', vertical: 'middle' }
  } else {
    totalRow.getCell(7).value = 0
    totalRow.getCell(8).value = 0
    totalRow.getCell(10).value = 0
    totalRow.getCell(11).value = 0
    totalRow.getCell(12).value = 0
  }

  // Signature Section (with blank signing space)
  currentRow += 6 // 5 blank rows
  const lineRow = currentRow
  const textRow = currentRow + 1

  // Top border lines for signatures
  for (let c = 1; c <= 4; c++) {
    ws.getCell(lineRow, c).border = { top: { style: 'medium', color: { argb: 'FF000000' } } }
  }
  for (let c = 6; c <= 9; c++) {
    ws.getCell(lineRow, c).border = { top: { style: 'medium', color: { argb: 'FF000000' } } }
  }
  for (let c = 11; c <= 14; c++) {
    ws.getCell(lineRow, c).border = { top: { style: 'medium', color: { argb: 'FF000000' } } }
  }

  // Signature text labels
  ws.mergeCells(`A${textRow}:D${textRow}`)
  const prepCell = ws.getCell(`A${textRow}`)
  prepCell.value = 'PREPARED BY'
  prepCell.font = { name: 'Calibri', size: 10, bold: true }
  prepCell.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells(`F${textRow}:I${textRow}`)
  const chkCell = ws.getCell(`F${textRow}`)
  chkCell.value = 'CHECKED BY'
  chkCell.font = { name: 'Calibri', size: 10, bold: true }
  chkCell.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells(`K${textRow}:N${textRow}`)
  const authCell = ws.getCell(`K${textRow}`)
  authCell.value = 'AUTHORISED BY'
  authCell.font = { name: 'Calibri', size: 10, bold: true }
  authCell.alignment = { horizontal: 'center', vertical: 'middle' }

  return ws
}

/**
 * Generate a complete Present Balance Workbook buffer for one or multiple reports
 */
export async function generatePresentBalanceWorkbook(reports: DailyReportData[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GMS MCD ERP'
  workbook.lastModifiedBy = 'GMS MCD ERP'
  workbook.created = new Date()
  workbook.modified = new Date()

  for (const report of reports) {
    buildPresentBalanceSheet(workbook, report)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
