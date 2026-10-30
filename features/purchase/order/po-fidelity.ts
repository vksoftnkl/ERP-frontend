/**
 * Purchase Order (menu 23) — the 2026-10-29 fidelity rebuild's pure side (Qt
 * `PurchaseOrderEntry` rebuilt to share/purchase/purchase_order_ui_mockup.png):
 * the title / pill, the Approval and Revision boxes, the six-cell totals strip,
 * the estimated charges (CHG-07), the Status chips, per-line short close and the
 * reorder suggestions (F7). Server keys verified on :3011 (validate / get).
 */
import { isoToDisplayDate } from "@/lib/date-format";
import type { PurchasePillTone } from "../shared/purchase-parts";
import type { PurchaseStripCell } from "../shared/components/purchase-parts";
import { money, num, qtyText, text } from "../shared/purchase.format";
import type { PoChargeLine, PoDraft, PoLine, PurchaseOrderChargeRow, PurchaseOrderLineRow } from "./purchase-order.types";

// ---------------------------------------------------------------------------
// Title, pill, Approval, Revision
// ---------------------------------------------------------------------------

/** "Purchase Order — PO/…/00005 · rev 2" (Qt applyStatus). */
export function poTitle(draft: Pick<PoDraft, "refno" | "revisionNo">): string {
  return draft.refno ? `Purchase Order — ${draft.refno}  · rev ${Math.max(1, draft.revisionNo)}` : "Purchase Order — new";
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

/** "2 — qty raised on line 4" (Qt m_txtRevision). */
export function revisionText(draft: Pick<PoDraft, "poId" | "revisionNo" | "lastAmendReason">): string {
  if (!draft.poId) return "";
  const rev = String(Math.max(1, draft.revisionNo));
  return draft.lastAmendReason ? `${rev} — ${draft.lastAmendReason}` : rev;
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
    },
    { key: "poTotal", caption: "PO total (incl. est. charges)", value: has("poTotal") ? money(num(t.poTotal)) : "", strong: true },
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

let chargeSeq = 0;
export function nextChargeKey(): string {
  chargeSeq += 1;
  return `poc-${chargeSeq}`;
}

/** A stored charge (Qt applyLoaded: the saved estimate stands as typed). */
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

/** A charge picked from the master (Qt fillChargeRow from /charges/get). */
export function chargeFromMaster(master: {
  chgId: string;
  chgName: string;
  chgMethod?: string | null;
  chgType?: string | null;
  chgOnBill?: boolean | null;
  chgDefaultRate?: unknown;
}): PoChargeLine {
  return {
    key: nextChargeKey(),
    chgId: master.chgId,
    name: master.chgName,
    onBill: master.chgOnBill !== false,
    method: text(master.chgMethod),
    type: text(master.chgType),
    rate: qtyText(num(master.chgDefaultRate)),
    amount: "",
    typed: false,
  };
}

/** Qt `chargesPayload`: a typed amount (abs) wins over the rate. */
export function chargesDto(charges: readonly PoChargeLine[] | undefined): { chgId: string; rate?: number; amount?: number }[] {
  return (charges ?? [])
    .filter((c) => c.chgId)
    .map((c) => (c.typed && c.amount !== "" ? { chgId: c.chgId, amount: Math.abs(num(c.amount)) } : { chgId: c.chgId, rate: num(c.rate) }));
}

/** Qt `paintCalc`: the estimate per charge in the order sent (signed); the rate unless the amount was typed. */
export function applyChargeCalc(charges: readonly PoChargeLine[] | undefined, out: readonly PurchaseOrderChargeRow[] | undefined): PoChargeLine[] {
  const rows = out ?? [];
  let at = 0;
  return (charges ?? []).map((c) => {
    if (!c.chgId) return c;
    const o = rows[at++];
    if (!o) return c;
    return { ...c, amount: num(o.signedAmount ?? o.amount).toFixed(2), rate: c.typed ? c.rate : qtyText(num(o.rate)) };
  });
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
