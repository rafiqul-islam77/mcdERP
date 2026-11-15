import ExcelJS from 'exceljs'
import type { MonthlyReportData } from '@/types'
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

const BORDER_SUMMARY_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  left: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  right: { style: 'thin', color: { argb: 'FFBBBBBB' } },
}

const BORDER_SUMMARY_BOX: Partial<ExcelJS.Borders> = {
  top: { style: 'medium', color: { argb: 'FF2563EB' } },
  left: { style: 'medium', color: { argb: 'FF2563EB' } },
  bottom: { style: 'medium', color: { argb: 'FF2563EB' } },
  right: { style: 'medium', color: { argb: 'FF2563EB' } },
}

/**
 * Build a single Monthly Present Balance Worksheet inside the given ExcelJS Workbook
 * Follows Phase 4 specification: REQ NO and UNIT PRICE columns are omitted (11 columns total).
 */
export function buildMonthlyBalanceSheet(
  workbook: ExcelJS.Workbook,
  report: MonthlyReportData,
  sheetNameOverride?: string
): ExcelJS.Worksheet {
  const catSuffix =
    report.category === 'NEW' ? '_N' : report.category === 'RUNNING' ? '_R' : '_IDLE'
  let rawSheetName = sheetNameOverride || `${report.floorCode || report.floorName}${catSuffix}`
  rawSheetName = rawSheetName.replace(/[/\\?*:[\]]/g, '-').trim().slice(0, 31)

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

  // 11 Columns: A through K (REQ NO and UNIT PRICE omitted)
  const columnWidths = [
    5,  // A: SL
    11, // B: CODE
    25, // C: TYPE
    8,  // D: SIZE
    16, // E: BRAND
    11, // F: PREVIOUS
    10, // G: RECEIVED
    10, // H: DELIVERY
    15, // I: PRESENT BALANCE
    15, // J: Missing broken needle
    26, // K: Remarks
  ]

  columnWidths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width
  })

  // Row 1: Company Name & Document No
  ws.getRow(1).height = 26
  ws.mergeCells('A1:F1')
  const a1 = ws.getCell('A1')
  a1.value = 'GMS COMPOSITE KNITTING IND LTD'
  a1.font = { name: 'Calibri', size: 18, bold: true, underline: true, color: { argb: 'FF0F172A' } }
  a1.alignment = { horizontal: 'center', vertical: 'middle' }

  // Document & Version block (G1:K2)
  ws.mergeCells('G1:K2')
  const g1 = ws.getCell('G1')
  g1.value = `DOCUMENT NO : ${report.documentNo || 'QA/03/310'}\nVERSION NO : ${report.versionNo || '01/2026'}`
  g1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  g1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  g1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }

  for (let r = 1; r <= 2; r++) {
    for (let c = 7; c <= 11; c++) {
      ws.getCell(r, c).border = BORDER_BOX
    }
  }

  // Row 2: Address
  ws.getRow(2).height = 16
  ws.mergeCells('A2:F2')
  const a2 = ws.getCell('A2')
  a2.value = 'SHARDAGONJ, KASHIMPUR, GAZIPUR'
  a2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF475569' } }
  a2.alignment = { horizontal: 'center', vertical: 'middle' }

  // Row 3: Department
  ws.getRow(3).height = 16
  ws.mergeCells('A3:F3')
  const a3 = ws.getCell('A3')
  a3.value = 'ACCESSORIES MCD'
  a3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF2563EB' } }
  a3.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('G3:K3')

  // Row 4: Report Title
  ws.getRow(4).height = 24
  ws.mergeCells('A4:K4')
  const a4 = ws.getCell('A4')
  a4.value = 'MONTHLY SEWING NEEDLE PRESENT BALANCE REPORT'
  a4.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }
  a4.alignment = { horizontal: 'center', vertical: 'middle' }
  a4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

  // Row 5: Metadata line
  ws.getRow(5).height = 20
  ws.mergeCells('A5:K5')
  const a5 = ws.getCell('A5')
  const floorDesc = formatFloorDisplayName(report.floorName, report.locationName)
  a5.value = `Floor: ${floorDesc}   |   Month: ${report.monthLabel}   |   Category: ${report.category === 'RUNNING' ? 'REGULAR' : report.category}`
  a5.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
  a5.alignment = { horizontal: 'left', vertical: 'middle' }
  a5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

  // Row 6: blank separator
  ws.getRow(6).height = 8

  // Row 7: Column Headers (11 columns)
  ws.getRow(7).height = 22
  const headers = [
    'SL',
    'CODE',
    'TYPE',
    'SIZE',
    'BRAND',
    'PREVIOUS',
    'RECEIVED',
    'DELIVERY',
    'PRESENT BALANCE',
    'Missing broken needle',
    'Remarks',
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

    // PREVIOUS
    const c6 = r.getCell(6)
    c6.value = Number(row.previous) || 0
    c6.numFmt = '#,##0'
    c6.alignment = { horizontal: 'right', vertical: 'middle' }

    // RECEIVED
    const c7 = r.getCell(7)
    c7.value = Number(row.received) || 0
    c7.numFmt = '#,##0'
    c7.alignment = { horizontal: 'right', vertical: 'middle' }

    // DELIVERY
    const c8 = r.getCell(8)
    c8.value = Number(row.delivery) || 0
    c8.numFmt = '#,##0'
    c8.alignment = { horizontal: 'right', vertical: 'middle' }

    // PRESENT BALANCE (amber highlight)
    const c9 = r.getCell(9)
    c9.value = Number(row.present) || 0
    c9.numFmt = '#,##0'
    c9.alignment = { horizontal: 'right', vertical: 'middle' }
    c9.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } }
    c9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } }

    // Missing broken needle (BNR)
    const c10 = r.getCell(10)
    c10.value = Number(row.bnr) || 0
    c10.numFmt = '#,##0'
    c10.alignment = { horizontal: 'right', vertical: 'middle' }

    // Remarks
    const c11 = r.getCell(11)
    c11.value = row.note || ''
    c11.alignment = { horizontal: 'left', vertical: 'middle' }

    // Apply borders
    for (let c = 1; c <= 11; c++) {
      if (c !== 9) {
        r.getCell(c).font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } }
      }
      r.getCell(c).border = BORDER_THIN
    }

    currentRow++
  })

  // Total row
  const totalRowIndex = currentRow
  const tr = ws.getRow(totalRowIndex)
  tr.height = 20

  // Merge A..D for empty label lead-in, and E for "TOTAL →"
  const labelCell = tr.getCell(5) // Column E (BRAND)
  labelCell.value = 'TOTAL →'
  labelCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  labelCell.alignment = { horizontal: 'right', vertical: 'middle' }
  labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

  for (let c = 1; c <= 4; c++) {
    const cell = tr.getCell(c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.border = BORDER_THIN
  }
  labelCell.border = BORDER_THIN

  const lastDataRow = totalRowIndex - 1
  const hasRows = report.rows.length > 0

  // PREVIOUS (F)
  const totF = tr.getCell(6)
  totF.value = hasRows ? { formula: `=SUM(F${startDataRow}:F${lastDataRow})` } : 0
  totF.numFmt = '#,##0'
  totF.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  totF.alignment = { horizontal: 'right', vertical: 'middle' }
  totF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  totF.border = BORDER_THIN

  // RECEIVED (G)
  const totG = tr.getCell(7)
  totG.value = hasRows ? { formula: `=SUM(G${startDataRow}:G${lastDataRow})` } : 0
  totG.numFmt = '#,##0'
  totG.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF16A34A' } }
  totG.alignment = { horizontal: 'right', vertical: 'middle' }
  totG.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  totG.border = BORDER_THIN

  // DELIVERY (H)
  const totH = tr.getCell(8)
  totH.value = hasRows ? { formula: `=SUM(H${startDataRow}:H${lastDataRow})` } : 0
  totH.numFmt = '#,##0'
  totH.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC2626' } }
  totH.alignment = { horizontal: 'right', vertical: 'middle' }
  totH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  totH.border = BORDER_THIN

  // PRESENT BALANCE (I)
  const totI = tr.getCell(9)
  totI.value = hasRows ? { formula: `=SUM(I${startDataRow}:I${lastDataRow})` } : 0
  totI.numFmt = '#,##0'
  totI.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } }
  totI.alignment = { horizontal: 'right', vertical: 'middle' }
  totI.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } }
  totI.border = BORDER_THIN

  // Missing broken needle (J)
  const totJ = tr.getCell(10)
  totJ.value = hasRows ? { formula: `=SUM(J${startDataRow}:J${lastDataRow})` } : 0
  totJ.numFmt = '#,##0'
  totJ.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  totJ.alignment = { horizontal: 'right', vertical: 'middle' }
  totJ.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  totJ.border = BORDER_THIN

  // Remarks (K)
  const totK = tr.getCell(11)
  totK.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  totK.border = BORDER_THIN

  // Signature Block (5 rows after total row)
  const sigRow = totalRowIndex + 5

  // PREPARED BY (cols B-D)
  const sigB = ws.getCell(sigRow, 2)
  sigB.value = 'PREPARED BY'
  sigB.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } }
  sigB.alignment = { horizontal: 'center', vertical: 'middle' }
  for (let c = 2; c <= 4; c++) {
    ws.getCell(sigRow, c).border = { top: { style: 'thin', color: { argb: 'FF000000' } } }
  }

  // CHECKED BY (cols F-H)
  const sigF = ws.getCell(sigRow, 6)
  sigF.value = 'CHECKED BY'
  sigF.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } }
  sigF.alignment = { horizontal: 'center', vertical: 'middle' }
  for (let c = 6; c <= 8; c++) {
    ws.getCell(sigRow, c).border = { top: { style: 'thin', color: { argb: 'FF000000' } } }
  }

  // AUTHORISED BY (cols I-K)
  const sigI = ws.getCell(sigRow, 9)
  sigI.value = 'AUTHORISED BY'
  sigI.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } }
  sigI.alignment = { horizontal: 'center', vertical: 'middle' }
  for (let c = 9; c <= 11; c++) {
    ws.getCell(sigRow, c).border = { top: { style: 'thin', color: { argb: 'FF000000' } } }
  }

  return ws
}

/**
 * Build a SUMMARY worksheet inside the given ExcelJS Workbook for Monthly Reports
 */
export function buildMonthlySummarySheet(
  workbook: ExcelJS.Workbook,
  reports: MonthlyReportData[],
  monthLabel: string,
  docNo?: string,
  verNo?: string
): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet('SUMMARY', {
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

  const columnWidths = [
    5,  // A: SL
    44, // B: FLOOR NAME
    11, // C: CATEGORY
    11, // D: PREVIOUS
    11, // E: RECEIVED
    11, // F: DELIVERY
    16, // G: PRESENT BALANCE
    11, // H: BNR/BNF
    8,  // I: ITEMS
  ]

  columnWidths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width
  })

  // Row 1: Company Name
  ws.getRow(1).height = 26
  ws.mergeCells('A1:E1')
  const a1 = ws.getCell('A1')
  a1.value = 'GMS COMPOSITE KNITTING IND LTD'
  a1.font = { name: 'Calibri', size: 18, bold: true, underline: true, color: { argb: 'FF0F172A' } }
  a1.alignment = { horizontal: 'center', vertical: 'middle' }

  // Document & Version block (F1:I2)
  ws.mergeCells('F1:I2')
  const f1 = ws.getCell('F1')
  const resolvedDocNo = docNo || reports[0]?.documentNo || 'QA/03/310'
  const resolvedVerNo = verNo || reports[0]?.versionNo || '01/2026'
  f1.value = `DOCUMENT NO : ${resolvedDocNo}\nVERSION NO : ${resolvedVerNo}`
  f1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  f1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  f1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }

  for (let r = 1; r <= 2; r++) {
    for (let c = 6; c <= 9; c++) {
      ws.getCell(r, c).border = BORDER_SUMMARY_BOX
    }
  }

  // Row 2: Address
  ws.getRow(2).height = 16
  ws.mergeCells('A2:E2')
  const a2 = ws.getCell('A2')
  a2.value = 'SHARDAGONJ, KASHIMPUR, GAZIPUR'
  a2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF475569' } }
  a2.alignment = { horizontal: 'center', vertical: 'middle' }

  // Row 3: Department
  ws.getRow(3).height = 16
  ws.mergeCells('A3:E3')
  const a3 = ws.getCell('A3')
  a3.value = 'ACCESSORIES MCD'
  a3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF2563EB' } }
  a3.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('F3:I3')

  // Row 4: Title
  ws.getRow(4).height = 24
  ws.mergeCells('A4:I4')
  const a4 = ws.getCell('A4')
  a4.value = 'MONTHLY SEWING NEEDLE PRESENT BALANCE SUMMARY'
  a4.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }
  a4.alignment = { horizontal: 'center', vertical: 'middle' }
  a4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

  // Row 5: Metadata
  ws.getRow(5).height = 20
  ws.mergeCells('A5:I5')
  const a5 = ws.getCell('A5')
  a5.value = `Month: ${monthLabel}   |   Floors: ${reports.length} statements`
  a5.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
  a5.alignment = { horizontal: 'left', vertical: 'middle' }
  a5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

  // Row 6: blank
  ws.getRow(6).height = 8

  // Row 7: Headers
  ws.getRow(7).height = 22
  const headers = [
    'SL',
    'FLOOR NAME',
    'CATEGORY',
    'PREVIOUS',
    'RECEIVED',
    'DELIVERY',
    'PRESENT BALANCE',
    'BNR/BNF',
    'ITEMS',
  ]

  headers.forEach((h, idx) => {
    const colIdx = idx + 1
    const cell = ws.getCell(7, colIdx)
    cell.value = h
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.border = BORDER_THIN
  })

  // Data rows
  let curRow = 8
  const startRow = curRow

  reports.forEach((rep, idx) => {
    const r = ws.getRow(curRow)
    r.height = 18

    const c1 = r.getCell(1)
    c1.value = idx + 1
    c1.alignment = { horizontal: 'center', vertical: 'middle' }

    const c2 = r.getCell(2)
    c2.value = formatFloorDisplayName(rep.floorName, rep.locationName)
    c2.alignment = { horizontal: 'left', vertical: 'middle' }

    const c3 = r.getCell(3)
    c3.value = rep.category === 'RUNNING' ? 'REGULAR' : rep.category
    c3.alignment = { horizontal: 'center', vertical: 'middle' }

    const c4 = r.getCell(4)
    c4.value = rep.summary.totalPrevious
    c4.numFmt = '#,##0'
    c4.alignment = { horizontal: 'right', vertical: 'middle' }

    const c5 = r.getCell(5)
    c5.value = rep.summary.totalReceived
    c5.numFmt = '#,##0'
    c5.alignment = { horizontal: 'right', vertical: 'middle' }

    const c6 = r.getCell(6)
    c6.value = rep.summary.totalDelivery
    c6.numFmt = '#,##0'
    c6.alignment = { horizontal: 'right', vertical: 'middle' }

    const c7 = r.getCell(7)
    c7.value = rep.summary.totalPresent
    c7.numFmt = '#,##0'
    c7.alignment = { horizontal: 'right', vertical: 'middle' }
    c7.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } }
    c7.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } }

    const c8 = r.getCell(8)
    c8.value = rep.summary.totalBnr
    c8.numFmt = '#,##0'
    c8.alignment = { horizontal: 'right', vertical: 'middle' }

    const c9 = r.getCell(9)
    c9.value = rep.rows.length
    c9.numFmt = '#,##0'
    c9.alignment = { horizontal: 'center', vertical: 'middle' }

    for (let c = 1; c <= 9; c++) {
      if (c !== 7) {
        r.getCell(c).font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } }
      }
      r.getCell(c).border = BORDER_SUMMARY_THIN
    }

    curRow++
  })

  // Grand total
  const totRow = curRow
  const tr = ws.getRow(totRow)
  tr.height = 20

  const lbl = tr.getCell(3)
  lbl.value = 'TOTAL →'
  lbl.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
  lbl.alignment = { horizontal: 'right', vertical: 'middle' }
  lbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

  for (let c = 1; c <= 2; c++) {
    tr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    tr.getCell(c).border = BORDER_THIN
  }
  lbl.border = BORDER_THIN

  const lastRow = totRow - 1
  const hasReports = reports.length > 0

  // PREVIOUS (D)
  const tD = tr.getCell(4)
  tD.value = hasReports ? { formula: `=SUM(D${startRow}:D${lastRow})` } : 0
  tD.numFmt = '#,##0'
  tD.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  tD.alignment = { horizontal: 'right', vertical: 'middle' }
  tD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  tD.border = BORDER_THIN

  // RECEIVED (E)
  const tE = tr.getCell(5)
  tE.value = hasReports ? { formula: `=SUM(E${startRow}:E${lastRow})` } : 0
  tE.numFmt = '#,##0'
  tE.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF16A34A' } }
  tE.alignment = { horizontal: 'right', vertical: 'middle' }
  tE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  tE.border = BORDER_THIN

  // DELIVERY (F)
  const tF = tr.getCell(6)
  tF.value = hasReports ? { formula: `=SUM(F${startRow}:F${lastRow})` } : 0
  tF.numFmt = '#,##0'
  tF.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC2626' } }
  tF.alignment = { horizontal: 'right', vertical: 'middle' }
  tF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  tF.border = BORDER_THIN

  // PRESENT BALANCE (G)
  const tG = tr.getCell(7)
  tG.value = hasReports ? { formula: `=SUM(G${startRow}:G${lastRow})` } : 0
  tG.numFmt = '#,##0'
  tG.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF92400E' } }
  tG.alignment = { horizontal: 'right', vertical: 'middle' }
  tG.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3D6' } }
  tG.border = BORDER_THIN

  // BNR (H)
  const tH = tr.getCell(8)
  tH.value = hasReports ? { formula: `=SUM(H${startRow}:H${lastRow})` } : 0
  tH.numFmt = '#,##0'
  tH.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  tH.alignment = { horizontal: 'right', vertical: 'middle' }
  tH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  tH.border = BORDER_THIN

  // ITEMS (I)
  const tI = tr.getCell(9)
  tI.value = hasReports ? { formula: `=SUM(I${startRow}:I${lastRow})` } : 0
  tI.numFmt = '#,##0'
  tI.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
  tI.alignment = { horizontal: 'center', vertical: 'middle' }
  tI.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  tI.border = BORDER_THIN

  return ws
}

/**
 * Generate a complete Excel workbook containing Monthly Present Balance reports
 */
export async function generateMonthlyBalanceWorkbook(
  reports: MonthlyReportData[],
  options?: { includeSummary?: boolean; monthLabel?: string }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GMS MCD ERP'
  workbook.lastModifiedBy = 'GMS MCD ERP'
  workbook.created = new Date()

  if (options?.includeSummary && reports.length > 0) {
    const label = options.monthLabel || reports[0]?.monthLabel || ''
    buildMonthlySummarySheet(workbook, reports, label)
  }

  for (const report of reports) {
    buildMonthlyBalanceSheet(workbook, report)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
