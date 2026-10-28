import ExcelJS from 'exceljs'
import type { DailyReportData } from '@/types'

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
}

const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2E8F0' },
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE2E8F0' },
}

export interface StockReportInput {
  date: string
  newReports: DailyReportData[]
  runningReports: DailyReportData[]
  idleReports: DailyReportData[]
}

/**
 * Generate a complete Daily Stock Report workbook matching STOCK REPORT 20-10-2026.xlsx
 */
export async function generateDailyStockReportWorkbook(input: StockReportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GMS MCD ERP'
  workbook.lastModifiedBy = 'GMS MCD ERP'
  workbook.created = new Date()
  workbook.modified = new Date()

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 1: SEWING NEEDLE
  // ───────────────────────────────────────────────────────────────────────────
  const wsSewing = workbook.addWorksheet('SEWING NEEDLE', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  wsSewing.columns = [
    { header: 'FLOOR NAME & LOCATION', key: 'floor', width: 30 },
    { header: 'CATEGORY', key: 'category', width: 14 },
    { header: 'ITEM CODE', key: 'item_code', width: 14 },
    { header: 'NEEDLE TYPE', key: 'type', width: 22 },
    { header: 'SIZE/DIA', key: 'size', width: 10 },
    { header: 'BRAND', key: 'brand', width: 14 },
    { header: 'UNIT', key: 'unit', width: 8 },
    { header: 'UNIT PRICE (USD)', key: 'unit_price', width: 16 },
    { header: 'STOCK', key: 'stock', width: 12 },
    { header: 'STOCK VALUE(USD)', key: 'stock_val', width: 18 },
  ]

  // Style Header Row
  const hRow = wsSewing.getRow(1)
  hRow.height = 24
  for (let c = 1; c <= 10; c++) {
    const cell = hRow.getCell(c)
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = BORDER_THIN
  }

  let sewingCurrentRow = 2
  let grandTotalStock = 0
  let grandTotalValue = 0

  // Combine reports grouped by Floor, then NEW, then RUNNING
  const floorMap = new Map<
    string,
    { floorName: string; locationName: string | null; newRep?: DailyReportData; runningRep?: DailyReportData }
  >()

  for (const rep of input.newReports) {
    const key = rep.floorId
    const existing = floorMap.get(key) || {
      floorName: rep.floorName,
      locationName: rep.locationName,
    }
    existing.newRep = rep
    floorMap.set(key, existing)
  }

  for (const rep of input.runningReports) {
    const key = rep.floorId
    const existing = floorMap.get(key) || {
      floorName: rep.floorName,
      locationName: rep.locationName,
    }
    existing.runningRep = rep
    floorMap.set(key, existing)
  }

  // Populate data for each floor
  for (const [, group] of floorMap) {
    const floorLabel = group.locationName
      ? `${group.floorName}(${group.locationName})`
      : group.floorName

    // Category NEW
    if (group.newRep && group.newRep.rows.length > 0) {
      let groupStock = 0
      let groupValue = 0

      for (const item of group.newRep.rows) {
        const stock = item.present
        const price = item.unit_price_usd ?? 0
        const stockValue = stock * price

        groupStock += stock
        groupValue += stockValue

        const r = wsSewing.getRow(sewingCurrentRow)
        r.height = 18
        r.getCell(1).value = floorLabel
        r.getCell(2).value = 'NEW'
        r.getCell(3).value = item.item_code
        r.getCell(4).value = item.needle_type
        r.getCell(5).value = item.size_dia || ''
        r.getCell(6).value = item.brand
        r.getCell(7).value = 'PCS'

        const cPrice = r.getCell(8)
        cPrice.value = price
        cPrice.numFmt = '0.0000'
        cPrice.alignment = { horizontal: 'right' }

        const cStock = r.getCell(9)
        cStock.value = stock
        cStock.numFmt = '#,##0'
        cStock.alignment = { horizontal: 'right' }

        const cVal = r.getCell(10)
        cVal.value = stockValue
        cVal.numFmt = '0.00'
        cVal.alignment = { horizontal: 'right' }

        for (let col = 1; col <= 10; col++) {
          r.getCell(col).border = BORDER_THIN
          r.getCell(col).font = { name: 'Calibri', size: 10 }
        }

        sewingCurrentRow++
      }

      // Group Total row for NEW
      const totRow = wsSewing.getRow(sewingCurrentRow)
      totRow.height = 20
      totRow.getCell(1).value = floorLabel
      totRow.getCell(2).value = 'NEW Total'
      totRow.getCell(9).value = groupStock
      totRow.getCell(9).numFmt = '#,##0'
      totRow.getCell(9).alignment = { horizontal: 'right' }
      totRow.getCell(10).value = groupValue
      totRow.getCell(10).numFmt = '0.00'
      totRow.getCell(10).alignment = { horizontal: 'right' }

      for (let col = 1; col <= 10; col++) {
        const cell = totRow.getCell(col)
        cell.fill = TOTAL_FILL
        cell.font = { name: 'Calibri', size: 10, bold: true }
        cell.border = BORDER_THIN
      }

      grandTotalStock += groupStock
      grandTotalValue += groupValue
      sewingCurrentRow++
    }

    // Category RUNNING
    if (group.runningRep && group.runningRep.rows.length > 0) {
      let groupStock = 0
      let groupValue = 0

      for (const item of group.runningRep.rows) {
        const stock = item.present
        const price = item.unit_price_usd ?? 0
        const stockValue = stock * price

        groupStock += stock
        groupValue += stockValue

        const r = wsSewing.getRow(sewingCurrentRow)
        r.height = 18
        r.getCell(1).value = floorLabel
        r.getCell(2).value = 'RUNNING'
        r.getCell(3).value = item.item_code
        r.getCell(4).value = item.needle_type
        r.getCell(5).value = item.size_dia || ''
        r.getCell(6).value = item.brand
        r.getCell(7).value = 'PCS'

        const cPrice = r.getCell(8)
        cPrice.value = price
        cPrice.numFmt = '0.0000'
        cPrice.alignment = { horizontal: 'right' }

        const cStock = r.getCell(9)
        cStock.value = stock
        cStock.numFmt = '#,##0'
        cStock.alignment = { horizontal: 'right' }

        const cVal = r.getCell(10)
        cVal.value = stockValue
        cVal.numFmt = '0.00'
        cVal.alignment = { horizontal: 'right' }

        for (let col = 1; col <= 10; col++) {
          r.getCell(col).border = BORDER_THIN
          r.getCell(col).font = { name: 'Calibri', size: 10 }
        }

        sewingCurrentRow++
      }

      // Group Total row for RUNNING
      const totRow = wsSewing.getRow(sewingCurrentRow)
      totRow.height = 20
      totRow.getCell(1).value = floorLabel
      totRow.getCell(2).value = 'RUNNING Total'
      totRow.getCell(9).value = groupStock
      totRow.getCell(9).numFmt = '#,##0'
      totRow.getCell(9).alignment = { horizontal: 'right' }
      totRow.getCell(10).value = groupValue
      totRow.getCell(10).numFmt = '0.00'
      totRow.getCell(10).alignment = { horizontal: 'right' }

      for (let col = 1; col <= 10; col++) {
        const cell = totRow.getCell(col)
        cell.fill = TOTAL_FILL
        cell.font = { name: 'Calibri', size: 10, bold: true }
        cell.border = BORDER_THIN
      }

      grandTotalStock += groupStock
      grandTotalValue += groupValue
      sewingCurrentRow++
    }
  }

  // Grand Total Row
  const grandRow = wsSewing.getRow(sewingCurrentRow)
  grandRow.height = 22
  grandRow.getCell(1).value = 'Grand Total'
  grandRow.getCell(9).value = grandTotalStock
  grandRow.getCell(9).numFmt = '#,##0'
  grandRow.getCell(9).alignment = { horizontal: 'right' }
  grandRow.getCell(10).value = grandTotalValue
  grandRow.getCell(10).numFmt = '0.00'
  grandRow.getCell(10).alignment = { horizontal: 'right' }

  for (let col = 1; col <= 10; col++) {
    const cell = grandRow.getCell(col)
    cell.fill = TOTAL_FILL
    cell.font = { name: 'Calibri', size: 11, bold: true }
    cell.border = BORDER_THIN
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SHEET 2: IDLE NEEDLE
  // ───────────────────────────────────────────────────────────────────────────
  const wsIdle = workbook.addWorksheet('IDLE NEEDLE', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  wsIdle.columns = [
    { header: 'FLOOR NAME & LOCATION', key: 'floor', width: 32 },
    { header: 'ITEM CODE', key: 'item_code', width: 14 },
    { header: 'NEEDLE TYPE', key: 'type', width: 22 },
    { header: 'SIZE/DIA', key: 'size', width: 12 },
    { header: 'BRAND', key: 'brand', width: 14 },
    { header: 'TOTAL STOCK', key: 'stock', width: 16 },
  ]

  // Style Header Row
  const iHRow = wsIdle.getRow(1)
  iHRow.height = 24
  for (let c = 1; c <= 6; c++) {
    const cell = iHRow.getCell(c)
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = BORDER_THIN
  }

  let idleCurrentRow = 2
  let idleGrandTotal = 0

  for (const rep of input.idleReports) {
    if (rep.rows.length === 0) continue

    const floorLabel = rep.locationName
      ? `${rep.floorName} (${rep.locationName})`
      : rep.floorName

    let floorTotal = 0

    for (const item of rep.rows) {
      const stock = item.present
      floorTotal += stock

      const r = wsIdle.getRow(idleCurrentRow)
      r.height = 18
      r.getCell(1).value = floorLabel
      r.getCell(2).value = item.item_code
      r.getCell(3).value = item.needle_type
      r.getCell(4).value = item.size_dia || ''
      r.getCell(5).value = item.brand

      const cStock = r.getCell(6)
      cStock.value = stock
      cStock.numFmt = '#,##0'
      cStock.alignment = { horizontal: 'right' }

      for (let col = 1; col <= 6; col++) {
        r.getCell(col).border = BORDER_THIN
        r.getCell(col).font = { name: 'Calibri', size: 10 }
      }

      idleCurrentRow++
    }

    // Floor Total Row
    const fTotRow = wsIdle.getRow(idleCurrentRow)
    fTotRow.height = 20
    fTotRow.getCell(1).value = `${floorLabel} Total`
    fTotRow.getCell(6).value = floorTotal
    fTotRow.getCell(6).numFmt = '#,##0'
    fTotRow.getCell(6).alignment = { horizontal: 'right' }

    for (let col = 1; col <= 6; col++) {
      const cell = fTotRow.getCell(col)
      cell.fill = TOTAL_FILL
      cell.font = { name: 'Calibri', size: 10, bold: true }
      cell.border = BORDER_THIN
    }

    idleGrandTotal += floorTotal
    idleCurrentRow++
  }

  // Idle Grand Total
  if (idleCurrentRow > 2) {
    const idleGrandRow = wsIdle.getRow(idleCurrentRow)
    idleGrandRow.height = 22
    idleGrandRow.getCell(1).value = 'Grand Total'
    idleGrandRow.getCell(6).value = idleGrandTotal
    idleGrandRow.getCell(6).numFmt = '#,##0'
    idleGrandRow.getCell(6).alignment = { horizontal: 'right' }

    for (let col = 1; col <= 6; col++) {
      const cell = idleGrandRow.getCell(col)
      cell.fill = TOTAL_FILL
      cell.font = { name: 'Calibri', size: 11, bold: true }
      cell.border = BORDER_THIN
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
