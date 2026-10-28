import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { DailyReportData } from '@/types'
import { formatFloorDisplayName } from './report-utils'

/**
 * Generate official PDF for Daily Sewing Needle Present Balance Report
 */
export function generatePresentBalancePDF(report: DailyReportData): jsPDF {
  // A4 Landscape is 297mm x 210mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth() // 297mm
  const pageHeight = doc.internal.pageSize.getHeight() // 210mm
  const leftMargin = 10
  const rightMargin = 10
  const contentWidth = pageWidth - leftMargin - rightMargin // 277mm

  // 1. Company Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42) // #0F172A
  doc.text('GMS COMPOSITE KNITTING IND LTD', pageWidth / 2, 12, { align: 'center' })

  // Sub-header Address
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105) // #475569
  doc.text('SHARDAGONJ, KASHIMPUR, GAZIPUR', pageWidth / 2, 16.5, { align: 'center' })

  // Department
  doc.setFontSize(9.5)
  doc.setTextColor(37, 99, 235) // #2563EB
  doc.text('ACCESSORIES MCD', pageWidth / 2, 20.5, { align: 'center' })

  // Document & Version Box (Top Right)
  const docBoxWidth = 52
  const docBoxHeight = 13
  const docBoxX = pageWidth - rightMargin - docBoxWidth
  const docBoxY = 8

  doc.setFillColor(239, 246, 255) // #EFF6FF
  doc.setDrawColor(30, 41, 59) // dark border
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

  // Report Title Banner
  const titleY = 24
  doc.setFillColor(30, 41, 59) // #1E293B
  doc.rect(leftMargin, titleY, contentWidth, 7, 'F')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('DAILY SEWING NEEDLE PRESENT BALANCE REPORT', pageWidth / 2, titleY + 4.8, { align: 'center' })

  // Metadata Information Bar
  const metaY = titleY + 7.5
  doc.setFillColor(241, 245, 249) // #F1F5F9
  doc.rect(leftMargin, metaY, contentWidth, 5.5, 'F')
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  doc.rect(leftMargin, metaY, contentWidth, 5.5, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(51, 65, 85) // #334155

  const floorLabel = formatFloorDisplayName(report.floorName, report.locationName)
  const metaText = `Floor: ${floorLabel}   |   Date: ${report.date}   |   Category: ${report.category}`
  doc.text(metaText, leftMargin + 3, metaY + 3.8)

  // 2. Prepare Table Body and Headers
  const tableHeaders = [
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

  const tableBody = report.rows.map((r, i) => [
    (i + 1).toString(),
    r.item_code,
    r.needle_type,
    r.size_dia || '',
    r.brand,
    r.unit_price_usd !== null && r.unit_price_usd !== undefined ? Number(r.unit_price_usd).toFixed(4) : '',
    r.previous.toLocaleString(),
    r.received.toLocaleString(),
    r.req_no || '',
    r.delivery.toLocaleString(),
    r.present.toLocaleString(),
    r.bnr.toLocaleString(),
    r.custom || '',
    r.note || '',
  ])

  // Total row
  const totalRow = [
    '',
    '',
    '',
    '',
    '',
    '',
    report.summary.totalPrevious.toLocaleString(),
    report.summary.totalReceived.toLocaleString(),
    '',
    report.summary.totalDelivery.toLocaleString(),
    report.summary.totalPresent.toLocaleString(),
    report.summary.totalBnr.toLocaleString(),
    '',
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
      0: { halign: 'center', cellWidth: 9 },   // SL
      1: { halign: 'center', cellWidth: 16 },  // CODE
      2: { halign: 'left', cellWidth: 36 },    // TYPE
      3: { halign: 'center', cellWidth: 14 },  // SIZE
      4: { halign: 'center', cellWidth: 20 },  // BRAND
      5: { halign: 'right', cellWidth: 17 },   // UNIT PRICE
      6: { halign: 'right', cellWidth: 16 },   // PREVIOUS
      7: { halign: 'right', cellWidth: 15 },   // RECEIVED
      8: { halign: 'center', cellWidth: 22 },  // REQ NO
      9: { halign: 'right', cellWidth: 15 },   // DELIVERY
      10: { halign: 'right', cellWidth: 22, fontStyle: 'bold', fillColor: [255, 243, 214], textColor: [146, 64, 14] }, // PRESENT
      11: { halign: 'right', cellWidth: 14 },  // BNR
      12: { halign: 'center', cellWidth: 14 }, // CUSTOM
      13: { halign: 'left', cellWidth: 'auto' }, // NOTE
    },
    didParseCell: (data) => {
      // Style Total Row: entire row has dark navy background, white bold text, and aligned cells
      if (data.section === 'body' && data.row.index === tableBody.length - 1) {
        data.cell.styles.fillColor = [51, 65, 85]
        data.cell.styles.textColor = [255, 255, 255]
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 7
        data.cell.styles.minCellHeight = 6
        data.cell.styles.cellPadding = 1.4
        if ([6, 7, 9, 10, 11].includes(data.column.index)) {
          data.cell.styles.halign = 'right'
        }
      }
    },
    didDrawCell: (data) => {
      // Custom render "TOTAL →" in column 5 of Total Row with crisp Helvetica and vector arrow
      if (data.section === 'body' && data.row.index === tableBody.length - 1 && data.column.index === 5) {
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
  // If not enough room on current page for signatures, add a new page
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

  // PREPARED BY line & text
  doc.line(col1X, sigY, col1X + sigColWidth, sigY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 23, 42)
  doc.text('PREPARED BY', col1X + sigColWidth / 2, sigY + 5, { align: 'center' })

  // CHECKED BY line & text
  doc.line(col2X, sigY, col2X + sigColWidth, sigY)
  doc.text('CHECKED BY', col2X + sigColWidth / 2, sigY + 5, { align: 'center' })

  // AUTHORISED BY line & text
  doc.line(col3X, sigY, col3X + sigColWidth, sigY)
  doc.text('AUTHORISED BY', col3X + sigColWidth / 2, sigY + 5, { align: 'center' })

  return doc
}
