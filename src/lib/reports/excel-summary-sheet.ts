import ExcelJS from 'exceljs'
import type { DailyReportData } from '@/types'
import { formatFloorDisplayName } from './report-utils'

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  left: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  right: { style: 'thin', color: { argb: 'FFBBBBBB' } },
}

const BORDER_HEADER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
}

const BORDER_BOX: Partial<ExcelJS.Borders> = {
  top: { style: 'medium', color: { argb: 'FF2563EB' } },
  left: { style: 'medium', color: { argb: 'FF2563EB' } },
  bottom: { style: 'medium', color: { argb: 'FF2563EB' } },
  right: { style: 'medium', color: { argb: 'FF2563EB' } },
}

/**
 * Build a SUMMARY worksheet inside the given ExcelJS Workbook
 */
export function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  reports: DailyReportData[],
  date: string,
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

  // Set explicit column widths according to official template
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

  // Row 1: Company Name & Document No
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
      ws.getCell(r, c).border = BORDER_BOX
    }
  }

  // Row 2: Address
  ws.getRow(2).height = 16
  ws.mergeCells('A2:E2')
  const a2 = ws.getCell('A2')
  a2.value = 'SHARDAGONJ, KASHIMPUR, GAZIPUR'
  a2.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF334155' } }
  a2.alignment = { horizontal: 'center', vertical: 'middle' }

  // Row 3: Department & Empty F3:I3
  ws.getRow(3).height = 15
  ws.mergeCells('A3:E3')
  const a3 = ws.getCell('A3')
  a3.value = 'ACCESSORIES MCD'
  a3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
  a3.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('F3:I3')

  // Row 4: Report Title
  ws.getRow(4).height = 22
  ws.mergeCells('A4:I4')
  const a4 = ws.getCell('A4')
  a4.value = 'DAILY SEWING NEEDLE PRESENT BALANCE REPORT'
  a4.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  a4.alignment = { horizontal: 'center', vertical: 'middle' }
  a4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

  // Row 5: Metadata line
  ws.getRow(5).height = 20
  ws.mergeCells('A5:I5')
  const a5 = ws.getCell('A5')
  a5.value = `📅 Date: ${date}   `
  a5.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E3A8A' } }
  a5.alignment = { horizontal: 'left', vertical: 'middle' }
  a5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

  // Row 6: Blank separator
  ws.getRow(6).height = 8

  // Row 7: Column Headers
  ws.getRow(7).height = 24
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

  headers.forEach((hdr, idx) => {
    const cell = ws.getCell(7, idx + 1)
    cell.value = hdr
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.border = BORDER_HEADER
  })

  // Data rows
  let grandPrevious = 0
  let grandReceived = 0
  let grandDelivery = 0
  let grandPresent = 0
  let grandBnr = 0

  let currentRow = 8
  reports.forEach((rep, idx) => {
    const row = ws.getRow(currentRow)
    row.height = 20

    const prev = rep.summary?.totalPrevious ?? 0
    const rcv = rep.summary?.totalReceived ?? 0
    const del = rep.summary?.totalDelivery ?? 0
    const prs = rep.summary?.totalPresent ?? 0
    const bnr = rep.summary?.totalBnr ?? 0
    const itemsCount = rep.rows ? rep.rows.length : 0

    grandPrevious += prev
    grandReceived += rcv
    grandDelivery += del
    grandPresent += prs
    grandBnr += bnr

    const slCell = row.getCell(1)
    slCell.value = idx + 1
    slCell.alignment = { horizontal: 'center', vertical: 'middle' }

    const floorCell = row.getCell(2)
    floorCell.value = formatFloorDisplayName(rep.floorName, rep.locationName)
    floorCell.alignment = { horizontal: 'left', vertical: 'middle' }

    const catCell = row.getCell(3)
    catCell.value = rep.category
    catCell.alignment = { horizontal: 'center', vertical: 'middle' }

    const prevCell = row.getCell(4)
    prevCell.value = prev
    prevCell.numFmt = '#,##0'
    prevCell.alignment = { horizontal: 'right', vertical: 'middle' }

    const rcvCell = row.getCell(5)
    rcvCell.value = rcv
    rcvCell.numFmt = '#,##0'
    rcvCell.alignment = { horizontal: 'right', vertical: 'middle' }

    const delCell = row.getCell(6)
    delCell.value = del
    delCell.numFmt = '#,##0'
    delCell.alignment = { horizontal: 'right', vertical: 'middle' }

    const prsCell = row.getCell(7)
    prsCell.value = prs
    prsCell.numFmt = '#,##0'
    prsCell.alignment = { horizontal: 'right', vertical: 'middle' }

    const bnrCell = row.getCell(8)
    bnrCell.value = bnr
    bnrCell.numFmt = '#,##0'
    bnrCell.alignment = { horizontal: 'right', vertical: 'middle' }

    const itemCell = row.getCell(9)
    itemCell.value = itemsCount
    itemCell.numFmt = '#,##0'
    itemCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // Borders & Fonts
    for (let c = 1; c <= 9; c++) {
      const cCell = row.getCell(c)
      cCell.border = BORDER_THIN
      cCell.font = { name: 'Calibri', size: 10 }
    }

    currentRow++
  })

  // GRAND TOTAL Row
  const totalRow = currentRow
  ws.getRow(totalRow).height = 22
  ws.mergeCells(`B${totalRow}:C${totalRow}`)

  const totalLabelCell = ws.getCell(`B${totalRow}`)
  totalLabelCell.value = `GRAND TOTAL (${reports.length} Floors)`
  totalLabelCell.alignment = { horizontal: 'center', vertical: 'middle' }

  const totalPrev = ws.getCell(`D${totalRow}`)
  totalPrev.value = grandPrevious
  totalPrev.numFmt = '#,##0'
  totalPrev.alignment = { horizontal: 'right', vertical: 'middle' }

  const totalRcv = ws.getCell(`E${totalRow}`)
  totalRcv.value = grandReceived
  totalRcv.numFmt = '#,##0'
  totalRcv.alignment = { horizontal: 'right', vertical: 'middle' }

  const totalDel = ws.getCell(`F${totalRow}`)
  totalDel.value = grandDelivery
  totalDel.numFmt = '#,##0'
  totalDel.alignment = { horizontal: 'right', vertical: 'middle' }

  const totalPrs = ws.getCell(`G${totalRow}`)
  totalPrs.value = grandPresent
  totalPrs.numFmt = '#,##0'
  totalPrs.alignment = { horizontal: 'right', vertical: 'middle' }

  const totalBnrCell = ws.getCell(`H${totalRow}`)
  totalBnrCell.value = grandBnr
  totalBnrCell.numFmt = '#,##0'
  totalBnrCell.alignment = { horizontal: 'right', vertical: 'middle' }

  const totalItemsCell = ws.getCell(`I${totalRow}`)
  totalItemsCell.value = ''

  for (let c = 1; c <= 9; c++) {
    const cCell = ws.getCell(totalRow, c)
    cCell.border = BORDER_HEADER
    cCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
  }

  // Signature Block
  const sigGap = 5
  const lineRow = totalRow + sigGap
  const textRow = lineRow + 1

  ws.getRow(lineRow).height = 12
  ws.getRow(textRow).height = 18

  for (let c = 1; c <= 3; c++) {
    ws.getCell(lineRow, c).border = { top: { style: 'medium', color: { argb: 'FF000000' } } }
  }
  for (let c = 5; c <= 6; c++) {
    ws.getCell(lineRow, c).border = { top: { style: 'medium', color: { argb: 'FF000000' } } }
  }
  for (let c = 8; c <= 9; c++) {
    ws.getCell(lineRow, c).border = { top: { style: 'medium', color: { argb: 'FF000000' } } }
  }

  ws.mergeCells(`A${textRow}:C${textRow}`)
  const prepCell = ws.getCell(`A${textRow}`)
  prepCell.value = 'PREPARED BY'
  prepCell.font = { name: 'Calibri', size: 10, bold: true }
  prepCell.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells(`E${textRow}:F${textRow}`)
  const chkCell = ws.getCell(`E${textRow}`)
  chkCell.value = 'CHECKED BY'
  chkCell.font = { name: 'Calibri', size: 10, bold: true }
  chkCell.alignment = { horizontal: 'center', vertical: 'middle' }

  ws.mergeCells(`H${textRow}:I${textRow}`)
  const authCell = ws.getCell(`H${textRow}`)
  authCell.value = 'AUTHORISED BY'
  authCell.font = { name: 'Calibri', size: 10, bold: true }
  authCell.alignment = { horizontal: 'center', vertical: 'middle' }

  return ws
}
