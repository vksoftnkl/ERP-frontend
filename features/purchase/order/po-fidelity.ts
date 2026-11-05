/**
 * Purchase Order (menu 23) — the 2026-10-29 fidelity rebuild's pure side (Qt
 * `PurchaseOrderEntry` rebuilt to share/purchase/purchase_order_ui_mockup.png):
 * the title / pill, the Approval and Revision boxes, the six-cell totals strip,
 * the estimated charges (CHG-07), the Status chips, per-line short close and the
 * reorder suggestions (F7). Server keys verified on :3011 (validate / get).
 */
import { formatDateTime, isoToDisplayDate } from "@/lib/date-format";
import type { PurchasePillTone } from "../shared/purchase-parts";
import type { PurchaseStripCell } from "../shared/components/purchase-parts";
import { money, num, qtyText, text } from "../shared/purchase.format";
import { paintServerCharges } from "./po-landing";
import type { PoChargeLine, PoDraft, PoLine, PurchaseOrderChargeRow, PurchaseOrderLineRow } from "./purchase-order.types";

// ---------------------------------------------------------------------------
// Title, pill, Approval, Revision
// ---------------------------------------------------------------------------

/**
 * "Purchase Order — PO/…/00005 · rev 2" (Qt applyStatus, eee7936): the
 * mockup's title, " · rev n" only once the order has been amended (rev > 1).
 */
export function poTitle(draft: Pick<PoDraft, "refno" | "revisionNo">): string {
  if (!draft.refno) return "Purchase Order — new";
  return draft.revisionNo > 1 ? `Purchase Order — ${draft.refno} · rev ${draft.revisionNo}` : `Purchase Order — ${draft.refno}`;
}

/** The pill: the server's docStatus (AMENDING while amending; DRAFT / CANCELLED as stored). */
export function poPillStatus(draft: Pick<PoDraft, "status" | "docStatus" | "amending">): string {
  if (draft.amending) return "AMENDING";
  if (draft.status === "DRAFT" || draft.status === "CANCELLED" || !draft.docStatus) return draft.status;
  return draft.docStatus;
}

export function poPillTone(status: string): PurchasePillTone | undefined {
  switch (status) {
    case "CONFIRMED":
    case "PART_RECEIVED":
      return "info";
    case "RECEIVED":
      return "success";
    case "CLOSED":
      return "neutral";
    case "AWAITING_APPROVAL":
    case "AMENDING":
      return "warning";
    case "NOT_APPROVED":
      return "danger";
    default:
      return undefined;
  }
}

/** Qt `approvalText` — `approvalAbove` < 0 = the setting is not known yet. */
export function approvalText(draft: Pick<PoDraft, "approvalStatus" | "approvedBy">, approvalAbove: number): string {
  const limit = approvalAbove < 0 ? "" : money(approvalAbove);
  const state = draft.approvalStatus || "NOT_REQUIRED";
  if (state === "AWAITING") return limit ? `Waiting — above ${limit}` : "Waiting for approval";
  if (state === "APPROVED") return draft.approvedBy ? `Approved by ${draft.approvedBy}` : "Approved";
  if (state === "REJECTED") return "Not approved";
  if (approvalAbove === 0) return "Off (setting 0)";
  return limit ? `Not needed (limit ${limit})` : "Not needed";
}

/**
 * The pill beside the status pill (Qt e782e59 `approvalPillText`): APPROVAL OFF /
 * APPROVAL NOT NEEDED / AWAITING APPROVAL / APPROVED / NOT APPROVED; the detail
 * (`approvalText`) is its tooltip. `approvalAbove` < 0 = the setting is not known yet.
 */
export function approvalPill(
  draft: Pick<PoDraft, "approvalStatus" | "approvedBy">,
  approvalAbove: number,
): { text: string; tone: PurchasePillTone; tip: string } {
  const tip = approvalText(draft, approvalAbove);
  switch (draft.approvalStatus) {
    case "AWAITING":
      return { text: "AWAITING APPROVAL", tone: "warning", tip };
    case "APPROVED":
      return { text: "APPROVED", tone: "success", tip };
    case "REJECTED":
      return { text: "NOT APPROVED", tone: "danger", tip };
    default:
      return { text: approvalAbove === 0 ? "APPROVAL OFF" : "APPROVAL NOT NEEDED", tone: "neutral", tip };
  }
}

/** "REV 2" beside the status pill once the order is saved (Qt applyStatus); a click (or F4) opens the versions. */
export function revisionPill(draft: Pick<PoDraft, "poId" | "revisionNo" | "lastAmendReason">): { text: string; tip: string } | null {
  if (!draft.poId) return null;
  const rev = Math.max(1, draft.revisionNo);
  return {
    text: `REV ${rev}`,
    tip: draft.lastAmendReason
      ? `Revision ${rev} — ${draft.lastAmendReason}\nClick (or F4) for the versions`
      : `Revision ${rev} — click (or F4) for the versions`,
  };
}

/**
 * Qt `paintAudit`: created and modified in ONE line — "created VKPOS · 04/11/2026
 * 03:27 PM   ·   modified 04/11/2026 03:28 PM". The server sends the user's id; the
 * name is the signed-in user's when it is theirs (no name lookup), else the time alone.
 */
export function auditText(
  draft: Pick<PoDraft, "createdBy" | "createdOn" | "modifiedBy" | "modifiedOn">,
  me: { userId: string | null | undefined; userName: string | null | undefined },
): string {
  const part = (caption: string, by: string | undefined, on: string | undefined) => {
    const stamp = formatDateTime(on ?? "");
    if (!stamp) return "";
    const mine = !!by && !!me.userId && by.toLowerCase() === me.userId.toLowerCase() && !!me.userName;
    return `${caption} ${mine ? `${me.userName} · ` : ""}${stamp}`;
  };
  return [part("created", draft.createdBy, draft.createdOn), part("modified", draft.modifiedBy, draft.modifiedOn)]
    .filter(Boolean)
    .join("   ·   ");
}

// ---------------------------------------------------------------------------
// The quick icon strip under the title (Qt e782e59 frameQuick + applyStatus)
// ---------------------------------------------------------------------------

export type PoQuickKey = "reorder" | "cloneMerge" | "shortClose" | "send" | "makeGrn" | "makeInvoice" | "versions" | "history" | "print";

export type PoQuickRule = { label: string; tip: string; keyHint?: string; disabled: boolean; disabledReason: string };

export type PoQuickInput = {
  poId: string;
  status: string;
  amending: boolean;
  shortClosed: boolean;
  supplierId: string;
  approvalStatus: string;
  /** Open for keying (a draft in entry mode, or an amendment). */
  editable: boolean;
  /** A confirmed line still waits for goods. */
  hasPending: boolean;
  /** An action is running: every button waits. */
  working: boolean;
  /** The server judges short-close on the menu's EDIT right. */
  mayShortClose: boolean;
};

const FEEDS_REASON = "a posted order with something pending (and approved, when it needs approval)";

/**
 * Each quick button's state as Qt `applyStatus` sets it: what it says, its key,
 * and — while it can't be used — why not (the tooltip, and the hint a click on
 * it leaves).
 */
export function poQuickRules(q: PoQuickInput): Record<PoQuickKey, PoQuickRule> {
  const saved = q.poId !== "";
  const posted = q.status === "POSTED";
  const feeds = posted && !q.amending && q.hasPending && q.approvalStatus !== "AWAITING" && q.approvalStatus !== "REJECTED";
  const rule = (label: string, tip: string, keyHint: string | undefined, why: string): PoQuickRule => {
    const reason = q.working ? "wait — the last action is still running" : why;
    return { label, tip, keyHint, disabled: reason !== "", disabledReason: reason };
  };
  return {
    reorder: rule(
      "Reorder suggestions",
      "Reorder suggestions — items at or below their reorder level become lines",
      "F7",
      q.editable ? "" : "they fill a draft (or an order being amended) — start a new one (Alt+N)",
    ),
    cloneMerge: rule(
      "Clone / merge pending",
      "Clone this order, or merge the supplier's pending orders into one new draft",
      undefined,
      q.amending ? "not while amending — save or stop the amendment first" : saved || q.supplierId ? "" : "pick the supplier (merge) or open a saved order (clone)",
    ),
    shortClose: rule(
      "Short close",
      "Short close… — stop waiting for the rest, per line or the whole order",
      undefined,
      !posted || q.shortClosed || q.amending || !q.hasPending
        ? "only a confirmed order with something pending is short closed"
        : q.mayShortClose
          ? ""
          : "your rights do not let you short-close (Edit on menu 23)",
    ),
    send: rule(
      "Send PDF / WhatsApp",
      "Send the order — PDF or WhatsApp to the supplier",
      undefined,
      !saved ? "save the order first, then send it" : q.status === "CANCELLED" ? "a cancelled order is not sent" : "",
    ),
    makeGrn: rule("Make GRN", "Make GRN — goods came: a GRN opens with this order's pending lines", "Ctrl+G", feeds ? "" : `${FEEDS_REASON} makes a GRN`),
    makeInvoice: rule(
      "Make Purchase Invoice",
      "Make Purchase Invoice — the supplier's bill against this order's pending lines (opens Purchase Entry)",
      undefined,
      feeds ? "" : FEEDS_REASON,
    ),
    versions: rule("Versions", "Versions — every saved version of this order", "F4", saved ? "" : "save the order first — a new one has no versions yet"),
    history: rule("History", "History — the status trail of this order", "Ctrl+H", saved ? "" : "save the order first — a new one has no history yet"),
    print: rule("Print", "Print the order", "Ctrl+P", saved ? "" : "save the order first, then print it"),
  };
}

// ---------------------------------------------------------------------------
// The totals strip (Qt paintTotals)
// ---------------------------------------------------------------------------

export function poStripCells(totals: Record<string, unknown> | null | undefined, status: string, taxAmount: number): PurchaseStripCell[] {
  const t = totals ?? {};
  const has = (key: string) => key in t && t[key] !== null && t[key] !== undefined;
  const saved = has("receivedValue");
  const counts = saved && status === "POSTED";
  const lines = Math.trunc(num(t.lines));
  const shortLines = Math.trunc(num(t.shortClosedLines));
  const charges = num(t.chargesEstimate);
  // Qt paintTotals: how the PO total is made up; the server's split once /validate sent it (bcd844a)
  let totalTip = `Lines ${money(num(t.orderedValue))} + estimated charges ${money(charges)}`;
  if (has("offbill")) {
    totalTip +=
      `\nlines = taxable + GST, with the before-tax charges ${money(num(t.chrgBeforeTax))} inside` +
      `\ncharges = after tax ${money(num(t.chrgAfterTax))} + their GST ${money(num(t.chargeTax))} + our own (off the bill) ${money(num(t.offbill))}`;
  }
  return [
    { key: "lines", caption: "Lines", value: lines > 0 ? String(lines) : "" },
    { key: "ordered", caption: `Ordered value (incl. tax ${money(taxAmount)})`, value: has("orderedValue") ? money(num(t.orderedValue)) : "" },
    { key: "received", caption: "Received value", value: counts ? money(num(t.receivedValue)) : "", tone: "good" },
    { key: "pending", caption: "Pending value", value: counts ? money(num(t.pendingValue)) : "", tone: "warn" },
    {
      key: "shortClosed",
      caption: "Short-closed",
      value: counts ? (shortLines === 0 ? "none" : shortLines === 1 ? "1 line" : `${shortLines} lines`) : "",
      tone: shortLines > 0 ? undefined : "muted",
      title: shortLines > 0 ? `Value short-closed ${money(num(t.shortClosedValue))}` : undefined,
    },
    {
      key: "poTotal",
      caption: "PO total (incl. est. charges)",
      value: has("poTotal") ? money(num(t.poTotal)) : "",
      strong: true,
      title: totalTip,
    },
  ];
}

// ---------------------------------------------------------------------------
// Lines: the rebuild's columns
// ---------------------------------------------------------------------------

/** The extra fields of a stored line (Qt applyLoaded). */
export function lineExtrasOf(row: PurchaseOrderLineRow, posted: boolean): Partial<PoLine> {
  const shortQ = num(row.poiShortClosedQty);
  const sch = num(row.poiSchPct);
  const lastRefno = text(row.lastRateRefno);
  const level = row.reorderLevel;
  return {
    schPct: sch > 0 ? qtyText(sch) : "",
    shortClosedQty: shortQ > 0 ? shortQ : null,
    lastRate: text(row.lastRate),
    lastRateTip: lastRefno ? `${lastRefno} · ${isoToDisplayDate(text(row.lastRateDate).slice(0, 10))}` : "",
    stock: row.stockQty === null || row.stockQty === undefined ? "" : qtyText(num(row.stockQty)),
    reorder: row.reorderQty === null || row.reorderQty === undefined ? "" : qtyText(num(row.reorderQty)),
    reorderTip:
      level === null || level === undefined ? "" : `Reorder level ${qtyText(num(level))} · reorder qty ${qtyText(num(row.reorderQty))}`,
    lineStatus: posted ? text(row.lineStatus).toUpperCase() : "",
  };
}

/** The Status chip (Qt cols.chips): DONE green, PART orange, SHORT CLOSED grey; OPEN none. */
export function lineStatusChip(line: Pick<PoLine, "lineStatus">): { text: string; tone: PurchasePillTone } | null {
  switch (line.lineStatus) {
    case "DONE":
      return { text: "DONE", tone: "success" };
    case "PART":
      return { text: "PART", tone: "warning" };
    case "SHORT_CLOSED":
      return { text: "SHORT CLOSED", tone: "neutral" };
    default:
      return null;
  }
}

/** Pending's tone on a stored line (Qt cols.tone): 0 green, > 0 orange, short closed grey. */
export function pendingTone(line: PoLine, status: string): "good" | "warn" | "muted" | null {
  if (!line.lineId || status === "DRAFT" || line.pending === null) return null;
  if (line.lineStatus === "SHORT_CLOSED") return "muted";
  return line.pending > 0 ? "warn" : "good";
}

// ---------------------------------------------------------------------------
// Estimated charges (CHG-07)
// ---------------------------------------------------------------------------

const BASIS: Record<string, string> = {
  FIXED: "Fixed",
  PERCENT: "% of value",
  QTY: "Per qty",
  NET_QTY: "Per net qty",
  KG: "Per kg",
  QTL: "Per quintal",
  TON: "Per ton",
};

/** Qt `chargeBasis`. */
export function chargeBasis(method: string, onBill: boolean, type: string): string {
  let t = BASIS[method.toUpperCase()] ?? method;
  if (!onBill) t += " · our cost";
  return type.toUpperCase() === "DEDUCT" ? `Less: ${t}` : t;
}

/** Qt `chargeNature` (bcd844a) — the Basis cell's tooltip: how the charge lands on the lines ("" until the flags are known). */
export function chargeNature(charge: Pick<PoChargeLine, "onBill" | "beforeTax" | "landing" | "flagsKnown">): string {
  if (!charge.flagsKnown) return "";
  let s = !charge.onBill
    ? "Our own cost, not on the supplier's bill: no GST; each line's share is in its landing cost."
    : charge.beforeTax
      ? "Before tax: each line's share joins its Taxable, so GST is charged on it (Chrg before tax)."
      : "After tax: each line's share is added to its Amount (Chrg after tax).";
  if (charge.onBill && charge.landing === false) s += "\nNot a landing cost (charge master): left out of the landing cost.";
  return s;
}

let chargeSeq = 0;
export function nextChargeKey(): string {
  chargeSeq += 1;
  return `poc-${Date.now().toString(36)}-${chargeSeq}`;
}

/**
 * A stored charge (Qt applyLoaded). Whether its amount was typed is decided
 * on the loaded lines (`chargesTypedOnLoad`); its flags come with the open's
 * /validate.
 */
export function chargeFromRow(row: PurchaseOrderChargeRow): PoChargeLine {
  return {
    key: nextChargeKey(),
    chgId: text(row.chgId),
    name: text(row.chgName),
    onBill: row.onBill !== false,
    method: text(row.method),
    type: text(row.type),
    rate: qtyText(num(row.rate)),
    amount: row.signedAmount === undefined && row.amount === undefined ? "" : num(row.signedAmount ?? row.amount).toFixed(2),
    typed: true,
  };
}

/**
 * A charge picked from the master (Qt fillChargeRow from /charges/get) — with
 * its flags as the server reads the master (purchaseChargeInput): only an
 * on-bill charge is before tax, and an off-bill one is always a landing cost.
 */
export function chargeFromMaster(master: {
  chgId: string;
  chgName: string;
  chgMethod?: string | null;
  chgType?: string | null;
  chgOnBill?: boolean | null;
  chgBeforeTax?: boolean | null;
  chgLandingCost?: boolean | null;
  chgDefaultRate?: unknown;
}): PoChargeLine {
  const onBill = master.chgOnBill !== false;
  return {
    key: nextChargeKey(),
    chgId: master.chgId,
    name: master.chgName,
    onBill,
    method: text(master.chgMethod),
    type: text(master.chgType),
    rate: qtyText(num(master.chgDefaultRate)),
    amount: "",
    typed: false,
    beforeTax: onBill && master.chgBeforeTax === true,
    landing: !onBill || master.chgLandingCost !== false,
    flagsKnown: true,
  };
}

/** Qt `chargesPayload`: a typed amount (abs) wins over the rate. */
export function chargesDto(charges: readonly PoChargeLine[] | undefined): { chgId: string; rate?: number; amount?: number }[] {
  return (charges ?? [])
    .filter((c) => c.chgId)
    .map((c) => (c.typed && c.amount !== "" ? { chgId: c.chgId, amount: Math.abs(num(c.amount)) } : { chgId: c.chgId, rate: num(c.rate) }));
}

/**
 * Qt `paintCalc` → `paintServerCharges(…, amounts)`: the estimate per charge in
 * the order sent (signed), the rate unless the amount was typed, the master's
 * flags and the row's own GST.
 */
export function applyChargeCalc(charges: readonly PoChargeLine[] | undefined, out: readonly PurchaseOrderChargeRow[] | undefined): PoChargeLine[] {
  return paintServerCharges(charges, out, true);
}

// ---------------------------------------------------------------------------
// Short close… (per line or the whole PO)
// ---------------------------------------------------------------------------

export type ShortCloseLine = { lineId: string; item: string; unit: string; ordered: number; received: number; pending: number };

/** The lines that can be closed: stored, with something pending (Qt openShortClose). */
export function shortCloseLines(draft: Pick<PoDraft, "lines">): ShortCloseLine[] {
  return draft.lines
    .filter((line) => line.itemId && line.lineId && (line.pending ?? 0) > 0)
    .map((line) => ({
      lineId: line.lineId,
      item: line.itemName,
      unit: line.unitName,
      ordered: num(line.qty),
      received: line.received ?? 0,
      pending: line.pending ?? 0,
    }));
}

/** Every line ticked = the whole PO (no lineIds); else the ticked ids. */
export function shortCloseLineIds(all: readonly ShortCloseLine[], ticked: ReadonlySet<string>): string[] | null {
  const ids = all.filter((l) => ticked.has(l.lineId)).map((l) => l.lineId);
  if (ids.length === 0) return null;
  return ids.length === all.length ? [] : ids;
}

// ---------------------------------------------------------------------------
// Reorder suggestions (F7)
// ---------------------------------------------------------------------------

export type ReorderSuggestion = {
  itemId: string;
  itemName: string;
  uomId: string;
  unitName: string;
  suggestedQty: number;
  reorderQty: number;
  reorderLevel: number;
  onHand: number;
  rate: number;
};

export function suggestionsOf(rows: unknown, haveItemIds: ReadonlySet<string>): ReorderSuggestion[] {
  const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  return list
    .map((o) => ({
      itemId: text(o.itemId),
      itemName: text(o.itemName),
      uomId: text(o.uomId),
      unitName: text(o.unitName),
      suggestedQty: num(o.suggestedQty),
      reorderQty: num(o.reorderQty),
      reorderLevel: num(o.reorderLevel),
      onHand: num(o.onHand),
      rate: num(o.rate),
    }))
    .filter((o) => o.itemId && !haveItemIds.has(o.itemId));
}

/** "Surf Excel — order 48 PCS · on hand 6 · level 10 · rate 114.35". */
export function suggestionText(s: ReorderSuggestion): string {
  let out = `${s.itemName} — order ${qtyText(s.suggestedQty)} ${s.unitName} · on hand ${qtyText(s.onHand)} · level ${qtyText(s.reorderLevel)}`;
  if (s.rate > 0) out += ` · rate ${money(s.rate)}`;
  return out;
}
