/**
 * Purchase Entry (menu 24) — the line figures of Qt NexERP dd59c2c, pure
 * (PI-LINES):
 *
 * - P7  what a blank Disc % / Disc / Sch % / Sch stands for (its pair worked
 *       out, shown muted);
 * - P11 a typed line worked out at once (`repriceLine`, Qt `repriceRow`, on
 *       shared/purchase-line-math — discount amounts and the extra disc
 *       included), the totals from the lines on screen while the server's
 *       answer is on its way (`liveTotalsOf`, Qt `paintLive`), and the lines
 *       with an item but no qty yet, which stay out of /validate so one line
 *       being keyed cannot hold up the others' figures;
 * - P12 the bill's GST by rate (`gstBreakupRows`, Qt `gstBreakupRows`): the
 *       server's `gstBreakup` when its answer is the one on screen, else the
 *       lines (and the taxed on-bill charges) grouped by GST %.
 *
 * Kept free of invoice.state (which imports it).
 */
import { calcPurchaseLine, r2, taxOn } from "../shared/purchase-line-math";
import { money, num, qtyText, text } from "../shared/purchase.format";
import type { InvoiceServerTotals } from "./invoice-fidelity";
import type { DerivedPairs, GstBreakupWire, GstParts, InvoiceDraft, InvoiceLine } from "./invoice.types";

export const NO_DERIVED: DerivedPairs = { discPct: "", discAmt: "", schPct: "", schAmt: "" };

const cell = (raw: string): number => num((raw ?? "").replace(/,/g, ""), 0);
const hasItem = (line: Pick<InvoiceLine, "itemId">): boolean => line.itemId !== "";

/** A % to 2 places, as the cell shows it ("2.5"). */
function pctText(value: number): string {
  return qtyText(Math.round(value * 100) / 100);
}

/**
 * Qt `setDerived` (P7): the amount a typed % comes to, the % a typed amount
 * comes to — over the gross (Disc) and the gross after Disc (Sch). Blank where
 * the line names neither, or the figure is 0.
 */
export function derivedPairs(
  figures: { gross: number; discAmt: number; schAmt: number },
  typed: { discPct: boolean; schPct: boolean },
): DerivedPairs {
  const { gross, discAmt, schAmt } = figures;
  const afterDisc = gross - discAmt;
  return {
    discAmt: typed.discPct && discAmt !== 0 ? money(discAmt) : "",
    discPct: !typed.discPct && discAmt !== 0 && gross > 0 ? pctText((discAmt * 100) / gross) : "",
    schAmt: typed.schPct && schAmt !== 0 ? money(schAmt) : "",
    schPct: !typed.schPct && schAmt !== 0 && afterDisc > 0 ? pctText((schAmt * 100) / afterDisc) : "",
  };
}

/** Qt `lineHalfTyped`: an item with no qty yet (just picked) — a GRN line always has its qty. */
export function lineHalfTyped(line: InvoiceLine): boolean {
  return hasItem(line) && line.grnItemId === "" && cell(line.billed) <= 0 && cell(line.free) <= 0;
}

/** The figures a line shows: the estimate while it stands, else the server's. */
export function shownFigures(line: InvoiceLine): { taxable: number; tax: number; total: number; gstParts: GstParts } | null {
  if (line.est) {
    return line.est;
  }
  return line.calc ? { taxable: line.calc.taxable, tax: line.calc.tax, total: line.calc.total, gstParts: line.calc.gstParts } : null;
}

export type EstimateContext = {
  interState: boolean;
  /** The last answer's supplierTaxMode — COMPOSITION / UNREGISTERED charge no GST. */
  supplierTaxMode: string;
};

/**
 * Qt `repriceRow` (P11): one line's Taxable / Tax / Total from what is typed on
 * it, while the server's answer is on its way. The charges are the server's to
 * spread: the line keeps the shares of the last answer, so Taxable = goods +
 * the before-tax share, taxed at the line's rate, and Total adds the after-tax
 * share (P10). A line whose GST % is not known yet (a GRN line before its first
 * answer) waits; so does one nothing is keyed on yet.
 */
export function repriceLine(line: InvoiceLine, ctx: EstimateContext): InvoiceLine {
  if (!hasItem(line) || text(line.gstPct) === "") {
    return line;
  }
  const qty = cell(line.billed);
  const rate = cell(line.rate);
  if (qty === 0 && rate === 0 && !line.est && !line.calc) {
    return line;
  }
  const mode = ctx.supplierTaxMode.trim().toUpperCase();
  const gstPct = mode === "COMPOSITION" || mode === "UNREGISTERED" ? 0 : cell(line.gstPct);
  const discPct = cell(line.discPct);
  const schPct = cell(line.schPct);
  const out = calcPurchaseLine(
    { qty, rate, discPct, schPct, gstPct, discAmt: cell(line.discAmt), schAmt: cell(line.schAmt), extraAmt: cell(line.extraDisc) },
    ctx.interState,
  );
  const before = line.calc?.chrgBeforeTax ?? 0;
  const after = line.calc?.chrgAfterTax ?? 0;
  const taxable = r2(out.taxable + before);
  const tax = taxOn(taxable, gstPct, ctx.interState);
  const half = ctx.interState ? 0 : r2((taxable * gstPct) / 2 / 100);
  return {
    ...line,
    est: {
      taxable,
      tax,
      total: r2(r2(taxable + tax) + after),
      gstParts: { cgst: half, sgst: half, igst: ctx.interState ? tax : 0, cess: 0 },
    },
    derived: derivedPairs(out, { discPct: discPct !== 0, schPct: schPct !== 0 }),
  };
}

/**
 * Qt `paintLive` (P11): the totals from the grid's own figures while an edit
 * waits for the server — Σ Taxable, Σ Tax, the last answer's charges, the
 * typed TCS; Net payable = Σ line Total (goods + GST + after-tax shares) + the
 * charges' own GST + TCS, to the rupee. `{}` = no line (the totals clear).
 */
export function liveTotalsOf(
  draft: Pick<InvoiceDraft, "lines" | "serverTotals" | "tcsAmount" | "invoiceAmount">,
): InvoiceServerTotals {
  let count = 0;
  let taxable = 0;
  let tax = 0;
  let amount = 0;
  // Qt 7d8c926 paintLive: the GST pieces of each line (the server's split, or the estimate's), for the frame's rows
  const parts = { cgst: 0, sgst: 0, igst: 0, cess: 0 };
  for (const line of draft.lines) {
    if (!hasItem(line)) {
      continue;
    }
    count += 1;
    const figures = shownFigures(line);
    taxable += figures?.taxable ?? 0;
    tax += figures?.tax ?? 0;
    amount += figures?.total ?? 0;
    parts.cgst += figures?.gstParts.cgst ?? 0;
    parts.sgst += figures?.gstParts.sgst ?? 0;
    parts.igst += figures?.gstParts.igst ?? 0;
    parts.cess += figures?.gstParts.cess ?? 0;
  }
  if (count === 0) {
    return {};
  }
  const last = draft.serverTotals ?? {};
  const raw = amount + num(last.chargeTax) + cell(draft.tcsAmount ?? "");
  const net = Math.sign(raw) * Math.round(Math.abs(raw));
  const printed = cell(draft.invoiceAmount);
  return {
    taxable: r2(taxable),
    gstTotal: r2(tax),
    chargesOnBill: num(last.chargesOnBill),
    roundOff: r2(net - raw),
    netPayable: net,
    invoiceAmountPrinted: printed,
    difference: r2(printed - net),
    offbillCharges: num(last.offbillCharges),
    shortValue: num(last.shortValue),
    gstOnShort: num(last.gstOnShort),
    // the charges' own GST and the credit split are the server's: the last answer's
    chargeTax: num(last.chargeTax),
    cgst: r2(parts.cgst),
    sgst: r2(parts.sgst),
    igst: r2(parts.igst),
    cess: r2(parts.cess),
    ...Object.fromEntries(["itcEligible", "itcPending", "itcIneligible"].filter((key) => key in last).map((key) => [key, last[key]])),
  };
}

// ---------------------------------------------------------------------------
// P11 — the hint line around /validate
// ---------------------------------------------------------------------------

/** Qt `recalcNow`'s gate: why the server cannot confirm the figures yet ("" = it can, or nothing is keyed). */
export function recalcBlockedHint(draft: Pick<InvoiceDraft, "lines" | "supplierId" | "godownId">): string {
  if (!draft.lines.some(hasItem)) {
    return "";
  }
  if (!draft.supplierId) {
    return "Pick the supplier to have the server confirm the figures.";
  }
  if (!draft.godownId) {
    return "Pick the godown to have the server confirm the figures.";
  }
  return "";
}

/** After an answer: the lines left out because they have no qty yet ("" = none). */
export function waitingHint(lines: readonly InvoiceLine[]): string {
  const waiting = lines.flatMap((line, index) => (lineHalfTyped(line) ? [String(index + 1)] : []));
  if (waiting.length === 0) {
    return "";
  }
  return waiting.length === 1
    ? `Line ${waiting[0]} has no qty yet — it joins the figures once it has one.`
    : `Lines ${waiting.join(", ")} have no qty yet — they join the figures once they have one.`;
}

// ---------------------------------------------------------------------------
// P12 — the GST break-up
// ---------------------------------------------------------------------------

export type GstBreakupRow = { gstPct: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number; total: number };

export const GST_SOURCE_SERVER = "As the server worked it out — the lines and the taxed charges.";
export const GST_SOURCE_AWAITING = "From the lines on screen — the server's figures follow the last change.";
export const GST_SOURCE_LINES = "From the lines on screen, grouped by GST %.";

function breakupRowOf(wire: GstBreakupWire): GstBreakupRow {
  return {
    gstPct: num(wire.gstPct),
    taxable: num(wire.taxable),
    cgst: num(wire.cgst),
    sgst: num(wire.sgst),
    igst: num(wire.igst),
    cess: num(wire.cess),
    total: num(wire.total),
  };
}

/** Σ of every column — the dialog's total row. */
export function gstBreakupTotal(rows: readonly GstBreakupRow[]): Omit<GstBreakupRow, "gstPct"> {
  const sum = { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 };
  for (const row of rows) {
    sum.taxable += row.taxable;
    sum.cgst += row.cgst;
    sum.sgst += row.sgst;
    sum.igst += row.igst;
    sum.cess += row.cess;
    sum.total += row.total;
  }
  return {
    taxable: r2(sum.taxable),
    cgst: r2(sum.cgst),
    sgst: r2(sum.sgst),
    igst: r2(sum.igst),
    cess: r2(sum.cess),
    total: r2(sum.total),
  };
}

/**
 * Qt `gstBreakupRows`: the server's gstBreakup (lines + taxed after-tax
 * charges) when its answer is the one on screen; else the lines on screen
 * grouped by GST % (their CGST / SGST / IGST / cess as the server split them,
 * or the estimate's), with each taxed on-bill charge at the rate its own GST
 * comes to. Rates low to high.
 */
export function gstBreakupRows(
  draft: Pick<InvoiceDraft, "lines" | "charges" | "gstBreakup" | "awaitingServer" | "facts">,
): { rows: GstBreakupRow[]; source: string } {
  const server = draft.gstBreakup ?? [];
  if (server.length > 0 && !draft.awaitingServer) {
    return { rows: server.map(breakupRowOf), source: GST_SOURCE_SERVER };
  }
  const interState = Boolean(draft.facts?.interState);
  const by = new Map<number, GstBreakupRow>();
  const add = (pct: number, taxable: number, parts: GstParts) => {
    const key = Math.round(pct * 10000);
    const row = by.get(key) ?? { gstPct: pct, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 };
    row.taxable += taxable;
    row.cgst += parts.cgst;
    row.sgst += parts.sgst;
    row.igst += parts.igst;
    row.cess += parts.cess;
    by.set(key, row);
  };
  const split = (tax: number): GstParts =>
    interState ? { cgst: 0, sgst: 0, igst: tax, cess: 0 } : { cgst: r2(tax / 2), sgst: r2(tax - r2(tax / 2)), igst: 0, cess: 0 };
  for (const line of draft.lines) {
    const figures = hasItem(line) ? shownFigures(line) : null;
    if (!figures) {
      continue;
    }
    add(cell(line.gstPct), figures.taxable, figures.gstParts ?? split(figures.tax));
  }
  for (const charge of draft.charges ?? []) {
    // a charge taxed on its own (after tax, on the bill)
    const amount = cell(charge.amount);
    if (!charge.chgId || !charge.onBill || !charge.gst || !amount) {
      continue;
    }
    add(Math.round((charge.gst * 10000) / Math.abs(amount)) / 100, amount, split(charge.gst));
  }
  const rows = [...by.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) => {
      const out = {
        gstPct: row.gstPct,
        taxable: r2(row.taxable),
        cgst: r2(row.cgst),
        sgst: r2(row.sgst),
        igst: r2(row.igst),
        cess: r2(row.cess),
        total: 0,
      };
      out.total = r2(out.taxable + out.cgst + out.sgst + out.igst + out.cess);
      return out;
    });
  return { rows, source: draft.awaitingServer ? GST_SOURCE_AWAITING : GST_SOURCE_LINES };
}
