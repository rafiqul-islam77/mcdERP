import type { DailyEntryCategory, FloorTransferDetail } from '@/types'

export interface TransferTxRow {
  id: string
  transaction_date: string
  floor_id: string
  needle_item_id: string
  transaction_type: string
  quantity: number
  req_no: string | null
  notes: string | null
  created_at: string
  transfer_group_id?: string | null
}

export interface FloorSummary {
  id: string
  name: string
}

export interface ParsedTransferNotes {
  prefix: 'To' | 'From' | null
  counterpartyFloorName: string | null
  receiverName: string | null
}

/**
 * Parse floor transfer note format produced by transfer_needle_stock_atomic:
 *   OUT: "To: <Floor Name> | Receiver: <Name>"
 *   IN:  "From: <Floor Name> | Receiver: <Name>"
 */
export function parseTransferNotes(notes: string | null | undefined): ParsedTransferNotes {
  if (!notes) {
    return { prefix: null, counterpartyFloorName: null, receiverName: null }
  }

  let prefix: 'To' | 'From' | null = null
  let rest = notes
  if (notes.startsWith('To: ')) {
    prefix = 'To'
    rest = notes.slice(4)
  } else if (notes.startsWith('From: ')) {
    prefix = 'From'
    rest = notes.slice(6)
  }

  const sepIdx = rest.indexOf('| Receiver:')
  if (sepIdx === -1) {
    return {
      prefix,
      counterpartyFloorName: prefix ? rest.trim() || null : null,
      receiverName: null,
    }
  }

  const counterpartyFloorName = prefix ? rest.slice(0, sepIdx).trim() || null : null
  const rawReceiver = rest.slice(sepIdx + '| Receiver:'.length).trim()
  const receiverName = !rawReceiver || rawReceiver === 'N/A' ? null : rawReceiver

  return {
    prefix,
    counterpartyFloorName,
    receiverName,
  }
}

/**
 * Build paired TRANSFER_OUT and TRANSFER_IN note strings matching existing system conventions.
 */
export function buildTransferNotes(params: {
  fromFloorName: string
  toFloorName: string
  receiverName: string | null | undefined
}): { outNotes: string; inNotes: string } {
  const cleanReceiver = params.receiverName?.trim() || 'N/A'
  return {
    outNotes: `To: ${params.toFloorName} | Receiver: ${cleanReceiver}`,
    inNotes: `From: ${params.fromFloorName} | Receiver: ${cleanReceiver}`,
  }
}

/**
 * Signed stock effect of a needle transaction type.
 */
export function getSignedStockQuantity(transactionType: string, quantity: number): number {
  const qty = Number(quantity) || 0
  switch (transactionType) {
    case 'OPENING':
    case 'RECEIVE':
    case 'RECEIPT':
    case 'TRANSFER_IN':
    case 'ADJUSTMENT_IN':
    case 'PRODUCTION_IN':
      return qty
    case 'ISSUE':
    case 'DELIVERY':
    case 'TRANSFER_OUT':
    case 'ADJUSTMENT_OUT':
      return -qty
    default:
      return 0
  }
}

export interface ChronologicalStockValidationResult {
  valid: boolean
  failingDate: string | null
  minProjectedBalance: number | null
}

/**
 * Verify that applying `delta` on `fromDate` onwards never causes a negative stock balance
 * on `fromDate` or any subsequent date in chronological order.
 */
export function validateChronologicalStockAfterDelta(
  transactions: ReadonlyArray<{ transaction_date: string; transaction_type: string; quantity: number }>,
  fromDate: string,
  delta: number
): ChronologicalStockValidationResult {
  if (!delta || delta >= 0) {
    return { valid: true, failingDate: null, minProjectedBalance: null }
  }

  let running = 0
  const futureByDate = new Map<string, number>()

  for (const tx of transactions) {
    const signed = getSignedStockQuantity(tx.transaction_type, tx.quantity)
    if (tx.transaction_date <= fromDate) {
      running += signed
    } else {
      futureByDate.set(tx.transaction_date, (futureByDate.get(tx.transaction_date) || 0) + signed)
    }
  }

  let projected = running + delta
  let minProjected = projected
  if (projected < 0) {
    return { valid: false, failingDate: fromDate, minProjectedBalance: projected }
  }

  const sortedFutureDates = Array.from(futureByDate.keys()).sort()
  for (const dateKey of sortedFutureDates) {
    running += futureByDate.get(dateKey) || 0
    projected = running + delta
    if (projected < minProjected) {
      minProjected = projected
    }
    if (projected < 0) {
      return { valid: false, failingDate: dateKey, minProjectedBalance: projected }
    }
  }

  return { valid: true, failingDate: null, minProjectedBalance: minProjected }
}

/**
 * Determine whether two transaction rows form a matching TRANSFER_OUT <-> TRANSFER_IN pair.
 */
function findMatchingCounterpart<T extends TransferTxRow>(
  anchor: T,
  candidates: T[],
  usedIds: Set<string>,
  floorMap: Map<string, string>,
  anchorIsOut: boolean
): T | null {
  if (anchor.transfer_group_id) {
    const groupMatch = candidates.find(
      (c) => !usedIds.has(c.id) && c.transfer_group_id === anchor.transfer_group_id
    )
    if (groupMatch) return groupMatch
  }

  const anchorFloorName = floorMap.get(anchor.floor_id) || ''
  const parsedAnchor = parseTransferNotes(anchor.notes)
  const anchorReq = anchor.req_no || ''
  const anchorQty = Number(anchor.quantity) || 0
  const anchorTime = Date.parse(anchor.created_at) || 0

  const scored = candidates
    .filter((cand) => {
      if (usedIds.has(cand.id)) return false
      if (cand.transaction_date !== anchor.transaction_date) return false
      if (cand.needle_item_id !== anchor.needle_item_id) return false
      if ((Number(cand.quantity) || 0) !== anchorQty) return false
      if ((cand.req_no || '') !== anchorReq) return false

      const candFloorName = floorMap.get(cand.floor_id) || ''
      const parsedCand = parseTransferNotes(cand.notes)

      if (anchorIsOut) {
        if (parsedAnchor.prefix === 'To' && parsedAnchor.counterpartyFloorName !== candFloorName) {
          return false
        }
        if (parsedCand.prefix === 'From' && parsedCand.counterpartyFloorName !== anchorFloorName) {
          return false
        }
      } else {
        if (parsedAnchor.prefix === 'From' && parsedAnchor.counterpartyFloorName !== candFloorName) {
          return false
        }
        if (parsedCand.prefix === 'To' && parsedCand.counterpartyFloorName !== anchorFloorName) {
          return false
        }
      }
      return true
    })
    .sort((a, b) => {
      const aUnlinked = a.transfer_group_id ? 1 : 0
      const bUnlinked = b.transfer_group_id ? 1 : 0
      if (aUnlinked !== bUnlinked) return aUnlinked - bUnlinked
      const diffA = Math.abs((Date.parse(a.created_at) || 0) - anchorTime)
      const diffB = Math.abs((Date.parse(b.created_at) || 0) - anchorTime)
      if (diffA !== diffB) return diffA - diffB
      return a.id.localeCompare(b.id)
    })

  return scored[0] || null
}

/**
 * Resolve the single TRANSFER_IN counterpart for a given TRANSFER_OUT row.
 */
export function resolveTransferPairFromRows(params: {
  outRow: TransferTxRow
  candidateInRows: TransferTxRow[]
  floors: FloorSummary[]
}): { inRow: TransferTxRow | null; fromFloorName: string; toFloorName: string; receiverName: string | null } {
  const floorMap = new Map(params.floors.map((f) => [f.id, f.name]))
  const inRow = findMatchingCounterpart(
    params.outRow,
    params.candidateInRows,
    new Set<string>(),
    floorMap,
    true
  )
  const parsedOut = parseTransferNotes(params.outRow.notes)
  const fromFloorName = floorMap.get(params.outRow.floor_id) || 'Unknown Floor'
  const toFloorName =
    (inRow ? floorMap.get(inRow.floor_id) : null) || parsedOut.counterpartyFloorName || 'Unknown Floor'

  return {
    inRow,
    fromFloorName,
    toFloorName,
    receiverName: parsedOut.receiverName,
  }
}

/**
 * Resolve all incoming and outgoing FloorTransferDetail records for a needle/date/floor sheet cell.
 * Every record always exposes `transferId` as the canonical TRANSFER_OUT ID.
 */
export function resolveTransfersForDailyEntryCell(params: {
  inspectedFloorId: string
  category: DailyEntryCategory
  needleName: string
  allDateNeedleTxs: TransferTxRow[]
  floors: FloorSummary[]
}): FloorTransferDetail[] {
  const floorMap = new Map(params.floors.map((f) => [f.id, f.name]))
  const allOut = params.allDateNeedleTxs
    .filter((t) => t.transaction_type === 'TRANSFER_OUT')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const allIn = params.allDateNeedleTxs
    .filter((t) => t.transaction_type === 'TRANSFER_IN')
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))

  const usedInIds = new Set<string>()
  const pairs: Array<{ outTx: TransferTxRow; inTx: TransferTxRow | null }> = []

  // Pair every TRANSFER_OUT 1-to-1 with its matching TRANSFER_IN across the date/needle
  for (const outTx of allOut) {
    const matchedIn = findMatchingCounterpart(outTx, allIn, usedInIds, floorMap, true)
    if (matchedIn) {
      usedInIds.add(matchedIn.id)
    }
    pairs.push({ outTx, inTx: matchedIn })
  }

  const results: FloorTransferDetail[] = []

  for (const { outTx, inTx } of pairs) {
    const isOutFromInspected = outTx.floor_id === params.inspectedFloorId
    const isInToInspected = inTx?.floor_id === params.inspectedFloorId
    if (!isOutFromInspected && !isInToInspected) continue

    const parsed = parseTransferNotes(outTx.notes)
    const fromFloorName = floorMap.get(outTx.floor_id) || 'Unknown Floor'
    const resolvedToFloorId =
      inTx?.floor_id ||
      params.floors.find((f) => f.name === parsed.counterpartyFloorName)?.id ||
      ''
    const resolvedToFloorName =
      (inTx ? floorMap.get(inTx.floor_id) : null) ||
      parsed.counterpartyFloorName ||
      'Unknown Floor'

    results.push({
      transferId: outTx.id,
      transferOutId: outTx.id,
      transferInId: inTx?.id ?? null,
      transferGroupId: outTx.transfer_group_id ?? inTx?.transfer_group_id ?? null,
      direction: isOutFromInspected ? 'OUT' : 'IN',
      category: params.category,
      transactionDate: outTx.transaction_date,
      needleItemId: outTx.needle_item_id,
      needleName: params.needleName,
      fromFloorId: outTx.floor_id,
      fromFloorName,
      toFloorId: resolvedToFloorId,
      toFloorName: resolvedToFloorName,
      quantity: Number(outTx.quantity) || 0,
      receiverName: parsed.receiverName,
      reqNo: outTx.req_no,
      notes: outTx.notes,
      createdAt: outTx.created_at,
    })
  }

  return results
}
