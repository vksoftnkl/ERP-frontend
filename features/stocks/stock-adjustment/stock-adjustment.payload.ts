/**
 * Stock Adjustment — the draft to the wire and back: buildLines / buildPayload,
 * and applyFetchedVoucher (applyHeader + applyLines) of the Qt screen. Pure.
 */
import { kindFromCode, RATE_SOURCES, saveType } from "./stock-adjustment.constants";
import { cellNumber, dateFromWire, dateToWire, qtyCell } from "./stock-adjustment.format";
import {
  blankLine,
  computeTotals,
  createDraft,
  isInward,
  lineFactor,
  rowHasItem,
  tracks,
} from "./stock-adjustment.state";
import type {
  AdjustmentDraft,
  AdjustmentLine,
  DraftScope,
  SaveStockAdjustmentDto,
  SaveStockAdjustmentHeader,
  SaveStockAdjustmentLine,
  StockAdjustmentLinePayload,
  StockAdjustmentPayload,
  StockAdjustmentSaveResult,
} from "./stock-adjustment.types";

/**
 * buildLines — one wire line per grid line that names an item, numbered from
 * 1. Qty is SIGNED as the cell holds it (a move's is its magnitude); the server
 * stores the magnitude and the sign apart. `sentKeys` maps the payload index
 * back to the line, so a 422 naming "lines.<n>" lands on the right row.
 */
export function buildLines(draft: AdjustmentDraft): {
  lines: SaveStockAdjustmentLine[];
  sentKeys: string[];
} {
  const lines: SaveStockAdjustmentLine[] = [];
  const sentKeys: string[] = [];
  const manual = draft.rateSource === "MANUAL";
  let lineNo = 0;

  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    lineNo += 1;
    sentKeys.push(line.key);

    const factor = lineFactor(line);
    let qty = cellNumber(line.qty);
    if (draft.kind === "Move") {
      qty = Math.abs(qty);
    }
    const wire: SaveStockAdjustmentLine = {
      lineNo,
      itemId: line.itemId,
      uomId: line.uomId,
      baseUomId: line.baseUomId,
      toBaseFactor: factor,
      qty,
      baseQty: qty * factor,
      godownId: draft.godownId,
      bucket: line.bucket.trim() || "SALEABLE",
    };
    if (draft.kind === "Move" && line.toBucket.trim()) {
      wire.toBucket = line.toBucket.trim();
    }
    if (line.reasonId) {
      wire.reasonId = line.reasonId;
    }
    if (line.remarks.trim()) {
      wire.remarks = line.remarks.trim();
    }
    if (line.barcode.trim()) {
      wire.barcode = line.barcode.trim();
    }

    if (isInward(draft.kind, line)) {
      // INWARD: no lot — the identity fields resolve (or create) it. Sent only
      // for the facets the item tracks, as the opening does.
      const signature = line.trackSignature;
      if (tracks(signature, "B") && line.batchNo.trim()) {
        wire.batchNo = line.batchNo.trim();
      }
      const mfg = dateToWire(line.mfgDate);
      if (tracks(signature, "E") && mfg) {
        wire.mfgDate = mfg;
      }
      const expiry = dateToWire(line.expiryDate);
      if (tracks(signature, "E") && expiry) {
        wire.expiryDate = expiry;
      }
      if (tracks(signature, "R") && line.serialNo.trim()) {
        wire.serialNo = line.serialNo.trim();
      }
      if (tracks(signature, "M") && (line.mrp ?? 0) > 0) {
        wire.mrp = line.mrp ?? 0;
      }
      if (tracks(signature, "S") && (line.salePrice ?? 0) > 0) {
        wire.salePrice = line.salePrice ?? 0;
      }
      if (tracks(signature, "P") && line.supplierId.trim()) {
        wire.supplierId = line.supplierId.trim();
      }
      // A keyed cost only under MANUAL — any other rate source derives it, and
      // a sent figure would switch the derivation off. The wire rate is PER
      // BASE UNIT (svi_value = base_qty * cost_rate).
      if (manual && draft.kind === "Adjustment") {
        wire.costRate = (line.costRate ?? 0) / factor;
      }
    } else if (line.lotId.trim()) {
      wire.lotId = line.lotId.trim();
    }
    lines.push(wire);
  }
  return { lines, sentKeys };
}

/**
 * buildPayload — the header and its lines. ONE godown, always in fromGodownId:
 * the server's documentGodown() reads it there for every kind, and a sheet
 * with both signs names it once. The header stores the NET, signed; a move's
 * totals are the magnitude moved. `post` sends status POSTED, which saves AND
 * posts in one server transaction.
 */
export function buildPayload(
  draft: AdjustmentDraft,
  post: boolean,
): { payload: SaveStockAdjustmentDto; sentKeys: string[] } {
  const { lines, sentKeys } = buildLines(draft);
  const totals = computeTotals(draft);
  const move = draft.kind === "Move";
  const netQty = move ? totals.outQty : totals.inQty - totals.outQty;
  const netValue = move ? totals.outValue : totals.inValue - totals.outValue;

  const header: SaveStockAdjustmentHeader = {
    ...(draft.svhId ? { svhId: draft.svhId } : {}),
    accYear: draft.accYear,
    companyId: draft.companyId,
    branchId: draft.branchId,
    deviceId: draft.deviceId,
    docDate: draft.docDate,
    voucherType: saveType(draft.kind),
    fromGodownId: draft.godownId,
    status: post ? "POSTED" : "DRAFT",
    lineCount: totals.lineCount,
    totalQty: netQty,
    totalValue: netValue,
    totalValueWot: netValue,
  };
  if (draft.kind === "Adjustment") {
    header.rateSource = draft.rateSource;
  }
  if (draft.defaultReasonId) {
    header.reasonId = draft.defaultReasonId;
  }
  if (draft.usrRefno.trim()) {
    header.usrRefno = draft.usrRefno.trim();
  }
  if (draft.remarks.trim()) {
    header.remarks = draft.remarks.trim();
  }
  return { payload: { header, lines }, sentKeys };
}

/**
 * applyLines, one line. The server stores magnitudes and the sign apart:
 * svi_direction on an ADJUSTMENT (re-lot included), −1 on a move, and nothing
 * on the write-off kinds, which only ever take stock out. A posted outward line
 * carries the cost the engine stamped; a draft one carries 0 until the
 * availability read shows the average.
 */
export function lineFromPayload(payload: StockAdjustmentLinePayload): AdjustmentLine {
  const factor = Number(payload.toBaseFactor) > 0 ? Number(payload.toBaseFactor) : 1;
  const qty = Math.abs(Number(payload.qty) || 0);
  const direction =
    typeof payload.direction === "number" && Number.isFinite(payload.direction)
      ? Math.trunc(payload.direction)
      : -1;
  const move = Boolean((payload.toBucket ?? "").trim());
  const sign = move ? 1 : direction;
  const mrp = Number(payload.mrp) || 0;
  const salePrice = Number(payload.salePrice) || 0;
  return {
    ...blankLine(),
    id: payload.sviId || null,
    itemId: payload.itemId ?? "",
    itemCode: payload.itemCode ?? "",
    itemName: payload.itemName ?? "",
    uomId: payload.uomId ?? "",
    uomName: payload.unitName ?? "",
    baseUomId: payload.baseUomId ?? "",
    toBaseFactor: factor,
    bucket: payload.bucket ?? "",
    toBucket: payload.toBucket ?? "",
    barcode: payload.barcode ?? "",
    batchNo: payload.batchNo ?? "",
    mfgDate: dateFromWire(payload.mfgDate),
    expiryDate: dateFromWire(payload.expiryDate),
    mrp: mrp > 0 ? mrp : null,
    salePrice: salePrice > 0 ? salePrice : null,
    serialNo: payload.serialNo ?? "",
    supplierId: payload.supplierId ?? "",
    supplierName: payload.supplierName ?? "",
    lotId: payload.lotId ?? "",
    reasonId: payload.reasonId ?? "",
    reasonName: payload.reasonName ?? "",
    remarks: payload.remarks ?? "",
    direction: move ? "MOVE" : direction > 0 ? "IN" : "OUT",
    qty: qtyCell(move ? qty : direction * qty),
    baseQty: sign * Math.abs(Number(payload.baseQty) || 0),
    costRate: (Number(payload.costRate) || 0) * factor,
    value: sign * Math.abs(Number(payload.value) || 0),
    // The item's tracking signature, resolved by the server for the document
    // date: it decides which identity cells of an inward line open.
    trackSignature: (payload.trackSignature ?? "").trim() || "N",
  };
}

/**
 * applyFetchedVoucher — the kind, the header and the lines of a loaded
 * document. The key carries its own company / branch / year (stock_voucher is
 * partitioned by year); the device is the DOCUMENT's, which numbered it. Only a
 * DRAFT opened for edit comes up keyable.
 */
export function draftFromPayload(
  scope: DraftScope,
  payload: StockAdjustmentPayload,
  openForEdit: boolean,
  today: string,
): AdjustmentDraft {
  const header = payload.header;
  const kind = kindFromCode(payload.kind);
  const base = createDraft(scope, today, kind);
  const godownId = header.fromGodownId || header.godownId || "";
  const godownName = header.fromGodownId ? header.fromGodownName ?? "" : header.godownName ?? "";
  const rateSource = (RATE_SOURCES as readonly string[]).includes(header.rateSource ?? "")
    ? (header.rateSource as string)
    : "AVG_COST";
  const status = (header.status ?? "").trim().toUpperCase() || "DRAFT";
  const reasonId = header.reasonId ?? "";
  const lines = [...(payload.lines ?? []).map(lineFromPayload), blankLine()];
  return {
    ...base,
    svhId: header.svhId ?? "",
    refno: header.refno ?? "",
    deviceId: header.deviceId || scope.deviceId,
    accYear: (header.accYear ?? "").trim() || scope.accYear,
    docDate: (header.docDate ?? "").slice(0, 10) || today,
    godownId,
    godownName,
    usrRefno: header.usrRefno ?? "",
    remarks: header.remarks ?? "",
    rateSource,
    // The header reason is a default for new lines; the list may still be
    // loading, so it is offered until the kind's reasons land.
    defaultReasonId: reasonId,
    extraReason: reasonId ? { id: reasonId, name: header.reasonName ?? reasonId } : null,
    status,
    mode: openForEdit && status === "DRAFT" ? "entry" : "browse",
    lines,
    dirty: false,
  };
}

/**
 * The save's answer. The server owns the line ids; the screen keeps its own
 * lines (with their availability and averages) and takes just the ids back.
 */
export function applySaveResult(
  draft: AdjustmentDraft,
  result: StockAdjustmentSaveResult,
  sentKeys: readonly string[],
): AdjustmentDraft {
  const ids = new Map<string, string>();
  (result.lines ?? []).forEach((line, index) => {
    const key = sentKeys[index];
    if (key && line?.sviId) {
      ids.set(key, line.sviId);
    }
  });
  const status = (result.header?.status ?? "").trim().toUpperCase() || "DRAFT";
  return {
    ...draft,
    svhId: result.header?.svhId ?? draft.svhId,
    refno: result.header?.refno ?? draft.refno,
    status,
    mode: status === "DRAFT" ? draft.mode : "browse",
    lines: draft.lines.map((line) => (ids.has(line.key) ? { ...line, id: ids.get(line.key) ?? null } : line)),
    serverProblems: {},
    sentKeys: [...sentKeys],
    dirty: false,
  };
}
