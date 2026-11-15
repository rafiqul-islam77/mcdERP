import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { MonthlyReportData } from '@/types'
import { formatFloorDisplayName } from './report-utils'

export interface MultiReportMonthlyPdfOptions {
  includeSummary?: boolean
  monthLabel?: string
}

/**
 * Render executive SUMMARY report section into the PDF document for Monthly reports
 */
function renderMonthlySummarySection(
  doc: jsPDF,
  reports: MonthlyReportData[],
  monthLabel: string
): void {
  const pageWidth = doc.internal.pageSize.getWidth() // 297mm
  const pageHeight = doc.internal.pageSize.getHeight() // 210mm
  const leftMargin = 10
  const rightMargin = 10
  const contentWidth = pageWidth - leftMargin - rightMargin // 277mm

  // 1. Company Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('GMS COMPOSITE KNITTING IND LTD', pageWidth / 2, 12, { align: 'center' })

  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text('SHARDAGONJ, KASHIMPUR, GAZIPUR', pageWidth / 2, 16.5, { align: 'center' })

  doc.setFontSize(9.5)
  doc.setTextColor(37, 99, 235)
  doc.text('ACCESSORIES MCD', pageWidth / 2, 20.5, { align: 'center' })

  // Document & Version Box
  const docBoxWidth = 52
  const docBoxHeight = 13
  const docBoxX = pageWidth - rightMargin - docBoxWidth
  const docBoxY = 8

  doc.setFillColor(239, 246, 255)
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.3)
  doc.roundedRect(docBoxX, docBoxY, docBoxWidth, docBoxHeight, 1, 1, 'FD')

  const resolvedDocNo = reports[0]?.documentNo || 'QA/03/310'
  const resolvedVerNo = reports[0]?.versionNo || '01/2026'

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(15, 23, 42)
  doc.text(`DOCUMENT NO : ${resolvedDocNo}`, docBoxX + docBoxWidth / 2, docBoxY + 5, {
    align: 'center',
  })
  doc.text(`VERSION NO : ${resolvedVerNo}`, docBoxX + docBoxWidth / 2, docBoxY + 10, {
    align: 'center',
  })

  // Title Banner
  const titleY = 24
  doc.setFillColor(30, 41, 59)
  doc.rect(leftMargin, titleY, contentWidth, 7, 'F')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('MONTHLY SEWING NEEDLE PRESENT BALANCE SUMMARY', pageWidth / 2, titleY + 4.8, {
    align: 'center',
  })

  // Metadata Bar
  const metaY = titleY + 7.5
  doc.setFillColor(241, 245, 249)
  doc.rect(leftMargin, metaY, contentWidth, 5.5, 'F')
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  doc.rect(leftMargin, metaY, contentWidth, 5.5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(51, 65, 85)
  doc.text(`Month: ${monthLabel}   |   Floors: ${reports.length} statements`, leftMargin + 3, metaY + 3.8)

  // Summary Table Headers & Body
  const summaryHeaders = [
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

  let grandPrev = 0
  let grandRecv = 0
  let grandDel = 0
  let grandPres = 0
  let grandBnr = 0
  let grandItems = 0

  const summaryBody = reports.map((r, i) => {
    grandPrev += r.summary.totalPrevious
    grandRecv += r.summary.totalReceived
    grandDel += r.summary.totalDelivery
    grandPres += r.summary.totalPresent
    grandBnr += r.summary.totalBnr
    grandItems += r.rows.length

    return [
      (i + 1).toString(),
      formatFloorDisplayName(r.floorName, r.locationName),
      r.category,
      r.summary.totalPrevious.toLocaleString(),
      r.summary.totalReceived.toLocaleString(),
      r.summary.totalDelivery.toLocaleString(),
      r.summary.totalPresent.toLocaleString(),
      r.summary.totalBnr.toLocaleString(),
      r.rows.length.toString(),
    ]
  })

  summaryBody.push([
    '',
    '',
    'TOTAL →',
    grandPrev.toLocaleString(),
    grandRecv.toLocaleString(),
    grandDel.toLocaleString(),
    grandPres.toLocaleString(),
    grandBnr.toLocaleString(),
    grandItems.toString(),
  ])

  autoTable(doc, {
    startY: metaY + 6.5,
    margin: { left: leftMargin, right: rightMargin, bottom: 25 },
    head: [summaryHeaders],
    body: summaryBody,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      font: 'helvetica',
      textColor: [15, 23, 42],
      lineColor: [30, 41, 59],
      lineWidth: 0.15,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 80 },
      2: { halign: 'center', cellWidth: 24 },
      3: { halign: 'right', cellWidth: 25 },
      4: { halign: 'right', cellWidth: 25 },
      5: { halign: 'right', cellWidth: 25 },
      6: { halign: 'right', cellWidth: 32, fontStyle: 'bold', fillColor: [255, 243, 214], textColor: [146, 64, 14] },
      7: { halign: 'right', cellWidth: 25 },
      8: { halign: 'center', cellWidth: 20 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === summaryBody.length - 1) {
        data.cell.styles.fillColor = [51, 65, 85]
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 7.5
        if ([3, 4, 5, 6, 7].includes(data.column.index)) {
          data.cell.styles.halign = 'right'
        }
      }
    },
  })

  // Signatures
  const finalY = (doc as any).lastAutoTable.finalY || pageHeight - 35
  let sigY = finalY + 12
  if (sigY + 25 > pageHeight - 5) {
    doc.addPage('a4', 'landscape')
    sigY = 30
  }

  const sigColWidth = 55
  const col1X = leftMargin + 10
  const col2X = leftMargin + contentWidth / 2 - sigColWidth / 2
  const col3X = leftMargin + contentWidth - sigColWidth - 10

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(col1X, sigY, col1X + sigColWidth, sigY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 23, 42)
  doc.text('PREPARED BY', col1X + sigColWidth / 2, sigY + 5, { align: 'center' })

  doc.line(col2X, sigY, col2X + sigColWidth, sigY)
  doc.text('CHECKED BY', col2X + sigColWidth / 2, sigY + 5, { align: 'center' })

  doc.line(col3X, sigY, col3X + sigColWidth, sigY)
  doc.text('AUTHORISED BY', col3X + sigColWidth / 2, sigY + 5, { align: 'center' })
}

/**
 * Render a single Monthly Present Balance Report into the current page of doc
 */
function renderSingleMonthlyReport(doc: jsPDF, report: MonthlyReportData): void {
  const pageWidth = doc.internal.pageSize.getWidth() // 297mm
  const pageHeight = doc.internal.pageSize.getHeight() // 210mm
  const leftMargin = 10
  const rightMargin = 10
  const contentWidth = pageWidth - leftMargin - rightMargin // 277mm

  // 1. Company Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('GMS COMPOSITE KNITTING IND LTD', pageWidth / 2, 12, { align: 'center' })

  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text('SHARDAGONJ, KASHIMPUR, GAZIPUR', pageWidth / 2, 16.5, { align: 'center' })

  doc.setFontSize(9.5)
  doc.setTextColor(37, 99, 235)
  doc.text('ACCESSORIES MCD', pageWidth / 2, 20.5, { align: 'center' })

  // Document & Version Box (Top Right)
  const docBoxWidth = 52
  const docBoxHeight = 13
  const docBoxX = pageWidth - rightMargin - docBoxWidth
  const docBoxY = 8

  doc.setFillColor(239, 246, 255)
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.3)
  doc.roundedRect(docBoxX, docBoxY, docBoxWidth, docBoxHeight, 1, 1, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(15, 23, 42)
  doc.text(`DOCUMENT NO : ${report.documentNo || 'QA/03/310'}`, docBoxX + docBoxWidth / 2, docBoxY + 5, {
    align: 'center',
  })
  doc.text(`VERSION NO : ${report.versionNo || '01/2026'}`, docBoxX + docBoxWidth / 2, docBoxY + 10, {
    align: 'center',
  })

  // Title Banner
  const titleY = 24
  doc.setFillColor(30, 41, 59)
  doc.rect(leftMargin, titleY, contentWidth, 7, 'F')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('MONTHLY SEWING NEEDLE PRESENT BALANCE REPORT', pageWidth / 2, titleY + 4.8, { align: 'center' })

  // Metadata Information Bar
  const metaY = titleY + 7.5
  doc.setFillColor(241, 245, 249)
  doc.rect(leftMargin, metaY, contentWidth, 5.5, 'F')
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  doc.rect(leftMargin, metaY, contentWidth, 5.5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(51, 65, 85)

  const floorLabel = formatFloorDisplayName(report.floorName, report.locationName)
  const metaText = `Floor: ${floorLabel}   |   Month: ${report.monthLabel}   |   Category: ${report.category}`
  doc.text(metaText, leftMargin + 3, metaY + 3.8)

  // 2. Prepare 11-column Table (REQ NO and UNIT PRICE omitted)
  const tableHeaders = [
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

  const tableBody = report.rows.map((r, i) => [
    (i + 1).toString(),
    r.item_code,
    r.needle_type,
    r.size_dia || '',
    r.brand,
    r.previous.toLocaleString(),
    r.received.toLocaleString(),
    r.delivery.toLocaleString(),
    r.present.toLocaleString(),
    r.bnr.toLocaleString(),
    r.note || '',
  ])

  // Total row
  const totalRow = [
    '',
    '',
    '',
    '',
    '',
    report.summary.totalPrevious.toLocaleString(),
    report.summary.totalReceived.toLocaleString(),
    report.summary.totalDelivery.toLocaleString(),
    report.summary.totalPresent.toLocaleString(),
    report.summary.totalBnr.toLocaleString(),
    '',
  ]

  tableBody.push(totalRow)

  // 3. Render Table using autoTable
  autoTable(doc, {
    startY: metaY + 6.5,
    margin: { left: leftMargin, right: rightMargin, bottom: 25 },
    head: [tableHeaders],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.2,
      font: 'helvetica',
      textColor: [15, 23, 42],
      lineColor: [30, 41, 59],
      lineWidth: 0.15,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },  // SL
      1: { halign: 'center', cellWidth: 18 },  // CODE
      2: { halign: 'left', cellWidth: 55 },    // TYPE (widened)
      3: { halign: 'center', cellWidth: 15 },  // SIZE
      4: { halign: 'center', cellWidth: 26 },  // BRAND
      5: { halign: 'right', cellWidth: 18 },   // PREVIOUS
      6: { halign: 'right', cellWidth: 18 },   // RECEIVED
      7: { halign: 'right', cellWidth: 18 },   // DELIVERY
      8: { halign: 'right', cellWidth: 28, fontStyle: 'bold', fillColor: [255, 243, 214], textColor: [146, 64, 14] }, // PRESENT
      9: { halign: 'right', cellWidth: 20 },   // Missing broken needle
      10: { halign: 'left', cellWidth: 'auto' }, // Remarks
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === tableBody.length - 1) {
        data.cell.styles.fillColor = [51, 65, 85]
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 7
        data.cell.styles.minCellHeight = 6
        data.cell.styles.cellPadding = 1.4
        if ([5, 6, 7, 8, 9].includes(data.column.index)) {
          data.cell.styles.halign = 'right'
        }
      }
    },
    didDrawCell: (data) => {
      // Custom render "TOTAL →" in column 4 (BRAND) of Total Row
      if (data.section === 'body' && data.row.index === tableBody.length - 1 && data.column.index === 4) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(255, 255, 255)
        const label = 'TOTAL'
        const textW = doc.getTextWidth(label)
        const arrowW = 2.4
        const gap = 1.2
        const totalContentW = textW + gap + arrowW
        const startX = data.cell.x + (data.cell.width - totalContentW) / 2
        const cellCenterY = data.cell.y + data.cell.height / 2
        doc.text(label, startX, cellCenterY, { baseline: 'middle' })

        const arrowStartX = startX + textW + gap
        const arrowEndX = arrowStartX + arrowW
        doc.setDrawColor(255, 255, 255)
        doc.setLineWidth(0.35)
        doc.line(arrowStartX, cellCenterY, arrowEndX, cellCenterY)
        doc.line(arrowEndX - 0.7, cellCenterY - 0.6, arrowEndX, cellCenterY)
        doc.line(arrowEndX - 0.7, cellCenterY + 0.6, arrowEndX, cellCenterY)
      }
    },
  })

  // 4. Signature Section
  const finalY = (doc as any).lastAutoTable.finalY || pageHeight - 35
  const sigSpaceRequired = 25

  let sigY = finalY + 12
  if (sigY + sigSpaceRequired > pageHeight - 5) {
    doc.addPage('a4', 'landscape')
    sigY = 30
  }

  const sigColWidth = 55
  const col1X = leftMargin + 10
  const col2X = leftMargin + contentWidth / 2 - sigColWidth / 2
  const col3X = leftMargin + contentWidth - sigColWidth - 10

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)

  doc.line(col1X, sigY, col1X + sigColWidth, sigY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 23, 42)
  doc.text('PREPARED BY', col1X + sigColWidth / 2, sigY + 5, { align: 'center' })

  doc.line(col2X, sigY, col2X + sigColWidth, sigY)
  doc.text('CHECKED BY', col2X + sigColWidth / 2, sigY + 5, { align: 'center' })

  doc.line(col3X, sigY, col3X + sigColWidth, sigY)
  doc.text('AUTHORISED BY', col3X + sigColWidth / 2, sigY + 5, { align: 'center' })
}

/**
 * Generate official PDF for Monthly Sewing Needle Present Balance Report (single floor)
 */
export function generateMonthlyBalancePDF(report: MonthlyReportData): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  renderSingleMonthlyReport(doc, report)
  return doc
}

/**
 * Generate official PDF for batch Monthly Present Balance Reports with optional Summary
 */
export function generateMonthlyMultiReportPDF(
  reports: MonthlyReportData[],
  options?: MultiReportMonthlyPdfOptions
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  if (reports.length === 0) {
    return doc
  }

  const includeSummary = options?.includeSummary !== false
  const monthLabel = options?.monthLabel || reports[0]?.monthLabel || ''

  if (includeSummary && reports.length > 1) {
    renderMonthlySummarySection(doc, reports, monthLabel)
  }

  reports.forEach((report, index) => {
    if (includeSummary && reports.length > 1) {
      doc.addPage('a4', 'landscape')
    } else if (index > 0) {
      doc.addPage('a4', 'landscape')
    }
    renderSingleMonthlyReport(doc, report)
  })

  return doc
}
