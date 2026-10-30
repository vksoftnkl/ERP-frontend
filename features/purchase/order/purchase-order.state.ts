/**
 * Purchase Order — the screen's rules, pure (Qt `PurchaseOrderEntry`, NexERP
 * fc46bde). Every money figure on screen is the SERVER's: an edit clears
 * nothing, it bumps `calcVersion`, and the view asks /purchase/orders/validate
 * for the figures once typing pauses; a stale answer is dropped.
 *
 * Confirm writes no stock and no books — it opens the PO for GRNs and bills.
 * A confirmed (POSTED) PO is read-only until it is AMENDED (Qt 6c6b5c2, DOC-01):
 * its lines keep their ids, Save amendment confirms it again as revision + 1,
 * and the server refuses a line below what came or an item changed once goods
 * came. It is otherwise short-closed or cancelled.
 */
import { applyChargeCalc, chargeFromRow, chargesDto, lineExtrasOf, poTitle } from "./po-fidelity";
import { num, qtyText, text } from "@/features/purchase/shared/purchase.format";
import { COL } from "./purchase-order.constants";
import type {
  PoChargeLine,
  PoDraft,
  PoLine,
  PoScope,
  PoStatus,
  PurchaseOrderCalc,
  PurchaseOrderItemLookup,
  PurchaseOrderPayload,
  PurchaseOrderPendingLine,
  PurchaseOrderRevision,
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
    approvedBy: "",
    revisionNo: 0,
    amending: false,
    lines: [blankLine()],
    totals: null,
    hint: "",
    dirty: false,
    viewMode: "entry",
    calcVersion: 0,
    ...PO_EXTRAS_DEFAULTS,
  };
}

/** The rebuild's draft fields, blank (a remembered draft from before them gets these too). */
export const PO_EXTRAS_DEFAULTS = {
  agentId: "",
  agentName: "",
  creditDays: "",
  creditTyped: false,
  creditNote: "",
  termsId: "",
  termsLabel: "",
  termsText: "",
  lastAmendReason: "",
  docStatus: "DRAFT",
  charges: [] as PoChargeLine[],
  serverTotals: null as Record<string, unknown> | null,
};

export function withPoDefaults(draft: PoDraft): PoDraft {
  return Array.isArray(draft.charges) ? draft : { ...PO_EXTRAS_DEFAULTS, ...draft, charges: [] };
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
      received: received > 0 || asStatus(h.poStatus) === "POSTED" ? received : null,
      pending: num(l.pendingQty),
      ...lineExtrasOf(l, asStatus(h.poStatus) === "POSTED"),
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
    // /get names the godown (deliverGodownName) since the rebuild; else keep the name the screen had.
    godownName: text(h.deliverGodownName) || (godownId && godownId === previous.godownId ? previous.godownName : ""),
    contact: text(h.poContact),
    remarks: text(h.poRemarks),
    shortClosed: h.poIsShortClosed === true,
    shortCloseReason: text(h.poShortCloseReason),
    approvalStatus: text(h.poApprovalStatus).toUpperCase() || "NOT_REQUIRED",
    approvedBy: text(h.approvedBy),
    revisionNo: Math.max(1, Math.trunc(num(h.revisionNo ?? h.poRevisionNo, 1))),
    amending: false,
    // A draft keeps a blank line to key into; a confirmed PO shows only its lines.
    lines: status === "DRAFT" ? withTrailingBlank(lines) : lines.length > 0 ? lines : [blankLine()],
    totals: { taxable: num(h.poTaxableAmt), tax: num(h.poTaxAmt), net: num(h.poNetAmt) },
    hint: "",
    dirty: false,
    viewMode: status === "DRAFT" ? viewMode : "browse",
    calcVersion: 0,
    agentId: text(h.poAgentId),
    agentName: text(h.agentName),
    creditDays: typeof h.poCreditDays === "number" ? String(h.poCreditDays) : "",
    creditTyped: true, // the saved figure stands
    creditNote: "",
    termsId: text(h.poTermsId),
    termsLabel: text(h.termsName) || text(h.poTermsText),
    termsText: text(h.poTermsText),
    lastAmendReason: text(h.lastAmendReason),
    docStatus: text(h.docStatus).toUpperCase() || status,
    charges: (payload.charges ?? []).map(chargeFromRow),
    serverTotals: payload.totals ?? null,
  };
}

// ---------------------------------------------------------------------------
// What may be done
// ---------------------------------------------------------------------------

type EditableView = Pick<PoDraft, "status" | "viewMode"> & { amending?: boolean };

/** Open for keying: a DRAFT in entry mode, or a confirmed PO being amended. */
export function isEditable(draft: EditableView): boolean {
  return (draft.status === "DRAFT" && draft.viewMode === "entry") || (draft.status === "POSTED" && draft.amending === true);
}

/** Goods came against a line — the PO cannot be cancelled any more. */
export function hasReceipts(draft: Pick<PoDraft, "lines">): boolean {
  return draft.lines.some((line) => (line.received ?? 0) > 0);
}

/** Qt `applyStatus`: Cancel — saved, not cancelled, nothing received, not mid-amendment. */
export function cancellable(draft: Pick<PoDraft, "poId" | "status" | "lines"> & { amending?: boolean }): boolean {
  return draft.poId !== "" && draft.status !== "CANCELLED" && !hasReceipts(draft) && draft.amending !== true;
}

/** Qt `applyStatus`: Short-close — confirmed, not closed yet, not mid-amendment. */
export function shortClosable(draft: Pick<PoDraft, "status" | "shortClosed"> & { amending?: boolean }): boolean {
  return draft.status === "POSTED" && !draft.shortClosed && draft.amending !== true;
}

/** The PO is waiting for approval (purchase.po_approval_above) — Approve / Not approve… show. */
export function awaitingApproval(draft: Pick<PoDraft, "status" | "approvalStatus" | "amending">): boolean {
  return draft.status === "POSTED" && draft.approvalStatus === "AWAITING" && !draft.amending;
}

/**
 * The status pill (Qt `applyStatus`): a POSTED order reads CONFIRMED (or
 * SHORT-CLOSED), with " · AWAITING APPROVAL" / " · NOT APPROVED"; an
 * amendment in progress reads AMENDING.
 */
export function statusLabel(
  draft: Pick<PoDraft, "status" | "shortClosed"> & { approvalStatus?: string; amending?: boolean },
): string {
  if (draft.amending && draft.status === "POSTED") {
    return "AMENDING";
  }
  if (draft.status === "POSTED") {
    const base = draft.shortClosed ? "SHORT-CLOSED" : "CONFIRMED";
    if (draft.approvalStatus === "AWAITING") {
      return `${base} · AWAITING APPROVAL`;
    }
    if (draft.approvalStatus === "REJECTED") {
      return `${base} · NOT APPROVED`;
    }
    return base;
  }
  return draft.status;
}

// ---------------------------------------------------------------------------
// DOC-01 — amend
// ---------------------------------------------------------------------------

/** Why a PO cannot be opened for amendment ("" = it can). Qt `beginAmend`. */
export function amendProblem(draft: Pick<PoDraft, "poId" | "status" | "shortClosed" | "amending">): string {
  if (draft.amending) {
    return "";
  }
  if (!draft.poId || draft.status !== "POSTED" || draft.shortClosed) {
    return "Only a confirmed order that is not short-closed is amended.";
  }
  return "";
}

/**
 * Qt `beginAmend`: the confirmed PO opens for change — a blank line to key
 * into, the lines keeping their ids — and the hint says what the server holds
 * it to.
 */
export function startAmend(draft: PoDraft): PoDraft {
  if (draft.amending || amendProblem(draft)) {
    return draft;
  }
  const hint = hasReceipts(draft)
    ? `Amending ${draft.refno} — goods came on it: a line can't go below what came, nor change its item.`
    : `Amending ${draft.refno} — change what you need, then Save amendment (Ctrl+Enter).`;
  return { ...draft, amending: true, viewMode: "entry", lines: withTrailingBlank(draft.lines), hint };
}

/** Qt `applyStatus`: the supplier is changed on a draft, or on an amendment nothing has come against. */
export function supplierEditable(draft: PoDraft): boolean {
  if (!isEditable(draft)) {
    return false;
  }
  return !draft.amending || !hasReceipts(draft);
}

/** Why a line may not be removed ("" = it may): goods came against it on an amendment (the server's rule). */
export function whyNotRemovable(draft: Pick<PoDraft, "amending" | "lines">, line: PoLine): string {
  if (draft.amending && (line.received ?? 0) > 0) {
    const n = lineNumbers(draft).get(line.key);
    return `Line ${n ?? ""}: goods came against it — it cannot be removed (short-close it instead).`;
  }
  return "";
}

/** The totals line's tail (Qt `applyLoaded`): " · Revision n" from 2 on, " · Approved by X". */
export function totalsNotes(draft: Pick<PoDraft, "revisionNo" | "approvalStatus" | "approvedBy">): string[] {
  const notes: string[] = [];
  if (draft.revisionNo > 1) {
    notes.push(`Revision ${draft.revisionNo}`);
  }
  if (draft.approvalStatus === "APPROVED" && draft.approvedBy) {
    notes.push(`Approved by ${draft.approvedBy}`);
  }
  if (draft.approvalStatus === "REJECTED" && draft.approvedBy) {
    notes.push(`Not approved by ${draft.approvedBy}`);
  }
  return notes;
}

// ---------------------------------------------------------------------------
// DOC-01 — the supplier's pending POs (new-PO note, Merge…)
// ---------------------------------------------------------------------------

export type MergeChoice = {
  /** `poId|accYear`. */
  key: string;
  poId: string;
  accYear: string;
  /** "PO/…/00107 · 27/10/2026 — 2 lines pending". */
  label: string;
  lines: number;
};

function ddmmyyyy(iso: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(iso));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** One entry per PO, in the server's order (oldest first) — Qt `PurchaseOrderMergeDialog`. */
export function mergeChoices(rows: readonly PurchaseOrderPendingLine[]): MergeChoice[] {
  const byKey = new Map<string, MergeChoice>();
  for (const row of rows) {
    const poId = text(row.poId);
    const accYear = text(row.accYear);
    if (!poId) {
      continue;
    }
    const key = `${poId}|${accYear}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.lines += 1;
      continue;
    }
    byKey.set(key, { key, poId, accYear, label: "", lines: 1 });
    const choice = byKey.get(key)!;
    const date = ddmmyyyy(row.docDate);
    choice.label = date ? `${text(row.refno)} · ${date}` : text(row.refno);
  }
  return [...byKey.values()].map((choice) => ({
    ...choice,
    label: `${choice.label} — ${choice.lines} ${choice.lines === 1 ? "line" : "lines"} pending`,
  }));
}

/** Qt `loadSupplierPending(offer)`: what a NEW PO says about the supplier's pending orders ("" = none). */
export function pendingNote(rows: readonly PurchaseOrderPendingLine[]): string {
  const orders = new Set(rows.map((row) => text(row.poId)).filter(Boolean)).size;
  if (orders === 0) {
    return "";
  }
  return orders === 1
    ? "This supplier still has 1 confirmed order pending — open it from the list, or key a new one."
    : `This supplier still has ${orders} confirmed orders pending — Merge… combines them into one.`;
}

/** Qt `mergeOrders` enable rule: a supplier, not amending, and a NEW draft or a confirmed PO. */
export function mergeable(draft: Pick<PoDraft, "supplierId" | "amending" | "status" | "poId">): boolean {
  if (!draft.supplierId || draft.amending) {
    return false;
  }
  return draft.status === "DRAFT" ? draft.poId === "" : draft.status === "POSTED";
}

// ---------------------------------------------------------------------------
// DOC-01 — versions
// ---------------------------------------------------------------------------

export type RevisionRow = {
  revNo: number;
  /** ISO timestamp as the server sent it (the view formats it). */
  savedOn: string;
  by: string;
  what: string;
  lines: number;
  value: number;
};

/** Qt `PurchaseOrderRevisionsDialog`: the value and lines the PO had AFTER each save. */
export function revisionRows(revisions: readonly PurchaseOrderRevision[]): RevisionRow[] {
  return revisions.map((revision) => {
    const after = revision.after ?? null;
    return {
      revNo: Math.trunc(num(revision.revNo)),
      savedOn: text(revision.savedOn),
      by: text(revision.savedBy),
      what: text(revision.notes),
      lines: Array.isArray(after?.lines) ? after.lines.length : 0,
      value: num(after?.header?.poNetAmt),
    };
  });
}

/** Why a cell will not open on a line, or "" when it opens. */
export function whyNotEditable(draft: EditableView, line: PoLine, column: number): string {
  if (!isEditable(draft)) {
    if (draft.status === "DRAFT") {
      return "Read only — F2 edits the draft.";
    }
    return draft.status === "POSTED" ? "This order is confirmed — Amend (F2) changes it." : "This order is cancelled.";
  }
  const has = rowHasItem(line);
  if (column === COL.Barcode || column === COL.Item) {
    return has ? "The item is chosen — remove the line (−) and key it again to change it." : "";
  }
  if (column === COL.Qty || column === COL.Free || column === COL.Rate || column === COL.DiscPct || column === COL.SchPct || column === COL.Mrp) {
    return has ? "" : "Pick the item first.";
  }
  if (column === COL.Recd || column === COL.Pending || column === COL.ShortClosed || column === COL.Status) {
    return "Comes from the GRNs and bills against this order.";
  }
  if (column === COL.LastRate || column === COL.Stock || column === COL.Reorder) {
    return "Shown for the item: its last purchase, stock on hand and reorder policy.";
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
  [COL.SchPct]: /^\d*(\.\d{0,2})?$/,
};

export function cellPattern(column: number): RegExp {
  return PATTERNS[column] ?? /^.*$/;
}

const FIELD: Partial<Record<number, "qty" | "free" | "rate" | "discPct" | "mrp" | "schPct">> = {
  [COL.SchPct]: "schPct",
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
    lastRate: "",
    lastRateTip: "",
    stock: "",
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
  const refused = whyNotRemovable(draft, line);
  if (refused) {
    return { ...draft, hint: refused };
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

/**
 * Qt `buildPayload`: the header, and every line with an item, numbered from 1.
 * A stored line carries its id (an amendment keeps it). An amendment is a
 * confirm again (`post: true`) with its reason.
 */
export function buildPayload(draft: PoDraft, post: boolean, amendReason = ""): BuiltPayload {
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
      ...(num(line.schPct) > 0 ? { schPct: num(line.schPct) } : {}),
      ...(mrp > 0 ? { mrp } : {}),
      ...(line.lineId ? { lineId: line.lineId } : {}),
    };
  });
  const creditDays = (draft.creditDays ?? "").trim();
  const charges = chargesDto(draft.charges);
  const contact = draft.contact.trim();
  const remarks = draft.remarks.trim();
  const reason = draft.amending ? amendReason.trim() : "";
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
        ...(/^\d+$/.test(creditDays) ? { creditDays: Number(creditDays) } : {}),
        // Qt: an agent is sent when picked; omitted = no agent
        ...(draft.agentId ? { agentId: draft.agentId } : {}),
        ...(contact ? { contact } : {}),
        // the terms master row (dropdown 73): its text is the server's; else the PO's own typed copy (Qt termsText)
        ...(draft.termsId ? { termsId: draft.termsId } : { ...(draft.poId ? { termsId: null } : {}), ...((draft.termsText ?? "").trim() ? { termsText: (draft.termsText ?? "").trim() } : {}) }),
        ...(remarks ? { remarks } : {}),
        post: post || draft.amending,
        ...(reason ? { amendReason: reason } : {}),
      },
      lines,
      // a save replaces the set (Qt: sent when any, or on a stored PO)
      ...(charges.length > 0 || draft.poId ? { charges } : {}),
    },
    keysByLineNo,
  };
}

/** Is there anything to ask the server to figure? (Qt `recalcNow`'s guards.) */
export function canCalculate(draft: PoDraft): boolean {
  const open = draft.status === "DRAFT" || (draft.status === "POSTED" && draft.amending);
  return draft.supplierId !== "" && open && itemLines(draft).length > 0 && draft.deviceId !== "";
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
  const agent = calc.header?.agentId && calc.header?.agentName && calc.header.agentId === draft.agentId ? text(calc.header.agentName) : draft.agentName;
  return {
    ...draft,
    lines,
    totals,
    hint: "",
    charges: applyChargeCalc(draft.charges, calc.charges),
    serverTotals: calc.totals ? { ...calc.totals } : (draft.serverTotals ?? null),
    agentName: agent,
  };
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

/** Worth keeping in screen memory: unsaved keying on a draft or an amendment. */
export function isPoWorthRemembering(draft: PoDraft): boolean {
  return draft.dirty && isEditable(draft);
}

/** The new / opened PO's title line (Qt `applyStatus`). */
export function titleLine(draft: Pick<PoDraft, "refno"> & Partial<Pick<PoDraft, "revisionNo">>): string {
  return poTitle({ refno: draft.refno, revisionNo: draft.revisionNo ?? 1 });
}
