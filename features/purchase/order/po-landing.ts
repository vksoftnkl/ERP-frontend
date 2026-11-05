/**
 * Purchase Order (menu 23) — each line's charge split and landing cost, like
 * Sale Entry (Qt NexERP bcd844a; server bbef3f41, `/purchase/orders/validate`).
 * Pure.
 *
 * - The SERVER spreads the charges: a before-tax charge's share sits inside the
 *   line's Taxable (so it carries GST), an after-tax one is added to its Amount;
 *   per line it sends `chrgBeforeTax`, `chrgAfterTax`, `amount` (= total + the
 *   after-tax share) and the landing costs (`landedCost` / `landedCostIncl`, 6
 *   places, per the line's own unit).
 * - While an edit waits for that answer the screen shows a LIVE estimate (Qt
 *   `repriceRow` / `repriceCharges` / `paintLive`): the line keeps the shares of
 *   the last answer, so its Taxable is goods + the before-tax share, taxed at
 *   its rate, and its Amount adds the after-tax share; the split / landing cells
 *   keep the last server figures, muted (`awaitingServer`), until the answer.
 * - On open (any status) one /validate brings the landing costs, which are not
 *   stored; the saved figures stand (`paintLanding`).
 */
import { money, num, qtyText, text } from "@/features/purchase/shared/purchase.format";
import { COL } from "./purchase-order.constants";
import { calcLine, chargeRateAmount, goodsValue, lineInOf, r2, taxOn } from "./po-line-math";
import type { PoChargeLine, PoDraft, PoLine, PoTotals, PurchaseOrderCalc, PurchaseOrderChargeRow } from "./purchase-order.types";

type CalcLine = PurchaseOrderCalc["lines"][number];

const hasItem = (line: Pick<PoLine, "itemId">): boolean => line.itemId !== "";

/** Open for keying (the state module's `isEditable`, repeated here to keep the modules acyclic). */
function editable(draft: Pick<PoDraft, "status" | "viewMode" | "amending">): boolean {
  return (draft.status === "DRAFT" && draft.viewMode === "entry") || (draft.status === "POSTED" && draft.amending === true);
}

/** A server money figure for a cell that is blank when it is none (Qt `moneyCell`: forty rows of 0.00 hide what matters). */
function blankZero(value: unknown): number | null {
  const n = num(value);
  return n === 0 ? null : n;
}

/** Is the key in the answer at all (an older server leaves the cell as it was)? */
function sent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

// ---------------------------------------------------------------------------
// The live estimate (Qt repriceRow / repriceCharges / paintLive)
// ---------------------------------------------------------------------------

/**
 * Qt `repriceRow`: one line's Taxable / Tax / Amount from its typed Qty, Rate,
 * Disc %, Sch % and GST %, with the before / after-tax shares of the last answer
 * kept. A line nothing is keyed on yet stays as it is.
 */
export function repriceLine(line: PoLine): PoLine {
  if (!hasItem(line)) {
    return line;
  }
  const input = lineInOf(line);
  if (input.qty === 0 && input.rate === 0 && line.total === null) {
    return line;
  }
  const goods = calcLine(input).taxable;
  const taxable = r2(goods + (line.chrgBeforeTax ?? 0));
  const tax = taxOn(taxable, input.gstPct ?? 0);
  const lineTotal = r2(taxable + tax);
  return { ...line, taxable, tax, lineTotal, total: r2(lineTotal + (line.chrgAfterTax ?? 0)) };
}

/**
 * Qt `repriceCharges`: each charge's estimate from the lines now, for the
 * methods the client can work out alone (fixed, % of the goods value, per qty);
 * weight methods keep the server's last figure. A typed Amount stands (signed:
 * a "Less:" charge shows as minus, as the server signs it).
 */
export function repriceCharges(lines: readonly PoLine[], charges: readonly PoChargeLine[]): PoChargeLine[] {
  let goods = 0;
  let qty = 0;
  for (const line of lines) {
    if (hasItem(line)) {
      goods += goodsValue(line);
      qty += num(line.qty);
    }
  }
  return charges.map((charge) => {
    if (!charge.chgId) {
      return charge;
    }
    const value = charge.typed ? Math.abs(num(charge.amount)) : chargeRateAmount(charge, goods, qty);
    if (value === null) {
      return charge;
    }
    const amount = (charge.type.trim().toUpperCase() === "DEDUCT" ? -value : value).toFixed(2);
    return amount === charge.amount ? charge : { ...charge, amount };
  });
}

/**
 * Qt `paintLive`'s totals, as the server counts them: Ordered = Σ line total
 * (taxable + GST, the before-tax shares inside); the charges estimate = the
 * rest — after-tax charges (+ their own GST, the last answer's) and our own
 * off-bill costs. A before-tax charge is in the lines already.
 */
export function liveTotals(
  lines: readonly PoLine[],
  charges: readonly PoChargeLine[],
): { strip: Record<string, unknown>; totals: PoTotals } {
  let count = 0;
  let taxable = 0;
  let tax = 0;
  let net = 0;
  for (const line of lines) {
    if (!hasItem(line)) {
      continue;
    }
    count += 1;
    taxable += line.taxable ?? 0;
    tax += line.tax ?? 0;
    net += line.lineTotal ?? line.total ?? 0;
  }
  let estimate = 0;
  for (const charge of charges) {
    if (charge.chgId && charge.beforeTax !== true) {
      estimate += num(charge.amount) + (charge.gst ?? 0);
    }
  }
  return {
    strip: {
      lines: count,
      orderedValue: net.toFixed(2),
      chargesEstimate: estimate.toFixed(2),
      poTotal: (net + estimate).toFixed(2),
    },
    totals: { taxable, tax, net },
  };
}

/**
 * The live estimate after an edit (Qt `onCellEdited` → `repriceRow` +
 * `paintLive`): the lines named in `repriceKeys` work themselves out again,
 * the charges follow, the strip follows; the split / landing cells are muted
 * until the server answers. A PO that is not open for keying is left alone.
 */
export function withLiveEstimate(draft: PoDraft, repriceKeys: readonly string[] = []): PoDraft {
  if (!editable(draft)) {
    return draft;
  }
  const wanted = new Set(repriceKeys);
  const lines = wanted.size === 0 ? draft.lines : draft.lines.map((line) => (wanted.has(line.key) ? repriceLine(line) : line));
  const charges = repriceCharges(lines, draft.charges ?? []);
  const { strip, totals } = liveTotals(lines, charges);
  return { ...draft, lines, charges, totals, serverTotals: strip, awaitingServer: true };
}

// ---------------------------------------------------------------------------
// The server's answer (Qt paintServerLines)
// ---------------------------------------------------------------------------

/** "84.571667 per PCS\n= landed value 1,014.86 ÷ 12 PCS (ordered + free)\n…" — the Landing cost cell's tooltip. */
export function landedTips(line: Pick<PoLine, "qty" | "free" | "unitName">, row: CalcLine): { landedTip: string; landedInclTip: string } {
  const unit = line.unitName;
  const units = qtyText(num(line.qty) + num(line.free));
  const value = money(num(row.landedValue));
  return {
    landedTip:
      `${text(row.landedCost)} per ${unit}\n` +
      `= landed value ${value} ÷ ${units} ${unit} (ordered + free)\n` +
      `landed value = net ${money(num(row.netGross))} + before-tax charges ${money(num(row.chrgBeforeTax))}` +
      ` + after-tax charges ${money(num(row.chrgAfterTax))} + our own charges ${money(num(row.offbillShare))}`,
    landedInclTip: `${text(row.landedCostIncl)} per ${unit}\n= (landed value ${value} + GST ${money(num(row.tax))}) ÷ ${units} ${unit}`,
  };
}

/**
 * One line from the server's answer. `figures` = the live answer: Taxable, GST
 * %, Tax, the split, Amount (= `amount`, else `total`) and the line total.
 * Always: the landing costs, when the server sent them.
 */
export function paintServerLine(line: PoLine, row: CalcLine, figures: boolean): PoLine {
  let next = line;
  if (figures) {
    const lineTotal = num(row.total);
    next = {
      ...next,
      taxable: num(row.taxable),
      gstPct: num(row.gstPct),
      tax: num(row.tax),
      lineTotal,
      total: sent(row.amount) ? num(row.amount) : lineTotal,
      chrgBeforeTax: blankZero(row.chrgBeforeTax),
      chrgAfterTax: blankZero(row.chrgAfterTax),
    };
  }
  if (!sent(row.landedCost)) {
    return next;
  }
  return { ...next, landedCost: text(row.landedCost), landedCostIncl: text(row.landedCostIncl), ...landedTips(next, row) };
}

/** The answer's lines on the lines they were asked for (`keysByLineNo`: lineNo → key). */
export function paintServerLines(
  lines: readonly PoLine[],
  rows: readonly CalcLine[] | undefined,
  keysByLineNo: ReadonlyMap<number, string>,
  figures: boolean,
): PoLine[] {
  const byKey = new Map<string, CalcLine>();
  for (const row of rows ?? []) {
    const key = keysByLineNo.get(Number.parseInt(text(row.key), 10));
    if (key) {
      byKey.set(key, row);
    }
  }
  return lines.map((line) => {
    const row = byKey.get(line.key);
    return row ? paintServerLine(line, row, figures) : line;
  });
}

/**
 * The charge rows from the answer, in the order sent (Qt `paintServerCharges`):
 * the master's flags and the row's own GST; `amounts` = the estimate per row
 * too (signed) and the rate the server used, unless the Amount was typed.
 */
export function paintServerCharges(
  charges: readonly PoChargeLine[] | undefined,
  out: readonly PurchaseOrderChargeRow[] | undefined,
  amounts: boolean,
): PoChargeLine[] {
  const rows = out ?? [];
  let at = 0;
  return (charges ?? []).map((charge) => {
    if (!charge.chgId) {
      return charge;
    }
    const row = rows[at++];
    if (!row) {
      return charge;
    }
    let next: PoChargeLine = { ...charge, gst: num(row.tax) };
    if (sent(row.beforeTax)) {
      next = { ...next, beforeTax: row.beforeTax === true, landing: !sent(row.landingCost) || row.landingCost === true, flagsKnown: true };
    }
    if (amounts) {
      next = { ...next, amount: num(row.signedAmount ?? row.amount).toFixed(2), rate: charge.typed ? charge.rate : qtyText(num(row.rate)) };
    }
    return next;
  });
}

/**
 * Qt `validateLoaded`'s answer: the landing costs (not stored) and the charges'
 * flags / own GST. The saved figures stand — Taxable, Tax, the split
 * (poi_chrg_*) and the totals are the PO's as saved. Never marks it changed.
 */
export function paintLanding(draft: PoDraft, calc: PurchaseOrderCalc, keysByLineNo: ReadonlyMap<number, string>): PoDraft {
  return {
    ...draft,
    lines: paintServerLines(draft.lines, calc.lines, keysByLineNo, false),
    charges: paintServerCharges(draft.charges, calc.charges, false),
  };
}

// ---------------------------------------------------------------------------
// A stored PO's charges (Qt applyLoaded)
// ---------------------------------------------------------------------------

/**
 * The server keeps no "typed" mark (a typed amount is saved with the master's
 * default rate), so a row whose saved amount is not what its rate gives on
 * these lines was typed: it stays the typed amount. Every other row goes by its
 * rate again, as a new row does — its share then lands on the lines by its own
 * method (per qty by qty …), which an amount would not (that is spread by value).
 */
export function chargesTypedOnLoad(charges: readonly PoChargeLine[], lines: readonly PoLine[]): PoChargeLine[] {
  let goods = 0;
  let qty = 0;
  for (const line of lines) {
    if (hasItem(line)) {
      goods += goodsValue(line);
      qty += num(line.qty);
    }
  }
  return charges.map((charge) => {
    const fromRate = chargeRateAmount(charge, goods, qty);
    const typed = fromRate !== null && Math.abs(fromRate - Math.abs(num(charge.amount))) >= 0.005;
    return typed === charge.typed ? charge : { ...charge, typed };
  });
}

// ---------------------------------------------------------------------------
// The Σ row under the lines (Qt paintLinesFooter)
// ---------------------------------------------------------------------------

/**
 * Ordered, Free, Received, Pending as qty; Chrg before tax, Tax, Chrg after
 * tax and Amount as money (Σ Amount = the server's totals.amount); the landing
 * costs are per unit — no Σ. A zero sum stays blank; no line, no row.
 */
export function poFooterCells(lines: readonly PoLine[]): Partial<Record<number, string>> | null {
  const items = lines.filter(hasItem);
  if (items.length === 0) {
    return null;
  }
  const cells: Partial<Record<number, string>> = { [COL.Item]: `${items.length} item(s)` };
  const sum = (pick: (line: PoLine) => number) => items.reduce((total, line) => total + pick(line), 0);
  const qtys: [number, (line: PoLine) => number][] = [
    [COL.Qty, (line) => num(line.qty)],
    [COL.Free, (line) => num(line.free)],
    [COL.Recd, (line) => line.received ?? 0],
    [COL.Pending, (line) => line.pending ?? 0],
  ];
  for (const [column, pick] of qtys) {
    const total = sum(pick);
    if (total !== 0) cells[column] = qtyText(total);
  }
  const moneys: [number, (line: PoLine) => number][] = [
    [COL.ChrgBeforeTax, (line) => line.chrgBeforeTax ?? 0],
    [COL.Tax, (line) => line.tax ?? 0],
    [COL.ChrgAfterTax, (line) => line.chrgAfterTax ?? 0],
    [COL.Total, (line) => line.total ?? 0],
  ];
  for (const [column, pick] of moneys) {
    const total = sum(pick);
    if (total !== 0) cells[column] = money(total);
  }
  return cells;
}
