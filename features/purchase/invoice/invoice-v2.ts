/**
 * Purchase Entry (menu 24) v2 screen — the pure rules behind the Qt NexERP
 * 7d8c926 layout (W1b, the 11-04 mockup) and its follow-ups 6b81080 / a639bc6:
 *
 *  - the 17-button quick bar's order, groups and enable rules (Qt `applyStatus`);
 *  - the created / modified line over the status pill (Qt `paintAudit`);
 *  - the totals frame beside the charges (Qt `paintTotals` / `clearTotals`);
 *  - the "leave it?" question every way off an unsaved bill asks (PE-15);
 *  - the bill just saved, kept for Print once the screen has cleared (D7, COM-10).
 *
 * No React, no network: invoice-v2.test.ts covers it.
 */
import { formatDateTime } from "@/lib/date-format";
import { money } from "../shared/purchase.format";
import type { InvoiceServerTotals } from "./invoice-fidelity";

// ---------------------------------------------------------------------------
// PE-15 — one question, every way off an unsaved bill
// ---------------------------------------------------------------------------

export const LEAVE_TITLE = "Unsaved changes";
export const LEAVE_MESSAGE = "This bill has changes that are not saved. Leave it?";

// ---------------------------------------------------------------------------
// D7 / COM-10 — the bill just saved
// ---------------------------------------------------------------------------

/** What the screen keeps of a saved bill once it has cleared itself (Qt `m_lastSaved`). */
export type InvoiceSavedKey = {
  id: string;
  companyId: string;
  branchId: string;
  accYear: string;
  refno: string;
  status: string;
};

/** Qt `saveDocument`'s `saved`: the answer's header, the session's scope where it says nothing. */
export function savedKeyOf(
  header: { piId?: unknown; piAccYear?: unknown; piRefno?: unknown; piStatus?: unknown; piCompanyId?: unknown; piBranchId?: unknown } | null | undefined,
  scope: { companyId: string; branchId: string; accYear: string },
): InvoiceSavedKey | null {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value));
  const id = text(header?.piId);
  if (!id) {
    return null;
  }
  return {
    id,
    companyId: text(header?.piCompanyId) || scope.companyId,
    branchId: text(header?.piBranchId) || scope.branchId,
    accYear: text(header?.piAccYear) || scope.accYear,
    refno: text(header?.piRefno),
    status: text(header?.piStatus).toUpperCase(),
  };
}

/** COM-10: Ctrl+P / Print on the cleared screen. */
export function printLastSavedQuestion(saved: Pick<InvoiceSavedKey, "refno">): string {
  return `Print ${saved.refno || "the purchase invoice just saved"} (just saved)?`;
}

// ---------------------------------------------------------------------------
// PE-27 — "Created VKPOS 04/11/2026 10:12 AM · Modified …" (Qt paintAudit)
// ---------------------------------------------------------------------------

export type InvoiceAuditStamps = {
  createdBy?: string;
  createdOn?: string;
  createdByName?: string;
  modifiedBy?: string;
  modifiedOn?: string;
  modifiedByName?: string;
};

/**
 * The name is the server's `createdByName` / `modifiedByName`; until it sends
 * them, the signed-in user's own name when the id is theirs, else the time
 * alone. A bill never changed after it was entered shows one stamp. 12-hour.
 */
export function invoiceAuditParts(stamps: InvoiceAuditStamps, me: { userId?: string | null; userName?: string | null }): string[] {
  const part = (caption: string, name: string | undefined, byId: string | undefined, on: string | undefined) => {
    const stamp = formatDateTime(on ?? "");
    if (!stamp) {
      return "";
    }
    let who = (name ?? "").trim();
    if (!who && byId && me.userId && byId.toLowerCase() === me.userId.toLowerCase()) {
      who = (me.userName ?? "").trim();
    }
    return `${caption} ${who ? `${who} ` : ""}${stamp}`;
  };
  const parts = [part("Created", stamps.createdByName, stamps.createdBy, stamps.createdOn)];
  if ((stamps.modifiedOn ?? "") !== (stamps.createdOn ?? "")) {
    parts.push(part("Modified", stamps.modifiedByName, stamps.modifiedBy, stamps.modifiedOn));
  }
  return parts.filter(Boolean);
}

// ---------------------------------------------------------------------------
// COM-11 — the quick bar (Qt frameQuick + applyStatus)
// ---------------------------------------------------------------------------

export type InvoiceQuickKey =
  | "fromSource"
  | "sister"
  | "pickHeld"
  | "batches"
  | "lastPurchases"
  | "ledger"
  | "supplierDues"
  | "pay"
  | "returnBill"
  | "returnLines"
  | "transport"
  | "attach"
  | "gstBreakup"
  | "previous"
  | "next"
  | "history"
  | "print";

/** The .ui's hboxQuick, left to right; a spacer between the groups. */
export const INVOICE_QUICK_GROUPS: readonly (readonly InvoiceQuickKey[])[] = [
  ["fromSource", "sister", "pickHeld"],
  ["batches", "lastPurchases"],
  ["ledger", "supplierDues", "pay"],
  ["returnBill", "returnLines"],
  ["transport", "attach", "gstBreakup", "previous", "next", "history", "print"],
];

export type InvoiceQuickInput = {
  status: string;
  /** The bill has an id (saved at least once). */
  saved: boolean;
  /** A draft open for keying (web: not the read-only opening of a stored draft). */
  editable: boolean;
  supplierId: string;
  /** May start a new bill (Pick held clears the screen). */
  mayStartNew: boolean;
  /** A bill saved since the screen last cleared (D7): Print offers it. */
  lastSavedRef: string | null;
  /** An action is running: every button waits. */
  working: boolean;
};

export type InvoiceQuickRule = { label: string; tip: string; keyHint?: string; disabled: boolean; disabledReason: string };

/** Last purchases runs grid 199, which this database has not registered yet (COM-04). */
export const LAST_PURCHASES_REASON = "not available yet — it needs grid 199 (the item's earlier bills), which this database has not registered";

/**
 * Each quick button as Qt `applyStatus` (7d8c926) sets it: lines come in on a
 * draft; the party's buttons once a supplier is picked; return / pay follow a
 * posted bill; a cancelled bill keeps History, Print and Prev / Next; Attach on
 * a saved bill; Last purchases stays off (grid 199). Ledger is on with a
 * supplier: the web's Ledger Statement takes its ledger from the URL (Qt keeps
 * it off at 339d5e7 until its helper is wired).
 */
export function invoiceQuickRules(q: InvoiceQuickInput): Record<InvoiceQuickKey, InvoiceQuickRule> {
  const draft = q.status === "DRAFT";
  const posted = q.status === "POSTED";
  const cancelled = q.status === "CANCELLED";
  const party = q.supplierId !== "";
  const rule = (label: string, tip: string, keyHint: string | undefined, why: string): InvoiceQuickRule => {
    const reason = q.working ? "wait — the last action is still running" : why;
    return { label, tip, keyHint, disabled: reason !== "", disabledReason: reason };
  };
  const draftOnly = !draft
    ? "only a draft takes lines"
    : q.editable
      ? ""
      : "the draft is open read-only — Edit (F2) first";
  const postedOnly = posted ? "" : "for a posted bill — post or open one first";
  const savedOnly = (what: string) => (q.saved ? "" : `save the bill first — a new one has no ${what} yet`);
  return {
    fromSource: rule("From GRN / PO", "From GRN / PO — bring in a GRN waiting for a bill or an open PO", "Ctrl+L", draftOnly),
    sister: rule("Sister bill", "Sister company bill — a sister company's sale bill becomes this bill", undefined, draftOnly),
    pickHeld: rule(
      "Pick held",
      "Pick a held bill — bring back a bill parked with Hold",
      "F10",
      !draft ? "only on a draft screen" : q.mayStartNew ? "" : "your rights do not let you start a bill",
    ),
    batches: rule("Batches", "Batches / serials — the current line's batches or serials", "F12", cancelled ? "the bill is cancelled" : ""),
    lastPurchases: rule("Last purchases", "Last purchases — the current line's item as it was bought before", undefined, LAST_PURCHASES_REASON),
    ledger: rule("Ledger", "Ledger — the supplier's ledger report", undefined, party ? "" : "pick the supplier first"),
    supplierDues: rule(
      "Supplier dues",
      "Supplier dues — claims, debit notes and replacements the supplier owes",
      undefined,
      !party ? "pick the supplier first" : cancelled ? "the bill is cancelled" : "",
    ),
    pay: rule("Pay bill-wise", "Pay this bill — Payment for this posted bill's supplier", "Ctrl+F8", postedOnly),
    returnBill: rule("Return bill", "Return from bill — Purchase Return against this posted bill", "Ctrl+F11", postedOnly),
    returnLines: rule("Return lines", "Return lines — Purchase Return of the selected lines of this posted bill (today: the whole bill)", undefined, postedOnly),
    transport: rule("Transport", "Transport — LR, transporter, vehicle and driver", "Alt+T", cancelled ? "the bill is cancelled" : ""),
    attach: rule(
      "Attach",
      "Attach — files kept with this bill",
      "Ctrl+A",
      cancelled ? "the bill is cancelled" : q.saved ? "" : "save the bill first — files are kept with a saved bill",
    ),
    gstBreakup: rule("GST break-up", "GST break-up — the bill's taxable and GST by rate", undefined, cancelled ? "the bill is cancelled" : ""),
    previous: rule("Previous", "Previous — the bill before this one", "Alt+PgUp", savedOnly("neighbours")),
    next: rule("Next", "Next — the bill after this one", "Alt+PgDn", savedOnly("neighbours")),
    history: rule("History", "History — the bill's status trail", "Ctrl+H", savedOnly("history")),
    print: rule(
      "Print",
      "Print — this bill, or the one just saved",
      "Ctrl+P",
      q.saved || q.lastSavedRef ? "" : "save the bill first, then print it",
    ),
  };
}

// ---------------------------------------------------------------------------
// §5.4 (PE-35) — the totals frame (Qt paintTotals / clearTotals)
// ---------------------------------------------------------------------------

export type TotalsFrameTone = "good" | "warn" | "bad" | "muted";

export type TotalsFrameCell = { key: string; caption: string; value: string; tone?: TotalsFrameTone };

export type TotalsFrame = {
  /** "₹ 27,804.00", or "—" before any figure. */
  net: string;
  printed: string;
  /** The Difference pill, or null (no figures). */
  difference: { text: string; tone: "good" | "bad" } | null;
  /** The break-up's left column: Taxable, CGST (or IGST), SGST (local only), Cess. */
  left: TotalsFrameCell[];
  /** Its right column: Charges on bill, TCS (the screen's input), Round off. */
  right: TotalsFrameCell[];
  /** ITC pills: eligible · pending (short) · not claimable. */
  itc: { key: string; text: string; tone: "good" | "warn" | "bad" }[];
  /** Muted: "our own costs 60.00 · short parked 900.00". */
  ownCosts: string;
};

function n(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Every figure is the server's (/validate totals, /get totals) or the lines'
 * estimate while an edit waits for it. The GST rows add up to the server's
 * GST: the lines' CGST / SGST (or IGST) plus the charges' own GST, halved for
 * a local bill. An empty `t` = no figures yet (every value "—").
 */
export function totalsFrameOf(t: InvoiceServerTotals | null | undefined, interState: boolean): TotalsFrame {
  const has = Boolean(t && Object.keys(t).length > 0);
  if (!has || !t) {
    return {
      net: "—",
      printed: "—",
      difference: null,
      left: [
        { key: "taxable", caption: "Taxable", value: "—" },
        { key: "cgst", caption: "CGST", value: "—" },
        { key: "sgst", caption: "SGST", value: "—" },
        { key: "cess", caption: "Cess", value: "—" },
      ],
      right: [
        { key: "chargesOnBill", caption: "Charges on bill", value: "—" },
        { key: "tcs", caption: "TCS", value: "" },
        { key: "roundOff", caption: "Round off", value: "—" },
      ],
      itc: [],
      ownCosts: "",
    };
  }
  const diff = n(t.difference);
  const matches = "amountMatches" in t ? Boolean(t.amountMatches) : Math.abs(diff) < 0.005;
  const chargeTax = n(t.chargeTax);
  const igst = interState || (n(t.igst) > 0 && n(t.cgst) <= 0);
  const half = Math.round(chargeTax * 50) / 100;
  const left: TotalsFrameCell[] = [{ key: "taxable", caption: "Taxable", value: money(n(t.taxable)) }];
  if (igst) {
    left.push({ key: "cgst", caption: "IGST", value: money(n(t.igst) + chargeTax) });
  } else {
    left.push({ key: "cgst", caption: "CGST", value: money(n(t.cgst) + half) });
    left.push({ key: "sgst", caption: "SGST", value: money(n(t.sgst) + chargeTax - half) });
  }
  left.push({ key: "cess", caption: "Cess", value: money(n(t.cess)) });
  const pending = "itcPending" in t ? n(t.itcPending) : n(t.gstOnShort);
  const lost = n(t.itcIneligible);
  const itc: TotalsFrame["itc"] = [];
  if ("itcEligible" in t) itc.push({ key: "eligible", text: `ITC  eligible ${money(n(t.itcEligible))}`, tone: "good" });
  if (pending > 0.005) itc.push({ key: "pending", text: `pending ${money(pending)} (short)`, tone: "warn" });
  if (lost > 0.005) itc.push({ key: "lost", text: `not claimable ${money(lost)}`, tone: "bad" });
  const muted: string[] = [];
  if (n(t.offbillCharges) > 0.005) muted.push(`our own costs ${money(n(t.offbillCharges))}`);
  if (n(t.shortValue) > 0.005) muted.push(`short parked ${money(n(t.shortValue))}`);
  return {
    net: `₹ ${money(n(t.netPayable))}`,
    printed: money(n(t.invoiceAmountPrinted)),
    difference: { text: `Difference  ${money(diff)} ${matches ? "✓" : "✗"}`, tone: matches ? "good" : "bad" },
    left,
    right: [
      { key: "chargesOnBill", caption: "Charges on bill", value: money(n(t.chargesOnBill)) },
      { key: "tcs", caption: "TCS", value: "" },
      { key: "roundOff", caption: "Round off", value: money(n(t.roundOff)), tone: "muted" },
    ],
    itc,
    ownCosts: muted.join(" · "),
  };
}
