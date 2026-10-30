/**
 * Supplier Dues (menu 297) — the pure half of the Qt `SupplierDuesPage`
 * (NexERP src/modules/purchase/dues/supplier_dues_page.cpp): the two grids'
 * cells from /purchase/supplier-dues/open, the ticks, the Settle form's rules
 * (Amount / Balance / reason, when Settle is ready), the settle body and the
 * "What Settle writes" lines from the dryRun answer. No React, no network.
 */
import type { PurchasePillTone } from "@/features/purchase/shared/purchase-parts";
import { money, num, qtyText, shortRef, text } from "@/features/purchase/shared/purchase.format";
import { formatLocalDateTime, isoToDisplayDate } from "@/lib/date-format";
import type {
  DuesClaimWire,
  DuesCloseAction,
  DuesReceivedAs,
  DuesSettleAction,
  DuesSettleAnswer,
  DuesSettleBody,
  DuesSettlementAction,
  DuesShortageWire,
  DuesTotalsWire,
  DuesLegWire,
} from "./supplier-dues.types";

const EPS = 0.004;

// ------------------------------------------------------------------ words


/** "PRN/2026-2027/D14/00206 · r1" → "PRN/…/00206 · r1". */
export function claimRefShort(claimRef: string): string {
  const at = claimRef.indexOf(" · ");
  return at < 0 ? shortRef(claimRef) : shortRef(claimRef.slice(0, at)) + claimRef.slice(at);
}

/** "Claim — goods sent" → "Goods sent". */
export function kindWords(kindText: string): string {
  let k = kindText;
  if (k.startsWith("Claim — ")) {
    k = k.slice(8);
  }
  return k ? k[0].toUpperCase() + k.slice(1) : k;
}

export function statusWords(status: string): string {
  return status.replace(/_/g, " ");
}

export function statusTone(status: string): PurchasePillTone {
  if (status === "OPEN") return "warning";
  if (status === "PART") return "info";
  if (status === "SETTLED" || status === "CLOSED") return "success";
  return "neutral";
}

/** A claim's last settlement in words: "CN SMA/CN/88 · 1,000.00". */
export function claimActionText(a: DuesSettlementAction | null | undefined): string {
  if (!a) {
    return "—";
  }
  const action = text(a.action);
  const amt = money(num(a.amount));
  if (action === "CREDIT") {
    if (text(a.receivedAs) === "ADJUST") return `Adjust in next bill · ${amt}`;
    const cn = text(a.cnNo);
    return cn ? `CN ${cn} · ${amt}` : `CN · ${amt}`;
  }
  if (action === "SHORT_SETTLED") return `Written off · ${amt}`;
  if (action === "REJECTED") return `Rejected · ${amt}`;
  return `${action} · ${amt}`;
}

/** A shortage's last close in words: "CN SMA/CN/4 · 2 PCS", "Claim on KPN Parcel · 1", "Written off · 3". */
export function closeActionText(a: DuesCloseAction | null | undefined, unit: string): string {
  if (!a) {
    return "—";
  }
  const kind = text(a.kind);
  const qty = qtyText(num(a.qty)) + (unit ? ` ${unit}` : "");
  if (kind === "SUPPLIER_CN") {
    const cn = text(a.cnNo);
    return cn ? `CN ${cn} · ${qty}` : `Supplier CN · ${qty}`;
  }
  if (kind === "CLAIM") return `Claim on ${text(a.partyName)} · ${qty}`;
  if (kind === "WRITE_OFF") return `Written off · ${qty}`;
  return `${kind} · ${qty}`;
}

/** The last action's tooltip: when, why, the CN date, how to undo. */
export function actionTip(a: { on?: string | null; reason?: string | null; cnDate?: string | null } | null | undefined): string {
  if (!a) {
    return "";
  }
  const t: string[] = [];
  if (a.on) {
    const on = new Date(a.on);
    if (!Number.isNaN(on.getTime())) {
      // a date-only value (yyyy-MM-dd) has no time worth showing
      t.push(`On ${/^\d{4}-\d{2}-\d{2}$/.test(a.on) ? isoToDisplayDate(a.on) : formatLocalDateTime(on)}`);
    }
  }
  if (text(a.reason)) t.push(text(a.reason));
  if (text(a.cnDate)) t.push(`CN date ${isoToDisplayDate(text(a.cnDate).slice(0, 10))}`);
  t.push("Undo takes it back (a reversing row)");
  return t.join("\n");
}

function dateCell(value: string | null | undefined): string {
  const v = text(value);
  return v ? isoToDisplayDate(v.slice(0, 10)) : "";
}

// ------------------------------------------------------------------ rows

export type ClaimRow = {
  /** returnItemId + shortageCloseId — the row's key across reloads. */
  key: string;
  ticked: boolean;
  claim: string;
  claimTip: string;
  date: string;
  age: string;
  item: string;
  itemTip: string;
  kind: string;
  against: string;
  againstTip: string;
  /** Amber: the claim is not on the supplier (a transporter / insurer). */
  againstOther: boolean;
  reason: string;
  value: number;
  credited: number;
  writtenOff: number;
  open: number;
  status: string;
  lastAction: string;
  lastActionTip: string;
  // the keys
  source: string;
  returnItemId: string;
  shortageCloseId: string;
  accYear: string;
  partyId: string;
  partyName: string;
  claimAgainst: string;
  lastSettlementId: string;
  lastAccYear: string;
  refno: string;
};

export function claimRowOf(o: DuesClaimWire, ticked = false): ClaimRow {
  const against = text(o.claimAgainst);
  const last = o.lastAction ?? null;
  const src = [text(o.claimRef)];
  if (text(o.srcRefno)) {
    src.push(`Bill ${text(o.srcRefno)} of ${dateCell(o.srcDocDate)} (their no ${text(o.srcSupplierInvNo)})`);
  }
  const unit = text(o.unitName);
  return {
    key: text(o.returnItemId) + text(o.shortageCloseId),
    ticked,
    claim: claimRefShort(text(o.claimRef)),
    claimTip: src.join("\n"),
    date: dateCell(o.docDate),
    age: String(Math.trunc(num(o.ageDays))),
    item: text(o.itemName),
    itemTip: `${text(o.itemName)} — ${qtyText(num(o.qty))}${unit ? ` ${unit}` : ""}`,
    kind: kindWords(text(o.kindText)),
    against: against === "SUPPLIER" ? "Supplier" : text(o.partyName),
    againstTip: `${against} · ${text(o.partyName)}`,
    againstOther: against !== "SUPPLIER",
    reason: text(o.reasonName) || "—",
    value: num(o.claimValue),
    credited: num(o.credited),
    writtenOff: num(o.writtenOff),
    open: num(o.open),
    status: text(o.status),
    lastAction: claimActionText(last),
    lastActionTip: actionTip(last),
    source: text(o.source),
    returnItemId: text(o.returnItemId),
    shortageCloseId: text(o.shortageCloseId),
    accYear: text(o.accYear),
    partyId: text(o.claimPartyId),
    partyName: text(o.partyName),
    claimAgainst: against,
    lastSettlementId: text(last?.settlementId),
    lastAccYear: text(last?.accYear),
    refno: text(o.claimRef),
  };
}

export type ShortageRow = {
  key: string;
  ticked: boolean;
  from: string;
  fromTip: string;
  date: string;
  age: string;
  item: string;
  itemTip: string;
  why: string;
  short: string;
  recd: string;
  closed: string;
  open: string;
  cost: number;
  costTip: string;
  /** "—" when no GST is held for it. */
  gstHeld: string;
  status: string;
  outcome: string;
  /** REPLACE → green chip, else blue. */
  replacement: boolean;
  lastAction: string;
  lastActionTip: string;
  // the keys
  shortageId: string;
  accYear: string;
  reason: string;
  lastCloseId: string;
  lastAccYear: string;
  openQty: number;
  refno: string;
  unit: string;
};

/** "PUR/…/00611 · line 2"; just the refno when the line is not known. */
export function shortageFromText(srcRefno: string, srcLineNo: number | null | undefined): string {
  const ref = shortRef(srcRefno);
  return srcLineNo === null || srcLineNo === undefined || !Number.isFinite(Number(srcLineNo))
    ? ref
    : `${ref} · line ${Math.trunc(Number(srcLineNo))}`;
}

export function shortageRowOf(o: DuesShortageWire, ticked = false): ShortageRow {
  const id = text(o.shortageId);
  const unit = text(o.unitName);
  const last = o.lastAction ?? null;
  const reason = text(o.reason);
  const gst = num(o.openGst);
  return {
    key: id,
    ticked,
    from: shortageFromText(text(o.srcRefno), o.srcLineNo),
    fromTip: `${text(o.srcRefno)} (${text(o.srcDocType)})`,
    date: dateCell(o.srcDocDate),
    age: String(Math.trunc(num(o.ageDays))),
    item: text(o.itemName),
    itemTip: `${text(o.itemName)} — base unit ${unit}`,
    why: text(o.reasonText),
    short: qtyText(num(o.qtyBase)),
    recd: qtyText(num(o.received)),
    closed: qtyText(num(o.closed)),
    open: qtyText(num(o.openQty)),
    cost: num(o.costRate),
    costTip: `Open value ${money(num(o.openValue))} at the original bill cost`,
    gstHeld: o.gstPending === true && gst > 0 ? money(gst) : "—",
    status: text(o.status),
    outcome: reason === "REPLACE" ? "Replacement" : "Supplier sends",
    replacement: reason === "REPLACE",
    lastAction: closeActionText(last, unit),
    lastActionTip: actionTip(last),
    shortageId: id,
    accYear: text(o.accYear),
    reason,
    lastCloseId: text(last?.closeId),
    lastAccYear: text(last?.accYear),
    openQty: num(o.openQty),
    refno: text(o.srcRefno),
    unit,
  };
}

/** Keep the ticks across a reload (by the row's key). */
export function claimRowsFrom(wire: readonly DuesClaimWire[], previous: readonly ClaimRow[]): ClaimRow[] {
  const ticked = new Set(previous.filter((r) => r.ticked).map((r) => r.key));
  return wire.map((o) => {
    const row = claimRowOf(o);
    return ticked.has(row.key) ? { ...row, ticked: true } : row;
  });
}

export function shortageRowsFrom(wire: readonly DuesShortageWire[], previous: readonly ShortageRow[]): ShortageRow[] {
  const ticked = new Set(previous.filter((r) => r.ticked).map((r) => r.key));
  return wire.map((o) => {
    const row = shortageRowOf(o);
    return ticked.has(row.key) ? { ...row, ticked: true } : row;
  });
}

export function toggleTick<T extends { key: string; ticked: boolean }>(rows: readonly T[], key: string): T[] {
  return rows.map((r) => (r.key === key ? { ...r, ticked: !r.ticked } : r));
}

export function untickAll<T extends { ticked: boolean }>(rows: readonly T[]): T[] {
  return rows.some((r) => r.ticked) ? rows.map((r) => (r.ticked ? { ...r, ticked: false } : r)) : (rows as T[]);
}

/** Ticked rows, else the current one (Qt `settleRows` / `closeRows`). */
export function actingRows<T extends { key: string; ticked: boolean }>(rows: readonly T[], currentKey: string | null): T[] {
  const ticked = rows.filter((r) => r.ticked);
  if (ticked.length > 0) {
    return ticked;
  }
  const current = rows.find((r) => r.key === currentKey);
  return current ? [current] : [];
}

// ------------------------------------------------------------------ totals

export type DuesChip = { text: string; tone: PurchasePillTone };

export function duesChip(totals: DuesTotalsWire | null | undefined): DuesChip {
  const open = Math.trunc(num(totals?.openCount));
  return open > 0 ? { text: `${open} OPEN`, tone: "warning" } : { text: "NOTHING OPEN", tone: "success" };
}

function rowsWord(n: number): string {
  return `${n} row${n === 1 ? "" : "s"}`;
}

export type DuesStripCell = { key: string; caption: string; value: string; tone?: "warn" | "info"; strong?: boolean };

export function duesStripCells(totals: DuesTotalsWire | null | undefined): DuesStripCell[] {
  const c = totals?.claims;
  const s = totals?.shortages;
  const cRows = Math.trunc(num(c?.rows));
  const sRows = Math.trunc(num(s?.rows));
  return [
    { key: "claims", caption: "Claims", value: rowsWord(cRows) },
    { key: "money", caption: "Money open", value: money(num(c?.open)), tone: cRows ? "warn" : undefined },
    {
      key: "credited",
      caption: "Credited · written off",
      value: `${money(num(c?.credited))} · ${money(num(c?.writtenOff))}`,
    },
    {
      key: "shortages",
      caption: "Shortages",
      value: rowsWord(sRows) + (sRows ? ` · ${qtyText(num(s?.openQtyBase))} base open` : ""),
    },
    { key: "goods", caption: "Goods value open", value: money(num(s?.openValue)), tone: sRows ? "warn" : undefined },
    { key: "gst", caption: "GST held", value: money(num(s?.gstHeld)), tone: "info", strong: true },
  ];
}

export function duesHint(claims: number, shortages: number, supplierName: string, filtered: boolean): string {
  return claims + shortages === 0
    ? `Nothing is owed — no open claim or shortage${filtered ? ` for ${supplierName}` : ""}.`
    : "Tick claims (click ✓ or Space) and Settle · Ctrl+Enter; a shortage closes with Close row…";
}

// ------------------------------------------------------------------ the Settle form

export const SETTLE_ACTIONS: readonly { value: DuesSettleAction; label: string }[] = [
  { value: "CREDIT", label: "Credit received" },
  { value: "SHORT_SETTLED", label: "Short-settled → write off the open amount" },
  { value: "REJECTED", label: "Rejected → write off (GST on goods sent re-availed)" },
];

export const RECEIVED_AS: readonly { value: DuesReceivedAs; label: string }[] = [
  { value: "CN", label: "Supplier CN" },
  { value: "ADJUST", label: "Adjust in next bill" },
];

export type SettleForm = {
  action: DuesSettleAction;
  receivedAs: DuesReceivedAs;
  cnNo: string;
  /** ISO or "". */
  cnDate: string;
  /** As typed; only used while `amountTyped` (else the row's open). */
  amount: string;
  amountTyped: boolean;
  /** CREDIT on one row: what the credit leaves — stays OPEN or WRITE_OFF now. */
  balance: "OPEN" | "WRITE_OFF";
  reason: string;
};

export const EMPTY_SETTLE_FORM: SettleForm = {
  action: "CREDIT",
  receivedAs: "CN",
  cnNo: "",
  cnDate: "",
  amount: "",
  amountTyped: false,
  balance: "OPEN",
  reason: "",
};

function typed(raw: string): number {
  const v = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(v) ? v : 0;
}

export type BalanceChoice = { value: "OPEN" | "WRITE_OFF" | "NONE" | "ALL"; label: string };

export type SettleView = {
  title: string;
  openTotal: number;
  credit: boolean;
  single: boolean;
  receivedEnabled: boolean;
  cnEnabled: boolean;
  amountEnabled: boolean;
  /** What the Amount box shows. */
  amountText: string;
  amountPlaceholder: string;
  balanceCaption: string;
  balanceChoices: BalanceChoice[];
  balanceEnabled: boolean;
  /** The current Balance choice (one of balanceChoices). */
  balanceValue: BalanceChoice["value"];
  reasonEnabled: boolean;
  reasonPlaceholder: string;
};

/** Qt `refreshSettleForm`: titles, Amount / Balance / reason state from the rows. */
export function settleView(rows: readonly ClaimRow[], form: SettleForm): SettleView {
  const open = rows.reduce((s, r) => s + r.open, 0);
  const credit = form.action === "CREDIT";
  const single = rows.length === 1;
  const title =
    rows.length === 0
      ? "Settle claim — tick a claim above"
      : single
        ? `Settle claim — ${rows[0].claim} (open ${money(open)})`
        : `Settle ${rows.length} claims (open ${money(open)})`;

  let amountText: string;
  let amountPlaceholder = "";
  if (credit && single) {
    amountText = form.amountTyped ? form.amount : open.toFixed(2);
  } else {
    amountText = rows.length === 0 ? "" : money(open);
    amountPlaceholder = "each row's whole open amount";
  }

  let balanceChoices: BalanceChoice[];
  let balanceEnabled = false;
  let balanceValue: BalanceChoice["value"];
  let reasonEnabled: boolean;
  let reasonPlaceholder: string;
  let balanceCaption = "Balance";
  if (credit) {
    const rest = single ? open - typed(amountText) : 0;
    if (single && rest > EPS) {
      balanceChoices = [
        { value: "OPEN", label: `${money(rest)} stays open` },
        { value: "WRITE_OFF", label: `${money(rest)} → write off` },
      ];
      balanceEnabled = true;
      balanceValue = form.balance;
    } else {
      balanceChoices = [{ value: "NONE", label: rows.length === 0 ? "—" : "nothing left — the claim closes" }];
      balanceValue = "NONE";
    }
    reasonEnabled = balanceValue === "WRITE_OFF";
    reasonPlaceholder = reasonEnabled ? "reason (short-settled)" : "";
  } else {
    balanceCaption = "Write off";
    balanceChoices = [{ value: "ALL", label: rows.length === 0 ? "—" : `${money(open)} → write off` }];
    balanceValue = "ALL";
    reasonEnabled = rows.length > 0;
    reasonPlaceholder = "reason (needed)";
  }
  return {
    title,
    openTotal: open,
    credit,
    single,
    receivedEnabled: credit,
    cnEnabled: credit && form.receivedAs === "CN",
    amountEnabled: credit && single && open > EPS,
    amountText,
    amountPlaceholder,
    balanceCaption,
    balanceChoices,
    balanceEnabled,
    balanceValue,
    reasonEnabled,
    reasonPlaceholder,
  };
}

export const REASON_NEEDED = "Type the reason it is written off.";

/** Qt `settleFormReady`: "" = ready, else why not. */
export function settleProblem(rows: readonly ClaimRow[], form: SettleForm): string {
  if (rows.length === 0) return "Tick the claim(s) to settle.";
  for (const r of rows) {
    if (r.open <= EPS) return `${r.claim} is fully settled — nothing is open on it.`;
  }
  if (form.action === "CREDIT") {
    if (rows.length === 1) {
      const view = settleView(rows, form);
      const amount = typed(view.amountText);
      const open = rows[0].open;
      if (amount <= 0) return "Type the amount the party credited.";
      if (amount > open + EPS) return `The amount is more than the ${money(open)} open.`;
    }
  } else if (!form.reason.trim()) {
    return REASON_NEEDED;
  }
  return "";
}

/** Qt `settleBody`: the rows' keys, one row's amount, the received-as / CN, write-off of the rest. */
export function settleBody(
  rows: readonly ClaimRow[],
  form: SettleForm,
  opts: { deviceId: string; docDate?: string; dryRun: boolean },
): DuesSettleBody {
  const credit = form.action === "CREDIT";
  const view = settleView(rows, form);
  const body: DuesSettleBody = {
    rows: rows.map((r) => {
      const row: DuesSettleBody["rows"][number] = r.returnItemId
        ? { returnItemId: r.returnItemId, accYear: r.accYear }
        : { shortageCloseId: r.shortageCloseId, accYear: r.accYear };
      if (credit && rows.length === 1) {
        row.amount = typed(view.amountText);
      }
      return row;
    }),
    deviceId: opts.deviceId,
    action: form.action,
    dryRun: opts.dryRun,
  };
  if (opts.docDate) body.docDate = opts.docDate;
  const reason = form.reason.trim();
  if (credit) {
    body.receivedAs = form.receivedAs;
    if (form.receivedAs === "CN") {
      if (form.cnNo.trim()) body.cnNo = form.cnNo.trim();
      if (form.cnDate) body.cnDate = form.cnDate;
    }
    if (view.balanceValue === "WRITE_OFF") {
      body.writeOffRest = true;
      if (reason) body.writeOffReason = reason;
    }
  } else if (reason) {
    body.reason = reason;
  }
  return body;
}

// ------------------------------------------------------------------ What Settle writes

export type PreviewLine = { dr: string; cr: string; amount: number };

function legName(leg: DuesLegWire): string {
  let name = text(leg.ledgerName) || text(leg.role);
  const remarks = text(leg.remarks);
  const at = remarks.lastIndexOf(" — ");
  if (text(leg.role) && at >= 0) {
    name += ` (${remarks.slice(at + 3)})`;
  }
  return name;
}

/**
 * The legs as the mockup writes them: "Dr <ledger>   Cr <ledger>   amount" — a
 * step whose one leg on a side balances several on the other pairs each of
 * them with it; anything else lists every leg on its own line.
 */
export function previewLines(answer: DuesSettleAnswer | null | undefined): PreviewLine[] {
  const out: PreviewLine[] = [];
  for (const step of answer?.steps ?? []) {
    const drs = (step.legs ?? []).filter((l) => text(l.drCr) === "DR");
    const crs = (step.legs ?? []).filter((l) => text(l.drCr) !== "DR");
    if (crs.length === 1) {
      for (const d of drs) out.push({ dr: legName(d), cr: legName(crs[0]), amount: num(d.amount) });
    } else if (drs.length === 1) {
      for (const c of crs) out.push({ dr: legName(drs[0]), cr: legName(c), amount: num(c.amount) });
    } else {
      for (const d of drs) out.push({ dr: legName(d), cr: "", amount: num(d.amount) });
      for (const c of crs) out.push({ dr: "", cr: legName(c), amount: num(c.amount) });
    }
  }
  return out;
}

export function previewTotals(answer: DuesSettleAnswer | null | undefined): string {
  const t = answer?.totals;
  const parts = [`Credited ${money(num(t?.credited))}`, `Written off ${money(num(t?.writtenOff))}`];
  if (num(t?.gstReavailed) > 0) parts.push(`GST re-availed ${money(num(t?.gstReavailed))}`);
  return parts.join("  ·  ");
}

export function voucherRefs(answer: DuesSettleAnswer | null | undefined): string[] {
  return (answer?.steps ?? []).map((s) => text(s.voucherRefno)).filter(Boolean);
}

export function actionLabel(action: DuesSettleAction): string {
  return SETTLE_ACTIONS.find((a) => a.value === action)?.label ?? action;
}
