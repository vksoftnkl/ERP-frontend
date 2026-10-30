/**
 * Purchase Entry (menu 24) — the line rules Qt NexERP 0fbe19c..e0c56ef added,
 * pure: money expressions (ENT-05 / ENT-19), the ITC words (LAW-01), the F12
 * split folded back onto the row (`setLineAllocs`), the supplier scheme
 * (ENT-07), the line defaults from the item context (ENT-02), and the lines a
 * GRN (R4) or a PO (DOC-04) brings in.
 */
import type { PurchaseAllocEntry, PurchaseAllocNeed } from "../shared/purchase-dialogs.types";
import { isoFromTyped, money, num, qtyText, text } from "../shared/purchase.format";
import type {
  InvoiceLine,
  LineSettings,
  PurchaseGrnLine,
  PurchaseItemContext,
  PurchasePoPendingLine,
} from "./invoice.types";

// ---------------------------------------------------------------------------
// ENT-05 / ENT-19 — a little sum in a money cell
// ---------------------------------------------------------------------------

export type ExpressionResult = { ok: true; value: string } | { ok: false; hint: string };

const SUM = /^(\d+(?:\.\d*)?|\.\d+)([+\-*/](\d+(?:\.\d*)?|\.\d+))*$/;

/**
 * Qt `evalExpressionCell`: a plain number stays as typed; `12/2`, `3*45.5`,
 * `100-5` become their answer (* and / first, left to right, 4 places, never
 * below 0); in Sell A–D, `10%` = MRP less 10 % (2 places). Blank is blank.
 */
export function evalMoneyExpression(raw: string, opts: { sell: boolean; mrp: number }): ExpressionResult {
  const typed = raw.replace(/[,\s]/g, "");
  if (!typed) {
    return { ok: true, value: "" };
  }
  if (/^(\d+(\.\d*)?|\.\d+)$/.test(typed)) {
    return { ok: true, value: typed };
  }
  if (opts.sell && typed.endsWith("%")) {
    const pct = Number(typed.slice(0, -1));
    if (!typed.slice(0, -1) || !Number.isFinite(pct)) {
      return { ok: false, hint: `"${typed}" is not a sum this cell can take.` };
    }
    if (!(opts.mrp > 0)) {
      return { ok: false, hint: `${typed} needs the MRP first.` };
    }
    const value = Math.round(opts.mrp * (1 - pct / 100) * 100) / 100;
    return value >= 0 ? { ok: true, value: qtyText(value) } : { ok: false, hint: `"${typed}" is not a sum this cell can take.` };
  }
  if (!SUM.test(typed)) {
    return { ok: false, hint: `"${typed}" is not a sum this cell can take.` };
  }
  const tokens = typed.match(/(\d+(?:\.\d*)?|\.\d+)|[+\-*/]/g) ?? [];
  const terms: number[] = [];
  const ops: string[] = [];
  let current = Number(tokens[0]);
  for (let index = 1; index < tokens.length; index += 2) {
    const op = tokens[index];
    const operand = Number(tokens[index + 1]);
    if (op === "*") {
      current *= operand;
    } else if (op === "/") {
      if (operand === 0) {
        return { ok: false, hint: `"${typed}" is not a sum this cell can take.` };
      }
      current /= operand;
    } else {
      terms.push(current);
      ops.push(op);
      current = operand;
    }
  }
  terms.push(current);
  let value = terms[0];
  ops.forEach((op, index) => {
    value = op === "+" ? value + terms[index + 1] : value - terms[index + 1];
  });
  value = Math.round(value * 10000) / 10000;
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, hint: `"${typed}" is not a sum this cell can take.` };
  }
  return { ok: true, value: qtyText(value) };
}

// ---------------------------------------------------------------------------
// LAW-01 — the line's input tax credit, in words
// ---------------------------------------------------------------------------

/** Qt `itcText`: all eligible, part pending (a short), or none (and why). */
export function itcText(cls: unknown, eligibleRaw: unknown, pendingRaw: unknown, ineligibleRaw: unknown): string {
  const klass = text(cls).toUpperCase();
  const eligible = num(eligibleRaw);
  const pending = num(pendingRaw);
  const ineligible = num(ineligibleRaw);
  if (klass === "COMPOSITION" || klass === "UNREGISTERED") {
    return "No GST";
  }
  if (klass === "RCM") {
    return "RCM";
  }
  if (klass === "BLOCKED_17_5") {
    return "Blocked 17(5)";
  }
  if (klass === "INELIGIBLE" || (eligible <= 0 && pending <= 0 && ineligible > 0)) {
    return "Inelig.";
  }
  if (pending > 0) {
    return `${money(eligible)} E · ${money(pending)} P`;
  }
  if (ineligible > 0) {
    return `${money(eligible)} E · ${money(ineligible)} lost`;
  }
  return eligible > 0 ? "Elig." : "";
}

// ---------------------------------------------------------------------------
// F12 — the split folded back onto the row (Qt `setLineAllocs`)
// ---------------------------------------------------------------------------

/** What the row's own cells hold when the split is one SALEABLE row (+ its DAMAGED twin). */
export type FoldedRow = {
  batch: string;
  /** ISO, or "". */
  expiryIso: string;
  mrp: number;
  sizeId: string;
  sizeName: string;
  colourId: string;
  colourName: string;
  model: string;
};

/**
 * One SALEABLE row (+ a DAMAGED twin with the same batch / expiry / MRP /
 * size / colour / model), no serial, no mfg date, in the bill's godown, goes
 * back onto the row; anything more stays a split. (Qt does not look at the
 * godown — a row in another godown would lose it on the fold; this does.)
 */
export function foldAllocs(rows: readonly PurchaseAllocEntry[], billGodownId: string): FoldedRow | null {
  if (rows.length === 0 || rows.length > 2) {
    return null;
  }
  const [first, second] = rows;
  if (first.bucket !== "SALEABLE") {
    return null;
  }
  const same = (left: unknown, right: unknown) => text(left) === text(right);
  if (second) {
    if (
      second.bucket !== "DAMAGED" ||
      !same(second.batchNo, first.batchNo) ||
      !same(second.expiryDate, first.expiryDate) ||
      num(second.mrp) !== num(first.mrp) ||
      !same(second.sizeId, first.sizeId) ||
      !same(second.colourId, first.colourId) ||
      !same(second.model, first.model)
    ) {
      return null;
    }
  }
  for (const row of rows) {
    if (text(row.serialNo) || text(row.mfgDate)) {
      return null;
    }
    const godown = text(row.godownId);
    if (godown && billGodownId && godown !== billGodownId) {
      return null;
    }
  }
  return {
    batch: text(first.batchNo).toUpperCase(),
    expiryIso: text(first.expiryDate).slice(0, 10),
    mrp: num(first.mrp),
    sizeId: text(first.sizeId),
    sizeName: text(first.sizeName),
    colourId: text(first.colourId),
    colourName: text(first.colourName),
    model: text(first.model),
  };
}

const cell = (raw: string) => num(raw.replace(/,/g, ""));

/**
 * Qt `openAllocs`: what the F12 rows must add up to — received (billed −
 * damaged unless typed), damaged, free — and whether a row is one serial piece
 * (signature R) or carries size / colour / model (textile).
 */
export function allocNeedOf(
  line: InvoiceLine,
  bill: { godownId: string; godownName: string },
  rules: LineSettings,
): PurchaseAllocNeed {
  const billed = cell(line.billed);
  const damaged = cell(line.dmg);
  return {
    received: line.recd.trim() ? cell(line.recd) : Math.max(0, billed - damaged),
    damaged,
    free: cell(line.free),
    serial: line.signature.includes("R"),
    textile: rules.autoBatchNo && line.signature.includes("B") && !line.grnItemId,
    godownId: bill.godownId,
    godownName: bill.godownName || "(bill's godown)",
  };
}

/**
 * The rows F12 opens on: the line's split, else what is typed on the row (one
 * SALEABLE row for what came in good + free, and a DAMAGED twin) — or none.
 */
export function allocSeedOf(line: InvoiceLine, need: PurchaseAllocNeed): PurchaseAllocEntry[] {
  if (line.split) {
    return line.split.map((row) => ({ ...row }));
  }
  const batch = line.batch.trim();
  const expiry = isoFromTyped(line.expiry);
  if (!batch && !expiry && !line.sizeId && !line.colourId && !line.model.trim()) {
    return [];
  }
  const mrp = cell(line.mrp);
  const base: PurchaseAllocEntry = {
    bucket: "SALEABLE",
    qty: need.received,
    ...(line.sizeId ? { sizeId: line.sizeId, sizeName: line.sizeName } : {}),
    ...(line.colourId ? { colourId: line.colourId, colourName: line.colourName } : {}),
    ...(line.model.trim() ? { model: line.model.trim() } : {}),
    ...(batch ? { batchNo: batch } : {}),
    ...(expiry ? { expiryDate: expiry } : {}),
    ...(mrp > 0 ? { mrp } : {}),
  };
  const rows: PurchaseAllocEntry[] = [];
  if (need.received + need.free > 0) {
    rows.push({ ...base, ...(need.free > 0 ? { freeQty: need.free } : {}) });
  }
  if (need.damaged > 0) {
    rows.push({ ...base, bucket: "DAMAGED", qty: need.damaged });
  }
  return rows;
}

/** "3 batches (F12)" / "1 serial (F12)" — the Batch cell of a split line. */
export function splitLabel(rows: readonly PurchaseAllocEntry[]): string {
  const serial = rows.some((row) => text(row.serialNo) !== "");
  const n = rows.length;
  if (serial) {
    return n === 1 ? "1 serial (F12)" : `${n} serials (F12)`;
  }
  return n === 1 ? "1 batch (F12)" : `${n} batches (F12)`;
}

// ---------------------------------------------------------------------------
// ENT-07 — the supplier's "buy N get M"
// ---------------------------------------------------------------------------

export type Scheme = { buy: number; free: number };

export function schemeOf(context: PurchaseItemContext | null | undefined): Scheme {
  const si = context?.supplierItem;
  return { buy: num(si?.schemeBuyQty), free: num(si?.schemeFreeQty) };
}

/** Free = floor(Billed / N) × M; "" when there is no scheme or nothing billed. */
export function schemeFreeText(billed: number, scheme: Scheme): string {
  if (!(scheme.buy > 0) || !(scheme.free > 0) || !(billed > 0)) {
    return "";
  }
  const free = Math.floor(billed / scheme.buy + 1e-9) * scheme.free;
  return free > 0 ? qtyText(free) : "";
}

// ---------------------------------------------------------------------------
// ENT-02 — a new line's rate and discounts
// ---------------------------------------------------------------------------

export type LineDefaults = { rate: string; discPct: string; schPct: string; said: string };

/**
 * Qt `applyLineDefaults`: the supplier's pending PO for the item in the same
 * unit, else the last purchase in that unit — this supplier's before anyone's.
 */
export function lineDefaultsFrom(
  context: PurchaseItemContext | null | undefined,
  unitName: string,
  supplierId: string,
): LineDefaults | null {
  if (!context) {
    return null;
  }
  const unit = unitName.trim();
  const po = context.poRate;
  let from: { rate?: unknown; discPct?: unknown; schPct?: unknown } | null = null;
  let said = "";
  if (po && text(po.unitName) === unit) {
    from = po;
    said = `rate from ${text(po.refno)}`;
  } else {
    let any: NonNullable<PurchaseItemContext["lastPurchases"]>[number] | null = null;
    for (const purchase of context.lastPurchases ?? []) {
      if (text(purchase.unitName) !== unit) {
        continue;
      }
      if (!any) {
        any = purchase;
      }
      if (supplierId && text(purchase.supplierId) === supplierId) {
        any = purchase;
        break;
      }
    }
    if (any) {
      from = any;
      said = `rate from the last purchase ${text(any.refno)}`;
    }
  }
  if (!from || !(num(from.rate) > 0)) {
    return null;
  }
  return {
    rate: qtyText(num(from.rate)),
    discPct: num(from.discPct) > 0 ? qtyText(num(from.discPct)) : "",
    schPct: num(from.schPct) > 0 ? qtyText(num(from.schPct)) : "",
    said,
  };
}

// ---------------------------------------------------------------------------
// The item strip's words (Qt `PurchaseItemStrip::paint`)
// ---------------------------------------------------------------------------

/** 132.000 → "132", 114.3 → "114.30". */
export function stripRate(value: unknown): string {
  const n = num(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function shortDay(iso: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(iso));
  return match ? `${match[3]}-${match[2]}` : "";
}

/** The parts after the item's name, as the strip lists them. */
export function itemStripParts(context: PurchaseItemContext): string[] {
  const parts: string[] = [];
  const last = (context.lastPurchases ?? []).map((purchase) =>
    [shortDay(purchase.docDate), text(purchase.supplierName), stripRate(purchase.rate)].filter(Boolean).join(" "),
  );
  parts.push(last.length > 0 ? `last purchases: ${last.join(" · ")}` : "no purchase yet");
  const po = context.poRate;
  if (po) {
    parts.push(`PO rate ${stripRate(po.netRate)} (${qtyText(num(po.pendingQty))} pending)`);
  }
  const stock = context.stock;
  let stockText = `stock ${qtyText(num(stock?.saleable))} ${text(stock?.unitName).toLowerCase()}`.trim();
  if (num(stock?.damaged) > 0) {
    stockText += ` (+${qtyText(num(stock?.damaged))} damaged)`;
  }
  parts.push(stockText);
  const prices = context.prices;
  if (prices) {
    const sells = (["A", "B", "C", "D"] as const)
      .map((level) => ({ level, value: num(prices[`sell${level}`]) }))
      .filter((entry) => entry.value > 0)
      .map((entry) => `${entry.level} ${stripRate(entry.value)}`);
    if (sells.length > 0) {
      parts.push(`Sell ${sells.join(" / ")}`);
    }
    if (num(prices.mrp) > 0) {
      parts.push(`MRP ${stripRate(prices.mrp)}`);
    }
  }
  const si = context.supplierItem;
  if (text(si?.code)) {
    parts.push(`supplier code ${text(si?.code)}`);
  }
  if (num(si?.schemeBuyQty) > 0) {
    parts.push(`scheme buy ${qtyText(num(si?.schemeBuyQty))} get ${qtyText(num(si?.schemeFreeQty))}`);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// The lines a GRN or a PO brings in
// ---------------------------------------------------------------------------

/** The last `/` segment of a document number ("PO/2026-2027/D1/00012" → "00012"). */
export function refnoTail(refno: unknown): string {
  const value = text(refno);
  const at = value.lastIndexOf("/");
  return at >= 0 ? value.slice(at + 1) : value;
}

/** What a source line fills on a new bill line (item, unit, figures, link). */
export type SourceLine = {
  itemId: string;
  itemName: string;
  uomId: string;
  unitName: string;
  billed: string;
  recd: string;
  dmg: string;
  free: string;
  rate: string;
  discPct: string;
  schPct: string;
  mrp: string;
  srcRefno: string;
  grnItemId?: string;
  grnYear?: string;
  poItemId?: string;
  poYear?: string;
  sisterSaleItemId?: string;
  sisterSaleItemYear?: string;
  sellA?: string;
  sellB?: string;
  sellC?: string;
  sellD?: string;
};

const positiveText = (value: unknown) => (num(value) > 0 ? qtyText(num(value)) : "");

/** One "From GRN" choice: its id, words and line count. */
export type SourceChoice = { id: string; label: string };

export function grnChoices(lines: readonly PurchaseGrnLine[]): SourceChoice[] {
  const order: string[] = [];
  const count = new Map<string, number>();
  const label = new Map<string, string>();
  for (const line of lines) {
    const id = text(line.grnId);
    if (!count.has(id)) {
      order.push(id);
      const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(line.grnDate));
      const challan = text(line.challanNo);
      label.set(id, `${text(line.grnRefno)}${day ? ` · ${day[3]}/${day[2]}/${day[1]}` : ""}${challan ? ` · DC ${challan}` : ""}`);
    }
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  return order.map((id) => {
    const n = count.get(id) ?? 0;
    return { id, label: `${label.get(id) ?? id} (${n} ${n === 1 ? "line" : "lines"})` };
  });
}

export function poChoices(lines: readonly PurchasePoPendingLine[]): SourceChoice[] {
  const order: string[] = [];
  const count = new Map<string, number>();
  const label = new Map<string, string>();
  for (const line of lines) {
    const id = text(line.poId);
    if (!count.has(id)) {
      order.push(id);
      const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(line.docDate));
      label.set(id, `${text(line.refno)}${day ? ` · ${day[3]}/${day[2]}/${day[1]}` : ""}`);
    }
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  return order.map((id) => {
    const n = count.get(id) ?? 0;
    return { id, label: `${label.get(id) ?? id} (${n === 1 ? "1 line" : `${n} lines`} pending)` };
  });
}

/**
 * Qt `fillFromGrn`: every billable line of the GRN not on the bill yet —
 * Billed = the challan qty (at least what came), Recd / Dmg / Free the GRN's,
 * Rate the PO's (else the GRN's provisional rate). Blocked lines and what went
 * back on a GRN return are named for the hint.
 */
export function linesFromGrn(
  lines: readonly PurchaseGrnLine[],
  grnId: string,
  have: ReadonlySet<string>,
): { lines: SourceLine[]; blocked: string[]; returned: string[] } {
  const out: SourceLine[] = [];
  const blocked: string[] = [];
  const returned: string[] = [];
  for (const line of lines) {
    if (text(line.grnId) !== grnId || have.has(text(line.grnItemId))) {
      continue;
    }
    if (text(line.blocked)) {
      blocked.push(`line ${text(line.lineNo)} ${text(line.itemName)} — ${text(line.blocked)}`);
      continue;
    }
    const recd = num(line.receivedQty);
    const dmg = num(line.damagedQty);
    const billed = Math.max(num(line.challanQty), recd + dmg);
    const fromPo = text(line.poRate) !== "";
    out.push({
      itemId: text(line.itemId),
      itemName: text(line.itemName),
      uomId: text(line.uomId),
      unitName: text(line.unitName),
      billed: qtyText(billed),
      recd: qtyText(recd),
      dmg: positiveText(dmg),
      free: positiveText(line.freeQty),
      rate: qtyText(fromPo ? num(line.poRate) : num(line.provisionalRate)),
      discPct: fromPo ? positiveText(line.poDiscPct) : "",
      schPct: "",
      mrp: positiveText(line.mrp),
      srcRefno: refnoTail(line.grnRefno),
      grnItemId: text(line.grnItemId),
      grnYear: text(line.grnItemAccYear),
      // Not the GRN's Sell A–D: Qt leaves them blank (prices set at the GRN were written there).
    });
    if (num(line.returnedQty) > 0) {
      returned.push(`${text(line.itemName)} — ${qtyText(num(line.returnedQty))} went back on a GRN return`);
    }
  }
  return { lines: out, blocked, returned };
}

/** Qt `fillFromPo`: every pending line of the PO not on the bill yet — Billed = pending, the PO's rate, disc %, sch %, MRP. */
export function linesFromPo(lines: readonly PurchasePoPendingLine[], poId: string, have: ReadonlySet<string>): SourceLine[] {
  return lines
    .filter((line) => text(line.poId) === poId && !have.has(text(line.poiId)))
    .map((line) => ({
      itemId: text(line.itemId),
      itemName: text(line.itemName),
      uomId: text(line.uomId),
      unitName: text(line.unitName),
      billed: qtyText(num(line.pendingQty)),
      recd: "",
      dmg: "",
      free: "",
      rate: qtyText(num(line.rate)),
      discPct: positiveText(line.discPct),
      schPct: positiveText(line.schPct),
      mrp: positiveText(line.mrp),
      srcRefno: refnoTail(line.refno),
      poItemId: text(line.poiId),
      poYear: text(line.accYear),
    }));
}
