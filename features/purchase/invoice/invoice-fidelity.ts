/**
 * Purchase Entry (menu 24) — the 2026-10-29 fidelity rebuild's pure side (Qt
 * `PurchaseInvoiceEntry` rebuilt to share/purchase/purchase_invoice_ui_mockup.png):
 * the header's new fields and what the server works out of them, the WARN /
 * REFUSE rows, the boxed TOTALS, the Check column's chips, Source and Bill from.
 * Server keys verified live on :3011 (validate / get) 2026-10-29.
 */
import { isoToDisplayDate } from "@/lib/date-format";
import type { PurchaseIssue, PurchasePillTone, PurchaseTransportBand } from "../shared/purchase-parts";
import { transportFormOf, transportBandOf } from "../shared/purchase-parts";
import { money } from "../shared/purchase.format";

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const isoDay = (value: unknown) => text(value).slice(0, 10);

// ---------------------------------------------------------------------------
// The header's new fields
// ---------------------------------------------------------------------------

export type InvoiceHeaderExt = {
  /** ISO; "" = the server's (the GRN's / the entry date) until typed. */
  goodsReceivedOn: string;
  goodsTyped: boolean;
  /** CREDIT (CASH is not built — user 10-28; Qt greys it). */
  mode: "CREDIT" | "CASH";
  creditDays: string;
  /** Typed (or the bill's own): the supplier's default no longer fills it. */
  creditDaysTyped: boolean;
  irn: string;
  ackNo: string;
  agentId: string;
  agentName: string;
  billFromGstin: string;
  transport: PurchaseTransportBand | null;
  /** The band was edited — sent (an object, or null = remove); else left out = keep. */
  transportTouched: boolean;
};

/** What the server works out of the header (validate `data.header` / get header). */
export type InvoiceHeaderFacts = {
  interState: boolean;
  posStcd: string;
  posStateName: string;
  isReverseCharge: boolean;
  reverseChargeReason: string;
  /** ISO. */
  dueDate: string;
  msmeDueDate: string;
  /** The server's goods-received date (shown until one is typed). */
  goodsReceivedOn: string;
};

export type InvoiceIssues = { warnings: PurchaseIssue[]; refusals: PurchaseIssue[] };

/** The server's totals object, every figure as it sent it. */
export type InvoiceServerTotals = Record<string, unknown>;

export const EMPTY_HEADER_EXT: InvoiceHeaderExt = {
  goodsReceivedOn: "",
  goodsTyped: false,
  mode: "CREDIT",
  creditDays: "",
  creditDaysTyped: false,
  irn: "",
  ackNo: "",
  agentId: "",
  agentName: "",
  billFromGstin: "",
  transport: null,
  transportTouched: false,
};

export const EMPTY_FACTS: InvoiceHeaderFacts = {
  interState: false,
  posStcd: "",
  posStateName: "",
  isReverseCharge: false,
  reverseChargeReason: "",
  dueDate: "",
  msmeDueDate: "",
  goodsReceivedOn: "",
};

export const EMPTY_ISSUES: InvoiceIssues = { warnings: [], refusals: [] };

/** The header keys the rebuild adds to /save and /validate (Qt `buildPayload`). */
export type HeaderExtDto = {
  goodsReceivedOn?: string;
  mode?: string;
  creditDays?: number;
  irn?: string;
  ackNo?: string;
  agentId?: string | null;
  billFromGstin?: string | null;
  transport?: Record<string, unknown> | null;
};

export function headerExtDto(ext: InvoiceHeaderExt | undefined): HeaderExtDto {
  const e = ext ?? EMPTY_HEADER_EXT;
  const out: HeaderExtDto = {};
  if (e.goodsTyped && /^\d{4}-\d{2}-\d{2}$/.test(e.goodsReceivedOn)) out.goodsReceivedOn = e.goodsReceivedOn;
  out.mode = e.mode || "CREDIT";
  const days = e.creditDays.trim();
  if (/^\d+$/.test(days)) out.creditDays = Number(days);
  if (e.irn.trim()) out.irn = e.irn.trim();
  if (e.ackNo.trim()) out.ackNo = e.ackNo.trim();
  out.agentId = e.agentId || null; // omit / null = no agent
  if (e.billFromGstin) out.billFromGstin = e.billFromGstin;
  if (e.transportTouched) out.transport = e.transport ? { ...e.transport } : null;
  return out;
}

/** Qt `applyLoaded` for the new fields. Vehicle / driver ride in the band (stored on pur_invoice). */
export function headerExtFromHeader(h: Record<string, unknown>): InvoiceHeaderExt {
  const band = h.transport && typeof h.transport === "object" ? (h.transport as Record<string, unknown>) : null;
  const vehicle = text(h.piVehicleNo);
  const driver = text(h.piDriverName);
  const transport = band || vehicle || driver ? transportBandOf({ ...transportFormOf(band), vehicleNo: vehicle, driverName: driver }) : null;
  const goods = isoDay(h.piGoodsReceivedOn);
  const days = h.piCreditDays;
  return {
    goodsReceivedOn: goods,
    goodsTyped: Boolean(goods),
    mode: text(h.piMode).toUpperCase() === "CASH" ? "CASH" : "CREDIT",
    creditDays: days === null || days === undefined || days === "" ? "" : String(days),
    creditDaysTyped: !(days === null || days === undefined || days === ""),
    irn: text(h.piIrn),
    ackNo: text(h.piAckNo),
    agentId: text(h.piAgentId),
    agentName: text(h.agentName),
    billFromGstin: text(h.billFromGstin) || text(h.piSupplierGstin),
    transport,
    transportTouched: false,
  };
}

/** validate `data.header` (+ `data.interState`) or a stored bill's header → the facts. */
export function factsOf(h: Record<string, unknown> | null | undefined, interState?: unknown): InvoiceHeaderFacts {
  if (!h) return EMPTY_FACTS;
  const rcm = "isReverseCharge" in h ? Boolean(h.isReverseCharge) : Boolean(h.piIsReverseCharge);
  return {
    interState: interState !== undefined ? Boolean(interState) : Boolean(h.interState),
    posStcd: text(h.posStcd) || text(h.piPosStcd) || text(h.billFromStateCode),
    posStateName: text(h.posStateName),
    isReverseCharge: rcm,
    reverseChargeReason: text(h.reverseChargeReason),
    dueDate: isoDay(text(h.creditDueDate) || text(h.dueDate) || text(h.piDueDate)),
    msmeDueDate: isoDay(text(h.msmeDueDate) || text(h.piMsmeDueDate)),
    goodsReceivedOn: isoDay(h.goodsReceivedOn ?? h.piGoodsReceivedOn),
  };
}

/** "Tamil Nadu (33) · local" (Qt `paintHeaderFacts`); the state name falls back to the bill-from's. */
export function placeOfSupplyText(facts: InvoiceHeaderFacts, billFrom: readonly BillFromOption[], billFromGstin: string): string {
  if (!facts.posStcd) return "";
  let name = facts.posStateName;
  if (!name && !facts.interState) {
    name = billFrom.find((b) => b.gstin === billFromGstin)?.stateName ?? billFrom.find((b) => b.stateCode === facts.posStcd)?.stateName ?? "";
  }
  return `${name || "State"} (${facts.posStcd}) · ${facts.interState ? "inter-state" : "local"}`;
}

/** "No — regular supplier" / "Yes — unregistered supplier". */
export function reverseChargeText(facts: InvoiceHeaderFacts): string {
  const yes = facts.isReverseCharge ? "Yes" : "No";
  return facts.reverseChargeReason ? `${yes} — ${facts.reverseChargeReason}` : facts.posStcd ? yes : "";
}

/** "→ due 27/11/2026". */
export function dueText(facts: InvoiceHeaderFacts): string {
  return facts.dueDate ? `→ due ${isoToDisplayDate(facts.dueDate)}` : "";
}

// ---------------------------------------------------------------------------
// Bill from (supplier-context billFrom[])
// ---------------------------------------------------------------------------

export type BillFromOption = { gstin: string; stateCode: string; stateName: string; label: string; addr: string; isDefault: boolean };

export function billFromOptions(context: unknown): BillFromOption[] {
  const list = context && typeof context === "object" ? (context as { billFrom?: unknown }).billFrom : null;
  const rows = Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
  return rows.map((b) => {
    const gstin = text(b.gstin);
    const where = text(b.place) || text(b.stateName);
    return {
      gstin,
      stateCode: text(b.stateCode),
      stateName: text(b.stateName),
      label: `${gstin || "no GSTIN"} · ${where}`,
      addr: text(b.addr),
      isDefault: Boolean(b.isDefault),
    };
  });
}

/** Qt `fillBillFrom`: the one already chosen, else the default, else the first. */
export function pickBillFrom(options: readonly BillFromOption[], current: string): string {
  if (current && options.some((o) => o.gstin === current)) return current;
  return (options.find((o) => o.isDefault) ?? options[0])?.gstin ?? "";
}

// ---------------------------------------------------------------------------
// Source (header row 2)
// ---------------------------------------------------------------------------

type SourceLineFacts = { itemId: string; grnItemId?: string; poItemId?: string; sisterSaleItemId?: string; srcRefno?: string };

/** Qt `sourceText`. */
export function sourceText(lines: readonly SourceLineFacts[]): string {
  const grns: string[] = [];
  const pos: string[] = [];
  const sister: string[] = [];
  const add = (list: string[], ref: string) => {
    if (!list.includes(ref)) list.push(ref);
  };
  for (const line of lines) {
    if (!line.itemId) continue;
    const ref = line.srcRefno ?? "";
    if (line.grnItemId) add(grns, ref);
    else if (line.poItemId) add(pos, ref);
    else if (line.sisterSaleItemId) add(sister, ref);
  }
  if (sister.length) return `Sister company bill ${sister.join(", ")}`;
  if (grns.length) return `From GRN ${grns.join(", ")}`;
  if (pos.length) return `From PO ${pos.join(", ")} — goods came with the bill`;
  return "Direct — goods came with the bill";
}

// ---------------------------------------------------------------------------
// The Check column (callout 9) — lines[].check
// ---------------------------------------------------------------------------

export type InvoiceLineCheck = {
  rate?: { basis?: string; diffPct?: unknown; over?: boolean } | null;
  newMrp?: { mrp?: unknown } | null;
  priceKept?: boolean;
  serials?: { have?: unknown; need?: unknown } | null;
  shortQty?: unknown;
};

export type CheckChip = { text: string; tone: PurchasePillTone };

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** Qt `checkChips`: REJECTED n · SHORT n · RATE ±x% PO / LAST · NEW MRP n · PRICE KEPT · n / n SN, else OK. */
export function checkChips(shortQty: number, rejectedQty: number, check: InvoiceLineCheck | null | undefined, priceKept: boolean): CheckChip[] {
  const chips: CheckChip[] = [];
  if (rejectedQty > 0) chips.push({ text: `REJECTED ${qty(rejectedQty)}`, tone: "warning" });
  if (shortQty > 0) chips.push({ text: `SHORT ${qty(shortQty)}`, tone: "danger" });
  const rate = check?.rate;
  if (rate && rate.over) {
    const pct = num(rate.diffPct);
    chips.push({ text: `RATE ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% ${text(rate.basis)}`, tone: "warning" });
  }
  const mrp = check?.newMrp;
  if (mrp && text(mrp.mrp)) {
    const shown = text(mrp.mrp)
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .map((m) => {
        const v = Number(m);
        return Number.isInteger(v) ? String(v) : v.toFixed(2);
      });
    chips.push({ text: `NEW MRP ${shown.join(", ")}`, tone: "info" });
  }
  if (priceKept || check?.priceKept) chips.push({ text: "PRICE KEPT", tone: "neutral" });
  const sn = check?.serials;
  if (sn) {
    const have = Math.trunc(num(sn.have));
    const need = num(sn.need);
    chips.push({ text: `${have} / ${qty(need)} SN`, tone: have === need ? "success" : "danger" });
  }
  if (chips.length === 0) chips.push({ text: "OK", tone: "success" });
  return chips;
}

/** "Line 5: Price not updated — …" under the item strip (Qt `paintPriceKept`). "" = none. */
export function priceKeptText(lineNos: readonly number[]): string {
  if (lineNos.length === 0) return "";
  return `${lineNos.length === 1 ? "Line" : "Lines"} ${lineNos.join(", ")}: Price not updated — the selling price was changed later (a newer price change). This bill keeps its own price as history.`;
}

// ---------------------------------------------------------------------------
// The boxed TOTALS (callout 15) — Qt `PurchaseTotalsPanel::setTotals`
// ---------------------------------------------------------------------------

export type TotalsRow = {
  key: string;
  caption: string;
  value: string;
  tone?: "good" | "warn" | "bad" | "muted";
  strong?: boolean;
  ruleBefore?: boolean;
  /** The Supplier TCS row: the screen puts its input there. */
  tcsInput?: boolean;
};

export function totalsRows(t: InvoiceServerTotals | null | undefined, interState: boolean): TotalsRow[] {
  const has = Boolean(t && Object.keys(t).length > 0);
  const v = (key: string) => (has ? money(num(t?.[key])) : "");
  const cgst = num(t?.cgst);
  const igst = num(t?.igst);
  const gst = t && "gstTotal" in t ? num(t.gstTotal) : cgst + num(t?.sgst) + igst + num(t?.cess);
  const diff = num(t?.difference);
  const matches = t && "amountMatches" in t ? Boolean(t.amountMatches) : Math.abs(diff) < 0.005;
  const cash = t?.cashTender && typeof t.cashTender === "object" ? (t.cashTender as Record<string, unknown>) : null;
  return [
    { key: "taxable", caption: "Taxable", value: v("taxable") },
    { key: "gst", caption: interState || (igst > 0 && cgst <= 0) ? "GST (IGST)" : "GST (CGST + SGST)", value: has ? money(gst) : "" },
    { key: "chargesOnBill", caption: "Charges on bill", value: v("chargesOnBill") },
    { key: "tcs", caption: "Supplier TCS (if charged)", value: "", tcsInput: true },
    { key: "roundOff", caption: "Round off", value: v("roundOff"), tone: "muted" },
    { key: "netPayable", caption: "Net payable", value: v("netPayable"), strong: true },
    { key: "invoiceAmountPrinted", caption: "Invoice amount (printed)", value: v("invoiceAmountPrinted") },
    {
      key: "difference",
      caption: "Difference",
      value: has ? `${money(diff)}${matches ? " ✓" : ""}` : "",
      tone: has ? (matches ? "good" : "bad") : undefined,
      strong: true,
    },
    { key: "offbillCharges", caption: "Off-bill (cost only, owed to loadmen)", value: v("offbillCharges"), tone: "warn", ruleBefore: true },
    { key: "shortValue", caption: "Short qty parked (receivable)", value: v("shortValue"), tone: "bad" },
    {
      key: "gstOnShort",
      caption: "GST on short qty — not claimed yet",
      value: has ? money(t && "gstOnShort" in t ? num(t.gstOnShort) : num(t?.itcPending)) : "",
      tone: "bad",
    },
    { key: "cashTender", caption: "Cash mode: tender strip (Cash / UPI / Bank)", value: cash ? money(num(cash.amount)) : "", tone: "muted" },
  ];
}

/** A stored bill without a `totals` object (older server): the header's figures in the same keys. */
export function totalsFromStoredHeader(h: Record<string, unknown>): InvoiceServerTotals {
  const printed = num(h.piInvoiceAmountPrinted);
  const net = num(h.piNetPayable);
  const diff = Math.round((printed - net) * 100) / 100;
  return {
    taxable: h.piTaxableAmt,
    cgst: h.piCgstAmt,
    sgst: h.piSgstAmt,
    igst: h.piIgstAmt,
    cess: h.piCessAmt,
    chargesOnBill: h.piChargesOnBill,
    tcs: h.piTcsAmt,
    roundOff: h.piRoundOff,
    netPayable: net,
    invoiceAmountPrinted: printed,
    difference: diff,
    amountMatches: Math.abs(diff) < 0.005,
    offbillCharges: h.piOffbillCharges,
    shortValue: h.piShortValue,
    itcPending: h.piItcPendingAmt,
  };
}

/** A 422's `errors[]` (or a thrown RTK error) → refusals for the strip. */
export function refusalsOfError(error: unknown): PurchaseIssue[] {
  const data = (error as { data?: unknown })?.data as Record<string, unknown> | undefined;
  const list = (data?.errors ?? (data?.data as Record<string, unknown> | undefined)?.refusals) as unknown;
  if (!Array.isArray(list)) return [];
  return list
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      code: text(row.code),
      level: text(row.level) || "REFUSE",
      lineNo: typeof row.lineNo === "number" ? row.lineNo : null,
      field: text(row.field),
      message: text(row.message),
      needsRight: text(row.needsRight) || null,
    }));
}
