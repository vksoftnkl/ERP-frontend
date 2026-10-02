/**
 * What goes to the server and how its answers are read — Qt `buildPayload`,
 * `postSave`'s two answers (needs-confirm and saved), `showServerRefusal` and
 * `ApiClient`'s error text.
 *
 * The save carries the CHANGED rows only, each with the scope it was LOADED
 * with (the server decides from that and the switch which row an edit lands
 * on), and PRICE as the authoritative figure of each level — the server
 * recomputes priceWot and markup from it and discards what arrives in them.
 */
import { LEVEL_COUNT, NOTES_76_FILTER_KEYS } from "./selling-price.constants";
import { exclusiveOfTax, markupOf, rawNum, round2 } from "./selling-price.math";
import { isChanged, type PriceGridRow } from "./selling-price.state";
import { money } from "./selling-price.validate";
import type {
  ApiErrorLike,
  PriceScope,
  SaveSellingPriceBulkPayload,
  SaveSellingPriceRow,
  SellingPriceSaveResult,
} from "./selling-price.types";

export type BuiltSave = {
  payload: SaveSellingPriceBulkPayload;
  /** lineNo → the grid row it came from, for reading the answer back. */
  rowKeyByLine: Map<number, string>;
  /** The items whose rows are re-read once the save lands. */
  itemIds: string[];
};

export function buildSavePayload(
  rows: readonly PriceGridRow[],
  companyId: string,
  branchId: string,
  scope: PriceScope,
  confirmed: boolean,
): BuiltSave {
  const out: SaveSellingPriceRow[] = [];
  const rowKeyByLine = new Map<number, string>();
  const itemIds: string[] = [];
  rows.forEach((row, index) => {
    if (!isChanged(row)) {
      return;
    }
    const lineNo = index + 1;
    const levels = [];
    for (let level = 0; level < LEVEL_COUNT; level += 1) {
      const price = round2(row.prices[level]);
      // price is authoritative; the server recomputes the other two from it
      // and ignores these — sent so a log reads whole.
      levels.push({
        level: level + 1,
        price,
        priceWot: exclusiveOfTax(price, row.taxPerc),
        markupPerc: markupOf(price, row.cost),
      });
    }
    const saveRow: SaveSellingPriceRow = {
      lineNo,
      itemId: row.itemId,
      uomId: row.uomId,
      bucketId: row.bucketId || null,
      mrp: row.bucketMrp,
      salePrice: row.bucketSp,
      levels,
      minPrice: round2(row.min),
      roundOff: row.roundOff,
    };
    // The scope the row was LOADED with, unchanged; absent = no price yet.
    if (row.priceScope) {
      saveRow.priceScope = row.priceScope;
    }
    out.push(saveRow);
    rowKeyByLine.set(lineNo, row.key);
    if (!itemIds.includes(row.itemId)) {
      itemIds.push(row.itemId);
    }
  });
  return {
    payload: { companyId, branchId, scope, confirmed, rows: out },
    rowKeyByLine,
    itemIds,
  };
}

// ---------------------------------------------------------------------------
// Below cost — the "Price below cost" dialog
// ---------------------------------------------------------------------------

export type BelowCostLine = {
  /** 1-based grid row. */
  row: number;
  item: string;
  bucket: string;
  level: string;
  price: number;
  cost: number;
};

/**
 * The dialog's lines, from the problems the server answered with — the item
 * name is the server's, the bucket, price and cost are read off the grid row
 * the line came from.
 */
export function belowCostLines(
  result: SellingPriceSaveResult,
  rowAt: (lineNo: number) => PriceGridRow | null,
  levelNames: readonly string[],
): BelowCostLine[] {
  return (result.problems ?? []).map((problem) => {
    const lineNo = Number(problem.lineNo) || 0;
    const row = rowAt(lineNo);
    const level = (Number(problem.level) || 0) - 1;
    const dims: string[] = [];
    if (row && row.bucketMrp !== null) {
      dims.push(`MRP ${rawNum(row.bucketMrp)}`);
    }
    if (row && row.bucketSp !== null) {
      dims.push(`SP ${rawNum(row.bucketSp)}`);
    }
    return {
      row: lineNo,
      item: problem.itemName ?? "",
      bucket: dims.length === 0 ? "headline" : dims.join(" · "),
      level: level >= 0 ? (levelNames[level] ?? "") : "",
      price: level >= 0 && row ? row.prices[level] ?? 0 : 0,
      cost: row ? row.cost : 0,
    };
  });
}

export function belowCostSummary(lineCount: number, policy: string): string {
  return (
    (lineCount === 1
      ? "1 row is priced below its cost."
      : `${lineCount} rows are priced below their cost.`) + ` inventory.below_cost_price = ${policy}.`
  );
}

// ---------------------------------------------------------------------------
// Saved — the toast
// ---------------------------------------------------------------------------

/**
 * What the operator reads once the save is written. Never a plain "Saved" when
 * a row has no stock behind it: those rows are NAMED (legacy fault #2). An
 * allowed or confirmed below-cost price is said too.
 */
export function savedMessage(result: SellingPriceSaveResult, confirmed: boolean): string {
  const saved = Number(result.saved) || 0;
  let message = saved === 1 ? "1 row saved" : `${saved} rows saved`;
  const noStock = result.noStock ?? [];
  if (noStock.length > 0) {
    const names = noStock.map((row) => {
      let name = row.itemName ?? "";
      if (row.mrp !== null && row.mrp !== undefined) {
        name += ` (MRP ${money(Number(row.mrp))})`;
      }
      return name;
    });
    message += ` · ${noStock.length} ${
      noStock.length === 1 ? "has" : "have"
    } no stock on hand — the price applies when stock arrives:\n${names.join("\n")}`;
  }
  const allowedBelowCost = (result.problems ?? []).filter(
    (problem) => problem.verdict === "BELOW_COST",
  ).length;
  if (allowedBelowCost > 0) {
    message += confirmed
      ? `\n${allowedBelowCost} price(s) saved below cost, as confirmed.`
      : `\n${allowedBelowCost} price(s) are below cost (allowed by the setting).`;
  }
  return message;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

type ErrorBody = {
  message?: unknown;
  errors?: unknown;
};

function bodyOf(error: ApiErrorLike | null | undefined): ErrorBody {
  const data = error?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? (data as ErrorBody) : {};
}

/**
 * The text an operator reads for a refusal — the summary AND the per-field
 * reasons beneath it, the way the Qt client lays the three server shapes out:
 * a "Validation failed" alone is untraceable once it reaches a user.
 */
export function describeApiError(error: ApiErrorLike | null | undefined): string {
  const body = bodyOf(error);
  const lines: string[] = [];
  const message = body.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const nested = (message as { message?: unknown }).message;
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        if (typeof entry === "string" && entry.trim()) lines.push(entry);
      }
    } else if (typeof nested === "string" && nested.trim()) {
      lines.push(nested);
    }
  } else if (typeof message === "string" && message.trim()) {
    lines.push(message);
  } else if (Array.isArray(message)) {
    for (const entry of message) {
      if (typeof entry === "string" && entry.trim()) lines.push(entry);
    }
  }
  if (Array.isArray(body.errors)) {
    for (const entry of body.errors) {
      if (typeof entry === "string") {
        lines.push(entry);
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const field = typeof (entry as { field?: unknown }).field === "string"
        ? ((entry as { field: string }).field)
        : "";
      const text = typeof (entry as { message?: unknown }).message === "string"
        ? ((entry as { message: string }).message)
        : "";
      if (!text) continue;
      lines.push(field ? `• ${field} — ${text}` : text);
    }
  }
  if (lines.length === 0) {
    const fallback = error?.message?.trim();
    lines.push(fallback || "An unexpected error occurred.");
  }
  return lines.join("\n");
}

/**
 * The 0-based grid rows a 422 names: its errors carry `rows.<lineNo>`, the
 * 1-based line each row was sent as.
 */
export function refusedLineNumbers(error: ApiErrorLike | null | undefined): number[] {
  const body = bodyOf(error);
  const out: number[] = [];
  if (!Array.isArray(body.errors)) {
    return out;
  }
  for (const entry of body.errors) {
    const field =
      entry && typeof entry === "object" && typeof (entry as { field?: unknown }).field === "string"
        ? (entry as { field: string }).field
        : "";
    const match = /^rows\.(\d+)/.exec(field);
    if (match) {
      const lineNo = Number.parseInt(match[1], 10);
      if (!out.includes(lineNo)) {
        out.push(lineNo);
      }
    }
  }
  return out;
}

/**
 * A filter key the server in front of this screen does not know yet (notes
 * 76) comes back as a 400 naming it — say which, rather than a validation
 * dump. Null when the refusal is anything else.
 */
export function refusedFilterKey(error: ApiErrorLike | null | undefined): string | null {
  if (error?.status !== 400) {
    return null;
  }
  const text = describeApiError(error);
  return NOTES_76_FILTER_KEYS.find((key) => text.includes(key)) ?? null;
}

export function filterNotAvailableMessage(key: string): string {
  return (
    `The server does not filter by "${key}" yet (notes 76 is pending). Remove that filter in F8 ` +
    "and load again — group, brand, section and supplier work today."
  );
}
