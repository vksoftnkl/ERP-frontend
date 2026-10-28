/**
 * Purchase Order — the screen's rules, pure (Qt `PurchaseOrderEntry`, NexERP
 * fc46bde). Every money figure on screen is the SERVER's: an edit clears
 * nothing, it bumps `calcVersion`, and the view asks /purchase/orders/validate
 * for the figures once typing pauses; a stale answer is dropped.
 *
 * Confirm writes no stock and no books — it opens the PO for GRNs and bills.
 * A confirmed (POSTED) PO is read-only here; it is short-closed or cancelled.
 */
import { num, qtyText, text } from "@/features/purchase/shared/purchase.format";
import { COL } from "./purchase-order.constants";
import type {
  PoDraft,
  PoLine,
  PoScope,
  PoStatus,
  PurchaseOrderCalc,
  PurchaseOrderItemLookup,
  PurchaseOrderPayload,
  SavePurchaseOrderDto,
} from "./purchase-order.types";

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

let keySeq = 0;
export function nextLineKey(): string {
  keySeq += 1;
  return `pol-${Date.now().toString(36)}-${keySeq}`;
}

export function blankLine(key = nextLineKey()): PoLine {
  return {
    key,
    lineId: "",
    itemId: "",
    itemName: "",
    uomId: "",
    unitName: "",
    qty: "",
    free: "",
    rate: "",
    discPct: "",
    mrp: "",
    taxable: null,
    gstPct: null,
    tax: null,
    total: null,
    received: null,
    pending: null,
  };
}

export function rowHasItem(line: PoLine): boolean {
  return line.itemId !== "";
}

/** Qt `ensureTrailingBlankRow`: one blank line waits at the bottom. */
export function withTrailingBlank(lines: readonly PoLine[]): PoLine[] {
  const last = lines[lines.length - 1];
  return !last || rowHasItem(last) ? [...lines, blankLine()] : [...lines];
}

export function itemLines(draft: Pick<PoDraft, "lines">): PoLine[] {
  return draft.lines.filter(rowHasItem);
}

/** 1-based numbers of the lines that carry an item, by key. */
export function lineNumbers(draft: Pick<PoDraft, "lines">): Map<string, number> {
  const numbers = new Map<string, number>();
  let n = 0;
  for (const line of draft.lines) {
    if (rowHasItem(line)) {
      n += 1;
      numbers.set(line.key, n);
    }
  }
  return numbers;
}

/** A decimal as the grid shows it: up to `places`, trailing zeros trimmed; 0 / blank → "". */
export function decText(value: unknown, places = 4): string {
  const n = num(value, Number.NaN);
  if (!Number.isFinite(n) || n === 0) {
    return "";
  }
  return n.toFixed(places).replace(/\.?0+$/, "");
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export function createPoDraft(scope: PoScope, today: string): PoDraft {
  return {
    poId: "",
    refno: "",
    status: "DRAFT",
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear: scope.accYear,
    deviceId: scope.deviceId,
    supplierId: "",
    supplierName: "",
    docDate: today,
    expectedDate: "",
    godownId: "",
    godownName: "",
    contact: "",
    remarks: "",
    shortClosed: false,
    shortCloseReason: "",
    approvalStatus: "",
    lines: [blankLine()],
    totals: null,
    hint: "",
    dirty: false,
    viewMode: "entry",
    calcVersion: 0,
  };
}

function asStatus(value: unknown): PoStatus {
  const status = text(value).toUpperCase();
  return status === "POSTED" || status === "CANCELLED" ? status : "DRAFT";
}

/** Qt `applyLoaded` — a stored PO (the answer of get, save, cancel and short-close). */
export function draftFromPayload(
  payload: PurchaseOrderPayload,
  previous: Pick<PoDraft, "deviceId" | "godownName" | "godownId">,
  viewMode: "browse" | "entry",
): PoDraft {
  const h = payload.header;
  const godownId = text(h.poDeliverGodownId);
  const lines: PoLine[] = (payload.lines ?? []).map((l) => {
    const received = num(l.receivedQty);
    return {
      ...blankLine(),
      lineId: text(l.poiId),
      itemId: text(l.poiItemId),
      itemName: text(l.itemName),
      uomId: text(l.poiUomId),
      unitName: text(l.unitName),
      qty: qtyText(num(l.poiQty)),
      free: num(l.poiFreeQty) > 0 ? qtyText(num(l.poiFreeQty)) : "",
      rate: decText(l.poiRate) || "0",
      discPct: num(l.poiDiscPct) > 0 ? qtyText(num(l.poiDiscPct)) : "",
      mrp: num(l.poiMrp) > 0 ? qtyText(num(l.poiMrp)) : "",
      taxable: num(l.poiTaxableAmt),
      gstPct: num(l.poiGstPct),
      tax: num(l.poiCgstAmt) + num(l.poiSgstAmt) + num(l.poiIgstAmt) + num(l.poiCessAmt),
      total: num(l.poiTotalAmt),
      received: received > 0 ? received : null,
      pending: num(l.pendingQty),
    };
  });
  const status = asStatus(h.poStatus);
  return {
    poId: text(h.poId),
    refno: text(h.poRefno),
    status,
    companyId: text(h.poCompanyId),
    branchId: text(h.poBranchId),
    accYear: text(h.poAccYear),
    deviceId: previous.deviceId,
    supplierId: text(h.poSupplierId),
    supplierName: text(h.supplierName),
    docDate: text(h.poDocDate).slice(0, 10),
    expectedDate: text(h.poExpectedDate).slice(0, 10),
    godownId,
    // The /get answer names no godown; keep the name the screen already had for it.
    godownName: godownId && godownId === previous.godownId ? previous.godownName : "",
    contact: text(h.poContact),
    remarks: text(h.poRemarks),
    shortClosed: h.poIsShortClosed === true,
    shortCloseReason: text(h.poShortCloseReason),
    approvalStatus: text(h.poApprovalStatus).toUpperCase(),
    // A draft keeps a blank line to key into; a confirmed PO shows only its lines.
    lines: status === "DRAFT" ? withTrailingBlank(lines) : lines.length > 0 ? lines : [blankLine()],
    totals: { taxable: num(h.poTaxableAmt), tax: num(h.poTaxAmt), net: num(h.poNetAmt) },
    hint: "",
    dirty: false,
    viewMode: status === "DRAFT" ? viewMode : "browse",
    calcVersion: 0,
  };
}

// ---------------------------------------------------------------------------
// What may be done
// ---------------------------------------------------------------------------

/** Open for keying: a DRAFT in entry mode. */
export function isEditable(draft: Pick<PoDraft, "status" | "viewMode">): boolean {
  return draft.status === "DRAFT" && draft.viewMode === "entry";
}

/** Goods came against a line — the PO cannot be cancelled any more. */
export function hasReceipts(draft: Pick<PoDraft, "lines">): boolean {
  return draft.lines.some((line) => (line.received ?? 0) > 0);
}

/** Qt `applyStatus`: Cancel — saved, not cancelled, nothing received. */
export function cancellable(draft: Pick<PoDraft, "poId" | "status" | "lines">): boolean {
  return draft.poId !== "" && draft.status !== "CANCELLED" && !hasReceipts(draft);
}

/** Qt `applyStatus`: Short-close — confirmed and not closed yet. */
export function shortClosable(draft: Pick<PoDraft, "status" | "shortClosed">): boolean {
  return draft.status === "POSTED" && !draft.shortClosed;
}

/** The status pill: a POSTED order reads CONFIRMED (or SHORT-CLOSED). */
export function statusLabel(draft: Pick<PoDraft, "status" | "shortClosed">): string {
  if (draft.status === "POSTED") {
    return draft.shortClosed ? "SHORT-CLOSED" : "CONFIRMED";
  }
  return draft.status;
}

/** Why a cell will not open on a line, or "" when it opens. */
export function whyNotEditable(draft: Pick<PoDraft, "status" | "viewMode">, line: PoLine, column: number): string {
  if (!isEditable(draft)) {
    return draft.status === "DRAFT" ? "Read only — F2 edits the draft." : `This order is ${draft.status === "POSTED" ? "confirmed" : "cancelled"}.`;
  }
  const has = rowHasItem(line);
  if (column === COL.Barcode || column === COL.Item) {
    return has ? "The item is chosen — remove the line (−) and key it again to change it." : "";
  }
  if (column === COL.Qty || column === COL.Free || column === COL.Rate || column === COL.DiscPct || column === COL.Mrp) {
    return has ? "" : "Pick the item first.";
  }
  if (column === COL.Recd || column === COL.Pending) {
    return "Comes from the GRNs and bills against this order.";
  }
  return "The server figures it.";
}

/** Qt focus stops: Barcode / Item on a blank line; Qty, Rate, Disc % on a line. */
export function isEnterStop(line: PoLine, column: number): boolean {
  const has = rowHasItem(line);
  if (column === COL.Barcode || column === COL.Item) {
    return !has;
  }
  return has && (column === COL.Qty || column === COL.Rate || column === COL.DiscPct);
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

const PATTERNS: Partial<Record<number, RegExp>> = {
  [COL.Qty]: /^\d*(\.\d{0,3})?$/,
  [COL.Free]: /^\d*(\.\d{0,3})?$/,
  [COL.Rate]: /^\d*(\.\d{0,4})?$/,
  [COL.DiscPct]: /^\d*(\.\d{0,2})?$/,
  [COL.Mrp]: /^\d*(\.\d{0,2})?$/,
};

export function cellPattern(column: number): RegExp {
  return PATTERNS[column] ?? /^.*$/;
}

const FIELD: Partial<Record<number, "qty" | "free" | "rate" | "discPct" | "mrp">> = {
  [COL.Qty]: "qty",
  [COL.Free]: "free",
  [COL.Rate]: "rate",
  [COL.DiscPct]: "discPct",
  [COL.Mrp]: "mrp",
};

/** Qt `onCellEdited`: a typed number lands on the line and the figures are asked for again. */
export function editLine(draft: PoDraft, key: string, column: number, raw: string): PoDraft {
  const field = FIELD[column];
  if (!field || !isEditable(draft)) {
    return draft;
  }
  const value = raw.replace(/,/g, "").trim();
  if (!cellPattern(column).test(value)) {
    return draft;
  }
  let changed = false;
  const lines = draft.lines.map((line) => {
    if (line.key !== key || !rowHasItem(line) || line[field] === value) {
      return line;
    }
    changed = true;
    return { ...line, [field]: value };
  });
  if (!changed) {
    return draft;
  }
  // MRP is not in the server's arithmetic; everything else is.
  const recalc = field !== "mrp";
  return { ...draft, lines, dirty: true, calcVersion: recalc ? draft.calcVersion + 1 : draft.calcVersion };
}

/** Qt `fetchItem` answer: the item, its unit, GST % and MRP land on the line. */
export function applyItem(draft: PoDraft, key: string, lookup: PurchaseOrderItemLookup, pickedName: string): PoDraft {
  const index = draft.lines.findIndex((line) => line.key === key);
  if (index < 0 || !isEditable(draft)) {
    return draft;
  }
  const current = draft.lines[index];
  const mrp = num(lookup.mrp);
  const next: PoLine = {
    ...current,
    itemId: text(lookup.itemId),
    itemName: pickedName.trim() || text(lookup.itemName),
    uomId: text(lookup.uomId),
    unitName: text(lookup.unitName),
    gstPct: num(lookup.taxPerc),
    mrp: mrp > 0 ? qtyText(mrp) : current.mrp,
    taxable: null,
    tax: null,
    total: null,
  };
  const lines = draft.lines.map((line, i) => (i === index ? next : line));
  return { ...draft, lines: withTrailingBlank(lines), hint: "", dirty: true, calcVersion: draft.calcVersion + 1 };
}

/** Qt `lineRemoveRequested` — a line with an item goes; the blank one stays. */
export function removeLine(draft: PoDraft, key: string): PoDraft {
  if (!isEditable(draft)) {
    return draft;
  }
  const line = draft.lines.find((candidate) => candidate.key === key);
  if (!line || !rowHasItem(line)) {
    return draft;
  }
  const lines = withTrailingBlank(draft.lines.filter((candidate) => candidate.key !== key));
  // No line left to figure: the server is not asked, so the old totals would stand.
  const totals = lines.some(rowHasItem) ? draft.totals : null;
  return { ...draft, lines, totals, dirty: true, calcVersion: draft.calcVersion + 1 };
}

// ---------------------------------------------------------------------------
// Payload and the server's figures
// ---------------------------------------------------------------------------

export type BuiltPayload = {
  body: SavePurchaseOrderDto;
  /** lineNo → the line's key, so an answer is painted on the line it was asked for. */
  keysByLineNo: Map<number, string>;
};

/** Qt `buildPayload`: the header, and every line with an item, numbered from 1. */
export function buildPayload(draft: PoDraft, post: boolean): BuiltPayload {
  const keysByLineNo = new Map<number, string>();
  const lines = itemLines(draft).map((line, index) => {
    const lineNo = index + 1;
    keysByLineNo.set(lineNo, line.key);
    const free = num(line.free);
    const disc = num(line.discPct);
    const mrp = num(line.mrp);
    return {
      lineNo,
      itemId: line.itemId,
      uomId: line.uomId,
      qty: num(line.qty),
      ...(free > 0 ? { freeQty: free } : {}),
      rate: num(line.rate),
      ...(disc > 0 ? { discPct: disc } : {}),
      ...(mrp > 0 ? { mrp } : {}),
    };
  });
  const contact = draft.contact.trim();
  const remarks = draft.remarks.trim();
  return {
    body: {
      header: {
        ...(draft.poId ? { poId: draft.poId } : {}),
        companyId: draft.companyId,
        branchId: draft.branchId,
        accYear: draft.accYear,
        deviceId: draft.deviceId,
        supplierId: draft.supplierId,
        docDate: draft.docDate,
        ...(draft.expectedDate ? { expectedDate: draft.expectedDate } : {}),
        ...(draft.godownId ? { godownId: draft.godownId } : {}),
        ...(contact ? { contact } : {}),
        ...(remarks ? { remarks } : {}),
        post,
      },
      lines,
    },
    keysByLineNo,
  };
}

/** Is there anything to ask the server to figure? (Qt `recalcNow`'s guards.) */
export function canCalculate(draft: PoDraft): boolean {
  return draft.supplierId !== "" && draft.status === "DRAFT" && itemLines(draft).length > 0 && draft.deviceId !== "";
}

/** Qt `paintCalc` — the server's line figures and totals, on the lines they were asked for. */
export function applyCalc(draft: PoDraft, calc: PurchaseOrderCalc, keysByLineNo: ReadonlyMap<number, string>): PoDraft {
  const byKey = new Map<string, PurchaseOrderCalc["lines"][number]>();
  for (const row of calc.lines ?? []) {
    const key = keysByLineNo.get(Number.parseInt(text(row.key), 10));
    if (key) {
      byKey.set(key, row);
    }
  }
  const lines = draft.lines.map((line) => {
    const row = byKey.get(line.key);
    return row ? { ...line, taxable: num(row.taxable), gstPct: num(row.gstPct), tax: num(row.tax), total: num(row.total) } : line;
  });
  const totals = calc.totals
    ? { taxable: num(calc.totals.taxable), tax: num(calc.totals.tax), net: num(calc.totals.net) }
    : draft.totals;
  return { ...draft, lines, totals, hint: "" };
}

/** What stops a save before it is sent (Qt `saveDocument`, plus a qty on every line). */
export function saveProblem(draft: PoDraft): { title: string; message: string; focus: "supplier" | { key: string } } | null {
  if (!draft.supplierId) {
    return { title: "Header incomplete", message: "Pick the supplier.", focus: "supplier" };
  }
  const lines = itemLines(draft);
  if (lines.length === 0) {
    const first = draft.lines[draft.lines.length - 1];
    return { title: "No lines", message: "Add at least one item.", focus: { key: first?.key ?? "" } };
  }
  const numbers = lineNumbers(draft);
  const noQty = lines.find((line) => num(line.qty) <= 0);
  if (noQty) {
    return {
      title: "Qty missing",
      message: `Line ${numbers.get(noQty.key) ?? ""} (${noQty.itemName}): key the qty to order.`,
      focus: { key: noQty.key },
    };
  }
  return null;
}

/** Worth keeping in screen memory: unsaved keying on a draft. */
export function isPoWorthRemembering(draft: PoDraft): boolean {
  return draft.dirty && draft.status === "DRAFT" && draft.viewMode === "entry";
}

/** The new / opened PO's title line (Qt `applyStatus`). */
export function titleLine(draft: Pick<PoDraft, "refno">): string {
  return draft.refno ? `Purchase Order — ${draft.refno}` : "Purchase Order — new";
}
