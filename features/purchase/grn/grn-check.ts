/**
 * GRN (menu 196) — what `/purchase/grns/validate` (and `/get`) paint onto the
 * screen, pure (Qt `GrnEntry::paintCalc / paintCheck / paintTotals`, `chipOf`):
 * the line values, the Check chips, Shelf life %, Labels, the server's charges,
 * the six totals and the WARN / REFUSE strip. Every figure here is the server's.
 */
import type { PurchasePillTone } from "../shared/purchase-parts";
import type { PurchaseFigureTone, PurchaseStripCell } from "../shared/components/purchase-parts";
import { money, num, qtyText, text } from "../shared/purchase.format";
import { foldServerCharges } from "./grn-charges";
import { rowHasItem } from "./grn.state";
import type { GrnChargeMasterRow, GrnChip, GrnDraft, GrnLine, GrnLineCheck, GrnValidateAnswer } from "./grn.types";

/** Qt `chipOf`: OK green, SHORT / SHELF LIFE red, DAMAGED amber, EXCESS blue, n/m SN green when complete. */
export function chipTone(chip: GrnChip, check: GrnLineCheck | null): PurchasePillTone {
  switch (chip.code) {
    case "OK":
      return "success";
    case "SHORT":
    case "SHELF_LIFE":
      return "danger";
    case "DAMAGED":
      return "warning";
    case "EXCESS":
      return "info";
    case "SERIALS": {
      const serials = check?.serials;
      return serials && serials.have === num(serials.need) ? "success" : "danger";
    }
    default:
      return "neutral";
  }
}

/** Shelf life: green at / above the minimum, red below; none without a minimum to judge by. */
export function shelfLifeTone(check: GrnLineCheck | null): PurchaseFigureTone | undefined {
  if (!check || check.shelfLifePct === null || check.shelfLifePct === undefined) {
    return undefined;
  }
  return check.minShelfLifePct !== null && check.minShelfLifePct !== undefined && check.shelfLifePct < check.minShelfLifePct
    ? "bad"
    : "good";
}

/** "82 %", or "—" when the line has nothing to judge (no expiry). */
export function shelfLifeText(line: GrnLine): string {
  if (!rowHasItem(line)) {
    return "";
  }
  const pct = line.check?.shelfLifePct;
  return pct === null || pct === undefined ? "—" : `${Math.trunc(pct)} %`;
}

export function labelsText(line: GrnLine): string {
  return rowHasItem(line) && line.check ? String(line.check.labels ?? 0) : "";
}

/**
 * Qt `paintCalc`: the answer onto the lines (by order of the item lines), the
 * charges, the totals, the strip. Never dirties the draft. The excess the
 * server worked out lands in Excess — unless the line says RETURN (then it is
 * what the operator keyed).
 */
export function applyValidate(draft: GrnDraft, answer: GrnValidateAnswer, masters: readonly GrnChargeMasterRow[]): GrnDraft {
  const out = answer.lines ?? [];
  let k = 0;
  const lines = draft.lines.map((line) => {
    if (!rowHasItem(line) || k >= out.length) {
      return line;
    }
    const o = out[k];
    k += 1;
    const excess = num(o.excessQty);
    return {
      ...line,
      serverValue: o.value === null || o.value === undefined ? "" : text(o.value),
      excess: line.excessAction === "RETURN" ? line.excess : excess > 0 ? qtyText(excess) : "",
      check: o.check ?? null,
    };
  });
  const godownName = draft.godownName || text(answer.header?.godownName);
  return {
    ...draft,
    lines,
    godownName,
    charges: foldServerCharges(draft.charges, answer.charges ?? [], {
      touched: draft.chargesTouched,
      loadmen: draft.loadmen,
      masters,
    }),
    serverTotals: answer.totals ?? null,
    warnings: answer.warnings ?? [],
    refusals: answer.refusals ?? [],
  };
}

/** Nothing to judge (no supplier / godown / line): the strip and totals go blank. */
export function clearValidate(draft: GrnDraft): GrnDraft {
  if (!draft.serverTotals && draft.warnings.length === 0 && draft.refusals.length === 0) {
    return draft;
  }
  return { ...draft, serverTotals: null, warnings: [], refusals: [] };
}

/** A refused validate / save: its errors[] join the warnings on the strip (Qt `showRefusal`). */
export function refusalsOf(error: unknown): { code?: string; message?: string; field?: string }[] {
  const data = (error as { data?: { errors?: unknown } } | null)?.data;
  const errors = data?.errors;
  return Array.isArray(errors) ? (errors as { code?: string; message?: string; field?: string }[]) : [];
}

/**
 * Qt `paintTotals`: Lines · Received (base) · Damaged · Short (vs challan) ·
 * Off-bill charges · Provisional value. Short reads in the lines' own unit when
 * they share one ("2 bottle"), else in base units with the line count.
 */
export function totalsCells(draft: GrnDraft): PurchaseStripCell[] {
  const t = draft.serverTotals;
  let shortQty = 0;
  const units = new Set<string>();
  for (const line of draft.lines) {
    if (!rowHasItem(line)) continue;
    const recd = num(line.recd);
    const dmg = num(line.dmg);
    const challan = line.challan.trim() === "" ? recd + dmg : num(line.challan);
    const short = challan - recd - dmg;
    if (short > 0.0005) {
      shortQty += short;
      units.add(line.unitName);
    }
  }
  let shortText = "";
  if (t) {
    if (!t.shortLines) shortText = "none";
    else if (units.size === 1) shortText = `${qtyText(shortQty)} ${[...units][0].toLowerCase()}`;
    else shortText = `${qtyText(num(t.shortBase))} (base) · ${t.shortLines} line${t.shortLines === 1 ? "" : "s"}`;
  }
  const damaged = t ? num(t.damagedBase) : 0;
  return [
    { key: "lines", caption: "Lines", value: t ? String(t.lines) : "" },
    { key: "received", caption: "Received (base)", value: t ? qtyText(num(t.receivedBase)) : "" },
    { key: "damaged", caption: "Damaged", value: t ? qtyText(damaged) : "", tone: damaged > 0 ? "warn" : undefined },
    { key: "short", caption: "Short (vs challan)", value: shortText, tone: t && t.shortLines > 0 ? "bad" : "muted" },
    { key: "offbill", caption: "Off-bill charges", value: t ? money(num(t.offbillCharges)) : "", tone: "warn" },
    {
      key: "provisional",
      caption: "Provisional value (Dr Stock / Cr GRNI)",
      value: t ? money(num(t.provisionalValue)) : "",
      strong: true,
      title: provisionalTitle(draft),
    },
  ];
}

/** The provisional cell's tooltip (Qt): lines + our own charges = what goes into stock. */
export function provisionalTitle(draft: GrnDraft): string {
  const t = draft.serverTotals;
  return t
    ? `Lines ${money(num(t.provisionalValue))} + our own charges ${money(num(t.offbillCharges))} = ${money(num(t.total))} into stock`
    : "";
}
