/**
 * Promotions — the pass that writes scheme discounts onto the lines and says
 * which free lines the bill should carry (§11). Pure.
 *
 * It runs BEFORE the document pass at every call site — term, bill date, qty,
 * size, rate, scheme flag, any discount, the Promo tick, the customer, a cache
 * refresh — and it measures every basis from INPUTS through the engine's own
 * `priceRowGoods`, never from a derived line field: the recompute has not run
 * yet, so reading `netGross` off the line would lag one edit and feed back the
 * previous discount.
 *
 * One scheme per line: the highest-priority scheme that covers the line writes
 * the Scheme tier (`schPerc` / `schPerQty` / `schAmt`) and stamps
 * `schemeId` / `schemeName`. A bill-level scheme writes the Bill scheme
 * PERCENT onto the lines it measured, because a directly written bill-scheme
 * amount is destroyed by the cascade (§10.1). Free lines are keyed
 * `schemeId|itemId|unitId`; the caller updates the qty in place, removes the
 * unwanted ones and inserts new ones below the last line stamped with that
 * scheme — never cleared and re-inserted, which causes a lookup storm.
 */
import { priceRowGoods } from "@/domain/pricing/lines";
import type { Line, VoucherPolicy } from "@/domain/pricing/types";
import type { SaleBillDraftLine } from "@/features/sales/testbill/types";
import { itemRuleFor, schemeCovers, type PromotionContext } from "@/features/sales/testbill/engines/promotions/match";
import type { PromotionItemRule, PromotionScheme, PromotionSlab } from "@/features/sales/testbill/engines/promotions/rules";

/** A free line the bill should carry, keyed by scheme · item · unit. */
export type FreeLineIntent = {
  key: string;
  schemeId: string;
  schemeName: string;
  itemId: string;
  /** An `iuc_id` when the slab names one, else the item's default unit resolves at lookup. */
  unitId: string | null;
  itemName: string | null;
  qty: number;
  /** The line key the free line is inserted below (the last line stamped with the scheme). */
  afterLineKey: string | null;
};

export type PromotionNote = { schemeId: string; name: string; reason: string };

export type PromotionResult = {
  lines: SaleBillDraftLine[];
  freeLines: FreeLineIntent[];
  applied: PromotionNote[];
  notApplied: PromotionNote[];
  /** Anything changed on a line, as a cheap "dispatch or not" for the caller. */
  changed: boolean;
};

const EPSILON = 0.005;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The slab a basis falls in: `exceeds ≤ basis ≤ upto` (the seeded bands are 1000–4999, 5000–). */
export function slabFor(slabs: PromotionSlab[], basis: number): PromotionSlab | null {
  let best: PromotionSlab | null = null;
  for (const slab of slabs) {
    if (basis + EPSILON < slab.exceeds) {
      continue;
    }
    if (slab.upto !== null && basis > slab.upto + EPSILON) {
      continue;
    }
    if (!best || slab.exceeds >= best.exceeds) {
      best = slab;
    }
  }
  return best;
}

/** How many times a repeating slab earns its benefit on this basis. */
export function repeatsFor(slab: PromotionSlab, basis: number): number {
  if (!slab.isRepeat || slab.each <= 0) {
    return 1;
  }
  const count = Math.floor((basis - slab.exceeds) / slab.each) + 1;
  const capped = slab.maxRepeats > 0 ? Math.min(count, slab.maxRepeats) : count;
  return Math.max(1, capped);
}

/** Free-line key: the tuple that makes a giveaway the same giveaway. */
export function freeLineKey(schemeId: string, itemId: string, unitId: string | null): string {
  return `${schemeId}|${itemId}|${unitId ?? ""}`;
}

type LineBasis = { netQty: number; netGross: number };

function basisOf(line: SaleBillDraftLine, policy: VoucherPolicy): LineBasis {
  const goods = priceRowGoods(line as Line, policy);
  return { netQty: goods.netQty.toNumber(), netGross: goods.netGross.toNumber() };
}

/** A line the engine may write to: an item, keyed, not free, the Sch tick on. */
function lineEligible(line: SaleBillDraftLine, scheme: PromotionScheme): boolean {
  if (!line.itemId || line.isFree || !line.schemeFlag) {
    return false;
  }
  if (!scheme.allowWithManualDisc && (line.discPerc > 0 || line.discPerQty > 0 || line.discAmt > 0)) {
    return false;
  }
  return true;
}

function lineKeysOf(line: SaleBillDraftLine) {
  return {
    itemId: line.itemId,
    unitId: line.itemUnitId || null,
    groupId: line.groupId,
    categoryId: line.categoryId,
    brandId: line.brandId,
    sectionId: line.sectionId,
  };
}

/** The scheme tier cleared — what a line that no scheme covers reads. */
function clearScheme(line: SaleBillDraftLine): SaleBillDraftLine {
  if (!line.schemeId && line.schPerc === 0 && line.schPerQty === 0 && line.schAmt === 0 && line.billSchDiscPerc === 0) {
    return line;
  }
  return { ...line, schemeId: null, schemeName: null, isPromo: false, schPerc: 0, schPerQty: 0, schAmt: 0, billSchDiscPerc: 0 };
}

type LineWrite = Partial<Pick<SaleBillDraftLine, "schPerc" | "schPerQty" | "schAmt" | "billSchDiscPerc" | "rate">>;

/**
 * What one slab gives one line, as the tier it writes. `basisQty` and
 * `basisAmt` are the line's own; a bill-level scheme passes the bill's basis
 * for the slab and the line's for the conversion of an amount to a percent.
 */
function benefitWrite(
  scheme: PromotionScheme,
  slab: PromotionSlab,
  rule: PromotionItemRule | undefined,
  basis: LineBasis,
  repeats: number,
  billLevel: boolean,
): LineWrite | null {
  const perc = slab.discPerc || rule?.discPerc || 0;
  const perQty = slab.discQty || rule?.discQty || 0;
  const amt = (slab.discAmt || rule?.discAmt || 0) * repeats;
  const cap = slab.maxBenefitAmt > 0 ? slab.maxBenefitAmt : rule && rule.maxBenefit > 0 ? rule.maxBenefit : 0;
  switch (scheme.benefit) {
    case "DISC_PERC": {
      if (perc <= 0) {
        return null;
      }
      let effective = perc;
      if (cap > 0 && basis.netGross > 0 && (basis.netGross * perc) / 100 > cap) {
        effective = money((cap / basis.netGross) * 100);
      }
      return billLevel ? { billSchDiscPerc: effective } : { schPerc: effective };
    }
    case "DISC_PER_ITEM": {
      if (perQty <= 0) {
        return null;
      }
      if (billLevel) {
        return basis.netGross > 0 ? { billSchDiscPerc: money(((perQty * basis.netQty) / basis.netGross) * 100) } : null;
      }
      return { schPerQty: perQty };
    }
    case "DISC_AMT": {
      if (amt > 0) {
        const capped = cap > 0 ? Math.min(amt, cap) : amt;
        if (billLevel) {
          return basis.netGross > 0 ? { billSchDiscPerc: money((capped / basis.netGross) * 100) } : null;
        }
        return { schAmt: money(capped) };
      }
      if (perQty > 0) {
        return billLevel
          ? basis.netGross > 0
            ? { billSchDiscPerc: money(((perQty * basis.netQty) / basis.netGross) * 100) }
            : null
          : { schPerQty: perQty };
      }
      return null;
    }
    case "FIXED_PRICE":
      return slab.fixedPrice !== null && slab.fixedPrice > 0 ? { rate: slab.fixedPrice } : null;
    default:
      return null;
  }
}

/**
 * Run the schemes over the lines.
 *
 * Skipped entirely (every scheme tier cleared, no free lines) when promotions
 * are off for the bill; the hint then says "Promotions are switched off for
 * this bill." Loaded (stored) bills and browse mode never reach here — the
 * caller decides that.
 */
export function evaluatePromotions(
  schemes: PromotionScheme[],
  context: PromotionContext,
  lines: SaleBillDraftLine[],
  policy: VoucherPolicy,
): PromotionResult {
  const applied: PromotionNote[] = [];
  const notApplied: PromotionNote[] = [];
  const freeLines: FreeLineIntent[] = [];
  const writes = new Map<string, { write: LineWrite; scheme: PromotionScheme }>();
  const billWrites = new Map<string, { perc: number; scheme: PromotionScheme }>();

  const covering = context.promotionsEnabled
    ? schemes.filter((scheme) => schemeCovers(scheme, context))
    : [];
  covering.sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code));

  if (context.promotionsEnabled) {
    for (const scheme of schemes) {
      if (!covering.includes(scheme) && scheme.isActive && scheme.status === "APPROVED") {
        notApplied.push({ schemeId: scheme.id, name: scheme.name, reason: "does not cover this bill" });
      }
    }
  }

  const bases = new Map<string, LineBasis>();
  const basisFor = (line: SaleBillDraftLine): LineBasis => {
    let basis = bases.get(line.key);
    if (!basis) {
      basis = basisOf(line, policy);
      bases.set(line.key, basis);
    }
    return basis;
  };

  for (const scheme of covering) {
    const eligible = lines.filter((line) => lineEligible(line, scheme));
    const matched = eligible
      .map((line) => ({ line, rule: itemRuleFor(scheme, lineKeysOf(line)) }))
      .filter((entry): entry is { line: SaleBillDraftLine; rule: PromotionItemRule | undefined } => entry.rule !== null);
    if (matched.length === 0) {
      notApplied.push({ schemeId: scheme.id, name: scheme.name, reason: "no line on this bill qualifies" });
      continue;
    }

    const billLevel = scheme.applyOn === "BILL_AMOUNT" || scheme.applyOn === "BILL_QTY";
    let hit = false;

    if (billLevel) {
      const byQty = scheme.applyOn === "BILL_QTY";
      const total = matched.reduce((sum, entry) => {
        const basis = basisFor(entry.line);
        return sum + (byQty ? basis.netQty : basis.netGross);
      }, 0);
      if (scheme.minBillAmount > 0 && total < scheme.minBillAmount && !byQty) {
        notApplied.push({ schemeId: scheme.id, name: scheme.name, reason: `bill below ${scheme.minBillAmount}` });
        continue;
      }
      const slab = slabFor(scheme.slabs, total);
      if (!slab) {
        notApplied.push({ schemeId: scheme.id, name: scheme.name, reason: "below the first slab" });
        continue;
      }
      const repeats = repeatsFor(slab, total);
      if (scheme.benefit === "FREE_ITEM") {
        if (slab.freeItemId && slab.freeQty > 0) {
          const anchor = matched[matched.length - 1].line.key;
          freeLines.push({
            key: freeLineKey(scheme.id, slab.freeItemId, slab.freeUnitId),
            schemeId: scheme.id,
            schemeName: scheme.name,
            itemId: slab.freeItemId,
            unitId: slab.freeUnitId,
            itemName: slab.freeItemName,
            qty: slab.freeQty * repeats,
            afterLineKey: anchor,
          });
          hit = true;
        }
      } else {
        // A bill-level amount is spread as ONE percent of the measured basis,
        // so every matched line carries the same percent and the cascade
        // rebuilds the amount from it (§10.1, §11).
        const totalBasis = { netQty: total, netGross: matched.reduce((sum, entry) => sum + basisFor(entry.line).netGross, 0) };
        const write = benefitWrite(scheme, slab, undefined, totalBasis, repeats, true);
        if (write?.billSchDiscPerc && write.billSchDiscPerc > 0) {
          let perc = write.billSchDiscPerc;
          if (scheme.maxBenefitPerBill > 0 && totalBasis.netGross > 0 && (totalBasis.netGross * perc) / 100 > scheme.maxBenefitPerBill) {
            perc = money((scheme.maxBenefitPerBill / totalBasis.netGross) * 100);
          }
          for (const entry of matched) {
            if (!billWrites.has(entry.line.key)) {
              billWrites.set(entry.line.key, { perc, scheme });
              hit = true;
            }
          }
        }
      }
    } else {
      const byQty = scheme.applyOn === "ITEM_QTY";
      let benefitSoFar = 0;
      for (const entry of matched) {
        if (writes.has(entry.line.key)) {
          continue;
        }
        const basis = basisFor(entry.line);
        const measure = byQty ? basis.netQty : basis.netGross;
        if (entry.rule && entry.rule.minQty > 0 && basis.netQty < entry.rule.minQty) {
          continue;
        }
        if (scheme.minQty > 0 && basis.netQty < scheme.minQty) {
          continue;
        }
        const slab = slabFor(scheme.slabs, measure);
        if (!slab) {
          continue;
        }
        const repeats = repeatsFor(slab, measure);
        if (scheme.benefit === "FREE_ITEM") {
          const freeItem = slab.freeItemId ?? entry.line.itemId;
          if (slab.freeQty > 0) {
            const key = freeLineKey(scheme.id, freeItem, slab.freeUnitId);
            const existing = freeLines.find((row) => row.key === key);
            if (existing) {
              existing.qty += slab.freeQty * repeats;
              existing.afterLineKey = entry.line.key;
            } else {
              freeLines.push({
                key,
                schemeId: scheme.id,
                schemeName: scheme.name,
                itemId: freeItem,
                unitId: slab.freeUnitId ?? (slab.freeItemId ? null : entry.line.itemUnitId || null),
                itemName: slab.freeItemName ?? (slab.freeItemId ? null : entry.line.itemName),
                qty: slab.freeQty * repeats,
                afterLineKey: entry.line.key,
              });
            }
            writes.set(entry.line.key, { write: {}, scheme });
            hit = true;
          }
          continue;
        }
        const write = benefitWrite(scheme, slab, entry.rule, basis, repeats, false);
        if (!write) {
          continue;
        }
        if (scheme.maxBenefitPerBill > 0) {
          const estimate =
            write.schPerc !== undefined
              ? (basis.netGross * write.schPerc) / 100
              : write.schPerQty !== undefined
                ? write.schPerQty * basis.netQty
                : write.schAmt ?? 0;
          if (benefitSoFar + estimate > scheme.maxBenefitPerBill + EPSILON) {
            const room = Math.max(0, scheme.maxBenefitPerBill - benefitSoFar);
            if (room <= EPSILON) {
              continue;
            }
            writes.set(entry.line.key, { write: { schAmt: money(room) }, scheme });
            benefitSoFar += room;
            hit = true;
            continue;
          }
          benefitSoFar += estimate;
        }
        writes.set(entry.line.key, { write, scheme });
        hit = true;
      }
    }

    if (hit) {
      applied.push({ schemeId: scheme.id, name: scheme.name, reason: scheme.applyOn.replace("_", " ").toLowerCase() });
    } else {
      notApplied.push({ schemeId: scheme.id, name: scheme.name, reason: "no line reached a slab" });
    }
  }

  let changed = false;
  const next = lines.map((line) => {
    // A free line the engine placed is left to the caller's reconciliation;
    // an operator's own free line is never touched.
    if (line.isFree) {
      return line;
    }
    const cleared = clearScheme(line);
    const lineWrite = writes.get(line.key);
    const billWrite = billWrites.get(line.key);
    if (!lineWrite && !billWrite) {
      if (cleared !== line) {
        changed = true;
      }
      return cleared;
    }
    const scheme = lineWrite?.scheme ?? billWrite?.scheme ?? null;
    const updated: SaleBillDraftLine = {
      ...cleared,
      ...(lineWrite?.write ?? {}),
      ...(billWrite ? { billSchDiscPerc: billWrite.perc } : {}),
      schemeId: scheme?.id ?? null,
      schemeName: scheme?.name ?? null,
      isPromo: true,
    };
    if (
      updated.schPerc !== line.schPerc ||
      updated.schPerQty !== line.schPerQty ||
      updated.schAmt !== line.schAmt ||
      updated.billSchDiscPerc !== line.billSchDiscPerc ||
      updated.rate !== line.rate ||
      updated.schemeId !== line.schemeId ||
      updated.isPromo !== line.isPromo
    ) {
      changed = true;
      return updated;
    }
    return line;
  });

  return { lines: next, freeLines, applied, notApplied, changed };
}

/**
 * The hint on the scheme figure and the Promo tick (§11): off · applied ·
 * not applied · nothing covers.
 */
export function promotionHint(
  promotionsEnabled: boolean,
  applied: PromotionNote[],
  notApplied: PromotionNote[],
): string {
  if (!promotionsEnabled) {
    return "Promotions are switched off for this bill.";
  }
  const parts: string[] = [];
  if (applied.length > 0) {
    parts.push(`Applied: ${applied.map((note) => note.name).join(", ")}`);
  }
  if (notApplied.length > 0) {
    parts.push(`Not applied: ${notApplied.map((note) => `${note.name} (${note.reason})`).join(", ")}`);
  }
  return parts.length > 0 ? parts.join("\n") : "No promotion scheme covers this bill.";
}

/**
 * Reconcile the bill's engine-placed free lines with what the pass wants
 * (§11): update the qty in place, remove the unwanted, and say which are NEW
 * — the caller inserts and prices those through the normal lookup.
 */
export function reconcileFreeLines(
  lines: SaleBillDraftLine[],
  wanted: FreeLineIntent[],
): { lines: SaleBillDraftLine[]; toInsert: FreeLineIntent[]; changed: boolean } {
  const wantedByKey = new Map(wanted.map((intent) => [intent.key, intent]));
  let changed = false;
  const kept: SaleBillDraftLine[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.isFree || !line.schemeId) {
      kept.push(line);
      continue;
    }
    const key = freeLineKey(line.schemeId, line.itemId, line.itemUnitId || null);
    const intent = wantedByKey.get(key) ?? wantedByKey.get(freeLineKey(line.schemeId, line.itemId, null));
    if (!intent) {
      changed = true;
      continue;
    }
    seen.add(intent.key);
    if (Math.abs(line.billQty - intent.qty) > 1e-9) {
      changed = true;
      kept.push({ ...line, billQty: intent.qty });
    } else {
      kept.push(line);
    }
  }
  const toInsert = wanted.filter((intent) => !seen.has(intent.key));
  return { lines: kept, toInsert, changed: changed || toInsert.length > 0 };
}
